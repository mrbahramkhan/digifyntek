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
    const decision = String(b.decision || '').toLowerCase();
    if (!['approve', 'reject', 'refer'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve | reject | refer' });
    }
    if (decision === 'reject' && (!b.note || String(b.note).trim().length < 5)) {
      return res.status(400).json({ error: 'Rejection requires compliance note (min 5 chars)' });
    }
    if (decision === 'refer' && (!b.note || String(b.note).trim().length < 5)) {
      return res.status(400).json({ error: 'EDD / refer requires note' });
    }
    if (decision === 'approve' && String(b.risk_rating || '').toLowerCase() === 'high' && (!b.note || String(b.note).trim().length < 5)) {
      return res.status(400).json({ error: 'High-risk approval requires EDD note' });
    }
    // service expects approved|rejected (not approve|reject)
    const mapped =
      decision === 'approve' ? 'approved' :
      decision === 'reject' ? 'rejected' :
      decision; // refer handled above as note-only path if service supports
    if (decision === 'refer') {
      return res.status(400).json({ error: 'Use reject with note for EDD refer, or extend service for refer status' });
    }
    res.json(
      await kyc.decideCase({
        caseId: Number(req.params.id),
        decision: mapped,
        kycOutcome: b.kyc_outcome || (decision === 'approve' ? 'verified' : 'rejected'),
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
