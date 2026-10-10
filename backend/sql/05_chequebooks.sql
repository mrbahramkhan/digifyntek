-- DigiFyntek chequebook / instrument management
USE digifyntek;

CREATE TABLE IF NOT EXISTS cheque_books (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id          INT UNSIGNED NULL,
  por_orgacode    VARCHAR(10) NULL,
  vac_code        VARCHAR(10) NULL,
  book_no         VARCHAR(40) NOT NULL,
  member_ref      VARCHAR(64) NULL COMMENT 'farmer_no or member id',
  account_no      VARCHAR(64) NULL COMMENT 'linked deposit/loan/GL account',
  member_name     VARCHAR(150) NULL,
  bank_name       VARCHAR(100) NULL DEFAULT 'Society',
  leaf_start      INT UNSIGNED NOT NULL,
  leaf_end        INT UNSIGNED NOT NULL,
  total_leaves    INT UNSIGNED NOT NULL,
  issue_date      DATE NOT NULL,
  status          ENUM('active','exhausted','cancelled','returned') NOT NULL DEFAULT 'active',
  notes           TEXT NULL,
  created_by      VARCHAR(50) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_book (por_orgacode, book_no),
  KEY idx_member (member_ref),
  KEY idx_account (account_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cheque_leaves (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id         INT UNSIGNED NOT NULL,
  por_orgacode    VARCHAR(10) NULL,
  cheque_no       VARCHAR(40) NOT NULL,
  leaf_seq        INT UNSIGNED NOT NULL,
  status          ENUM('available','issued','used','cleared','stopped','bounced','cancelled') NOT NULL DEFAULT 'available',
  payee_name      VARCHAR(150) NULL,
  amount          DECIMAL(18,2) NULL,
  issue_date      DATE NULL,
  clear_date      DATE NULL,
  stop_date       DATE NULL,
  stop_reason     VARCHAR(255) NULL,
  narration       VARCHAR(500) NULL,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cheque (por_orgacode, cheque_no),
  KEY idx_book (book_id),
  KEY idx_status (status),
  CONSTRAINT fk_leaf_book FOREIGN KEY (book_id) REFERENCES cheque_books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS cheque_book_requests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  por_orgacode    VARCHAR(10) NULL,
  vac_code        VARCHAR(10) NULL,
  request_no      VARCHAR(40) NOT NULL,
  member_ref      VARCHAR(64) NOT NULL,
  member_name     VARCHAR(150) NULL,
  account_no      VARCHAR(64) NULL,
  leaves_requested INT UNSIGNED NOT NULL DEFAULT 25,
  request_date    DATE NOT NULL,
  status          ENUM('pending','approved','rejected','issued','cancelled') NOT NULL DEFAULT 'pending',
  reason          VARCHAR(255) NULL,
  review_notes    VARCHAR(500) NULL,
  reviewed_by     VARCHAR(50) NULL,
  reviewed_at     DATETIME NULL,
  issued_book_id  INT UNSIGNED NULL,
  created_by      VARCHAR(50) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_req (por_orgacode, request_no),
  KEY idx_status (status),
  KEY idx_member (member_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
