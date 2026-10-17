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
