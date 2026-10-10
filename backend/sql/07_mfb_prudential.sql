-- DigiFyntek MFB-oriented prudential engine (SBP PR-aligned toolkit)
USE digifyntek;

CREATE TABLE IF NOT EXISTS mfb_config (
  por_orgacode VARCHAR(10) NOT NULL PRIMARY KEY,
  license_type ENUM('national','provincial','district','region') NOT NULL DEFAULT 'provincial',
  paid_up_capital DECIMAL(18,2) NOT NULL DEFAULT 0,
  accumulated_losses DECIMAL(18,2) NOT NULL DEFAULT 0,
  eligible_capital DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_rwa DECIMAL(18,2) NOT NULL DEFAULT 0,
  car_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
  general_provision_rate DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  car_minimum_pct DECIMAL(8,4) NOT NULL DEFAULT 15.0000,
  mcr_target DECIMAL(18,2) NOT NULL DEFAULT 2000000000,
  reserve_fund DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfb_loan_portfolio (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  account_no VARCHAR(40) NOT NULL,
  cif_no VARCHAR(32) NULL,
  borrower_name VARCHAR(150) NULL,
  product_category ENUM('general','housing','microenterprise','agri','other') NOT NULL DEFAULT 'general',
  branch_code VARCHAR(20) NULL,
  disbursed_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  outstanding_principal DECIMAL(18,2) NOT NULL DEFAULT 0,
  outstanding_markup DECIMAL(18,2) NOT NULL DEFAULT 0,
  days_past_due INT NOT NULL DEFAULT 0,
  classification ENUM('performing','oaem','substandard','doubtful','loss') NOT NULL DEFAULT 'performing',
  specific_provision DECIMAL(18,2) NOT NULL DEFAULT 0,
  security_type ENUM('none','cash','gold','mortgage','other') NOT NULL DEFAULT 'none',
  security_value DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('active','charged_off','closed') NOT NULL DEFAULT 'active',
  as_of_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_loan (por_orgacode, account_no),
  KEY idx_class (classification),
  KEY idx_dpd (days_past_due)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfb_exposure_limits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL DEFAULT '001',
  limit_code VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  limit_pct DECIMAL(8,4) NULL,
  limit_amount DECIMAL(18,2) NULL,
  current_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('ok','breach','watch') NOT NULL DEFAULT 'ok',
  UNIQUE KEY uk_lim (por_orgacode, limit_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO mfb_config (por_orgacode, license_type, paid_up_capital, general_provision_rate, car_minimum_pct, mcr_target)
VALUES ('001', 'provincial', 500000000, 1.0000, 15.0000, 2000000000);

INSERT IGNORE INTO mfb_exposure_limits (por_orgacode, limit_code, title, limit_pct, current_amount, status) VALUES
('001', 'SINGLE_BORROWER', 'Single borrower exposure', 10.0000, 0, 'ok'),
('001', 'GOLD_PORTFOLIO', 'Gold-backed portfolio share of GLP', 35.0000, 0, 'ok'),
('001', 'CONTINGENT', 'Contingent liabilities vs equity', NULL, 0, 'ok');
