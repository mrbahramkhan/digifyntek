const express = require('express');
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const { ref, audit } = require('../ledger/service');
const router = express.Router();

const CDD_ALTERS = [
  "ALTER TABLE cbs_customers ADD COLUMN mother_name VARCHAR(150) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN nationality VARCHAR(60) NULL DEFAULT 'Pakistani'",
  "ALTER TABLE cbs_customers ADD COLUMN marital_status VARCHAR(30) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN place_of_birth VARCHAR(80) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN cnic_issue DATE NULL",
  "ALTER TABLE cbs_customers ADD COLUMN present_address TEXT NULL",
  "ALTER TABLE cbs_customers ADD COLUMN province VARCHAR(60) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN country VARCHAR(60) NULL DEFAULT 'Pakistan'",
  "ALTER TABLE cbs_customers ADD COLUMN landline VARCHAR(30) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN nature_of_business VARCHAR(120) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN employer_name VARCHAR(120) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN monthly_income DECIMAL(18,2) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN expected_turnover DECIMAL(18,2) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN purpose_of_account VARCHAR(160) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN ntn VARCHAR(30) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN tax_resident TINYINT(1) NULL DEFAULT 1",
  "ALTER TABLE cbs_customers ADD COLUMN next_of_kin_name VARCHAR(150) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN next_of_kin_relation VARCHAR(60) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN next_of_kin_phone VARCHAR(30) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN beneficial_owner VARCHAR(160) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN id_type VARCHAR(30) NULL DEFAULT 'CNIC'",
];
let cddReady = false;
async function ensureCddColumns() {
  if (cddReady) return;
  for (const sql of CDD_ALTERS) {
    try { await pool.query(sql); } catch (_) {}
  }
  cddReady = true;
}



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
    await ensureCddColumns();
    const [ins] = await pool.query(
      `INSERT INTO cbs_customers
        (customer_no, cif_no, customer_type, full_name, father_or_husband, father_name, mother_name, gender, dob, place_of_birth,
         cnic, id_type, cnic_issue, cnic_expiry, phone, mobile, landline, email,
         address, present_address, city, province, country, branch_code,
         risk_rating, aml_risk, status, kyc_status, source_of_funds, occupation, nature_of_business, employer_name,
         monthly_income, expected_turnover, purpose_of_account, ntn, tax_resident, is_pep, pep_flag,
         next_of_kin_name, next_of_kin_relation, next_of_kin_phone, beneficial_owner, notes, created_by, nationality, marital_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        customerNo, customerNo,
        b.customer_type || 'individual',
        b.full_name,
        b.father_or_husband || b.father_name || null,
        b.father_name || b.father_or_husband || null,
        b.mother_name || null,
        b.gender || null,
        b.dob || null,
        b.place_of_birth || null,
        b.cnic || null,
        b.id_type || 'CNIC',
        b.cnic_issue || null,
        b.cnic_expiry || null,
        b.phone || b.mobile || null,
        b.mobile || b.phone || null,
        b.landline || null,
        b.email || null,
        b.address || b.permanent_address || null,
        b.present_address || null,
        b.city || null,
        b.province || null,
        b.country || 'Pakistan',
        b.branch_code || null,
        b.risk_rating || 'low',
        b.aml_risk || b.risk_rating || 'low',
        b.status || 'active',
        b.kyc_status || 'pending',
        b.source_of_funds || null,
        b.occupation || null,
        b.nature_of_business || null,
        b.employer_name || null,
        b.monthly_income != null ? Number(b.monthly_income) : null,
        b.expected_turnover != null ? Number(b.expected_turnover) : null,
        b.purpose_of_account || null,
        b.ntn || null,
        b.tax_resident == null ? 1 : (b.tax_resident ? 1 : 0),
        b.is_pep ? 1 : 0,
        b.is_pep ? 1 : 0,
        b.next_of_kin_name || null,
        b.next_of_kin_relation || null,
        b.next_of_kin_phone || null,
        b.beneficial_owner || null,
        b.notes || null,
        actor(req),
        b.nationality || 'Pakistani',
        b.marital_status || null,
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
    await ensureCddColumns();
    await pool.query(
      `UPDATE cbs_customers SET
        full_name = COALESCE(?, full_name),
        father_or_husband = COALESCE(?, father_or_husband),
        father_name = COALESCE(?, father_name),
        mother_name = COALESCE(?, mother_name),
        gender = COALESCE(?, gender),
        dob = COALESCE(?, dob),
        place_of_birth = COALESCE(?, place_of_birth),
        cnic = COALESCE(?, cnic),
        id_type = COALESCE(?, id_type),
        cnic_issue = COALESCE(?, cnic_issue),
        cnic_expiry = COALESCE(?, cnic_expiry),
        phone = COALESCE(?, phone),
        mobile = COALESCE(?, mobile),
        landline = COALESCE(?, landline),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        present_address = COALESCE(?, present_address),
        city = COALESCE(?, city),
        province = COALESCE(?, province),
        country = COALESCE(?, country),
        nationality = COALESCE(?, nationality),
        marital_status = COALESCE(?, marital_status),
        risk_rating = COALESCE(?, risk_rating),
        aml_risk = COALESCE(?, aml_risk),
        status = COALESCE(?, status),
        kyc_status = COALESCE(?, kyc_status),
        branch_code = COALESCE(?, branch_code),
        source_of_funds = COALESCE(?, source_of_funds),
        occupation = COALESCE(?, occupation),
        nature_of_business = COALESCE(?, nature_of_business),
        employer_name = COALESCE(?, employer_name),
        monthly_income = COALESCE(?, monthly_income),
        expected_turnover = COALESCE(?, expected_turnover),
        purpose_of_account = COALESCE(?, purpose_of_account),
        ntn = COALESCE(?, ntn),
        tax_resident = COALESCE(?, tax_resident),
        is_pep = COALESCE(?, is_pep),
        pep_flag = COALESCE(?, pep_flag),
        next_of_kin_name = COALESCE(?, next_of_kin_name),
        next_of_kin_relation = COALESCE(?, next_of_kin_relation),
        next_of_kin_phone = COALESCE(?, next_of_kin_phone),
        beneficial_owner = COALESCE(?, beneficial_owner),
        notes = COALESCE(?, notes),
        customer_type = COALESCE(?, customer_type)
       WHERE id = ?`,
      [
        b.full_name ?? null,
        b.father_or_husband ?? b.father_name ?? null,
        b.father_name ?? b.father_or_husband ?? null,
        b.mother_name ?? null,
        b.gender ?? null,
        b.dob ?? null,
        b.place_of_birth ?? null,
        b.cnic ?? null,
        b.id_type ?? null,
        b.cnic_issue ?? null,
        b.cnic_expiry ?? null,
        b.phone ?? b.mobile ?? null,
        b.mobile ?? b.phone ?? null,
        b.landline ?? null,
        b.email ?? null,
        b.address ?? b.permanent_address ?? null,
        b.present_address ?? null,
        b.city ?? null,
        b.province ?? null,
        b.country ?? null,
        b.nationality ?? null,
        b.marital_status ?? null,
        b.risk_rating ?? null,
        b.aml_risk ?? b.risk_rating ?? null,
        b.status ?? null,
        b.kyc_status ?? null,
        b.branch_code ?? null,
        b.source_of_funds ?? null,
        b.occupation ?? null,
        b.nature_of_business ?? null,
        b.employer_name ?? null,
        b.monthly_income != null ? Number(b.monthly_income) : null,
        b.expected_turnover != null ? Number(b.expected_turnover) : null,
        b.purpose_of_account ?? null,
        b.ntn ?? null,
        b.tax_resident == null ? null : (b.tax_resident ? 1 : 0),
        b.is_pep == null ? null : b.is_pep ? 1 : 0,
        b.is_pep == null ? null : b.is_pep ? 1 : 0,
        b.next_of_kin_name ?? null,
        b.next_of_kin_relation ?? null,
        b.next_of_kin_phone ?? null,
        b.beneficial_owner ?? null,
        b.notes ?? null,
        b.customer_type ?? null,
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
