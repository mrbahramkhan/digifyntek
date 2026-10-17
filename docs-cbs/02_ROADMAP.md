# Implementation roadmap

| Phase | Focus | Exit criteria |
|-------|--------|----------------|
| **P1 Foundation** | Schema, CIF, branches, audit, products shell | Create/search customer; audit row on write |
| **P2 Financial core** | Accounts, balanced journal engine, internal FT, statements | Transfer posts balanced journal; reverse works |
| **P3 Deposits & credit** | CASA rules, TD, loans, Islamic products | Schedule + accrual job idempotent |
| **P4 Payments** | Payment hub + Raast/PRISM+/1LINK **simulators** | Explicit SIMULATED status; recon stubs |
| **P5 Compliance** | KYC cases, screening states, rule register | Case lifecycle + evidence fields |
| **P6 Ops** | EOD pipeline, recon engine, MIS | EOD rerun safe; trial balance report |
| **P7 Harden** | Security tests, DR runbook, UAT pack | Checklist signed off |

## Current iteration

**P1 + P2 foundation vertical slice**

1. `09_cbs_enterprise.sql` — customers, accounts, journals, audit, products, branches  
2. Ledger service — post / reverse / trial balance  
3. APIs — `/api/v1/cif`, `/api/v1/accounts`, `/api/v1/ledger`, `/api/v1/transfers`  
4. Screens — CIF, Accounts, Journal, Transfer (operational forms)  
5. Update nav + SYSTEM docs  
