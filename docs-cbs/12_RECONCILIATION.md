# Reconciliation engine (skeleton)

## Model

- **Statement** — external or control balance source (NOSTRO, CLEARING, GL, VAULT, file)
- **Lines** — individual movements on the statement
- **Match** — link line to a posted journal (`MANUAL` or `AUTO`)

## Auto-match rules (v1)

1. Journal must be `POSTED` and not already matched
2. Amount equals line amount (`total_debit` or `total_credit`)
3. If `external_ref` present: prefer `source_ref` / `journal_ref` equality
4. If exactly one amount candidate and no ref → match that one

## Lifecycle

`open` → add lines (`matching`) → match/exclude all → `closed`

Close is blocked while unmatched lines remain.

## API

```
POST /api/v1/recon/statements
POST /api/v1/recon/statements/:id/lines
GET  /api/v1/recon/candidates?amount=
POST /api/v1/recon/match
POST /api/v1/recon/statements/:id/auto-match
POST /api/v1/recon/lines/:id/exclude
POST /api/v1/recon/statements/:id/close
```

## Not yet

- File import parsers (MT940, CSV bank files)
- Multi-line to one journal / partial matches
- Break items with GL write-off workflow
