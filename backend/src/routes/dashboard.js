const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const router = express.Router();
const LEGACY = process.env.DB_MODE === 'legacy' || process.env.DB_NAME === 'digitalkisaan';

router.get('/kpis', auth(), async (req, res, next) => {
  try {
    if (LEGACY) {
      const orgCode = req.user.orgCode || req.user.orgId || '001';
      return res.json(await legacy.dashboardKpis({ orgCode }));
    }
    res.json({
      membersActive: 0,
      portfolioOutstanding: 0,
      activeLoans: 0,
      par30: 0,
      par90: 0,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
