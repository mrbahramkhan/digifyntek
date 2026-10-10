const pool = require('../config/db');
const crypto = require('crypto');

function org(req) {
  return String(req.user?.orgCode || req.user?.orgId || '001');
}

async function ensure() {
  // lightweight: products/controls already in SQL; ignore errors
}

function txnId() {
  return 'TXN' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

function cifNo() {
  return 'CIF' + Date.now().toString().slice(-10);
}

async function summary(orgCode) {
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS customers FROM cbs_customers WHERE por_orgacode=:o AND status='active'`,
    { o: orgCode }
  ).catch(() => [[{ customers: 0 }]]);
  const [[a]] = await pool.query(
    `SELECT COUNT(*) AS accounts, COALESCE(SUM(balance),0) AS deposits
     FROM cbs_accounts WHERE por_orgacode=:o AND status='active' AND account_type IN ('savings','current','term')`,
    { o: orgCode }
  ).catch(() => [[{ accounts: 0, deposits: 0 }]]);
  const [[l]] = await pool.query(
    `SELECT COUNT(*) AS loans, COALESCE(SUM(balance),0) AS outstanding
     FROM cbs_accounts WHERE por_orgacode=:o AND status='active' AND account_type IN ('loan','islamic')`,
    { o: orgCode }
  ).catch(() => [[{ loans: 0, outstanding: 0 }]]);
  const [[t]] = await pool.query(
    `SELECT COUNT(*) AS txns FROM cbs_transactions WHERE por_orgacode=:o AND txn_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    { o: orgCode }
  ).catch(() => [[{ txns: 0 }]]);
  return {
    customers: c.customers || 0,
    accounts: a.accounts || 0,
    deposit_balance: Number(a.deposits || 0),
    loans: l.loans || 0,
    loan_outstanding: Number(l.outstanding || 0),
    txns_7d: t.txns || 0,
  };
}

async function listCustomers(orgCode, q) {
  let sql = `SELECT * FROM cbs_customers WHERE por_orgacode=:o`;
  const p = { o: orgCode };
  if (q) {
    sql += ` AND (full_name LIKE :q OR cnic LIKE :q OR cif_no LIKE :q OR member_ref LIKE :q)`;
    p.q = `%${q}%`;
  }
  sql += ` ORDER BY id DESC LIMIT 200`;
  const [rows] = await pool.query(sql, p);
  return rows;
}

async function createCustomer(orgCode, body, userId) {
  const cif = body.cif_no || cifNo();
  const [r] = await pool.query(
    `INSERT INTO cbs_customers
      (por_orgacode, cif_no, member_ref, full_name, father_name, cnic, cnic_expiry, dob, gender,
       mobile, email, address, branch_code, kyc_status, aml_risk, pep_flag, status)
     VALUES
      (:o, :cif, :mref, :name, :father, :cnic, :cexp, :dob, :gender, :mobile, :email, :addr, :br, :kyc, :aml, :pep, 'active')`,
    {
      o: orgCode,
      cif,
      mref: body.member_ref || null,
      name: body.full_name,
      father: body.father_name || null,
      cnic: body.cnic || null,
      cexp: body.cnic_expiry || null,
      dob: body.dob || null,
      gender: body.gender || null,
      mobile: body.mobile || null,
      email: body.email || null,
      addr: body.address || null,
      br: body.branch_code || null,
      kyc: body.kyc_status || 'pending',
      aml: body.aml_risk || 'low',
      pep: body.pep_flag ? 1 : 0,
    }
  );
  return { id: r.insertId, cif_no: cif };
}

async function listAccounts(orgCode, q) {
  let sql = `SELECT * FROM cbs_accounts WHERE por_orgacode=:o`;
  const p = { o: orgCode };
  if (q) {
    sql += ` AND (account_no LIKE :q OR cif_no LIKE :q)`;
    p.q = `%${q}%`;
  }
  sql += ` ORDER BY id DESC LIMIT 200`;
  const [rows] = await pool.query(sql, p);
  return rows;
}

async function openAccount(orgCode, body) {
  const accNo = body.account_no || `A${Date.now().toString().slice(-10)}`;
  const [r] = await pool.query(
    `INSERT INTO cbs_accounts
      (por_orgacode, account_no, cif_no, product_code, account_type, branch_code, currency,
       balance, available_balance, status, open_date, legacy_ref)
     VALUES
      (:o, :acc, :cif, :prod, :atype, :br, 'PKR', 0, 0, 'active', :od, :leg)`,
    {
      o: orgCode,
      acc: accNo,
      cif: body.cif_no,
      prod: body.product_code,
      atype: body.account_type || 'savings',
      br: body.branch_code || null,
      od: body.open_date || new Date().toISOString().slice(0, 10),
      leg: body.legacy_ref || null,
    }
  );
  return { id: r.insertId, account_no: accNo };
}

