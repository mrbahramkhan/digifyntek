const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const router = express.Router();

router.get('/coa', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM cbs_coa WHERE is_active = 1 ORDER BY gl_code`);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/journals', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM cbs_journal_headers ORDER BY id DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/journals/:id', auth(), async (req, res, next) => {
  try {
    const [[h]] = await pool.query(`SELECT * FROM cbs_journal_headers WHERE id = ?`, [req.params.id]);
    if (!h) return res.status(404).json({ error: 'Not found' });
    const [lines] = await pool.query(
      `SELECT * FROM cbs_journal_lines WHERE journal_id = ? ORDER BY line_no`,
      [req.params.id]
    );
    res.json({ ...h, lines });
  } catch (e) {
    next(e);
  }
});

router.post('/journals', auth(), requirePermission('ledger.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await ledger.postJournal({
      businessDate: b.business_date,
      valueDate: b.value_date,
      branchCode: b.branch_code,
      sourceModule: b.source_module || 'MANUAL',
      sourceRef: b.source_ref,
      narrative: b.narrative,
      lines: b.lines || [],
      postedBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/journals/:id/reverse', auth(), requirePermission('ledger.reverse'), async (req, res, next) => {
  try {
    const result = await ledger.reverseJournal(req.params.id, {
      postedBy: req.user?.userId || req.user?.id,
      narrative: req.body?.narrative,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/trial-balance', auth(), async (req, res, next) => {
  try {
    res.json(await ledger.trialBalance(req.query.as_of));
  } catch (e) {
    next(e);
  }
});


function validateTransferBody(b) {
  if (!b.from_account_id) return 'from_account_id required';
  if (!b.to_account_id) return 'to_account_id required';
  if (Number(b.from_account_id) === Number(b.to_account_id)) return 'From and to accounts must differ';
  if (b.amount == null || Number(b.amount) <= 0) return 'amount must be greater than zero';
  if (!b.narrative || !String(b.narrative).trim()) return 'purpose / narrative required (SBP)';
  if (Number(b.amount) >= 1000000 && String(b.narrative).length < 15) {
    return 'Large transfer (>= 1,000,000) requires detailed purpose narrative';
  }
  return null;
}

router.post('/transfers', auth(), requirePermission('transfer.post', 'casa.post', 'ledger.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const verr = validateTransferBody(b);
    if (verr) return res.status(400).json({ error: verr });
    const result = await ledger.internalTransfer({
      fromAccountId: b.from_account_id,
      toAccountId: b.to_account_id,
      amount: b.amount,
      businessDate: b.business_date,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});


// Alias used by some clients
router.post('/transfer', auth(), requirePermission('transfer.post', 'casa.post', 'ledger.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const verr = validateTransferBody(b);
    if (verr) return res.status(400).json({ error: verr });
    const result = await ledger.internalTransfer({
      fromAccountId: b.from_account_id,
      toAccountId: b.to_account_id,
      amount: b.amount,
      businessDate: b.business_date,
      narrative: b.narrative,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

