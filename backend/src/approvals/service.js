/**
 * Maker-checker — server-side only.
 * Maker cannot approve own request.
 * Sensitive ops: LOAN_DISBURSE, LOAN_REPAY, JOURNAL, TRANSFER (when submitted via this queue)
 */
const pool = require('../config/db');
const ledger = require('../ledger/service');
const { ref } = ledger;

async function list({ status = 'PENDING', limit = 100 } = {}) {
  const lim = Math.min(Number(limit) || 100, 300);
  if (status === 'ALL') {
    const [rows] = await pool.query(
      `SELECT * FROM cbs_approval_requests ORDER BY id DESC LIMIT ?`,
      [lim]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT * FROM cbs_approval_requests WHERE status = ? ORDER BY id DESC LIMIT ?`,
    [status, lim]
  );
  return rows;
}

async function getById(id) {
  const [[row]] = await pool.query(`SELECT * FROM cbs_approval_requests WHERE id = ?`, [id]);
  return row || null;
}

async function submit({
  requestType,
  payload,
  amount,
  makerId,
  branchCode,
  businessDate,
}) {
  if (!requestType) {
    const e = new Error('request_type required');
    e.status = 400;
    throw e;
  }
  if (!makerId) {
    const e = new Error('maker required');
    e.status = 400;
    throw e;
  }
  const allowed = ['LOAN_DISBURSE', 'LOAN_REPAY', 'JOURNAL', 'TRANSFER', 'CASA_DEPOSIT', 'CASA_WITHDRAW'];
  if (!allowed.includes(requestType)) {
    const e = new Error(`Unsupported request_type: ${requestType}`);
    e.status = 400;
    throw e;
  }

  const requestRef = ref('APR');
  const [ins] = await pool.query(
    `INSERT INTO cbs_approval_requests
      (request_ref, request_type, payload_json, amount, maker_id, branch_code, business_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      requestRef,
      requestType,
      JSON.stringify(payload || {}),
      amount != null ? Number(amount) : null,
      String(makerId),
      branchCode || null,
      businessDate || new Date().toISOString().slice(0, 10),
    ]
  );

  const conn = await pool.getConnection();
  try {
    await ledger.audit(conn, {
      actor: makerId,
      action: 'APPROVAL_SUBMIT',
      entity_type: 'approval',
      entity_id: String(ins.insertId),
      detail: { request_ref: requestRef, request_type: requestType, amount },
    });
  } finally {
    conn.release();
  }

  return getById(ins.insertId);
}

async function executePayload(requestType, payload, actor) {
  switch (requestType) {
    case 'LOAN_DISBURSE':
      return ledger.disburseLoan({
        customerId: payload.customer_id,
        productCode: payload.product_code,
        principal: payload.principal,
        branchCode: payload.branch_code,
        businessDate: payload.business_date,
        creditAccountId: payload.credit_account_id || null,
        narrative: payload.narrative,
        createdBy: actor,
        idempotencyKey: payload.idempotency_key,
        isIslamic: !!payload.is_islamic,
      });
    case 'LOAN_REPAY':
      return ledger.repayLoan({
        contractId: payload.contract_id,
        amount: payload.amount,
        businessDate: payload.business_date,
        fromAccountId: payload.from_account_id || null,
        narrative: payload.narrative,
        createdBy: actor,
        idempotencyKey: payload.idempotency_key,
      });
    case 'JOURNAL':
      return ledger.postJournal({
        businessDate: payload.business_date,
        valueDate: payload.value_date,
        branchCode: payload.branch_code,
        sourceModule: 'APPROVAL',
        sourceRef: payload.source_ref,
        narrative: payload.narrative,
        lines: payload.lines || [],
        postedBy: actor,
        idempotencyKey: payload.idempotency_key,
      });
    case 'TRANSFER':
      return ledger.internalTransfer({
        fromAccountId: payload.from_account_id,
        toAccountId: payload.to_account_id,
        amount: payload.amount,
        businessDate: payload.business_date,
        narrative: payload.narrative,
        createdBy: actor,
        idempotencyKey: payload.idempotency_key,
      });
    case 'CASA_DEPOSIT':
      return ledger.cashDeposit({
        accountId: payload.account_id,
        amount: payload.amount,
        businessDate: payload.business_date,
        narrative: payload.narrative,
        createdBy: actor,
        idempotencyKey: payload.idempotency_key,
      });
    case 'CASA_WITHDRAW':
      return ledger.cashWithdrawal({
        accountId: payload.account_id,
        amount: payload.amount,
        businessDate: payload.business_date,
        narrative: payload.narrative,
        createdBy: actor,
        idempotencyKey: payload.idempotency_key,
      });
    default: {
      const e = new Error('Unknown request type');
      e.status = 400;
      throw e;
    }
  }
}

async function decide(id, { checkerId, decision, note }) {
  if (!checkerId) {
    const e = new Error('checker required');
    e.status = 400;
    throw e;
  }
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    const e = new Error('decision must be APPROVED or REJECTED');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      `SELECT * FROM cbs_approval_requests WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!row) {
      const e = new Error('Request not found');
      e.status = 404;
      throw e;
    }
    if (row.status !== 'PENDING') {
      const e = new Error(`Request is ${row.status}`);
      e.status = 400;
      throw e;
    }
    if (String(row.maker_id) === String(checkerId)) {
      const e = new Error('Maker cannot approve/reject own request (segregation of duties)');
      e.status = 403;
      throw e;
    }

    if (decision === 'REJECTED') {
      await conn.query(
        `UPDATE cbs_approval_requests
         SET status = 'REJECTED', checker_id = ?, checker_at = NOW(), checker_note = ?
         WHERE id = ?`,
        [String(checkerId), note || null, id]
      );
      await ledger.audit(conn, {
        actor: checkerId,
        action: 'APPROVAL_REJECT',
        entity_type: 'approval',
        entity_id: String(id),
        detail: { note },
      });
      await conn.commit();
      return getById(id);
    }

    // APPROVED — mark first to prevent double-execution, then execute outside same lock if needed
    await conn.query(
      `UPDATE cbs_approval_requests
       SET status = 'APPROVED', checker_id = ?, checker_at = NOW(), checker_note = ?
       WHERE id = ?`,
      [String(checkerId), note || null, id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Execute financial payload after approval marker
  const row = await getById(id);
  let payload = row.payload_json;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      payload = {};
    }
  }

  try {
    const result = await executePayload(row.request_type, payload || {}, checkerId);
    await pool.query(`UPDATE cbs_approval_requests SET result_json = ? WHERE id = ?`, [
      JSON.stringify(result),
      id,
    ]);
    const conn2 = await pool.getConnection();
    try {
      await ledger.audit(conn2, {
        actor: checkerId,
        action: 'APPROVAL_APPROVE',
        entity_type: 'approval',
        entity_id: String(id),
        detail: { request_type: row.request_type },
      });
    } finally {
      conn2.release();
    }
    return getById(id);
  } catch (err) {
    // Roll status back to PENDING so it can be retried or rejected
    await pool.query(
      `UPDATE cbs_approval_requests
       SET status = 'PENDING', checker_id = NULL, checker_at = NULL,
           checker_note = ?
       WHERE id = ?`,
      [`Execution failed: ${err.message}`, id]
    );
    throw err;
  }
}

async function cancel(id, { makerId }) {
  const [[row]] = await pool.query(`SELECT * FROM cbs_approval_requests WHERE id = ?`, [id]);
  if (!row) {
    const e = new Error('Not found');
    e.status = 404;
    throw e;
  }
  if (row.status !== 'PENDING') {
    const e = new Error('Only PENDING can be cancelled');
    e.status = 400;
    throw e;
  }
  if (String(row.maker_id) !== String(makerId)) {
    const e = new Error('Only maker can cancel');
    e.status = 403;
    throw e;
  }
  await pool.query(`UPDATE cbs_approval_requests SET status = 'CANCELLED' WHERE id = ?`, [id]);
  return getById(id);
}

module.exports = { list, getById, submit, decide, cancel, executePayload };
