/**
 * Basic Core Banking queries against digitalkisaan / digifyntek legacy schema
 */
const pool = require('../config/db');

function org(reqOrCode) {
  if (typeof reqOrCode === 'string') return reqOrCode;
  return reqOrCode.orgCode || reqOrCode.orgId || '001';
}

async function chartOfAccounts(orgCode) {
  const [rows] = await pool.query(
    `SELECT gl_code, gl_desc, gl_accountlevel, gl_accountnature, gl_accounttype,
            gl_active, gl_debitstop, gl_creditstop, gl_drcrallowed
     FROM tbl_coa
     WHERE por_orgacode = :orgCode
     ORDER BY gl_code
     LIMIT 2000`,
    { orgCode }
  );
  return rows.map((r) => ({
    gl_code: r.gl_code,
    name: r.gl_desc,
    level: r.gl_accountlevel,
    nature: r.gl_accountnature,
    type: r.gl_accounttype,
    active: !!r.gl_active,
    debit_stop: !!r.gl_debitstop,
    credit_stop: !!r.gl_creditstop,
  }));
}

async function glBalances(orgCode, vacCode) {
  let sql = `
    SELECT g.gl_code, c.gl_desc, g.vac_code, g.balance_date,
           g.debit_amount, g.credit_amount, g.opening_balance,
           (g.debit_amount - g.credit_amount) AS net_balance
    FROM tbl_glbalances g
    LEFT JOIN tbl_coa c ON c.gl_code = g.gl_code AND c.por_orgacode = g.por_orgacode
    WHERE g.por_orgacode = :orgCode`;
  const params = { orgCode };
  if (vacCode) {
    sql += ` AND g.vac_code = :vacCode`;
    params.vacCode = vacCode;
  }
  sql += ` ORDER BY g.gl_code LIMIT 2000`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    gl_code: r.gl_code,
    name: r.gl_desc,
    vac_code: r.vac_code,
    balance_date: r.balance_date,
    debit: Number(r.debit_amount),
    credit: Number(r.credit_amount),
    net: Number(r.net_balance),
    is_opening: !!r.opening_balance,
  }));
}

async function depositProducts(orgCode) {
  const [rows] = await pool.query(
    `SELECT product_code, product_desc, product_gl, deposit_type, product_active
     FROM tbl_depositproduct WHERE por_orgacode = :orgCode ORDER BY product_code`,
    { orgCode }
  );
  return rows.map((r) => ({
    code: r.product_code,
    name: r.product_desc,
    gl: r.product_gl,
    type: r.deposit_type,
    active: !!r.product_active,
  }));
}

async function loanProducts(orgCode) {
  const [rows] = await pool.query(
    `SELECT product_code, product_desc, product_gl, loan_minamt, loan_maxamt,
            loan_tenure, loan_type, product_active
     FROM tbl_loanproduct WHERE por_orgacode = :orgCode ORDER BY product_code`,
    { orgCode }
  );
  return rows.map((r) => ({
    code: r.product_code,
    name: r.product_desc,
    gl: r.product_gl,
    min_amount: Number(r.loan_minamt),
    max_amount: Number(r.loan_maxamt),
    tenure_months: r.loan_tenure,
    type: r.loan_type,
    active: !!r.product_active,
  }));
}

async function transactionTypes(orgCode) {
  const [rows] = await pool.query(
    `SELECT tran_code, tran_desc FROM pr_transactiontype
     WHERE por_orgacode = :orgCode ORDER BY tran_code`,
    { orgCode }
  );
  return rows;
}

