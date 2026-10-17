const express = require('express');
const { auth } = require('../middleware/auth');
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

router.post('/disburse', auth(), async (req, res, next) => {
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

module.exports = router;
