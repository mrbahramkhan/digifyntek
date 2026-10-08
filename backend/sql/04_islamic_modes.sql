USE forge_coop;

-- Shared extras for Salam / Ijarah / Qard (murabaha fields already in 03)
ALTER TABLE loans ADD COLUMN quantity DECIMAL(14,3) NULL COMMENT 'Salam: agreed quantity';
ALTER TABLE loans ADD COLUMN unit VARCHAR(40) NULL COMMENT 'Salam: maund, kg, etc';
ALTER TABLE loans ADD COLUMN delivery_place VARCHAR(255) NULL;
ALTER TABLE loans ADD COLUMN quality_specs VARCHAR(500) NULL;
ALTER TABLE loans ADD COLUMN lease_asset_desc VARCHAR(255) NULL COMMENT 'Ijarah asset';
ALTER TABLE loans ADD COLUMN rent_amount DECIMAL(14,2) NULL COMMENT 'Ijarah periodic rent';
ALTER TABLE loans ADD COLUMN rent_frequency ENUM('monthly','quarterly','seasonal','yearly') NULL;
ALTER TABLE loans ADD COLUMN admin_fee DECIMAL(14,2) NULL DEFAULT 0 COMMENT 'Qard hasan actual cost only';
ALTER TABLE loans ADD COLUMN islamic_stage VARCHAR(40) NULL DEFAULT 'application';

CREATE TABLE IF NOT EXISTS islamic_checklist (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id       INT UNSIGNED NOT NULL,
  mode          VARCHAR(30) NOT NULL,
  step_code     VARCHAR(40) NOT NULL,
  step_title    VARCHAR(255) NOT NULL,
  is_done       TINYINT(1) NOT NULL DEFAULT 0,
  done_at       DATETIME NULL,
  UNIQUE KEY uq_loan_step (loan_id, step_code),
  CONSTRAINT fk_ic_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
) ENGINE=InnoDB;
