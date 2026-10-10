# MFB Prudential toolkit (SBP-oriented)

## What it does

| Feature | Implementation |
|---------|----------------|
| DPD classification | General: OAEM 30–59, SS 60–89, DF 90–179, Loss 180+ |
| Specific provision | 0 / 25% / 50% / 100% (net of cash/gold) |
| General provision | Configurable % of net advances (default 1%) |
| MCR | Paid-up − losses vs target (default Rs 2bn) |
| CAR | Eligible capital / RWA ≥ 15% |
| Regulatory pack | JSON summary for board / internal compliance |
| Legacy import | Open `tbl_loanaccount` → portfolio (DPD starts at 0) |

## API

```
GET/PUT  /api/mfb/config
GET/POST /api/mfb/loans
POST     /api/mfb/reclassify
GET      /api/mfb/summary
GET      /api/mfb/regulatory-pack
POST     /api/mfb/import-legacy
```

## Schema

`backend/sql/07_mfb_prudential.sql`

```bash
mysql -u root -p digifyntek < backend/sql/07_mfb_prudential.sql
```

## Disclaimer

Toolkit for **operations readiness**. Official SBP returns must follow the current **PRs for MFBs** PDF annexures and circulars. Tune DPD/% in code when annexures change.
