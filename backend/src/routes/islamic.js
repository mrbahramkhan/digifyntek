const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

const CHECKLISTS = {
  salam: [
    { step_code: 'commodity_defined', step_title: 'Commodity quantity, quality, delivery date fixed' },
    { step_code: 'price_paid_upfront', step_title: 'Full salam price paid in advance by society' },
    { step_code: 'no_spot_commodity', step_title: 'Not a sale of existing specific inventory already owned by seller in prohibited way' },
    { step_code: 'delivery_terms', step_title: 'Delivery place and date agreed' },
    { step_code: 'contract_signed', step_title: 'Salam contract signed by both parties' },
  ],
  ijarah: [
    { step_code: 'asset_owned', step_title: 'Society owns / acquires asset before lease' },
    { step_code: 'rent_fixed', step_title: 'Rent amount and frequency agreed (not interest)' },
    { step_code: 'usufruct_clear', step_title: 'Usufruct / use rights clearly defined' },
    { step_code: 'maintenance', step_title: 'Maintenance responsibilities documented' },
    { step_code: 'lease_signed', step_title: 'Ijārah contract signed' },
  ],
  qard_hasan: [
    { step_code: 'zero_profit', step_title: 'Profit rate is 0% — qard ḥasan only' },
    { step_code: 'admin_fee_actual', step_title: 'Admin fee limited to actual cost (if any)' },
    { step_code: 'purpose_recorded', step_title: 'Purpose recorded (emergency / enterprise / agri)' },
    { step_code: 'guarantor_optional', step_title: 'Guarantor / social collateral documented if required' },
    { step_code: 'agreement_signed', step_title: 'Qard agreement signed' },
  ],
};

async function ensureChecklist(loanId, mode) {
  const steps = CHECKLISTS[mode];
  if (!steps) return;
  const [ex] = await pool.query(
    'SELECT COUNT(*) AS c FROM islamic_checklist WHERE loan_id=:id',
    { id: loanId }
  );
  if (Number(ex[0].c) > 0) return;
  for (const s of steps) {
    await pool.query(
      `INSERT INTO islamic_checklist (loan_id, mode, step_code, step_title)
       VALUES (:id, :mode, :code, :title)`,
      { id: loanId, mode, code: s.step_code, title: s.step_title }
    );
  }
}

async function listByMode(mode, orgId) {
  const [rows] = await pool.query(
    `SELECT l.*, m.full_name AS member_name, m.cnic, p.name AS product_name
     FROM loans l
     JOIN members m ON m.id = l.member_id
     JOIN loan_products p ON p.id = l.product_id
     WHERE l.org_id = :orgId AND l.mode = :mode
     ORDER BY l.id DESC LIMIT 200`,
    { orgId, mode }
  );
  return rows;
}

