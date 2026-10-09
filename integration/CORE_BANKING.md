# Basic Core Banking (DigiFyntek)

Requires `DB_MODE=legacy` and database `digifyntek` with Digital Kisaan tables.

## Features

| Feature | API | Legacy source |
|---------|-----|----------------|
| Core summary KPIs | `GET /api/core/summary` | counts on COA, deposits, loans, txns |
| Chart of accounts | `GET /api/core/coa` | `tbl_coa` |
| GL balances | `GET /api/core/gl-balances` | `tbl_glbalances` |
| Deposit products | `GET /api/core/products/deposits` | `tbl_depositproduct` |
| Loan products | `GET /api/core/products/loans` | `tbl_loanproduct` |
| Transaction types | `GET /api/core/tran-types` | `pr_transactiontype` |
| Recent transactions | `GET /api/core/transactions` | `tbl_mastertransaction` + general |
| Account statement | `GET /api/core/statement/:accountNo` | general + master by `account_no` |

## UI

`phase1/core-banking.html` (sidebar → Core Banking)

## Not included yet (next tier)

- Full double-entry posting UI
- Automated day-end batch
- Interest accrual engine
- Inter-account transfer wizard with authorization workflow

## Posting / Day-end / Accrual

| Action | API | Behavior |
|--------|-----|----------|
| Journal posting | `POST /api/core/posting` | Balanced Dr/Cr lines → `tbl_mastertransaction` + `tbl_generaltransaction` |
| Day-end | `POST /api/core/day-end` | Marks authorized unposted txns as `tran_posted=1` for date |
| Interest accrual | `POST /api/core/accrual` | Daily interest on open loans; `tbl_dailyaccountbalanceandprofit`; updates `loan_totalinterest` + balance |
| Unposted count | `GET /api/core/unposted-count` | Authorized but not posted |

### Accrual formula

`profit = balance × (annual_rate / 100) / 365 × days`

Optional journal if `interest_gl` + `income_gl` provided.
