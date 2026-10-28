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
    const result = await eod.runEod(eod.org(req), req.user.userId || req.user.id, req.body || {});
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

module.exports = router;
