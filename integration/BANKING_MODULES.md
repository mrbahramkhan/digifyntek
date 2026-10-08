# Forge — Banking modules (end-to-end)

Added for cooperative credit society operations. **Not** full commercial bank (no ATM/debit issuing).

## New UI pages

| Page | Path | Purpose |
|------|------|---------|
| Instruments | `phase1/instruments.html` | Loan agreements, share certs, guarantees, deposit receipts lifecycle |
| Loans & PAR | `phase1/loans.html` | Portfolio, aging buckets, PAR 30/90, MCL, NPL classification, provision matrix |
| Collateral & guarantees | `phase1/collateral.html` | Pledge register, valuation, charge/release, guarantor exposure |
| Membership cards | `phase1/cards.html` | Society ID cards (QR), issue/block/replace/print — **not** bank cards |

## Existing related

| Page | Path |
|------|------|
| Dashboard | `phase1/index.html` |
| Members CRM | `phase1/members.html` |
| Cooperative compliance | `phase1/compliance.html` |

## Module coverage

### 1. Instrument management
- Types: Loan agreement, Share certificate, Guarantee, Deposit receipt
- Lifecycle: Draft → Active → Settled / Cancelled / Written-off
- Unique instrument number, member link, linked loan/folio, signed PDF upload
- Search/filter by type & status

### 2. Card management (membership only)
- Card number, issue/expiry, status: Active / Blocked / Lost / Pending print
- QR to member profile
- Bulk print, replace after loss
- **Out of scope:** ATM, debit, credit, Visa/MC schemes

### 3. Collateral
- Types: Agri land, residential, livestock, gold, equipment, other
- Fields: value, charge date, release, document refs (Fard, agreement, photos)
- Status: Charged / Pending release / Released
- Linked to loan

### 4. Guarantees
- Guarantor CNIC, linked borrower & loan
- Guaranteed amount + **total exposure** of guarantor across loans
- Status including “at risk” when loan overdue

### 5. Credit risk (Loans & PAR)
- Portfolio outstanding KPI
- **PAR 30 / PAR 90**
- Aging: Current, 30–59, 60–89, 90+
- **MCL** check at approval (policy matrix)
- Single-borrower / related-party flags
- Classification: Performing → OA → Substandard → Doubtful → Loss
- Provision % matrix by bucket
- Collection rate MTD

### 6. Still map to existing backend where possible
- `/loan/account/*`, `/loan/yearlyBalance`, `/loan/product/*`
- `/farmer/*`, `/farmer/share/*`
- Extend BE only for: collateral table, instrument register, card register, installment schedule, days-past-due, PAR calc

## Backend additions recommended (minimal)

| Entity | Key fields |
|--------|------------|
| `instrument` | id, type, number, memberId, loanId, status, issueDate, docUrl |
| `collateral` | id, type, memberId, loanId, value, chargeDate, releaseDate, status, docs |
| `guarantee` | id, guarantorMemberId, borrowerMemberId, loanId, amount, status |
| `membership_card` | id, cardNumber, memberId, issueDate, expiry, status |
| `loan_schedule` | loanId, installmentNo, dueDate, principal, profit, paid, daysPastDue |
| `loan` extensions | classification, provisionPct, mclSnapshot, parBucket |

## Not included (by design)
- ATM / debit / credit card issuing
- Card schemes / PCI-DSS full stack
- Cheque clearing house
- Full SBP commercial bank capital/CRR stack

Primary VAC = cooperative credit + instruments + risk. Provincial cooperative **bank** = separate product track.
