# Module scope — core vs EXTRA

## Core (active)

| Area | API / UI |
|------|----------|
| Auth | `/api/auth` |
| CIF / KYC | `/api/v1/cif`, `/api/v1/kyc` |
| Accounts / CASA | `/api/v1/accounts` |
| Ledger / transfer | `/api/v1/ledger` (+ `/transfer` alias) |
| Financing / TD | `/api/v1/financing`, `/api/v1/term-deposits` |
| Approvals | `/api/v1/approvals` |
| Payments **sim** | `/api/v1/payments` |
| Teller / clearing / recon | `/api/v1/teller`, clearing, recon |
| EOD / business date | `/api/eod` |
| RBAC | `/api/v1/rbac` |
| Cheque books | `/api/instruments` |
| OpenAPI | `/api/openapi.yaml`, `/api/catalog` |

## EXTRA / legacy (commented out — re-enable if needed)

In `backend/src/server.js` and sidebar `phase1/js/shell.js`:

- members, member360, cards  
- loans (old), collateral  
- savings, shares, vacs  
- murabaha / islamic ops UI  
- core-banking, cbs duplicate screens  
- mfb prudential UI  
- compliance / registration / shariah catalogue  
- dashboard (old)

To re-enable: uncomment the matching `require` + `app.use` lines and nav items.

## Intentionally not claimed live

- Raast / PRISM+ / 1LINK production settlement  
- NADRA identity  
- SBP regulatory filing automation  
