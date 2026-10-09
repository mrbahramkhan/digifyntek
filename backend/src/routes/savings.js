const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const router = express.Router();
const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

router.get('/', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      return res.json(await legacy.listDeposits({ orgCode: req.user.orgCode || req.user.orgId || '001' }));
    }
    res.json([]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
