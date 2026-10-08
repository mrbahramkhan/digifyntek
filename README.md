# Forge — Cooperative & Fintech Platform (UX redesign)

Frontend-only redesign of Digital Kisaan. **Backend APIs unchanged** (Option A: same Angular project migration).

**Brand:** Forge · **Theme:** Light default, dark optional · **CRM:** Members (+ optional Farmer tag)

---

## Phase 1 screens

| Screen | File | Covers |
|--------|------|--------|
| Login + Dashboard | `phase1/index.html` | Auth shell, KPIs |
| Members CRM | `phase1/members.html` | List, filters, drawer, Farmer tick |
| Member 360° | `phase1/member360.html` | Profile, exposure, loans, shares, docs |
| Membership cards | `phase1/cards.html` | ID cards (not ATM/debit) |
| Loans · PAR · MCL | `phase1/loans.html` | Aging, PAR 30/90, NPL, provision matrix |
| Collateral & guarantees | `phase1/collateral.html` | Pledge register, guarantor exposure |
| Instruments | `phase1/instruments.html` | Loan agreements, share certs, guarantees, receipts |
| Islamic products | `phase1/islamic.html` | Murābaḥah, Salam, Ijārah, Qard Ḥasan, Muḍārabah |
| Institution setup | `phase1/setup.html` | Province, society class, finance mode |
| Cooperative law | `phase1/compliance.html` | AGM, audit, reserve, share 1/5, bye-laws |
| Registration checklist | `phase1/registration.html` | Pakistan Act 1925 interactive checklist |

---

## Explored topics → product mapping

| Research | Delivered in Forge |
|----------|-------------------|
| Cooperative Societies Act 1925 compliance | `compliance.html` + `COOPERATIVE_LAW.md` |
| Non-agricultural classes (housing, consumers…) | `setup.html` society class selector |
| Punjab vs Sindh vs KP vs Balochistan | `setup.html` province + rule notes |
| Pakistan registration checklist | `registration.html` + `PAKISTAN_REGISTRATION_CHECKLIST.md` |
| Cooperative banking (SBP / FBC repeal / DPC) | Setup “institution kind”; banking modules for primary society only |
| Islamic cooperative + microfinance models | `islamic.html` product pack |
| Banking gaps (PAR, MCL, collateral, instruments, cards) | `loans`, `collateral`, `instruments`, `cards`, `member360` |

---

## Integration docs

| Doc | Path |
|-----|------|
| API mapping | `integration/API_MAPPING.md` |
| Angular services | `integration/ANGULAR_SERVICES.md` |
| Cooperative law gaps | `integration/COOPERATIVE_LAW.md` |
| Registration checklist | `integration/PAKISTAN_REGISTRATION_CHECKLIST.md` |
| Banking modules | `integration/BANKING_MODULES.md` |

---

## Out of scope (by design)

- ATM / debit / credit card issuing (SBP licensed banks only)
- Full commercial bank capital / CRR stack
- Changing existing Digital Kisaan backend contracts without migration plan

---

## How to review

Open HTML files in a browser. Sidebar links navigate between modules.  
Login prototype: any credentials on `index.html` → dashboard (demo).

---

## Backend (MySQL)

Path: `backend/`

```bash
cd backend
cp .env.example .env
npm install
# MySQL must be running
npm run db:init
npm start
```

- Schema: `backend/sql/01_schema.sql`
- Seed: `backend/sql/02_seed.sql`
- API docs: `backend/README.md`
- Mapping: `integration/BACKEND_MYSQL.md`

Login: **superadmin** / **12345678**

## Islamic facility ops
- Murābaḥah: `phase1/murabaha.html`
- Salam / Ijārah / Qard: `phase1/islamic-ops.html`
- SQL: `backend/sql/03_murabaha.sql`, `04_islamic_modes.sql`

## Production
See [PRODUCTION.md](PRODUCTION.md) — hardened API + Docker. phase1 HTML is still a prototype UI.
