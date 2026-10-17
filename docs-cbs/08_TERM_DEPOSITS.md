# Term deposits

## Lifecycle

`active` → `matured` | `encashed`

## Placement (GL)

- Funding from CASA: Dr customer deposit account / Cr deposit control (TD liability marker)
- Or cash: Dr Cash / Cr deposit control

## Interest

Simple interest: `principal × rate% × tenor_days / 365`

Maturity pays principal + interest − WHT.

Premature default: principal only (optional pro-rata interest with `allow_interest`).

## API

```
GET  /api/v1/term-deposits
GET  /api/v1/term-deposits/meta/due
GET  /api/v1/term-deposits/:id
POST /api/v1/term-deposits
POST /api/v1/term-deposits/:id/mature
POST /api/v1/term-deposits/:id/premature
```

## Limitations

- Rollover instruction stored; auto-rollover batch not yet executed at EOD
- No certificate PDF generation yet
- Islamic TD uses same simple rate model until product-specific profit engine exists
