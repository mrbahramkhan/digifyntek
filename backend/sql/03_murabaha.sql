USE digifyntek;

-- Run once after 01_schema. Ignore "duplicate column" if re-run.

ALTER TABLE loans ADD COLUMN cost_amount DECIMAL(14,2) NULL COMMENT 'Acquisition cost' AFTER principal;
ALTER TABLE loans ADD COLUMN profit_amount DECIMAL(14,2) NULL COMMENT 'Disclosed profit' AFTER cost_amount;
ALTER TABLE loans ADD COLUMN sale_price DECIMAL(14,2) NULL COMMENT 'Cost + profit' AFTER profit_amount;
ALTER TABLE loans ADD COLUMN supplier_name VARCHAR(255) NULL AFTER underlying_asset;
ALTER TABLE loans ADD COLUMN supplier_invoice_ref VARCHAR(100) NULL AFTER supplier_name;
ALTER TABLE loans ADD COLUMN purchase_date DATE NULL AFTER supplier_invoice_ref;
ALTER TABLE loans ADD COLUMN ownership_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER purchase_date;
ALTER TABLE loans ADD COLUMN delivery_date DATE NULL AFTER ownership_confirmed;
ALTER TABLE loans ADD COLUMN murabaha_stage VARCHAR(30) NULL DEFAULT 'application' AFTER delivery_date;

CREATE TABLE IF NOT EXISTS murabaha_checklist (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id       INT UNSIGNED NOT NULL,
  step_code     VARCHAR(40) NOT NULL,
  step_title    VARCHAR(255) NOT NULL,
  is_done       TINYINT(1) NOT NULL DEFAULT 0,
  done_at       DATETIME NULL,
  notes         VARCHAR(255) NULL,
  UNIQUE KEY uq_loan_step (loan_id, step_code),
  CONSTRAINT fk_mc_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS murabaha_docs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id       INT UNSIGNED NOT NULL,
  doc_type      VARCHAR(40) NOT NULL,
  file_url      VARCHAR(500) NULL,
  ref_number    VARCHAR(100) NULL,
  uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_md_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Backfill existing murabaha seed rows
UPDATE loans SET
  cost_amount = COALESCE(cost_amount, principal),
  profit_amount = COALESCE(profit_amount, profit_or_interest),
  sale_price = COALESCE(sale_price, outstanding),
  murabaha_stage = COALESCE(murabaha_stage, IF(status='active','active','application')),
  ownership_confirmed = IF(mode='murabaha' AND status IN ('active','disbursed'), 1, ownership_confirmed)
WHERE mode = 'murabaha';
