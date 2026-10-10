/**
 * Instrument management = Chequebook management
 */
const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function orgCode(req) {
  return String(req.user.orgCode || req.user.orgId || '001');
}

async function ensureTables() {
  // soft ensure — ignore if exists / wrong DB
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheque_books (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        org_id INT UNSIGNED NULL,
        por_orgacode VARCHAR(10) NULL,
        vac_code VARCHAR(10) NULL,
        book_no VARCHAR(40) NOT NULL,
        member_ref VARCHAR(64) NULL,
        account_no VARCHAR(64) NULL,
        member_name VARCHAR(150) NULL,
        bank_name VARCHAR(100) NULL DEFAULT 'Society',
        leaf_start INT UNSIGNED NOT NULL,
        leaf_end INT UNSIGNED NOT NULL,
        total_leaves INT UNSIGNED NOT NULL,
        issue_date DATE NOT NULL,
        status ENUM('active','exhausted','cancelled','returned') NOT NULL DEFAULT 'active',
        notes TEXT NULL,
        created_by VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_book (por_orgacode, book_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheque_leaves (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        book_id INT UNSIGNED NOT NULL,
        por_orgacode VARCHAR(10) NULL,
        cheque_no VARCHAR(40) NOT NULL,
        leaf_seq INT UNSIGNED NOT NULL,
        status ENUM('available','issued','used','cleared','stopped','bounced','cancelled') NOT NULL DEFAULT 'available',
        payee_name VARCHAR(150) NULL,
        amount DECIMAL(18,2) NULL,
        issue_date DATE NULL,
        clear_date DATE NULL,
        stop_date DATE NULL,
        stop_reason VARCHAR(255) NULL,
        narration VARCHAR(500) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_cheque (por_orgacode, cheque_no),
        KEY idx_book (book_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) {
    /* table may already exist with FKs */
  }
}

router.use(async (_req, _res, next) => {
  try {
    await ensureTables();
  } catch (_) {}
  next();
});

router.get('/summary', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    const [[books]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(status='active') AS active_books
       FROM cheque_books WHERE por_orgacode = :org OR por_orgacode IS NULL`,
      { org }
    );
    const [[leaves]] = await pool.query(
      `SELECT
         SUM(status='available') AS available,
         SUM(status='used') AS used,
         SUM(status='cleared') AS cleared,
         SUM(status='stopped') AS stopped,
         SUM(status='bounced') AS bounced,
         COUNT(*) AS total_leaves
       FROM cheque_leaves WHERE por_orgacode = :org OR por_orgacode IS NULL`,
      { org }
    );
    res.json({
      books: Number(books.total || 0),
      active_books: Number(books.active_books || 0),
      leaves: Number(leaves.total_leaves || 0),
      available: Number(leaves.available || 0),
      used: Number(leaves.used || 0),
      cleared: Number(leaves.cleared || 0),
      stopped: Number(leaves.stopped || 0),
      bounced: Number(leaves.bounced || 0),
    });
  } catch (e) {
    next(e);
  }
});

/** List cheque books */
router.get('/books', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    let sql = `SELECT * FROM cheque_books WHERE (por_orgacode = :org OR por_orgacode IS NULL)`;
    const params = { org };
    if (req.query.status) {
      sql += ` AND status = :status`;
      params.status = req.query.status;
    }
    if (req.query.q) {
      sql += ` AND (book_no LIKE :q OR member_name LIKE :q OR member_ref LIKE :q OR account_no LIKE :q)`;
      params.q = `%${req.query.q}%`;
    }
    sql += ` ORDER BY id DESC LIMIT 500`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Issue a new cheque book + generate leaves */
router.post('/books', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const start = Number(b.leaf_start);
    const end = Number(b.leaf_end);
    if (!start || !end || end < start) {
      return res.status(400).json({ error: 'leaf_start and leaf_end required (end >= start)' });
    }
    const total = end - start + 1;
    if (total > 200) return res.status(400).json({ error: 'Max 200 leaves per book' });

    const org = orgCode(req);
    const bookNo = b.book_no || `CB-${Date.now().toString().slice(-8)}`;
    const issueDate = b.issue_date || new Date().toISOString().slice(0, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO cheque_books
          (org_id, por_orgacode, vac_code, book_no, member_ref, account_no, member_name, bank_name,
           leaf_start, leaf_end, total_leaves, issue_date, status, notes, created_by)
         VALUES
          (:org_id, :org, :vac, :book, :mref, :acc, :mname, :bank, :ls, :le, :tot, :idt, 'active', :notes, :by)`,
        {
          org_id: typeof req.user.orgId === 'number' ? req.user.orgId : null,
          org,
          vac: b.vac_code || req.user.vacCode || null,
          book: bookNo,
          mref: b.member_ref || b.member_id || null,
          acc: b.account_no || null,
          mname: b.member_name || null,
          bank: b.bank_name || 'Society',
          ls: start,
          le: end,
          tot: total,
          idt: issueDate,
          notes: b.notes || null,
          by: String(req.user.userId || req.user.id || '').slice(0, 50),
        }
      );
      const bookId = ins.insertId;
      const prefix = b.cheque_prefix || bookNo.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'CHQ';

      for (let n = start; n <= end; n++) {
        const chequeNo = b.cheque_prefix
          ? `${b.cheque_prefix}${String(n).padStart(6, '0')}`
          : `${prefix}-${n}`;
        await conn.query(
          `INSERT INTO cheque_leaves (book_id, por_orgacode, cheque_no, leaf_seq, status)
           VALUES (:bid, :org, :cno, :seq, 'available')`,
          { bid: bookId, org, cno: chequeNo, seq: n }
        );
      }
      await conn.commit();
      res.status(201).json({ id: bookId, book_no: bookNo, total_leaves: total });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/** List leaves (optional book_id / status / q) */
router.get('/leaves', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    let sql = `
      SELECT l.*, b.book_no, b.member_name, b.member_ref, b.account_no
      FROM cheque_leaves l
      JOIN cheque_books b ON b.id = l.book_id
      WHERE (l.por_orgacode = :org OR l.por_orgacode IS NULL)`;
    const params = { org };
    if (req.query.book_id) {
      sql += ` AND l.book_id = :bid`;
      params.bid = req.query.book_id;
    }
    if (req.query.status) {
      sql += ` AND l.status = :status`;
      params.status = req.query.status;
    }
    if (req.query.q) {
      sql += ` AND (l.cheque_no LIKE :q OR l.payee_name LIKE :q OR b.book_no LIKE :q)`;
      params.q = `%${req.query.q}%`;
    }
    sql += ` ORDER BY l.cheque_no DESC LIMIT 500`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Update leaf status — use / stop / clear / bounce / cancel */
router.patch('/leaves/:id', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const status = b.status;
    const allowed = ['available', 'issued', 'used', 'cleared', 'stopped', 'bounced', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const fields = { status, id: req.params.id };
    let extra = '';
    if (status === 'used' || status === 'issued') {
      extra += ', payee_name = COALESCE(:payee, payee_name), amount = COALESCE(:amount, amount), issue_date = COALESCE(:issue_date, issue_date), narration = COALESCE(:narration, narration)';
      fields.payee = b.payee_name || null;
      fields.amount = b.amount != null ? Number(b.amount) : null;
      fields.issue_date = b.issue_date || new Date().toISOString().slice(0, 10);
      fields.narration = b.narration || null;
    }
    if (status === 'cleared') {
      extra += ', clear_date = COALESCE(:clear_date, CURDATE())';
      fields.clear_date = b.clear_date || null;
    }
    if (status === 'stopped') {
      extra += ', stop_date = CURDATE(), stop_reason = :stop_reason';
      fields.stop_reason = b.stop_reason || b.reason || 'Stop payment';
    }

    await pool.query(`UPDATE cheque_leaves SET status = :status${extra} WHERE id = :id`, fields);

    // Exhaust book if no available leaves left
    const [[leaf]] = await pool.query(`SELECT book_id FROM cheque_leaves WHERE id = :id`, { id: req.params.id });
    if (leaf) {
      const [[cnt]] = await pool.query(
        `SELECT SUM(status='available') AS avail FROM cheque_leaves WHERE book_id = :bid`,
        { bid: leaf.book_id }
      );
      if (Number(cnt.avail || 0) === 0) {
        await pool.query(`UPDATE cheque_books SET status = 'exhausted' WHERE id = :bid AND status = 'active'`, {
          bid: leaf.book_id,
        });
      }
    }

    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

/** Cancel whole book */
router.post('/books/:id/cancel', auth(), async (req, res, next) => {
  try {
    const bid = req.params.id;
    await pool.query(`UPDATE cheque_books SET status = 'cancelled' WHERE id = :id`, { id: bid });
    await pool.query(
      `UPDATE cheque_leaves SET status = 'cancelled'
       WHERE book_id = :id AND status IN ('available','issued')`,
      { id: bid }
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Default list = books (backward compatible with old /api/instruments) */
router.get('/', auth(), async (req, res, next) => {
  try {
    req.url = '/books' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    // inline books query
    const org = orgCode(req);
    const [rows] = await pool.query(
      `SELECT * FROM cheque_books WHERE (por_orgacode = :org OR por_orgacode IS NULL) ORDER BY id DESC LIMIT 500`,
      { org }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
