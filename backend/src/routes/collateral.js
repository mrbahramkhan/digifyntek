/**
 * Collateral / security — SBP-oriented registration
 * Supports CBS customer_id payload from DigiFyntek workbench.
 */
const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

async function ensureCbsCollateral() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cbs_collateral (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customer_id BIGINT UNSIGNED NOT NULL,
        facility_ref VARCHAR(80) NULL,
        collateral_type VARCHAR(40) NOT NULL,
        description VARCHAR(255) NOT NULL,
        market_value DECIMAL(18,2) NOT NULL DEFAULT 0,
        forced_sale_value DECIMAL(18,2) NULL,
        valuation_date DATE NULL,
        valuer VARCHAR(120) NULL,
        ownership_proof TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by VARCHAR(50) NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_col_cust (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (_) {}
}

function validateCollateral(b) {
  if (!b.customer_id && !b.member_id) return 'customer_id required';
  const type = b.collateral_type || b.coll_type;
  if (!type) return 'collateral type required';
  const desc = b.description || b.desc;
  if (!desc || String(desc).trim().length < 5) return 'description / title details required (min 5 chars)';
  const val = Number(b.value != null ? b.value : b.declared_value != null ? b.declared_value : b.market_value);
  if (!(val > 0)) return 'market / declared value must be greater than zero';
  const fsv = Number(b.forced_sale_value != null ? b.forced_sale_value : val);
  if (fsv > val * 1.05) return 'forced sale value cannot exceed market value';
  // Property / vehicle need ownership proof for SBP-style security perfection
  const t = String(type).toLowerCase();
  if ((t === 'property' || t === 'vehicle') && !(b.ownership_proof === true || b.ownership_proof === 1 || b.ownership_proof === '1')) {
    return 'Property/vehicle collateral requires ownership proof on file';
  }
  if (val >= 1000000 && !b.valuer && !b.valuation_date) {
    return 'Collateral >= 1,000,000 requires valuer and/or valuation date';
  }
  return null;
}

router.get('/', auth(), async (req, res) => {
  try {
    await ensureCbsCollateral();
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    try {
      const [rows] = await pool.query(
        `SELECT c.*, cu.full_name, cu.cnic
         FROM cbs_collateral c
         LEFT JOIN cbs_customers cu ON cu.id = c.customer_id
         ORDER BY c.id DESC LIMIT ?`,
        [limit]
      );
      return res.json(rows);
    } catch (e) {
      // legacy fallback
      const [rows] = await pool.query(
        `SELECT c.*, m.full_name FROM collaterals c
         LEFT JOIN members m ON m.id = c.member_id
         ORDER BY c.id DESC LIMIT ?`,
        [limit]
      );
      res.json(rows);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth(), async (req, res) => {
  try {
    await ensureCbsCollateral();
    const b = req.body || {};
    const verr = validateCollateral(b);
    if (verr) return res.status(400).json({ error: verr });

    const customerId = b.customer_id || b.member_id;
    // CIF must exist and not rejected
    try {
      const [[cust]] = await pool.query(
        `SELECT id, kyc_status, status FROM cbs_customers WHERE id = ?`,
        [customerId]
      );
      if (!cust) return res.status(400).json({ error: 'CIF not found' });
      if (String(cust.kyc_status || '').toLowerCase() === 'rejected') {
        return res.status(400).json({ error: 'Cannot register collateral for KYC-rejected customer' });
      }
    } catch (_) {}

    const type = b.collateral_type || b.coll_type;
    const val = Number(b.value != null ? b.value : b.market_value != null ? b.market_value : b.declared_value);
    const fsv = Number(b.forced_sale_value != null ? b.forced_sale_value : val);
    const [ins] = await pool.query(
      `INSERT INTO cbs_collateral
        (customer_id, facility_ref, collateral_type, description, market_value, forced_sale_value,
         valuation_date, valuer, ownership_proof, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        customerId,
        b.facility_ref || b.loan_id || null,
        type,
        b.description,
        val,
        fsv,
        b.valuation_date || null,
        b.valuer || null,
        b.ownership_proof === true || b.ownership_proof === 1 || b.ownership_proof === '1' ? 1 : 0,
        req.user?.userId || null,
      ]
    );
    const [[row]] = await pool.query(`SELECT * FROM cbs_collateral WHERE id = ?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
