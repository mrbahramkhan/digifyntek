const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const eod = require('../eod/service');
const router = express.Router();

router.get('/status', auth(), async (req, res, next) => {
  try {
    res.json(await eod.status(eod.org(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/run', auth(), requirePermission('eod.run'), async (req, res, next) => {
  try {
    const b = req.body || {};
    // SBP-style control: warn/block if open maker-checker items (unless force)
    if (!b.force) {
      try {
        const pool = require('../config/db');
        const [[{ cnt }]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM cbs_approvals WHERE status = 'pending'`
        ).catch(() => [[{ cnt: 0 }]]);
        if (Number(cnt) > 0 && !b.allow_pending_approvals) {
          return res.status(400).json({
            error: `EOD blocked: ${cnt} pending approval(s). Clear maker-checker or pass allow_pending_approvals`,
            pending_approvals: Number(cnt),
          });
        }
      } catch (_) {}
    }
    const result = await eod.runEod(eod.org(req), req.user.userId || req.user.id, b);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/business-date', auth(), async (req, res, next) => {
  try {
    const d = req.body?.business_date;
    if (!d) return res.status(400).json({ error: 'business_date required (YYYY-MM-DD)' });
    res.json(await eod.setBusinessDate(eod.org(req), d, req.user.userId));
  } catch (e) {
    next(e);
  }
});


router.post('/accrual/run', auth(), requirePermission('eod.run'), async (req, res, next) => {
  try {
    const accrual = require('../eod/accrual');
    const biz = req.body?.business_date || new Date().toISOString().slice(0, 10);
    const result = await accrual.runAllAccruals({
      businessDate: biz,
      actor: req.user?.userId || req.user?.id || 'accrual',
      skip: req.body?.skip || {},
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

