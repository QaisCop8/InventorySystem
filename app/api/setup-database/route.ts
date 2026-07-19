import { sql } from "@vercel/postgres"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_code VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        mobile1 VARCHAR(20),
        mobile2 VARCHAR(20),
        whatsapp1 VARCHAR(20),
        whatsapp2 VARCHAR(20),
        city VARCHAR(100),
        address TEXT,
        email VARCHAR(255),
        status VARCHAR(50) DEFAULT 'نشط',
        business_nature VARCHAR(255),
        salesman VARCHAR(255),
        movement_notes TEXT,
        general_notes TEXT,
        classifications VARCHAR(255),
        account_opening_date DATE DEFAULT CURRENT_DATE,
        attachments TEXT,
        web_username VARCHAR(100),
        web_password VARCHAR(100),
        api_number VARCHAR(100),
        account_id INTEGER REFERENCES account_tbl(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES account_tbl(id)`

    await sql`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        supplier_code VARCHAR(50) UNIQUE NOT NULL,
        supplier_name VARCHAR(255) NOT NULL,
        mobile1 VARCHAR(20),
        mobile2 VARCHAR(20),
        whatsapp1 VARCHAR(20),
        whatsapp2 VARCHAR(20),
        city VARCHAR(100),
        address TEXT,
        email VARCHAR(255),
        status VARCHAR(50) DEFAULT 'نشط',
        business_nature VARCHAR(255),
        salesman VARCHAR(255),
        movement_notes TEXT,
        general_notes TEXT,
        classifications VARCHAR(255),
        account_opening_date DATE DEFAULT CURRENT_DATE,
        attachments TEXT,
        web_username VARCHAR(100),
        web_password VARCHAR(100),
        api_number VARCHAR(100),
        account_id INTEGER REFERENCES account_tbl(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES account_tbl(id)`

    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) UNIQUE NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        description TEXT,
        main_unit VARCHAR(50),
        secondary_unit VARCHAR(50),
        conversion_factor DECIMAL(10,4) DEFAULT 1,
        barcode VARCHAR(100),
        original_number VARCHAR(100),
        manufacturer_number VARCHAR(100),
        last_purchase_price DECIMAL(15,4),
        currency VARCHAR(10) DEFAULT 'USD',
        category VARCHAR(255),
        status VARCHAR(50) DEFAULT 'نشط',
        product_type INTEGER DEFAULT 1,
        type INTEGER DEFAULT 1,
        service_type INTEGER DEFAULT 0,
        has_expiry BOOLEAN DEFAULT false,
        has_batch BOOLEAN DEFAULT false,
        has_colors BOOLEAN DEFAULT false,
        max_quantity DECIMAL(15,4),
        order_quantity DECIMAL(15,4),
        product_image TEXT,
        general_notes TEXT,
        classifications VARCHAR(255),
        tax_classification_id INTEGER,
        entry_date DATE DEFAULT CURRENT_DATE,
        attachments TEXT,
        selling_account_id INTEGER,
        selling_account_code VARCHAR(100),
        purchase_account_id INTEGER,
        purchase_account_code VARCHAR(100),
        selling_returns_account_id INTEGER,
        selling_returns_account_code VARCHAR(100),
        purchase_returns_account_id INTEGER,
        purchase_returns_account_code VARCHAR(100),
        stock_end_account_id INTEGER,
        stock_end_account_code VARCHAR(100),
        stock_start_account_id INTEGER,
        stock_start_account_code VARCHAR(100),
        production_account_id INTEGER,
        production_account_code VARCHAR(100),
        municipality_service_account_id INTEGER,
        municipality_service_account_code VARCHAR(100),
        lsti3mal_account_id INTEGER,
        lsti3mal_account_code VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS service_type INTEGER DEFAULT 0`

    await sql`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id SERIAL PRIMARY KEY,
        currency_code VARCHAR(10) UNIQUE NOT NULL,
        currency_name VARCHAR(100) NOT NULL,
        buy_rate DECIMAL(15,6) NOT NULL,
        sell_rate DECIMAL(15,6) NOT NULL,
        exchange_rate DECIMAL(15,6) NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS item_groups (
        id SERIAL PRIMARY KEY,
        group_code VARCHAR(8) UNIQUE NOT NULL,
        group_name VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'نشط',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS tax_classifications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        tax_percent DECIMAL(5,2) DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS account_classification_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`
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
        CONSTRAINT account_classifications_type_fk
          FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
      )
    `

    await sql`
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
      )
    `

    // Insert sample data
    await sql`
      INSERT INTO customers (customer_code, customer_name, mobile1, city, email, business_nature, salesman) 
      VALUES 
        ('C001', 'شركة الأمل التجارية', '0501234567', 'الرياض', 'info@alamal.com', 'تجارة عامة', 'أحمد محمد'),
        ('C002', 'مؤسسة النور للتجارة', '0509876543', 'جدة', 'contact@alnoor.com', 'استيراد وتصدير', 'فاطمة أحمد'),
        ('C003', 'شركة الفجر الجديد', '0512345678', 'الدمام', 'sales@alfajr.com', 'تجارة إلكترونية', 'محمد علي')
      ON CONFLICT (customer_code) DO NOTHING
    `

    await sql`
      INSERT INTO suppliers (supplier_code, supplier_name, mobile1, city, email, business_nature, salesman)
      VALUES 
        ('S001', 'شركة المواد الأولية', '0501111111', 'الرياض', 'info@materials.com', 'توريد مواد خام', 'سالم أحمد'),
        ('S002', 'مؤسسة التقنية المتقدمة', '0502222222', 'جدة', 'tech@advanced.com', 'تقنية معلومات', 'نورا محمد')
      ON CONFLICT (supplier_code) DO NOTHING
    `

    await sql`
      INSERT INTO products (product_code, product_name, description, main_unit, category, last_purchase_price)
      VALUES 
        ('P001', 'لابتوب ديل', 'لابتوب ديل انسبايرون 15', 'قطعة', 'إلكترونيات', 2500.00),
        ('P002', 'طابعة HP', 'طابعة HP ليزر جت', 'قطعة', 'إلكترونيات', 800.00),
        ('P003', 'كرسي مكتب', 'كرسي مكتب مريح', 'قطعة', 'أثاث', 450.00)
      ON CONFLICT (product_code) DO NOTHING
    `

    await sql`
      INSERT INTO exchange_rates (currency_code, currency_name, buy_rate, sell_rate, exchange_rate)
      VALUES 
        ('USD', 'دولار أمريكي', 3.75, 3.76, 3.755),
        ('EUR', 'يورو', 4.10, 4.12, 4.11),
        ('GBP', 'جنيه إسترليني', 4.65, 4.68, 4.665)
      ON CONFLICT (currency_code) DO NOTHING
    `

    await sql`
      INSERT INTO item_groups (group_code, group_name, description, status) VALUES
        ('GRP001', 'الإلكترونيات', 'أجهزة إلكترونية ومعدات تقنية', 'نشط'),
        ('GRP002', 'الملابس والأزياء', 'ملابس رجالية ونسائية وأطفال', 'نشط'),
        ('GRP003', 'المواد الغذائية', 'أطعمة ومشروبات ومواد استهلاكية', 'نشط'),
        ('GRP004', 'الأثاث والديكور', 'أثاث منزلي ومكتبي وديكورات', 'نشط'),
        ('GRP005', 'الأدوات والمعدات', 'أدوات يدوية ومعدات صناعية', 'نشط')
      ON CONFLICT (group_code) DO NOTHING
    `

    return NextResponse.json({ success: true, message: "Database setup completed successfully" })
  } catch (error) {
    console.error("Database setup error:", error)
    return NextResponse.json({ error: "Database setup failed", details: error }, { status: 500 })
  }
}
