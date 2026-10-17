# KYC case workflow

## Lifecycle

`open` → `pending_docs` → `in_review` → `approved` | `rejected` → (`closed`)

## KYC outcome (customer-facing)

`pending` | `verified` | `rejected` | `unavailable` | `manual_review`

These are **explicit states**. The system does not call NADRA or claim live identity verification.

## Screening

On case open, SANCTIONS + PEP rows are created as `pending`.

Statuses: `pending` | `clear` | `match` | `unavailable` | `manual_review`

**Approve blocked** while any screening is still `pending` or `match` (must clear or mark manual_review).

## API

```
POST /api/v1/kyc
GET  /api/v1/kyc
GET  /api/v1/kyc/:id
POST /api/v1/kyc/:id/documents
POST /api/v1/kyc/:id/in-review
PATCH /api/v1/kyc/screening/:screenId
POST /api/v1/kyc/:id/decide
```

Decision updates `cbs_customers.kyc_status` and may set customer `restricted` on reject.
