/**
 * Double-entry ledger engine — Phase 2 foundation
 * Rules: balanced journals only; POSTED immutable (reverse via new journal)
 */
const pool = require('../config/db');
const crypto = require('crypto');

function ref(prefix) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

async function audit(conn, { actor, action, entity_type, entity_id, detail }) {
  await conn.query(
    `INSERT INTO cbs_audit_events (actor, action, entity_type, entity_id, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
    [actor || null, action, entity_type, entity_id || null, detail ? JSON.stringify(detail) : null]
  );
}

/**
 * Post a balanced journal.
 * lines: [{ gl_code, account_id?, debit, credit, narrative? }]
 */
async function postJournal({
  businessDate,
  valueDate,
  branchCode,
  sourceModule,
  sourceRef,
  narrative,
  lines,
  postedBy,
  idempotencyKey,
}) {
  if (!Array.isArray(lines) || lines.length < 2) {
    const e = new Error('Journal requires at least two lines');
    e.status = 400;
    throw e;
  }

  let totalDr = 0;
  let totalCr = 0;
  const normalized = lines.map((l, i) => {
    const dr = money(l.debit);
    const cr = money(l.credit);
    if (dr < 0 || cr < 0) {
      const e = new Error('Debit/credit cannot be negative');
      e.status = 400;
      throw e;
    }
    if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
      const e = new Error(`Line ${i + 1}: provide either debit or credit`);
      e.status = 400;
      throw e;
    }
    totalDr += dr;
    totalCr += cr;
    return {
      gl_code: String(l.gl_code),
      account_id: l.account_id || null,
      debit: dr,
      credit: cr,
      narrative: l.narrative || null,
    };
  });

  totalDr = money(totalDr);
  totalCr = money(totalCr);
  if (totalDr !== totalCr) {
    const e = new Error(`Unbalanced journal: debit ${totalDr} != credit ${totalCr}`);
    e.status = 400;
    throw e;
  }
  if (totalDr <= 0) {
    const e = new Error('Journal amount must be greater than zero');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (idempotencyKey) {
      const [[ex]] = await conn.query(
        `SELECT id, journal_ref, status FROM cbs_journal_headers WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (ex) {
        await conn.commit();
        return { id: ex.id, journal_ref: ex.journal_ref, status: ex.status, idempotent: true };
      }
    }

    const journalRef = ref('JRN');
    const bdate = businessDate || new Date().toISOString().slice(0, 10);
    const vdate = valueDate || bdate;

    const [ins] = await conn.query(
      `INSERT INTO cbs_journal_headers
        (journal_ref, business_date, value_date, branch_code, source_module, source_ref,
         narrative, status, currency, total_debit, total_credit, idempotency_key, posted_by, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', 'PKR', ?, ?, ?, ?, NOW())`,
      [
        journalRef,
        bdate,
        vdate,
        branchCode || null,
        sourceModule || 'MANUAL',
        sourceRef || null,
        narrative || null,
        totalDr,
        totalCr,
        idempotencyKey || null,
        postedBy || null,
      ]
    );
    const journalId = ins.insertId;

    let lineNo = 1;
    for (const l of normalized) {
      await conn.query(
        `INSERT INTO cbs_journal_lines
          (journal_id, line_no, gl_code, account_id, debit, credit, narrative)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [journalId, lineNo++, l.gl_code, l.account_id, l.debit, l.credit, l.narrative]
      );

      // Update CASA-style account balances if linked
      if (l.account_id) {
        // Deposit liability: credit increases balance, debit decreases
        const delta = money(l.credit - l.debit);
        const [[acct]] = await conn.query(
          `SELECT id, ledger_balance, available_balance, status FROM cbs_accounts WHERE id = ? FOR UPDATE`,
          [l.account_id]
        );
        if (!acct) {
          const e = new Error(`Account ${l.account_id} not found`);
          e.status = 400;
          throw e;
        }
        if (acct.status === 'closed') {
          const e = new Error(`Account ${l.account_id} is closed`);
          e.status = 400;
          throw e;
        }
        const newBal = money(Number(acct.ledger_balance) + delta);
        if (newBal < 0 && delta < 0) {
          const e = new Error(`Insufficient funds on account ${l.account_id}`);
          e.status = 400;
          throw e;
        }
        await conn.query(
          `UPDATE cbs_accounts SET ledger_balance = ?, available_balance = ? WHERE id = ?`,
          [newBal, newBal, l.account_id]
        );
      }
    }

    await audit(conn, {
      actor: postedBy,
      action: 'JOURNAL_POST',
      entity_type: 'journal',
      entity_id: String(journalId),
      detail: { journal_ref: journalRef, totalDr, totalCr, sourceModule },
    });

    await conn.commit();
    return {
      id: journalId,
      journal_ref: journalRef,
      status: 'POSTED',
      total_debit: totalDr,
      total_credit: totalCr,
      idempotent: false,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function reverseJournal(journalId, { postedBy, narrative }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[h]] = await conn.query(
      `SELECT * FROM cbs_journal_headers WHERE id = ? FOR UPDATE`,
      [journalId]
    );
    if (!h) {
      const e = new Error('Journal not found');
      e.status = 404;
      throw e;
    }
    if (h.status !== 'POSTED') {
      const e = new Error('Only POSTED journals can be reversed');
      e.status = 400;
      throw e;
    }
    const [lines] = await conn.query(
      `SELECT * FROM cbs_journal_lines WHERE journal_id = ? ORDER BY line_no`,
      [journalId]
    );
    await conn.commit();
    conn.release();

    const revLines = lines.map((l) => ({
      gl_code: l.gl_code,
      account_id: l.account_id,
      debit: Number(l.credit),
      credit: Number(l.debit),
      narrative: `Reversal of ${h.journal_ref}`,
    }));

    const result = await postJournal({
      businessDate: h.business_date,
      valueDate: new Date().toISOString().slice(0, 10),
      branchCode: h.branch_code,
      sourceModule: 'REVERSAL',
      sourceRef: h.journal_ref,
      narrative: narrative || `Reversal of ${h.journal_ref}`,
      lines: revLines,
      postedBy,
      idempotencyKey: `REV-${h.journal_ref}`,
    });

    await pool.query(
      `UPDATE cbs_journal_headers SET status = 'REVERSED', reversed_by_journal_id = ? WHERE id = ?`,
      [result.id, journalId]
    );
    await pool.query(
      `UPDATE cbs_journal_headers SET reverses_journal_id = ? WHERE id = ?`,
      [journalId, result.id]
    );

    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    try {
      conn.release();
    } catch (_) {}
    throw err;
  }
}

async function trialBalance(asOfDate) {
  const [rows] = await pool.query(
    `SELECT l.gl_code, c.gl_name, c.gl_type,
            SUM(l.debit) AS total_debit, SUM(l.credit) AS total_credit
     FROM cbs_journal_lines l
     JOIN cbs_journal_headers h ON h.id = l.journal_id
     LEFT JOIN cbs_coa c ON c.gl_code = l.gl_code
     WHERE h.status = 'POSTED' AND h.business_date <= ?
     GROUP BY l.gl_code, c.gl_name, c.gl_type
     ORDER BY l.gl_code`,
    [asOfDate || new Date().toISOString().slice(0, 10)]
  );
  let dr = 0;
  let cr = 0;
  const items = rows.map((r) => {
    const d = money(r.total_debit);
    const c = money(r.total_credit);
    dr += d;
    cr += c;
    return {
      gl_code: r.gl_code,
      gl_name: r.gl_name,
      gl_type: r.gl_type,
      total_debit: d,
      total_credit: c,
      net: money(d - c),
    };
  });
  return {
    as_of: asOfDate || new Date().toISOString().slice(0, 10),
    total_debit: money(dr),
    total_credit: money(cr),
    balanced: money(dr) === money(cr),
    lines: items,
  };
}

async function internalTransfer({
  fromAccountId,
  toAccountId,
  amount,
  businessDate,
  narrative,
  createdBy,
  idempotencyKey,
  depositGl = '2000',
}) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  if (String(fromAccountId) === String(toAccountId)) {
    const e = new Error('From and to accounts must differ');
    e.status = 400;
    throw e;
  }

  if (idempotencyKey) {
    const [[ex]] = await pool.query(
      `SELECT * FROM cbs_transfers WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey]
    );
    if (ex) return { ...ex, idempotent: true };
  }

  // Deposit liability: debit from (decrease), credit to (increase)
  const journal = await postJournal({
    businessDate,
    sourceModule: 'TRANSFER',
    narrative: narrative || 'Internal fund transfer',
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `J-${idempotencyKey}` : undefined,
    lines: [
      {
        gl_code: depositGl,
        account_id: fromAccountId,
        debit: amt,
        credit: 0,
        narrative: 'Transfer out',
      },
      {
        gl_code: depositGl,
        account_id: toAccountId,
        debit: 0,
        credit: amt,
        narrative: 'Transfer in',
      },
    ],
  });

  const tref = ref('TRF');
  const [ins] = await pool.query(
    `INSERT INTO cbs_transfers
      (transfer_ref, from_account_id, to_account_id, amount, business_date, status,
       journal_id, idempotency_key, narrative, created_by)
     VALUES (?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?)`,
    [
      tref,
      fromAccountId,
      toAccountId,
      amt,
      businessDate || new Date().toISOString().slice(0, 10),
      journal.id,
      idempotencyKey || null,
      narrative || null,
      createdBy || null,
    ]
  );

  return {
    id: ins.insertId,
    transfer_ref: tref,
    status: 'POSTED',
    journal_ref: journal.journal_ref,
    amount: amt,
    idempotent: false,
  };
}

module.exports = {
  postJournal,
  reverseJournal,
  trialBalance,
  internalTransfer,
  money,
  ref,
  audit,
};
