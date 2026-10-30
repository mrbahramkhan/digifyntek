USE digifyntek;
INSERT IGNORE INTO cbs_permissions (perm_code, module, description) VALUES
('nadra.verify', 'KYC', 'NADRA CNIC verification'),
('reports.read', 'Reports', 'View operational reports'),
('agri.members', 'Agri', 'Agri member register'),
('agri.shares', 'Agri', 'Share capital ops');
INSERT IGNORE INTO cbs_role_permissions (role_code, perm_code) VALUES
('compliance', 'nadra.verify'),
('credit_officer', 'nadra.verify'),
('ops_manager', 'reports.read'),
('accountant', 'reports.read'),
('viewer', 'reports.read');
