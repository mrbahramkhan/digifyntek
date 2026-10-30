-- DigiFyntek — complete RBAC permissions matrix
USE digifyntek;

-- Roles
INSERT IGNORE INTO cbs_roles (role_code, role_name, description) VALUES
('superadmin', 'Super Admin', 'Full system access'),
('admin', 'Administrator', 'Institution admin'),
('ops_manager', 'Operations Manager', 'Approvals and operations oversight'),
('teller', 'Teller', 'Cash drawer and CASA'),
('credit_officer', 'Credit Officer', 'CIF, financing, TD'),
('compliance', 'Compliance', 'KYC, NADRA, screening'),
('accountant', 'Accountant', 'Ledger, EOD, recon'),
('viewer', 'Viewer', 'Read-only access'),
('branch_manager', 'Branch Manager', 'Branch ops + limited approvals'),
('islamic_officer', 'Islamic Officer', 'Islamic products and financing');

-- Full permission catalogue
INSERT IGNORE INTO cbs_permissions (perm_code, module, description) VALUES
-- CIF / Customer
('cif.read', 'CIF', 'View customers'),
('cif.write', 'CIF', 'Create/update customers'),
-- KYC / NADRA
('kyc.read', 'KYC', 'View KYC cases'),
('kyc.write', 'KYC', 'Manage KYC cases'),
('kyc.decide', 'KYC', 'Approve/reject KYC'),
('nadra.verify', 'KYC', 'NADRA CNIC verification'),
-- Accounts / CASA
('accounts.read', 'Accounts', 'View accounts'),
('accounts.write', 'Accounts', 'Open accounts'),
('casa.post', 'CASA', 'Deposit/withdraw'),
('transfer.post', 'Transfers', 'Internal transfer'),
-- Ledger
('ledger.read', 'Ledger', 'View journals / trial balance'),
('ledger.post', 'Ledger', 'Post journals'),
('ledger.reverse', 'Ledger', 'Reverse journals'),
-- Lending
('loan.read', 'Lending', 'View financing'),
('loan.disburse', 'Lending', 'Disburse loans'),
('loan.repay', 'Lending', 'Post repayments'),
-- Term deposits
('td.read', 'TD', 'View term deposits'),
('td.write', 'TD', 'Place/settle TD'),
-- Approvals
('approval.read', 'Approvals', 'View maker-checker queue'),
('approval.decide', 'Approvals', 'Approve/reject requests'),
-- Payments
('payments.read', 'Payments', 'View payments'),
('payments.post', 'Payments', 'Initiate payments'),
-- Teller / clearing / recon / instruments
('teller.ops', 'Teller', 'Drawer and vault'),
('clearing.ops', 'Clearing', 'Cheque clearing'),
('recon.ops', 'Recon', 'Reconciliation'),
('instruments.ops', 'Instruments', 'Cheque books'),
-- EOD / Reports / Admin
('eod.run', 'EOD', 'Run end of day'),
('reports.read', 'Reports', 'View operational reports'),
('admin.rbac', 'Admin', 'Manage roles and permissions'),
('admin.setup', 'Admin', 'Institution setup'),
-- Agri
('agri.members', 'Agri', 'Member register'),
('agri.shares', 'Agri', 'Share capital'),
('agri.cards', 'Agri', 'Membership cards'),
('agri.savings', 'Agri', 'Member deposits'),
-- Islamic
('islamic.read', 'Islamic', 'View Islamic facilities'),
('islamic.write', 'Islamic', 'Create/update Islamic facilities');

