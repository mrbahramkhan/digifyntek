# Forge Angular Integration — Services & Structure

Existing app is **Angular**. Keep the same project, replace UI only.

## Recommended folder structure

```
src/app/
├── core/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   ├── auth.interceptor.ts
│   │   └── auth.guard.ts
│   ├── api/
│   │   └── api.config.ts          # base URL + all endpoint constants
│   └── models/
│       ├── user.model.ts
│       ├── member.model.ts        # was farmer
│       └── loan.model.ts
├── shared/
│   ├── components/                # Forge design system
│   │   ├── button/
│   │   ├── input/
│   │   ├── kpi-card/
│   │   ├── sidebar/
│   │   └── topbar/
│   └── pipes/
├── features/
│   ├── auth/
│   │   └── login/
│   ├── dashboard/
│   ├── members/                   # CRM
│   │   ├── member-list/
│   │   └── member-form/           # Add/Edit + Farmer tick
│   ├── credit/
│   ├── shares/
│   ├── governance/
│   └── settings/
└── layout/
    └── main-layout/               # Sidebar + Topbar shell
```

---

## api.config.ts (endpoints)

```typescript
export const API_BASE = 'https://digitalkisaan.mfsys.ca/digitalkisaan';

export const API = {
  // Auth
  LOGIN: `${API_BASE}/user/login`,
  REFRESH: `${API_BASE}/user/refreshToken`,
  CHANGE_PASSWORD: `${API_BASE}/user/changePassword`,

  // Members (Farmers)
  MEMBER_COUNT: `${API_BASE}/farmer/getCount`,
  MEMBER_BY_ORGA: `${API_BASE}/farmer/getByOrga`,
  MEMBER_BY_VAC: `${API_BASE}/farmer/getByVacs`,
  MEMBER_BY_ID: `${API_BASE}/farmer/get`,
  MEMBER_BY_CNIC: `${API_BASE}/farmer/getByCnic`,
  MEMBER_SAVE: `${API_BASE}/farmer/save`,
  MEMBER_UPDATE: `${API_BASE}/farmer/update`,
  HOUSEHOLD_COUNT: `${API_BASE}/farmer/household/getCount`,

  // Loans
  LOAN_ALL: `${API_BASE}/loan/account/getAll`,
  LOAN_UNAPPROVED: `${API_BASE}/loan/account/getUnApproved`,
  LOAN_SAVE: `${API_BASE}/loan/account/save`,
  LOAN_APPROVE: `${API_BASE}/loan/account/approved`,
  LOAN_REJECT: `${API_BASE}/loan/account/rejected`,
  LOAN_DETAIL: `${API_BASE}/loan/account/loanDetail`,
  LOAN_YEARLY: `${API_BASE}/loan/yearlyBalance`,
  LOAN_PRODUCTS: `${API_BASE}/loan/product/getAll`,

  // VAC
  VAC_ACTIVE: `${API_BASE}/vacs/getActive`,
  VAC_GET: `${API_BASE}/vacs/get`,
  VAC_BY_ORGA: `${API_BASE}/vacs/getByOrga`,
  VAC_COUNT: `${API_BASE}/vacs/getCount`,

  // Staff
  STAFF_COUNT: `${API_BASE}/staff/count`,
  STAFF_ALL: `${API_BASE}/staff/getAll`,

  // District
  DISTRICT_BY_ORGA: `${API_BASE}/district/getByOrga`,
};
```

---

