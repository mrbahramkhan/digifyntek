const express = require('express');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

const STAGES = [
  'application',
  'promise',
  'approved',
  'purchased',
  'sold',
  'delivered',
  'active',
  'settled',
  'cancelled',
];

const DEFAULT_CHECKLIST = [
  { step_code: 'asset_identified', step_title: 'Asset clearly identified (ḥalāl, quantity, specs)' },
  { step_code: 'waad_signed', step_title: 'Promise to purchase (waʿd) signed by member' },
  { step_code: 'mcl_checked', step_title: 'MCL / exposure check passed' },
  { step_code: 'approval_done', step_title: 'Facility approved by competent authority' },
  { step_code: 'supplier_invoice', step_title: 'Supplier invoice in society name (or valid agency)' },
  { step_code: 'ownership', step_title: 'Ownership / risk acquired by society before sale' },
  { step_code: 'cost_profit_disclosed', step_title: 'Cost and profit disclosed; sale price fixed' },
  { step_code: 'sale_contract', step_title: 'Murābaḥah sale contract signed' },
  { step_code: 'delivery', step_title: 'Delivery / possession note signed' },
  { step_code: 'schedule_issued', step_title: 'Payment schedule issued' },
  { step_code: 'no_riba_penalty', step_title: 'Late payment policy is cost/charity — not ribā income' },
];

async function ensureChecklist(loanId) {
  const [existing] = await pool.query(
    'SELECT COUNT(*) AS c FROM murabaha_checklist WHERE loan_id = :loanId',
    { loanId }
  );
  if (Number(existing[0].c) > 0) return;
  for (const s of DEFAULT_CHECKLIST) {
    await pool.query(
      `INSERT INTO murabaha_checklist (loan_id, step_code, step_title) VALUES (:loanId, :code, :title)`,
      { loanId, code: s.step_code, title: s.step_title }
    );
  }
}

