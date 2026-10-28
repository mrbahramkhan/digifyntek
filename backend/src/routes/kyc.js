const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const kyc = require('../kyc/service');
const router = express.Router();

function actor(req) {
  return req.user?.userId || req.user?.id || null;
}

router.get('/', auth(), async (req, res, next) => {
  try {
    res.json(await kyc.listCases({ status: req.query.status, limit: req.query.limit }));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const row = await kyc.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const row = await kyc.openCase({
      customerId: b.customer_id,
      caseType: b.case_type,
      riskRating: b.risk_rating,
      sourceOfFunds: b.source_of_funds,
      sourceOfWealth: b.source_of_wealth,
      purposeOfAccount: b.purpose_of_account,
      createdBy: actor(req),
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/documents', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.status(201).json(
      await kyc.addDocument({
        caseId: Number(req.params.id),
        docType: b.doc_type,
        docRef: b.doc_ref,
        fileName: b.file_name,
        notes: b.notes,
        uploadedBy: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/:id/in-review', auth(), async (req, res, next) => {
  try {
    res.json(await kyc.setInReview(Number(req.params.id), actor(req)));
  } catch (e) {
    next(e);
  }
});

router.patch('/screening/:screenId', auth(), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(
      await kyc.updateScreening({
        screenId: Number(req.params.screenId),
        status: b.status,
        matchScore: b.match_score,
        resultSummary: b.result_summary,
        evidenceNote: b.evidence_note,
        screenedBy: actor(req),
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/:id/decide', auth(), requirePermission('kyc.decide'), async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(
      await kyc.decideCase({
        caseId: Number(req.params.id),
        decision: b.decision,
        kycOutcome: b.kyc_outcome,
        riskRating: b.risk_rating,
        note: b.note,
        decidedBy: actor(req),
        nextReviewDate: b.next_review_date,
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
