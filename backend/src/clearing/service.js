/**
 * Cheque clearing — outward (our cheques presented) / inward (cheques deposited)
 * Statuses kept separate from leaf inventory; GL on clear/bounce.
 */
const pool = require('../config/db');
const ledger = require('../ledger/service');
const { ref, money } = ledger;

async function createBatch({ direction, businessDate, branchCode, narrative, createdBy }) {
  if (!['OUTWARD', 'INWARD'].includes(direction)) {
    const e = new Error('direction must be OUTWARD or INWARD');
    e.status = 400;
    throw e;
  }
  const batchRef = ref(direction === 'OUTWARD' ? 'CLO' : 'CLI');
  const [ins] = await pool.query(
    `INSERT INTO cbs_clearing_batches
      (batch_ref, direction, business_date, branch_code, status, narrative, created_by)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    [
      batchRef,
      direction,
      businessDate || new Date().toISOString().slice(0, 10),
      branchCode || '001',
      narrative || null,
      createdBy || null,
    ]
  );
  return getBatch(ins.insertId);
}

async function getBatch(id) {
  const [[b]] = await pool.query(`SELECT * FROM cbs_clearing_batches WHERE id = ?`, [id]);
  if (!b) return null;
  const [items] = await pool.query(
    `SELECT * FROM cbs_clearing_items WHERE batch_id = ? ORDER BY id`,
    [id]
  );
  return { ...b, items };
}

async function listBatches({ direction, status, limit = 50 } = {}) {
  let sql = `SELECT * FROM cbs_clearing_batches WHERE 1=1`;
  const params = [];
  if (direction) {
    sql += ` AND direction = ?`;
    params.push(direction);
  }
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY id DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 50, 200));
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Add item to open batch
 * OUTWARD: typically our customer's issued cheque being paid
 * INWARD: cheque deposited to our customer's account for collection
 */
async function addItem({
  batchId,
  chequeNo,
  chequeLeafId,
  accountId,
  amount,
  payeeName,
  drawerName,
  bankName,
  narrative,
}) {
  const amt = money(amount);
  if (amt <= 0) {
    const e = new Error('Amount must be positive');
    e.status = 400;
    throw e;
  }
  if (!chequeNo) {
    const e = new Error('cheque_no required');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[batch]] = await conn.query(
      `SELECT * FROM cbs_clearing_batches WHERE id = ? FOR UPDATE`,
      [batchId]
    );
    if (!batch) {
      const e = new Error('Batch not found');
      e.status = 404;
      throw e;
    }
    if (batch.status !== 'open') {
      const e = new Error(`Batch is ${batch.status}`);
      e.status = 400;
      throw e;
    }

    // Optional: mark leaf presented
    if (chequeLeafId) {
      await conn.query(
        `UPDATE cheque_leaves SET status = 'issued', amount = ?, payee_name = COALESCE(?, payee_name)
         WHERE id = ? AND status IN ('available','issued','used')`,
        [amt, payeeName || null, chequeLeafId]
      ).catch(() => {});
    }

    const itemRef = ref('CHI');
    await conn.query(
      `INSERT INTO cbs_clearing_items
        (batch_id, item_ref, direction, cheque_no, cheque_leaf_id, account_id, amount,
         payee_name, drawer_name, bank_name, status, narrative)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        batchId,
        itemRef,
        batch.direction,
        chequeNo,
        chequeLeafId || null,
        accountId || null,
        amt,
        payeeName || null,
        drawerName || null,
        bankName || null,
        narrative || null,
      ]
    );
    await conn.query(
      `UPDATE cbs_clearing_batches
       SET item_count = item_count + 1, total_amount = total_amount + ?
       WHERE id = ?`,
      [amt, batchId]
    );
    await conn.commit();
    return getBatch(batchId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function submitBatch(batchId, actor) {
  const [[b]] = await pool.query(`SELECT * FROM cbs_clearing_batches WHERE id = ?`, [batchId]);
  if (!b) {
    const e = new Error('Batch not found');
    e.status = 404;
    throw e;
  }
  if (b.status !== 'open') {
    const e = new Error(`Batch is ${b.status}`);
    e.status = 400;
    throw e;
  }
  if (Number(b.item_count) < 1) {
    const e = new Error('Batch has no items');
    e.status = 400;
    throw e;
  }
  await pool.query(
    `UPDATE cbs_clearing_batches SET status = 'submitted' WHERE id = ?`,
    [batchId]
  );
  await pool.query(
    `UPDATE cbs_clearing_items SET status = 'presented' WHERE batch_id = ? AND status = 'pending'`,
    [batchId]
  );
  return getBatch(batchId);
}

/**
 * Clear or bounce a single item — posts GL when account_id present
 * OUTWARD clear: pay from customer account (Dr deposit / Cr clearing suspense 2100)
 * INWARD clear: credit customer account (Dr clearing 2100 / Cr deposit)
 * Bounce: no customer balance change (or reverse provisional if we had one — we post only on clear)
 */
async function decideItem({ itemId, decision, bounceReason, actor }) {
  if (!['cleared', 'bounced'].includes(decision)) {
    const e = new Error('decision must be cleared or bounced');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  let journalId = null;
  try {
    await conn.beginTransaction();
    const [[item]] = await conn.query(
      `SELECT i.*, b.status AS batch_status, b.direction AS batch_direction, b.business_date
       FROM cbs_clearing_items i
       JOIN cbs_clearing_batches b ON b.id = i.batch_id
       WHERE i.id = ? FOR UPDATE`,
      [itemId]
    );
    if (!item) {
      const e = new Error('Item not found');
      e.status = 404;
      throw e;
    }
    if (!['pending', 'presented'].includes(item.status)) {
      const e = new Error(`Item already ${item.status}`);
      e.status = 400;
      throw e;
    }
    if (!['open', 'submitted'].includes(item.batch_status)) {
      const e = new Error(`Batch is ${item.batch_status}`);
      e.status = 400;
      throw e;
    }

    const amt = money(item.amount);

    if (decision === 'cleared' && item.account_id) {
      // post outside lock after commit of status — do post inside using ledger after commit
      // For transaction safety: mark item first after journal
      await conn.commit();
      conn.release();

      let lines;
      if (item.direction === 'OUTWARD') {
        // Pay cheque: debit customer, credit clearing suspense
        lines = [
          {
            gl_code: '2000',
            account_id: item.account_id,
            debit: amt,
            credit: 0,
            narrative: `Outward cheque ${item.cheque_no}`,
          },
          { gl_code: '2100', debit: 0, credit: amt, narrative: 'Clearing settlement' },
        ];
      } else {
        // Inward deposit collection: debit clearing, credit customer
        lines = [
          { gl_code: '2100', debit: amt, credit: 0, narrative: 'Inward clearing' },
          {
            gl_code: '2000',
            account_id: item.account_id,
            debit: 0,
            credit: amt,
            narrative: `Inward cheque ${item.cheque_no}`,
          },
        ];
      }
      try {
        const journal = await ledger.postJournal({
          businessDate: item.business_date,
          sourceModule: 'CHEQUE_CLEARING',
          sourceRef: item.item_ref,
          narrative: `${decision} ${item.cheque_no}`,
          postedBy: actor,
          lines,
        });
        journalId = journal.id;
      } catch (err) {
        // restore — leave item pending by not updating
        throw err;
      }

      await pool.query(
        `UPDATE cbs_clearing_items SET status = 'cleared', journal_id = ?, bounce_reason = NULL WHERE id = ?`,
        [journalId, itemId]
      );
      if (item.cheque_leaf_id) {
        await pool.query(
          `UPDATE cheque_leaves SET status = 'cleared', clear_date = CURDATE(), amount = ? WHERE id = ?`,
          [amt, item.cheque_leaf_id]
        ).catch(() => {});
      }
      await pool.query(
        `UPDATE cbs_clearing_batches SET settled_count = settled_count + 1 WHERE id = ?`,
        [item.batch_id]
      );
      return getBatch(item.batch_id);
    }

    if (decision === 'cleared' && !item.account_id) {
      // clear without GL
      await conn.query(
        `UPDATE cbs_clearing_items SET status = 'cleared' WHERE id = ?`,
        [itemId]
      );
      if (item.cheque_leaf_id) {
        await conn.query(
          `UPDATE cheque_leaves SET status = 'cleared', clear_date = CURDATE() WHERE id = ?`,
          [item.cheque_leaf_id]
        ).catch(() => {});
      }
      await conn.query(
        `UPDATE cbs_clearing_batches SET settled_count = settled_count + 1 WHERE id = ?`,
        [item.batch_id]
      );
      await conn.commit();
      return getBatch(item.batch_id);
    }

    // bounced
    await conn.query(
      `UPDATE cbs_clearing_items SET status = 'bounced', bounce_reason = ? WHERE id = ?`,
      [bounceReason || 'Unpaid', itemId]
    );
    if (item.cheque_leaf_id) {
      await conn.query(
        `UPDATE cheque_leaves SET status = 'bounced' WHERE id = ?`,
        [item.cheque_leaf_id]
      ).catch(() => {});
    }
    await conn.query(
      `UPDATE cbs_clearing_batches SET bounced_count = bounced_count + 1 WHERE id = ?`,
      [item.batch_id]
    );
    await conn.commit();
    return getBatch(item.batch_id);
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    try {
      conn.release();
    } catch (_) {}
    throw err;
  } finally {
    try {
      conn.release();
    } catch (_) {}
  }
}

async function settleBatch(batchId) {
  const batch = await getBatch(batchId);
  if (!batch) {
    const e = new Error('Batch not found');
    e.status = 404;
    throw e;
  }
  const pending = (batch.items || []).filter((i) =>
    ['pending', 'presented'].includes(i.status)
  );
  if (pending.length) {
    const e = new Error(`${pending.length} item(s) still pending/presented`);
    e.status = 400;
    throw e;
  }
  await pool.query(
    `UPDATE cbs_clearing_batches SET status = 'settled', settled_at = NOW() WHERE id = ?`,
    [batchId]
  );
  return getBatch(batchId);
}

module.exports = {
  createBatch,
  getBatch,
  listBatches,
  addItem,
  submitBatch,
  decideItem,
  settleBatch,
};
