# Assumptions & regulatory items requiring verification

## Assumptions

1. Institution may operate as **cooperative / microfinance-style** or small bank — product set configurable.  
2. **MySQL** remains system of record for this codebase generation.  
3. External payment specs (Raast, PRISM+, 1LINK) require **bank-authorized** credentials — only **simulators** until then.  
4. CNIC verification via NADRA/authorized gateway is **not** simulated as “verified” in production paths; states: pending / verified / rejected / unavailable / manual_review.  
5. IBAN generation follows Pakistan IBAN structure only when bank code + account format are configured; otherwise account numbers are internal only.  
6. Legacy Digital Kisaan tables remain available via `DB_MODE=legacy` for parallel read/migration.

## Must verify with bank compliance / legal (official sources)

| Topic | Why |
|-------|-----|
| Current SBP Prudential Regulations (banks / MFBs / DFIs as applicable) | Classification, capital, exposure limits |
| AML/CFT regulations and STR reporting process | Case handling, retention |
| Raast participation model and message specs | Adapter design |
| PRISM+ operating rules & ISO 20022 profiles | HV payment adapter |
| 1LINK product participation | IBFT/ATM scope |
| Cooperative vs banking company licensing | Feature enablement |
| Withholding tax on profit/interest | Calculation engine |
| Unclaimed deposits rules | Dormancy workflows |
| Customer data protection expectations | Masking, access logs |

## Rule register (implementation table)

See SQL `regulatory_rule_register` — each row: name, source URL, circular ref, effective date, module, status, owner.

**Never claim SBP certification from software features alone.**
