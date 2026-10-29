/**
 * Reports module — operational MIS for CBS + Kisaan
 */
const express = require('express');
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
    const from = req.query.from || '2000-01-01';
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [accountId]);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const [lines] = await pool.query(
      `SELECT h.journal_ref, h.business_date, h.narrative, h.source_module, l.debit, l.credit, l.gl_code
       FROM cbs_journal_lines l
       JOIN cbs_journal_headers h ON h.id = l.journal_id
       WHERE l.account_id = ? AND h.status = 'POSTED'
         AND h.business_date BETWEEN ? AND ?
       ORDER BY h.business_date, h.id, l.id
       LIMIT 2000`,
      [accountId, from, to]
    );
    res.json({ account: acct, from, to, lines });
  } catch (e) {
    next(e);
  }
});

router.get('/casa-balances', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.account_no, a.product_code, a.customer_id, a.currency,
              COALESCE(a.ledger_balance, a.balance, 0) AS balance,
              a.status, c.full_name, c.cnic
       FROM cbs_accounts a
       LEFT JOIN cbs_customers c ON c.id = a.customer_id
       ORDER BY a.id DESC LIMIT 2000`
    );
    const total = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    res.json({ count: rows.length, total_balance: Math.round(total * 100) / 100, rows });
  } catch (e) {
    next(e);
  }
});

router.get('/loan-portfolio', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, c.full_name
       FROM cbs_financing_contracts f
       LEFT JOIN cbs_customers c ON c.id = f.customer_id
       ORDER BY f.id DESC LIMIT 2000`
    );
    const active = rows.filter((r) => r.status === 'active');
    const os = active.reduce((s, r) => s + Number(r.outstanding || 0), 0);
    res.json({
      count: rows.length,
      active_count: active.length,
      outstanding_total: Math.round(os * 100) / 100,
      rows,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/td-portfolio', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, c.full_name
       FROM cbs_term_deposits t
       LEFT JOIN cbs_customers c ON c.id = t.customer_id
       ORDER BY t.id DESC LIMIT 2000`
    );
    const active = rows.filter((r) => r.status === 'active');
    const prin = active.reduce((s, r) => s + Number(r.outstanding_principal || r.principal || 0), 0);
    const accr = active.reduce((s, r) => s + Number(r.interest_accrued || 0), 0);
    res.json({
      count: rows.length,
      active_count: active.length,
      principal_total: Math.round(prin * 100) / 100,
      accrued_total: Math.round(accr * 100) / 100,
      rows,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/member-summary', auth(), async (req, res, next) => {
  try {
    let members = [];
    try {
      const [m] = await pool.query(`SELECT * FROM members ORDER BY id DESC LIMIT 2000`);
      members = m;
    } catch (_) {
      const [m] = await pool.query(
        `SELECT id, full_name, cnic, phone, status, kyc_status, created_at FROM cbs_customers ORDER BY id DESC LIMIT 2000`
      );
      members = m;
    }
    res.json({ count: members.length, rows: members });
  } catch (e) {
    next(e);
  }
});

router.get('/cheque-inventory', auth(), async (req, res, next) => {
  try {
    const [books] = await pool.query(
      `SELECT status, COUNT(*) AS n FROM cheque_books GROUP BY status`
    );
    const [leaves] = await pool.query(
      `SELECT status, COUNT(*) AS n FROM cheque_leaves GROUP BY status`
    );
    const [list] = await pool.query(
      `SELECT id, book_no, member_ref, account_no, leaf_start, leaf_end, total_leaves, status, issue_date
       FROM cheque_books ORDER BY id DESC LIMIT 500`
    );
    res.json({ books_by_status: books, leaves_by_status: leaves, books: list });
  } catch (e) {
    next(e);
  }
});

router.get('/stop-payments', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.cheque_no, l.status, l.stop_date, l.stop_reason, l.amount, l.payee_name,
              b.book_no, b.member_ref, b.account_no
       FROM cheque_leaves l
       JOIN cheque_books b ON b.id = l.book_id
       WHERE l.status = 'stopped'
       ORDER BY l.stop_date DESC, l.id DESC
       LIMIT 1000`
    );
    res.json({ count: rows.length, rows });
  } catch (e) {
    next(e);
  }
});

router.get('/eod-history', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM eod_runs ORDER BY id DESC LIMIT 100`
    );
    res.json({ count: rows.length, rows });
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
       WHERE source_module = 'EOD_ACCRUAL'
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

module.exports = router;
