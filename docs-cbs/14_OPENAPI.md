# OpenAPI snapshot

## Files

| Path | Purpose |
|------|---------|
| `backend/openapi/openapi.yaml` | OpenAPI 3.0.3 source |
| `phase1/openapi.yaml` | Static copy for GitHub Pages |
| `GET /api/openapi.yaml` | Served by API |
| `GET /api/catalog` | Lightweight JSON catalog |

## Auth

1. `POST /api/auth/login` with `{ "userId", "password" }`
2. Use `Authorization: Bearer <token>`

## Scope

Documents the **v1 CBS surface** (CIF, KYC, accounts, ledger, financing, TD, approvals, payments sim, teller, clearing, recon, EOD, RBAC).  
Legacy `/api/members` style routes exist but are not fully expanded in this snapshot.