/** SALAM */
router.get('/salam', auth(), async (req, res) => {
  try {
    res.json(await listByMode('salam', req.user.orgId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/salam', auth(), async (req, res) => {
  try {
    const b = req.body;
    const price = Number(b.sale_price || b.principal || 0);
    const loanNumber = b.loan_number || `SL-${Date.now().toString().slice(-8)}`;
    let productId = b.product_id;
    if (!productId) {
      const [p] = await pool.query(
        `SELECT id FROM loan_products WHERE org_id=:o AND mode='salam' AND is_active=1 LIMIT 1`,
        { o: req.user.orgId }
      );
      if (!p.length) return res.status(400).json({ error: 'No salam product — seed/create loan_products mode=salam' });
      productId = p[0].id;
    }
    const [r] = await pool.query(
      `INSERT INTO loans (
        org_id, vac_id, member_id, product_id, loan_number, mode,
        principal, outstanding, profit_or_interest, sale_price,
        underlying_asset, quantity, unit, delivery_place, quality_specs,
        maturity_at, status, islamic_stage
      ) VALUES (
        :org, :vac, :mid, :pid, :no, 'salam',
        :price, :price, 0, :price,
        :asset, :qty, :unit, :place, :quality,
        :maturity, 'draft', 'application'
      )`,
      {
        org: req.user.orgId,
        vac: b.vac_id || 1,
        mid: b.member_id,
        pid: productId,
        no: loanNumber,
        price,
        asset: b.underlying_asset || b.commodity || null,
        qty: b.quantity || null,
        unit: b.unit || 'maund',
        place: b.delivery_place || null,
        quality: b.quality_specs || null,
        maturity: b.delivery_date || null,
      }
    );
    await ensureChecklist(r.insertId, 'salam');
    res.status(201).json({ id: r.insertId, loan_number: loanNumber });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/salam/:id/pay-advance', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET status='disbursed', islamic_stage='price_paid', disbursed_at=CURDATE()
       WHERE id=:id AND mode='salam'`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE islamic_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code='price_paid_upfront'`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/salam/:id/receive-delivery', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET status='settled', islamic_stage='delivered', delivery_date=CURDATE(), outstanding=0
       WHERE id=:id AND mode='salam'`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE islamic_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code='delivery_terms'`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** IJARAH */
router.get('/ijarah', auth(), async (req, res) => {
  try {
    res.json(await listByMode('ijarah', req.user.orgId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ijarah', auth(), async (req, res) => {
  try {
    const b = req.body;
    const rent = Number(b.rent_amount || 0);
    const months = Number(b.tenor_months || 12);
    const total = rent * months;
    const loanNumber = b.loan_number || `IJ-${Date.now().toString().slice(-8)}`;
    let productId = b.product_id;
    if (!productId) {
      const [p] = await pool.query(
        `SELECT id FROM loan_products WHERE org_id=:o AND mode='ijarah' AND is_active=1 LIMIT 1`,
        { o: req.user.orgId }
      );
      if (!p.length) return res.status(400).json({ error: 'No ijarah product configured' });
      productId = p[0].id;
    }
    const [r] = await pool.query(
      `INSERT INTO loans (
        org_id, vac_id, member_id, product_id, loan_number, mode,
        principal, outstanding, profit_or_interest,
        lease_asset_desc, underlying_asset, rent_amount, rent_frequency,
        status, islamic_stage, ownership_confirmed
      ) VALUES (
        :org, :vac, :mid, :pid, :no, 'ijarah',
        :total, :total, 0,
        :asset, :asset, :rent, :freq,
        'draft', 'application', 0
      )`,
      {
        org: req.user.orgId,
        vac: b.vac_id || 1,
        mid: b.member_id,
        pid: productId,
        no: loanNumber,
        total,
        asset: b.lease_asset_desc || b.underlying_asset || null,
        rent,
        freq: b.rent_frequency || 'monthly',
      }
    );
    await ensureChecklist(r.insertId, 'ijarah');
    res.status(201).json({ id: r.insertId, loan_number: loanNumber, total_rent: total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ijarah/:id/acquire-asset', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET ownership_confirmed=1, islamic_stage='asset_owned',
        purchase_date=CURDATE() WHERE id=:id AND mode='ijarah'`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE islamic_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code='asset_owned'`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ijarah/:id/activate', auth(), async (req, res) => {
  try {
    const [[loan]] = await pool.query(`SELECT * FROM loans WHERE id=:id AND mode='ijarah'`, {
      id: req.params.id,
    });
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!loan.ownership_confirmed) {
      return res.status(400).json({ error: 'Acquire/own asset before activating lease' });
    }
    const months = Number(req.body.installments || 12);
    const rent = Number(loan.rent_amount || 0);
    await pool.query(`DELETE FROM loan_schedules WHERE loan_id=:id`, { id: req.params.id });
    const start = req.body.first_due_date ? new Date(req.body.first_due_date) : new Date();
    for (let i = 1; i <= months; i++) {
      const due = new Date(start);
      due.setMonth(due.getMonth() + (i - 1));
      await pool.query(
        `INSERT INTO loan_schedules (loan_id, installment_no, due_date, principal_due, profit_due, total_due, status)
         VALUES (:id, :n, :due, 0, :rent, :rent, 'pending')`,
        { id: req.params.id, n: i, due: due.toISOString().slice(0, 10), rent }
      );
    }
    await pool.query(
      `UPDATE loans SET status='active', islamic_stage='active', disbursed_at=CURDATE() WHERE id=:id`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE islamic_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code IN ('rent_fixed','lease_signed')`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** QARD HASAN */
router.get('/qard', auth(), async (req, res) => {
  try {
    res.json(await listByMode('qard_hasan', req.user.orgId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/qard', auth(), async (req, res) => {
  try {
    const b = req.body;
    const amount = Number(b.principal || b.amount || 0);
    const adminFee = Number(b.admin_fee || 0);
    const loanNumber = b.loan_number || `QH-${Date.now().toString().slice(-8)}`;
    let productId = b.product_id;
    if (!productId) {
      const [p] = await pool.query(
        `SELECT id FROM loan_products WHERE org_id=:o AND mode='qard_hasan' AND is_active=1 LIMIT 1`,
        { o: req.user.orgId }
      );
      if (!p.length) return res.status(400).json({ error: 'No qard_hasan product configured' });
      productId = p[0].id;
    }
    const [r] = await pool.query(
      `INSERT INTO loans (
        org_id, vac_id, member_id, product_id, loan_number, mode,
        principal, outstanding, profit_or_interest, admin_fee,
        underlying_asset, status, islamic_stage
      ) VALUES (
        :org, :vac, :mid, :pid, :no, 'qard_hasan',
        :amt, :amt, 0, :fee,
        :purpose, 'pending_approval', 'application'
      )`,
      {
        org: req.user.orgId,
        vac: b.vac_id || 1,
        mid: b.member_id,
        pid: productId,
        no: loanNumber,
        amt: amount,
        fee: adminFee,
        purpose: b.purpose || b.underlying_asset || 'Qard hasan',
      }
    );
    await ensureChecklist(r.insertId, 'qard_hasan');
    res.status(201).json({ id: r.insertId, loan_number: loanNumber, profit: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/qard/:id/disburse', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET status='active', islamic_stage='active', disbursed_at=CURDATE(),
        profit_or_interest=0 WHERE id=:id AND mode='qard_hasan'`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE islamic_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code='zero_profit'`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Shared: get detail + checklist */
router.get('/facility/:id', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, m.full_name AS member_name FROM loans l
       JOIN members m ON m.id = l.member_id WHERE l.id=:id`,
      { id: req.params.id }
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const mode = rows[0].mode;
    if (CHECKLISTS[mode]) await ensureChecklist(req.params.id, mode);
    const [checklist] = await pool.query(
      'SELECT * FROM islamic_checklist WHERE loan_id=:id ORDER BY id',
      { id: req.params.id }
    );
    const [schedule] = await pool.query(
      'SELECT * FROM loan_schedules WHERE loan_id=:id ORDER BY installment_no',
      { id: req.params.id }
    );
    res.json({ facility: rows[0], checklist, schedule });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/facility/:id/checklist/:stepId', auth(), async (req, res) => {
  try {
    const done = req.body.is_done ? 1 : 0;
    await pool.query(
      `UPDATE islamic_checklist SET is_done=:done, done_at=IF(:done=1, NOW(), NULL)
       WHERE id=:sid AND loan_id=:lid`,
      { done, sid: req.params.stepId, lid: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
