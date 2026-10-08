const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/checklist', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM compliance_items WHERE org_id=:orgId ORDER BY section_code, item_code',
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/checklist/:id', auth(), async (req, res) => {
  try {
    const done = req.body.is_done ? 1 : 0;
    await pool.query(
      `UPDATE compliance_items SET is_done=:done, done_at=IF(:done=1, CURDATE(), NULL) WHERE id=:id AND org_id=:orgId`,
      { done, id: req.params.id, orgId: req.user.orgId }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/events', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM statutory_events WHERE org_id=:orgId ORDER BY event_date',
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/setup', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM organisations WHERE id=:id', { id: req.user.orgId });
    res.json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/setup', auth(), async (req, res) => {
  try {
    const b = req.body;
    await pool.query(
      `UPDATE organisations SET province=:province, society_class=:society_class, institution_kind=:institution_kind,
        finance_mode=:finance_mode, name=:name, reg_number=:reg_number, address=:address WHERE id=:id`,
      {
        id: req.user.orgId,
        province: b.province,
        society_class: b.society_class,
        institution_kind: b.institution_kind,
        finance_mode: b.finance_mode,
        name: b.name,
        reg_number: b.reg_number,
        address: b.address,
      }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
