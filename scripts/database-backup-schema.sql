-- نسخة احتياطية كاملة من قاعدة البيانات - Schema
-- تم إنشاؤها في: $(date)
-- نظام إدارة المخزون والطلبيات

-- إنشاء الجداول الأساسية

-- جدول المستخدمين (من Stack Auth)
CREATE TABLE IF NOT EXISTS neon_auth.users_sync (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    raw_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- جدول سجلات التدقيق
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    action VARCHAR(255),
    module VARCHAR(255),
    details TEXT,
    affected_records JSONB,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(255),
    user_agent TEXT,
    session_id VARCHAR(255),
    status VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول الأدوار المخصصة
CREATE TABLE IF NOT EXISTS custom_roles (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    permissions JSONB,
    hierarchy INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول العملاء
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE,
    customer_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile1 VARCHAR(20),
    mobile2 VARCHAR(20),
    whatsapp1 VARCHAR(20),
    whatsapp2 VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    business_nature VARCHAR(255),
    classifications VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    salesman VARCHAR(255),
    account_opening_date DATE,
    general_notes TEXT,
    movement_notes TEXT,
    api_number VARCHAR(50),
    attachments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول الموردين
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE,
    supplier_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile1 VARCHAR(20),
    mobile2 VARCHAR(20),
    whatsapp1 VARCHAR(20),
    whatsapp2 VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    business_nature VARCHAR(255),
    classifications VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    salesman VARCHAR(255),
    account_opening_date DATE,
    general_notes TEXT,
    movement_notes TEXT,
    api_number VARCHAR(50),
    web_username VARCHAR(100),
    web_password VARCHAR(255),
    attachments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول المنتجات
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    barcode VARCHAR(100),
    category VARCHAR(255),
    product_type VARCHAR(100),
    main_unit VARCHAR(50),
    secondary_unit VARCHAR(50),
    conversion_factor DECIMAL(10,4) DEFAULT 1,
    manufacturer_number VARCHAR(100),
    original_number VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'USD',
    last_purchase_price DECIMAL(15,4),
    order_quantity DECIMAL(10,2),
    max_quantity DECIMAL(10,2),
    has_colors BOOLEAN DEFAULT false,
    attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_batch BOOLEAN DEFAULT false,
    has_expiry BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'active',
    classifications VARCHAR(255),
    general_notes TEXT,
    product_image TEXT,
    attachments TEXT,
    entry_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول مجموعات الأصناف
CREATE TABLE IF NOT EXISTS item_groups (
    id SERIAL PRIMARY KEY,
    group_number VARCHAR(50) UNIQUE,
    group_name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_group_id INTEGER REFERENCES item_groups(id),
    organization_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول مخزون المنتجات
CREATE TABLE IF NOT EXISTS product_stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    organization_id INTEGER,
    current_stock DECIMAL(15,4) DEFAULT 0,
    available_stock DECIMAL(15,4) DEFAULT 0,
    reserved_stock DECIMAL(15,4) DEFAULT 0,
    reorder_level DECIMAL(15,4) DEFAULT 0,
    max_stock_level DECIMAL(15,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول معاملات المخزون
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    organization_id INTEGER,
    transaction_type VARCHAR(50), -- 'in', 'out', 'adjustment'
    quantity DECIMAL(15,4),
    unit_cost DECIMAL(15,4),
    reference_type VARCHAR(100), -- 'purchase_order', 'sales_order', 'adjustment'
    reference_id INTEGER,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول طلبيات المبيعات
CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE,
    invoice_number VARCHAR(50),
    barcode VARCHAR(100),
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(255),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_datetime TIMESTAMP,
    salesman VARCHAR(255),
    currency_code VARCHAR(10) DEFAULT 'USD',
    currency_name VARCHAR(50),
    exchange_rate DECIMAL(10,4) DEFAULT 1,
    total_amount DECIMAL(15,4),
    order_status VARCHAR(50) DEFAULT 'pending',
    financial_status VARCHAR(50) DEFAULT 'unpaid',
    workflow_sequence_id INTEGER,
    manual_document VARCHAR(100),
    notes TEXT,
    attachments TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول عناصر طلبيات المبيعات
CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    sales_order_id INTEGER REFERENCES sales_orders(id),
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    quantity DECIMAL(10,2),
    delivered_quantity DECIMAL(10,2) DEFAULT 0,
    bonus_quantity DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(50),
    unit_price DECIMAL(15,4),
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    total_price DECIMAL(15,4),
    warehouse VARCHAR(100),
    batch_number VARCHAR(100),
    expiry_date DATE,
    item_status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول طلبيات المشتريات
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name VARCHAR(255),
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    salesman VARCHAR(255),
    currency_code VARCHAR(10) DEFAULT 'USD',
    currency_name VARCHAR(50),
    exchange_rate DECIMAL(10,4) DEFAULT 1,
    total_amount DECIMAL(15,4),
    workflow_status VARCHAR(50) DEFAULT 'pending',
    workflow_sequence_id INTEGER,
    manual_document VARCHAR(100),
    notes TEXT,
    attachments TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول عناصر طلبيات المشتريات
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER REFERENCES purchase_orders(id),
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    quantity DECIMAL(10,2),
    received_quantity DECIMAL(10,2) DEFAULT 0,
    bonus_quantity DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(50),
    unit_price DECIMAL(15,4),
    total_price DECIMAL(15,4),
    warehouse VARCHAR(100),
    batch_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول أسعار الصرف
CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    currency_code VARCHAR(10) NOT NULL,
    currency_name VARCHAR(50),
    exchange_rate DECIMAL(10,4) NOT NULL,
    buy_rate DECIMAL(10,4),
    sell_rate DECIMAL(10,4),
    organization_id INTEGER,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- جدول الإعدادات العامة
CREATE TABLE IF NOT EXISTS general_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    category VARCHAR(100),
    setting_key VARCHAR(255) NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50),
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    company_name VARCHAR(255),
    company_name_en VARCHAR(255),
    company_address TEXT,
    company_phone VARCHAR(50),
    company_email VARCHAR(255),
    company_website VARCHAR(255),
    tax_number VARCHAR(100),
    commercial_register VARCHAR(100),
    default_currency VARCHAR(10) DEFAULT 'USD',
    language VARCHAR(10) DEFAULT 'ar',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(10) DEFAULT '24',
    fiscal_year_start DATE,
    auto_numbering BOOLEAN DEFAULT true,
    numbering_system VARCHAR(50) DEFAULT 'sequential',
    invoice_prefix VARCHAR(10) DEFAULT 'INV',
    order_prefix VARCHAR(10) DEFAULT 'ORD',
    purchase_prefix VARCHAR(10) DEFAULT 'PUR',
    paper_size VARCHAR(10) DEFAULT 'A4',
    print_logo BOOLEAN DEFAULT true,
    print_footer BOOLEAN DEFAULT true,
    default_printer VARCHAR(255),
    working_days JSONB DEFAULT '["sunday","monday","tuesday","wednesday","thursday"]',
    working_hours VARCHAR(50) DEFAULT '08:00-17:00',
    session_timeout INTEGER DEFAULT 30,
    password_policy VARCHAR(50) DEFAULT 'medium',
    two_factor_auth BOOLEAN DEFAULT false,
    audit_log BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول إعدادات المستخدمين
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE,
    username VARCHAR(100),
    email VARCHAR(255),
    full_name VARCHAR(255),
    phone VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(100),
    department VARCHAR(100),
    permissions JSONB,
    language VARCHAR(10) DEFAULT 'ar',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(10) DEFAULT '24',
    theme_preference VARCHAR(20) DEFAULT 'light',
    sidebar_collapsed BOOLEAN DEFAULT false,
    dashboard_layout JSONB,
    notifications_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    password_hash VARCHAR(255),
    last_login TIMESTAMP,
    organization_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول إعدادات الطباعة
CREATE TABLE IF NOT EXISTS print_settings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,
    paper_size VARCHAR(10) DEFAULT 'A4',
    orientation VARCHAR(20) DEFAULT 'portrait',
    margin_top DECIMAL(5,2) DEFAULT 1.0,
    margin_bottom DECIMAL(5,2) DEFAULT 1.0,
    margin_left DECIMAL(5,2) DEFAULT 1.0,
    margin_right DECIMAL(5,2) DEFAULT 1.0,
    font_family VARCHAR(100) DEFAULT 'Arial',
    font_size INTEGER DEFAULT 12,
    primary_color VARCHAR(7) DEFAULT '#000000',
    secondary_color VARCHAR(7) DEFAULT '#666666',
    use_colors BOOLEAN DEFAULT false,
    show_logo BOOLEAN DEFAULT true,
    logo_position VARCHAR(20) DEFAULT 'top-left',
    logo_size VARCHAR(20) DEFAULT 'medium',
    show_header BOOLEAN DEFAULT true,
    header_text TEXT,
    show_footer BOOLEAN DEFAULT true,
    footer_text TEXT,
    show_company_info BOOLEAN DEFAULT true,
    show_bank_details BOOLEAN DEFAULT false,
    show_payment_terms BOOLEAN DEFAULT true,
    show_page_numbers BOOLEAN DEFAULT true,
    show_print_date BOOLEAN DEFAULT true,
    invoice_template VARCHAR(50) DEFAULT 'standard',
    auto_print BOOLEAN DEFAULT false,
    print_copies INTEGER DEFAULT 1,
    default_printer VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول إعدادات الثيم
CREATE TABLE IF NOT EXISTS theme_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    theme_name VARCHAR(100) DEFAULT 'default',
    primary_color VARCHAR(7) DEFAULT '#3b82f6',
    secondary_color VARCHAR(7) DEFAULT '#64748b',
    accent_color VARCHAR(7) DEFAULT '#10b981',
    background_color VARCHAR(7) DEFAULT '#ffffff',
    text_color VARCHAR(7) DEFAULT '#1f2937',
    font_family VARCHAR(100) DEFAULT 'Inter',
    font_size INTEGER DEFAULT 14,
    font_weight INTEGER DEFAULT 400,
    line_height DECIMAL(3,2) DEFAULT 1.5,
    letter_spacing DECIMAL(3,2) DEFAULT 0.0,
    border_radius INTEGER DEFAULT 6,
    sidebar_width INTEGER DEFAULT 280,
    header_height INTEGER DEFAULT 64,
    dark_mode BOOLEAN DEFAULT false,
    rtl_support BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جداول سير العمل (Workflow)
CREATE TABLE IF NOT EXISTS workflow_stages (
    id SERIAL PRIMARY KEY,
    stage_code VARCHAR(50) UNIQUE,
    stage_name VARCHAR(255) NOT NULL,
    stage_name_en VARCHAR(255),
    description TEXT,
    stage_type VARCHAR(50) DEFAULT 'manual',
    stage_color VARCHAR(7) DEFAULT '#3b82f6',
    icon_name VARCHAR(100),
    requires_approval BOOLEAN DEFAULT false,
    auto_advance BOOLEAN DEFAULT false,
    max_duration_hours INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_sequences (
    id SERIAL PRIMARY KEY,
    sequence_name VARCHAR(255) NOT NULL,
    sequence_type VARCHAR(100), -- 'sales_order', 'purchase_order'
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_sequence_steps (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER REFERENCES workflow_sequences(id),
    stage_id INTEGER REFERENCES workflow_stages(id),
    step_order INTEGER NOT NULL,
    next_stage_id INTEGER REFERENCES workflow_stages(id),
    alternative_stage_id INTEGER REFERENCES workflow_stages(id),
    conditions TEXT,
    is_optional BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول سجل سير العمل
CREATE TABLE IF NOT EXISTS workflow_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    order_number VARCHAR(50),
    order_type VARCHAR(50),
    sequence_id INTEGER,
    from_stage_id INTEGER,
    from_stage_name VARCHAR(255),
    to_stage_id INTEGER,
    to_stage_name VARCHAR(255),
    action_type VARCHAR(50),
    performed_by_user INTEGER,
    performed_by_username VARCHAR(255),
    performed_by_department VARCHAR(255),
    duration_in_previous_stage INTERVAL,
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- جدول حالة سير العمل للطلبيات
CREATE TABLE IF NOT EXISTS order_workflow_status (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    order_number VARCHAR(50),
    order_type VARCHAR(50),
    sequence_id INTEGER,
    current_stage_id INTEGER,
    current_step_order INTEGER,
    assigned_to_user INTEGER,
    assigned_to_department VARCHAR(255),
    stage_start_time TIMESTAMP,
    expected_completion_time TIMESTAMP,
    priority_level VARCHAR(50) DEFAULT 'normal',
    is_overdue BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- جداول إضافية للنظام
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    failure_reason VARCHAR(255),
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    reset_code VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    organization_id INTEGER,
    invitation_token VARCHAR(255) UNIQUE,
    invited_by INTEGER,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    role_id VARCHAR(255),
    assigned_by VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_id VARCHAR(255) UNIQUE,
    level VARCHAR(20) DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_id VARCHAR(255),
    user_agent TEXT,
    context JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء الفهارس للأداء
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_order ON workflow_history(order_id);

-- إنشاء Views مفيدة
CREATE OR REPLACE VIEW item_groups_with_count AS
SELECT 
    ig.*,
    COUNT(p.id) as product_count
FROM item_groups ig
LEFT JOIN products p ON p.category = ig.group_name
GROUP BY ig.id, ig.group_number, ig.group_name, ig.description, 
         ig.parent_group_id, ig.organization_id, ig.is_active, 
         ig.created_at, ig.updated_at;

-- إضافة بيانات أساسية
INSERT INTO workflow_stages (stage_code, stage_name, stage_name_en, description, stage_color) VALUES
('draft', 'مسودة', 'Draft', 'طلبية في مرحلة المسودة', '#6b7280'),
('pending', 'في الانتظار', 'Pending', 'طلبية في انتظار المراجعة', '#f59e0b'),
('approved', 'معتمدة', 'Approved', 'طلبية معتمدة', '#10b981'),
('processing', 'قيد التنفيذ', 'Processing', 'طلبية قيد التنفيذ', '#3b82f6'),
('shipped', 'تم الشحن', 'Shipped', 'طلبية تم شحنها', '#8b5cf6'),
('delivered', 'تم التسليم', 'Delivered', 'طلبية تم تسليمها', '#059669'),
('cancelled', 'ملغية', 'Cancelled', 'طلبية ملغية', '#dc2626'),
('returned', 'مرتجعة', 'Returned', 'طلبية مرتجعة', '#f97316')
ON CONFLICT (stage_code) DO NOTHING;

INSERT INTO exchange_rates (currency_code, currency_name, exchange_rate, buy_rate, sell_rate) VALUES
('USD', 'دولار أمريكي', 1.0000, 1.0000, 1.0000),
('EUR', 'يورو', 0.8500, 0.8450, 0.8550),
('SAR', 'ريال سعودي', 3.7500, 3.7400, 3.7600),
('AED', 'درهم إماراتي', 3.6700, 3.6600, 3.6800),
('KWD', 'دينار كويتي', 0.3000, 0.2990, 0.3010),
('QAR', 'ريال قطري', 3.6400, 3.6300, 3.6500)
ON CONFLICT (currency_code) DO NOTHING;

-- إضافة إعدادات النظام الافتراضية
INSERT INTO system_settings (
    organization_id, company_name, company_name_en, default_currency, 
    language, timezone, auto_numbering, audit_log
) VALUES (
    1, 'شركة النظام المتكامل', 'Integrated System Company', 'USD',
    'ar', 'Asia/Riyadh', true, true
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE customers IS 'جدول العملاء - يحتوي على معلومات العملاء الأساسية';
COMMENT ON TABLE suppliers IS 'جدول الموردين - يحتوي على معلومات الموردين';
COMMENT ON TABLE products IS 'جدول المنتجات - يحتوي على معلومات المنتجات والأصناف';
COMMENT ON TABLE sales_orders IS 'جدول طلبيات المبيعات';
COMMENT ON TABLE purchase_orders IS 'جدول طلبيات المشتريات';
COMMENT ON TABLE audit_logs IS 'جدول سجلات التدقيق - يتتبع جميع العمليات في النظام';
