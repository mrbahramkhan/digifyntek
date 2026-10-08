# Murābaḥah module (implemented)

## UI
`phase1/murabaha.html` — full workflow:
1. Create application (cost, profit, sale price, asset)
2. Confirm purchase / ownership (Sharīʿah gate)
3. Execute sale + installment schedule
4. Delivery → active
5. Compliance checklist per facility

## API (`/api/murabaha`)
| Method | Path | Action |
|--------|------|--------|
| GET | `/` | List murābaḥah facilities |
| POST | `/` | Create application |
| GET | `/:id` | Detail + checklist + schedule |
| POST | `/:id/purchase` | Ownership confirmed |
| POST | `/:id/sell` | Sale + schedule + instrument |
| POST | `/:id/deliver` | Delivery → active |
| POST | `/:id/stage` | Advance stage (ownership gated) |
| PATCH | `/:id/checklist/:stepId` | Toggle compliance step |

## DB (`sql/03_murabaha.sql`)
- loans: cost_amount, profit_amount, sale_price, supplier_*, ownership_confirmed, murabaha_stage
- murabaha_checklist
- murabaha_docs

## Sharīʿah control
Cannot set stage sold/delivered/active unless `ownership_confirmed = 1`.

## Run migration
```bash
mysql -u ... forge_coop < backend/sql/03_murabaha.sql
# or npm run db:init (includes 03)
```
