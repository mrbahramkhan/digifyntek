-- Islamic financing + TD product types (safe on existing DB)
USE digifyntek;

INSERT IGNORE INTO cbs_products (product_code, product_name, product_type, product_family, islamic_mode, is_islamic, interest_rate, gl_code, gl_liability, gl_asset, active) VALUES
('LON-SME', 'SME Term Loan', 'loan', 'LOAN', NULL, 0, 14, '1100', NULL, '1100', 1),
('TD-PKR-6M', 'Term Deposit 6M', 'term', 'TD', NULL, 0, 11, '2200', '2200', NULL, 1),
('MUR-GOODS', 'Murabaha Goods', 'islamic', 'ISLAMIC_FINANCE', 'MURABAHA', 1, 12, '1100', NULL, '1100', 1),
('MUR-AUTO', 'Murabaha Vehicle', 'islamic', 'ISLAMIC_FINANCE', 'MURABAHA', 1, 13, '1100', NULL, '1100', 1),
('IJARAH-EQ', 'Ijarah Equipment', 'islamic', 'ISLAMIC_FINANCE', 'IJARAH', 1, 11, '1100', NULL, '1100', 1),
('SALAM-AGRI', 'Salam Agriculture', 'islamic', 'ISLAMIC_FINANCE', 'SALAM', 1, 10, '1100', NULL, '1100', 1),
('ISTISNA-CON', 'Istisna Construction', 'islamic', 'ISLAMIC_FINANCE', 'ISTISNA', 1, 12, '1100', NULL, '1100', 1),
('QARD-HASAN', 'Qard Hasan', 'islamic', 'ISLAMIC_FINANCE', 'QARD', 1, 0, '1100', NULL, '1100', 1),
('MUSHARAKA', 'Diminishing Musharaka', 'islamic', 'ISLAMIC_FINANCE', 'MUSHARAKA', 1, 12, '1100', NULL, '1100', 1),
('TD-ISL', 'Islamic Term Deposit', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 9, '2200', '2200', NULL, 1),
('TD-ISL-MUD', 'Mudaraba Term Deposit', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 9.5, '2200', '2200', NULL, 1),
('TD-ISL-WAK', 'Wakala Term Deposit', 'term', 'ISLAMIC_TD', 'WAKALA', 1, 8.5, '2200', '2200', NULL, 1);

INSERT IGNORE INTO cbs_coa (gl_code, gl_name, gl_type) VALUES
('4100', 'Islamic Profit Income', 'INCOME'),
('5100', 'Profit Expense to Depositors', 'EXPENSE');

-- Optional mode on contracts
ALTER TABLE cbs_financing_contracts ADD COLUMN islamic_mode VARCHAR(40) NULL;
ALTER TABLE cbs_term_deposits ADD COLUMN islamic_mode VARCHAR(40) NULL;
