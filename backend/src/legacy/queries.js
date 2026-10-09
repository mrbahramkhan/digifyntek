/**
 * Digital Kisaan (legacy) SQL helpers — maps real digitalkisaan tables
 * to DigiFyntek API response shapes.
 */
const pool = require('../config/db');

async function loginUser(userId) {
  const [rows] = await pool.query(
    `SELECT user_id, user_name, user_password, user_role, user_type, por_orgacode,
            user_homevac, user_locked, user_failed_attempts, user_email, user_mobileno
     FROM tbl_users WHERE user_id = :userId LIMIT 1`,
    { userId }
  );
  return rows[0] || null;
}

async function listFarmers({ orgCode, vacCode, q, limit = 200 }) {
  let sql = `
    SELECT f.farmer_no, f.por_orgacode, f.vac_code, f.farmer_name, f.farmer_cnic_no,
           f.farmer_contact_no, f.farmer_gender_code, f.farmer_birth_date, f.farmer_date,
           f.farmer_active, f.farmer_father_husband_name, f.farmer_occupationcode,
           f.farmer_education_code, v.vac_name
    FROM tbl_farmer f
    LEFT JOIN tbl_vacs v ON v.por_orgacode = f.por_orgacode AND v.vac_code = f.vac_code
    WHERE f.por_orgacode = :orgCode`;
  const params = { orgCode };
  if (vacCode) {
    sql += ` AND f.vac_code = :vacCode`;
    params.vacCode = vacCode;
  }
  if (q) {
    sql += ` AND (f.farmer_name LIKE :q OR f.farmer_cnic_no LIKE :q OR f.farmer_no LIKE :q)`;
    params.q = `%${q}%`;
  }
  sql += ` ORDER BY f.farmer_name LIMIT ${Number(limit) || 200}`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    id: r.farmer_no,
    member_code: r.farmer_no,
    full_name: r.farmer_name,
    cnic: r.farmer_cnic_no,
    phone: r.farmer_contact_no,
    gender: r.farmer_gender_code,
    is_farmer: true,
    status: r.farmer_active ? 'active' : 'inactive',
    vac_code: r.vac_code,
    vac_name: r.vac_name,
    org_code: r.por_orgacode,
    joined_at: r.farmer_date,
    father_name: r.farmer_father_husband_name,
  }));
}

async function farmer360(farmerNo, orgCode) {
  const [farmers] = await pool.query(
    `SELECT * FROM tbl_farmer WHERE farmer_no = :farmerNo AND por_orgacode = :orgCode LIMIT 1`,
    { farmerNo, orgCode }
  );
  if (!farmers.length) return null;
  const f = farmers[0];
  const [loans] = await pool.query(
    `SELECT account_no, account_balance, loan_disbursementamount, loan_disbursementdate,
            loan_maturitydate, loan_interestrate, account_closed, product_code, vac_code
     FROM tbl_loanaccount
     WHERE farmer_no = :farmerNo AND por_orgacode = :orgCode`,
    { farmerNo, orgCode }
  );
  const [shares] = await pool.query(
    `SELECT farmer_share_held, farmer_share_value, farmer_total_share_value
     FROM tbl_farmer_share WHERE farmer_no = :farmerNo AND por_orgacode = :orgCode`,
    { farmerNo, orgCode }
  );
  const [deposits] = await pool.query(
    `SELECT account_no, account_balance, account_opendate, account_closed, product_code
     FROM tbl_depositaccount WHERE farmer_no = :farmerNo AND por_orgacode = :orgCode`,
    { farmerNo, orgCode }
  );
  return {
    member: {
      id: f.farmer_no,
      member_code: f.farmer_no,
      full_name: f.farmer_name,
      cnic: f.farmer_cnic_no,
      phone: f.farmer_contact_no,
      is_farmer: true,
      status: f.farmer_active ? 'active' : 'inactive',
      vac_code: f.vac_code,
    },
    loans: loans.map((l) => ({
      loan_number: l.account_no,
      outstanding: Number(l.account_balance),
      principal: Number(l.loan_disbursementamount),
      disbursed_at: l.loan_disbursementdate,
      maturity_at: l.loan_maturitydate,
      status: l.account_closed ? 'closed' : 'active',
      product_code: l.product_code,
    })),
    shares,
    deposits: deposits.map((d) => ({
      account_no: d.account_no,
      balance: Number(d.account_balance),
      opened_at: d.account_opendate,
      status: d.account_closed ? 'closed' : 'active',
    })),
  };
}

