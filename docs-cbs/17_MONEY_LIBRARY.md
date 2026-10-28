# Decimal money library

## Module

`backend/src/lib/money.js`

## Design

- **Scale:** 2 decimal places (PKR paisa)
- **Internal:** integer minor units — avoids `0.1 + 0.2 !== 0.3`
- **External:** `Number` suitable for MySQL `DECIMAL(18,2)`

## API

| Function | Purpose |
|----------|---------|
| `money(x)` | Normalize to 2 dp |
| `add / sub / mul` | Arithmetic |
| `mulPercent(amount, rate%)` | Percentage of amount |
| `simpleInterest(P, rate%, days, year=365)` | Accrual helper |
| `eq / gt / gte / lt / lte` | Safe compare |
| `toMinor / fromMinor` | Paisa conversion |

## Integration

`ledger/service.js` imports `money` and `simpleInterest` from this module (replaces previous `Math.round(n*100)/100` helper).

## Tests

```bash
cd backend
npm run test:unit   # includes tests/money.lib.test.js
```
