# DigiFyntek system map

## Runtime

```
Browser (phase1 UI)
    │  JWT
    ▼
Express API (:4000)
    │
    ├─ Native schema (digifyntek)     OR
    └─ Legacy mode (tbl_farmer, tbl_loanaccount, …)
    │
    MySQL 8
```

## Backend layout

```
backend/src/
  server.js
  routes/     auth, members, loans, core, cbs, mfb, instruments, …
  legacy/     Digital Kisaan query adapters + posting
  cbs/        Temenos-style service
  mfb/        Prudential engine
  middleware/ auth, validate, rate limit
  config/     env, db
sql/
  01_schema … 07_mfb_prudential
```

## Auth

`POST /api/auth/login` `{ userId, password }` → JWT  
Header: `Authorization: Bearer <token>`

## Feature flags

| Env | Effect |
|-----|--------|
| `DB_MODE=legacy` | Use Digital Kisaan tables |
| `DB_NAME=digifyntek` | Database name |
| `LEGACY_SCHEMA=1` | Same as legacy mode |

## Status

End-to-end application: CRM → credit → ledger → CBS → MFB prudential → chequebooks → Islamic → governance.
