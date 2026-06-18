-- جدول العملاء
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE,
    customer_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile1 VARCHAR(50),
    mobile2 VARCHAR(50),
    whatsapp1 VARCHAR(50),
    whatsapp2 VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    tax_number VARCHAR(100),
    commercial_registration VARCHAR(100),
    business_nature VARCHAR(100),
    classifications VARCHAR(255),
    salesman VARCHAR(100),
    payment_terms VARCHAR(100),
    credit_limit NUMERIC(15,2) DEFAULT 0,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    account_opening_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    api_number VARCHAR(100),
    general_notes TEXT,
    movement_notes TEXT,
    attachments TEXT,
    account_id INTEGER REFERENCES account_tbl(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
