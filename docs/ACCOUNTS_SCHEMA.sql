-- =====================================================
-- Accounts Management System - Database Schema
-- =====================================================
-- Description: Complete schema for the accounting module
-- including accounts, classifications, and related entities

-- =====================================================
-- TABLE: account_classification_types
-- Description: Account types/classifications
-- =====================================================
CREATE TABLE IF NOT EXISTS account_classification_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE: accounts
-- Description: Main accounts ledger
-- Fields: Code, Name, Type, Nature, Balances, Status
-- =====================================================
CREATE TABLE IF NOT EXISTS account_tbl (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies_tbl(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    type INTEGER REFERENCES accounts_types_tbl(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    name_lang2 VARCHAR(150),
    father_id INTEGER REFERENCES account_tbl(id) ON DELETE CASCADE,
    level_no INTEGER NOT NULL,
    finanical_list_id INTEGER NOT NULL,
    finanical_list_assests_id INTEGER REFERENCES finiancial_list_assests_tbl(id) ON DELETE CASCADE,
    finanical_list_liabilities_id INTEGER REFERENCES finiancial_list_liabilities_tbl(id) ON DELETE CASCADE,
    finanical_list_income_id INTEGER REFERENCES financial_list_income_tbl(id) ON DELETE CASCADE,
    currency_id INTEGER REFERENCES currency_tbl(id) ON DELETE CASCADE,
    allow_trans_with_diff_curr BOOLEAN NOT NULL,
    iscalc_curr_diff_rates BOOLEAN NOT NULL,
    transaction_type INTEGER NOT NULL,
    transaction_type_action INTEGER NOT NULL,
    max_transaction_amount DOUBLE PRECISION NOT NULL,
    max_transaction_amount_action INTEGER NOT NULL,
    max_balance_amount DOUBLE PRECISION NOT NULL,
    max_balance_action INTEGER,
    budget_exceeding_perc DOUBLE PRECISION,
    budget_exceeding_action INTEGER,
    unified_report_account_no VARCHAR(50),
    unified_report_group_code VARCHAR(50),
    notes VARCHAR(70),
    show_notes_in_transactions_soa BOOLEAN,
    status INTEGER REFERENCES status_tbl(id) ON DELETE CASCADE,
    insert_date DATE,
    last_update_date TIMESTAMPTZ,
    UNIQUE (code),
    FULLTEXT (name, name_lang2)
);

-- =====================================================
-- TABLE: account_hierarchies
-- Description: Account parent-child relationships
-- For managing account hierarchies and structures
-- =====================================================
-- Table: account_hierarchies (optional, if needed for tree structure)
-- CREATE TABLE IF NOT EXISTS account_hierarchies (
--     id SERIAL PRIMARY KEY,
--     parent_account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
--     child_account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
--     hierarchy_level INTEGER DEFAULT 0,
--     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );

-- =====================================================
-- TABLE: related_accounts
-- Description: Accounts related to each other
-- For account associations and relationships
-- =====================================================
-- Table: related_accounts (optional, if needed)
-- CREATE TABLE IF NOT EXISTS related_accounts (
--     id SERIAL PRIMARY KEY,
--     account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
--     related_account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
--     relationship_type VARCHAR(100),
--     ratio NUMERIC(5,2) DEFAULT 0.00,
--     priority INTEGER DEFAULT 0,
--     description TEXT,
--     is_active BOOLEAN DEFAULT TRUE,
--     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );

-- =====================================================
-- TABLE: account_movements
-- Description: Journal entries and account transactions
-- =====================================================
CREATE TABLE IF NOT EXISTS account_movements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    document_type VARCHAR(50),
    document_id INT,
    movement_type ENUM('مدين', 'دائن') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    reference_number VARCHAR(100),
    movement_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_account (account_id),
    INDEX idx_date (movement_date),
    INDEX idx_document (document_type, document_id),
    INDEX idx_type (movement_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: account_balances_history
-- Description: Historical account balances for auditing
-- =====================================================
CREATE TABLE IF NOT EXISTS account_balances_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    balance_date DATE NOT NULL,
    opening_balance DECIMAL(15,2) DEFAULT 0.00,
    debit_amount DECIMAL(15,2) DEFAULT 0.00,
    credit_amount DECIMAL(15,2) DEFAULT 0.00,
    closing_balance DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE KEY unique_history (account_id, balance_date),
    INDEX idx_account (account_id),
    INDEX idx_date (balance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: account_restrictions
-- Description: Account usage restrictions and rules
-- =====================================================
CREATE TABLE IF NOT EXISTS account_restrictions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    restriction_type VARCHAR(100),
    max_amount DECIMAL(15,2),
    min_amount DECIMAL(15,2),
    is_locked BOOLEAN DEFAULT FALSE,
    lock_reason VARCHAR(255),
    allowed_document_types JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE KEY unique_restriction (account_id, restriction_type),
    INDEX idx_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: account_audit_logs
-- Description: Audit trail for account changes
-- =====================================================
CREATE TABLE IF NOT EXISTS account_audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    action VARCHAR(50),
    old_values JSON,
    new_values JSON,
    changed_by INT,
    change_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (changed_by) REFERENCES users(id),
    INDEX idx_account (account_id),
    INDEX idx_action (action),
    INDEX idx_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: account_segments
-- Description: Account segments for analytical accounting
-- =====================================================
CREATE TABLE IF NOT EXISTS account_segments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    segment_code VARCHAR(50),
    segment_type VARCHAR(100),
    segment_value VARCHAR(255),
    is_mandatory BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE KEY unique_segment (account_id, segment_type),
    INDEX idx_account (account_id),
    INDEX idx_type (segment_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: account_cost_centers
-- Description: Link accounts to cost centers
-- =====================================================
CREATE TABLE IF NOT EXISTS account_cost_centers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    cost_center_id INT,
    cost_center_name VARCHAR(255),
    percentage DECIMAL(5,2) DEFAULT 100.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    INDEX idx_account (account_id),
    INDEX idx_cost_center (cost_center_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Insert account classification types
INSERT INTO account_classification_types (name, description, display_order) VALUES
('الأصول', 'الأصول والممتلكات', 1),
('الخصوم', 'الخصوم والالتزامات', 2),
('حقوق الملكية', 'حقوق الملكية وراس المال', 3),
('الإيرادات', 'الإيرادات والمبيعات', 4),
('المصروفات', 'المصروفات والتكاليف', 5),
('الأرباح والخسائر', 'الأرباح والخسائر المتنوعة', 6)
ON DUPLICATE KEY UPDATE display_order=VALUES(display_order);

-- =====================================================
-- VIEWS FOR EASIER QUERIES
-- =====================================================

-- Account Summary View
CREATE OR REPLACE VIEW v_account_summary AS
SELECT 
    a.id,
    a.account_code,
    a.account_name,
    act.name AS classification_type_name,
    a.account_nature,
    a.opening_balance,
    a.debit_amount,
    a.credit_amount,
    a.balance,
    a.status,
    a.allowed_ratio,
    a.description,
    pa.account_code AS parent_account_code,
    pa.account_name AS parent_account_name,
    a.created_at,
    a.updated_at
FROM accounts a
LEFT JOIN account_classification_types act ON a.classification_type_id = act.id
LEFT JOIN accounts pa ON a.parent_account_id = pa.id
WHERE a.status = 'نشط'
ORDER BY a.account_code;

-- Account Hierarchy View
CREATE OR REPLACE VIEW v_account_hierarchy AS
SELECT 
    h.id,
    h.parent_account_id,
    pa.account_code AS parent_code,
    pa.account_name AS parent_name,
    h.child_account_id,
    ca.account_code AS child_code,
    ca.account_name AS child_name,
    h.hierarchy_level,
    h.created_at
FROM account_hierarchies h
LEFT JOIN accounts pa ON h.parent_account_id = pa.id
LEFT JOIN accounts ca ON h.child_account_id = ca.id;

-- Account Balance View
CREATE OR REPLACE VIEW v_account_balance AS
SELECT 
    a.id,
    a.account_code,
    a.account_name,
    a.opening_balance,
    a.debit_amount,
    a.credit_amount,
    a.balance,
    CASE 
        WHEN a.balance > 0 THEN 'مدين'
        WHEN a.balance < 0 THEN 'دائن'
        ELSE 'متوازن'
    END AS balance_status,
    a.status
FROM accounts a
WHERE a.status = 'نشط';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Composite indexes for common queries
ALTER TABLE accounts ADD INDEX idx_type_status (classification_type_id, status);
ALTER TABLE accounts ADD INDEX idx_nature_status (account_nature, status);
ALTER TABLE account_movements ADD INDEX idx_account_date (account_id, movement_date);
ALTER TABLE account_balances_history ADD INDEX idx_account_date (account_id, balance_date);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
