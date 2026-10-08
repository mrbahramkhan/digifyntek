# Forge ↔ Digital Kisaan Backend — Complete API Mapping

**Base URL:** `https://digitalkisaan.mfsys.ca/digitalkisaan`  
**Auth:** Bearer token from login (store in localStorage / session)  
**Common params:** `porOrgacode` (org), `vacCode` (VAC)

---

## 1. AUTH

| Action | Method | Endpoint | Body / Params |
|--------|--------|----------|---------------|
| Login | POST | `/user/login` | `{ userId, password }` |
| Refresh Token | POST | `/user/refreshToken` | token |
| Change Password | POST | `/user/changePassword` | — |
| Reset Password | POST | `/user/resetPassword` | — |
| Get Permissions | GET | `/user/getPermission` | — |
| Save Permissions | POST | `/user/savePermission` | — |

**Login response typically contains:** token, user info, `porOrgacode`, `vacCode`, roles.

---

## 2. DASHBOARD KPIs

| Forge KPI | Endpoint | Notes |
|------------|----------|-------|
| Total Members | `GET /farmer/getCount?porOrgacode={org}` | Use as Members count |
| Farmers tagged | Same + filter, or count from list | CRM tag logic on FE or flag on BE |
| Active Loans | `GET /loan/account/getAll` or yearlyBalance | Filter active status |
| Portfolio Outstanding | `GET /loan/yearlyBalance?porOrgacode={org}&vacCode=&isVac=false` | Sum outstanding |
| Collection Rate | Derive from loan repayment / balance APIs | Or dedicated report if exists |
| Household Outreach | `GET /farmer/household/getCount?porOrgacode={org}` | Already used |
| Staff count | `GET /staff/count?porOrgacode={org}` | Optional KPI |
| VAC count | `GET /vacs/getCount?porOrgacode={org}` | Optional |

**Other dashboard calls seen in production:**
- `GET /vacs/getActive?porOrgacode=001`
- `GET /vacs/get?porOrgacode=001&vacCode=0002`
- `GET /district/getByOrga?porOrgacode=001`
- `GET /saleAndPurchases/oldTransactions?porOrgacode=001`
- `GET /renewal/hasExpiredRenewalRecord`
- `GET /audit/hasMissingAudit?porOrgacode=001&auditType=INTERNAL|EXTERNAL`

---

## 3. CRM — MEMBERS (Farmers)

| Action | Method | Endpoint |
|--------|--------|----------|
| List by Org | GET | `/farmer/getByOrga` |
| List by VAC | GET | `/farmer/getByVacs?porOrgacode={org}&vacCode={vac}` |
| Get by ID | GET | `/farmer/get` |
| Get by CNIC | GET | `/farmer/getByCnic` |
| Get by CNIC+Org+VAC | GET | `/farmer/getByCnicOrgaAndVac` |
| **Add Member** | POST | `/farmer/save` |
| **Update Member** | PUT | `/farmer/update` |

**Farmer tick:**  
Existing entity is already “farmer”. In Forge CRM:
- Treat all records as **Members**
- UI pe “Is Farmer” checkbox → map to existing field or add `memberType` / `isFarmer` if BE allows later
- Short term: all current records = Farmer-tagged members

---

## 4. SHARES

| Action | Method | Endpoint |
|--------|--------|----------|
| Get share detail | GET | `/farmer/share/getDetail` |
| Transfer / Purchase | POST | `/farmer/share/transfer` |
| Config save | POST | `/configuration/save` |
| Config get/update/delete | — | `/configuration/get`, `/update`, `/delete` |

---

## 5. CREDIT & LENDING

| Action | Method | Endpoint |
|--------|--------|----------|
| Save application | POST | `/loan/account/save` |
| Get all | GET | `/loan/account/getAll` |
| Get by ID / detail | GET | `/loan/account/loanDetail` or `/getById` |
| Unapproved list | GET | `/loan/account/getUnApproved` |
| Approve | POST | `/loan/account/approved` |
| Reject | POST | `/loan/account/rejected` |
| Undisbursed | GET | `/loan/account/getUndisbursed` |
| Yearly balance | GET | `/loan/yearlyBalance` |
| Products list | GET | `/loan/product/getAll` |
| Product save/update/delete | — | `/loan/product/save`, `/update`, `/delete` |
| Product by ID | GET | `/loan/product/getById` |

---

## 6. VAC / GOVERNANCE

| Action | Method | Endpoint |
|--------|--------|----------|
| Save VAC | POST | `/vacs/save` |
| Update | PUT | `/vacs/update` |
| Get one | GET | `/vacs/get` |
| Get by Org | GET | `/vacs/getByOrga` |
| Get by District | GET | `/vacs/getByDistrict` |
| Active list | GET | `/vacs/getActive` |
| Delete | DELETE | `/vacs/delete` |
| Logo | POST | `/vacs/updateLogo` |
| Board save | POST | `/boardmember/save` |
| Board get | GET | `/boardmember/getByOrgaVacs` |
| Meeting save/get/update/delete | — | `/meeting/save`, `/get`, `/update`, `/delete` |
| Latest AGM date | GET | `/meeting/getLatestAgmDate` |
| Staff save/get/update/delete | — | `/staff/save`, `/getAll`, `/update`, `/delete` |
| Staff by VAC | GET | `/staff/vac` |

---

## 7. INVENTORY / ASSETS / ACCOUNTING

| Module | Key endpoints |
|--------|----------------|
| Fixed Assets | `/fixedAssets/save`, `/getAll`, `/update`, `/delete`, `/getByVacAndOrga` |
| Sale / Purchase | `/salePurchase/save/transaction`, `/update/transaction`, `/get/refNumber` |
| Chart of Accounts | `/coa/getAll`, `/getForTransactions`, `/getForInventory`, `/getByNature` |
| Charges | `/charges/save`, `/getAll`, `/update`, `/delete` |
| Transaction types | `/transaction/save`, `/getAll`, `/update`, `/delete` |

---

## 8. MASTER DATA

| Entity | Endpoints |
|--------|-----------|
| Division | `/division/save`, `/getByOrga`, `/update`, `/delete` |
| District | `/district/save`, `/get`, `/getByOrga`, `/update`, `/delete` |
| Village | `/village/save`, `/get`, `/getByOrga`, `/update`, `/delete` |
| Education | `/education/save`, `/getByOrga`, `/update`, `/delete` |
| User Role | `/userrole/save`, `/getByOrga`, `/update`, `/delete` |
| Board Designation | `/board/designation/save`, `/getAll`, `/update`, `/delete` |
| Staff Designation | `/staff/designation/save`, `/getAll`, `/update`, `/delete` |

---

## Forge Screen → API (quick ref)

| Forge Screen | Primary APIs |
|---------------|--------------|
| Login | `POST /user/login` |
| Dashboard | farmer/getCount, household/getCount, loan/yearlyBalance, loan/account/getAll, vacs/getActive |
| Members list | `GET /farmer/getByVacs` or `getByOrga` |
| Add / Edit Member | `POST /farmer/save`, `PUT /farmer/update`, `GET /farmer/get` |
| Shares | `/farmer/share/*` |
| Credit list | `/loan/account/getAll`, `getUnApproved` |
| Loan application | `/loan/account/save`, `approved`, `rejected` |
| Products | `/loan/product/*` |
| Institution / VAC | `/vacs/*` |
| Staff & Board | `/staff/*`, `/boardmember/*` |
| Meetings | `/meeting/*` |
| Inventory | `/fixedAssets/*`, `/salePurchase/*` |
| Accounting | `/coa/*` |

