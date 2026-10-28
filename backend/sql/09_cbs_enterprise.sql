-- DigiFyntek CBS Enterprise foundation (Phase 1–2)
-- Pakistan · PKR · double-entry ledger
USE digifyntek;

-- Branches
CREATE TABLE IF NOT EXISTS cbs_branches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_code VARCHAR(16) NOT NULL,
  branch_name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch (branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customers (CIF)
CREATE TABLE IF NOT EXISTS cbs_customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_no VARCHAR(24) NOT NULL,
  customer_type ENUM('individual','corporate') NOT NULL DEFAULT 'individual',
  full_name VARCHAR(160) NOT NULL,
  father_or_husband VARCHAR(160) NULL,
  gender CHAR(1) NULL,
  dob DATE NULL,
  cnic VARCHAR(20) NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(120) NULL,
  address TEXT NULL,
  city VARCHAR(80) NULL,
  risk_rating ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  status ENUM('prospect','pending','active','restricted','dormant','deceased','closed') NOT NULL DEFAULT 'active',
  kyc_status ENUM('pending','verified','rejected','unavailable','manual_review') NOT NULL DEFAULT 'pending',
  branch_code VARCHAR(16) NULL,
  source_of_funds VARCHAR(120) NULL,
  occupation VARCHAR(120) NULL,
  is_pep TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cust_no (customer_no),
  KEY idx_cnic (cnic),
  KEY idx_phone (phone),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_customer_identifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  id_type VARCHAR(30) NOT NULL,
  id_number VARCHAR(40) NOT NULL,
  issued_country VARCHAR(2) DEFAULT 'PK',
  expiry_date DATE NULL,
  UNIQUE KEY uq_id (id_type, id_number),
  KEY idx_cust (customer_id),
  CONSTRAINT fk_cid_cust FOREIGN KEY (customer_id) REFERENCES cbs_customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Products
CREATE TABLE IF NOT EXISTS cbs_products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(24) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  product_family ENUM('CASA','TERM_DEPOSIT','LOAN','ISLAMIC_FINANCE','OTHER') NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  is_islamic TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  gl_liability VARCHAR(20) NULL,
  gl_asset VARCHAR(20) NULL,
  gl_income VARCHAR(20) NULL,
  gl_expense VARCHAR(20) NULL,
  UNIQUE KEY uq_prod (product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Accounts
CREATE TABLE IF NOT EXISTS cbs_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_no VARCHAR(34) NOT NULL,
  iban VARCHAR(34) NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(24) NOT NULL,
  branch_code VARCHAR(16) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  status ENUM('pending','active','restricted','dormant','closed') NOT NULL DEFAULT 'active',
  ledger_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  available_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  blocked_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  opened_at DATE NULL,
  closed_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acct (account_no),
  KEY idx_cust (customer_id),
  KEY idx_branch (branch_code),
  CONSTRAINT fk_acct_cust FOREIGN KEY (customer_id) REFERENCES cbs_customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Chart of accounts
CREATE TABLE IF NOT EXISTS cbs_coa (
  gl_code VARCHAR(20) NOT NULL PRIMARY KEY,
  gl_name VARCHAR(160) NOT NULL,
  gl_type ENUM('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE') NOT NULL,
  parent_code VARCHAR(20) NULL,
  is_postable TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Journal headers (immutable once POSTED — reverse only)
CREATE TABLE IF NOT EXISTS cbs_journal_headers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  journal_ref VARCHAR(40) NOT NULL,
  business_date DATE NOT NULL,
  value_date DATE NOT NULL,
  branch_code VARCHAR(16) NULL,
  source_module VARCHAR(40) NOT NULL,
  source_ref VARCHAR(60) NULL,
  narrative VARCHAR(255) NULL,
  status ENUM('PENDING','POSTED','REVERSED') NOT NULL DEFAULT 'PENDING',
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  total_debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  idempotency_key VARCHAR(64) NULL,
  reversed_by_journal_id BIGINT UNSIGNED NULL,
  reverses_journal_id BIGINT UNSIGNED NULL,
  posted_by VARCHAR(50) NULL,
  posted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jref (journal_ref),
  UNIQUE KEY uq_idem (idempotency_key),
  KEY idx_bdate (business_date),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_journal_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  journal_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  gl_code VARCHAR(20) NOT NULL,
  account_id BIGINT UNSIGNED NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  narrative VARCHAR(255) NULL,
  KEY idx_j (journal_id),
  CONSTRAINT fk_jl_h FOREIGN KEY (journal_id) REFERENCES cbs_journal_headers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Internal transfers
CREATE TABLE IF NOT EXISTS cbs_transfers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transfer_ref VARCHAR(40) NOT NULL,
  from_account_id BIGINT UNSIGNED NOT NULL,
  to_account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  business_date DATE NOT NULL,
  status ENUM('PENDING','POSTED','FAILED','REVERSED') NOT NULL DEFAULT 'PENDING',
  journal_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(64) NULL,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tref (transfer_ref),
  UNIQUE KEY uq_tidem (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit
CREATE TABLE IF NOT EXISTS cbs_audit_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor VARCHAR(50) NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(60) NULL,
  branch_code VARCHAR(16) NULL,
  detail_json JSON NULL,
  ip VARCHAR(45) NULL,
  KEY idx_entity (entity_type, entity_id),
  KEY idx_at (event_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Regulatory rule register (SBP-oriented tracking)
CREATE TABLE IF NOT EXISTS regulatory_rule_register (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(160) NOT NULL,
  official_source_url VARCHAR(500) NULL,
  circular_ref VARCHAR(120) NULL,
  published_date DATE NULL,
  effective_date DATE NULL,
  affected_module VARCHAR(60) NOT NULL,
  business_rule TEXT NULL,
  implementation_status ENUM('not_started','in_progress','implemented','verified','waived') NOT NULL DEFAULT 'not_started',
  compliance_owner VARCHAR(80) NULL,
  last_verification_date DATE NULL,
  notes TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed minimal COA + branch + products
INSERT IGNORE INTO cbs_branches (branch_code, branch_name, city) VALUES
('001', 'Head Office', 'Islamabad'),
('002', 'Main Branch', 'Lahore');

INSERT IGNORE INTO cbs_coa (gl_code, gl_name, gl_type) VALUES
('1000', 'Cash and balances', 'ASSET'),
('1100', 'Customer loans / financing', 'ASSET'),
('2000', 'Customer deposits', 'LIABILITY'),
('2100', 'Suspense credit', 'LIABILITY'),
('3000', 'Share capital / equity', 'EQUITY'),
('4000', 'Interest / profit income', 'INCOME'),
('5000', 'Interest / profit expense', 'EXPENSE'),
('5100', 'Operating expense', 'EXPENSE');

INSERT IGNORE INTO cbs_products (product_code, product_name, product_family, is_islamic, gl_liability, gl_asset) VALUES
('SAV-PKR', 'Savings Account PKR', 'CASA', 0, '2000', NULL),
('CUR-PKR', 'Current Account PKR', 'CASA', 0, '2000', NULL),
('LON-AGRI', 'Agriculture Loan', 'LOAN', 0, NULL, '1100'),
('MUR-GOODS', 'Murabaha Goods', 'ISLAMIC_FINANCE', 1, NULL, '1100');

INSERT IGNORE INTO regulatory_rule_register
  (rule_name, official_source_url, circular_ref, affected_module, business_rule, implementation_status, compliance_owner)
VALUES
('Double-entry posting integrity', 'https://www.sbp.org.pk', 'Internal control principle', 'ledger',
 'Every posted journal must balance; no silent delete of posted entries', 'implemented', 'Finance'),
('KYC / CDD onboarding', 'https://www.sbp.org.pk', 'AML/CFT framework (verify current)', 'cif',
 'Customer identification and risk rating before account activation', 'in_progress', 'Compliance'),
('Business day close controls', 'https://www.sbp.org.pk', 'Operational circulars (verify)', 'eod',
 'Business date advance only after mandatory checks or authorized exception', 'in_progress', 'Operations'),
('MFB asset classification (if applicable)', 'https://www.sbp.org.pk', 'MFB PRs (verify current)', 'credit',
 'DPD-based classification and provisioning per applicable PR', 'in_progress', 'Credit Risk');

-- Financing contracts (Phase 3 start — disbursement vertical)
CREATE TABLE IF NOT EXISTS cbs_financing_contracts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(24) NOT NULL,
  branch_code VARCHAR(16) NULL,
  principal DECIMAL(18,2) NOT NULL,
  outstanding DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  is_islamic TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending','active','closed','written_off') NOT NULL DEFAULT 'pending',
  disbursed_at DATE NULL,
  maturity_date DATE NULL,
  disbursement_journal_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract (contract_no),
  KEY idx_cust (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_financing_repayments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_repay_ref (repayment_ref),
  KEY idx_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_repayment_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NOT NULL,
  installment_no INT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  principal_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  charge_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  principal_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  charge_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  UNIQUE KEY uq_inst (contract_id, installment_no),
  KEY idx_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Maker-checker approval queue
CREATE TABLE IF NOT EXISTS cbs_approval_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_areq (request_ref),
  KEY idx_status (status),
  KEY idx_type (request_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payments hub (adapters + simulators)
CREATE TABLE IF NOT EXISTS cbs_payment_instructions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_ref VARCHAR(40) NOT NULL,
  channel ENUM('INTERNAL','RAAST','PRISM','ONELINK','OTHER') NOT NULL DEFAULT 'RAAST',
  direction ENUM('OUT','IN') NOT NULL DEFAULT 'OUT',
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  debtor_account_id BIGINT UNSIGNED NULL,
  debtor_iban VARCHAR(34) NULL,
  creditor_iban VARCHAR(34) NULL,
  creditor_name VARCHAR(160) NULL,
  raast_id VARCHAR(80) NULL,
  narrative VARCHAR(255) NULL,
  -- external vs internal status kept separate
  external_status ENUM('SIMULATED','QUEUED','ACCEPTED','REJECTED','SETTLED','FAILED','UNKNOWN') NOT NULL DEFAULT 'SIMULATED',
  posting_status ENUM('NONE','PENDING','POSTED','REVERSED','FAILED') NOT NULL DEFAULT 'NONE',
  settlement_status ENUM('NONE','PENDING','SETTLED','FAILED') NOT NULL DEFAULT 'NONE',
  journal_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(64) NULL,
  simulator TINYINT(1) NOT NULL DEFAULT 1,
  request_json JSON NULL,
  response_json JSON NULL,
  created_by VARCHAR(50) NULL,
  business_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payref (payment_ref),
  UNIQUE KEY uq_pay_idem (idempotency_key),
  KEY idx_ext (external_status),
  KEY idx_ch (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_payment_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  attempt_no INT UNSIGNED NOT NULL DEFAULT 1,
  outcome VARCHAR(40) NOT NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pay (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- KYC cases & screening (compliance)
CREATE TABLE IF NOT EXISTS cbs_kyc_cases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_ref VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  case_type ENUM('ONBOARDING','PERIODIC_REVIEW','EDD','REMEDIATION') NOT NULL DEFAULT 'ONBOARDING',
  status ENUM('open','pending_docs','in_review','approved','rejected','closed') NOT NULL DEFAULT 'open',
  risk_rating ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  kyc_outcome ENUM('pending','verified','rejected','unavailable','manual_review') NOT NULL DEFAULT 'pending',
  source_of_funds VARCHAR(160) NULL,
  source_of_wealth VARCHAR(160) NULL,
  purpose_of_account VARCHAR(160) NULL,
  assigned_to VARCHAR(50) NULL,
  decision_note TEXT NULL,
  decided_by VARCHAR(50) NULL,
  decided_at DATETIME NULL,
  next_review_date DATE NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kyc_ref (case_ref),
  KEY idx_cust (customer_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_kyc_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(40) NOT NULL,
  doc_ref VARCHAR(80) NULL,
  file_name VARCHAR(160) NULL,
  verification_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  notes VARCHAR(255) NULL,
  uploaded_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_screening_cases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screen_ref VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  kyc_case_id BIGINT UNSIGNED NULL,
  screen_type ENUM('SANCTIONS','PEP','ADVERSE_MEDIA','OTHER') NOT NULL DEFAULT 'SANCTIONS',
  provider VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
  status ENUM('pending','clear','match','unavailable','manual_review') NOT NULL DEFAULT 'pending',
  match_score DECIMAL(5,2) NULL,
  result_summary VARCHAR(500) NULL,
  evidence_note TEXT NULL,
  screened_by VARCHAR(50) NULL,
  screened_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_screen (screen_ref),
  KEY idx_cust (customer_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_kyc_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor VARCHAR(50) NULL,
  action VARCHAR(60) NOT NULL,
  detail_json JSON NULL,
  KEY idx_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Term deposits
CREATE TABLE IF NOT EXISTS cbs_term_deposits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_td (td_ref),
  KEY idx_cust (customer_id),
  KEY idx_mat (maturity_date),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_td_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  td_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('PLACE','ACCRUE','PAYOUT','PREMATURE','MATURE','CANCEL') NOT NULL,
  amount DECIMAL(18,2) NULL,
  journal_id BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  actor VARCHAR(50) NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_td (td_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO cbs_products (product_code, product_name, product_family, is_islamic, gl_liability, gl_expense)
VALUES
('TD-PKR', 'Term Deposit PKR', 'TERM_DEPOSIT', 0, '2000', '5000'),
('TD-ISL', 'Islamic Term Investment', 'TERM_DEPOSIT', 1, '2000', '5000');

-- Teller / cash drawer / vault
CREATE TABLE IF NOT EXISTS cbs_tellers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teller_code VARCHAR(20) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  branch_code VARCHAR(16) NOT NULL DEFAULT '001',
  full_name VARCHAR(120) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teller (teller_code),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_cash_drawers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  UNIQUE KEY uq_drawer_day (drawer_code, business_date),
  KEY idx_teller (teller_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_vault (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_code VARCHAR(16) NOT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_vault (branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_cash_txns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  txn_ref VARCHAR(40) NOT NULL,
  txn_type ENUM('OPEN','CLOSE','CASH_IN','CASH_OUT','VAULT_TO_TELLER','TELLER_TO_VAULT','CUSTOMER_DEP','CUSTOMER_WDR','VARIANCE') NOT NULL,
  drawer_id BIGINT UNSIGNED NULL,
  branch_code VARCHAR(16) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  denom_json JSON NULL,
  account_id BIGINT UNSIGNED NULL,
  journal_id BIGINT UNSIGNED NULL,
  narrative VARCHAR(255) NULL,
  actor VARCHAR(50) NULL,
  business_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_ref (txn_ref),
  KEY idx_drawer (drawer_id),
  KEY idx_type (txn_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO cbs_vault (branch_code, balance) VALUES ('001', 500000.00);
INSERT IGNORE INTO cbs_tellers (teller_code, user_id, branch_code, full_name)
VALUES ('T001', 'superadmin', '001', 'Default Teller');

-- Cheque clearing cycle (inward / outward)
CREATE TABLE IF NOT EXISTS cbs_clearing_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_batch (batch_ref),
  KEY idx_dir_date (direction, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_clearing_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item (item_ref),
  KEY idx_batch (batch_id),
  KEY idx_cheque (cheque_no),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reconciliation engine (skeleton)
CREATE TABLE IF NOT EXISTS cbs_recon_statements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  statement_ref VARCHAR(40) NOT NULL,
  source_type ENUM('NOSTRO','CLEARING','GL','VAULT','EXTERNAL_FILE','OTHER') NOT NULL DEFAULT 'GL',
  source_name VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  statement_date DATE NOT NULL,
  opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('open','matching','matched','closed') NOT NULL DEFAULT 'open',
  notes VARCHAR(500) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stmt (statement_ref),
  KEY idx_src_date (source_type, statement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_recon_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_line (line_ref),
  KEY idx_stmt (statement_id),
  KEY idx_match (match_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cbs_recon_matches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  statement_id BIGINT UNSIGNED NOT NULL,
  line_id BIGINT UNSIGNED NOT NULL,
  journal_id BIGINT UNSIGNED NOT NULL,
  match_type ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'MANUAL',
  amount DECIMAL(18,2) NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stmt (statement_id),
  KEY idx_line (line_id),
  KEY idx_jnl (journal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
