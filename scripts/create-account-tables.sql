-- Create account classification type and account classification tables for accounting setup

CREATE TABLE IF NOT EXISTS account_classification_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2)),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_classifications (
  id SERIAL PRIMARY KEY,
  account_code VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  classification_type_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
  parent_account_id INTEGER,
  opening_balance NUMERIC(18,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_classifications_name_unique UNIQUE (name),
  CONSTRAINT account_classifications_code_unique UNIQUE (account_code),
  CONSTRAINT account_classifications_type_fk FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  account_code VARCHAR(50) UNIQUE NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  classification_type_id INTEGER NOT NULL,
  parent_account_id INTEGER,
  opening_balance NUMERIC(18,2) DEFAULT 0,
  debit_amount NUMERIC(18,2) DEFAULT 0,
  credit_amount NUMERIC(18,2) DEFAULT 0,
  balance NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'نشط',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT accounts_code_unique UNIQUE (account_code),
  CONSTRAINT accounts_type_fk FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
);

CREATE INDEX IF NOT EXISTS account_classifications_parent_account_idx ON account_classifications (parent_account_id);
CREATE INDEX IF NOT EXISTS accounts_parent_account_idx ON accounts (parent_account_id);
CREATE INDEX IF NOT EXISTS accounts_code_idx ON accounts (account_code);
CREATE INDEX IF NOT EXISTS accounts_status_idx ON accounts (status);
