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
    // maker-checker segregation (SBP control)
    try {
      const pool = require('../config/db');
      const [[reqRow]] = await pool.query(`SELECT maker_id, created_by, status FROM cbs_approvals WHERE id = ?`, [req.params.id]).catch(() => [[null]]);
      if (reqRow) {
        const maker = String(reqRow.maker_id || reqRow.created_by || '');
        const checker = String(actor(req) || '');
        if (maker && checker && maker === checker) {
          return res.status(400).json({ error: 'Maker cannot approve own request (segregation of duties)' });
        }
        if (String(reqRow.status || '').toLowerCase() !== 'pending') {
          return res.status(400).json({ error: 'Only pending requests can be approved' });
        }
      }
    } catch (_) {}
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
    if (!req.body?.note && !req.body?.reason) {
      return res.status(400).json({ error: 'Rejection requires note/reason' });
    }
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
