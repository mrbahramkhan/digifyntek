# Forge — Cooperative Law Gaps & Additions

Based on **Cooperative Societies Act, 1925** (Pakistan) and typical provincial rules for Village Agriculture Cooperatives.

## Already present (or partially) in Digital Kisaan / Forge

| Area | Status |
|------|--------|
| Member / Farmer registration | Yes → CRM Members |
| Shares | Yes (share get/transfer APIs) |
| Board / Staff | Yes |
| Meetings | Yes (`/meeting/*`) |
| Audit flags (internal/external missing) | Yes (dashboard calls) |
| VAC registration / renewal | Yes |
| Credit, savings, inventory, accounting | Yes |

## Missing / weak — now covered in Forge Compliance hub

| Requirement | Law reference | Forge action |
|-------------|----------------|--------------|
| **Membership eligibility** (18+, solvent, sound mind, residence in area) | s. 7-A | Enforce on Add Member form + checklist |
| **Nominee** for shares / interest | Practice + succession | Add Nominee fields on Member form |
| **Share capital cap** (max 1/5th per member) | s. 6 | Share register + live % validation |
| **Share transfer only after 1 year** | Transfer rules | Rule in Shares module |
| **One member = one vote** | s. 18 | By design (no share-weighted voting) |
| **Expulsion / cessation of membership** | s. 17-B | Workflow: resign / expel / inactive |
| **AGM within 3 months of accounts close** | s. 12 | Compliance calendar + Schedule AGM |
| **Special General Meeting** | s. 13 | Meetings module type = SGM |
| **Minutes & resolutions** | Practice | Meeting records + attach docs |
| **External audit yearly** | s. 22 | Compliance status + upload report |
| **Internal audit committee** (≥3 non-committee members) | s. 22-B | New sub-module under Governance |
| **Reserve Fund** (≥1/4 net profit resource societies, or ≥1/10) | s. 39 | Reserve Fund ledger + auto % on surplus |
| **Dividend ≤ 10%** | s. 38 | Cap on surplus distribution |
| **Annual returns to Registrar** | s. 60 / Rules | Returns tracker + due dates |
| **Bye-laws** (store + amendment log) | Registration | Document store + amendment history |
| **Board term / disqualification** | Committee rules | Staff & Board + eligibility flags |
| **Registration certificate / renewal** | Registration | Institution profile + renewal alert |

## UI delivered

- **`phase1/compliance.html`** — Compliance hub with:
  - AGM / Audit / Reserve status cards
  - 8 law-required modules
  - Share capital limit table
  - Membership compliance checklist
  - Statutory calendar (AGM, audits, returns, reserve, board)

## Recommended form additions (Members)

1. Nominee name + CNIC + relation  
2. Declaration: solvent / not undischarged insolvent  
3. Residence / village confirmation (area rule)  
4. Membership status: Active | Resigned | Expelled | Deceased  
5. Date of admission / cessation  

## Recommended new screens (priority)

1. Share Capital Register (with % of total capital)  
2. AGM / SGM detail + minutes + attendance (quorum)  
3. Internal Audit Committee  
4. Reserve Fund movements  
5. Bye-laws & Registrar documents  
6. Annual returns checklist  

Backend: reuse existing meeting, board, share, audit, vac APIs where possible; add thin endpoints only if fields are missing (nominee, membership status, reserve ledger).

