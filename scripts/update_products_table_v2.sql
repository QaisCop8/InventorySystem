-- تحديث جدول المنتجات ليشمل جميع الحقول المطلوبة
-- Update products table to include all required fields

-- إضافة الحقول المفقودة إلى جدول products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_name_en VARCHAR(255),
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
ADD COLUMN IF NOT EXISTS model VARCHAR(100),
ADD COLUMN IF NOT EXISTS default_store INTEGER,
ADD COLUMN IF NOT EXISTS average_cost DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS selling_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 15,
ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS location VARCHAR(100),
ADD COLUMN IF NOT EXISTS shelf_life INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS expiry_tracking BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS batch_tracking BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS serial_tracking BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS supplier_id INTEGER,
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255),
ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(100),
ADD COLUMN IF NOT EXISTS weight DECIMAL(10,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100),
ADD COLUMN IF NOT EXISTS color VARCHAR(50),
ADD COLUMN IF NOT EXISTS size VARCHAR(50),
ADD COLUMN IF NOT EXISTS material VARCHAR(100),
ADD COLUMN IF NOT EXISTS warranty_period INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- إنشاء جدول تفاصيل المخزون في المستودعات إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS product_warehouse_stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    warehouse_name VARCHAR(100) NOT NULL,
    available_quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    actual_balance INTEGER DEFAULT 0,
    inventory_value DECIMAL(15,2) DEFAULT 0,
    stock_status VARCHAR(50) DEFAULT 'متوفر',
    batch_number VARCHAR(100),
    expiry_date DATE,
    manufacturing_date DATE,
    serial_number VARCHAR(100),
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_name, batch_number, serial_number)
);

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_product ON product_warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_warehouse ON product_warehouse_stock(warehouse_name);

-- تحديث الحقول الموجودة لتتوافق مع التصميم الجديد
UPDATE products SET 
    currency = COALESCE(currency, 'ريال سعودي'),
    status = COALESCE(status, 'نشط'),
    main_unit = COALESCE(main_unit, 'قطعة'),
    conversion_factor = COALESCE(conversion_factor, 1),
    tax_rate = COALESCE(tax_rate, 15)
WHERE currency IS NULL OR status IS NULL OR main_unit IS NULL;

COMMENT ON TABLE products IS 'جدول الأصناف والمنتجات - محدث ليشمل جميع الحقول المطلوبة';
COMMENT ON TABLE product_warehouse_stock IS 'جدول تفاصيل مخزون الأصناف في المستودعات المختلفة';
