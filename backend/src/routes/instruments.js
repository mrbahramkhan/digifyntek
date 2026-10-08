const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, m.full_name FROM instruments i
       LEFT JOIN members m ON m.id = i.member_id
       WHERE i.org_id = :orgId ORDER BY i.id DESC`,
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
    const prefixes = { loan_agreement: 'LA', share_certificate: 'SC', guarantee: 'GR', deposit_receipt: 'DR' };
    const no = b.instrument_no || `${prefixes[b.inst_type] || 'IN'}-${Date.now().toString().slice(-6)}`;
    const [r] = await pool.query(
      `INSERT INTO instruments (org_id, instrument_no, inst_type, member_id, loan_id, folio_id, amount_or_shares, issue_date, status, doc_url, notes)
       VALUES (:org_id, :no, :inst_type, :member_id, :loan_id, :folio_id, :amount, :issue_date, :status, :doc_url, :notes)`,
      {
        org_id: req.user.orgId,
        no,
        inst_type: b.inst_type,
        member_id: b.member_id || null,
        loan_id: b.loan_id || null,
        folio_id: b.folio_id || null,
        amount: b.amount_or_shares || null,
        issue_date: b.issue_date || new Date().toISOString().slice(0,10),
        status: b.status || 'active',
        doc_url: b.doc_url || null,
        notes: b.notes || null,
      }
    );
    res.status(201).json({ id: r.insertId, instrument_no: no });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
