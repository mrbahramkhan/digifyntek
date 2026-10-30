# DigiFyntek — full application map

## Entry
- `phase1/login.html` — only login (MFA step for admins when enforced)
- `phase1/app.html` — single workbench home

## Form modules (UI)
cif, kyc, nadra, accounts, casa, term-deposits, transfer, financing, products,
teller, instruments, clearing, ledger, recon, eod, approvals, payments, reports,
members, member360, shares, savings, cards, loans, collateral, mfb,
role-assignment, role-management, rbac, setup

## Backend routes
auth, nadra, cif, kyc, accounts, ledger, financing, termdeposits, teller,
instruments, clearing, recon, eod, approvals, payments, reports, rbac,
members, shares, savings, cards, vacs, compliance, mfb, loans, collateral,
islamic, murabaha, cbs, corebanking, dashboard, openapi

## SQL
- `backend/sql/install-schema.sql` — core schema + seeds
- `backend/sql/13_rbac_matrix_complete.sql` — full RBAC matrix
- `backend/sql/14_mfa.sql` — MFA columns
- Islamic product seeds under `backend/sql/10_*.sql`, `11_*.sql`

## Default credentials (dev only)
superadmin / 12345678
