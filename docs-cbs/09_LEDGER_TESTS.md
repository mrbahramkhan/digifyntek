# Ledger integrity tests

## Commands

```bash
cd backend
npm run test:unit          # no DB required for money/interest helpers
npm run test:integrity     # needs MySQL + 09_cbs_enterprise schema
npm test                   # both
```

## Coverage

| Case | Type |
|------|------|
| money() rounding | unit |
| Unbalanced journal rejected | integration |
| Balanced post + trial balance | integration |
| Idempotent journal key | integration |
| Reversal compensating entry | integration |
| Deposit / withdraw / insufficient funds | integration |
| Internal transfer balances | integration |

## Env

Uses same `DB_*` env as the API (`src/config/db.js`).
