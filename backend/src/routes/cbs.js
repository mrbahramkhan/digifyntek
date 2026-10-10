const express = require('express');
const { auth } = require('../middleware/auth');
const cbs = require('../cbs/service');
const router = express.Router();

router.get('/summary', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.summary(cbs.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/customers', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.listCustomers(cbs.org(req), req.query.q));
  } catch (e) {
    next(e);
  }
});

router.post('/customers', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.full_name) return res.status(400).json({ error: 'full_name required' });
    res.status(201).json(await cbs.createCustomer(cbs.org(req), b, req.user.userId));
  } catch (e) {
    next(e);
  }
});

router.post('/customers/import-legacy', auth(), async (req, res, next) => {
  try {
    res.status(201).json(await cbs.importLegacyFarmer(cbs.org(req), req.body.farmer_no || req.body.member_ref));
  } catch (e) {
    next(e);
  }
});

router.get('/accounts', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.listAccounts(cbs.org(req), req.query.q));
  } catch (e) {
    next(e);
  }
});

router.post('/accounts', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.cif_no || !b.product_code) return res.status(400).json({ error: 'cif_no and product_code required' });
    res.status(201).json(await cbs.openAccount(cbs.org(req), b));
  } catch (e) {
    next(e);
  }
});

router.get('/products', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.products(cbs.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/transactions', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.listTxns(cbs.org(req), req.query.limit));
  } catch (e) {
    next(e);
  }
});

router.post('/transfers', auth(), async (req, res, next) => {
  try {
    res.status(201).json(await cbs.postTransfer(cbs.org(req), req.body || {}, req.user.userId));
  } catch (e) {
    next(e);
  }
});

router.get('/integrations', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.integrations(cbs.org(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/sbp-controls', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.sbpControls());
  } catch (e) {
    next(e);
  }
});

router.patch('/sbp-controls/:code', auth(), async (req, res, next) => {
  try {
    res.json(await cbs.updateSbpControl(req.params.code, req.body.status, req.body.evidence_note));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
