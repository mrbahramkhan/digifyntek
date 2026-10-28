# Cheque clearing cycle

## Directions

| Direction | Meaning | On clear (with account_id) |
|-----------|---------|----------------------------|
| **OUTWARD** | Our customer cheque being paid | Dr customer deposit / Cr clearing suspense 2100 |
| **INWARD** | Cheque deposited for collection | Dr clearing 2100 / Cr customer deposit |

## Batch lifecycle

`open` → add items → `submitted` (presented) → decide each item (`cleared`/`bounced`) → `settled`

## Leaf link

Optional `cheque_leaf_id` updates `cheque_leaves.status` to cleared/bounced.

## API

```
POST /api/v1/clearing/batches
GET  /api/v1/clearing/batches
POST /api/v1/clearing/batches/:id/items
POST /api/v1/clearing/batches/:id/submit
POST /api/v1/clearing/items/:id/decide
POST /api/v1/clearing/batches/:id/settle
```

## Limits

- No image/MICR capture
- No external clearing-house file exchange (local cycle only)
- Bounce does not auto-fee post
