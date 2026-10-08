# Frontend ↔ Backend wiring

## Shared client
`phase1/js/api.js` — `window.ForgeAPI`

- Base URL: `http://localhost:4000` (override: `localStorage.FORGE_API_BASE`)
- JWT: `localStorage.FORGE_TOKEN`
- User: `localStorage.FORGE_USER`

## Wired pages

| Page | Behaviour |
|------|-----------|
| `index.html` | Login → JWT; dashboard KPIs + recent members from API |
| `members.html` | List members; add/edit via POST/PUT; requires auth |
| `loans.html` | Portfolio PAR KPIs + loan table |
| `registration.html` | Checklist load + PATCH toggle |
| `member360.html` | `?id=` → GET `/api/members/:id/360` |

## Run order

1. MySQL + `npm run db:init` + `npm start` in `backend/`
2. Open `phase1/index.html` in browser (or static server)
3. Login `superadmin` / `12345678`

## CORS
Backend already uses `cors()`. If file:// blocked by browser, serve phase1:

```bash
cd phase1 && python3 -m http.server 8080
# open http://localhost:8080
```

## P0 update (wired)
- cards.html → GET/POST /api/cards, block
- collateral.html → collateral + guarantees
- instruments.html → list + issue
- setup.html → GET/PUT /api/compliance/setup
- js/shell.js → shared nav + logout on all pages
