/**
 * Teller / cash drawer / vault — basic operational cash control
 * Customer cash dep/wdr still post via ledger; drawer tracks physical cash position.
 */
const pool = require('../config/db');
const ledger = require('../ledger/service');
const { ref, money } = ledger;

async function ensureVault(branchCode = '001') {
  const [[v]] = await pool.query(`SELECT * FROM cbs_vault WHERE branch_code = ?`, [branchCode]);
  if (v) return v;
  await pool.query(`INSERT INTO cbs_vault (branch_code, balance) VALUES (?, 0)`, [branchCode]);
  const [[v2]] = await pool.query(`SELECT * FROM cbs_vault WHERE branch_code = ?`, [branchCode]);
  return v2;
}

async function listTellers(branchCode) {
  const [rows] = await pool.query(
    `SELECT * FROM cbs_tellers WHERE is_active = 1 AND (? IS NULL OR branch_code = ?) ORDER BY id`,
    [branchCode || null, branchCode || null]
  );
  return rows;
}

async function listDrawers({ branchCode, businessDate, status } = {}) {
  let sql = `SELECT d.*, t.teller_code, t.full_name AS teller_name
             FROM cbs_cash_drawers d
             LEFT JOIN cbs_tellers t ON t.id = d.teller_id WHERE 1=1`;
  const params = [];
  if (branchCode) {
    sql += ` AND d.branch_code = ?`;
    params.push(branchCode);
  }
  if (businessDate) {
    sql += ` AND d.business_date = ?`;
    params.push(businessDate);
  }
  if (status) {
    sql += ` AND d.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY d.id DESC LIMIT 100`;
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getDrawer(id) {
  const [[d]] = await pool.query(
    `SELECT d.*, t.teller_code, t.full_name AS teller_name
     FROM cbs_cash_drawers d LEFT JOIN cbs_tellers t ON t.id = d.teller_id WHERE d.id = ?`,
    [id]
  );
  if (!d) return null;
  const [txns] = await pool.query(
    `SELECT * FROM cbs_cash_txns WHERE drawer_id = ? ORDER BY id DESC LIMIT 50`,
    [id]
  );
  return { ...d, transactions: txns };
}

function expected(d) {
  return money(Number(d.opening_balance) + Number(d.cash_in) - Number(d.cash_out));
}

/**
 * Open drawer for teller on business date with opening float from vault
 */
async function openDrawer({
  tellerId,
  branchCode = '001',
  businessDate,
  openingBalance,
  actor,
  denomJson,
}) {
  const bdate = businessDate || new Date().toISOString().slice(0, 10);
  const openAmt = money(openingBalance || 0);
  if (openAmt < 0) {
    const e = new Error('Opening balance cannot be negative');
    e.status = 400;
    throw e;
  }

  const [[teller]] = await pool.query(`SELECT * FROM cbs_tellers WHERE id = ? AND is_active = 1`, [
    tellerId,
  ]);
  if (!teller) {
    const e = new Error('Teller not found');
    e.status = 404;
    throw e;
  }

  // one open drawer per teller per day
  const [[existing]] = await pool.query(
    `SELECT id FROM cbs_cash_drawers WHERE teller_id = ? AND business_date = ? AND status = 'open'`,
    [tellerId, bdate]
  );
  if (existing) {
    const e = new Error('Teller already has an open drawer for this date');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (openAmt > 0) {
      const [[vault]] = await conn.query(`SELECT * FROM cbs_vault WHERE branch_code = ? FOR UPDATE`, [
        branchCode,
      ]);
      if (!vault) {
        await conn.query(`INSERT INTO cbs_vault (branch_code, balance) VALUES (?, 0)`, [branchCode]);
      }
      const [[v2]] = await conn.query(`SELECT * FROM cbs_vault WHERE branch_code = ? FOR UPDATE`, [
        branchCode,
      ]);
      if (Number(v2.balance) < openAmt) {
        const e = new Error(`Insufficient vault cash (have ${v2.balance})`);
        e.status = 400;
        throw e;
      }
      await conn.query(`UPDATE cbs_vault SET balance = balance - ? WHERE branch_code = ?`, [
        openAmt,
        branchCode,
      ]);
    }

    const drawerCode = `DR-${teller.teller_code}-${bdate.replace(/-/g, '')}`;
    const [ins] = await conn.query(
      `INSERT INTO cbs_cash_drawers
        (drawer_code, branch_code, teller_id, business_date, status, opening_balance,
         cash_in, cash_out, expected_balance, opened_at, opened_by)
       VALUES (?, ?, ?, ?, 'open', ?, 0, 0, ?, NOW(), ?)`,
      [drawerCode, branchCode, tellerId, bdate, openAmt, openAmt, actor || null]
    );
    const drawerId = ins.insertId;
    const txnRef = ref('CSH');
    await conn.query(
      `INSERT INTO cbs_cash_txns
        (txn_ref, txn_type, drawer_id, branch_code, amount, denom_json, narrative, actor, business_date)
       VALUES (?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
      [
        txnRef,
        drawerId,
        branchCode,
        openAmt,
        denomJson ? JSON.stringify(denomJson) : null,
        'Drawer open / float from vault',
        actor || null,
        bdate,
      ]
    );
    if (openAmt > 0) {
      await conn.query(
        `INSERT INTO cbs_cash_txns
          (txn_ref, txn_type, drawer_id, branch_code, amount, narrative, actor, business_date)
         VALUES (?, 'VAULT_TO_TELLER', ?, ?, ?, ?, ?, ?)`,
        [ref('CSH'), drawerId, branchCode, openAmt, 'Float from vault', actor || null, bdate]
      );
    }
    await conn.commit();
    return getDrawer(drawerId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function vaultToTeller({ drawerId, amount, actor, narrative }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]] = await conn.query(`SELECT * FROM cbs_cash_drawers WHERE id = ? FOR UPDATE`, [drawerId]);
    if (!d || d.status !== 'open') {
      const e = new Error('Drawer not open');
      e.status = 400;
      throw e;
    }
    const [[v]] = await conn.query(`SELECT * FROM cbs_vault WHERE branch_code = ? FOR UPDATE`, [
      d.branch_code,
    ]);
    if (!v || Number(v.balance) < amt) {
      const e = new Error('Insufficient vault balance');
      e.status = 400;
      throw e;
    }
    await conn.query(`UPDATE cbs_vault SET balance = balance - ? WHERE branch_code = ?`, [
      amt,
      d.branch_code,
    ]);
    await conn.query(
      `UPDATE cbs_cash_drawers SET cash_in = cash_in + ?, expected_balance = expected_balance + ? WHERE id = ?`,
      [amt, amt, drawerId]
    );
    await conn.query(
      `INSERT INTO cbs_cash_txns
        (txn_ref, txn_type, drawer_id, branch_code, amount, narrative, actor, business_date)
       VALUES (?, 'VAULT_TO_TELLER', ?, ?, ?, ?, ?, ?)`,
      [ref('CSH'), drawerId, d.branch_code, amt, narrative || 'Vault to teller', actor || null, d.business_date]
    );
    await conn.commit();
    return getDrawer(drawerId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function tellerToVault({ drawerId, amount, actor, narrative }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]] = await conn.query(`SELECT * FROM cbs_cash_drawers WHERE id = ? FOR UPDATE`, [drawerId]);
    if (!d || d.status !== 'open') {
      const e = new Error('Drawer not open');
      e.status = 400;
      throw e;
    }
    const exp = expected(d);
    if (exp < amt) {
      const e = new Error(`Drawer expected cash ${exp} less than transfer ${amt}`);
      e.status = 400;
      throw e;
    }
    await conn.query(`UPDATE cbs_vault SET balance = balance + ? WHERE branch_code = ?`, [
      amt,
      d.branch_code,
    ]);
    await conn.query(
      `UPDATE cbs_cash_drawers SET cash_out = cash_out + ?, expected_balance = expected_balance - ? WHERE id = ?`,
      [amt, amt, drawerId]
    );
    await conn.query(
      `INSERT INTO cbs_cash_txns
        (txn_ref, txn_type, drawer_id, branch_code, amount, narrative, actor, business_date)
       VALUES (?, 'TELLER_TO_VAULT', ?, ?, ?, ?, ?, ?)`,
      [ref('CSH'), drawerId, d.branch_code, amt, narrative || 'Teller to vault', actor || null, d.business_date]
    );
    await conn.commit();
    return getDrawer(drawerId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Customer cash deposit through teller drawer + GL
 */
async function customerCashDeposit({ drawerId, accountId, amount, actor, narrative, businessDate }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const [[d]] = await pool.query(`SELECT * FROM cbs_cash_drawers WHERE id = ?`, [drawerId]);
  if (!d || d.status !== 'open') {
    const e = new Error('Drawer not open');
    e.status = 400;
    throw e;
  }
  const journal = await ledger.cashDeposit({
    accountId,
    amount: amt,
    businessDate: businessDate || d.business_date,
    narrative: narrative || 'Teller cash deposit',
    createdBy: actor,
  });
  await pool.query(
    `UPDATE cbs_cash_drawers SET cash_in = cash_in + ?, expected_balance = expected_balance + ? WHERE id = ?`,
    [amt, amt, drawerId]
  );
  await pool.query(
    `INSERT INTO cbs_cash_txns
      (txn_ref, txn_type, drawer_id, branch_code, amount, account_id, journal_id, narrative, actor, business_date)
     VALUES (?, 'CUSTOMER_DEP', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ref('CSH'),
      drawerId,
      d.branch_code,
      amt,
      accountId,
      journal.journal?.id || journal.id || null,
      narrative || 'Customer deposit',
      actor || null,
      d.business_date,
    ]
  );
  return { drawer: await getDrawer(drawerId), ledger: journal };
}

async function customerCashWithdraw({ drawerId, accountId, amount, actor, narrative, businessDate }) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  const [[d]] = await pool.query(`SELECT * FROM cbs_cash_drawers WHERE id = ?`, [drawerId]);
  if (!d || d.status !== 'open') {
    const e = new Error('Drawer not open');
    e.status = 400;
    throw e;
  }
  if (expected(d) < amt) {
    const e = new Error('Insufficient drawer cash for withdrawal');
    e.status = 400;
    throw e;
  }
  const journal = await ledger.cashWithdrawal({
    accountId,
    amount: amt,
    businessDate: businessDate || d.business_date,
    narrative: narrative || 'Teller cash withdrawal',
    createdBy: actor,
  });
  await pool.query(
    `UPDATE cbs_cash_drawers SET cash_out = cash_out + ?, expected_balance = expected_balance - ? WHERE id = ?`,
    [amt, amt, drawerId]
  );
  await pool.query(
    `INSERT INTO cbs_cash_txns
      (txn_ref, txn_type, drawer_id, branch_code, amount, account_id, journal_id, narrative, actor, business_date)
     VALUES (?, 'CUSTOMER_WDR', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ref('CSH'),
      drawerId,
      d.branch_code,
      amt,
      accountId,
      journal.journal?.id || journal.id || null,
      narrative || 'Customer withdrawal',
      actor || null,
      d.business_date,
    ]
  );
  return { drawer: await getDrawer(drawerId), ledger: journal };
}

/**
 * Close drawer: counted vs expected; variance recorded; remaining cash to vault
 */
async function closeDrawer({ drawerId, countedBalance, actor, narrative, denomJson }) {
  const counted = money(countedBalance);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]] = await conn.query(`SELECT * FROM cbs_cash_drawers WHERE id = ? FOR UPDATE`, [drawerId]);
    if (!d || d.status !== 'open') {
      const e = new Error('Drawer not open');
      e.status = 400;
      throw e;
    }
    const exp = expected(d);
    const variance = money(counted - exp);

    // Return counted cash to vault (physical settle)
    await conn.query(`UPDATE cbs_vault SET balance = balance + ? WHERE branch_code = ?`, [
      counted,
      d.branch_code,
    ]);

    await conn.query(
      `UPDATE cbs_cash_drawers SET
        status = 'closed', counted_balance = ?, variance = ?, expected_balance = ?,
        closed_at = NOW(), closed_by = ?
       WHERE id = ?`,
      [counted, variance, exp, actor || null, drawerId]
    );

    await conn.query(
      `INSERT INTO cbs_cash_txns
        (txn_ref, txn_type, drawer_id, branch_code, amount, denom_json, narrative, actor, business_date)
       VALUES (?, 'CLOSE', ?, ?, ?, ?, ?, ?, ?)`,
      [
        ref('CSH'),
        drawerId,
        d.branch_code,
        counted,
        denomJson ? JSON.stringify(denomJson) : null,
        narrative || `Close drawer expected ${exp} counted ${counted} var ${variance}`,
        actor || null,
        d.business_date,
      ]
    );
    if (variance !== 0) {
      await conn.query(
        `INSERT INTO cbs_cash_txns
          (txn_ref, txn_type, drawer_id, branch_code, amount, narrative, actor, business_date)
         VALUES (?, 'VARIANCE', ?, ?, ?, ?, ?, ?)`,
        [
          ref('CSH'),
          drawerId,
          d.branch_code,
          variance,
          variance > 0 ? 'Cash overage' : 'Cash shortage',
          actor || null,
          d.business_date,
        ]
      );
    }
    await conn.commit();
    return getDrawer(drawerId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function vaultStatus(branchCode = '001') {
  return ensureVault(branchCode);
}

module.exports = {
  listTellers,
  listDrawers,
  getDrawer,
  openDrawer,
  closeDrawer,
  vaultToTeller,
  tellerToVault,
  customerCashDeposit,
  customerCashWithdraw,
  vaultStatus,
  ensureVault,
};
