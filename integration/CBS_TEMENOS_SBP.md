# DigiFyntek CBS — Temenos-style basic core (SBP-oriented)

## Scope (basic)

| Module | Capability |
|--------|------------|
| CIF | Customer create, KYC status, AML risk, PEP flag |
| Accounts | Open savings/current/loan/share/islamic |
| Products | Product catalog |
| Transactions | Branch transfer (posted), channel field |
| Integrations | Registry: NADRA, SBP, Raast, 1Link, SMS (sandbox) |
| SBP controls | Checklist: KYC/AML, prudential, reporting, Islamic, payments, consumer, ops |

## API

```
GET/POST  /api/cbs/customers
POST      /api/cbs/customers/import-legacy
GET/POST  /api/cbs/accounts
GET       /api/cbs/products
GET       /api/cbs/transactions
POST      /api/cbs/transfers
GET       /api/cbs/integrations
GET/PATCH /api/cbs/sbp-controls
GET       /api/cbs/summary
```

## Run schema

```bash
mysql -u root -p digifyntek < backend/sql/06_cbs_core.sql
# or npm run db:init
```

## SBP note

This is an **operations + control framework**, not a certified Temenos replacement or formal SBP submission system.  
Production go-live still requires licensed CBS policy, legal entity permissions, and supervisor-approved reporting.

## Integrations (next)

Wire real adapters behind `cbs_integrations` (NADRA verify, Raast payment, SMS OTP). Keep secrets in env, not DB.
