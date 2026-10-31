/**
 * Reports module — operational MIS for CBS + Kisaan
 */
const express = require('express');
const reportAi = require('../services/reportAi');
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const ledger = require('../ledger/service');
const router = express.Router();

router.get('/catalog', auth(), (_req, res) => {
  res.json({
    reports: [
      { id: 'trial-balance', path: '/api/v1/reports/trial-balance', title: 'Trial balance' },
      { id: 'account-statement', path: '/api/v1/reports/account-statement', title: 'Account statement' },
      { id: 'casa-balances', path: '/api/v1/reports/casa-balances', title: 'CASA balances' },
      { id: 'loan-portfolio', path: '/api/v1/reports/loan-portfolio', title: 'Financing portfolio' },
      { id: 'td-portfolio', path: '/api/v1/reports/td-portfolio', title: 'Term deposit portfolio' },
      { id: 'member-summary', path: '/api/v1/reports/member-summary', title: 'Kisaan members summary' },
      { id: 'cheque-inventory', path: '/api/v1/reports/cheque-inventory', title: 'Cheque book inventory' },
      { id: 'stop-payments', path: '/api/v1/reports/stop-payments', title: 'Stop payment list' },
      { id: 'eod-history', path: '/api/v1/reports/eod-history', title: 'EOD run history' },
      { id: 'accrual-summary', path: '/api/v1/reports/accrual-summary', title: 'Accrual journals' },
    ],
  });
});

router.get('/trial-balance', auth(), async (req, res, next) => {
  try {
    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
    res.json(await ledger.trialBalance(asOf));
  } catch (e) {
    next(e);
  }
});

router.get('/account-statement', auth(), async (req, res, next) => {
  try {
    const accountId = Number(req.query.account_id);
    if (!accountId) return res.status(400).json({ error: 'account_id required' });
    if (ledger.accountStatement) {
      return res.json(await ledger.accountStatement(accountId, {
        from: req.query.from || null,
        to: req.query.to || null,
      }));
    }
    res.json({ account_id: accountId, rows: [] });
  } catch (e) {
    next(e);
  }
});

router.get('/accrual-summary', auth(), async (req, res, next) => {
  try {
    const from = req.query.from || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT id, journal_ref, business_date, source_ref, narrative, total_debit, total_credit, status, posted_at
       FROM cbs_journal_headers
       WHERE source_module IN ('EOD_ACCRUAL', 'EOD_ACCRUAL_ISLAMIC')
         AND business_date BETWEEN ? AND ?
       ORDER BY business_date DESC, id DESC
       LIMIT 1000`,
      [from, to]
    );
    const total = rows.reduce((s, r) => s + Number(r.total_debit || 0), 0);
    res.json({ from, to, count: rows.length, total_debit: Math.round(total * 100) / 100, rows });
  } catch (e) {
    next(e);
  }
});


/** AI natural-language report from DB */
router.post('/ai', auth(), async (req, res, next) => {
  try {
    const prompt = req.body?.prompt || req.body?.query || req.body?.order || '';
    if (!String(prompt).trim()) return res.status(400).json({ error: 'prompt required' });
    const result = await reportAi.generateReport(prompt, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/ai/intents', auth(), (req, res) => {
  res.json(reportAi.INTENTS.map((i) => ({ id: i.id, title: i.title })));
});

module.exports = router;