async function postTransfer(orgCode, body, userId) {
  const amount = Number(body.amount);
  if (!(amount > 0)) {
    const e = new Error('amount must be > 0');
    e.status = 400;
    throw e;
  }
  if (!body.debit_account || !body.credit_account) {
    const e = new Error('debit_account and credit_account required');
    e.status = 400;
    throw e;
  }
  const id = body.txn_id || txnId();
  const date = body.txn_date || new Date().toISOString().slice(0, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[deb]] = await conn.query(
      `SELECT * FROM cbs_accounts WHERE por_orgacode=:o AND account_no=:a FOR UPDATE`,
      { o: orgCode, a: body.debit_account }
    );
    const [[cre]] = await conn.query(
      `SELECT * FROM cbs_accounts WHERE por_orgacode=:o AND account_no=:a FOR UPDATE`,
      { o: orgCode, a: body.credit_account }
    );
    if (!deb || !cre) {
      const e = new Error('Account not found');
      e.status = 404;
      throw e;
    }
    if (deb.status !== 'active' || cre.status !== 'active') {
      const e = new Error('Both accounts must be active');
      e.status = 400;
      throw e;
    }
    if (Number(deb.available_balance) < amount && deb.account_type !== 'loan') {
      const e = new Error('Insufficient available balance');
      e.status = 400;
      throw e;
    }
    await conn.query(
      `UPDATE cbs_accounts SET balance = balance - :amt, available_balance = available_balance - :amt
       WHERE id = :id`,
      { amt: amount, id: deb.id }
    );
    await conn.query(
      `UPDATE cbs_accounts SET balance = balance + :amt, available_balance = available_balance + :amt
       WHERE id = :id`,
      { amt: amount, id: cre.id }
    );
    await conn.query(
      `INSERT INTO cbs_transactions
        (por_orgacode, txn_id, txn_date, value_date, branch_code, channel, txn_type,
         debit_account, credit_account, amount, currency, narration, status, external_ref, created_by)
       VALUES
        (:o, :tid, :td, :vd, :br, :ch, :tt, :da, :ca, :amt, 'PKR', :narr, 'posted', :xref, :by)`,
      {
        o: orgCode,
        tid: id,
        td: date,
        vd: body.value_date || date,
        br: body.branch_code || deb.branch_code,
        ch: body.channel || 'branch',
        tt: body.txn_type || 'TRANSFER',
        da: body.debit_account,
        ca: body.credit_account,
        amt: amount,
        narr: body.narration || 'Customer transfer',
        xref: body.external_ref || null,
        by: String(userId || '').slice(0, 50),
      }
    );
    await conn.commit();
    return { txn_id: id, status: 'posted', amount };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function listTxns(orgCode, limit = 100) {
  const [rows] = await pool.query(
    `SELECT * FROM cbs_transactions WHERE por_orgacode=:o ORDER BY id DESC LIMIT ${Number(limit) || 100}`,
    { o: orgCode }
  );
  return rows;
}

async function products(orgCode) {
  const [rows] = await pool.query(
    `SELECT * FROM cbs_products WHERE por_orgacode=:o AND active=1 ORDER BY product_code`,
    { o: orgCode }
  );
  return rows;
}

async function integrations(orgCode) {
  const [rows] = await pool.query(
    `SELECT id, code, name, category, base_url, auth_type, status, last_health_at
     FROM cbs_integrations WHERE por_orgacode=:o ORDER BY category, code`,
    { o: orgCode }
  );
  return rows;
}

async function sbpControls() {
  const [rows] = await pool.query(`SELECT * FROM cbs_sbp_controls ORDER BY category, control_code`);
  return rows;
}

async function updateSbpControl(code, status, note) {
  await pool.query(
    `UPDATE cbs_sbp_controls SET status=:s, evidence_note=COALESCE(:n, evidence_note) WHERE control_code=:c`,
    { s: status, n: note || null, c: code }
  );
  return { ok: true };
}

/** Bridge: import legacy farmer as CIF (optional) */
async function importLegacyFarmer(orgCode, farmerNo) {
  const [[f]] = await pool.query(
    `SELECT * FROM tbl_farmer WHERE por_orgacode=:o AND farmer_no=:f LIMIT 1`,
    { o: orgCode, f: farmerNo }
  );
  if (!f) {
    const e = new Error('Legacy farmer not found');
    e.status = 404;
    throw e;
  }
  return createCustomer(orgCode, {
    member_ref: f.farmer_no,
    full_name: f.farmer_name,
    father_name: f.farmer_father_husband_name,
    cnic: f.farmer_cnic_no,
    dob: f.farmer_birth_date,
    mobile: f.farmer_contact_no,
    branch_code: f.vac_code,
    kyc_status: 'verified',
  });
}

module.exports = {
  org,
  summary,
  listCustomers,
  createCustomer,
  listAccounts,
  openAccount,
  postTransfer,
  listTxns,
  products,
  integrations,
  sbpControls,
  updateSbpControl,
  importLegacyFarmer,
};
