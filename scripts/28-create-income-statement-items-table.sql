-- Create income statement items table for financial definitions tab
CREATE TABLE IF NOT EXISTS income_statement_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT income_statement_items_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT income_statement_items_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_income_statement_items_status
  ON income_statement_items(status);

CREATE OR REPLACE FUNCTION update_income_statement_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_income_statement_items_updated_at ON income_statement_items;

CREATE TRIGGER trg_income_statement_items_updated_at
BEFORE UPDATE ON income_statement_items
FOR EACH ROW
EXECUTE FUNCTION update_income_statement_items_updated_at();

-- Create balance sheet assets items table
CREATE TABLE IF NOT EXISTS balance_sheet_assets_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT balance_sheet_assets_items_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT balance_sheet_assets_items_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_balance_sheet_assets_items_status
  ON balance_sheet_assets_items(status);

CREATE OR REPLACE FUNCTION update_balance_sheet_assets_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_balance_sheet_assets_items_updated_at ON balance_sheet_assets_items;

CREATE TRIGGER trg_balance_sheet_assets_items_updated_at
BEFORE UPDATE ON balance_sheet_assets_items
FOR EACH ROW
EXECUTE FUNCTION update_balance_sheet_assets_items_updated_at();

-- Create balance sheet liabilities items table
CREATE TABLE IF NOT EXISTS balance_sheet_liabilities_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT balance_sheet_liabilities_items_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT balance_sheet_liabilities_items_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_balance_sheet_liabilities_items_status
  ON balance_sheet_liabilities_items(status);

CREATE OR REPLACE FUNCTION update_balance_sheet_liabilities_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_balance_sheet_liabilities_items_updated_at ON balance_sheet_liabilities_items;

CREATE TRIGGER trg_balance_sheet_liabilities_items_updated_at
BEFORE UPDATE ON balance_sheet_liabilities_items
FOR EACH ROW
EXECUTE FUNCTION update_balance_sheet_liabilities_items_updated_at();

-- Create cost center types table
CREATE TABLE IF NOT EXISTS cost_center_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cost_center_types_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT cost_center_types_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_cost_center_types_status
  ON cost_center_types(status);

CREATE OR REPLACE FUNCTION update_cost_center_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cost_center_types_updated_at ON cost_center_types;

CREATE TRIGGER trg_cost_center_types_updated_at
BEFORE UPDATE ON cost_center_types
FOR EACH ROW
EXECUTE FUNCTION update_cost_center_types_updated_at();

-- Create cost centers table with hierarchy (parent/child) and type reference
CREATE TABLE IF NOT EXISTS cost_centers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cost_type_id INTEGER NOT NULL,
  parent_id INTEGER NULL,
  level INTEGER NOT NULL DEFAULT 1,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cost_centers_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT cost_centers_name_unique UNIQUE (name),
  CONSTRAINT cost_centers_cost_type_fk
    FOREIGN KEY (cost_type_id) REFERENCES cost_center_types(id),
  CONSTRAINT cost_centers_parent_fk
    FOREIGN KEY (parent_id) REFERENCES cost_centers(id)
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_status
  ON cost_centers(status);

CREATE INDEX IF NOT EXISTS idx_cost_centers_cost_type_id
  ON cost_centers(cost_type_id);

CREATE INDEX IF NOT EXISTS idx_cost_centers_parent_id
  ON cost_centers(parent_id);

CREATE OR REPLACE FUNCTION update_cost_centers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cost_centers_updated_at ON cost_centers;

CREATE TRIGGER trg_cost_centers_updated_at
BEFORE UPDATE ON cost_centers
FOR EACH ROW
EXECUTE FUNCTION update_cost_centers_updated_at();

-- Create account classification types table
CREATE TABLE IF NOT EXISTS account_classification_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_classification_types_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT account_classification_types_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_account_classification_types_status
  ON account_classification_types(status);

CREATE OR REPLACE FUNCTION update_account_classification_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_classification_types_updated_at ON account_classification_types;

CREATE TRIGGER trg_account_classification_types_updated_at
BEFORE UPDATE ON account_classification_types
FOR EACH ROW
EXECUTE FUNCTION update_account_classification_types_updated_at();

-- Create account classifications table (without levels)
CREATE TABLE IF NOT EXISTS account_classifications (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  classification_type_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_classifications_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT account_classifications_name_unique UNIQUE (name),
  CONSTRAINT account_classifications_type_fk
    FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
);

CREATE INDEX IF NOT EXISTS idx_account_classifications_status
  ON account_classifications(status);

CREATE INDEX IF NOT EXISTS idx_account_classifications_type_id
  ON account_classifications(classification_type_id);

CREATE OR REPLACE FUNCTION update_account_classifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_classifications_updated_at ON account_classifications;

CREATE TRIGGER trg_account_classifications_updated_at
BEFORE UPDATE ON account_classifications
FOR EACH ROW
EXECUTE FUNCTION update_account_classifications_updated_at();
