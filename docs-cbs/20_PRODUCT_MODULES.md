# DigiFyntek — major product modules

| Pack | Name | Domain |
|------|------|--------|
| core | Fintech CBS | CIF, KYC, CASA, ledger, financing, TD, teller, EOD, RBAC |
| kisaan | Digital Kisaan | Members, shares, savings, cards, cooperative compliance |
| islamic | Islamic Finance | Murabaha, modes, Shariah catalogue |
| fmfb | FMFB / Microfinance | Prudential, portfolio, collateral |

Server: `PRODUCT_PACKS=core,kisaan,islamic,fmfb`  
UI: localStorage `DIGIFYNTEK_PACKS` or dashboard toggles  
API: `GET /api/products`
