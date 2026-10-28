const express = require('express');
const { auth } = require('../middleware/auth');
const clearing = require('../clearing/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/batches', auth(), async (req, res, next) => {
  try {
    res.json(
      await clearing.listBatches({
        direction: req.query.direction,
        status: req.query.status,
        limit: req.query.limit,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/batches/:id', auth(), async (req, res, next) => {
  try {
    const row = await clearing.getBatch(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/batches', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await clearing.createBatch({
        direction: b.direction,
        businessDate: b.business_date,
        branchCode: b.branch_code,
        narrative: b.narrative,
        createdBy: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/batches/:id/items', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await clearing.addItem({
        batchId: Number(req.params.id),
        chequeNo: b.cheque_no,
        chequeLeafId: b.cheque_leaf_id,
        accountId: b.account_id,
        amount: b.amount,
        payeeName: b.payee_name,
        drawerName: b.drawer_name,
        bankName: b.bank_name,
        narrative: b.narrative,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/batches/:id/submit', auth(), async (req, res, next) => {
  try {
    res.json(await clearing.submitBatch(Number(req.params.id), actor(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/batches/:id/settle', auth(), async (req, res, next) => {
  try {
    res.json(await clearing.settleBatch(Number(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/items/:id/decide', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(
      await clearing.decideItem({
        itemId: Number(req.params.id),
        decision: b.decision,
        bounceReason: b.bounce_reason,
        actor: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
