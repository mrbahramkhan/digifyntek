# DigiFyntek — one banking / society system

## Design principle

Not a pile of tools. **One operating system** for a cooperative society or microfinance-style institution:

```
Customers → Accounts → Lending → Operations → Risk → Admin
```

## Domain map

| Domain | Screens | Job |
|--------|---------|-----|
| **Customers** | Members, 360, Cards | Who is the member |
| **Accounts** | Savings, Shares, CIF open | What they hold |
| **Lending** | Loans, Collateral, Islamic modes | Credit lifecycle |
| **Operations** | GL, Cheque books, Transfers | Daily banking ops |
| **Risk** | Asset quality & capital, law, licensing | Prudential & legal |
| **Admin** | Institution, Shariah catalogue | Configuration |

## Technical stack

- **UI:** static HTML + shared `shell.js` / `api.js` (one nav, one auth)
- **API:** Express `/api/*` modular routes, one JWT
- **DB:** MySQL `digifyntek` — native schema **or** `DB_MODE=legacy` (Digital Kisaan)

## Daily operating flow

1. Register / update **member**
2. Open **share / deposit / loan** accounts
3. **Disburse** and collect
4. **Post** to general ledger (and day-end)
5. Monitor **classification, provisions, capital**

## API domains (same boundaries)

| API prefix | Domain |
|------------|--------|
| `/api/members` | Customers |
| `/api/savings` `/api/shares` `/api/cbs` | Accounts |
| `/api/loans` `/api/collateral` `/api/murabaha` `/api/islamic` | Lending |
| `/api/core` `/api/instruments` | Operations |
| `/api/mfb` `/api/compliance` | Risk |
| `/api/vacs` `/api/auth` | Admin / access |
