/**
 * Posting, day-end, interest accrual for legacy DigiFyntek / Digital Kisaan schema
 */
const pool = require('../config/db');

async function nextTranNumber(conn, orgCode) {
  const key = `master_txn_${orgCode}`;
  await conn.query(
    `INSERT INTO tbl_counter (table_name, counter) VALUES (:key, 1)
     ON DUPLICATE KEY UPDATE counter = counter + 1`,
    { key }
  );
  const [[row]] = await conn.query(`SELECT counter FROM tbl_counter WHERE table_name = :key`, { key });
  // fallback if counter table empty conflict
  if (row && row.counter) return Number(row.counter);
  const [[mx]] = await conn.query(
    `SELECT COALESCE(MAX(tran_number), 0) + 1 AS n FROM tbl_mastertransaction WHERE por_orgacode = :o`,
    { o: orgCode }
  );
  return Number(mx.n);
}

/**
 * Create a journal posting
 * body: { vac_code, tran_date, narration, payment_mode, lines: [{ gl_code, amount, dr_cr, account_no?, tran_code?, product_code? }] }
 * Balanced: sum(debit) === sum(credit)
 */
async function createPosting({ orgCode, userId, body }) {
  const vac = String(body.vac_code || '0001');
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length < 2) {
    const err = new Error('At least two journal lines required');
    err.status = 400;
    throw err;
  }
  let debit = 0;
  let credit = 0;
  for (const ln of lines) {
    const amt = Number(ln.amount || 0);
    if (amt <= 0) {
      const err = new Error('Each line amount must be > 0');
      err.status = 400;
      throw err;
    }
    if (!ln.gl_code) {
      const err = new Error('gl_code required on each line');
      err.status = 400;
      throw err;
    }
    const dc = String(ln.dr_cr || ln.tran_debitcredit || '').toUpperCase();
    if (dc === 'D' || dc === 'DR' || dc === 'DEBIT') debit += amt;
    else if (dc === 'C' || dc === 'CR' || dc === 'CREDIT') credit += amt;
    else {
      const err = new Error('dr_cr must be D or C');
      err.status = 400;
      throw err;
    }
  }
  if (Math.abs(debit - credit) > 0.01) {
    const err = new Error(`Unbalanced entry: debit ${debit} vs credit ${credit}`);
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tranNumber = await nextTranNumber(conn, orgCode);
    const tranDate = body.tran_date || new Date().toISOString().slice(0, 10);
    const authorize = body.authorize !== false;
    const post = body.post === true;

    await conn.query(
      `INSERT INTO tbl_mastertransaction
        (por_orgacode, tran_number, vac_code, payment_mode, tran_authorized, tran_cancelled,
         tran_createdate, tran_createuser, tran_date, tran_narration, tran_posted, tran_verifydate, tran_verifyuser)
       VALUES
        (:org, :tn, :vac, :pm, :auth, 0, NOW(), :user, :td, :narr, :posted, :vdate, :vuser)`,
      {
        org: orgCode,
        tn: tranNumber,
        vac,
        pm: body.payment_mode || 'CASH',
        auth: authorize ? 1 : 0,
        user: String(userId || 'system').slice(0, 100),
        td: tranDate,
        narr: (body.narration || 'Journal posting').slice(0, 500),
        posted: post ? 1 : 0,
        vdate: authorize ? new Date() : null,
        vuser: authorize ? String(userId || '').slice(0, 10) : null,
      }
    );

    let sub = 1;
    for (const ln of lines) {
      const dc = String(ln.dr_cr || '').toUpperCase();
      const drcr = dc.startsWith('D') ? 'D' : 'C';
      await conn.query(
        `INSERT INTO tbl_generaltransaction
          (por_orgacode, tran_number, tran_subnumber, vac_code, account_no, chrg_code,
           gl_code, product_code, tran_amount, tran_code, tran_debitcredit)
         VALUES
          (:org, :tn, :sub, :vac, :acc, :chrg, :gl, :prod, :amt, :tcode, :drcr)`,
        {
          org: orgCode,
          tn: tranNumber,
          sub: sub++,
          vac,
          acc: ln.account_no || null,
          chrg: ln.chrg_code || null,
          gl: ln.gl_code,
          prod: ln.product_code || null,
          amt: Number(ln.amount),
          tcode: ln.tran_code || '9',
          drcr,
        }
      );
    }

    await conn.commit();
    return { tran_number: tranNumber, vac_code: vac, debit, credit, authorized: authorize, posted: post };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Mark authorized unposted transactions for a date as posted */
async function dayEndPost({ orgCode, vacCode, tranDate }) {
  const date = tranDate || new Date().toISOString().slice(0, 10);
  let sql = `
    UPDATE tbl_mastertransaction
    SET tran_posted = 1, tran_verifydate = COALESCE(tran_verifydate, NOW())
    WHERE por_orgacode = :org AND tran_date = :d AND tran_cancelled = 0
      AND tran_authorized = 1 AND tran_posted = 0`;
  const params = { org: orgCode, d: date };
  if (vacCode) {
    sql += ` AND vac_code = :vac`;
    params.vac = vacCode;
  }
  const [result] = await pool.query(sql, params);
  return {
    tran_date: date,
    vac_code: vacCode || null,
    posted_count: result.affectedRows || 0,
  };
}

/**
 * Interest accrual on open loan accounts (simple daily rate * balance)
 * Does NOT invent GL codes — records daily profit snapshot + optional journal if gl codes provided
 */
async function accrueInterest({ orgCode, vacCode, asOfDate, days = 1, interestGl, incomeGl, createJournal }) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const d = Math.max(1, Number(days) || 1);

  let sql = `
    SELECT account_no, vac_code, account_balance, loan_interestrate, product_code, farmer_no
    FROM tbl_loanaccount
    WHERE por_orgacode = :org AND account_closed = 0 AND account_balance > 0
      AND loan_interestrate IS NOT NULL AND loan_interestrate > 0`;
  const params = { org: orgCode };
  if (vacCode) {
    sql += ` AND vac_code = :vac`;
    params.vac = vacCode;
  }
  const [loans] = await pool.query(sql, params);

  const details = [];
  let totalProfit = 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const ln of loans) {
      const bal = Number(ln.account_balance);
      const rate = Number(ln.loan_interestrate); // assume annual %
      const profit = Math.round(((bal * rate) / 100 / 365) * d * 1e6) / 1e6;
      if (profit <= 0) continue;
      totalProfit += profit;

      await conn.query(
        `INSERT INTO tbl_dailyaccountbalanceandprofit
          (account_no, por_orgacode, profit_postdate, vac_code, balance, profit)
         VALUES (:acc, :org, :dt, :vac, :bal, :profit)
         ON DUPLICATE KEY UPDATE balance = VALUES(balance), profit = VALUES(profit)`,
        {
          acc: ln.account_no,
          org: orgCode,
          dt: date,
          vac: ln.vac_code,
          bal,
          profit,
        }
      );

      // Optionally increase balance by accrued interest (capitalization style)
      if (createJournal !== false) {
        await conn.query(
          `UPDATE tbl_loanaccount
           SET account_balance = account_balance + :p,
               loan_totalinterest = COALESCE(loan_totalinterest,0) + :p
           WHERE account_no = :acc AND por_orgacode = :org`,
          { p: profit, acc: ln.account_no, org: orgCode }
        );
      }

      details.push({
        account_no: ln.account_no,
        vac_code: ln.vac_code,
        balance: bal,
        rate,
        days: d,
        profit,
      });
    }

    let journal = null;
    if (createJournal && interestGl && incomeGl && totalProfit > 0) {
      // Build balanced accrual: Dr Interest receivable / Cr Interest income
      journal = await createPostingWithConn(conn, {
        orgCode,
        userId: 'accrual',
        body: {
          vac_code: vacCode || (details[0] && details[0].vac_code) || '0001',
          tran_date: date,
          narration: `Interest accrual ${date} (${d} day)`,
          payment_mode: 'SYSTEM',
          authorize: true,
          post: true,
          lines: [
            { gl_code: interestGl, amount: totalProfit, dr_cr: 'D', tran_code: '4' },
            { gl_code: incomeGl, amount: totalProfit, dr_cr: 'C', tran_code: '4' },
          ],
        },
      });
    }

    await conn.commit();
    return {
      as_of: date,
      days: d,
      accounts: details.length,
      total_profit: Math.round(totalProfit * 100) / 100,
      details: details.slice(0, 200),
      journal,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function createPostingWithConn(conn, { orgCode, userId, body }) {
  // simplified internal posting using existing connection (already in txn)
  const vac = String(body.vac_code || '0001');
  const lines = body.lines || [];
  const tranNumber = await nextTranNumber(conn, orgCode);
  const tranDate = body.tran_date || new Date().toISOString().slice(0, 10);
  await conn.query(
    `INSERT INTO tbl_mastertransaction
      (por_orgacode, tran_number, vac_code, payment_mode, tran_authorized, tran_cancelled,
       tran_createdate, tran_createuser, tran_date, tran_narration, tran_posted)
     VALUES (:org, :tn, :vac, :pm, 1, 0, NOW(), :user, :td, :narr, 1)`,
    {
      org: orgCode,
      tn: tranNumber,
      vac,
      pm: body.payment_mode || 'SYSTEM',
      user: String(userId || 'system').slice(0, 100),
      td: tranDate,
      narr: (body.narration || '').slice(0, 500),
    }
  );
  let sub = 1;
  for (const ln of lines) {
    const drcr = String(ln.dr_cr || 'D').toUpperCase().startsWith('D') ? 'D' : 'C';
    await conn.query(
      `INSERT INTO tbl_generaltransaction
        (por_orgacode, tran_number, tran_subnumber, vac_code, account_no, chrg_code,
         gl_code, product_code, tran_amount, tran_code, tran_debitcredit)
       VALUES (:org, :tn, :sub, :vac, NULL, NULL, :gl, NULL, :amt, :tcode, :drcr)`,
      {
        org: orgCode,
        tn: tranNumber,
        sub: sub++,
        vac,
        gl: ln.gl_code,
        amt: Number(ln.amount),
        tcode: ln.tran_code || '4',
        drcr,
      }
    );
  }
  return { tran_number: tranNumber };
}

async function unpostedCount(orgCode, vacCode) {
  let sql = `SELECT COUNT(*) AS c FROM tbl_mastertransaction
             WHERE por_orgacode=:org AND tran_cancelled=0 AND tran_authorized=1 AND tran_posted=0`;
  const params = { org: orgCode };
  if (vacCode) {
    sql += ` AND vac_code=:vac`;
    params.vac = vacCode;
  }
  const [[r]] = await pool.query(sql, params);
  return r.c;
}

module.exports = {
  createPosting,
  dayEndPost,
  accrueInterest,
  unpostedCount,
};
