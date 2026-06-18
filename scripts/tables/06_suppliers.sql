-- جدول الموردين
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE,
    supplier_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile1 VARCHAR(50),
    mobile2 VARCHAR(50),
    whatsapp1 VARCHAR(50),
    whatsapp2 VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    business_nature VARCHAR(100),
    classifications VARCHAR(255),
    salesman VARCHAR(100),
    account_opening_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    api_number VARCHAR(100),
    web_username VARCHAR(100),
    web_password VARCHAR(255),
    general_notes TEXT,
    movement_notes TEXT,
    attachments TEXT,
    account_id INTEGER REFERENCES account_tbl(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(supplier_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
