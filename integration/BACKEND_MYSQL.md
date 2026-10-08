# Forge Backend — MySQL end-to-end

## Location
`backend/` — Express API + `sql/01_schema.sql` + `sql/02_seed.sql`

## Tables (summary)

| Domain | Tables |
|--------|--------|
| Org / VAC | organisations, vacs |
| Auth | users |
| CRM | members |
| Shares | share_folios, share_transactions |
| Cards | membership_cards |
| Credit | loan_products, loans, loan_schedules, loan_repayments |
| Security | collaterals, guarantees |
| Instruments | instruments |
| Savings | savings_accounts, savings_txns |
| Compliance | compliance_items, statutory_events |
| Docs / audit | documents, audit_log |
| KPI view | v_portfolio_summary |

## Islamic modes on loans/products
`mode` ENUM: conventional, murabaha, salam, ijarah, qard_hasan, diminishing_musharaka, mudaraba

## PAR logic
`days_past_due` → `par_bucket` (current/d30/d60/d90) + `classification`  
Refresh: `POST /api/loans/refresh-par`

## MCL
On loan create: sum(shares × face_value) × 10 vs existing OS + new principal (policy placeholder).

## Run
See `backend/README.md`
