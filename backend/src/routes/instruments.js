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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheque_book_requests (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        por_orgacode VARCHAR(10) NULL,
        vac_code VARCHAR(10) NULL,
        request_no VARCHAR(40) NOT NULL,
        member_ref VARCHAR(64) NOT NULL,
        member_name VARCHAR(150) NULL,
        account_no VARCHAR(64) NULL,
        bank_branch VARCHAR(100) NULL,
        branch_code VARCHAR(20) NULL,
        leaves_requested INT UNSIGNED NOT NULL DEFAULT 25,
        request_date DATE NOT NULL,
        status ENUM('pending','approved','rejected','issued','cancelled') NOT NULL DEFAULT 'pending',
        reason VARCHAR(255) NULL,
        review_notes VARCHAR(500) NULL,
        reviewed_by VARCHAR(50) NULL,
        reviewed_at DATETIME NULL,
        issued_book_id INT UNSIGNED NULL,
        created_by VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_req (por_orgacode, request_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) {
    /* table may already exist with FKs */
  }
  try { await pool.query('ALTER TABLE cheque_book_requests ADD COLUMN bank_branch VARCHAR(100) NULL'); } catch (_) {}
  try { await pool.query('ALTER TABLE cheque_book_requests ADD COLUMN branch_code VARCHAR(20) NULL'); } catch (_) {}
  try { await pool.query('ALTER TABLE cheque_books ADD COLUMN bank_branch VARCHAR(100) NULL'); } catch (_) {}
  try { await pool.query('ALTER TABLE cheque_books ADD COLUMN branch_code VARCHAR(20) NULL'); } catch (_) {}
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
           bank_branch, branch_code, leaf_start, leaf_end, total_leaves, issue_date, status, notes, created_by)
         VALUES
          (:org_id, :org, :vac, :book, :mref, :acc, :mname, :bank, :branch, :bcode, :ls, :le, :tot, :idt, 'active', :notes, :by)`,
        {
          org_id: typeof req.user.orgId === 'number' ? req.user.orgId : null,
          org,
          vac: b.branch_code || b.vac_code || req.user.vacCode || null,
          book: bookNo,
          mref: b.member_ref || b.member_id || null,
          acc: b.account_no || null,
          mname: b.member_name || null,
          bank: b.bank_name || 'Society',
          branch: b.bank_branch || null,
          bcode: b.branch_code || null,
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


/** Issue history — issued cheque books */
router.get('/issues', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    const [rows] = await pool.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM cheque_leaves l WHERE l.book_id = b.id AND l.status = 'available') AS leaves_available,
              (SELECT COUNT(*) FROM cheque_leaves l WHERE l.book_id = b.id AND l.status = 'stopped') AS leaves_stopped,
              (SELECT COUNT(*) FROM cheque_leaves l WHERE l.book_id = b.id AND l.status IN ('used','cleared')) AS leaves_used
       FROM cheque_books b
       WHERE (b.por_orgacode = :org OR b.por_orgacode IS NULL)
       ORDER BY b.issue_date DESC, b.id DESC
       LIMIT 300`,
      { org }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/**
 * Stop payment options:
 * body: {
 *   mode: 'single' | 'range' | 'book',
 *   cheque_no?: string,          // single
 *   cheque_from?: string|number, // range
 *   cheque_to?: string|number,
 *   book_id?: number,            // book or range within book
 *   leaf_from?: number,
 *   leaf_to?: number,
 *   reason?: string,
 *   reason_code?: string
 * }
 */
