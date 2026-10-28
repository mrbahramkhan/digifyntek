const express = require('express');
const { auth } = require('../middleware/auth');
const recon = require('../recon/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/statements', auth(), async (req, res, next) => {
  try {
    res.json(await recon.listStatements({ status: req.query.status, limit: req.query.limit }));
  } catch (e) {
    next(e);
  }
});

router.get('/statements/:id', auth(), async (req, res, next) => {
  try {
    const row = await recon.getStatement(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/statements', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await recon.createStatement({
        sourceType: b.source_type,
        sourceName: b.source_name,
        statementDate: b.statement_date,
        openingBalance: b.opening_balance,
        closingBalance: b.closing_balance,
        currency: b.currency,
        notes: b.notes,
        createdBy: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/statements/:id/lines', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await recon.addLine({
        statementId: Number(req.params.id),
        valueDate: b.value_date,
        amount: b.amount,
        drCr: b.dr_cr,
        externalRef: b.external_ref,
        narrative: b.narrative,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/candidates', auth(), async (req, res, next) => {
  try {
    res.json(
      await recon.candidateJournals({
        amount: req.query.amount,
        externalRef: req.query.external_ref,
        fromDate: req.query.from_date,
        toDate: req.query.to_date,
        limit: req.query.limit,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/match', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(
      await recon.manualMatch({
        lineId: b.line_id,
        journalId: b.journal_id,
        actor: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/statements/:id/auto-match', auth(), async (req, res, next) => {
  try {
    res.json(await recon.autoMatch(Number(req.params.id), actor(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/lines/:id/exclude', auth(), async (req, res, next) => {
  try {
    res.json(await recon.excludeLine(Number(req.params.id), actor(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/statements/:id/close', auth(), async (req, res, next) => {
  try {
    res.json(await recon.closeStatement(Number(req.params.id)));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
