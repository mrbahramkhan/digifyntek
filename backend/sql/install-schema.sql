-- =============================================================================
-- DigiFyntek CBS — single install schema (UAT-aligned)
-- Usage:
--   mysql -u root -p < backend/sql/install-schema.sql
--   OR: mysql -u root -p digifyntek < backend/sql/install-schema.sql
-- Idempotent: CREATE IF NOT EXISTS + seed INSERT IGNORE
-- =============================================================================

CREATE DATABASE IF NOT EXISTS digifyntek
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE digifyntek;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- Auth / users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  user_id VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organisations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_code VARCHAR(20) NULL,
  org_name VARCHAR(150) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80) NULL,
  entity_id VARCHAR(64) NULL,
  detail TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- CIF / customers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  customer_no VARCHAR(32) NULL,
  cif_no VARCHAR(32) NULL,
  member_ref VARCHAR(64) NULL,
  customer_type VARCHAR(40) NULL DEFAULT 'individual',
  full_name VARCHAR(160) NOT NULL,
  father_name VARCHAR(150) NULL,
  father_or_husband VARCHAR(160) NULL,
  gender VARCHAR(20) NULL,
  dob DATE NULL,
  cnic VARCHAR(20) NULL,
  cnic_expiry DATE NULL,
  phone VARCHAR(30) NULL,
  mobile VARCHAR(20) NULL,
  email VARCHAR(120) NULL,
  address TEXT NULL,
  city VARCHAR(80) NULL,
  branch_code VARCHAR(20) NULL,
  risk_rating VARCHAR(20) NULL DEFAULT 'low',
  aml_risk ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  kyc_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  pep_flag TINYINT(1) NOT NULL DEFAULT 0,
  is_pep TINYINT(1) NULL DEFAULT 0,
  source_of_funds VARCHAR(80) NULL,
  occupation VARCHAR(80) NULL,
  notes TEXT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cnic (cnic),
  KEY idx_cif (cif_no),
  KEY idx_customer_no (customer_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_customer_identifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  id_type VARCHAR(40) NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cust (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Products / COA / branches
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  product_code VARCHAR(40) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  product_type ENUM('savings','current','loan','share','term','islamic') NULL,
  product_family VARCHAR(40) NULL,
  islamic_mode VARCHAR(40) NULL,
  is_islamic TINYINT(1) NOT NULL DEFAULT 0,
  interest_rate DECIMAL(8,4) NULL,
  min_balance DECIMAL(18,2) NULL DEFAULT 0.00,
  gl_code VARCHAR(20) NULL,
  gl_liability VARCHAR(20) NULL,
  gl_asset VARCHAR(20) NULL,
  gl_expense VARCHAR(20) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_prod (product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_coa (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  gl_code VARCHAR(20) NOT NULL,
  gl_name VARCHAR(120) NOT NULL,
  gl_type VARCHAR(40) NULL,
  parent_code VARCHAR(20) NULL,
  is_postable TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_gl (gl_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_branches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_code VARCHAR(16) NOT NULL,
  branch_name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_br (branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  account_no VARCHAR(40) NOT NULL,
  iban VARCHAR(34) NULL,
  customer_id BIGINT UNSIGNED NULL,
  cif_no VARCHAR(32) NULL,
  product_code VARCHAR(40) NOT NULL,
  account_type ENUM('savings','current','loan','share','term','islamic') NULL,
  branch_code VARCHAR(20) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  ledger_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  available_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  open_date DATE NULL,
  opened_at DATETIME NULL,
  close_date DATE NULL,
  legacy_ref VARCHAR(64) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acct (account_no),
  KEY idx_cust (customer_id),
  KEY idx_prod (product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Ledger (double-entry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_journal_headers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  journal_ref VARCHAR(40) NOT NULL,
  business_date DATE NOT NULL,
  value_date DATE NULL,
  branch_code VARCHAR(16) NULL,
  source_module VARCHAR(40) NULL,
  source_ref VARCHAR(80) NULL,
  narrative VARCHAR(255) NULL,
  total_debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status ENUM('POSTED','REVERSED','VOID') NOT NULL DEFAULT 'POSTED',
  reversal_of BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(80) NULL,
  posted_by VARCHAR(50) NULL,
  posted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jref (journal_ref),
  UNIQUE KEY uq_idem (idempotency_key),
  KEY idx_bdate (business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_journal_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  journal_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL DEFAULT 1,
  gl_code VARCHAR(20) NOT NULL,
  account_id BIGINT UNSIGNED NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  narrative VARCHAR(255) NULL,
  KEY idx_jnl (journal_id),
  KEY idx_gl (gl_code),
  KEY idx_acct (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(50) NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transfer_ref VARCHAR(40) NOT NULL,
  from_account_id BIGINT UNSIGNED NOT NULL,
  to_account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  journal_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_xfer (transfer_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  txn_ref VARCHAR(40) NULL,
  account_id BIGINT UNSIGNED NULL,
  txn_type VARCHAR(40) NULL,
  amount DECIMAL(18,2) NULL,
  journal_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Financing / TD
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_financing_contracts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(24) NOT NULL,
  branch_code VARCHAR(16) NULL,
  principal DECIMAL(18,2) NOT NULL,
  outstanding DECIMAL(18,2) NOT NULL,
  rate_pct DECIMAL(8,4) NULL DEFAULT 0,
  status ENUM('active','closed','written_off') NOT NULL DEFAULT 'active',
  is_islamic TINYINT(1) NOT NULL DEFAULT 0,
  disbursement_journal_id BIGINT UNSIGNED NULL,
  disbursed_at DATETIME NULL,
  maturity_date DATE NULL,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract (contract_no),
  KEY idx_cust (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_financing_repayments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NOT NULL,
  repayment_ref VARCHAR(40) NOT NULL,
  business_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  principal_component DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  charge_component DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  outstanding_after DECIMAL(18,2) NOT NULL,
  journal_id BIGINT UNSIGNED NULL,
  from_account_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_repay_ref (repayment_ref),
  KEY idx_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_repayment_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NOT NULL,
  installment_no INT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  principal_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  charge_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  principal_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  charge_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  UNIQUE KEY uq_inst (contract_id, installment_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_term_deposits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  td_ref VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  funding_account_id BIGINT UNSIGNED NULL,
  product_code VARCHAR(24) NOT NULL DEFAULT 'TD-PKR',
  branch_code VARCHAR(16) NULL,
  principal DECIMAL(18,2) NOT NULL,
  outstanding_principal DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  rate_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
  tenor_days INT UNSIGNED NOT NULL,
  value_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  rollover_instruction ENUM('NONE','PRINCIPAL','PRINCIPAL_INTEREST') NOT NULL DEFAULT 'NONE',
  status ENUM('active','matured','encashed','cancelled') NOT NULL DEFAULT 'active',
  is_islamic TINYINT(1) NOT NULL DEFAULT 0,
  withholding_tax_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
  interest_accrued DECIMAL(18,2) NOT NULL DEFAULT 0,
  interest_paid DECIMAL(18,2) NOT NULL DEFAULT 0,
  wht_deducted DECIMAL(18,2) NOT NULL DEFAULT 0,
  placement_journal_id BIGINT UNSIGNED NULL,
  maturity_journal_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_td (td_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_td_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  td_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  amount DECIMAL(18,2) NULL,
  journal_id BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  actor VARCHAR(50) NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_td (td_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Approvals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_approval_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_ref VARCHAR(40) NOT NULL,
  request_type VARCHAR(40) NOT NULL,
  payload_json JSON NOT NULL,
  amount DECIMAL(18,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  maker_id VARCHAR(50) NOT NULL,
  maker_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checker_id VARCHAR(50) NULL,
  checker_at DATETIME NULL,
  checker_note VARCHAR(500) NULL,
  result_json JSON NULL,
  branch_code VARCHAR(16) NULL,
  business_date DATE NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_areq (request_ref),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- KYC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_kyc_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_ref VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  case_type VARCHAR(40) NULL DEFAULT 'ONBOARDING',
  status VARCHAR(40) NULL DEFAULT 'open',
  risk_rating VARCHAR(20) NULL,
  kyc_outcome VARCHAR(40) NULL DEFAULT 'pending',
  screening_result VARCHAR(40) NULL,
  screening_status VARCHAR(40) NULL,
  source_of_funds VARCHAR(120) NULL,
  source_of_wealth VARCHAR(120) NULL,
  purpose_of_account VARCHAR(120) NULL,
  notes TEXT NULL,
  decided_note VARCHAR(500) NULL,
  decided_by VARCHAR(50) NULL,
  decided_at DATETIME NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_case (case_ref),
  KEY idx_cust (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_kyc_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  actor VARCHAR(50) NULL,
  action VARCHAR(40) NOT NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_screening_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  screen_ref VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  kyc_case_id BIGINT UNSIGNED NULL,
  screen_type VARCHAR(40) NOT NULL,
  provider VARCHAR(40) NULL DEFAULT 'MANUAL',
  status VARCHAR(40) NULL DEFAULT 'pending',
  match_score DECIMAL(8,4) NULL,
  result_summary VARCHAR(255) NULL,
  UNIQUE KEY uq_scr (screen_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_kyc_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(40) NOT NULL,
  file_ref VARCHAR(120) NULL,
  uploaded_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Payments (Raast simulator)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_payment_instructions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_ref VARCHAR(40) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'RAAST',
  direction VARCHAR(20) NOT NULL DEFAULT 'OUT',
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NULL DEFAULT 'PKR',
  debtor_account_id BIGINT UNSIGNED NULL,
  debtor_iban VARCHAR(34) NULL,
  creditor_iban VARCHAR(34) NULL,
  creditor_name VARCHAR(120) NULL,
  raast_id VARCHAR(64) NULL,
  narrative VARCHAR(255) NULL,
  external_status VARCHAR(40) NULL,
  posting_status VARCHAR(40) NULL,
  settlement_status VARCHAR(40) NULL,
  status VARCHAR(40) NULL DEFAULT 'SIMULATED',
  journal_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(80) NULL,
  simulator TINYINT(1) NULL DEFAULT 1,
  request_json JSON NULL,
  response_json JSON NULL,
  created_by VARCHAR(50) NULL,
  business_date DATE NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pay (payment_ref),
  UNIQUE KEY uq_idem (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_payment_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  attempt_no INT NOT NULL DEFAULT 1,
  outcome VARCHAR(40) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Teller / vault
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_tellers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teller_code VARCHAR(20) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  branch_code VARCHAR(16) NOT NULL DEFAULT '001',
  full_name VARCHAR(120) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teller (teller_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_cash_drawers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  drawer_code VARCHAR(24) NOT NULL,
  branch_code VARCHAR(16) NOT NULL DEFAULT '001',
  teller_id BIGINT UNSIGNED NULL,
  business_date DATE NOT NULL,
  status ENUM('closed','open','balancing') NOT NULL DEFAULT 'closed',
  opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  cash_in DECIMAL(18,2) NOT NULL DEFAULT 0,
  cash_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  expected_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  counted_balance DECIMAL(18,2) NULL,
  variance DECIMAL(18,2) NULL,
  opened_at DATETIME NULL,
  closed_at DATETIME NULL,
  opened_by VARCHAR(50) NULL,
  closed_by VARCHAR(50) NULL,
  UNIQUE KEY uq_drawer_day (drawer_code, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_vault (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_code VARCHAR(16) NOT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_vault (branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_cash_txns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  txn_ref VARCHAR(40) NOT NULL,
  txn_type VARCHAR(40) NOT NULL,
  drawer_id BIGINT UNSIGNED NULL,
  branch_code VARCHAR(16) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  denom_json JSON NULL,
  account_id BIGINT UNSIGNED NULL,
  journal_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  actor VARCHAR(50) NULL,
  business_date DATE NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_ref (txn_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Clearing
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_clearing_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_ref VARCHAR(40) NOT NULL,
  direction ENUM('OUTWARD','INWARD') NOT NULL,
  business_date DATE NOT NULL,
  branch_code VARCHAR(16) NULL,
  status ENUM('open','submitted','settled','cancelled') NOT NULL DEFAULT 'open',
  item_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  settled_count INT UNSIGNED NOT NULL DEFAULT 0,
  bounced_count INT UNSIGNED NOT NULL DEFAULT 0,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  settled_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_batch (batch_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_clearing_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  item_ref VARCHAR(40) NOT NULL,
  direction ENUM('OUTWARD','INWARD') NOT NULL,
  cheque_no VARCHAR(40) NOT NULL,
  cheque_leaf_id INT UNSIGNED NULL,
  account_id BIGINT UNSIGNED NULL,
  amount DECIMAL(18,2) NOT NULL,
  payee_name VARCHAR(160) NULL,
  drawer_name VARCHAR(160) NULL,
  bank_name VARCHAR(120) NULL,
  status ENUM('pending','presented','cleared','bounced','cancelled') NOT NULL DEFAULT 'pending',
  bounce_reason VARCHAR(255) NULL,
  journal_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item (item_ref),
  KEY idx_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Reconciliation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_recon_statements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  statement_ref VARCHAR(40) NOT NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'GL',
  source_name VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  statement_date DATE NOT NULL,
  opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('open','matching','matched','closed') NOT NULL DEFAULT 'open',
  notes VARCHAR(500) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stmt (statement_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_recon_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  statement_id BIGINT UNSIGNED NOT NULL,
  line_ref VARCHAR(40) NOT NULL,
  value_date DATE NULL,
  amount DECIMAL(18,2) NOT NULL,
  dr_cr ENUM('DR','CR') NOT NULL,
  external_ref VARCHAR(80) NULL,
  narrative VARCHAR(255) NULL,
  match_status ENUM('unmatched','matched','excluded','disputed') NOT NULL DEFAULT 'unmatched',
  matched_journal_id BIGINT UNSIGNED NULL,
  matched_at DATETIME NULL,
  matched_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_line (line_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_recon_matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  statement_id BIGINT UNSIGNED NOT NULL,
  line_id BIGINT UNSIGNED NOT NULL,
  journal_id BIGINT UNSIGNED NOT NULL,
  match_type ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'MANUAL',
  amount DECIMAL(18,2) NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- EOD
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eod_calendar (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  business_date DATE NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  opened_at DATETIME NULL,
  closed_at DATETIME NULL,
  closed_by VARCHAR(50) NULL,
  UNIQUE KEY uq_bdate (business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eod_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  business_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  run_by VARCHAR(50) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- RBAC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cbs_roles (
  role_code VARCHAR(40) NOT NULL PRIMARY KEY,
  role_name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_permissions (
  perm_code VARCHAR(60) NOT NULL PRIMARY KEY,
  module VARCHAR(40) NOT NULL,
  description VARCHAR(160) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_role_permissions (
  role_code VARCHAR(40) NOT NULL,
  perm_code VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_code, perm_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Cheque books (instruments)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cheque_books (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NULL,
  por_orgacode VARCHAR(10) NULL,
  vac_code VARCHAR(10) NULL,
  book_no VARCHAR(40) NOT NULL,
  member_ref VARCHAR(64) NULL,
  account_no VARCHAR(64) NULL,
  member_name VARCHAR(150) NULL,
  bank_name VARCHAR(100) NULL DEFAULT 'Society',
  bank_branch VARCHAR(100) NULL,
  branch_code VARCHAR(20) NULL,
  leaf_start INT UNSIGNED NOT NULL,
  leaf_end INT UNSIGNED NOT NULL,
  total_leaves INT UNSIGNED NOT NULL,
  issue_date DATE NOT NULL,
  status ENUM('active','exhausted','cancelled','returned') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_member (member_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cheque_leaves (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  book_id INT UNSIGNED NOT NULL,
  por_orgacode VARCHAR(10) NULL,
  cheque_no VARCHAR(40) NOT NULL,
  leaf_seq INT UNSIGNED NOT NULL,
  status ENUM('available','issued','used','cleared','stopped','bounced','cancelled') NOT NULL DEFAULT 'available',
  payee_name VARCHAR(150) NULL,
  amount DECIMAL(18,2) NULL,
  issue_date DATE NULL,
  clear_date DATE NULL,
  stop_date DATE NULL,
  stop_reason VARCHAR(255) NULL,
  narration VARCHAR(500) NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_book (book_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cheque_book_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NULL,
  vac_code VARCHAR(10) NULL,
  request_no VARCHAR(40) NOT NULL,
  member_ref VARCHAR(64) NOT NULL,
  member_name VARCHAR(150) NULL,
  account_no VARCHAR(64) NULL,
  bank_branch VARCHAR(100) NULL,
  branch_code VARCHAR(20) NULL,
  leaves_requested INT UNSIGNED NULL DEFAULT 25,
  status ENUM('pending','approved','issued','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Legacy-ish / optional modules (minimal stubs for routes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_no VARCHAR(40) NULL,
  full_name VARCHAR(150) NULL,
  status VARCHAR(20) NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_no VARCHAR(40) NULL,
  member_id INT UNSIGNED NULL,
  principal DECIMAL(18,2) NULL,
  status VARCHAR(20) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loan_products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(40) NULL,
  product_name VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loan_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id INT UNSIGNED NULL,
  installment_no INT NULL,
  due_date DATE NULL,
  amount DECIMAL(18,2) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loan_repayments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id INT UNSIGNED NULL,
  amount DECIMAL(18,2) NULL,
  paid_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collaterals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id INT UNSIGNED NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guarantees (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id INT UNSIGNED NULL,
  guarantor_name VARCHAR(150) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS instruments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  instrument_type VARCHAR(40) NULL,
  reference VARCHAR(80) NULL,
  status VARCHAR(20) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership_cards (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_ref VARCHAR(64) NULL,
  card_no VARCHAR(40) NULL,
  status VARCHAR(20) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compliance_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_type VARCHAR(40) NULL,
  status VARCHAR(20) NULL,
  notes TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  doc_type VARCHAR(40) NULL,
  file_path VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS savings_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_no VARCHAR(40) NULL,
  balance DECIMAL(18,2) NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS savings_txns (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id INT UNSIGNED NULL,
  amount DECIMAL(18,2) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS share_folios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_ref VARCHAR(64) NULL,
  shares INT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS share_transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  folio_id INT UNSIGNED NULL,
  qty INT NULL,
  amount DECIMAL(18,2) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfb_config (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(80) NOT NULL,
  config_value VARCHAR(255) NULL,
  UNIQUE KEY uq_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfb_loan_portfolio (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_ref VARCHAR(40) NULL,
  outstanding DECIMAL(18,2) NULL,
  dpd INT NULL DEFAULT 0,
  classification VARCHAR(40) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfb_exposure_limits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  limit_type VARCHAR(40) NULL,
  limit_amount DECIMAL(18,2) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS regulatory_rule_register (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(40) NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_integrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  system_name VARCHAR(80) NULL,
  status VARCHAR(20) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_sbp_controls (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  control_code VARCHAR(40) NULL,
  enabled TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Seed data
-- =============================================================================
INSERT IGNORE INTO organisations (id, org_code, org_name) VALUES (1, '001', 'DigiFyntek Demo Society');

INSERT IGNORE INTO cbs_branches (branch_code, branch_name, city) VALUES
('001', 'Head Office', 'Lahore');

INSERT IGNORE INTO cbs_coa (gl_code, gl_name, gl_type) VALUES
('1000', 'Cash in Hand', 'ASSET'),
('1100', 'Loans Outstanding', 'ASSET'),
('1200', 'Term Deposit Placement Asset', 'ASSET'),
('2000', 'Customer Deposits', 'LIABILITY'),
('2100', 'Clearing Suspense', 'LIABILITY'),
('2200', 'Term Deposit Liability', 'LIABILITY'),
('3000', 'Share Capital', 'EQUITY'),
('4000', 'Interest Income', 'INCOME'),
('5000', 'Interest Expense', 'EXPENSE'),
('5100', 'Operating Expense', 'EXPENSE');

INSERT IGNORE INTO cbs_products (product_code, product_name, product_type, product_family, gl_code, gl_liability, gl_asset, active) VALUES
('SAV-PKR', 'Savings Account PKR', 'savings', 'CASA', '2000', '2000', NULL, 1),
('CUR-PKR', 'Current Account PKR', 'current', 'CASA', '2000', '2000', NULL, 1),
('LON-AGRI', 'Agriculture Loan', 'loan', 'LOAN', '1100', NULL, '1100', 1),
('TD-PKR', 'Term Deposit PKR', 'term', 'TD', '2200', '2200', NULL, 1),
('MUR-GOODS', 'Murabaha Goods', 'islamic', 'ISLAMIC_FINANCE', '1100', NULL, '1100', 1);

INSERT IGNORE INTO cbs_vault (branch_code, balance) VALUES ('001', 500000.00);
INSERT IGNORE INTO cbs_tellers (teller_code, user_id, branch_code, full_name)
VALUES ('T001', 'superadmin', '001', 'Default Teller');

INSERT IGNORE INTO eod_calendar (business_date, status, opened_at)
VALUES (CURDATE(), 'open', NOW());

INSERT IGNORE INTO cbs_roles (role_code, role_name, description) VALUES
('superadmin', 'Super Admin', 'Full system access'),
('admin', 'Administrator', 'Institution admin'),
('ops_manager', 'Operations Manager', 'Approve + ops oversight'),
('teller', 'Teller', 'Cash drawer and CASA cash'),
('credit_officer', 'Credit Officer', 'Financing and CIF'),
('compliance', 'Compliance', 'KYC and screening'),
('accountant', 'Accountant', 'Ledger and EOD'),
('viewer', 'Viewer', 'Read-only');

INSERT IGNORE INTO cbs_permissions (perm_code, module, description) VALUES
('cif.read', 'CIF', 'View customers'),
('cif.write', 'CIF', 'Create/update customers'),
('kyc.read', 'KYC', 'View KYC cases'),
('kyc.write', 'KYC', 'Manage KYC cases'),
('kyc.decide', 'KYC', 'Approve/reject KYC'),
('accounts.read', 'Accounts', 'View accounts'),
('accounts.write', 'Accounts', 'Open accounts'),
('casa.post', 'CASA', 'Deposit/withdraw'),
('transfer.post', 'Transfers', 'Internal transfer'),
('ledger.read', 'Ledger', 'View journals / TB'),
('ledger.post', 'Ledger', 'Post journals'),
('ledger.reverse', 'Ledger', 'Reverse journals'),
('loan.read', 'Lending', 'View financing'),
('loan.disburse', 'Lending', 'Disburse loans'),
('loan.repay', 'Lending', 'Post repayments'),
('td.read', 'TD', 'View term deposits'),
('td.write', 'TD', 'Place/settle TD'),
('approval.read', 'Approvals', 'View queue'),
('approval.decide', 'Approvals', 'Approve/reject'),
('payments.read', 'Payments', 'View payments'),
('payments.post', 'Payments', 'Initiate payments'),
('teller.ops', 'Teller', 'Drawer and vault'),
('clearing.ops', 'Clearing', 'Cheque clearing'),
('recon.ops', 'Recon', 'Reconciliation'),
('eod.run', 'EOD', 'Run end of day'),
('admin.rbac', 'Admin', 'Manage roles'),
('instruments.ops', 'Instruments', 'Cheque books');

INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code)
SELECT 'admin', perm_code FROM cbs_permissions;

INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('ops_manager', 'cif.read'),
('ops_manager', 'accounts.read'),
('ops_manager', 'ledger.read'),
('ops_manager', 'loan.read'),
('ops_manager', 'approval.read'),
('ops_manager', 'approval.decide'),
('ops_manager', 'eod.run'),
('ops_manager', 'teller.ops'),
('ops_manager', 'clearing.ops'),
('ops_manager', 'recon.ops'),
('teller', 'cif.read'),
('teller', 'accounts.read'),
('teller', 'casa.post'),
('teller', 'teller.ops'),
('teller', 'instruments.ops'),
('credit_officer', 'cif.read'),
('credit_officer', 'cif.write'),
('credit_officer', 'kyc.read'),
('credit_officer', 'accounts.read'),
('credit_officer', 'loan.read'),
('credit_officer', 'loan.disburse'),
('credit_officer', 'loan.repay'),
('credit_officer', 'td.read'),
('credit_officer', 'td.write'),
('compliance', 'cif.read'),
('compliance', 'kyc.read'),
('compliance', 'kyc.write'),
('compliance', 'kyc.decide'),
('accountant', 'ledger.read'),
('accountant', 'ledger.post'),
('accountant', 'ledger.reverse'),
('accountant', 'accounts.read'),
('accountant', 'eod.run'),
('accountant', 'recon.ops'),
('accountant', 'clearing.ops'),
('viewer', 'cif.read'),
('viewer', 'accounts.read'),
('viewer', 'ledger.read'),
('viewer', 'loan.read'),
('viewer', 'td.read'),
('viewer', 'payments.read'),
('viewer', 'approval.read');

-- Default admin: password = 12345678 (bcrypt)
-- Hash generated for 12345678 — change after first login in production
INSERT INTO users (org_id, user_id, password_hash, full_name, role, is_active)
VALUES (
  1,
  'superadmin',
  '$2b$10$PVX5GwbzKts2aYjTlX1hguR8UTSAj3yTCFiKi3LVF0YjNzHU.1tlG',
  'Super Admin',
  'superadmin',
  1
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  role = 'superadmin',
  is_active = 1;

-- Done
SELECT 'DigiFyntek install-schema applied' AS message;
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'digifyntek';
