/**
 * Double-entry ledger engine — Phase 2 foundation
 * Rules: balanced journals only; POSTED immutable (reverse via new journal)
 */
const pool = require('../config/db');
const crypto = require('crypto');
const { money, simpleInterest, sub, add, eq, lte, gte } = require('../lib/money');

function ref(prefix) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
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

/**
 * CASA cash deposit: Dr Cash 1000 / Cr Customer deposit 2000 (+account)
 */
async function cashDeposit({ accountId, amount, businessDate, narrative, createdBy, idempotencyKey, cashGl = '1000', depositGl = '2000' }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [accountId]);
  if (!acct) {
    const e = new Error('Account not found');
    e.status = 404;
    throw e;
  }
  if (acct.status !== 'active') {
    const e = new Error(`Account status is ${acct.status}`);
    e.status = 400;
    throw e;
  }
  const journal = await postJournal({
    businessDate,
    sourceModule: 'CASA_DEPOSIT',
    sourceRef: acct.account_no,
    narrative: narrative || `Cash deposit ${acct.account_no}`,
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `DEP-${idempotencyKey}` : undefined,
    lines: [
      { gl_code: cashGl, debit: amt, credit: 0, narrative: 'Cash in' },
      { gl_code: depositGl, account_id: accountId, debit: 0, credit: amt, narrative: 'Customer deposit' },
    ],
  });
  return { type: 'deposit', account_id: accountId, amount: amt, journal };
}

/**
 * CASA cash withdrawal: Dr Customer deposit 2000 / Cr Cash 1000
 */
async function cashWithdrawal({ accountId, amount, businessDate, narrative, createdBy, idempotencyKey, cashGl = '1000', depositGl = '2000' }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const journal = await postJournal({
    businessDate,
    sourceModule: 'CASA_WITHDRAWAL',
    sourceRef: String(accountId),
    narrative: narrative || `Cash withdrawal`,
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `WDR-${idempotencyKey}` : undefined,
    lines: [
      { gl_code: depositGl, account_id: accountId, debit: amt, credit: 0, narrative: 'Customer withdrawal' },
      { gl_code: cashGl, debit: 0, credit: amt, narrative: 'Cash out' },
    ],
  });
  return { type: 'withdrawal', account_id: accountId, amount: amt, journal };
}