/** List murābaḥah facilities */
router.get('/', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, m.full_name AS member_name, m.cnic, p.name AS product_name
       FROM loans l
       JOIN members m ON m.id = l.member_id
       JOIN loan_products p ON p.id = l.product_id
       WHERE l.org_id = :orgId AND l.mode = 'murabaha'
       ORDER BY l.id DESC LIMIT 200`,
      { orgId: req.user.orgId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Create murābaḥah application */
router.post('/', auth(), async (req, res) => {
  try {
    const b = req.body;
    const cost = Number(b.cost_amount || b.principal || 0);
    const profit = Number(b.profit_amount || 0);
    const sale = Number(b.sale_price || cost + profit);
    const loanNumber = b.loan_number || `IM-${Date.now().toString().slice(-8)}`;

    // MCL check
    const [[folio]] = await pool.query(
      `SELECT COALESCE(SUM(shares * face_value),0) AS capital FROM share_folios
       WHERE member_id=:mid AND status='active'`,
      { mid: b.member_id }
    );
    const [[ex]] = await pool.query(
      `SELECT COALESCE(SUM(outstanding),0) AS os FROM loans
       WHERE member_id=:mid AND status IN ('active','disbursed')`,
      { mid: b.member_id }
    );
    const capital = Number(folio.capital) || 0;
    const mcl_ok = capital === 0 || Number(ex.os) + sale <= capital * 10;

    let productId = b.product_id;
    if (!productId) {
      const [prods] = await pool.query(
        `SELECT id FROM loan_products WHERE org_id=:orgId AND mode='murabaha' AND is_active=1 LIMIT 1`,
        { orgId: req.user.orgId }
      );
      if (!prods.length) return res.status(400).json({ error: 'No murabaha product configured' });
      productId = prods[0].id;
    }

    const [r] = await pool.query(
      `INSERT INTO loans (
        org_id, vac_id, member_id, product_id, loan_number, mode,
        principal, outstanding, profit_or_interest,
        cost_amount, profit_amount, sale_price,
        underlying_asset, supplier_name, status, mcl_ok, murabaha_stage
      ) VALUES (
        :org_id, :vac_id, :member_id, :product_id, :loan_number, 'murabaha',
        :cost, :sale, :profit,
        :cost, :profit, :sale,
        :asset, :supplier, 'draft', :mcl_ok, 'application'
      )`,
      {
        org_id: req.user.orgId,
        vac_id: b.vac_id || 1,
        member_id: b.member_id,
        product_id: productId,
        loan_number: loanNumber,
        cost,
        profit,
        sale,
        asset: b.underlying_asset || null,
        supplier: b.supplier_name || null,
        mcl_ok: mcl_ok ? 1 : 0,
      }
    );
    await ensureChecklist(r.insertId);
    res.status(201).json({ id: r.insertId, loan_number: loanNumber, sale_price: sale, mcl_ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Get one + checklist + docs */
router.get('/:id', auth(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, m.full_name AS member_name, m.cnic FROM loans l
       JOIN members m ON m.id = l.member_id WHERE l.id=:id AND l.mode='murabaha'`,
      { id: req.params.id }
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await ensureChecklist(req.params.id);
    const [checklist] = await pool.query(
      'SELECT * FROM murabaha_checklist WHERE loan_id=:id ORDER BY id',
      { id: req.params.id }
    );
    const [docs] = await pool.query(
      'SELECT * FROM murabaha_docs WHERE loan_id=:id ORDER BY id',
      { id: req.params.id }
    );
    const [schedule] = await pool.query(
      'SELECT * FROM loan_schedules WHERE loan_id=:id ORDER BY installment_no',
      { id: req.params.id }
    );
    res.json({ facility: rows[0], checklist, docs, schedule, stages: STAGES });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Advance stage with validation */
router.post('/:id/stage', auth(), async (req, res) => {
  try {
    const { stage } = req.body;
    if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

    const [[loan]] = await pool.query(`SELECT * FROM loans WHERE id=:id AND mode='murabaha'`, {
      id: req.params.id,
    });
    if (!loan) return res.status(404).json({ error: 'Not found' });

    // Gate: cannot mark sold without ownership
    if (['sold', 'delivered', 'active'].includes(stage) && !loan.ownership_confirmed) {
      return res.status(400).json({
        error: 'Ownership must be confirmed before sale/delivery (Sharīʿah control)',
      });
    }
    if (['sold', 'delivered', 'active'].includes(stage)) {
      if (!loan.cost_amount || !loan.sale_price) {
        return res.status(400).json({ error: 'Cost and sale price required' });
      }
    }

    const statusMap = {
      application: 'draft',
      promise: 'draft',
      approved: 'approved',
      purchased: 'approved',
      sold: 'approved',
      delivered: 'disbursed',
      active: 'active',
      settled: 'settled',
      cancelled: 'rejected',
    };

    await pool.query(
      `UPDATE loans SET murabaha_stage=:stage, status=COALESCE(:st, status) WHERE id=:id`,
      { stage, st: statusMap[stage] || null, id: req.params.id }
    );
    res.json({ ok: true, stage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Confirm purchase / ownership */
router.post('/:id/purchase', auth(), async (req, res) => {
  try {
    const b = req.body;
    await pool.query(
      `UPDATE loans SET
        supplier_name = COALESCE(:supplier, supplier_name),
        supplier_invoice_ref = :invoice,
        purchase_date = COALESCE(:purchase_date, CURDATE()),
        ownership_confirmed = 1,
        cost_amount = COALESCE(:cost, cost_amount),
        profit_amount = COALESCE(:profit, profit_amount),
        sale_price = COALESCE(:sale, sale_price),
        principal = COALESCE(:cost, principal),
        profit_or_interest = COALESCE(:profit, profit_or_interest),
        outstanding = COALESCE(:sale, outstanding),
        murabaha_stage = 'purchased',
        underlying_asset = COALESCE(:asset, underlying_asset)
       WHERE id = :id AND mode = 'murabaha'`,
      {
        id: req.params.id,
        supplier: b.supplier_name || null,
        invoice: b.supplier_invoice_ref || null,
        purchase_date: b.purchase_date || null,
        cost: b.cost_amount != null ? Number(b.cost_amount) : null,
        profit: b.profit_amount != null ? Number(b.profit_amount) : null,
        sale: b.sale_price != null ? Number(b.sale_price) : null,
        asset: b.underlying_asset || null,
      }
    );
    await pool.query(
      `UPDATE murabaha_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code IN ('supplier_invoice','ownership')`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Execute sale + optional schedule generation */
router.post('/:id/sell', auth(), async (req, res) => {
  try {
    const [[loan]] = await pool.query(`SELECT * FROM loans WHERE id=:id AND mode='murabaha'`, {
      id: req.params.id,
    });
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!loan.ownership_confirmed) {
      return res.status(400).json({ error: 'Confirm ownership before sale' });
    }

    const installments = Number(req.body.installments || 0);
    const firstDue = req.body.first_due_date || null;

    await pool.query(
      `UPDATE loans SET murabaha_stage='sold', status='approved' WHERE id=:id`,
      { id: req.params.id }
    );
    await pool.query(
      `UPDATE murabaha_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code IN ('cost_profit_disclosed','sale_contract')`,
      { id: req.params.id }
    );

    if (installments > 0 && loan.sale_price) {
      await pool.query(`DELETE FROM loan_schedules WHERE loan_id=:id`, { id: req.params.id });
      const each = Math.round((Number(loan.sale_price) / installments) * 100) / 100;
      let remaining = Number(loan.sale_price);
      const start = firstDue ? new Date(firstDue) : new Date();
      for (let i = 1; i <= installments; i++) {
        const amt = i === installments ? remaining : each;
        remaining = Math.round((remaining - amt) * 100) / 100;
        const due = new Date(start);
        due.setMonth(due.getMonth() + (i - 1));
        await pool.query(
          `INSERT INTO loan_schedules (loan_id, installment_no, due_date, principal_due, profit_due, total_due, status)
           VALUES (:id, :n, :due, :amt, 0, :amt, 'pending')`,
          { id: req.params.id, n: i, due: due.toISOString().slice(0, 10), amt }
        );
      }
      await pool.query(
        `UPDATE murabaha_checklist SET is_done=1, done_at=NOW()
         WHERE loan_id=:id AND step_code='schedule_issued'`,
        { id: req.params.id }
      );
    }

    // Instrument
    await pool.query(
      `INSERT INTO instruments (org_id, instrument_no, inst_type, member_id, loan_id, amount_or_shares, issue_date, status)
       VALUES (:org, :no, 'loan_agreement', :mid, :lid, :amt, CURDATE(), 'active')`,
      {
        org: req.user.orgId,
        no: `LA-M-${req.params.id}-${Date.now().toString().slice(-4)}`,
        mid: loan.member_id,
        lid: req.params.id,
        amt: loan.sale_price,
      }
    );

    res.json({ ok: true, stage: 'sold' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Delivery → active */
router.post('/:id/deliver', auth(), async (req, res) => {
  try {
    await pool.query(
      `UPDATE loans SET delivery_date=COALESCE(:d, CURDATE()), murabaha_stage='active',
        status='active', disbursed_at=COALESCE(disbursed_at, CURDATE())
       WHERE id=:id AND mode='murabaha'`,
      { id: req.params.id, d: req.body.delivery_date || null }
    );
    await pool.query(
      `UPDATE murabaha_checklist SET is_done=1, done_at=NOW()
       WHERE loan_id=:id AND step_code='delivery'`,
      { id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Toggle checklist item */
router.patch('/:id/checklist/:stepId', auth(), async (req, res) => {
  try {
    const done = req.body.is_done ? 1 : 0;
    await pool.query(
      `UPDATE murabaha_checklist SET is_done=:done, done_at=IF(:done=1, NOW(), NULL)
       WHERE id=:stepId AND loan_id=:loanId`,
      { done, stepId: req.params.stepId, loanId: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
