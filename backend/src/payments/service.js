const pool = require('../config/db');
const ledger = require('../ledger/service');
const raast = require('./raastSimulator');
const { ref, money } = ledger;

async function initiateRaastOutbound({
  amount,
  debtorAccountId,
  debtorIban,
  creditorIban,
  creditorName,
  raastId,
  narrative,
  businessDate,
  createdBy,
  idempotencyKey,
  postOnSimulatedSettle = true,
}) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }

  if (idempotencyKey) {
    const [[ex]] = await pool.query(
      `SELECT * FROM cbs_payment_instructions WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey]
    );
    if (ex) return { ...ex, idempotent: true };
  }

  const paymentRef = ref('PAY');
  const sim = raast.simulateOutbound({ amount: amt, creditorIban, raastId });

  let postingStatus = 'NONE';
  let settlementStatus = 'NONE';
  let journalId = null;

  // Optional internal ledger when sim says SETTLED and debit account provided
  if (sim.external_status === 'SETTLED' && postOnSimulatedSettle && debtorAccountId) {
    try {
      const journal = await ledger.postJournal({
        businessDate,
        sourceModule: 'RAAST_SIM',
        sourceRef: paymentRef,
        narrative: narrative || `SIMULATED Raast out ${paymentRef}`,
        postedBy: createdBy,
        idempotencyKey: idempotencyKey ? `PAYJ-${idempotencyKey}` : undefined,
        lines: [
          {
            gl_code: '2000',
            account_id: debtorAccountId,
            debit: amt,
            credit: 0,
            narrative: 'SIMULATED Raast debit customer',
          },
          {
            gl_code: '2100',
            debit: 0,
            credit: amt,
            narrative: 'SIMULATED clearing/suspense credit',
          },
        ],
      });
      journalId = journal.id;
      postingStatus = 'POSTED';
      settlementStatus = 'SETTLED';
    } catch (err) {
      postingStatus = 'FAILED';
      settlementStatus = 'PENDING';
      sim.posting_error = err.message;
    }
  } else if (sim.external_status === 'SETTLED') {
    settlementStatus = 'SETTLED';
  } else if (sim.external_status === 'ACCEPTED') {
    settlementStatus = 'PENDING';
  }

  const [ins] = await pool.query(
    `INSERT INTO cbs_payment_instructions
      (payment_ref, channel, direction, amount, currency, debtor_account_id, debtor_iban,
       creditor_iban, creditor_name, raast_id, narrative, external_status, posting_status,
       settlement_status, journal_id, idempotency_key, simulator, request_json, response_json,
       created_by, business_date)
     VALUES (?, 'RAAST', 'OUT', ?, 'PKR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      paymentRef,
      amt,
      debtorAccountId || null,
      debtorIban || null,
      creditorIban || null,
      creditorName || null,
      raastId || null,
      narrative || null,
      sim.external_status,
      postingStatus,
      settlementStatus,
      journalId,
      idempotencyKey || null,
      JSON.stringify({ amount: amt, creditorIban, raastId }),
      JSON.stringify(sim),
      createdBy || null,
      businessDate || new Date().toISOString().slice(0, 10),
    ]
  );

  await pool.query(
    `INSERT INTO cbs_payment_attempts (payment_id, attempt_no, outcome, detail_json)
     VALUES (?, 1, ?, ?)`,
    [ins.insertId, sim.external_status, JSON.stringify(sim)]
  );

  const [[row]] = await pool.query(`SELECT * FROM cbs_payment_instructions WHERE id = ?`, [
    ins.insertId,
  ]);
  return {
    ...row,
    warning:
      'This is a SIMULATOR response. external_status is not an official Raast acknowledgement.',
  };
}

async function listPayments({ channel, limit = 100 } = {}) {
  const lim = Math.min(Number(limit) || 100, 300);
  if (channel) {
    const [rows] = await pool.query(
      `SELECT * FROM cbs_payment_instructions WHERE channel = ? ORDER BY id DESC LIMIT ?`,
      [channel, lim]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT * FROM cbs_payment_instructions ORDER BY id DESC LIMIT ?`,
    [lim]
  );
  return rows;
}

async function getPayment(id) {
  const [[p]] = await pool.query(`SELECT * FROM cbs_payment_instructions WHERE id = ?`, [id]);
  if (!p) return null;
  const [attempts] = await pool.query(
    `SELECT * FROM cbs_payment_attempts WHERE payment_id = ? ORDER BY id`,
    [id]
  );
  return {
    ...p,
    attempts,
    status_inquiry: raast.simulateStatusInquiry(p),
  };
}

module.exports = { initiateRaastOutbound, listPayments, getPayment };