async function disburseLoan({
  customerId, productCode, principal, branchCode, businessDate,
  creditAccountId, narrative, createdBy, idempotencyKey,
  loanGl = '1100', cashGl = '1000', depositGl = '2000', isIslamic = false,
  islamicMode = null, ratePct = 0,
}) {
  const amt = money(principal);
  if (amt <= 0) { const e = new Error('Principal must be positive'); e.status = 400; throw e; }
  if (!customerId) { const e = new Error('customerId required'); e.status = 400; throw e; }

  const contractNo = ref('LN');
  // Dr Loan asset / Cr Cash (or credit to customer deposit if creditAccountId)
  const lines = [
    { gl_code: loanGl, debit: amt, credit: 0, narrative: 'Loan disbursement' },
  ];
  if (creditAccountId) {
    lines.push({
      gl_code: depositGl,
      account_id: creditAccountId,
      debit: 0,
      credit: amt,
      narrative: 'Disbursement to account',
    });
  } else {
    lines.push({ gl_code: cashGl, debit: 0, credit: amt, narrative: 'Cash disbursement' });
  }

  const journal = await postJournal({
    businessDate,
    branchCode,
    sourceModule: 'LOAN_DISBURSE',
    sourceRef: contractNo,
    narrative: narrative || `Disburse ${contractNo}`,
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `LN-${idempotencyKey}` : undefined,
    lines,
  });

  // Ensure optional columns exist
  try { await pool.query(`ALTER TABLE cbs_financing_contracts ADD COLUMN islamic_mode VARCHAR(40) NULL`); } catch (_) {}
  try { await pool.query(`ALTER TABLE cbs_financing_contracts ADD COLUMN rate_pct DECIMAL(8,4) NULL DEFAULT 0`); } catch (_) {}

  const [ins] = await pool.query(
    `INSERT INTO cbs_financing_contracts
      (contract_no, customer_id, product_code, branch_code, principal, outstanding,
       is_islamic, islamic_mode, rate_pct, status, disbursed_at, disbursement_journal_id, narrative, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [
      contractNo, customerId, productCode || 'LON-AGRI', branchCode || '001',
      amt, amt, isIslamic ? 1 : 0, islamicMode || null, Number(ratePct) || 0,
      businessDate || new Date().toISOString().slice(0, 10),
      journal.id, narrative || null, createdBy || null,
    ]
  );

  return {
    id: ins.insertId,
    contract_no: contractNo,
    principal: amt,
    status: 'active',
    journal,
  };
}


async function repayLoan({
  contractId, amount, businessDate, fromAccountId, narrative, createdBy, idempotencyKey,
  loanGl = '1100', cashGl = '1000', depositGl = '2000',
}) {
  const amt = money(amount);
  if (amt <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[c]] = await conn.query(
      `SELECT * FROM cbs_financing_contracts WHERE id = ? FOR UPDATE`,
      [contractId]
    );
    if (!c) { const e = new Error('Contract not found'); e.status = 404; throw e; }
    if (c.status !== 'active') { const e = new Error(`Contract status is ${c.status}`); e.status = 400; throw e; }

    const os = money(c.outstanding);
    if (amt > os) {
      const e = new Error(`Amount ${amt} exceeds outstanding ${os}`);
      e.status = 400;
      throw e;
    }

    const principalComponent = amt; // Phase 3: full amount to principal; charge split later
    const outstandingAfter = money(os - principalComponent);

    await conn.commit();
    conn.release();

    // Dr Cash or deposit / Cr Loan asset (reduce asset)
    const lines = [];
    if (fromAccountId) {
      lines.push({
        gl_code: depositGl,
        account_id: fromAccountId,
        debit: amt,
        credit: 0,
        narrative: 'Repayment from account',
      });
    } else {
      lines.push({ gl_code: cashGl, debit: amt, credit: 0, narrative: 'Cash repayment' });
    }
    lines.push({
      gl_code: loanGl,
      debit: 0,
      credit: amt,
      narrative: 'Loan principal recovery',
    });

    const journal = await postJournal({
      businessDate,
      branchCode: c.branch_code,
      sourceModule: 'LOAN_REPAY',
      sourceRef: c.contract_no,
      narrative: narrative || `Repayment ${c.contract_no}`,
      postedBy: createdBy,
      idempotencyKey: idempotencyKey ? `RP-${idempotencyKey}` : undefined,
      lines,
    });

    const newStatus = outstandingAfter <= 0 ? 'closed' : 'active';
    await pool.query(
      `UPDATE cbs_financing_contracts SET outstanding = ?, status = ? WHERE id = ?`,
      [outstandingAfter, newStatus, contractId]
    );

    const repayRef = ref('RPY');
    const [ins] = await pool.query(
      `INSERT INTO cbs_financing_repayments
        (contract_id, repayment_ref, business_date, amount, principal_component, charge_component,
         outstanding_after, journal_id, from_account_id, narrative, created_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        contractId, repayRef,
        businessDate || new Date().toISOString().slice(0, 10),
        amt, principalComponent, outstandingAfter,
        journal.id, fromAccountId || null, narrative || null, createdBy || null,
      ]
    );

    // Apply to schedule FIFO
    let remaining = principalComponent;
    const [sched] = await pool.query(
      `SELECT * FROM cbs_repayment_schedules
       WHERE contract_id = ? AND status IN ('pending','partial','overdue')
       ORDER BY installment_no FOR UPDATE`,
      [contractId]
    ).catch(() => [[]]);

    // without FOR UPDATE on second query if table empty
    const [sched2] = await pool.query(
      `SELECT * FROM cbs_repayment_schedules
       WHERE contract_id = ? AND status IN ('pending','partial','overdue')
       ORDER BY installment_no`,
      [contractId]
    );

    for (const row of sched2) {
      if (remaining <= 0) break;
      const dueLeft = money(Number(row.total_due) - Number(row.principal_paid) - Number(row.charge_paid));
      const apply = Math.min(remaining, dueLeft);
      const newPaid = money(Number(row.principal_paid) + apply);
      const fully = newPaid >= money(Number(row.total_due));
      await pool.query(
        `UPDATE cbs_repayment_schedules SET principal_paid = ?, status = ? WHERE id = ?`,
        [newPaid, fully ? 'paid' : 'partial', row.id]
      );
      remaining = money(remaining - apply);
    }

    return {
      id: ins.insertId,
      repayment_ref: repayRef,
      amount: amt,
      outstanding_after: outstandingAfter,
      contract_status: newStatus,
      journal,
    };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    try { conn.release(); } catch (_) {}
    throw err;
  }
}

/**
 * Equal principal installments (simple schedule — not full amortization engine)
 */