-- Reset non-admin mappings for a clean complete matrix (keep admin/* via re-seed)
DELETE FROM cbs_role_permissions WHERE role_code NOT IN ('admin', 'superadmin');

-- admin gets every permission
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code)
SELECT 'admin', perm_code FROM cbs_permissions;

-- ops_manager
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('ops_manager', 'cif.read'),
('ops_manager', 'kyc.read'),
('ops_manager', 'accounts.read'),
('ops_manager', 'casa.post'),
('ops_manager', 'transfer.post'),
('ops_manager', 'ledger.read'),
('ops_manager', 'loan.read'),
('ops_manager', 'td.read'),
('ops_manager', 'approval.read'),
('ops_manager', 'approval.decide'),
('ops_manager', 'payments.read'),
('ops_manager', 'teller.ops'),
('ops_manager', 'clearing.ops'),
('ops_manager', 'recon.ops'),
('ops_manager', 'instruments.ops'),
('ops_manager', 'eod.run'),
('ops_manager', 'reports.read');

-- branch_manager (between teller and ops)
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('branch_manager', 'cif.read'),
('branch_manager', 'cif.write'),
('branch_manager', 'kyc.read'),
('branch_manager', 'accounts.read'),
('branch_manager', 'accounts.write'),
('branch_manager', 'casa.post'),
('branch_manager', 'transfer.post'),
('branch_manager', 'ledger.read'),
('branch_manager', 'loan.read'),
('branch_manager', 'td.read'),
('branch_manager', 'td.write'),
('branch_manager', 'approval.read'),
('branch_manager', 'approval.decide'),
('branch_manager', 'teller.ops'),
('branch_manager', 'instruments.ops'),
('branch_manager', 'reports.read');

-- teller
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('teller', 'cif.read'),
('teller', 'accounts.read'),
('teller', 'casa.post'),
('teller', 'transfer.post'),
('teller', 'teller.ops'),
('teller', 'instruments.ops'),
('teller', 'payments.read');

-- credit_officer
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

-- compliance
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('compliance', 'cif.read'),
('compliance', 'kyc.read'),
('compliance', 'kyc.write'),
('compliance', 'kyc.decide'),
('compliance', 'nadra.verify'),
('compliance', 'accounts.read'),
('compliance', 'loan.read'),
('compliance', 'reports.read');

-- accountant
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('accountant', 'cif.read'),
('accountant', 'accounts.read'),
('accountant', 'ledger.read'),
('accountant', 'ledger.post'),
('accountant', 'ledger.reverse'),
('accountant', 'loan.read'),
('accountant', 'td.read'),
('accountant', 'clearing.ops'),
('accountant', 'recon.ops'),
('accountant', 'eod.run'),
('accountant', 'reports.read'),
('accountant', 'approval.read');

-- islamic_officer
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('islamic_officer', 'cif.read'),
('islamic_officer', 'kyc.read'),
('islamic_officer', 'nadra.verify'),
('islamic_officer', 'accounts.read'),
('islamic_officer', 'loan.read'),
('islamic_officer', 'loan.disburse'),
('islamic_officer', 'loan.repay'),
('islamic_officer', 'td.read'),
('islamic_officer', 'td.write'),
('islamic_officer', 'islamic.read'),
('islamic_officer', 'islamic.write'),
('islamic_officer', 'reports.read');

-- viewer (read-only)
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('viewer', 'cif.read'),
('viewer', 'kyc.read'),
('viewer', 'accounts.read'),
('viewer', 'ledger.read'),
('viewer', 'loan.read'),
('viewer', 'td.read'),
('viewer', 'payments.read'),
('viewer', 'approval.read'),
('viewer', 'reports.read'),
('viewer', 'islamic.read'),
('viewer', 'agri.members');

-- Optional: ops can see agri read-only
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('ops_manager', 'agri.members'),
('admin', 'agri.members'),
('admin', 'agri.shares'),
('admin', 'agri.cards'),
('admin', 'agri.savings'),
('admin', 'islamic.read'),
('admin', 'islamic.write'),
('admin', 'nadra.verify'),
('admin', 'reports.read'),
('admin', 'admin.setup');

-- Summary view
SELECT r.role_code, COUNT(rp.perm_code) AS perm_count
FROM cbs_roles r
LEFT JOIN cbs_role_permissions rp ON rp.role_code = r.role_code
GROUP BY r.role_code
ORDER BY r.role_code;

SELECT COUNT(*) AS total_permissions FROM cbs_permissions;
SELECT COUNT(*) AS total_mappings FROM cbs_role_permissions;
