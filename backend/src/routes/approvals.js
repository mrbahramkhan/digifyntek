const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const approvals = require('../approvals/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/', auth(), async (req, res, next) => {
  try {
    res.json(await approvals.list({ status: req.query.status || 'PENDING', limit: req.query.limit }));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const row = await approvals.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const row = await approvals.submit({
      requestType: b.request_type,
      payload: b.payload,
      amount: b.amount,
      makerId: actor(req),
      branchCode: b.branch_code,
      businessDate: b.business_date,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/approve', auth(), requirePermission('approval.decide'), async (req, res, next) => {
  try {
    const row = await approvals.decide(req.params.id, {
      checkerId: actor(req),
      decision: 'APPROVED',
      note: req.body?.note,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reject', auth(), requirePermission('approval.decide'), async (req, res, next) => {
  try {
    const row = await approvals.decide(req.params.id, {
      checkerId: actor(req),
      decision: 'REJECTED',
      note: req.body?.note,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/cancel', auth(), async (req, res, next) => {
  try {
    res.json(await approvals.cancel(req.params.id, { makerId: actor(req) }));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
