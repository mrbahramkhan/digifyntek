const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const pool = require('../config/db');
const nadra = require('../integrations/nadra');
const router = express.Router();

router.get('/config', auth(), (_req, res) => {
  res.json(nadra.configPublic());
});

/**
 * POST /api/v1/nadra/verify
 * Body: { cnic, full_name?, date_of_birth?, father_name?, customer_id?, kyc_case_id? }
 */
router.post('/verify', auth(), requirePermission('kyc.write', 'cif.write', 'kyc.decide'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.cnic) return res.status(400).json({ error: 'cnic required' });

    const result = await nadra.verifyIdentity(b);

    // Persist audit + optional screening row
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS cbs_nadra_verifications (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          customer_id BIGINT UNSIGNED NULL,
          kyc_case_id BIGINT UNSIGNED NULL,
          cnic VARCHAR(20) NOT NULL,
          mode VARCHAR(20) NOT NULL,
          status VARCHAR(40) NOT NULL,
          verified TINYINT(1) NOT NULL DEFAULT 0,
          match_score DECIMAL(8,2) NULL,
          reference_no VARCHAR(80) NULL,
          result_json JSON NULL,
          requested_by VARCHAR(50) NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_cnic (cnic),
          KEY idx_cust (customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      await pool.query(
        `INSERT INTO cbs_nadra_verifications
          (customer_id, kyc_case_id, cnic, mode, status, verified, match_score, reference_no, result_json, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.customer_id || null,
          b.kyc_case_id || null,
          nadra.normalizeCnic(b.cnic),
          result.mode,
          result.status,
          result.verified ? 1 : 0,
          result.match_score || 0,
          result.reference || null,
          JSON.stringify(result),
          req.user?.userId || req.user?.id || null,
        ]
      );
    } catch (e) {
      // non-fatal audit failure
      result.audit_error = e.message;
    }

    // Auto-fill / update CIF when linked + verified
    if (b.customer_id && result.verified && result.citizen) {
      try {
        const c = result.citizen;
        await pool.query(
          `UPDATE cbs_customers SET
             full_name = COALESCE(?, full_name),
             father_or_husband = COALESCE(?, father_or_husband),
             dob = COALESCE(?, dob),
             gender = COALESCE(?, gender),
             address = COALESCE(?, address),
             cnic = COALESCE(?, cnic),
             kyc_status = 'verified'
           WHERE id = ?`,
          [
            c.full_name || null,
            c.father_or_husband || null,
            c.date_of_birth || null,
            c.gender ? String(c.gender).toUpperCase().charAt(0) : null,
            c.permanent_address || c.address || null,
            c.cnic || null,
            b.customer_id,
          ]
        );
        result.cif_updated = true;
      } catch (e) {
        result.cif_update_error = e.message;
      }
    } else if (b.customer_id && result.verified) {
      try {
        await pool.query(
          `UPDATE cbs_customers SET kyc_status = CASE
             WHEN kyc_status IN ('pending','rejected') THEN 'verified'
             ELSE kyc_status END
           WHERE id = ?`,
          [b.customer_id]
        );
      } catch (_) {}
    }

    if (b.kyc_case_id) {
      try {
        await pool.query(
          `UPDATE cbs_kyc_cases SET screening_status = ?, screening_result = ?, kyc_outcome = COALESCE(kyc_outcome, ?)
           WHERE id = ?`,
          [
            result.verified ? 'verified' : result.status,
            result.message,
            result.verified ? 'pending' : 'pending',
            b.kyc_case_id,
          ]
        );
      } catch (_) {}
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/history', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, customer_id, kyc_case_id, cnic, mode, status, verified, match_score, reference_no, requested_by, created_at
       FROM cbs_nadra_verifications
       ORDER BY id DESC LIMIT 200`
    ).catch(() => [[]]);
    res.json({ count: rows.length, rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
