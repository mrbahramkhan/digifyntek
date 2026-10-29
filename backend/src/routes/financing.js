const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const router = express.Router();

router.get('/products', auth(), async (req, res, next) => {
  try {
    const pool = require('../config/db');
    const islamic = req.query.islamic;
    let sql = `SELECT product_code, product_name, product_type, product_family, islamic_mode, is_islamic, interest_rate, active
               FROM cbs_products WHERE active = 1`;
    const params = [];
    if (islamic === '1') {
      sql += ` AND is_islamic = 1`;
    } else if (islamic === '0') {
      sql += ` AND COALESCE(is_islamic,0) = 0`;
    }
    if (req.query.family) {
      sql += ` AND product_family = ?`;
      params.push(req.query.family);
    }
    sql += ` ORDER BY is_islamic, product_code`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});



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
    // Resolve islamic flag from body or product master
    let isIslamic = !!b.is_islamic;
    let islamicMode = b.islamic_mode || null;
    let ratePct = b.rate_pct != null ? Number(b.rate_pct) : null;
    try {
      const [[prod]] = await pool.query(
        `SELECT is_islamic, islamic_mode, interest_rate FROM cbs_products WHERE product_code = ? LIMIT 1`,
        [b.product_code || 'LON-AGRI']
      );
      if (prod) {
        if (b.is_islamic === undefined) isIslamic = !!prod.is_islamic;
        islamicMode = islamicMode || prod.islamic_mode || null;
        if (ratePct == null && prod.interest_rate != null) ratePct = Number(prod.interest_rate);
      }
    } catch (_) {}
    const result = await ledger.disburseLoan({
      customerId: b.customer_id,
      productCode: b.product_code,
      principal: b.principal,
      branchCode: b.branch_code,
      businessDate: b.business_date,
      creditAccountId: b.credit_account_id || b.to_account_id || null,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
      isIslamic,
      islamicMode,
      ratePct: ratePct || 0,
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