async function listLoans({ orgCode, vacCode, limit = 200 }) {
  let sql = `
    SELECT la.account_no, la.farmer_no, la.vac_code, la.product_code,
           la.account_balance, la.loan_disbursementamount, la.loan_disbursementdate,
           la.loan_maturitydate, la.loan_interestrate, la.loan_totalinterest,
           la.account_closed, la.account_opendate, f.farmer_name, f.farmer_cnic_no
    FROM tbl_loanaccount la
    LEFT JOIN tbl_farmer f ON f.farmer_no = la.farmer_no AND f.por_orgacode = la.por_orgacode
    WHERE la.por_orgacode = :orgCode`;
  const params = { orgCode };
  if (vacCode) {
    sql += ` AND la.vac_code = :vacCode`;
    params.vacCode = vacCode;
  }
  sql += ` ORDER BY la.loan_disbursementdate DESC LIMIT ${Number(limit) || 200}`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => {
    const outstanding = Number(r.account_balance);
    const closed = !!r.account_closed;
    return {
      id: r.account_no,
      loan_number: r.account_no,
      member_id: r.farmer_no,
      full_name: r.farmer_name,
      cnic: r.farmer_cnic_no,
      principal: Number(r.loan_disbursementamount),
      outstanding,
      profit_or_interest: Number(r.loan_totalinterest || 0),
      interest_rate: Number(r.loan_interestrate || 0),
      disbursed_at: r.loan_disbursementdate,
      maturity_at: r.loan_maturitydate,
      status: closed ? 'closed' : outstanding > 0 ? 'active' : 'settled',
      classification: closed ? 'closed' : outstanding > 0 ? 'performing' : 'settled',
      days_past_due: 0,
      par_bucket: outstanding > 0 ? 'current' : 'none',
      mcl_ok: true,
      vac_code: r.vac_code,
      product_code: r.product_code,
    };
  });
}

async function portfolio({ orgCode, vacCode }) {
  let sql = `
    SELECT
      COUNT(*) AS accounts,
      COALESCE(SUM(loan_disbursementamount),0) AS disbursed,
      COALESCE(SUM(CASE WHEN account_closed=0 THEN account_balance ELSE 0 END),0) AS outstanding,
      COALESCE(SUM(CASE WHEN account_closed=0 AND account_balance>0 THEN 1 ELSE 0 END),0) AS active_loans
    FROM tbl_loanaccount WHERE por_orgacode = :orgCode`;
  const params = { orgCode };
  if (vacCode) {
    sql += ` AND vac_code = :vacCode`;
    params.vacCode = vacCode;
  }
  const [[row]] = await pool.query(sql, params);
  return row;
}

async function listShares({ orgCode }) {
  const [rows] = await pool.query(
    `SELECT s.farmer_no, s.farmer_share_held, s.farmer_share_value, s.farmer_total_share_value,
            f.farmer_name, f.farmer_cnic_no
     FROM tbl_farmer_share s
     LEFT JOIN tbl_farmer f ON f.farmer_no = s.farmer_no AND f.por_orgacode = s.por_orgacode
     WHERE s.por_orgacode = :orgCode
     ORDER BY s.farmer_total_share_value DESC LIMIT 500`,
    { orgCode }
  );
  return rows.map((r) => ({
    folio_no: r.farmer_no,
    member_id: r.farmer_no,
    full_name: r.farmer_name,
    cnic: r.farmer_cnic_no,
    shares: r.farmer_share_held,
    face_value: Number(r.farmer_share_value),
    capital: Number(r.farmer_total_share_value),
    status: 'active',
  }));
}

