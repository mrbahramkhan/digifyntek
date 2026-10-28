/**
 * Reconciliation skeleton — external statement lines vs internal journals
 * Auto-match: amount + optional external_ref / source_ref equality within date window
 */
const pool = require('../config/db');
const { ref, money } = require('../ledger/service');

async function createStatement({
  sourceType = 'GL',
  sourceName,
  statementDate,
  openingBalance = 0,
  closingBalance = 0,
  currency = 'PKR',
  notes,
  createdBy,
}) {
  if (!sourceName) {
    const e = new Error('source_name required');
    e.status = 400;
    throw e;
  }
  const statementRef = ref('REC');
  const [ins] = await pool.query(
    `INSERT INTO cbs_recon_statements
      (statement_ref, source_type, source_name, currency, statement_date,
       opening_balance, closing_balance, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      statementRef,
      sourceType,
      sourceName,
      currency,
      statementDate || new Date().toISOString().slice(0, 10),
      money(openingBalance),
      money(closingBalance),
      notes || null,
      createdBy || null,
    ]
  );
  return getStatement(ins.insertId);
}

async function getStatement(id) {
  const [[s]] = await pool.query(`SELECT * FROM cbs_recon_statements WHERE id = ?`, [id]);
  if (!s) return null;
  const [lines] = await pool.query(
    `SELECT * FROM cbs_recon_lines WHERE statement_id = ? ORDER BY id`,
    [id]
  );
  const [matches] = await pool.query(
    `SELECT * FROM cbs_recon_matches WHERE statement_id = ? ORDER BY id DESC LIMIT 100`,
    [id]
  );
  const unmatched = lines.filter((l) => l.match_status === 'unmatched').length;
  const matched = lines.filter((l) => l.match_status === 'matched').length;
  return {
    ...s,
    lines,
    matches,
    summary: {
      total_lines: lines.length,
      unmatched,
      matched,
      excluded: lines.filter((l) => l.match_status === 'excluded').length,
    },
  };
}

async function listStatements({ status, limit = 50 } = {}) {
  let sql = `SELECT * FROM cbs_recon_statements WHERE 1=1`;
  const params = [];
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY id DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 50, 200));
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function addLine({
  statementId,
  valueDate,
  amount,
  drCr,
  externalRef,
  narrative,
}) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  if (!['DR', 'CR'].includes(drCr)) {
    const e = new Error('dr_cr must be DR or CR');
    e.status = 400;
    throw e;
  }
  const [[s]] = await pool.query(`SELECT id, status FROM cbs_recon_statements WHERE id = ?`, [
    statementId,
  ]);
  if (!s) {
    const e = new Error('Statement not found');
    e.status = 404;
    throw e;
  }
  if (s.status === 'closed') {
    const e = new Error('Statement is closed');
    e.status = 400;
    throw e;
  }
  const lineRef = ref('RLN');
  await pool.query(
    `INSERT INTO cbs_recon_lines
      (statement_id, line_ref, value_date, amount, dr_cr, external_ref, narrative)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [statementId, lineRef, valueDate || null, amt, drCr, externalRef || null, narrative || null]
  );
  await pool.query(
    `UPDATE cbs_recon_statements SET status = 'matching' WHERE id = ? AND status = 'open'`,
    [statementId]
  );
  return getStatement(statementId);
}

async function candidateJournals({ amount, externalRef, fromDate, toDate, limit = 30 }) {
  const amt = money(amount);
  let sql = `
    SELECT h.id, h.journal_ref, h.business_date, h.source_ref, h.narrative,
           h.total_debit, h.total_credit, h.status
    FROM cbs_journal_headers h
    WHERE h.status = 'POSTED'
      AND (h.total_debit = ? OR h.total_credit = ?)
  `;
  const params = [amt, amt];
  if (externalRef) {
    sql += ` AND (h.source_ref = ? OR h.journal_ref = ? OR h.narrative LIKE ?)`;
    params.push(externalRef, externalRef, `%${externalRef}%`);
  }
  if (fromDate) {
    sql += ` AND h.business_date >= ?`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND h.business_date <= ?`;
    params.push(toDate);
  }
  // exclude already matched journals
  sql += ` AND h.id NOT IN (SELECT journal_id FROM cbs_recon_matches)`;
  sql += ` ORDER BY h.business_date DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 30, 100));
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (e) {
    return [];
  }
}

