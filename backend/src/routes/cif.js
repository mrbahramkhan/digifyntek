const express = require('express');
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const { ref, audit } = require('../ledger/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/', auth(), async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    let rows;
    if (q) {
      const like = `%${q}%`;
      [rows] = await pool.query(
        `SELECT * FROM cbs_customers
         WHERE full_name LIKE ? OR cnic LIKE ? OR phone LIKE ? OR customer_no LIKE ?
         ORDER BY id DESC LIMIT ?`,
        [like, like, like, like, limit]
      );
    } else {
      [rows] = await pool.query(`SELECT * FROM cbs_customers ORDER BY id DESC LIMIT ?`, [limit]);
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const [[c]] = await pool.query(`SELECT * FROM cbs_customers WHERE id = ?`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const [accts] = await pool.query(`SELECT * FROM cbs_accounts WHERE customer_id = ?`, [c.id]);
    res.json({ ...c, accounts: accts });
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.full_name) return res.status(400).json({ error: 'full_name required' });
    const customerNo = b.customer_no || ref('CIF').slice(0, 20);
    const [ins] = await pool.query(
      `INSERT INTO cbs_customers
        (customer_no, customer_type, full_name, father_or_husband, gender, dob, cnic, phone, email,
         address, city, risk_rating, status, kyc_status, branch_code, source_of_funds, occupation, is_pep, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        customerNo,
        b.customer_type || 'individual',
        b.full_name,
        b.father_or_husband || null,
        b.gender || null,
        b.dob || null,
        b.cnic || null,
        b.phone || null,
        b.email || null,
        b.address || null,
        b.city || null,
        b.risk_rating || 'low',
        b.status || 'active',
        b.kyc_status || 'pending',
        b.branch_code || null,
        b.source_of_funds || null,
        b.occupation || null,
        b.is_pep ? 1 : 0,
        b.notes || null,
        actor(req),
      ]
    );
    const conn = await pool.getConnection();
    try {
      await audit(conn, {
        actor: actor(req),
        action: 'CIF_CREATE',
        entity_type: 'customer',
        entity_id: String(ins.insertId),
        detail: { customer_no: customerNo },
      });
    } finally {
      conn.release();
    }
    if (b.cnic) {
      await pool.query(
        `INSERT IGNORE INTO cbs_customer_identifications (customer_id, id_type, id_number)
         VALUES (?, 'CNIC', ?)`,
        [ins.insertId, b.cnic]
      );
    }
    const [[row]] = await pool.query(`SELECT * FROM cbs_customers WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    await pool.query(
      `UPDATE cbs_customers SET
        full_name = COALESCE(?, full_name),
        father_or_husband = COALESCE(?, father_or_husband),
        gender = COALESCE(?, gender),
        dob = COALESCE(?, dob),
        cnic = COALESCE(?, cnic),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        risk_rating = COALESCE(?, risk_rating),
        status = COALESCE(?, status),
        kyc_status = COALESCE(?, kyc_status),
        branch_code = COALESCE(?, branch_code),
        source_of_funds = COALESCE(?, source_of_funds),
        occupation = COALESCE(?, occupation),
        is_pep = COALESCE(?, is_pep),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        b.full_name ?? null,
        b.father_or_husband ?? null,
        b.gender ?? null,
        b.dob ?? null,
        b.cnic ?? null,
        b.phone ?? null,
        b.email ?? null,
        b.address ?? null,
        b.city ?? null,
        b.risk_rating ?? null,
        b.status ?? null,
        b.kyc_status ?? null,
        b.branch_code ?? null,
        b.source_of_funds ?? null,
        b.occupation ?? null,
        b.is_pep == null ? null : b.is_pep ? 1 : 0,
        b.notes ?? null,
        req.params.id,
      ]
    );
    const [[row]] = await pool.query(`SELECT * FROM cbs_customers WHERE id = ?`, [req.params.id]);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
