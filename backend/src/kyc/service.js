/**
 * KYC case workflow — evidence & decision history.
 * Identity verification states: pending | verified | rejected | unavailable | manual_review
 * Never auto-claims NADRA success without an authorized integration (not present).
 */
const pool = require('../config/db');
const { ref, audit } = require('../ledger/service');

async function logEvent(conn, caseId, actor, action, detail) {
  await conn.query(
    `INSERT INTO cbs_kyc_events (case_id, actor, action, detail_json) VALUES (?, ?, ?, ?)`,
    [caseId, actor || null, action, detail ? JSON.stringify(detail) : null]
  );
}

async function openCase({
  customerId,
  caseType = 'ONBOARDING',
  riskRating = 'low',
  sourceOfFunds,
  sourceOfWealth,
  purposeOfAccount,
  createdBy,
}) {
  if (!customerId) {
    const e = new Error('customer_id required');
    e.status = 400;
    throw e;
  }
  const [[cust]] = await pool.query(`SELECT id, full_name, status FROM cbs_customers WHERE id = ?`, [
    customerId,
  ]);
  if (!cust) {
    const e = new Error('Customer not found');
    e.status = 404;
    throw e;
  }

  const caseRef = ref('KYC');
  const [ins] = await pool.query(
    `INSERT INTO cbs_kyc_cases
      (case_ref, customer_id, case_type, status, risk_rating, kyc_outcome,
       source_of_funds, source_of_wealth, purpose_of_account, created_by)
     VALUES (?, ?, ?, 'open', ?, 'pending', ?, ?, ?, ?)`,
    [
      caseRef,
      customerId,
      caseType,
      riskRating,
      sourceOfFunds || null,
      sourceOfWealth || null,
      purposeOfAccount || null,
      createdBy || null,
    ]
  );

  // Default screening stubs — pending (not clear)
  for (const st of ['SANCTIONS', 'PEP']) {
    await pool.query(
      `INSERT INTO cbs_screening_cases
        (screen_ref, customer_id, kyc_case_id, screen_type, provider, status)
       VALUES (?, ?, ?, ?, 'MANUAL', 'pending')`,
      [ref('SCR'), customerId, ins.insertId, st]
    );
  }

  const conn = await pool.getConnection();
  try {
    await logEvent(conn, ins.insertId, createdBy, 'CASE_OPEN', { case_ref: caseRef });
    await audit(conn, {
      actor: createdBy,
      action: 'KYC_OPEN',
      entity_type: 'kyc_case',
      entity_id: String(ins.insertId),
      detail: { case_ref: caseRef, customer_id: customerId },
    });
  } finally {
    conn.release();
  }

  return getCase(ins.insertId);
}

async function getCase(id) {
  const [[c]] = await pool.query(
    `SELECT k.*, cu.full_name, cu.cnic, cu.phone, cu.kyc_status AS customer_kyc_status
     FROM cbs_kyc_cases k
     JOIN cbs_customers cu ON cu.id = k.customer_id
     WHERE k.id = ?`,
    [id]
  );
  if (!c) return null;
  const [docs] = await pool.query(`SELECT * FROM cbs_kyc_documents WHERE case_id = ? ORDER BY id`, [
    id,
  ]);
  const [screens] = await pool.query(
    `SELECT * FROM cbs_screening_cases WHERE kyc_case_id = ? ORDER BY id`,
    [id]
  );
  const [events] = await pool.query(
    `SELECT * FROM cbs_kyc_events WHERE case_id = ? ORDER BY id DESC LIMIT 50`,
    [id]
  );
  return { ...c, documents: docs, screenings: screens, events };
}