async function shareSummary({ orgCode }) {
  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS folios,
            COALESCE(SUM(farmer_share_held),0) AS total_shares,
            COALESCE(SUM(farmer_total_share_value),0) AS capital
     FROM tbl_farmer_share WHERE por_orgacode = :orgCode`,
    { orgCode }
  );
  return s;
}

async function listDeposits({ orgCode }) {
  const [rows] = await pool.query(
    `SELECT d.account_no, d.farmer_no, d.account_balance, d.account_opendate, d.account_closed,
            d.product_code, d.deposit_type, f.farmer_name
     FROM tbl_depositaccount d
     LEFT JOIN tbl_farmer f ON f.farmer_no = d.farmer_no AND f.por_orgacode = d.por_orgacode
     WHERE d.por_orgacode = :orgCode
     ORDER BY d.account_opendate DESC LIMIT 500`,
    { orgCode }
  );
  return rows.map((r) => ({
    id: r.account_no,
    account_no: r.account_no,
    member_id: r.farmer_no,
    full_name: r.farmer_name,
    balance: Number(r.account_balance),
    mode: r.deposit_type || 'conventional',
    status: r.account_closed ? 'closed' : 'active',
    opened_at: r.account_opendate,
  }));
}

async function listVacs({ orgCode }) {
  const [rows] = await pool.query(
    `SELECT vac_code, vac_name, vac_active, vac_reg_no, vac_district_code, vac_phone_no, vac_address
     FROM tbl_vacs WHERE por_orgacode = :orgCode ORDER BY vac_name`,
    { orgCode }
  );
  return rows;
}

async function dashboardKpis({ orgCode }) {
  const [[farmers]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_farmer WHERE por_orgacode=:orgCode AND farmer_active=1`,
    { orgCode }
  );
  const [[loans]] = await pool.query(
    `SELECT COUNT(*) AS active_loans,
            COALESCE(SUM(account_balance),0) AS outstanding
     FROM tbl_loanaccount WHERE por_orgacode=:orgCode AND account_closed=0 AND account_balance>0`,
    { orgCode }
  );
  const [[shares]] = await pool.query(
    `SELECT COALESCE(SUM(farmer_total_share_value),0) AS capital FROM tbl_farmer_share WHERE por_orgacode=:orgCode`,
    { orgCode }
  );
  const [[vacs]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_vacs WHERE por_orgacode=:orgCode AND vac_active=1`,
    { orgCode }
  );
  const [[deposits]] = await pool.query(
    `SELECT COALESCE(SUM(account_balance),0) AS bal FROM tbl_depositaccount WHERE por_orgacode=:orgCode AND account_closed=0`,
    { orgCode }
  );
  return {
    membersActive: farmers.c,
    membersTotal: farmers.c,
    activeLoans: loans.active_loans,
    portfolioOutstanding: Number(loans.outstanding),
    par30: 0,
    par90: 0,
    shareCapital: Number(shares.capital),
    vacsActive: vacs.c,
    savingsBalance: Number(deposits.bal),
    nplCount: 0,
  };
}

async function listGuarantors({ orgCode }) {
  const [rows] = await pool.query(
    `SELECT g.account_no, g.loan_guarantornic, g.loan_guarantorname, g.phone_no, g.por_orgacode
     FROM tbl_loanguarantor g
     WHERE g.por_orgacode = :orgCode
     LIMIT 500`,
    { orgCode }
  );
  return rows.map((r) => ({
    guarantee_code: r.loan_guarantornic,
    guarantor_name: r.loan_guarantorname,
    loan_number: r.account_no,
    phone: r.phone_no,
    status: 'active',
  }));
}

module.exports = {
  loginUser,
  listFarmers,
  farmer360,
  listLoans,
  portfolio,
  listShares,
  shareSummary,
  listDeposits,
  listVacs,
  dashboardKpis,
  listGuarantors,
};