async function generateSchedule({ contractId, installments, firstDueDate, chargePerInstallment = 0 }) {
  const n = Number(installments) || 0;
  if (n < 1 || n > 360) {
    const e = new Error('installments must be 1–360');
    e.status = 400;
    throw e;
  }
  const [[c]] = await pool.query(`SELECT * FROM cbs_financing_contracts WHERE id = ?`, [contractId]);
  if (!c) { const e = new Error('Contract not found'); e.status = 404; throw e; }

  const [[ex]] = await pool.query(
    `SELECT COUNT(*) AS n FROM cbs_repayment_schedules WHERE contract_id = ?`,
    [contractId]
  );
  if (ex.n > 0) {
    const e = new Error('Schedule already exists for this contract');
    e.status = 400;
    throw e;
  }

  const principal = money(c.outstanding > 0 ? c.outstanding : c.principal);
  const base = money(Math.floor((principal / n) * 100) / 100);
  let allocated = 0;
  const start = firstDueDate || new Date().toISOString().slice(0, 10);
  const charge = money(chargePerInstallment);

  for (let i = 1; i <= n; i++) {
    let pDue = i === n ? money(principal - allocated) : base;
    allocated = money(allocated + pDue);
    const d = new Date(start + 'T12:00:00');
    d.setMonth(d.getMonth() + (i - 1));
    const due = d.toISOString().slice(0, 10);
    const total = money(pDue + charge);
    await pool.query(
      `INSERT INTO cbs_repayment_schedules
        (contract_id, installment_no, due_date, principal_due, charge_due, total_due, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [contractId, i, due, pDue, charge, total]
    );
  }

  const [rows] = await pool.query(
    `SELECT * FROM cbs_repayment_schedules WHERE contract_id = ? ORDER BY installment_no`,
    [contractId]
  );
  return { contract_id: contractId, installments: n, schedule: rows };
}


function addDaysIso(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/** Simple interest for tenor: principal * rate% * days/365 */
function tdInterest(principal, ratePct, days) {
  return simpleInterest(principal, ratePct, days, 365);
}

/**
 * Place TD: Dr Customer deposit (or cash) / Cr TD liability (use 2000 control; product may refine)
 * funding from account reduces CASA; TD tracked in cbs_term_deposits
 */
async function placeTermDeposit({
  customerId, fundingAccountId, principal, ratePct, tenorDays, valueDate,
  branchCode, productCode, rolloverInstruction, isIslamic, withholdingTaxPct,
  narrative, createdBy, idempotencyKey, cashGl = '1000', depositGl = '2000',
}) {
  const amt = money(principal);
  if (amt <= 0) { const e = new Error('Principal must be positive'); e.status = 400; throw e; }
  if (!customerId) { const e = new Error('customer_id required'); e.status = 400; throw e; }
  const tenor = Number(tenorDays) || 0;
  if (tenor < 1) { const e = new Error('tenor_days must be >= 1'); e.status = 400; throw e; }
  const vdate = valueDate || new Date().toISOString().slice(0, 10);
  const mdate = addDaysIso(vdate, tenor);
  const tdRef = ref('TD');

  const lines = [];
  if (fundingAccountId) {
    lines.push({
      gl_code: depositGl, account_id: fundingAccountId, debit: amt, credit: 0,
      narrative: 'TD funding from account',
    });
  } else {
    lines.push({ gl_code: cashGl, debit: amt, credit: 0, narrative: 'TD funding cash' });
  }
  lines.push({
    gl_code: depositGl, debit: 0, credit: amt, narrative: `TD liability ${tdRef}`,
  });

  const journal = await postJournal({
    businessDate: vdate,
    branchCode,
    sourceModule: 'TD_PLACE',
    sourceRef: tdRef,
    narrative: narrative || `Term deposit ${tdRef}`,
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `TD-${idempotencyKey}` : undefined,
    lines,
  });

  const [ins] = await pool.query(
    `INSERT INTO cbs_term_deposits
      (td_ref, customer_id, funding_account_id, product_code, branch_code, principal,
       outstanding_principal, rate_pct, tenor_days, value_date, maturity_date,
       rollover_instruction, status, is_islamic, withholding_tax_pct,
       placement_journal_id, narrative, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      tdRef, customerId, fundingAccountId || null, productCode || 'TD-PKR', branchCode || '001',
      amt, amt, Number(ratePct) || 0, tenor, vdate, mdate,
      rolloverInstruction || 'NONE', isIslamic ? 1 : 0, Number(withholdingTaxPct) || 0,
      journal.id, narrative || null, createdBy || null,
    ]
  );
  await pool.query(
    `INSERT INTO cbs_td_events (td_id, event_type, amount, journal_id, note, actor)
     VALUES (?, 'PLACE', ?, ?, ?, ?)`,
    [ins.insertId, amt, journal.id, 'Placement', createdBy || null]
  );
  return { id: ins.insertId, td_ref: tdRef, principal: amt, maturity_date: mdate, journal };
}

/**
 * Premature encashment or maturity payout.
 * Pays principal (+ interest if mature or allowInterestOnPremature).
 * Dr TD liability / Cr Cash or credit account
 */
async function settleTermDeposit({
  tdId, mode, creditAccountId, businessDate, narrative, createdBy, idempotencyKey,
  allowInterestOnPremature = false, depositGl = '2000', cashGl = '1000', expenseGl = '5000',
}) {
  // mode: 'MATURE' | 'PREMATURE'
  const [[td]] = await pool.query(`SELECT * FROM cbs_term_deposits WHERE id = ?`, [tdId]);
  if (!td) { const e = new Error('TD not found'); e.status = 404; throw e; }
  if (td.status !== 'active') { const e = new Error(`TD status is ${td.status}`); e.status = 400; throw e; }

  const bdate = businessDate || new Date().toISOString().slice(0, 10);
  const principal = money(td.outstanding_principal);
  let interest = 0;
  if (mode === 'MATURE') {
    interest = tdInterest(td.principal, td.rate_pct, td.tenor_days);
  } else if (mode === 'PREMATURE' && allowInterestOnPremature) {
    const start = new Date(String(td.value_date).slice(0, 10) + 'T12:00:00');
    const end = new Date(bdate + 'T12:00:00');
    const days = Math.max(0, Math.floor((end - start) / 86400000));
    interest = tdInterest(td.principal, td.rate_pct, days);
  }
  interest = money(interest);
  const whtPct = Number(td.withholding_tax_pct) || 0;
  const wht = money((interest * whtPct) / 100);
  const netInterest = money(interest - wht);
  const payout = money(principal + netInterest);

  const lines = [
    { gl_code: depositGl, debit: principal, credit: 0, narrative: 'TD principal release' },
  ];
  if (interest > 0) {
    lines.push({ gl_code: expenseGl, debit: interest, credit: 0, narrative: 'TD interest/profit expense' });
  }
  if (wht > 0) {
    lines.push({ gl_code: depositGl, debit: 0, credit: wht, narrative: 'WHT on TD interest (liability)' });
  }
  if (creditAccountId) {
    lines.push({
      gl_code: depositGl, account_id: creditAccountId, debit: 0, credit: payout,
      narrative: 'TD payout to account',
    });
  } else {
    lines.push({ gl_code: cashGl, debit: 0, credit: payout, narrative: 'TD payout cash' });
  }

  // Balance check: principal + interest = payout + wht
  const journal = await postJournal({
    businessDate: bdate,
    branchCode: td.branch_code,
    sourceModule: mode === 'MATURE' ? 'TD_MATURE' : 'TD_PREMATURE',
    sourceRef: td.td_ref,
    narrative: narrative || `${mode} ${td.td_ref}`,
    postedBy: createdBy,
    idempotencyKey: idempotencyKey ? `TDX-${idempotencyKey}` : undefined,
    lines,
  });

  const newStatus = mode === 'MATURE' ? 'matured' : 'encashed';
  await pool.query(
    `UPDATE cbs_term_deposits SET
      status = ?, outstanding_principal = 0,
      interest_accrued = ?, interest_paid = ?, wht_deducted = ?,
      maturity_journal_id = ?
     WHERE id = ?`,
    [newStatus, interest, netInterest, wht, journal.id, tdId]
  );
  await pool.query(
    `INSERT INTO cbs_td_events (td_id, event_type, amount, journal_id, note, actor)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tdId, mode === 'MATURE' ? 'MATURE' : 'PREMATURE', payout, journal.id, narrative || mode, createdBy || null]
  );

  return {
    id: tdId,
    td_ref: td.td_ref,
    status: newStatus,
    principal,
    interest,
    withholding_tax: wht,
    net_interest: netInterest,
    payout,
    journal,
  };
}

module.exports = {
  disburseLoan,
  repayLoan,
  generateSchedule,
  placeTermDeposit,
  settleTermDeposit,
  tdInterest,
  addDaysIso,

  postJournal,
  reverseJournal,
  trialBalance,
  internalTransfer,
  cashDeposit,
  cashWithdrawal,
  money,
  ref,
  audit,
};

