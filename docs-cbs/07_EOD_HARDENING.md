# EOD hardening

## Guarantees

1. **Idempotent close** — A successful EOD for `(org, business_date)` cannot be re-run to duplicate steps or advance the date again. Second call returns the prior success payload with `idempotent: true`.
2. **Trial balance gate** — Native ledger trial balance must balance (`total_debit === total_credit`) before the day advances. Override only with explicit `force_unbalanced: true` (recorded in steps).
3. **Pending approvals gate** — `cbs_approval_requests` with status `PENDING` block close unless `force_pending_approvals: true`.
4. **Calendar** — Status moves `open → closing → open` (next date). On gate failure, calendar returns to `open` without advancing the date.
5. **Execution id** — `EOD-{org}-{YYYY-MM-DD}` recorded in notes for correlation.

## API

```
GET  /api/eod/status   # includes gates[], trial_balance, prior_success_run
POST /api/eod/run      # body: business_date, skip_accrual, force_unbalanced?, force_pending_approvals?
```

## Not yet full bank MEOD

Interest accrual remains a marker until product-rate engines post real accrual journals. Legacy day-end posting still used when `DB_MODE=legacy`.
