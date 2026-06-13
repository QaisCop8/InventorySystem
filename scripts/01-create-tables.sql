-- Creating PostgreSQL database schema for ERP system
-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  department VARCHAR(50) NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  customer_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  mobile1 VARCHAR(20),
  mobile2 VARCHAR(20),
  whatsapp1 VARCHAR(20),
  whatsapp2 VARCHAR(20),
  city VARCHAR(50),
  address TEXT,
  email VARCHAR(100),
  status VARCHAR(20) DEFAULT 'نشط',
  business_nature VARCHAR(100),
  salesman VARCHAR(50),
  transaction_notes TEXT,
  general_notes TEXT,
  classification VARCHAR(50),
  registration_date DATE DEFAULT CURRENT_DATE,
  web_username VARCHAR(50),
  web_password VARCHAR(255),
  api_key VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  supplier_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone1 VARCHAR(20),
  phone2 VARCHAR(20),
  whatsapp1 VARCHAR(20),
  whatsapp2 VARCHAR(20),
  city VARCHAR(50),
  address TEXT,
  email VARCHAR(100),
  activity VARCHAR(100),
  representative VARCHAR(50),
  classification VARCHAR(50),
  account_open_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'نشط',
  username VARCHAR(50),
  api_key VARCHAR(100),
  transaction_notes TEXT,
  general_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product categories table
CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  product_code VARCHAR(20) UNIQUE NOT NULL,
  barcode VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  category_id INTEGER REFERENCES product_categories(id),
  primary_unit VARCHAR(20),
  secondary_unit VARCHAR(20),
  conversion_factor DECIMAL(10,4) DEFAULT 1,
  original_number VARCHAR(50),
  manufacturer_number VARCHAR(50),
  last_purchase_price DECIMAL(10,2),
  currency VARCHAR(10),
  cost_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER DEFAULT 0,
  order_quantity INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'نشط',
  default_store INTEGER,
  supplier_id INTEGER REFERENCES suppliers(id),
  product_type VARCHAR(20) DEFAULT 'عادي',
  has_expiry_date BOOLEAN DEFAULT false,
  has_batch_number BOOLEAN DEFAULT false,
  has_colors BOOLEAN DEFAULT false,
  entry_date DATE DEFAULT CURRENT_DATE,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  manager VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product warehouse locations
CREATE TABLE IF NOT EXISTS product_warehouses (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id INTEGER REFERENCES warehouses(id),
  floor VARCHAR(20),
  area VARCHAR(20),
  shelf VARCHAR(20),
  quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0
);

-- Sales orders table
CREATE TABLE IF NOT EXISTS sales_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(20) UNIQUE NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  customer_id INTEGER REFERENCES customers(id),
  customer_code VARCHAR(20),
  salesman VARCHAR(50),
  currency_name VARCHAR(50),
  currency_symbol VARCHAR(10),
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  manual_document VARCHAR(50),
  financial_status VARCHAR(50),
  order_status VARCHAR(50),
  delivery_date TIMESTAMP,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(20) UNIQUE NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  supplier_id INTEGER REFERENCES suppliers(id),
  supplier_code VARCHAR(20),
  salesman VARCHAR(50),
  currency_name VARCHAR(50),
  currency_symbol VARCHAR(10),
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  manual_document VARCHAR(50),
  expected_date DATE,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'قيد التنفيذ',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table (for both sales and purchase orders)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_type VARCHAR(10) NOT NULL, -- 'sales' or 'purchase'
  order_id INTEGER NOT NULL,
  product_id INTEGER REFERENCES products(id),
  product_code VARCHAR(20),
  product_name VARCHAR(100),
  barcode VARCHAR(50),
  warehouse_id INTEGER REFERENCES warehouses(id),
  quantity INTEGER NOT NULL,
  bonus_quantity INTEGER DEFAULT 0,
  unit VARCHAR(20),
  unit_price DECIMAL(10,2),
  total_price DECIMAL(12,2),
  expiry_date DATE,
  batch_number VARCHAR(50),
  item_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exchange rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(10) NOT NULL,
  currency_name VARCHAR(50) NOT NULL,
  buy_rate DECIMAL(10,4),
  sell_rate DECIMAL(10,4),
  exchange_rate DECIMAL(10,4),
  rate_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cities table
CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Adding function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updating timestamps
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exchange_rates_updated_at BEFORE UPDATE ON exchange_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_type, order_id);
