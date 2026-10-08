const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, m.full_name, m.cnic, m.member_code
       FROM share_folios f
       JOIN members m ON m.id = f.member_id
       WHERE m.org_id = :orgId
       ORDER BY f.id DESC LIMIT 500`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/summary', auth(), async (req, res, next) => {
  try {
    const [[s]] = await pool.query(
      `SELECT COUNT(*) AS folios,
              COALESCE(SUM(f.shares),0) AS total_shares,
              COALESCE(SUM(f.shares * f.face_value),0) AS capital
       FROM share_folios f
       JOIN members m ON m.id = f.member_id
       WHERE m.org_id = :orgId AND f.status = 'active'`,
      { orgId: req.user.orgId }
    );
    res.json(s);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body;
    const shares = Number(b.shares || 0);
    const face = Number(b.face_value || 1000);
    if (!b.member_id || shares <= 0) {
      return res.status(400).json({ error: 'member_id and shares required' });
    }
    const folio = b.folio_no || `F-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO share_folios (member_id, folio_no, shares, face_value, status, issued_at)
       VALUES (:mid, :folio, :shares, :face, 'active', CURDATE())`,
      { mid: b.member_id, folio, shares, face }
    );
    await pool.query(
      `INSERT INTO share_transactions (folio_id, txn_type, shares, amount, txn_date, notes)
       VALUES (:fid, 'purchase', :shares, :amt, CURDATE(), :notes)`,
      { fid: r.insertId, shares, amt: shares * face, notes: b.notes || null }
    );
    res.status(201).json({ id: r.insertId, folio_no: folio });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
