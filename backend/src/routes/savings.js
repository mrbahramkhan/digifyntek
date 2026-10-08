const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, m.full_name, m.cnic
       FROM savings_accounts s
       JOIN members m ON m.id = s.member_id
       WHERE m.org_id = :orgId
       ORDER BY s.id DESC LIMIT 500`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.member_id) return res.status(400).json({ error: 'member_id required' });
    const account_no = b.account_no || `SA-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO savings_accounts (member_id, account_no, mode, balance, status, opened_at)
       VALUES (:mid, :ano, :mode, :bal, 'active', CURDATE())`,
      {
        mid: b.member_id,
        ano: account_no,
        mode: b.mode || 'conventional',
        bal: Number(b.opening_balance || 0),
      }
    );
    if (Number(b.opening_balance) > 0) {
      await pool.query(
        `INSERT INTO savings_txns (account_id, txn_type, amount, txn_date, ref)
         VALUES (:id, 'deposit', :amt, CURDATE(), 'opening')`,
        { id: r.insertId, amt: Number(b.opening_balance) }
      );
    }
    res.status(201).json({ id: r.insertId, account_no });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deposit', auth(), async (req, res, next) => {
  try {
    const amount = Number(req.body.amount || 0);
    if (amount <= 0) return res.status(400).json({ error: 'amount required' });
    await pool.query(
      `UPDATE savings_accounts SET balance = balance + :amt WHERE id = :id AND status='active'`,
      { amt: amount, id: req.params.id }
    );
    await pool.query(
      `INSERT INTO savings_txns (account_id, txn_type, amount, txn_date, ref)
       VALUES (:id, 'deposit', :amt, CURDATE(), :ref)`,
      { id: req.params.id, amt: amount, ref: req.body.ref || null }
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/withdraw', auth(), async (req, res, next) => {
  try {
    const amount = Number(req.body.amount || 0);
    if (amount <= 0) return res.status(400).json({ error: 'amount required' });
    const [[acc]] = await pool.query(`SELECT balance FROM savings_accounts WHERE id=:id`, {
      id: req.params.id,
    });
    if (!acc || Number(acc.balance) < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    await pool.query(
      `UPDATE savings_accounts SET balance = balance - :amt WHERE id = :id`,
      { amt: amount, id: req.params.id }
    );
    await pool.query(
      `INSERT INTO savings_txns (account_id, txn_type, amount, txn_date, ref)
       VALUES (:id, 'withdrawal', :amt, CURDATE(), :ref)`,
      { id: req.params.id, amt: amount, ref: req.body.ref || null }
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/txns', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM savings_txns WHERE account_id = :id ORDER BY id DESC LIMIT 200`,
      { id: req.params.id }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
