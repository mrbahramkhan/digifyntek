const express = require('express');
const { auth } = require('../middleware/auth');
const cb = require('../legacy/corebanking');
const posting = require('../legacy/posting');
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


router.post('/posting', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    const result = await posting.createPosting({
      orgCode: orgCode(req),
      userId: req.user.userId || req.user.id,
      body: req.body || {},
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/day-end', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    const result = await posting.dayEndPost({
      orgCode: orgCode(req),
      vacCode: (req.body && req.body.vac_code) || req.query.vacCode || req.user.vacCode,
      tranDate: (req.body && req.body.tran_date) || req.query.date,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/accrual', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    const b = req.body || {};
    const result = await posting.accrueInterest({
      orgCode: orgCode(req),
      vacCode: b.vac_code || req.user.vacCode,
      asOfDate: b.as_of || b.tran_date,
      days: b.days || 1,
      interestGl: b.interest_gl,
      incomeGl: b.income_gl,
      createJournal: b.create_journal !== false,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/unposted-count', auth(), async (req, res, next) => {
  try {
    if (!needLegacy(res)) return;
    const c = await posting.unpostedCount(orgCode(req), req.query.vacCode || req.user.vacCode);
    res.json({ count: c });
  } catch (e) {
    next(e);
  }
});


module.exports = router;
