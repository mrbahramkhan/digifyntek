# NADRA live integration skeleton

## Architecture

```
CIF / KYC UI
    → POST /api/v1/nadra/verify  (or /bio-verify, /verisys)
        → integrations/nadra.js
            → simulator (default)
            → OR live HTTP gateway (NADRA_API_URL)
                → bank’s Verisys / Bio-Verisys middleware
                    → NADRA
```

DigiFyntek does **not** embed official NADRA SDK secrets in the repo.  
Production uses your **licensed channel** credentials and URL.

## Environment

| Variable | Purpose |
|----------|---------|
| `NADRA_MODE` | `simulator` \| `live` |
| `NADRA_API_URL` | Gateway base URL |
| `NADRA_API_KEY` | API key / token |
| `NADRA_CLIENT_ID` | Client id header |
| `NADRA_BIOMETRIC` | `1` require biometric before data |
| `NADRA_ALLOW_VERISYS` | `1` allow demographic-only Verisys |
| `NADRA_VERIFY_PATH` | Path for Verisys POST |
| `NADRA_BIO_PATH` | Path for Bio-Verisys POST |
| `NADRA_TIMEOUT_MS` | Timeout (default 20000) |

## API

| Method | Path | Body highlights |
|--------|------|-----------------|
| GET | `/api/v1/nadra/config` | Public mode flags |
| POST | `/api/v1/nadra/verify` | `cnic`, `biometric_ok`, `biometric_template`, `customer_id` |
| POST | `/api/v1/nadra/bio-verify` | Bio-Verisys explicit |
| POST | `/api/v1/nadra/verisys` | Demographic only if allowed |
| GET | `/api/v1/nadra/history` | Audit rows |

## Live onboarding steps

1. Contract Verisys/Bio-Verisys with NADRA / approved vendor.  
2. Deploy vendor gateway; get URL + key + franchise id.  
3. Set env `NADRA_MODE=live` and credentials.  
4. Adjust `mapLiveResponse()` in `backend/src/integrations/nadra.js` to exact JSON/XML fields.  
5. Wire branch biometric devices → base64 `biometric_template` into UI/API.  
6. UAT: success, not found, blocked, timeout, biometric fail.  
7. Never log full biometric templates or full CNIC in plain application logs (mask).

## Simulator test CNICs

| Pattern | Result |
|---------|--------|
| Normal 13-digit | Verified + fake citizen |
| Ends with `0000` | not_found |
| Ends with `9999` | blocked |
| Without `biometric_ok` when bio required | biometric_required |

## SBP note

Identity verification (BV or Verisys) is part of CDD before full relationship activation.  
Retain reference numbers in `cbs_nadra_verifications`.
