-- DigiFyntek — Islamic banking product suite (SBP-style catalogue)
USE digifyntek;

-- Ensure COA for Islamic
INSERT IGNORE INTO cbs_coa (gl_code, gl_name, gl_type) VALUES
('1210', 'Islamic Financing Assets', 'ASSET'),
('2010', 'Islamic Current Deposits (Qard)', 'LIABILITY'),
('2020', 'Islamic Savings (Mudaraba)', 'LIABILITY'),
('2210', 'Islamic Term Deposits', 'LIABILITY'),
('4100', 'Islamic Profit Income', 'INCOME'),
('4110', 'Murabaha Profit Income', 'INCOME'),
('4120', 'Ijarah Income', 'INCOME'),
('5100', 'Profit Expense to Depositors', 'EXPENSE');

-- ===== Islamic deposit (CASA-like) =====
INSERT IGNORE INTO cbs_products
  (product_code, product_name, product_type, product_family, islamic_mode, is_islamic, interest_rate, gl_code, gl_liability, gl_asset, active)
VALUES
('ISL-CUR-QARD', 'Islamic Current Account (Qard)', 'current', 'ISLAMIC_CASA', 'QARD', 1, 0, '2010', '2010', NULL, 1),
('ISL-SAV-MUD', 'Islamic Savings (Mudaraba)', 'savings', 'ISLAMIC_CASA', 'MUDARABA', 1, 6.5, '2020', '2020', NULL, 1),
('ISL-SAV-WAD', 'Islamic Savings (Wadiah)', 'savings', 'ISLAMIC_CASA', 'WADIAH', 1, 0, '2010', '2010', NULL, 1),

-- ===== Islamic term / investment deposits =====
('TD-ISL', 'Islamic Term Deposit', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 9, '2210', '2210', NULL, 1),
('TD-ISL-MUD', 'Mudaraba Term Deposit', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 9.5, '2210', '2210', NULL, 1),
('TD-ISL-WAK', 'Wakala Investment Deposit', 'term', 'ISLAMIC_TD', 'WAKALA', 1, 8.5, '2210', '2210', NULL, 1),
('TD-ISL-3M', 'Islamic TD 3 Months', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 8, '2210', '2210', NULL, 1),
('TD-ISL-12M', 'Islamic TD 12 Months', 'term', 'ISLAMIC_TD', 'MUDARABA', 1, 10, '2210', '2210', NULL, 1),

-- ===== Islamic financing =====
('MUR-GOODS', 'Murabaha Goods Finance', 'islamic', 'ISLAMIC_FINANCE', 'MURABAHA', 1, 12, '1210', NULL, '1210', 1),
('MUR-AUTO', 'Murabaha Vehicle Finance', 'islamic', 'ISLAMIC_FINANCE', 'MURABAHA', 1, 13, '1210', NULL, '1210', 1),
('MUR-HOME', 'Murabaha Home Goods', 'islamic', 'ISLAMIC_FINANCE', 'MURABAHA', 1, 11, '1210', NULL, '1210', 1),
('IJARAH-EQ', 'Ijarah Equipment', 'islamic', 'ISLAMIC_FINANCE', 'IJARAH', 1, 11, '1210', NULL, '1210', 1),
('IJARAH-VEH', 'Ijarah Vehicle', 'islamic', 'ISLAMIC_FINANCE', 'IJARAH', 1, 12, '1210', NULL, '1210', 1),
('SALAM-AGRI', 'Salam Agriculture', 'islamic', 'ISLAMIC_FINANCE', 'SALAM', 1, 10, '1210', NULL, '1210', 1),
('ISTISNA-CON', 'Istisna Construction', 'islamic', 'ISLAMIC_FINANCE', 'ISTISNA', 1, 12, '1210', NULL, '1210', 1),
('MUSHARAKA', 'Diminishing Musharaka', 'islamic', 'ISLAMIC_FINANCE', 'MUSHARAKA', 1, 12, '1210', NULL, '1210', 1),
('MUDARABA-FIN', 'Mudaraba Financing', 'islamic', 'ISLAMIC_FINANCE', 'MUDARABA', 1, 14, '1210', NULL, '1210', 1),
('QARD-HASAN', 'Qard Hasan', 'islamic', 'ISLAMIC_FINANCE', 'QARD', 1, 0, '1210', NULL, '1210', 1);

SELECT product_code, product_name, islamic_mode, is_islamic, interest_rate, product_family
FROM cbs_products
WHERE is_islamic = 1
ORDER BY product_family, product_code;
