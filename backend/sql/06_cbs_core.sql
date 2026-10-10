-- DigiFyntek CBS (Temenos-style basic) — SBP-oriented cooperative core
USE digifyntek;

-- Customer Information File (CIF)
CREATE TABLE IF NOT EXISTS cbs_customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  cif_no VARCHAR(32) NOT NULL,
  member_ref VARCHAR(64) NULL,
  full_name VARCHAR(150) NOT NULL,
  father_name VARCHAR(150) NULL,
  cnic VARCHAR(20) NULL,
  cnic_expiry DATE NULL,
  dob DATE NULL,
  gender VARCHAR(10) NULL,
  mobile VARCHAR(20) NULL,
  email VARCHAR(100) NULL,
  address TEXT NULL,
  branch_code VARCHAR(20) NULL,
  kyc_status ENUM('pending','verified','rejected','expired') NOT NULL DEFAULT 'pending',
  aml_risk ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  pep_flag TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','inactive','blocked','closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cif (por_orgacode, cif_no),
  KEY idx_cnic (cnic),
  KEY idx_member (member_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Account master (CASA / loan / share wrapper)
CREATE TABLE IF NOT EXISTS cbs_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  account_no VARCHAR(40) NOT NULL,
  cif_no VARCHAR(32) NOT NULL,
  product_code VARCHAR(40) NOT NULL,
  account_type ENUM('savings','current','loan','share','term','islamic') NOT NULL,
  branch_code VARCHAR(20) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('active','dormant','blocked','closed') NOT NULL DEFAULT 'active',
  open_date DATE NOT NULL,
  close_date DATE NULL,
  legacy_ref VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_acc (por_orgacode, account_no),
  KEY idx_cif (cif_no),
  KEY idx_product (product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product catalog
CREATE TABLE IF NOT EXISTS cbs_products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  product_code VARCHAR(40) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  product_type ENUM('savings','current','loan','share','term','islamic') NOT NULL,
  islamic_mode VARCHAR(40) NULL,
  interest_rate DECIMAL(8,4) NULL,
  min_balance DECIMAL(18,2) NULL DEFAULT 0,
  gl_code VARCHAR(20) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_prod (por_orgacode, product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CBS transactions (channel-aware)
CREATE TABLE IF NOT EXISTS cbs_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  txn_id VARCHAR(40) NOT NULL,
  txn_date DATE NOT NULL,
  value_date DATE NOT NULL,
  branch_code VARCHAR(20) NULL,
  channel ENUM('branch','mobile','api','batch','atm','agent') NOT NULL DEFAULT 'branch',
  txn_type VARCHAR(40) NOT NULL,
  debit_account VARCHAR(40) NULL,
  credit_account VARCHAR(40) NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  narration VARCHAR(500) NULL,
  status ENUM('pending','posted','reversed','failed') NOT NULL DEFAULT 'pending',
  external_ref VARCHAR(100) NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_txn (por_orgacode, txn_id),
  KEY idx_date (txn_date),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Integration endpoints / partners
CREATE TABLE IF NOT EXISTS cbs_integrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category ENUM('payment','nadra','sbp','sms','email','switch','core','other') NOT NULL,
  base_url VARCHAR(500) NULL,
  auth_type ENUM('none','api_key','oauth2','mtls') NOT NULL DEFAULT 'api_key',
  status ENUM('active','inactive','sandbox') NOT NULL DEFAULT 'sandbox',
  config_json JSON NULL,
  last_health_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_int (por_orgacode, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- SBP regulatory controls / returns checklist
CREATE TABLE IF NOT EXISTS cbs_sbp_controls (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  control_code VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category ENUM('kyc_aml','prudential','reporting','islamic','payments','consumer','ops') NOT NULL,
  description TEXT NULL,
  mandatory TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('not_started','in_progress','compliant','gap') NOT NULL DEFAULT 'not_started',
  evidence_note VARCHAR(500) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ctrl (control_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO cbs_sbp_controls (control_code, title, category, description, status) VALUES
('KYC-01','CNIC verification & customer due diligence','kyc_aml','Identify and verify customers; maintain KYC records', 'in_progress'),
('AML-01','AML risk rating & monitoring','kyc_aml','Risk-based AML; unusual transaction monitoring', 'in_progress'),
('PEP-01','PEP screening','kyc_aml','Politically exposed persons flag and enhanced diligence', 'not_started'),
('PR-01','Exposure / concentration limits','prudential','Single party and related party exposure limits', 'in_progress'),
('PR-02','NPL / classification & provisioning','prudential','Asset classification and provisioning rules', 'in_progress'),
('REP-01','Regulatory returns readiness','reporting','Periodic returns data extracts for supervisor', 'not_started'),
('ISL-01','Islamic product Shariah controls','islamic','Ownership, disclosure, and mode-specific rules', 'in_progress'),
('PAY-01','Payment system participant controls','payments','Settlement, reconciliation, exception handling', 'not_started'),
('CON-01','Consumer protection & complaints','consumer','Transparent pricing, complaint log', 'not_started'),
('OPS-01','IT security & access control','ops','Access management, audit logs, change control', 'in_progress');

INSERT IGNORE INTO cbs_products (por_orgacode, product_code, product_name, product_type, interest_rate, min_balance) VALUES
('001','SAV-BASIC','Basic Savings','savings',0,0),
('001','CUR-BASIC','Current Account','current',0,0),
('001','LN-AGR','Agriculture Loan','loan',12.0000,0),
('001','SH-CAP','Share Capital','share',0,0),
('001','IS-MUR','Murabaha Facility','islamic',NULL,0);

INSERT IGNORE INTO cbs_integrations (por_orgacode, code, name, category, status) VALUES
('001','NADRA','NADRA Verification','nadra','sandbox'),
('001','SBP-R','SBP Reporting Gateway','sbp','sandbox'),
('001','RAAST','Raast Instant Payments','payment','sandbox'),
('001','1LINK','1Link / ATM Switch','switch','sandbox'),
('001','SMS-GW','SMS Gateway','sms','sandbox');
