# DigiFyntek

**End-to-end cooperative & fintech platform** — members, shares, loans, core banking, chequebooks, Islamic modes, CBS, and MFB prudential toolkit.

| | |
|--|--|
| **Product** | DigiFyntek |
| **Stack** | Node.js · Express · MySQL 8 · static UI |
| **Demo UI** | https://mrbahramkhan.github.io/digifyntek/ |

---

## Modules (end-to-end)

| Area | Features |
|------|----------|
| **CRM** | Members, Member 360, cards, shares, savings |
| **Credit** | Loans & PAR, collateral |
| **Core Banking** | COA, GL, posting, day-end, interest accrual |
| **CBS** | CIF, accounts, transfers, products, integrations registry |
| **MFB Prudential** | DPD classification, provisions, MCR, CAR 15%, regulatory pack |
| **Chequebooks** | Request → approve → issue · leaves · stop payment |
| **Islamic** | Murābaḥah, Salam, Ijārah, Qard Ḥasan |
| **Governance** | Setup, registration checklist, cooperative law, SBP controls |
| **Legacy** | Digital Kisaan DB mode (`DB_MODE=legacy`) |

---

## Quick start (local)

```bash
./start.sh
```

Or step-by-step:

```bash
cd backend
cp .env.example .env   # edit DB_* and JWT_SECRET
npm install
npm run db:init
npm run db:seed-admin -- 'YourStrongPass!'
npm start
```

- App: **http://localhost:4000**
- Login: `superadmin` / seed password
- Health: **http://localhost:4000/health**

### Docker Compose

```bash
docker compose up -d
```

### Legacy Digital Kisaan database

```bash
# Import dump as digifyntek
sed 's/`digitalkisaan`/`digifyntek`/g' DigitalKissan-old_backuo.sql | mysql -u root -p

# backend/.env
DB_NAME=digifyntek
DB_MODE=legacy
```

---

## API map

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Login, me |
| `/api/members` | CRM / farmers |
| `/api/loans` | Loans & portfolio |
| `/api/core` | Ledger, posting, day-end, accrual |
| `/api/cbs` | Temenos-style CBS |
| `/api/mfb` | MFB prudential |
| `/api/instruments` | Chequebooks |
| `/api/murabaha` · `/api/islamic` | Islamic modes |
| `/api/shares` · `/api/savings` | Capital & deposits |
| `/health` | Status + module list |

---

## UI pages

Served from `phase1/` (and `docs/` for GitHub Pages):

`app.html` · `members.html` · `loans.html` · `core-banking.html` · `cbs.html` · `mfb.html` · `instruments.html` · `murabaha.html` · `islamic-ops.html` · …

Marketing site: `index.html`

---

## Production

See [PRODUCTION.md](PRODUCTION.md) and [deploy/](deploy/) (nginx + HTTPS sample).

```bash
NODE_ENV=production JWT_SECRET=<32+ chars> DB_PASSWORD=<secret> npm start
```

---

## Docs

| File | Content |
|------|---------|
| [SYSTEM.md](SYSTEM.md) | Architecture |
| [integration/LEGACY_DB_MAP.md](integration/LEGACY_DB_MAP.md) | Digital Kisaan tables |
| [integration/CORE_BANKING.md](integration/CORE_BANKING.md) | Posting / day-end |
| [integration/CBS_TEMENOS_SBP.md](integration/CBS_TEMENOS_SBP.md) | CBS + SBP checklist |
| [integration/MFB_PRUDENTIAL.md](integration/MFB_PRUDENTIAL.md) | MFB toolkit |
| [PAGES.md](PAGES.md) | GitHub Pages |

---

## Version

**1.2.0** — full cooperative fintech stack + MFB prudential + CBS + core banking + chequebooks.
