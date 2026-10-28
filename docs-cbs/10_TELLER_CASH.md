# Teller / cash drawer

## Flow

1. **Open drawer** — float from vault to teller (vault balance decreases)
2. **Vault ↔ drawer** — additional cash movements
3. **Customer deposit / withdraw** — updates drawer expected cash **and** posts CASA GL via ledger
4. **Close drawer** — enter counted balance; variance (over/short) logged; counted cash returned to vault

## Controls

- One open drawer per teller per business date
- Withdraw / vault-out blocked if expected drawer cash insufficient
- Vault out blocked if vault balance insufficient
- All movements in `cbs_cash_txns`

## API

```
GET  /api/v1/teller/tellers
GET  /api/v1/teller/vault
GET  /api/v1/teller/drawers
POST /api/v1/teller/drawers/open
POST /api/v1/teller/drawers/:id/vault-in
POST /api/v1/teller/drawers/:id/vault-out
POST /api/v1/teller/drawers/:id/deposit
POST /api/v1/teller/drawers/:id/withdraw
POST /api/v1/teller/drawers/:id/close
```

## Limits

- Denomination JSON accepted but not enforced
- Inter-teller transfers not yet implemented
- Variance does not auto-post GL P&L (recorded on drawer only)
