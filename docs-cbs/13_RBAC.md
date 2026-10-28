# RBAC role matrix

## Roles

| Role | Intent |
|------|--------|
| superadmin / admin | Full access (`*`) |
| ops_manager | Approvals, EOD, oversight |
| teller | Cash drawer, CASA cash |
| credit_officer | CIF, loans, TD |
| compliance | KYC decide |
| accountant | Ledger, recon, EOD |
| viewer | Read-only |

## Middleware

```js
auth()
requirePermission('loan.disburse')
requirePermission('teller.ops', 'casa.post') // any-of
```

## Gated operations

- Loan disburse / repay
- EOD run
- Approval decide
- Ledger post / reverse
- Teller open/close/deposit/withdraw
- KYC decide
- Payments outbound
- Term deposit place/settle

## API

```
GET /api/v1/rbac/me
GET /api/v1/rbac/matrix
GET /api/v1/rbac/roles
GET /api/v1/rbac/permissions
```

Matrix loads from `cbs_role_permissions` with 60s cache; falls back to in-memory matrix if tables missing.
