# Architecture — DigiFyntek Pakistan CBS

```
┌──────────────────────────────────────────────────────────┐
│  Operational UI (phase1/)  JWT  ·  list+form modules     │
└────────────────────────────┬─────────────────────────────┘
                             │ /api/*
┌────────────────────────────▼─────────────────────────────┐
│  Express modular monolith                                │
│  auth · cif · accounts · ledger · transfers · eod · …    │
│  middleware: auth, validate, rate-limit, audit           │
└────────────────────────────┬─────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   MySQL digifyntek     Legacy adapter      Payment adapters
   (native CBS)         (Digital Kisaan)    (Raast/PRISM+/1LINK
                                             simulators)
```

## Domain boundaries

| Package | Responsibility |
|---------|----------------|
| `cif` | Customer master, IDs, 360 |
| `accounts` | Account open, balances, statements |
| `ledger` | COA, journal post/reverse, trial balance |
| `transfers` | Internal FT state machine |
| `eod` | Business date, batch jobs |
| `instruments` | Cheque books / stop pay |
| `credit` | Loans / Islamic financing |
| `compliance` | Rule register, AML cases (shell → full) |
| `payments` | External adapter contracts + simulators |

## Financial posting design

```
Business event
    → validate product/limits/auth
    → create transaction header (PENDING)
    → build balanced journal lines
    → POST in single DB transaction:
         journal_headers.status = POSTED
         update account balances / control accounts
         audit_events
    → return reference (idempotency key respected)
```

**Reversal:** new journal with opposite lines + link to original; original remains POSTED.

## SBP-oriented controls (design)

- Business date calendar (branch-aware later)
- Maker-checker queues for high-value / sensitive ops
- Regulatory rule register table
- Prudential classification/provision hooks (MFB module)
- No claim of live payment-system certification without bank authorization

## Stack decision

Existing DigiFyntek = **Node + Express + MySQL**. Master prompt preferred PostgreSQL; we **preserve MySQL** for legacy Digital Kisaan compatibility and current deploy path. Migration path to PostgreSQL documented as future option, not blocking Phase 1–2.