/** Account statement from general + master transactions */
async function accountStatement({ orgCode, accountNo, limit = 100 }) {
  const [rows] = await pool.query(
    `SELECT mt.tran_date, mt.tran_number, mt.tran_narration, mt.payment_mode,
            mt.tran_authorized, mt.tran_posted, mt.tran_cancelled,
            gt.tran_subnumber, gt.tran_code, gt.tran_amount, gt.tran_debitcredit,
            gt.gl_code, gt.chrg_code, gt.product_code
     FROM tbl_generaltransaction gt
     INNER JOIN tbl_mastertransaction mt
       ON mt.por_orgacode = gt.por_orgacode
      AND mt.tran_number = gt.tran_number
      AND mt.vac_code = gt.vac_code
     WHERE gt.por_orgacode = :orgCode AND gt.account_no = :accountNo
     ORDER BY mt.tran_date DESC, mt.tran_number DESC, gt.tran_subnumber
     LIMIT ${Number(limit) || 100}`,
    { orgCode, accountNo }
  );
  return rows.map((r) => ({
    date: r.tran_date,
    tran_number: r.tran_number,
    narration: r.tran_narration,
    payment_mode: r.payment_mode,
    code: r.tran_code,
    amount: Number(r.tran_amount),
    dr_cr: r.tran_debitcredit,
    gl_code: r.gl_code,
    authorized: !!r.tran_authorized,
    posted: !!r.tran_posted,
    cancelled: !!r.tran_cancelled,
  }));
}

async function recentTransactions({ orgCode, vacCode, limit = 50 }) {
  let sql = `
    SELECT mt.tran_date, mt.tran_number, mt.vac_code, mt.tran_narration,
           mt.payment_mode, mt.tran_authorized, mt.tran_posted,
           SUM(CASE WHEN gt.tran_debitcredit IN ('D','DR','debit') THEN gt.tran_amount ELSE 0 END) AS debit_total,
           SUM(CASE WHEN gt.tran_debitcredit IN ('C','CR','credit') THEN gt.tran_amount ELSE 0 END) AS credit_total
    FROM tbl_mastertransaction mt
    LEFT JOIN tbl_generaltransaction gt
      ON gt.por_orgacode = mt.por_orgacode AND gt.tran_number = mt.tran_number AND gt.vac_code = mt.vac_code
    WHERE mt.por_orgacode = :orgCode AND mt.tran_cancelled = 0`;
  const params = { orgCode };
  if (vacCode) {
    sql += ` AND mt.vac_code = :vacCode`;
    params.vacCode = vacCode;
  }
  sql += `
    GROUP BY mt.tran_date, mt.tran_number, mt.vac_code, mt.tran_narration,
             mt.payment_mode, mt.tran_authorized, mt.tran_posted
    ORDER BY mt.tran_date DESC, mt.tran_number DESC
    LIMIT ${Number(limit) || 50}`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    date: r.tran_date,
    tran_number: r.tran_number,
    vac_code: r.vac_code,
    narration: r.tran_narration,
    payment_mode: r.payment_mode,
    debit: Number(r.debit_total || 0),
    credit: Number(r.credit_total || 0),
    authorized: !!r.tran_authorized,
    posted: !!r.tran_posted,
  }));
}

async function coreSummary(orgCode) {
  const [[coa]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_coa WHERE por_orgacode=:o AND (gl_active=1 OR gl_active IS NULL)`,
    { o: orgCode }
  );
  const [[dep]] = await pool.query(
    `SELECT COUNT(*) AS accounts, COALESCE(SUM(account_balance),0) AS balance
     FROM tbl_depositaccount WHERE por_orgacode=:o AND account_closed=0`,
    { o: orgCode }
  );
  const [[loan]] = await pool.query(
    `SELECT COUNT(*) AS accounts, COALESCE(SUM(account_balance),0) AS balance
     FROM tbl_loanaccount WHERE por_orgacode=:o AND account_closed=0`,
    { o: orgCode }
  );
  const [[txn]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_mastertransaction
     WHERE por_orgacode=:o AND tran_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    { o: orgCode }
  );
  return {
    gl_accounts: coa.c,
    deposit_accounts: dep.accounts,
    deposit_balance: Number(dep.balance),
    loan_accounts: loan.accounts,
    loan_outstanding: Number(loan.balance),
    txns_30d: txn.c,
  };
}

module.exports = {
  chartOfAccounts,
  glBalances,
  depositProducts,
  loanProducts,
  transactionTypes,
  accountStatement,
  recentTransactions,
  coreSummary,
};
