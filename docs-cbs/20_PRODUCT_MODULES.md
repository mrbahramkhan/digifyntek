# Product lines

| Pack id | Display name | Domain |
|---------|--------------|--------|
| `conventional` | **Conventional Banking** | CIF, CASA, loans, TD, teller, ledger, EOD, cheques, reports |
| `islamic` | **Islamic Banking** | Islamic deposits, Murabaha/Ijarah/…, Islamic TD, profit accrual |
| `agri` | **Agri App** | Cooperative/agri members, shares, cards, compliance (ex-Kisaan App) |
| `fmfb` | FMFB (optional) | Microfinance prudential |

Aliases: `core`→conventional, `kisaan`→agri

```bash
PRODUCT_PACKS=conventional,islamic,agri
```

UI: `localStorage.DIGIFYNTEK_PACKS`
API: `GET /api/products`
