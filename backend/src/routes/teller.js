const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const teller = require('../teller/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/tellers', auth(), async (req, res, next) => {
  try {
    res.json(await teller.listTellers(req.query.branch_code));
  } catch (e) {
    next(e);
  }
});

router.get('/vault', auth(), async (req, res, next) => {
  try {
    res.json(await teller.vaultStatus(req.query.branch_code || '001'));
  } catch (e) {
    next(e);
  }
});

router.get('/drawers', auth(), async (req, res, next) => {
  try {
    res.json(
      await teller.listDrawers({
        branchCode: req.query.branch_code,
        businessDate: req.query.business_date,
        status: req.query.status,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/drawers/:id', auth(), async (req, res, next) => {
  try {
    const row = await teller.getDrawer(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/open', auth(), requirePermission('teller.ops'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.opening_balance == null || Number(b.opening_balance) < 0) {
      return res.status(400).json({ error: 'opening_balance required (>= 0)' });
    }
    res.status(201).json(
      await teller.openDrawer({
        tellerId: b.teller_id || actor(req),
        branchCode: b.branch_code || '001',
        businessDate: b.business_date,
        openingBalance: Number(b.opening_balance),
        actor: actor(req),
        denomJson: b.denominations,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/:id/vault-in', auth(), async (req, res, next) => {
  try {
    if (req.body?.amount == null || Number(req.body.amount) <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }
    res.json(
      await teller.vaultToTeller({
        drawerId: Number(req.params.id),
        amount: req.body?.amount,
        actor: actor(req),
        narrative: req.body?.narrative,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/:id/vault-out', auth(), async (req, res, next) => {
  try {
    if (req.body?.amount == null || Number(req.body.amount) <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }
    res.json(
      await teller.tellerToVault({
        drawerId: Number(req.params.id),
        amount: req.body?.amount,
        actor: actor(req),
        narrative: req.body?.narrative,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/:id/deposit', auth(), requirePermission('teller.ops', 'casa.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.account_id) return res.status(400).json({ error: 'account_id required' });
    if (b.amount == null || Number(b.amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
    if (!b.narrative || !String(b.narrative).trim()) return res.status(400).json({ error: 'narrative/purpose required (SBP)' });
    if (Number(b.amount) >= 1000000 && String(b.narrative).length < 12) {
      return res.status(400).json({ error: 'Large cash (>= 1,000,000) needs detailed narrative' });
    }
    res.status(201).json(
      await teller.customerCashDeposit({
        drawerId: Number(req.params.id),
        accountId: b.account_id,
        amount: b.amount,
        actor: actor(req),
        narrative: b.narrative,
        businessDate: b.business_date,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/:id/withdraw', auth(), requirePermission('teller.ops', 'casa.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.account_id) return res.status(400).json({ error: 'account_id required' });
    if (b.amount == null || Number(b.amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
    if (!b.narrative || !String(b.narrative).trim()) return res.status(400).json({ error: 'narrative/purpose required (SBP)' });
    if (Number(b.amount) >= 1000000 && String(b.narrative).length < 12) {
      return res.status(400).json({ error: 'Large cash (>= 1,000,000) needs detailed narrative' });
    }
    res.status(201).json(
      await teller.customerCashWithdraw({
        drawerId: Number(req.params.id),
        accountId: b.account_id,
        amount: b.amount,
        actor: actor(req),
        narrative: b.narrative,
        businessDate: b.business_date,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/drawers/:id/close', auth(), requirePermission('teller.ops'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.counted_balance == null || Number(b.counted_balance) < 0) {
      return res.status(400).json({ error: 'counted_balance required for drawer close' });
    }
    res.json(
      await teller.closeDrawer({
        drawerId: Number(req.params.id),
        countedBalance: Number(b.counted_balance),
        actor: actor(req),
        narrative: b.narrative,
        denomJson: b.denominations,
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
