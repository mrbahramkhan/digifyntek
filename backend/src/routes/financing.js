const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, c.full_name, c.cnic
       FROM cbs_financing_contracts f
       LEFT JOIN cbs_customers c ON c.id = f.customer_id
       ORDER BY f.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const [[f]] = await pool.query(
      `SELECT f.*, c.full_name, c.cnic
       FROM cbs_financing_contracts f
       LEFT JOIN cbs_customers c ON c.id = f.customer_id
       WHERE f.id = ?`,
      [req.params.id]
    );
    if (!f) return res.status(404).json({ error: 'Contract not found' });
    const [repayments] = await pool.query(
      `SELECT * FROM cbs_financing_repayments WHERE contract_id = ? ORDER BY id DESC`,
      [req.params.id]
    );
    const [schedule] = await pool.query(
      `SELECT * FROM cbs_repayment_schedules WHERE contract_id = ? ORDER BY installment_no`,
      [req.params.id]
    );
    res.json({ ...f, repayments, schedule });
  } catch (e) {
    next(e);
  }
});

router.post('/disburse', auth(), requirePermission('loan.disburse'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await ledger.disburseLoan({
      customerId: b.customer_id,
      productCode: b.product_code,
      principal: b.principal,
      branchCode: b.branch_code,
      businessDate: b.business_date,
      creditAccountId: b.credit_account_id || null,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
      isIslamic: !!b.is_islamic,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/repay', auth(), requirePermission('loan.repay'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await ledger.repayLoan({
      contractId: Number(req.params.id),
      amount: b.amount,
      businessDate: b.business_date,
      fromAccountId: b.from_account_id || null,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/schedule', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await ledger.generateSchedule({
      contractId: Number(req.params.id),
      installments: b.installments,
      firstDueDate: b.first_due_date,
      chargePerInstallment: b.charge_per_installment || 0,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/schedule', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM cbs_repayment_schedules WHERE contract_id = ? ORDER BY installment_no`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
