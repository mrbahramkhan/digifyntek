# Payments hub

## Principle

External payment status, customer-account **posting** status, and **settlement** status are stored separately.

| Field | Meaning |
|-------|---------|
| `external_status` | Adapter/network view (here: simulator) |
| `posting_status` | Internal ledger impact |
| `settlement_status` | Settlement completeness |

## Raast

- **Mode:** `SIMULATOR` (`simulator=1`)
- **Not** official Raast participation
- Live use requires bank authorization + current SBP/Raast technical specs

### Demo rules (simulator only)

- Missing beneficiary → `REJECTED`
- IBAN containing `REJECT` → `REJECTED`
- Amount ≥ 1,000,000 → `ACCEPTED` (settlement pending in sim)
- Otherwise → `SETTLED` (simulated)
- Optional: debit CASA + credit suspense GL `2100` when sim SETTLED

## API

```
GET  /api/v1/payments
GET  /api/v1/payments/:id
POST /api/v1/payments/raast/outbound
GET  /api/v1/payments/meta/channels
```

## Stubs

PRISM+ and 1LINK listed as STUB until authorized specs/adapters exist.
