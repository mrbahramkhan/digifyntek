const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, c.full_name, c.cnic
       FROM cbs_term_deposits t
       LEFT JOIN cbs_customers c ON c.id = t.customer_id
       ORDER BY t.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/meta/due', auth(), async (req, res, next) => {
  try {
    const asOf = (req.query.as_of || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const [rows] = await pool.query(
      `SELECT t.*, c.full_name FROM cbs_term_deposits t
       LEFT JOIN cbs_customers c ON c.id = t.customer_id
       WHERE t.status = 'active' AND t.maturity_date <= ?
       ORDER BY t.maturity_date`,
      [asOf]
    );
    res.json({ as_of: asOf, due: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const [[t]] = await pool.query(
      `SELECT t.*, c.full_name, c.cnic
       FROM cbs_term_deposits t
       LEFT JOIN cbs_customers c ON c.id = t.customer_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!t) return res.status(404).json({ error: 'Not found' });
    const [events] = await pool.query(
      `SELECT * FROM cbs_td_events WHERE td_id = ? ORDER BY id`,
      [req.params.id]
    );
    const projected = ledger.tdInterest(t.principal, t.rate_pct, t.tenor_days);
    res.json({ ...t, events, projected_interest_at_maturity: projected });
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), requirePermission('td.write'), async (req, res, next) => {
  try {
    const b = req.body || {};
    let isIslamic = !!b.is_islamic;
    let islamicMode = b.islamic_mode || null;
    try {
      const [[prod]] = await pool.query(
        `SELECT is_islamic, islamic_mode, interest_rate FROM cbs_products WHERE product_code = ? LIMIT 1`,
        [b.product_code || 'TD-PKR']
      );
      if (prod) {
        if (b.is_islamic === undefined) isIslamic = !!prod.is_islamic;
        islamicMode = islamicMode || prod.islamic_mode;
        if (b.rate_pct == null && prod.interest_rate != null) b.rate_pct = prod.interest_rate;
      }
    } catch (_) {}
    const result = await ledger.placeTermDeposit({
      customerId: b.customer_id,
      fundingAccountId: b.funding_account_id || null,
      principal: b.principal,
      ratePct: b.rate_pct,
      tenorDays: b.tenor_days,
      valueDate: b.value_date,
      branchCode: b.branch_code,
      productCode: b.product_code,
      rolloverInstruction: b.rollover_instruction,
      isIslamic,
      islamicMode,
      withholdingTaxPct: b.withholding_tax_pct,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/mature', auth(), requirePermission('td.write'), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await ledger.settleTermDeposit({
        tdId: Number(req.params.id),
        mode: 'MATURE',
        creditAccountId: b.credit_account_id || null,
        businessDate: b.business_date,
        narrative: b.narrative,
        createdBy: req.user?.userId || req.user?.id,
        idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/:id/premature', auth(), requirePermission('td.write'), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await ledger.settleTermDeposit({
        tdId: Number(req.params.id),
        mode: 'PREMATURE',
        creditAccountId: b.credit_account_id || null,
        businessDate: b.business_date,
        narrative: b.narrative,
        createdBy: req.user?.userId || req.user?.id,
        idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
        allowInterestOnPremature: !!b.allow_interest,
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
