const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const payments = require('../payments/service');
const router = express.Router();

router.get('/', auth(), async (req, res, next) => {
  try {
    res.json(await payments.listPayments({ channel: req.query.channel, limit: req.query.limit }));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const row = await payments.getPayment(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

/** Raast outbound — SIMULATOR only */
router.post('/raast/outbound', auth(), requirePermission('payments.post'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await payments.initiateRaastOutbound({
      amount: b.amount,
      debtorAccountId: b.debtor_account_id,
      debtorIban: b.debtor_iban,
      creditorIban: b.creditor_iban,
      creditorName: b.creditor_name,
      raastId: b.raast_id,
      narrative: b.narrative,
      businessDate: b.business_date,
      createdBy: req.user?.userId || req.user?.id,
      idempotencyKey: b.idempotency_key || req.headers['idempotency-key'],
      postOnSimulatedSettle: b.post_ledger !== false,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/meta/channels', auth(), async (_req, res) => {
  res.json({
    channels: [
      {
        code: 'RAAST',
        mode: 'SIMULATOR',
        live: false,
        note: 'Requires bank-authorized Raast participation for production',
      },
      { code: 'PRISM', mode: 'STUB', live: false, note: 'Adapter not implemented' },
      { code: 'ONELINK', mode: 'STUB', live: false, note: 'Adapter not implemented' },
    ],
  });
});

module.exports = router;
