const express = require('express');
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const { ref } = require('../ledger/service');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT a.*, c.full_name, c.cnic
       FROM cbs_accounts a
       JOIN cbs_customers c ON c.id = a.customer_id
       ORDER BY a.id DESC LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.customer_id) return res.status(400).json({ error: 'customer_id required' });
    if (!b.product_code) return res.status(400).json({ error: 'product_code required' });
    const accountNo = b.account_no || ref('ACC').slice(0, 20);
    const [ins] = await pool.query(
      `INSERT INTO cbs_accounts
        (account_no, iban, customer_id, product_code, branch_code, currency, status,
         ledger_balance, available_balance, opened_at)
       VALUES (?, ?, ?, ?, ?, 'PKR', ?, 0, 0, ?)`,
      [
        accountNo,
        b.iban || null,
        b.customer_id,
        b.product_code,
        b.branch_code || '001',
        b.status || 'active',
        b.opened_at || new Date().toISOString().slice(0, 10),
      ]
    );
    const [[row]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/statement', auth(), async (req, res, next) => {
  try {
    const [lines] = await pool.query(
      `SELECT h.journal_ref, h.business_date, h.narrative, l.debit, l.credit, l.gl_code
       FROM cbs_journal_lines l
       JOIN cbs_journal_headers h ON h.id = l.journal_id
       WHERE l.account_id = ? AND h.status = 'POSTED'
       ORDER BY h.business_date, h.id, l.line_no`,
      [req.params.id]
    );
    const [[acct]] = await pool.query(`SELECT * FROM cbs_accounts WHERE id = ?`, [req.params.id]);
    res.json({ account: acct, entries: lines });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