## auth.service.ts (core)

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { API } from '../api/api.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'forge_token';
  private orgKey = 'forge_org';
  private vacKey = 'forge_vac';

  constructor(private http: HttpClient) {}

  login(userId: string, password: string) {
    return this.http.post<any>(API.LOGIN, { userId, password }).pipe(
      tap((res) => {
        // Adjust keys to actual login response
        const token = res?.token || res?.accessToken || res?.data?.token;
        const org = res?.porOrgacode || res?.data?.porOrgacode || '001';
        const vac = res?.vacCode || res?.data?.vacCode || '';
        if (token) localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.orgKey, org);
        localStorage.setItem(this.vacKey, vac);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getOrg(): string {
    return localStorage.getItem(this.orgKey) || '001';
  }

  getVac(): string {
    return localStorage.getItem(this.vacKey) || '';
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.orgKey);
    localStorage.removeItem(this.vacKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}
```

---

## auth.interceptor.ts

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(req);
};
```

Register in `app.config.ts`:
```typescript
provideHttpClient(withInterceptors([authInterceptor]))
```

---

## member.service.ts (CRM)

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class MemberService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  getCount() {
    const params = new HttpParams().set('porOrgacode', this.auth.getOrg());
    return this.http.get<any>(API.MEMBER_COUNT, { params });
  }

  getByVac() {
    const params = new HttpParams()
      .set('porOrgacode', this.auth.getOrg())
      .set('vacCode', this.auth.getVac());
    return this.http.get<any>(API.MEMBER_BY_VAC, { params });
  }

  getByOrga() {
    const params = new HttpParams().set('porOrgacode', this.auth.getOrg());
    return this.http.get<any>(API.MEMBER_BY_ORGA, { params });
  }

  getById(id: string) {
    const params = new HttpParams().set('id', id); // confirm actual param name
    return this.http.get<any>(API.MEMBER_BY_ID, { params });
  }

  save(payload: any) {
    // payload = existing farmer save body
    // UI "isFarmer" tick → map into payload as needed
    return this.http.post(API.MEMBER_SAVE, payload);
  }

  update(payload: any) {
    return this.http.put(API.MEMBER_UPDATE, payload);
  }

  getHouseholdCount() {
    const params = new HttpParams().set('porOrgacode', this.auth.getOrg());
    return this.http.get<any>(API.HOUSEHOLD_COUNT, { params });
  }
}
```

---

## dashboard.service.ts

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { API } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  loadKpis() {
    const org = this.auth.getOrg();
    const vac = this.auth.getVac();

    const memberCount = this.http.get(API.MEMBER_COUNT, {
      params: new HttpParams().set('porOrgacode', org)
    });
    const household = this.http.get(API.HOUSEHOLD_COUNT, {
      params: new HttpParams().set('porOrgacode', org)
    });
    const loanYearly = this.http.get(API.LOAN_YEARLY, {
      params: new HttpParams()
        .set('porOrgacode', org)
        .set('vacCode', '')
        .set('isVac', 'false')
    });
    const loans = this.http.get(API.LOAN_ALL); // adjust params if required

    return forkJoin({ memberCount, household, loanYearly, loans });
  }
}
```

---

## Integration steps (do in order)

1. **Keep existing Angular project** — do not create new BE.
2. Add Forge design tokens (CSS variables) in `styles.scss`.
3. Build shared UI components (button, input, kpi-card, sidebar, topbar).
4. Add `api.config.ts` + AuthService + Interceptor (use real login response keys after one test login).
5. Replace Login page template with Forge login (same AuthService.login).
6. Replace main layout with Forge sidebar + topbar.
7. Replace Dashboard with Forge KPIs (DashboardService.loadKpis).
8. Members list → MemberService.getByVac / getByOrga.
9. Add Member form → map fields to existing `/farmer/save` body; add “Is Farmer” checkbox on UI.
10. Credit screens → Loan endpoints above.
11. Repeat module by module; BE untouched.

---

## Farmer tick (CRM)

Short term (no BE change):
- Every record from `/farmer/*` is a Member.
- UI shows tag “Farmer” by default.
- Checkbox “Is Farmer” on form can be stored in a free field if available, or only used for filtering on FE.

Long term (optional small BE change):
- Add `memberType` or `isFarmer` boolean on farmer entity.
- Save/Update payload includes it.

---

## CORS / Environment

If frontend stays on same domain (`digitalkisaan.mfsys.ca`) → no CORS issue.  
If separate domain → backend must allow origin.

Use environment files:
```typescript
// environment.ts
export const environment = {
  production: false,
  apiBase: 'https://digitalkisaan.mfsys.ca/digitalkisaan'
};
```

