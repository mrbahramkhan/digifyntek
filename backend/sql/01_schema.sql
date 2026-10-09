-- ============================================================
-- FORGE — Cooperative Platform MySQL Schema (end-to-end)
-- Engine: InnoDB · Charset: utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS digifyntek
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE digifyntek;

-- ------------------------------------------------------------
-- 1. ORGANISATION / VAC / SETUP
-- ------------------------------------------------------------
CREATE TABLE organisations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  province      ENUM('punjab','sindh','kp','balochistan') NOT NULL DEFAULT 'punjab',
  society_class ENUM('resource','producers','consumers','housing','general') NOT NULL DEFAULT 'resource',
  institution_kind ENUM('primary','secondary','apex_bank') NOT NULL DEFAULT 'primary',
  finance_mode  ENUM('conventional','islamic','hybrid') NOT NULL DEFAULT 'conventional',
  reg_number    VARCHAR(100) NULL,
  address       TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE vacs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  code          VARCHAR(20) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  district      VARCHAR(100) NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  logo_url      VARCHAR(500) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vac (org_id, code),
  CONSTRAINT fk_vac_org FOREIGN KEY (org_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. USERS / ROLES / AUTH
-- ------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(150) NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user (org_id, user_id),
  CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. MEMBERS (CRM)
-- ------------------------------------------------------------
CREATE TABLE members (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  vac_id        INT UNSIGNED NOT NULL,
  member_code   VARCHAR(40) NULL,
  full_name     VARCHAR(150) NOT NULL,
  cnic          VARCHAR(15) NOT NULL,
  mobile        VARCHAR(20) NULL,
  village       VARCHAR(100) NULL,
  address       TEXT NULL,
  is_farmer     TINYINT(1) NOT NULL DEFAULT 0,
  is_board      TINYINT(1) NOT NULL DEFAULT 0,
  status        ENUM('active','inactive','suspended','exited') NOT NULL DEFAULT 'active',
  joined_at     DATE NULL,
  nominee_name  VARCHAR(150) NULL,
  nominee_relation VARCHAR(50) NULL,
  nominee_cnic  VARCHAR(15) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cnic_org (org_id, cnic),
  KEY idx_vac (vac_id),
  CONSTRAINT fk_mem_org FOREIGN KEY (org_id) REFERENCES organisations(id),
  CONSTRAINT fk_mem_vac FOREIGN KEY (vac_id) REFERENCES vacs(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. SHARES
-- ------------------------------------------------------------
CREATE TABLE share_folios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id     INT UNSIGNED NOT NULL,
  folio_no      VARCHAR(40) NOT NULL,
  shares        INT UNSIGNED NOT NULL DEFAULT 0,
  face_value    DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  status        ENUM('active','transferred','cancelled') NOT NULL DEFAULT 'active',
  issued_at     DATE NULL,
  UNIQUE KEY uq_folio (folio_no),
  CONSTRAINT fk_folio_mem FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

CREATE TABLE share_transactions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folio_id      INT UNSIGNED NOT NULL,
  txn_type      ENUM('purchase','transfer_in','transfer_out','cancel') NOT NULL,
  shares        INT NOT NULL,
  amount        DECIMAL(14,2) NULL,
  ref_member_id INT UNSIGNED NULL,
  txn_date      DATE NOT NULL,
  notes         VARCHAR(255) NULL,
  CONSTRAINT fk_st_folio FOREIGN KEY (folio_id) REFERENCES share_folios(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. MEMBERSHIP CARDS
-- ------------------------------------------------------------
CREATE TABLE membership_cards (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id     INT UNSIGNED NOT NULL,
  card_number   VARCHAR(40) NOT NULL UNIQUE,
  issue_date    DATE NULL,
  expiry_date   DATE NULL,
  status        ENUM('active','blocked','lost','expired','pending_print') NOT NULL DEFAULT 'pending_print',
  qr_payload    VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_card_mem FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. LOAN PRODUCTS
-- ------------------------------------------------------------
CREATE TABLE loan_products (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  code          VARCHAR(40) NOT NULL,
  name          VARCHAR(150) NOT NULL,
  mode          ENUM('conventional','murabaha','salam','ijarah','qard_hasan','diminishing_musharaka','mudaraba') NOT NULL DEFAULT 'conventional',
  interest_or_profit_pct DECIMAL(8,4) NULL COMMENT '0 for qard_hasan',
  max_amount    DECIMAL(14,2) NULL,
  max_tenor_months INT UNSIGNED NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_prod (org_id, code),
  CONSTRAINT fk_prod_org FOREIGN KEY (org_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. LOANS / FACILITIES
-- ------------------------------------------------------------
CREATE TABLE loans (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  vac_id        INT UNSIGNED NOT NULL,
  member_id     INT UNSIGNED NOT NULL,
  product_id    INT UNSIGNED NOT NULL,
  loan_number   VARCHAR(40) NOT NULL UNIQUE,
  mode          ENUM('conventional','murabaha','salam','ijarah','qard_hasan','diminishing_musharaka','mudaraba') NOT NULL,
  principal     DECIMAL(14,2) NOT NULL,
  outstanding   DECIMAL(14,2) NOT NULL,
  profit_or_interest DECIMAL(14,2) NOT NULL DEFAULT 0,
  disbursed_at  DATE NULL,
  maturity_at   DATE NULL,
  status        ENUM('draft','pending_approval','approved','disbursed','active','settled','written_off','rejected') NOT NULL DEFAULT 'draft',
  classification ENUM('performing','oa','substandard','doubtful','loss') NOT NULL DEFAULT 'performing',
  days_past_due INT NOT NULL DEFAULT 0,
  par_bucket    ENUM('current','d30','d60','d90') NOT NULL DEFAULT 'current',
  provision_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  underlying_asset VARCHAR(255) NULL COMMENT 'For Islamic modes',
  mcl_ok        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_member (member_id),
  KEY idx_status (status),
  KEY idx_par (par_bucket),
  CONSTRAINT fk_loan_org FOREIGN KEY (org_id) REFERENCES organisations(id),
  CONSTRAINT fk_loan_vac FOREIGN KEY (vac_id) REFERENCES vacs(id),
  CONSTRAINT fk_loan_mem FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_loan_prod FOREIGN KEY (product_id) REFERENCES loan_products(id)
) ENGINE=InnoDB;

CREATE TABLE loan_schedules (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id       INT UNSIGNED NOT NULL,
  installment_no INT UNSIGNED NOT NULL,
  due_date      DATE NOT NULL,
  principal_due DECIMAL(14,2) NOT NULL DEFAULT 0,
  profit_due    DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_due     DECIMAL(14,2) NOT NULL,
  paid_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_at       DATE NULL,
  status        ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  UNIQUE KEY uq_inst (loan_id, installment_no),
  CONSTRAINT fk_sch_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE loan_repayments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id       INT UNSIGNED NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,
  paid_at       DATE NOT NULL,
  method        VARCHAR(40) NULL,
  receipt_no    VARCHAR(40) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rep_loan FOREIGN KEY (loan_id) REFERENCES loans(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. COLLATERAL & GUARANTEES
-- ------------------------------------------------------------
CREATE TABLE collaterals (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id     INT UNSIGNED NOT NULL,
  loan_id       INT UNSIGNED NULL,
  collateral_code VARCHAR(40) NOT NULL UNIQUE,
  coll_type     ENUM('agri_land','residential','livestock','gold','equipment','other') NOT NULL,
  description   VARCHAR(255) NULL,
  declared_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  charge_date   DATE NULL,
  release_date  DATE NULL,
  status        ENUM('charged','pending_release','released') NOT NULL DEFAULT 'charged',
  docs_json     JSON NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_col_mem FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_col_loan FOREIGN KEY (loan_id) REFERENCES loans(id)
) ENGINE=InnoDB;

CREATE TABLE guarantees (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guarantee_code VARCHAR(40) NOT NULL UNIQUE,
  guarantor_member_id INT UNSIGNED NOT NULL,
  borrower_member_id  INT UNSIGNED NOT NULL,
  loan_id       INT UNSIGNED NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,
  status        ENUM('active','released','claimed','at_risk') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gu_g FOREIGN KEY (guarantor_member_id) REFERENCES members(id),
  CONSTRAINT fk_gu_b FOREIGN KEY (borrower_member_id) REFERENCES members(id),
  CONSTRAINT fk_gu_l FOREIGN KEY (loan_id) REFERENCES loans(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. INSTRUMENTS
-- ------------------------------------------------------------
CREATE TABLE instruments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  instrument_no VARCHAR(40) NOT NULL UNIQUE,
  inst_type     ENUM('loan_agreement','share_certificate','guarantee','deposit_receipt') NOT NULL,
  member_id     INT UNSIGNED NULL,
  loan_id       INT UNSIGNED NULL,
  folio_id      INT UNSIGNED NULL,
  amount_or_shares DECIMAL(14,2) NULL,
  issue_date    DATE NULL,
  status        ENUM('draft','active','settled','cancelled','written_off') NOT NULL DEFAULT 'draft',
  doc_url       VARCHAR(500) NULL,
  notes         TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inst_org FOREIGN KEY (org_id) REFERENCES organisations(id),
  CONSTRAINT fk_inst_mem FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 10. SAVINGS (simple)
-- ------------------------------------------------------------
CREATE TABLE savings_accounts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id     INT UNSIGNED NOT NULL,
  account_no    VARCHAR(40) NOT NULL UNIQUE,
  mode          ENUM('conventional','mudaraba','qard') NOT NULL DEFAULT 'conventional',
  balance       DECIMAL(14,2) NOT NULL DEFAULT 0,
  status        ENUM('active','closed') NOT NULL DEFAULT 'active',
  opened_at     DATE NULL,
  CONSTRAINT fk_sav_mem FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

CREATE TABLE savings_txns (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id    INT UNSIGNED NOT NULL,
  txn_type      ENUM('deposit','withdrawal','profit') NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,
  txn_date      DATE NOT NULL,
  ref           VARCHAR(40) NULL,
  CONSTRAINT fk_stxn_acc FOREIGN KEY (account_id) REFERENCES savings_accounts(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 11. COMPLIANCE / REGISTRATION CHECKLIST
-- ------------------------------------------------------------
CREATE TABLE compliance_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  section_code  VARCHAR(10) NOT NULL,
  item_code     VARCHAR(40) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  is_done       TINYINT(1) NOT NULL DEFAULT 0,
  done_at       DATE NULL,
  UNIQUE KEY uq_item (org_id, item_code),
  CONSTRAINT fk_ci_org FOREIGN KEY (org_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

CREATE TABLE statutory_events (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        INT UNSIGNED NOT NULL,
  vac_id        INT UNSIGNED NULL,
  event_type    ENUM('agm','internal_audit','external_audit','reserve_transfer','return_filed') NOT NULL,
  event_date    DATE NULL,
  status        ENUM('due','done','overdue') NOT NULL DEFAULT 'due',
  notes         VARCHAR(255) NULL,
  CONSTRAINT fk_se_org FOREIGN KEY (org_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 12. DOCUMENTS VAULT
-- ------------------------------------------------------------
CREATE TABLE documents (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id     INT UNSIGNED NULL,
  loan_id       INT UNSIGNED NULL,
  doc_type      VARCHAR(50) NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_mem FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 13. AUDIT LOG
-- ------------------------------------------------------------
CREATE TABLE audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NULL,
  action        VARCHAR(80) NOT NULL,
  entity        VARCHAR(80) NULL,
  entity_id     VARCHAR(40) NULL,
  detail_json   JSON NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Views for PAR / KPIs
CREATE OR REPLACE VIEW v_portfolio_summary AS
SELECT
  org_id,
  COUNT(*) AS active_loans,
  SUM(outstanding) AS portfolio_outstanding,
  SUM(CASE WHEN par_bucket = 'current' THEN outstanding ELSE 0 END) AS current_os,
  SUM(CASE WHEN par_bucket = 'd30' THEN outstanding ELSE 0 END) AS par30_os,
  SUM(CASE WHEN par_bucket = 'd60' THEN outstanding ELSE 0 END) AS par60_os,
  SUM(CASE WHEN par_bucket = 'd90' THEN outstanding ELSE 0 END) AS par90_os
FROM loans
WHERE status IN ('disbursed','active')
GROUP BY org_id;
