const express = require('express');
const { auth } = require('../middleware/auth');
const legacy = require('../legacy/queries');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const orgCode = req.user.orgCode || req.user.orgId || '001';
    res.json(await legacy.listVacs({ orgCode }));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
