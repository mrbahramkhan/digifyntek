USE digifyntek;
ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN mfa_enforced TINYINT(1) NOT NULL DEFAULT 0;
-- Admin roles should enroll MFA
UPDATE users SET mfa_enforced = 1 WHERE role IN ('superadmin', 'admin');