router.post('/stop-payment', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const mode = b.mode || 'single';
    const reason = b.reason || b.stop_reason || 'Stop payment requested';
    const reasonCode = b.reason_code || null;
    const fullReason = reasonCode ? `[${reasonCode}] ${reason}` : reason;
    const org = orgCode(req);

    let ids = [];

    if (mode === 'single') {
      if (!b.cheque_no && !b.leaf_id) {
        return res.status(400).json({ error: 'cheque_no or leaf_id required for single stop' });
      }
      if (b.leaf_id) {
        ids = [Number(b.leaf_id)];
      } else {
        const [rows] = await pool.query(
          `SELECT id FROM cheque_leaves
           WHERE cheque_no = :cno AND (por_orgacode = :org OR por_orgacode IS NULL)
             AND status IN ('available','issued','used')`,
          { cno: String(b.cheque_no).trim(), org }
        );
        ids = rows.map((r) => r.id);
      }
    } else if (mode === 'range') {
      if (b.book_id && b.leaf_from != null && b.leaf_to != null) {
        const [rows] = await pool.query(
          `SELECT id FROM cheque_leaves
           WHERE book_id = :bid AND leaf_seq BETWEEN :a AND :c
             AND status IN ('available','issued','used')`,
          { bid: b.book_id, a: Number(b.leaf_from), c: Number(b.leaf_to) }
        );
        ids = rows.map((r) => r.id);
      } else if (b.cheque_from && b.cheque_to) {
        const [rows] = await pool.query(
          `SELECT id FROM cheque_leaves
           WHERE cheque_no BETWEEN :a AND :c
             AND (por_orgacode = :org OR por_orgacode IS NULL)
             AND status IN ('available','issued','used')`,
          { a: String(b.cheque_from), c: String(b.cheque_to), org }
        );
        ids = rows.map((r) => r.id);
      } else {
        return res.status(400).json({ error: 'range needs book_id+leaf_from+leaf_to or cheque_from+cheque_to' });
      }
    } else if (mode === 'book') {
      if (!b.book_id) return res.status(400).json({ error: 'book_id required' });
      const [rows] = await pool.query(
        `SELECT id FROM cheque_leaves
         WHERE book_id = :bid AND status IN ('available','issued','used')`,
        { bid: b.book_id }
      );
      ids = rows.map((r) => r.id);
    } else {
      return res.status(400).json({ error: 'mode must be single, range, or book' });
    }

    if (!ids.length) {
      return res.status(404).json({ error: 'No eligible cheques found to stop' });
    }

    await pool.query(
      `UPDATE cheque_leaves
       SET status = 'stopped', stop_date = CURDATE(), stop_reason = :reason
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      [fullReason, ...ids]
    );

    // If whole book stop and no available left, mark book cancelled
    if (mode === 'book' && b.book_id) {
      const [[cnt]] = await pool.query(
        `SELECT SUM(status='available') AS avail FROM cheque_leaves WHERE book_id = :bid`,
        { bid: b.book_id }
      );
      if (Number(cnt.avail || 0) === 0) {
        await pool.query(
          `UPDATE cheque_books SET status = 'cancelled' WHERE id = :bid AND status = 'active'`,
          { bid: b.book_id }
        );
      }
    }

    res.json({
      ok: true,
      mode,
      stopped_count: ids.length,
      reason: fullReason,
    });
  } catch (e) {
    next(e);
  }
});

/** List stop-payment records */
router.get('/stops', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    const [rows] = await pool.query(
      `SELECT l.*, b.book_no, b.member_name, b.member_ref, b.account_no
       FROM cheque_leaves l
       JOIN cheque_books b ON b.id = l.book_id
       WHERE l.status = 'stopped'
         AND (l.por_orgacode = :org OR l.por_orgacode IS NULL)
       ORDER BY l.stop_date DESC, l.id DESC
       LIMIT 300`,
      { org }
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});




/** Bank branches for dropdown (treated as branch_code; maps from VAC list when legacy) */
router.get('/branches', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    const LEGACY = process.env.DB_MODE === 'legacy' || process.env.LEGACY_SCHEMA === '1';
    if (LEGACY) {
      try {
        const [rows] = await pool.query(
          `SELECT vac_code AS code, vac_name AS name
           FROM tbl_vacs WHERE por_orgacode = :org AND vac_active = 1
           ORDER BY vac_name LIMIT 200`,
          { org }
        );
        if (rows.length) {
          return res.json(rows.map((r) => ({
            code: r.code,
            name: r.name,
            label: r.code + ' — ' + r.name,
          })));
        }
      } catch (_) {}
    }
    res.json([
      { code: 'HQ', name: 'Head Office', label: 'HQ — Head Office' },
      { code: 'BR01', name: 'Main Branch', label: 'BR01 — Main Branch' },
      { code: 'BR02', name: 'City Branch', label: 'BR02 — City Branch' },
      { code: 'BR03', name: 'Rural Branch', label: 'BR03 — Rural Branch' },
    ]);
  } catch (e) {
    next(e);
  }
});

/** Cheque book requests */
router.get('/requests', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    let sql = `SELECT * FROM cheque_book_requests
               WHERE (por_orgacode = :org OR por_orgacode IS NULL)`;
    const params = { org };
    if (req.query.status) {
      sql += ` AND status = :status`;
      params.status = req.query.status;
    }
    if (req.query.q) {
      sql += ` AND (request_no LIKE :q OR member_ref LIKE :q OR member_name LIKE :q OR account_no LIKE :q)`;
      params.q = `%${req.query.q}%`;
    }
    sql += ` ORDER BY id DESC LIMIT 300`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/requests', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.member_ref && !b.member_id) {
      return res.status(400).json({ error: 'member_ref required' });
    }
    const org = orgCode(req);
    const reqNo = b.request_no || `CBR-${Date.now().toString().slice(-8)}`;
    const leaves = Math.min(200, Math.max(1, Number(b.leaves_requested) || 25));
    const [ins] = await pool.query(
      `INSERT INTO cheque_book_requests
        (por_orgacode, vac_code, request_no, member_ref, member_name, account_no,
         bank_branch, branch_code, leaves_requested, request_date, status, reason, created_by)
       VALUES
        (:org, :vac, :rno, :mref, :mname, :acc, :branch, :bcode, :leaves, :rdate, 'pending', :reason, :by)`,
      {
        org,
        vac: b.branch_code || b.vac_code || req.user.vacCode || null,
        rno: reqNo,
        mref: String(b.member_ref || b.member_id),
        mname: b.member_name || null,
        acc: b.account_no || null,
        branch: b.bank_branch || b.branch_name || null,
        bcode: b.branch_code || null,
        leaves,
        rdate: b.request_date || new Date().toISOString().slice(0, 10),
        reason: b.reason || null,
        by: String(req.user.userId || req.user.id || '').slice(0, 50),
      }
    );
    res.status(201).json({ id: ins.insertId, request_no: reqNo, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

/** Approve or reject request */
router.post('/requests/:id/review', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const action = b.action; // approve | reject
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or reject' });
    }
    const status = action === 'approve' ? 'approved' : 'rejected';
    const [r] = await pool.query(
      `UPDATE cheque_book_requests
       SET status = :status, review_notes = :notes, reviewed_by = :by, reviewed_at = NOW()
       WHERE id = :id AND status = 'pending'`,
      {
        status,
        notes: b.review_notes || b.notes || null,
        by: String(req.user.userId || req.user.id || '').slice(0, 50),
        id: req.params.id,
      }
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Pending request not found' });
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

/**
 * Issue book from approved request
 * body optional: leaf_start, cheque_prefix
 */
router.post('/requests/:id/issue', auth(), async (req, res, next) => {
  try {
    const org = orgCode(req);
    const [[reqRow]] = await pool.query(
      `SELECT * FROM cheque_book_requests WHERE id = :id LIMIT 1`,
      { id: req.params.id }
    );
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (!['approved', 'pending'].includes(reqRow.status)) {
      return res.status(400).json({ error: `Cannot issue from status ${reqRow.status}` });
    }

    const b = req.body || {};
    const total = Number(reqRow.leaves_requested) || 25;
    const start = Number(b.leaf_start) || 1;
    const end = start + total - 1;
    const bookNo = b.book_no || `CB-${Date.now().toString().slice(-8)}`;
    const issueDate = b.issue_date || new Date().toISOString().slice(0, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO cheque_books
          (por_orgacode, vac_code, book_no, member_ref, account_no, member_name, bank_name,
           bank_branch, branch_code, leaf_start, leaf_end, total_leaves, issue_date, status, notes, created_by)
         VALUES
          (:org, :vac, :book, :mref, :acc, :mname, 'Society', :branch, :bcode, :ls, :le, :tot, :idt, 'active', :notes, :by)`,
        {
          org,
          vac: reqRow.vac_code,
          book: bookNo,
          mref: reqRow.member_ref,
          acc: reqRow.account_no,
          mname: reqRow.member_name,
          branch: reqRow.bank_branch || null,
          bcode: reqRow.branch_code || null,
          ls: start,
          le: end,
          tot: total,
          idt: issueDate,
          notes: `From request ${reqRow.request_no}`,
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
      await conn.query(
        `UPDATE cheque_book_requests
         SET status = 'issued', issued_book_id = :bid, reviewed_by = COALESCE(reviewed_by, :by),
             reviewed_at = COALESCE(reviewed_at, NOW())
         WHERE id = :id`,
        { bid: bookId, by: String(req.user.userId || '').slice(0, 50), id: req.params.id }
      );
      await conn.commit();
      res.status(201).json({
        request_id: reqRow.id,
        book_id: bookId,
        book_no: bookNo,
        total_leaves: total,
        status: 'issued',
      });
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


module.exports = router;
