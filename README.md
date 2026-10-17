# DigiFyntek

**One system** to run a cooperative society or bank-style institution end to end.

```
Customers → Accounts → Lending → Operations → Risk → Admin
```

| | |
|--|--|
| **Product** | DigiFyntek |
| **Stack** | Node.js · Express · MySQL 8 |
| **UI demo** | https://mrbahramkhan.github.io/digifyntek/ |

## What it runs

| Domain | Capability |
|--------|------------|
| Customers | Member register, 360 view, membership cards |
| Accounts | Deposits, share capital, CIF / account open, transfers |
| Lending | Loans & PAR, collateral, Murābaḥah and other Islamic modes |
| Operations | General ledger, day-end, accrual, cheque books |
| Risk | Classification, provisions, MCR/CAR, cooperative law checklist |
| Admin | Institution & branches, product catalogue |

## Start

```bash
./start.sh
# http://localhost:4000  ·  superadmin / ForgeAdmin123!
```

```bash
cd backend && npm install && npm run db:init
npm run db:seed-admin -- 'YourPass!' && npm start
```

Health: `GET /health`

## Legacy Digital Kisaan DB

```env
DB_NAME=digifyntek
DB_MODE=legacy
```

## Pakistan CBS (enterprise roadmap)

Requirements & architecture: [`docs-cbs/`](docs-cbs/)

| Phase | Status |
|-------|--------|
| P1 CIF + audit + schema | **Started** (`09_cbs_enterprise.sql`, `/api/v1/cif`) |
| P2 Ledger + accounts + FT | **Started** (`/api/v1/ledger`, balanced post/reverse) |
| P3–P7 | Roadmap in `docs-cbs/02_ROADMAP.md` |

Screens: `cif.html` · `accounts.html` · `ledger.html` · `transfer.html`

## Docs

- [SYSTEM.md](SYSTEM.md) — domain architecture  
- [PRODUCTION.md](PRODUCTION.md) — deploy  
- [integration/](integration/) — legacy map, CBS, MFB toolkit  

**Version 1.3.0** — unified bank/society information architecture.
