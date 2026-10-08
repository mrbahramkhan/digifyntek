USE forge_coop;

INSERT INTO organisations (code, name, province, society_class, institution_kind, finance_mode, reg_number, address)
VALUES ('001', 'Demo Village Agriculture Cooperative Society Ltd', 'punjab', 'resource', 'primary', 'hybrid', 'REG-DEMO-001', 'Demo Village, Punjab');

SET @org := LAST_INSERT_ID();

INSERT INTO vacs (org_id, code, name, district, is_active)
VALUES (@org, '0002', 'Demo VAC', 'Lahore', 1);
SET @vac := LAST_INSERT_ID();

-- password: 12345678 (bcrypt). After install run: npm run db:seed-admin (bcrypt placeholder — set via app on first run)
INSERT INTO users (org_id, user_id, password_hash, full_name, role)
VALUES (@org, 'superadmin', 'ybash5', 'Super Admin', 'superadmin');

INSERT INTO members (org_id, vac_id, member_code, full_name, cnic, mobile, village, is_farmer, status, joined_at, nominee_name, nominee_relation)
VALUES
(@org, @vac, 'M-001', 'Hasnain Malik', '35202-1234567-1', '0300-1234567', 'Demo Village', 1, 'active', '2024-01-12', 'Ayesha Malik', 'Wife'),
(@org, @vac, 'M-002', 'Zain Ali', '35202-7654321-9', '0301-7654321', 'Demo Village', 1, 'active', '2024-03-01', NULL, NULL),
(@org, @vac, 'M-003', 'Arslan Khan', '35202-9988776-5', '0321-9988776', 'Demo Village', 0, 'active', '2024-06-15', NULL, NULL),
(@org, @vac, 'M-004', 'Fatima Bibi', '35202-1122334-2', '0333-1122334', 'Demo Village', 1, 'active', '2025-01-10', NULL, NULL);

SET @m1 := (SELECT id FROM members WHERE cnic='35202-1234567-1');
SET @m2 := (SELECT id FROM members WHERE cnic='35202-7654321-9');
SET @m3 := (SELECT id FROM members WHERE cnic='35202-9988776-5');
SET @m4 := (SELECT id FROM members WHERE cnic='35202-1122334-2');

INSERT INTO share_folios (member_id, folio_no, shares, face_value, status, issued_at) VALUES
(@m1, 'F-210', 12, 1000, 'active', '2025-01-02'),
(@m2, 'F-211', 8, 1000, 'active', '2025-03-15');

INSERT INTO membership_cards (member_id, card_number, issue_date, expiry_date, status, qr_payload) VALUES
(@m1, 'MC-000786', '2025-01-02', '2028-01-02', 'active', 'member:1'),
(@m2, 'MC-000710', '2025-03-15', '2028-03-15', 'active', 'member:2');

INSERT INTO loan_products (org_id, code, name, mode, interest_or_profit_pct, max_amount, max_tenor_months) VALUES
(@org, 'AGRI', 'Agri seasonal', 'conventional', 12.0000, 200000, 12),
(@org, 'MUR-IN', 'Input Murabaha', 'murabaha', 10.0000, 150000, 9),
(@org, 'SALAM', 'Crop Salam', 'salam', 0, 300000, 6),
(@org, 'QARD', 'Qard Hasan emergency', 'qard_hasan', 0, 50000, 12),
(@org, 'IJARAH', 'Equipment Ijarah', 'ijarah', 0, 500000, 36);

SET @p_agri := (SELECT id FROM loan_products WHERE code='AGRI');
SET @p_mur := (SELECT id FROM loan_products WHERE code='MUR-IN');

INSERT INTO loans (org_id, vac_id, member_id, product_id, loan_number, mode, principal, outstanding, profit_or_interest, disbursed_at, maturity_at, status, classification, days_past_due, par_bucket, mcl_ok, underlying_asset)
VALUES
(@org, @vac, @m1, @p_agri, 'LN-88421', 'conventional', 100000, 85000, 12000, '2026-03-12', '2027-03-12', 'active', 'performing', 0, 'current', 1, NULL),
(@org, @vac, @m1, @p_mur, 'IM-2026-0012', 'murabaha', 45000, 12000, 4500, '2026-04-01', '2026-12-01', 'active', 'performing', 0, 'current', 1, 'DAP + urea Kharif'),
(@org, @vac, @m3, @p_agri, 'LN-85220', 'conventional', 150000, 120000, 18000, '2025-08-10', '2026-08-10', 'active', 'oa', 45, 'd30', 1, NULL),
(@org, @vac, @m4, @p_agri, 'LN-84115', 'conventional', 50000, 38000, 6000, '2025-07-20', '2026-04-20', 'active', 'substandard', 66, 'd60', 1, NULL);

SET @l1 := (SELECT id FROM loans WHERE loan_number='LN-88421');

INSERT INTO collaterals (member_id, loan_id, collateral_code, coll_type, description, declared_value, charge_date, status)
VALUES (@m1, @l1, 'CL-2026-0041', 'agri_land', 'Khasra 112 · 2 acres', 1200000, '2026-03-12', 'charged');

INSERT INTO guarantees (guarantee_code, guarantor_member_id, borrower_member_id, loan_id, amount, status)
VALUES ('GR-2026-00089', @m3, @m1, @l1, 85000, 'active');

INSERT INTO instruments (org_id, instrument_no, inst_type, member_id, loan_id, amount_or_shares, issue_date, status) VALUES
(@org, 'LA-2026-00412', 'loan_agreement', @m1, @l1, 100000, '2026-03-12', 'active'),
(@org, 'SC-2025-00786', 'share_certificate', @m1, NULL, 12, '2025-01-02', 'active'),
(@org, 'GR-2026-00089', 'guarantee', @m3, @l1, 85000, '2026-03-12', 'active'),
(@org, 'DR-2026-00102', 'deposit_receipt', @m1, NULL, 25000, '2026-02-20', 'active');

INSERT INTO savings_accounts (member_id, account_no, mode, balance, status, opened_at)
VALUES (@m1, 'SA-0001', 'mudaraba', 25000, 'active', '2026-02-20');

INSERT INTO compliance_items (org_id, section_code, item_code, title, is_done) VALUES
(@org, 'A', 'A1', 'Society class decided', 1),
(@org, 'A', 'A2', 'Minimum members confirmed', 1),
(@org, 'A', 'A3', 'Promoters eligible', 0),
(@org, 'B', 'B1', 'Application to Registrar', 0),
(@org, 'C', 'C1', 'Bank account opened', 1),
(@org, 'D', 'D1', 'AGM held', 0),
(@org, 'D', 'D2', 'External audit done', 0);

INSERT INTO statutory_events (org_id, vac_id, event_type, event_date, status) VALUES
(@org, @vac, 'agm', '2026-09-30', 'due'),
(@org, @vac, 'external_audit', '2026-08-31', 'due');