async function listCases({ status, limit = 100 } = {}) {
  const lim = Math.min(Number(limit) || 100, 300);
  if (status) {
    const [rows] = await pool.query(
      `SELECT k.*, cu.full_name, cu.cnic
       FROM cbs_kyc_cases k JOIN cbs_customers cu ON cu.id = k.customer_id
       WHERE k.status = ? ORDER BY k.id DESC LIMIT ?`,
      [status, lim]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT k.*, cu.full_name, cu.cnic
     FROM cbs_kyc_cases k JOIN cbs_customers cu ON cu.id = k.customer_id
     ORDER BY k.id DESC LIMIT ?`,
    [lim]
  );
  return rows;
}

async function addDocument({ caseId, docType, docRef, fileName, notes, uploadedBy }) {
  const [[c]] = await pool.query(`SELECT id, status FROM cbs_kyc_cases WHERE id = ?`, [caseId]);
  if (!c) {
    const e = new Error('Case not found');
    e.status = 404;
    throw e;
  }
  if (['approved', 'rejected', 'closed'].includes(c.status)) {
    const e = new Error(`Cannot add documents to ${c.status} case`);
    e.status = 400;
    throw e;
  }
  const [ins] = await pool.query(
    `INSERT INTO cbs_kyc_documents (case_id, doc_type, doc_ref, file_name, notes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [caseId, docType || 'OTHER', docRef || null, fileName || null, notes || null, uploadedBy || null]
  );
  await pool.query(`UPDATE cbs_kyc_cases SET status = 'pending_docs' WHERE id = ? AND status = 'open'`, [
    caseId,
  ]);
  const conn = await pool.getConnection();
  try {
    await logEvent(conn, caseId, uploadedBy, 'DOC_ADD', { doc_type: docType, id: ins.insertId });
  } finally {
    conn.release();
  }
  const [[row]] = await pool.query(`SELECT * FROM cbs_kyc_documents WHERE id = ?`, [ins.insertId]);
  return row;
}

async function updateScreening({ screenId, status, matchScore, resultSummary, evidenceNote, screenedBy }) {
  const allowed = ['pending', 'clear', 'match', 'unavailable', 'manual_review'];
  if (!allowed.includes(status)) {
    const e = new Error('Invalid screening status');
    e.status = 400;
    throw e;
  }
  // Never auto "clear" from a fake external API — only explicit user decision
  await pool.query(
    `UPDATE cbs_screening_cases
     SET status = ?, match_score = ?, result_summary = ?, evidence_note = ?,
         screened_by = ?, screened_at = NOW()
     WHERE id = ?`,
    [
      status,
      matchScore != null ? Number(matchScore) : null,
      resultSummary || null,
      evidenceNote || null,
      screenedBy || null,
      screenId,
    ]
  );
  const [[row]] = await pool.query(`SELECT * FROM cbs_screening_cases WHERE id = ?`, [screenId]);
  if (row && row.kyc_case_id) {
    const conn = await pool.getConnection();
    try {
      await logEvent(conn, row.kyc_case_id, screenedBy, 'SCREEN_UPDATE', {
        screen_id: screenId,
        status,
      });
    } finally {
      conn.release();
    }
  }
  return row;
}

async function decideCase({ caseId, decision, kycOutcome, riskRating, note, decidedBy, nextReviewDate }) {
  // decision: approved | rejected
  if (!['approved', 'rejected'].includes(decision)) {
    const e = new Error('decision must be approved or rejected');
    e.status = 400;
    throw e;
  }
  const outcomes = ['pending', 'verified', 'rejected', 'unavailable', 'manual_review'];
  let outcome = kycOutcome;
  if (decision === 'approved') {
    outcome = outcome || 'verified';
    if (outcome === 'pending') outcome = 'verified';
  } else {
    outcome = outcome || 'rejected';
  }
  if (!outcomes.includes(outcome)) {
    const e = new Error('Invalid kyc_outcome');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[c]] = await conn.query(`SELECT * FROM cbs_kyc_cases WHERE id = ? FOR UPDATE`, [caseId]);
    if (!c) {
      const e = new Error('Case not found');
      e.status = 404;
      throw e;
    }
    if (['approved', 'rejected', 'closed'].includes(c.status)) {
      const e = new Error(`Case already ${c.status}`);
      e.status = 400;
      throw e;
    }

    // Block approve if any screening still match without manual_review resolution
    if (decision === 'approved') {
      const [screens] = await conn.query(
        `SELECT * FROM cbs_screening_cases WHERE kyc_case_id = ?`,
        [caseId]
      );
      const blocking = screens.filter((s) => s.status === 'match' || s.status === 'pending');
      if (blocking.length) {
        const e = new Error(
          'Cannot approve: screening still pending or match — resolve to clear/manual_review first'
        );
        e.status = 400;
        throw e;
      }
    }

    await conn.query(
      `UPDATE cbs_kyc_cases SET
        status = ?, kyc_outcome = ?, risk_rating = COALESCE(?, risk_rating),
        decision_note = ?, decided_by = ?, decided_at = NOW(),
        next_review_date = ?
       WHERE id = ?`,
      [
        decision,
        outcome,
        riskRating || null,
        note || null,
        decidedBy || null,
        nextReviewDate || null,
        caseId,
      ]
    );

    // Sync customer KYC + risk
    await conn.query(
      `UPDATE cbs_customers SET kyc_status = ?, risk_rating = COALESCE(?, risk_rating),
        status = CASE WHEN ? = 'rejected' THEN 'restricted' ELSE status END
       WHERE id = ?`,
      [outcome, riskRating || null, decision, c.customer_id]
    );

    await logEvent(conn, caseId, decidedBy, decision === 'approved' ? 'CASE_APPROVE' : 'CASE_REJECT', {
      outcome,
      note,
    });
    await audit(conn, {
      actor: decidedBy,
      action: decision === 'approved' ? 'KYC_APPROVE' : 'KYC_REJECT',
      entity_type: 'kyc_case',
      entity_id: String(caseId),
      detail: { outcome },
    });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getCase(caseId);
}

async function setInReview(caseId, actor) {
  await pool.query(
    `UPDATE cbs_kyc_cases SET status = 'in_review' WHERE id = ? AND status IN ('open','pending_docs')`,
    [caseId]
  );
  const conn = await pool.getConnection();
  try {
    await logEvent(conn, caseId, actor, 'IN_REVIEW', {});
  } finally {
    conn.release();
  }
  return getCase(caseId);
}

module.exports = {
  openCase,
  getCase,
  listCases,
  addDocument,
  updateScreening,
  decideCase,
  setInReview,
};
