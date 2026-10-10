/**
 * MFB prudential toolkit — SBP PR-aligned (general loan bands as default)
 * OAEM 30-59, Substandard 60-89, Doubtful 90-179, Loss 180+
 */
const pool = require('../config/db');

function org(req) {
  return String(req.user?.orgCode || req.user?.orgId || '001');
}

function classifyByDpd(dpd, category = 'general') {
  const d = Number(dpd) || 0;
  if (category === 'housing') {
    if (d < 90) return 'performing';
    if (d < 180) return 'oaem';
    if (d < 365) return 'substandard';
    if (d < 730) return 'doubtful';
    return 'loss';
  }
  if (d < 30) return 'performing';
  if (d < 60) return 'oaem';
  if (d < 90) return 'substandard';
  if (d < 180) return 'doubtful';
  return 'loss';
}

function specificRate(classification) {
  switch (classification) {
    case 'oaem':
    case 'performing':
      return 0;
    case 'substandard':
      return 0.25;
    case 'doubtful':
      return 0.5;
    case 'loss':
      return 1;
    default:
      return 0;
  }
}

function specificProvision(principal, classification, securityType, securityValue) {
  const rate = specificRate(classification);
  let base = Number(principal) || 0;
  if (['cash', 'gold'].includes(securityType)) {
    base = Math.max(0, base - Number(securityValue || 0));
  }
  return Math.round(base * rate * 100) / 100;
}

async function getConfig(orgCode) {
  const [[row]] = await pool.query(`SELECT * FROM mfb_config WHERE por_orgacode = :o`, { o: orgCode });
  if (row) return row;
  await pool.query(
    `INSERT INTO mfb_config (por_orgacode) VALUES (:o) ON DUPLICATE KEY UPDATE por_orgacode=por_orgacode`,
    { o: orgCode }
  );
  const [[r2]] = await pool.query(`SELECT * FROM mfb_config WHERE por_orgacode = :o`, { o: orgCode });
  return r2;
}

async function updateConfig(orgCode, body) {
  const fields = [
    'license_type', 'paid_up_capital', 'accumulated_losses', 'eligible_capital',
    'total_rwa', 'general_provision_rate', 'car_minimum_pct', 'mcr_target', 'reserve_fund',
  ];
  const sets = [];
  const params = { o: orgCode };
  for (const f of fields) {
    if (body[f] != null) {
      sets.push(`${f} = :${f}`);
      params[f] = body[f];
    }
  }
  if (!sets.length) return getConfig(orgCode);
  if (body.eligible_capital != null || body.total_rwa != null || body.paid_up_capital != null) {
    const cfg = await getConfig(orgCode);
    const elig =
      body.eligible_capital != null
        ? Number(body.eligible_capital)
        : Number(cfg.eligible_capital) ||
          Math.max(0, Number(body.paid_up_capital ?? cfg.paid_up_capital) - Number(body.accumulated_losses ?? cfg.accumulated_losses));
    const rwa = body.total_rwa != null ? Number(body.total_rwa) : Number(cfg.total_rwa) || 0;
    const car = rwa > 0 ? (elig / rwa) * 100 : 0;
    sets.push('eligible_capital = :elig', 'car_pct = :car');
    params.elig = elig;
    params.car = Math.round(car * 10000) / 10000;
  }
  await pool.query(`UPDATE mfb_config SET ${sets.join(', ')} WHERE por_orgacode = :o`, params);
  return getConfig(orgCode);
}

