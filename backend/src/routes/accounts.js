const express = require('express');
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const { ref } = ledger;
const router = express.Router();

const ACCT_ALTERS = [
  "ALTER TABLE cbs_accounts ADD COLUMN purpose_of_account VARCHAR(160) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN account_title VARCHAR(160) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN operating_instructions VARCHAR(80) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN mode_of_operation VARCHAR(80) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN nominee_name VARCHAR(160) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN nominee_relation VARCHAR(60) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN nominee_cnic VARCHAR(20) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN initial_deposit DECIMAL(18,2) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN source_of_funds VARCHAR(120) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN expected_monthly_turnover DECIMAL(18,2) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN statement_frequency VARCHAR(30) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN cheque_book_required TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_accounts ADD COLUMN debit_card_required TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_accounts ADD COLUMN internet_banking TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_accounts ADD COLUMN sms_alerts TINYINT(1) NULL DEFAULT 1",
  "ALTER TABLE cbs_accounts ADD COLUMN kyc_cleared TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_accounts ADD COLUMN risk_rating VARCHAR(20) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN opened_by VARCHAR(50) NULL",
  "ALTER TABLE cbs_accounts ADD COLUMN notes TEXT NULL",
];
let acctColsReady = false;
async function ensureAcctColumns() {
  if (acctColsReady) return;
  for (const sql of ACCT_ALTERS) {
    try { await pool.query(sql); } catch (_) {}
  }
  acctColsReady = true;
}



router.get('/', auth(), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT a.*, c.full_name, c.cnic
       FROM cbs_accounts a
       JOIN cbs_customers c ON c.id = a.customer_id
       ORDER BY a.id DESC LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    await ensureAcctColumns();
    const b = req.body || {};
    if (!b.customer_id) return res.status(400).json({ error: 'customer_id required' });
    if (!b.product_code) return res.status(400).json({ error: 'product_code required' });
    if (!b.purpose_of_account || !String(b.purpose_of_account).trim()) return res.status(400).json({ error: 'purpose_of_account required (SBP onboarding)' });
    const accountNo = b.account_no || ref('ACC').slice(0, 20);
    // KYC gate: pending KYC customers open as pending unless override
    let status = b.status || 'active';
    try {
      const [[cust]] = await pool.query(
        `SELECT kyc_status, risk_rating, full_name FROM cbs_customers WHERE id = ?`,
        [b.customer_id]
      );
      if (cust && String(cust.kyc_status || '').toLowerCase() === 'pending' && !b.force_active) {
        status = b.status || 'pending';
      }
      if (!b.account_title && cust) b.account_title = cust.full_name;
      if (!b.risk_rating && cust) b.risk_rating = cust.risk_rating;
    } catch (_) {}

    const [ins] = await pool.query(
      `INSERT INTO cbs_accounts
        (account_no, iban, customer_id, product_code, branch_code, currency, status,
         ledger_balance, available_balance, opened_at, open_date,
         purpose_of_account, account_title, operating_instructions, mode_of_operation,
         nominee_name, nominee_relation, nominee_cnic, initial_deposit, source_of_funds,
         expected_monthly_turnover, statement_frequency, cheque_book_required, debit_card_required,
         internet_banking, sms_alerts, kyc_cleared, risk_rating, opened_by, notes, account_type)
       VALUES (?, ?, ?, ?, ?, 'PKR', ?, 0, 0, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountNo,
        b.iban || null,
        b.customer_id,
        b.product_code,
        b.branch_code || '001',
        status,
        b.opened_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        b.open_date || new Date().toISOString().slice(0, 10),
        b.purpose_of_account || null,
        b.account_title || null,
        b.operating_instructions || b.mode_of_operation || 'self',
        b.mode_of_operation || b.operating_instructions || 'self',
        b.nominee_name || null,
        b.nominee_relation || null,
        b.nominee_cnic || null,
        b.initial_deposit != null ? Number(b.initial_deposit) : null,
        b.source_of_funds || null,
        b.expected_monthly_turnover != null ? Number(b.expected_monthly_turnover) : null,
        b.statement_frequency || 'monthly',
        b.cheque_book_required ? 1 : 0,
        b.debit_card_required ? 1 : 0,
        b.internet_banking ? 1 : 0,
        b.sms_alerts === false || b.sms_alerts === 0 ? 0 : 1,
        b.kyc_cleared ? 1 : 0,
        b.risk_rating || null,
        req.user?.userId || null,
        b.notes || null,
        b.account_type || (String(b.product_code).includes('CUR') ? 'current' : 'savings'),
      ]
    );

    // Optional initial deposit via ledger if amount > 0 and account active-ish
    const init = Number(b.initial_deposit || 0);
    if (init > 0 && status !== 'rejected') {
      try {
        await ledger.cashDeposit({
          accountId: ins.insertId,
          amount: init,
          narrative: b.deposit_narrative || 'Initial deposit - account opening',
          businessDate: b.open_date || undefined,
        });
      } catch (_) {
        // non-fatal: account still created
      }
    }

    const [[row]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/statement', auth(), async (req, res, next) => {
  try {
    const [lines] = await pool.query(
      `SELECT h.journal_ref, h.business_date, h.narrative, l.debit, l.credit, l.gl_code
       FROM cbs_journal_lines l
       JOIN cbs_journal_headers h ON h.id = l.journal_id
       WHERE l.account_id = ? AND h.status = 'POSTED'
       ORDER BY h.business_date, h.id, l.line_no`,
      [req.params.id]
    );
    const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [req.params.id]);
    res.json({ account: acct, entries: lines });
  } catch (e) {
    next(e);
  }
});


router.post('/:id/deposit', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.narrative || !String(b.narrative).trim()) return res.status(400).json({ error: 'narrative/purpose required (SBP)' });
    if (b.amount == null || Number(b.amount) <= 0) return res.status(400).json({ error: 'amount required' });
    const result = await ledger.cashDeposit({
      accountId: Number(req.params.id),
      amount: b.amount,
      businessDate: b.business_date,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [req.params.id]);
    res.status(201).json({ ...result, account: acct });
  } catch (e) { next(e); }
});

router.post('/:id/withdraw', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.narrative || !String(b.narrative).trim()) return res.status(400).json({ error: 'narrative/purpose required (SBP)' });
    if (b.amount == null || Number(b.amount) <= 0) return res.status(400).json({ error: 'amount required' });
    const result = await ledger.cashWithdrawal({
      accountId: Number(req.params.id),
      amount: b.amount,
      businessDate: b.business_date,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [req.params.id]);
    res.status(201).json({ ...result, account: acct });
  } catch (e) { next(e); }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const [[acct]] = await pool.query(
      `SELECT a.*, c.full_name, c.cnic FROM cbs_accounts a
       JOIN cbs_customers c ON c.id = a.customer_id WHERE a.id = ?`,
      [req.params.id]
    );
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    res.json(acct);
  } catch (e) { next(e); }
});

module.exports = router;

