const express = require('express');
const { auth } = require('../middleware/auth');
const cb = require('../legacy/corebanking');
const router = express.Router();

const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';

function orgCode(req) {
  return String(req.user.orgCode || req.user.orgId || '001');
}

function needLegacy(res) {
  if (!LEGACY) {
    res.status(501).json({
      error: 'Core banking routes require DB_MODE=legacy (Digital Kisaan schema)',
    });
    return false;
  }
  return true;
}

router.get('/summary', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.coreSummary(orgCode(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/coa', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.chartOfAccounts(orgCode(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/gl-balances', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.glBalances(orgCode(req), req.query.vacCode || req.user.vacCode));
  } catch (e) {
    next(e);
  }
});

router.get('/products/deposits', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.depositProducts(orgCode(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/products/loans', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.loanProducts(orgCode(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/tran-types', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(await cb.transactionTypes(orgCode(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/statement/:accountNo', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(
      await cb.accountStatement({
        orgCode: orgCode(req),
        accountNo: req.params.accountNo,
        limit: req.query.limit,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/transactions', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    res.json(
      await cb.recentTransactions({
        orgCode: orgCode(req),
        vacCode: req.query.vacCode || req.user.vacCode,
        limit: req.query.limit,
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
