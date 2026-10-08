const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    const orgId = req.query.porOrgacode || req.user.orgId;
    const vacCode = req.query.vacCode;
    let sql = `SELECT m.*, v.code AS vac_code FROM members m
      JOIN vacs v ON v.id = m.vac_id WHERE m.org_id = :orgId`;
    const params = { orgId };
    if (vacCode) {
      sql += ' AND v.code = :vacCode';
      params.vacCode = vacCode;
    }
    sql += ' ORDER BY m.id DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM members WHERE id = :id', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/360', auth(), async (req, res) => {
  try {
    const id = req.params.id;
    const [[member]] = await pool.query('SELECT * FROM members WHERE id = :id', { id });
    if (!member) return res.status(404).json({ error: 'Not found' });
    const [folios] = await pool.query('SELECT * FROM share_folios WHERE member_id = :id', { id });
    const [loans] = await pool.query('SELECT * FROM loans WHERE member_id = :id ORDER BY id DESC', { id });
    const [cards] = await pool.query('SELECT * FROM membership_cards WHERE member_id = :id', { id });
    const [collaterals] = await pool.query('SELECT * FROM collaterals WHERE member_id = :id', { id });
    const [guaranteesAsG] = await pool.query('SELECT * FROM guarantees WHERE guarantor_member_id = :id', { id });
    const [guaranteesAsB] = await pool.query('SELECT * FROM guarantees WHERE borrower_member_id = :id', { id });
    const [instruments] = await pool.query('SELECT * FROM instruments WHERE member_id = :id', { id });
    const [savings] = await pool.query('SELECT * FROM savings_accounts WHERE member_id = :id', { id });
    const [docs] = await pool.query('SELECT * FROM documents WHERE member_id = :id', { id });
    const exposureBorrower = loans.filter(l => ['active','disbursed'].includes(l.status)).reduce((s,l)=>s+Number(l.outstanding),0);
    const exposureGuarantor = guaranteesAsG.filter(g=>g.status==='active').reduce((s,g)=>s+Number(g.amount),0);
    res.json({
      member, folios, loans, cards, collaterals,
      guarantees: { asGuarantor: guaranteesAsG, asBorrower: guaranteesAsB },
      instruments, savings, documents: docs,
      exposure: { asBorrower: exposureBorrower, asGuarantor: exposureGuarantor, total: exposureBorrower + exposureGuarantor },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth(), async (req, res) => {
  try {
    const b = req.body;
    const orgId = b.org_id || req.user.orgId;
    const [r] = await pool.query(
      `INSERT INTO members (org_id, vac_id, member_code, full_name, cnic, mobile, village, address, is_farmer, status, joined_at, nominee_name, nominee_relation, nominee_cnic)
       VALUES (:org_id, :vac_id, :member_code, :full_name, :cnic, :mobile, :village, :address, :is_farmer, :status, :joined_at, :nominee_name, :nominee_relation, :nominee_cnic)`,
      {
        org_id: orgId,
        vac_id: b.vac_id,
        member_code: b.member_code || null,
        full_name: b.full_name,
        cnic: b.cnic,
        mobile: b.mobile || null,
        village: b.village || null,
        address: b.address || null,
        is_farmer: b.is_farmer ? 1 : 0,
        status: b.status || 'active',
        joined_at: b.joined_at || new Date().toISOString().slice(0,10),
        nominee_name: b.nominee_name || null,
        nominee_relation: b.nominee_relation || null,
        nominee_cnic: b.nominee_cnic || null,
      }
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', auth(), async (req, res) => {
  try {
    const b = req.body;
    await pool.query(
      `UPDATE members SET full_name=:full_name, mobile=:mobile, village=:village, address=:address,
        is_farmer=:is_farmer, status=:status, nominee_name=:nominee_name, nominee_relation=:nominee_relation, nominee_cnic=:nominee_cnic
       WHERE id=:id`,
      {
        id: req.params.id,
        full_name: b.full_name,
        mobile: b.mobile,
        village: b.village,
        address: b.address,
        is_farmer: b.is_farmer ? 1 : 0,
        status: b.status || 'active',
        nominee_name: b.nominee_name,
        nominee_relation: b.nominee_relation,
        nominee_cnic: b.nominee_cnic,
      }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
