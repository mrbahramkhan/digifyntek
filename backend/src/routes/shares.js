const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const router = express.Router();
const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

router.get('/summary', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.json(await legacy.shareSummary({ orgCode: req.user.orgCode || req.user.orgId || '001' }));
    }
    res.json({ folios: 0, total_shares: 0, capital: 0 });
  } catch (e) {
    next(e);
  }
});

router.get('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.json(await legacy.listShares({ orgCode: req.user.orgCode || req.user.orgId || '001' }));
    }
    res.json([]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
