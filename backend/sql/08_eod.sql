-- End of Day calendar and run log
USE digifyntek;

CREATE TABLE IF NOT EXISTS eod_calendar (
  por_orgacode VARCHAR(10) NOT NULL PRIMARY KEY,
  business_date DATE NOT NULL,
  status ENUM('open','closing','closed') NOT NULL DEFAULT 'open',
  last_eod_at DATETIME NULL,
  last_eod_by VARCHAR(50) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eod_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode VARCHAR(10) NOT NULL,
  business_date DATE NOT NULL,
  run_at DATETIME NOT NULL,
  run_by VARCHAR(50) NULL,
  status ENUM('success','partial','failed') NOT NULL DEFAULT 'success',
  steps_json JSON NULL,
  notes VARCHAR(500) NULL,
  next_business_date DATE NULL,
  KEY idx_org_date (por_orgacode, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO eod_calendar (por_orgacode, business_date, status)
VALUES ('001', CURDATE(), 'open');
