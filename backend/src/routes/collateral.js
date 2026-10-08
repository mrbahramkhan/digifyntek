const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, m.full_name, l.loan_number FROM collaterals c
       JOIN members m ON m.id = c.member_id
       LEFT JOIN loans l ON l.id = c.loan_id
       WHERE m.org_id = :orgId ORDER BY c.id DESC`,
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
    const code = b.collateral_code || `CL-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO collaterals (member_id, loan_id, collateral_code, coll_type, description, declared_value, charge_date, status, docs_json)
       VALUES (:member_id, :loan_id, :code, :coll_type, :description, :declared_value, :charge_date, 'charged', :docs)`,
      {
        member_id: b.member_id,
        loan_id: b.loan_id || null,
        code,
        coll_type: b.coll_type,
        description: b.description || null,
        declared_value: b.declared_value || 0,
        charge_date: b.charge_date || new Date().toISOString().slice(0,10),
        docs: b.docs_json ? JSON.stringify(b.docs_json) : null,
      }
    );
    res.status(201).json({ id: r.insertId, collateral_code: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/guarantees', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*,
        gm.full_name AS guarantor_name, bm.full_name AS borrower_name, l.loan_number
       FROM guarantees g
       JOIN members gm ON gm.id = g.guarantor_member_id
       JOIN members bm ON bm.id = g.borrower_member_id
       JOIN loans l ON l.id = g.loan_id
       WHERE bm.org_id = :orgId ORDER BY g.id DESC`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/guarantees', auth(), async (req, res) => {
  try {
    const b = req.body;
    const code = b.guarantee_code || `GR-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO guarantees (guarantee_code, guarantor_member_id, borrower_member_id, loan_id, amount, status)
       VALUES (:code, :g, :b, :loan_id, :amount, 'active')`,
      { code, g: b.guarantor_member_id, b: b.borrower_member_id, loan_id: b.loan_id, amount: b.amount }
    );
    res.status(201).json({ id: r.insertId, guarantee_code: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