async function upsertLoan(orgCode, body) {
  const dpd = Number(body.days_past_due) || 0;
  const cat = body.product_category || 'general';
  const classification = body.classification || classifyByDpd(dpd, cat);
  const sp = specificProvision(
    body.outstanding_principal,
    classification,
    body.security_type || 'none',
    body.security_value || 0
  );
  const asOf = body.as_of_date || new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO mfb_loan_portfolio
      (por_orgacode, account_no, cif_no, borrower_name, product_category, branch_code,
       disbursed_amount, outstanding_principal, outstanding_markup, days_past_due,
       classification, specific_provision, security_type, security_value, status, as_of_date)
     VALUES
      (:o, :acc, :cif, :name, :cat, :br, :disb, :op, :om, :dpd, :cls, :sp, :st, :sv, :status, :asof)
     ON DUPLICATE KEY UPDATE
       cif_no=VALUES(cif_no), borrower_name=VALUES(borrower_name), product_category=VALUES(product_category),
       branch_code=VALUES(branch_code), disbursed_amount=VALUES(disbursed_amount),
       outstanding_principal=VALUES(outstanding_principal), outstanding_markup=VALUES(outstanding_markup),
       days_past_due=VALUES(days_past_due), classification=VALUES(classification),
       specific_provision=VALUES(specific_provision), security_type=VALUES(security_type),
       security_value=VALUES(security_value), status=VALUES(status), as_of_date=VALUES(as_of_date)`,
    {
      o: orgCode,
      acc: body.account_no,
      cif: body.cif_no || null,
      name: body.borrower_name || null,
      cat,
      br: body.branch_code || null,
      disb: Number(body.disbursed_amount) || 0,
      op: Number(body.outstanding_principal) || 0,
      om: Number(body.outstanding_markup) || 0,
      dpd,
      cls: classification,
      sp,
      st: body.security_type || 'none',
      sv: Number(body.security_value) || 0,
      status: body.status || 'active',
      asof: asOf,
    }
  );
  return { account_no: body.account_no, classification, specific_provision: sp, days_past_due: dpd };
}

async function listLoans(orgCode, q) {
  let sql = `SELECT * FROM mfb_loan_portfolio WHERE por_orgacode=:o AND status='active'`;
  const p = { o: orgCode };
  if (q) {
    sql += ` AND (account_no LIKE :q OR borrower_name LIKE :q OR cif_no LIKE :q)`;
    p.q = `%${q}%`;
  }
  sql += ` ORDER BY days_past_due DESC, account_no LIMIT 500`;
  const [rows] = await pool.query(sql, p);
  return rows;
}

async function reclassifyAll(orgCode) {
  const [rows] = await pool.query(
    `SELECT account_no, cif_no, borrower_name, product_category, branch_code, disbursed_amount,
            outstanding_principal, outstanding_markup, days_past_due, security_type, security_value, status
     FROM mfb_loan_portfolio WHERE por_orgacode=:o AND status='active'`,
    { o: orgCode }
  );
  let n = 0;
  for (const r of rows) {
    await upsertLoan(orgCode, r);
    n++;
  }
  return { reclassified: n };
}

async function portfolioSummary(orgCode) {
  const cfg = await getConfig(orgCode);
  const [buckets] = await pool.query(
    `SELECT classification, COUNT(*) AS accounts,
            COALESCE(SUM(outstanding_principal),0) AS principal,
            COALESCE(SUM(specific_provision),0) AS specific_prov
     FROM mfb_loan_portfolio WHERE por_orgacode=:o AND status='active' GROUP BY classification`,
    { o: orgCode }
  );
  const [[tot]] = await pool.query(
    `SELECT COUNT(*) AS accounts, COALESCE(SUM(outstanding_principal),0) AS gross,
            COALESCE(SUM(specific_provision),0) AS specific_prov
     FROM mfb_loan_portfolio WHERE por_orgacode=:o AND status='active'`,
    { o: orgCode }
  );
  const gross = Number(tot.gross) || 0;
  const specific = Number(tot.specific_prov) || 0;
  const net = Math.max(0, gross - specific);
  const genRate = Number(cfg.general_provision_rate) / 100;
  const generalProv = Math.round(net * genRate * 100) / 100;
  const nplPrincipal = buckets
    .filter((b) => ['oaem', 'substandard', 'doubtful', 'loss'].includes(b.classification))
    .reduce((s, b) => s + Number(b.principal), 0);
  const nplStrict = buckets
    .filter((b) => ['substandard', 'doubtful', 'loss'].includes(b.classification))
    .reduce((s, b) => s + Number(b.principal), 0);
  const nplRatio = gross > 0 ? (nplStrict / gross) * 100 : 0;
  const coverage = nplStrict > 0 ? ((specific + generalProv) / nplStrict) * 100 : 0;
  const mcr = Math.max(0, Number(cfg.paid_up_capital) - Number(cfg.accumulated_losses));
  const elig = Number(cfg.eligible_capital) || mcr;
  const rwa = Number(cfg.total_rwa) || 0;
  const car = rwa > 0 ? (elig / rwa) * 100 : Number(cfg.car_pct) || 0;
  const carMin = Number(cfg.car_minimum_pct) || 15;
  const mcrTarget = Number(cfg.mcr_target) || 2e9;
  return {
    as_of: new Date().toISOString().slice(0, 10),
    portfolio: {
      accounts: tot.accounts,
      gross_advances: gross,
      specific_provision: specific,
      general_provision: generalProv,
      general_provision_rate_pct: Number(cfg.general_provision_rate),
      net_advances: Math.max(0, net - generalProv),
      npl_including_oaem: nplPrincipal,
      npl_strict: nplStrict,
      npl_ratio_pct: Math.round(nplRatio * 100) / 100,
      provision_coverage_pct: Math.round(coverage * 100) / 100,
      buckets,
    },
    capital: {
      license_type: cfg.license_type,
      paid_up_capital: Number(cfg.paid_up_capital),
      accumulated_losses: Number(cfg.accumulated_losses),
      mcr_net_of_losses: mcr,
      mcr_target: mcrTarget,
      mcr_gap: Math.max(0, mcrTarget - mcr),
      mcr_ok: mcr >= mcrTarget,
      eligible_capital: elig,
      total_rwa: rwa,
      car_pct: Math.round(car * 10000) / 10000,
      car_minimum_pct: carMin,
      car_ok: car >= carMin,
      reserve_fund: Number(cfg.reserve_fund),
    },
  };
}

async function regulatoryPack(orgCode) {
  const summary = await portfolioSummary(orgCode);
  const [limits] = await pool.query(`SELECT * FROM mfb_exposure_limits WHERE por_orgacode=:o`, { o: orgCode });
  return {
    institution: 'MFB-oriented DigiFyntek pack',
    framework: 'SBP PRs for MFBs (toolkit — verify annexures for production)',
    generated_at: new Date().toISOString(),
    ...summary,
    exposure_limits: limits,
    checklist: [
      { item: 'MCR net of losses vs phased target', ok: summary.capital.mcr_ok },
      { item: 'CAR >= 15%', ok: summary.capital.car_ok },
      { item: 'Specific provisioning by classification', ok: true },
      { item: 'General provision on net advances', ok: true },
      { item: 'NPL ratio & coverage monitored', ok: true },
      { item: 'Reserve fund tracked', ok: summary.capital.reserve_fund > 0 },
    ],
  };
}

async function importLegacyLoans(orgCode) {
  const [rows] = await pool.query(
    `SELECT la.account_no, la.farmer_no, la.vac_code, la.account_balance,
            la.loan_disbursementamount, f.farmer_name
     FROM tbl_loanaccount la
     LEFT JOIN tbl_farmer f ON f.farmer_no = la.farmer_no AND f.por_orgacode = la.por_orgacode
     WHERE la.por_orgacode = :o AND la.account_closed = 0 AND la.account_balance > 0
     LIMIT 500`,
    { o: orgCode }
  );
  let n = 0;
  for (const r of rows) {
    await upsertLoan(orgCode, {
      account_no: r.account_no,
      cif_no: r.farmer_no,
      borrower_name: r.farmer_name,
      branch_code: r.vac_code,
      disbursed_amount: r.loan_disbursementamount,
      outstanding_principal: r.account_balance,
      days_past_due: 0,
      product_category: 'general',
    });
    n++;
  }
  return { imported: n };
}

module.exports = {
  org, classifyByDpd, getConfig, updateConfig, upsertLoan, listLoans,
  reclassifyAll, portfolioSummary, regulatoryPack, importLegacyLoans,
};
