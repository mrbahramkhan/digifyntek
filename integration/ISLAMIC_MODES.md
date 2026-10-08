# Islamic modes — implemented

## Modules

| Mode | UI | API prefix | Flow |
|------|-----|------------|------|
| Murābaḥah | `murabaha.html` | `/api/murabaha` | Purchase→own→sale→delivery |
| Salam | `islamic-ops.html` tab | `/api/islamic/salam` | Define commodity→pay advance→receive delivery |
| Ijārah | `islamic-ops.html` tab | `/api/islamic/ijarah` | Acquire asset→activate lease+rent schedule |
| Qard Ḥasan | `islamic-ops.html` tab | `/api/islamic/qard` | 0% profit→disburse |

## SQL
- `03_murabaha.sql` — murabaha fields + checklist
- `04_islamic_modes.sql` — salam/ijarah/qard fields + islamic_checklist

## Sharīʿah gates
- Murābaḥah / Ijārah: ownership required before sale / lease activation
- Qard: profit forced to 0 on disburse
- Salam: full price upfront conceptually (pay-advance step)

## Seed products (from 02_seed)
MUR-IN, SALAM, QARD, IJARAH codes already in loan_products.
