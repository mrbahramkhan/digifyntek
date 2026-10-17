# DigiFyntek CBS — Master Requirements (Pakistan)

**Source:** MASTER PROMPT CBS-Pk (Enterprise-Grade Core Banking System for Pakistan)  
**Product:** DigiFyntek  
**Status:** Living requirements — implement phase by phase  

## Objective

Secure, modular, audit-ready Core Banking System for a bank/society operating in **Pakistan**:

- Conventional + Islamic modes  
- Multi-branch, multi-user, multi-role  
- CIF, deposits, financing, payments, GL, regulatory reporting, reconciliation  
- Integration adapters for Pakistan financial infrastructure (Raast, PRISM+, 1LINK)  

**Not** a dashboard-only prototype. Prioritize financial correctness, double-entry integrity, maker-checker, SBP-oriented controls.

## Defaults (this repo)

| Item | Value |
|------|--------|
| Country | Pakistan |
| Currency | PKR |
| Time zone | Asia/Karachi |
| Display dates | DD-MM-YYYY |
| API timestamps | ISO 8601 |
| Accounting | Double-entry |
| Architecture | Modular monolith |
| Database | **MySQL 8** (existing DigiFyntek/legacy stack preserved; PostgreSQL optional later) |
| API | Express REST (version toward `/api/v1`) |
| Frontend | Operational HTML modules + shared `css/app.css` |
| Auth | JWT (+ MFA planned) |
| Deploy | Docker / VPS / GitHub |

## Non-negotiable ledger rules

1. Single authoritative financial ledger  
2. Every posted journal: **Σ debits = Σ credits**  
3. No silent edit/delete of posted journals — reversals only  
4. Atomic, idempotent posting where applicable  
5. Unique reference, business date, status, audit trail  
6. Maker-checker **server-side**  
7. Business date ≠ wall-clock timestamp  

## Module map (master prompt §4–10)

| Domain | Modules |
|--------|---------|
| Customers | CIF, KYC/onboarding, screening |
| Accounts | CASA, term deposits, IBAN, restrictions |
| Ledger | COA, journals, trial balance, period close |
| Cash | Teller, vault, denominations |
| Payments | Internal FT, Raast/PRISM+/1LINK adapters (simulators until authorized) |
| Clearing | Cheques, stop pay, inward/outward |
| Credit | Loans, Islamic financing, collateral, NPL/provisions |
| Risk | AML cases, regulatory rule register, MFB prudential |
| Ops | EOD/MEOD, reconciliation, MIS, admin |

## Implementation phases

1. **Foundation** — schema, auth, CIF, branch, product shell, audit  
2. **Financial core** — accounts, balanced journal engine, internal FT, statements  
3. **Deposits & financing** — CASA, TD, loans, Islamic framework  
4. **Payments hub** — adapters + simulators  
5. **Risk & compliance** — KYC/AML workflows, rule register  
6. **Ops & reporting** — EOD hardening, recon, MIS  
7. **Hardening** — security tests, DR, UAT pack  

## Explicit non-claims

- Presence of a screen ≠ SBP certification  
- Simulator ≠ live Raast/PRISM+/1LINK settlement  
- UAT-ready ≠ authorized to hold public deposits  

See also: `01_ARCHITECTURE.md`, `02_ROADMAP.md`, `03_ASSUMPTIONS_REGULATORY.md`
