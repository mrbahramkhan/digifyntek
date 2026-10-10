const express = require('express');
const { auth } = require('../middleware/auth');
const mfb = require('../mfb/service');
const router = express.Router();

router.get('/config', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.getConfig(mfb.org(req)));
  } catch (e) {
    next(e);
  }
});

router.put('/config', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.updateConfig(mfb.org(req), req.body || {}));
  } catch (e) {
    next(e);
  }
});

router.get('/loans', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.listLoans(mfb.org(req), req.query.q));
  } catch (e) {
    next(e);
  }
});

router.post('/loans', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.account_no) return res.status(400).json({ error: 'account_no required' });
    res.status(201).json(await mfb.upsertLoan(mfb.org(req), b));
  } catch (e) {
    next(e);
  }
});

router.post('/reclassify', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.reclassifyAll(mfb.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/summary', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.portfolioSummary(mfb.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/regulatory-pack', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.regulatoryPack(mfb.org(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/import-legacy', auth(), async (req, res, next) => {
  try {
    res.json(await mfb.importLegacyLoans(mfb.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/classify-preview', auth(), async (req, res) => {
  const dpd = Number(req.query.dpd) || 0;
  const cat = req.query.category || 'general';
  const classification = mfb.classifyByDpd(dpd, cat);
  res.json({ dpd, category: cat, classification });
});

module.exports = router;
