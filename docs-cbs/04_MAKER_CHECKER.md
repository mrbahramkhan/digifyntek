# Maker-checker module

## Rules

1. Requests are stored in `cbs_approval_requests` with status `PENDING`.
2. **Maker cannot approve or reject their own request** (HTTP 403).
3. On **APPROVED**, server executes the financial payload exactly once (disburse, repay, transfer, journal, CASA).
4. On **REJECTED**, no financial posting.
5. Maker may **CANCEL** only while `PENDING`.
6. Audit events: `APPROVAL_SUBMIT`, `APPROVAL_APPROVE`, `APPROVAL_REJECT`.

## API

| Method | Path | Role |
|--------|------|------|
| POST | `/api/v1/approvals` | Maker submit |
| GET | `/api/v1/approvals?status=PENDING` | Queue list |
| POST | `/api/v1/approvals/:id/approve` | Checker |
| POST | `/api/v1/approvals/:id/reject` | Checker |
| POST | `/api/v1/approvals/:id/cancel` | Maker |

## Note

Direct posting APIs remain available for system/automation use. Dual-control operations should go through this queue.
