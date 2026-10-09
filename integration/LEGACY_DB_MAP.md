# DigiFyntek ↔ Digital Kisaan DB mapping

Dump: `DigitalKissan-old_backuo.sql` · Database: `digifyntek` (renamed from digitalkisaan dump) · **63 tables**

## Import dump as digifyntek

```bash
# Option A — rename while importing
sed 's/\`digitalkisaan\`/\`digifyntek\`/g' DigitalKissan-old_backuo.sql | mysql -u root -p

# Option B — after import
# mysql> CREATE DATABASE digifyntek;
# mysql> RENAME TABLE ... (or re-import into digifyntek)
```

## Enable

```env
DB_NAME=digifyntek
DB_MODE=legacy
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=...
```

## Table map

| DigiFyntek API | Legacy table | Notes |
|----------------|--------------|--------|
| `POST /api/auth/login` | `tbl_users` | `user_id`, bcrypt `user_password`, `por_orgacode`, `user_homevac` |
| `GET /api/members` | `tbl_farmer` | `farmer_no`, CNIC, name, vac |
| `GET /api/members/:id/360` | farmer + loan + share + deposit | Composite |
| `GET /api/loans` | `tbl_loanaccount` | `account_no`, balance = outstanding |
| `GET /api/loans/portfolio` | `tbl_loanaccount` aggregates | |
| `GET /api/shares` | `tbl_farmer_share` | held + value |
| `GET /api/savings` | `tbl_depositaccount` | |
| `GET /api/dashboard/kpis` | counts on farmer/loan/share/vac/deposit | |
| `GET /api/vacs` | `tbl_vacs` | Society list |
| Guarantors | `tbl_loanguarantor` | |

## Keys

- Org: `por_orgacode` (e.g. `001`)
- VAC: `vac_code`
- Farmer PK: `(farmer_no, por_orgacode, vac_code)`
- Loan PK: `(account_no, por_orgacode)`
- Txn: `tbl_mastertransaction` + `tbl_generaltransaction` (disb code `1`, repay `2`)

## Not yet mapped (still in dump)

Board, staff, meetings, inventory, fixed assets, GL/COA, grants, audit — can be added as next routes.

## Login

Use real `tbl_users.user_id` from your dump (e.g. existing users). Password must match bcrypt hash in `user_password`.
