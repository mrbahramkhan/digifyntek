-- DigiFyntek — Roles & Permissions (reference seed)
USE digifyntek;

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
  PRIMARY KEY (role_code, perm_code),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_code) REFERENCES cbs_roles (role_code),
  CONSTRAINT fk_rp_perm FOREIGN KEY (perm_code) REFERENCES cbs_permissions (perm_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO cbs_roles (role_code, role_name, description, is_system) VALUES
('superadmin', 'Super Admin', 'Full system access', 1),
('admin', 'Administrator', 'Institution admin', 1),
('ops_manager', 'Operations Manager', 'Approvals and ops', 1),
('branch_manager', 'Branch Manager', 'Branch ops', 1),
('teller', 'Teller', 'Cash and CASA', 1),
('credit_officer', 'Credit Officer', 'CIF and financing', 1),
('compliance', 'Compliance', 'KYC and NADRA', 1),
('accountant', 'Accountant', 'Ledger and EOD', 1),
('islamic_officer', 'Islamic Officer', 'Islamic products', 1),
('viewer', 'Viewer', 'Read-only', 1);

INSERT IGNORE INTO cbs_permissions (perm_code, module, description) VALUES
('cif.read', 'CIF', 'View customers'),
('cif.write', 'CIF', 'Create/update customers'),
('kyc.read', 'KYC', 'View KYC cases'),
('kyc.write', 'KYC', 'Manage KYC'),
('kyc.decide', 'KYC', 'Approve/reject KYC'),
('nadra.verify', 'KYC', 'NADRA CNIC verification'),
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
('instruments.ops', 'Instruments', 'Cheque books'),
('eod.run', 'EOD', 'Run end of day'),
('reports.read', 'Reports', 'View reports'),
('admin.rbac', 'Admin', 'Manage roles'),
('admin.setup', 'Admin', 'Institution setup'),
('agri.members', 'Agri', 'Member register'),
('agri.shares', 'Agri', 'Share capital'),
('islamic.read', 'Islamic', 'View Islamic facilities'),
('islamic.write', 'Islamic', 'Manage Islamic facilities');

-- Admin gets all
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code)
SELECT 'admin', perm_code FROM cbs_permissions;

-- Example: teller
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('teller', 'cif.read'),
('teller', 'accounts.read'),
('teller', 'casa.post'),
('teller', 'transfer.post'),
('teller', 'teller.ops'),
('teller', 'instruments.ops'),
('teller', 'payments.read');

-- Example: credit_officer
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('credit_officer', 'cif.read'),
('credit_officer', 'cif.write'),
('credit_officer', 'kyc.read'),
('credit_officer', 'kyc.write'),
('credit_officer', 'nadra.verify'),
('credit_officer', 'accounts.read'),
('credit_officer', 'loan.read'),
('credit_officer', 'loan.disburse'),
('credit_officer', 'loan.repay'),
('credit_officer', 'td.read'),
('credit_officer', 'td.write'),
('credit_officer', 'approval.read'),
('credit_officer', 'reports.read'),
('credit_officer', 'islamic.read'),
('credit_officer', 'islamic.write');
