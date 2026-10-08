const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, m.full_name, m.cnic FROM membership_cards c
       JOIN members m ON m.id = c.member_id WHERE m.org_id = :orgId ORDER BY c.id DESC`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth(), async (req, res) => {
  try {
    const b = req.body;
    const num = b.card_number || `MC-${String(Date.now()).slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO membership_cards (member_id, card_number, issue_date, expiry_date, status, qr_payload)
       VALUES (:member_id, :num, :issue, :expiry, :status, :qr)`,
      {
        member_id: b.member_id,
        num,
        issue: b.issue_date || new Date().toISOString().slice(0,10),
        expiry: b.expiry_date || null,
        status: b.status || 'active',
        qr: `member:${b.member_id}`,
      }
    );
    res.status(201).json({ id: r.insertId, card_number: num });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/block', auth(), async (req, res) => {
  try {
    await pool.query(`UPDATE membership_cards SET status='blocked' WHERE id=:id`, { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
