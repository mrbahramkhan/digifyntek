const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  "ALTER TABLE cbs_customers ADD COLUMN cnic_front_path VARCHAR(255) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN cnic_back_path VARCHAR(255) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN business_name VARCHAR(160) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN business_ntn VARCHAR(30) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN business_reg_no VARCHAR(60) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN sales_tax_no VARCHAR(40) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN trade_body_membership VARCHAR(160) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN sole_prop_declaration TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_customers ADD COLUMN account_request_letterhead TINYINT(1) NULL DEFAULT 0",
  "ALTER TABLE cbs_customers ADD COLUMN sole_prop_declaration_text TEXT NULL",
  "ALTER TABLE cbs_customers ADD COLUMN sole_prop_declared_at DATE NULL",
  "ALTER TABLE cbs_customers ADD COLUMN sole_prop_declared_by VARCHAR(160) NULL",
  "ALTER TABLE cbs_customers ADD COLUMN nature_of_business VARCHAR(120) NULL",
];
let cddReady = false;
async function ensureCddColumns() {
  if (cddReady) return;
  for (const sql of CDD_ALTERS) {
    try { await pool.query(sql); } catch (_) {}
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cbs_customer_documents (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customer_id BIGINT UNSIGNED NOT NULL,
        doc_type VARCHAR(60) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        file_name VARCHAR(160) NULL,
        notes VARCHAR(255) NULL,
        uploaded_by VARCHAR(50) NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_cust_docs (customer_id),
        KEY idx_doc_type (doc_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (_) {}
  cddReady = true;
}




/** SBP-oriented CIF validation — returns error string or null */
function validateCifBody(b, { isUpdate } = {}) {
  const name = String(b.full_name || '').trim();
  if (!name || name.length < 3) return 'Full name required (min 3 characters, as per ID)';

  const type = String(b.customer_type || 'individual').toLowerCase();
  const natural = ['individual', 'sole_proprietorship', 'sole_prop'].includes(type) || type === '';

  if (natural) {
    const cnic = String(b.cnic || '').replace(/\D/g, '');
    if (!cnic) return 'CNIC / ID number required for natural person (SBP CDD)';
    if (cnic.length !== 13) return 'CNIC must be exactly 13 digits';
    if (!b.phone && !b.mobile) return 'Mobile number required for CDD contact';
    const mobile = String(b.phone || b.mobile || '').replace(/\D/g, '');
    if (mobile && mobile.length < 10) return 'Mobile number looks invalid (min 10 digits)';
    if (!b.father_or_husband && !b.father_name) return 'Father / husband name required (as per ID)';
    if (!b.dob && !b.date_of_birth) return 'Date of birth required';
    if (!b.address && !b.permanent_address) return 'Permanent address required';
    if (!b.source_of_funds) return 'Source of funds / income required (SBP CDD)';
    if (!b.occupation && type === 'individual') return 'Occupation required';
  }

  if (type === 'sole_proprietorship' || type === 'sole_prop') {
    if (!b.business_name) return 'Business / trade name required for sole proprietorship';
    if (!b.nature_of_business && !b.occupation) return 'Nature of business required';
    const hasBizProof =
      b.business_ntn ||
      b.business_reg_no ||
      b.sales_tax_no ||
      b.trade_body_membership ||
      b.sole_prop_declaration ||
      b.sole_prop_declaration_text;
    if (!hasBizProof) {
      return 'Sole prop: provide NTN/registration/trade body OR sole prop declaration (SBP business proof)';
    }
  }

  if (type === 'corporate' || type === 'company' || type === 'partnership') {
    if (!b.business_name && !b.full_name) return 'Entity / business name required';
    if (!b.beneficial_owner) return 'Beneficial owner identification required for entities';
  }

  // PEP → high risk
  const pep = b.is_pep === true || b.is_pep === 1 || b.is_pep === '1' || b.pep_flag;
  if (pep) {
    const risk = String(b.risk_rating || '').toLowerCase();
    if (risk === 'low') return 'PEP / related customer cannot be low risk — set medium or high (EDD)';
  }

  // High risk needs notes/EDD
  if (String(b.risk_rating || '').toLowerCase() === 'high') {
    if (!b.notes || String(b.notes).trim().length < 5) {
      return 'High-risk customer requires EDD notes / comments';
    }
  }

  // CNIC expiry if provided should not be long-expired for active verified KYC
  if (b.cnic_expiry && String(b.kyc_status || '').toLowerCase() === 'verified') {
    const exp = new Date(b.cnic_expiry);
    if (!isNaN(exp) && exp < new Date(Date.now() - 180 * 864e5)) {
      return 'CNIC expired — cannot mark KYC verified; renew or use NADRA token policy';
    }
  }

  return null;
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
    const verr = validateCifBody(b, { isUpdate: false });
    if (verr) return res.status(400).json({ error: verr });
    // PEP auto-bump risk
    if (b.is_pep === true || b.is_pep === 1 || b.is_pep === '1') {
      if (!b.risk_rating || b.risk_rating === 'low') b.risk_rating = 'high';
      if (!b.aml_risk || b.aml_risk === 'low') b.aml_risk = 'high';
    }
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
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    await applySolePropFields(ins.insertId, b);
    const [[row]] = await pool.query(`SELECT * FROM cbs_customers WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const verr = validateCifBody(b, { isUpdate: true });
    if (verr) return res.status(400).json({ error: verr });
    if (b.is_pep === true || b.is_pep === 1 || b.is_pep === '1') {
      if (!b.risk_rating || b.risk_rating === 'low') b.risk_rating = 'high';
      if (!b.aml_risk || b.aml_risk === 'low') b.aml_risk = 'high';
    }
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
    await applySolePropFields(req.params.id, b);
    const [[row]] = await pool.query(`SELECT * FROM cbs_customers WHERE id = ?`, [req.params.id]);
    res.json(row);
  } catch (e) {
    next(e);
  }
});



const UPLOAD_ROOT = path.join(__dirname, '../../uploads/cnic');

function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  } catch (_) {}
}

/** Accept data URL or raw base64; return relative URL path */
function saveCnicImage(customerId, side, data) {
  ensureUploadDir();
  if (!data || typeof data !== 'string') return null;
  let ext = 'jpg';
  let b64 = data;
  const m = data.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (m) {
    ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    b64 = m[2];
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100) throw Object.assign(new Error('Invalid image data'), { status: 400 });
  if (buf.length > 5 * 1024 * 1024) throw Object.assign(new Error('Image max 5MB'), { status: 400 });
  const name = `${customerId}_${side}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const full = path.join(UPLOAD_ROOT, name);
  fs.writeFileSync(full, buf);
  return `/uploads/cnic/${name}`;
}

/** Upload CNIC front + back photos */
router.post('/:id/cnic-photos', auth(), async (req, res, next) => {
  try {
    await ensureCddColumns();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'customer id required' });
    const [[cust]] = await pool.query(`SELECT id FROM cbs_customers WHERE id = ?`, [id]);
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    const b = req.body || {};
    const updates = {};
    if (b.front || b.cnic_front || b.front_base64) {
      updates.cnic_front_path = saveCnicImage(id, 'front', b.front || b.cnic_front || b.front_base64);
    }
    if (b.back || b.cnic_back || b.back_base64) {
      updates.cnic_back_path = saveCnicImage(id, 'back', b.back || b.cnic_back || b.back_base64);
    }
    if (!updates.cnic_front_path && !updates.cnic_back_path) {
      return res.status(400).json({ error: 'front and/or back image required (base64 or data URL)' });
    }
    if (updates.cnic_front_path) {
      await pool.query(`UPDATE cbs_customers SET cnic_front_path = ? WHERE id = ?`, [
        updates.cnic_front_path,
        id,
      ]);
    }
    if (updates.cnic_back_path) {
      await pool.query(`UPDATE cbs_customers SET cnic_back_path = ? WHERE id = ?`, [
        updates.cnic_back_path,
        id,
      ]);
    }
    const [[row]] = await pool.query(
      `SELECT id, customer_no, full_name, cnic, cnic_front_path, cnic_back_path FROM cbs_customers WHERE id = ?`,
      [id]
    );
    res.json({ ok: true, customer: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});




const DOC_TYPES = [
  'cnic_front', 'cnic_back',
  'id_copy',
  'business_registration',
  'ntn_certificate',
  'sales_tax_certificate',
  'trade_body_membership',
  'sole_prop_declaration',
  'account_request_letterhead',
  'source_of_funds',
  'other',
];

function saveCustomerDoc(customerId, docType, data, originalName) {
  ensureUploadDir();
  if (!data || typeof data !== 'string') return null;
  let ext = 'jpg';
  let b64 = data;
  const m = data.match(/^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,(.+)$/i);
  if (m) {
    if ((m[1] || '').includes('pdf')) ext = 'pdf';
    else ext = (m[2] || 'jpg').toLowerCase() === 'jpeg' ? 'jpg' : (m[2] || 'jpg').toLowerCase();
    b64 = m[3];
  } else if (originalName && originalName.toLowerCase().endsWith('.pdf')) {
    ext = 'pdf';
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 50) throw Object.assign(new Error('Invalid file data'), { status: 400 });
  if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('File max 8MB'), { status: 400 });
  const name = `${customerId}_${docType}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const full = path.join(UPLOAD_ROOT, name);
  fs.writeFileSync(full, buf);
  return { path: `/uploads/cnic/${name}`, fileName: originalName || name };
}

async function applySolePropFields(id, b) {
  if (!b || id == null) return;
  try {
    await pool.query(
      `UPDATE cbs_customers SET
        business_name = COALESCE(?, business_name),
        business_ntn = COALESCE(?, business_ntn),
        business_reg_no = COALESCE(?, business_reg_no),
        sales_tax_no = COALESCE(?, sales_tax_no),
        trade_body_membership = COALESCE(?, trade_body_membership),
        sole_prop_declaration = COALESCE(?, sole_prop_declaration),
        account_request_letterhead = COALESCE(?, account_request_letterhead),
        sole_prop_declaration_text = COALESCE(?, sole_prop_declaration_text),
        sole_prop_declared_at = COALESCE(?, sole_prop_declared_at),
        sole_prop_declared_by = COALESCE(?, sole_prop_declared_by)
       WHERE id = ?`,
      [
        b.business_name ?? null,
        b.business_ntn ?? b.ntn ?? null,
        b.business_reg_no ?? null,
        b.sales_tax_no ?? null,
        b.trade_body_membership ?? null,
        b.sole_prop_declaration == null ? null : b.sole_prop_declaration ? 1 : 0,
        b.account_request_letterhead == null ? null : b.account_request_letterhead ? 1 : 0,
        b.sole_prop_declaration_text ?? null,
        b.sole_prop_declared_at ?? null,
        b.sole_prop_declared_by ?? null,
        id,
      ]
    );
  } catch (_) {}
}

router.get('/:id/documents', auth(), async (req, res, next) => {
  try {
    await ensureCddColumns();
    const [rows] = await pool.query(
      `SELECT id, customer_id, doc_type, file_path, file_name, notes, uploaded_by, created_at
       FROM cbs_customer_documents WHERE customer_id = ? ORDER BY id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/documents', auth(), async (req, res, next) => {
  try {
    await ensureCddColumns();
    const id = Number(req.params.id);
    const [[cust]] = await pool.query(`SELECT id FROM cbs_customers WHERE id = ?`, [id]);
    if (!cust) return res.status(404).json({ error: 'Customer not found' });
    const b = req.body || {};
    const docType = String(b.doc_type || b.type || 'other').trim();
    if (!DOC_TYPES.includes(docType) && docType !== 'other') {
      // allow custom but keep short
    }
    const data = b.file || b.data || b.base64 || b.content;
    if (!data) return res.status(400).json({ error: 'file (base64/data URL) required' });
    const saved = saveCustomerDoc(id, docType.replace(/[^a-z0-9_]/gi, '_').slice(0, 40), data, b.file_name);
    const [ins] = await pool.query(
      `INSERT INTO cbs_customer_documents (customer_id, doc_type, file_path, file_name, notes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, docType, saved.path, saved.fileName, b.notes || null, req.user?.userId || null]
    );
    // mirror CNIC paths
    if (docType === 'cnic_front') {
      await pool.query(`UPDATE cbs_customers SET cnic_front_path = ? WHERE id = ?`, [saved.path, id]);
    }
    if (docType === 'cnic_back') {
      await pool.query(`UPDATE cbs_customers SET cnic_back_path = ? WHERE id = ?`, [saved.path, id]);
    }
    const [[row]] = await pool.query(`SELECT * FROM cbs_customer_documents WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.get('/doc-checklist/:customerType', auth(), async (req, res) => {
  const t = String(req.params.customerType || 'individual').toLowerCase();
  const individual = [
    { code: 'cnic_front', label: 'CNIC / ID front', required: true },
    { code: 'cnic_back', label: 'CNIC / ID back', required: true },
    { code: 'id_copy', label: 'ID copy (verified / original seen)', required: true },
    { code: 'source_of_funds', label: 'Source of funds proof (if applicable)', required: false },
  ];
  const sole = [
    ...individual,
    { code: 'business_registration', label: 'Business registration certificate (if registered)', required: false },
    { code: 'ntn_certificate', label: 'NTN / tax registration', required: false },
    { code: 'sales_tax_certificate', label: 'Sales tax registration (if applicable)', required: false },
    { code: 'trade_body_membership', label: 'Trade body / chamber membership', required: false },
    { code: 'sole_prop_declaration', label: 'Sole proprietorship declaration (letterhead)', required: true },
    { code: 'account_request_letterhead', label: 'Account opening request (letterhead)', required: true },
  ];
  const corporate = [
    ...individual,
    { code: 'business_registration', label: 'Incorporation / registration docs', required: true },
    { code: 'ntn_certificate', label: 'NTN', required: false },
    { code: 'other', label: 'Board resolution / signatory mandate', required: true },
  ];
  let items = individual;
  if (t.includes('sole') || t === 'sole_proprietorship' || t === 'sole_prop') items = sole;
  else if (t.includes('corp') || t === 'company' || t === 'partnership') items = corporate;
  res.json({
    customer_type: t,
    note: 'SBP Annex style: sole prop needs proprietor ID + at least one business proof; letterhead declaration commonly required by policy.',
    min_business_one_of: t.includes('sole')
      ? ['business_registration', 'ntn_certificate', 'sales_tax_certificate', 'trade_body_membership', 'sole_prop_declaration']
      : [],
    items,
  });
});


module.exports = router;