async function manualMatch({ lineId, journalId, actor }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[line]] = await conn.query(
      `SELECT * FROM cbs_recon_lines WHERE id = ? FOR UPDATE`,
      [lineId]
    );
    if (!line) {
      const e = new Error('Line not found');
      e.status = 404;
      throw e;
    }
    if (line.match_status !== 'unmatched') {
      const e = new Error(`Line is ${line.match_status}`);
      e.status = 400;
      throw e;
    }
    const [[j]] = await conn.query(
      `SELECT id, total_debit, total_credit, status FROM cbs_journal_headers WHERE id = ?`,
      [journalId]
    );
    if (!j || j.status !== 'POSTED') {
      const e = new Error('Journal not found or not POSTED');
      e.status = 400;
      throw e;
    }
    const [[already]] = await conn.query(
      `SELECT id FROM cbs_recon_matches WHERE journal_id = ? LIMIT 1`,
      [journalId]
    );
    if (already) {
      const e = new Error('Journal already matched');
      e.status = 400;
      throw e;
    }

    await conn.query(
      `UPDATE cbs_recon_lines
       SET match_status = 'matched', matched_journal_id = ?, matched_at = NOW(), matched_by = ?
       WHERE id = ?`,
      [journalId, actor || null, lineId]
    );
    await conn.query(
      `INSERT INTO cbs_recon_matches
        (statement_id, line_id, journal_id, match_type, amount, created_by)
       VALUES (?, ?, ?, 'MANUAL', ?, ?)`,
      [line.statement_id, lineId, journalId, line.amount, actor || null]
    );
    await conn.commit();
    return getStatement(line.statement_id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Auto-match unmatched lines by amount (+ external_ref when present)
 */
async function autoMatch(statementId, actor) {
  const stmt = await getStatement(statementId);
  if (!stmt) {
    const e = new Error('Statement not found');
    e.status = 404;
    throw e;
  }
  let matched = 0;
  for (const line of stmt.lines || []) {
    if (line.match_status !== 'unmatched') continue;
    const candidates = await candidateJournals({
      amount: line.amount,
      externalRef: line.external_ref,
      fromDate: line.value_date
        ? null
        : null,
      toDate: null,
      limit: 5,
    });
    // Prefer exact source_ref match
    let pick = null;
    if (line.external_ref) {
      pick = candidates.find(
        (c) => c.source_ref === line.external_ref || c.journal_ref === line.external_ref
      );
    }
    if (!pick && candidates.length === 1) pick = candidates[0];
    if (!pick) continue;
    try {
      await manualMatch({ lineId: line.id, journalId: pick.id, actor });
      // mark as AUTO
      await pool.query(
        `UPDATE cbs_recon_matches SET match_type = 'AUTO' WHERE line_id = ? ORDER BY id DESC LIMIT 1`,
        [line.id]
      );
      matched += 1;
    } catch (_) {
      /* skip conflicts */
    }
  }
  const updated = await getStatement(statementId);
  return { matched, statement: updated };
}

async function excludeLine(lineId, actor) {
  const [[line]] = await pool.query(`SELECT * FROM cbs_recon_lines WHERE id = ?`, [lineId]);
  if (!line) {
    const e = new Error('Line not found');
    e.status = 404;
    throw e;
  }
  if (line.match_status === 'matched') {
    const e = new Error('Cannot exclude matched line');
    e.status = 400;
    throw e;
  }
  await pool.query(
    `UPDATE cbs_recon_lines SET match_status = 'excluded', matched_by = ?, matched_at = NOW() WHERE id = ?`,
    [actor || null, lineId]
  );
  return getStatement(line.statement_id);
}

async function closeStatement(statementId) {
  const stmt = await getStatement(statementId);
  if (!stmt) {
    const e = new Error('Statement not found');
    e.status = 404;
    throw e;
  }
  if (stmt.summary.unmatched > 0) {
    const e = new Error(`${stmt.summary.unmatched} unmatched line(s) remain`);
    e.status = 400;
    throw e;
  }
  await pool.query(`UPDATE cbs_recon_statements SET status = 'closed' WHERE id = ?`, [statementId]);
  return getStatement(statementId);
}

module.exports = {
  createStatement,
  getStatement,
  listStatements,
  addLine,
  candidateJournals,
  manualMatch,
  autoMatch,
  excludeLine,
  closeStatement,
};
