-- ═══════════════════════════════════════════════════════════════════════════
-- سكريبت شامل لإنشاء قاعدة بيانات نظام ERP كاملة
-- Complete Database Setup Script for ERP System
-- ═══════════════════════════════════════════════════════════════════════════
-- يحتوي هذا السكريبت على:
-- 1. إنشاء جميع الجداول (69 جدول)
-- 2. إنشاء الفهارس والـ triggers
-- 3. إدخال بيانات تجريبية أساسية
-- ═══════════════════════════════════════════════════════════════════════════

\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'بدء إنشاء قاعدة البيانات الكاملة...'
\echo 'Starting Complete Database Setup...'
\echo '═══════════════════════════════════════════════════════════════════════════'

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: إنشاء الأنواع المخصصة (Custom Types)
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إنشاء الأنواع المخصصة...'

DO $$ BEGIN
    CREATE TYPE lot_status_enum AS ENUM ('active', 'expired', 'damaged', 'recalled', 'quarantine');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: إنشاء الدوال المساعدة (Helper Functions)
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إنشاء الدوال المساعدة...'

-- دالة تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: الجداول الأساسية (Core Tables)
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إنشاء الجداول الأساسية...'

-- 1. system_settings - إعدادات النظام
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    company_name VARCHAR(200),
    company_name_en VARCHAR(200),
    company_address TEXT,
    company_phone VARCHAR(50),
    company_email VARCHAR(100),
    company_website VARCHAR(200),
    tax_number VARCHAR(50),
    commercial_register VARCHAR(50),
    default_currency VARCHAR(10) DEFAULT 'SAR',
    language VARCHAR(10) DEFAULT 'ar',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(10) DEFAULT '24H',
    auto_numbering BOOLEAN DEFAULT true,
    numbering_system VARCHAR(20) DEFAULT 'AUTO',
    customer_prefix VARCHAR(10) DEFAULT 'CUST',
    customer_start INTEGER DEFAULT 1,
    supplier_prefix VARCHAR(10) DEFAULT 'SUPP',
    supplier_start INTEGER DEFAULT 1,
    item_prefix VARCHAR(10) DEFAULT 'PROD',
    item_start INTEGER DEFAULT 1,
    item_group_prefix VARCHAR(10) DEFAULT 'GRP',
    item_group_start INTEGER DEFAULT 1,
    order_prefix VARCHAR(10) DEFAULT 'SO-',
    order_start INTEGER DEFAULT 1,
    invoice_prefix VARCHAR(10) DEFAULT 'INV-',
    invoice_start INTEGER DEFAULT 1,
    purchase_prefix VARCHAR(10) DEFAULT 'PO-',
    purchase_start INTEGER DEFAULT 1,
    session_timeout INTEGER DEFAULT 30,
    two_factor_auth BOOLEAN DEFAULT false,
    audit_log BOOLEAN DEFAULT true,
    print_logo BOOLEAN DEFAULT true,
    print_footer BOOLEAN DEFAULT true,
    fiscal_year_start DATE DEFAULT '2024-01-01',
    working_hours VARCHAR(50) DEFAULT '08:00-17:00',
    working_days JSONB DEFAULT '{"sunday": true, "monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": false, "saturday": false}',
    paper_size VARCHAR(10) DEFAULT 'A4',
    default_printer VARCHAR(100),
    password_policy VARCHAR(20) DEFAULT 'MEDIUM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. user_settings - إعدادات المستخدمين
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    department VARCHAR(50),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{}',
    language VARCHAR(10) DEFAULT 'ar',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    theme_preference VARCHAR(20) DEFAULT 'light',
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(10) DEFAULT '24H',
    sidebar_collapsed BOOLEAN DEFAULT false,
    dashboard_layout JSONB DEFAULT '{}',
    avatar_url TEXT,
    last_login TIMESTAMP,
    organization_id INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. customers - العملاء
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    mobile1 VARCHAR(20),
    mobile2 VARCHAR(20),
    whatsapp1 VARCHAR(20),
    whatsapp2 VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    business_nature VARCHAR(100),
    classifications VARCHAR(50),
    status VARCHAR(20) DEFAULT 'نشط',
    salesman VARCHAR(50),
    account_opening_date DATE DEFAULT CURRENT_DATE,
    api_number VARCHAR(100),
    tax_number VARCHAR(50),
    commercial_registration VARCHAR(50),
    credit_limit NUMERIC(12,2) DEFAULT 0,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    payment_terms VARCHAR(50),
    general_notes TEXT,
    movement_notes TEXT,
    attachments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. suppliers - الموردين
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(20) UNIQUE NOT NULL,
    supplier_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    mobile1 VARCHAR(20),
    mobile2 VARCHAR(20),
    whatsapp1 VARCHAR(20),
    whatsapp2 VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    business_nature VARCHAR(100),
    classifications VARCHAR(50),
    status VARCHAR(20) DEFAULT 'نشط',
    salesman VARCHAR(50),
    account_opening_date DATE DEFAULT CURRENT_DATE,
    api_number VARCHAR(100),
    web_username VARCHAR(50),
    web_password VARCHAR(255),
    general_notes TEXT,
    movement_notes TEXT,
    attachments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. item_groups - مجموعات الأصناف
CREATE TABLE IF NOT EXISTS item_groups (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    group_code VARCHAR(20) UNIQUE NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_group_id INTEGER REFERENCES item_groups(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. products - المنتجات
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(20) UNIQUE NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    product_name_en VARCHAR(100),
    description TEXT,
    barcode VARCHAR(50),
    category VARCHAR(50),
    subcategory VARCHAR(50),
    product_type VARCHAR(20) DEFAULT 'منتج',
    status VARCHAR(20) DEFAULT 'نشط',
    manufacturer_number VARCHAR(50),
    original_number VARCHAR(50),
    main_unit VARCHAR(20) DEFAULT 'قطعة',
    secondary_unit VARCHAR(20),
    conversion_factor NUMERIC(10,4) DEFAULT 1,
    currency VARCHAR(10) DEFAULT 'SAR',
    last_purchase_price NUMERIC(10,2),
    average_cost NUMERIC(10,2),
    selling_price NUMERIC(10,2),
    wholesale_price NUMERIC(10,2),
    retail_price NUMERIC(10,2),
    min_stock_level NUMERIC(10,2) DEFAULT 0,
    max_stock_level NUMERIC(10,2) DEFAULT 0,
    reorder_point NUMERIC(10,2) DEFAULT 0,
    max_quantity NUMERIC(10,2),
    order_quantity NUMERIC(10,2),
    has_expiry BOOLEAN DEFAULT false,
    has_batch BOOLEAN DEFAULT false,
    has_colors BOOLEAN DEFAULT false,
    attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
    serial_tracking BOOLEAN DEFAULT false,
    batch_tracking BOOLEAN DEFAULT false,
    expiry_tracking BOOLEAN DEFAULT false,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_code VARCHAR(20),
    supplier_name VARCHAR(100),
    classifications VARCHAR(50),
    brand VARCHAR(50),
    manufacturer VARCHAR(100),
    model VARCHAR(50),
    size VARCHAR(20),
    color VARCHAR(20),
    weight NUMERIC(10,2),
    dimensions VARCHAR(50),
    material VARCHAR(50),
    country_of_origin VARCHAR(50),
    warranty_period INTEGER,
    shelf_life INTEGER,
    tax_rate NUMERIC(5,2) DEFAULT 15,
    discount_rate NUMERIC(5,2) DEFAULT 0,
    product_image TEXT,
    image_url TEXT,
    attachments TEXT,
    location VARCHAR(50),
    notes TEXT,
    general_notes TEXT,
    entry_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. warehouses - المخازن
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_code VARCHAR(20) UNIQUE NOT NULL,
    warehouse_name VARCHAR(100) NOT NULL,
    warehouse_name_en VARCHAR(100),
    location VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. product_warehouses - مواقع المنتجات في المخازن
CREATE TABLE IF NOT EXISTS product_warehouses (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INTEGER REFERENCES warehouses(id),
    floor VARCHAR(20),
    area VARCHAR(20),
    shelf VARCHAR(20),
    quantity NUMERIC(10,2) DEFAULT 0,
    reserved_quantity NUMERIC(10,2) DEFAULT 0,
    min_stock_level NUMERIC(10,2) DEFAULT 0,
    max_stock_level NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. product_stock - مخزون المنتجات
CREATE TABLE IF NOT EXISTS product_stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    organization_id INTEGER DEFAULT 1,
    current_stock NUMERIC(10,2) DEFAULT 0,
    available_stock NUMERIC(10,2) DEFAULT 0,
    reserved_stock NUMERIC(10,2) DEFAULT 0,
    reorder_level NUMERIC(10,2) DEFAULT 0,
    max_stock_level NUMERIC(10,2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. product_lots - دفعات المنتجات
CREATE TABLE IF NOT EXISTS product_lots (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    lot_number VARCHAR(50) NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    purchase_order_id INTEGER,
    manufacturing_date DATE,
    expiry_date DATE,
    initial_quantity NUMERIC(10,2) NOT NULL,
    current_quantity NUMERIC(10,2) NOT NULL,
    available_quantity NUMERIC(10,2) NOT NULL,
    reserved_quantity NUMERIC(10,2) DEFAULT 0,
    unit_cost NUMERIC(10,2),
    status lot_status_enum DEFAULT 'active',
    status_changed_at TIMESTAMP,
    status_changed_by VARCHAR(50),
    status_notes TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. workflow_stages - مراحل سير العمل
CREATE TABLE IF NOT EXISTS workflow_stages (
    id SERIAL PRIMARY KEY,
    stage_code VARCHAR(20) UNIQUE NOT NULL,
    stage_name VARCHAR(100) NOT NULL,
    stage_name_en VARCHAR(100),
    description TEXT,
    stage_type VARCHAR(20) NOT NULL,
    requires_approval BOOLEAN DEFAULT false,
    auto_advance BOOLEAN DEFAULT false,
    max_duration_hours INTEGER,
    stage_color VARCHAR(20),
    icon_name VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. workflow_sequences - تسلسلات سير العمل
CREATE TABLE IF NOT EXISTS workflow_sequences (
    id SERIAL PRIMARY KEY,
    sequence_name VARCHAR(100) NOT NULL,
    sequence_type VARCHAR(20) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. workflow_sequence_steps - خطوات تسلسل سير العمل
CREATE TABLE IF NOT EXISTS workflow_sequence_steps (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER REFERENCES workflow_sequences(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES workflow_stages(id),
    step_order INTEGER NOT NULL,
    next_stage_id INTEGER REFERENCES workflow_stages(id),
    alternative_stage_id INTEGER REFERENCES workflow_stages(id),
    is_optional BOOLEAN DEFAULT false,
    conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. sales_orders - طلبيات المبيعات
CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(20) UNIQUE NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(100),
    salesman VARCHAR(50),
    currency_code VARCHAR(10) DEFAULT 'SAR',
    currency_name VARCHAR(50) DEFAULT 'ريال سعودي',
    exchange_rate NUMERIC(10,4) DEFAULT 1,
    manual_document VARCHAR(50),
    invoice_number VARCHAR(50),
    barcode VARCHAR(50),
    order_status VARCHAR(50),
    financial_status VARCHAR(50),
    delivery_datetime TIMESTAMP,
    total_amount NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    attachments TEXT,
    workflow_sequence_id INTEGER REFERENCES workflow_sequences(id),
    order_source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. sales_order_items - عناصر طلبيات المبيعات
CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(20),
    product_name VARCHAR(100),
    barcode VARCHAR(50),
    quantity NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20),
    unit_price NUMERIC(10,2),
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    total_price NUMERIC(12,2),
    delivered_quantity NUMERIC(10,2) DEFAULT 0,
    bonus_quantity NUMERIC(10,2) DEFAULT 0,
    warehouse VARCHAR(50),
    batch_number VARCHAR(50),
    expiry_date DATE,
    lot_id INTEGER REFERENCES product_lots(id),
    item_status VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. purchase_orders - طلبيات الشراء
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(20) UNIQUE NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name VARCHAR(100),
    salesman VARCHAR(50),
    currency_code VARCHAR(10) DEFAULT 'SAR',
    currency_name VARCHAR(50) DEFAULT 'ريال سعودي',
    exchange_rate NUMERIC(10,4) DEFAULT 1,
    manual_document VARCHAR(50),
    expected_delivery_date DATE,
    workflow_status VARCHAR(50),
    total_amount NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    attachments TEXT,
    workflow_sequence_id INTEGER REFERENCES workflow_sequences(id),
    order_source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. purchase_order_items - عناصر طلبيات الشراء
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(20),
    product_name VARCHAR(100),
    barcode VARCHAR(50),
    quantity NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20),
    unit_price NUMERIC(10,2),
    total_price NUMERIC(12,2),
    received_quantity NUMERIC(10,2) DEFAULT 0,
    bonus_quantity NUMERIC(10,2) DEFAULT 0,
    warehouse VARCHAR(50),
    batch_number VARCHAR(50),
    expiry_date DATE,
    lot_id INTEGER REFERENCES product_lots(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. order_workflow_status - حالة سير العمل للطلبيات
CREATE TABLE IF NOT EXISTS order_workflow_status (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    order_number VARCHAR(20) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    current_stage_id INTEGER REFERENCES workflow_stages(id),
    current_step_order INTEGER,
    assigned_to_user INTEGER,
    assigned_to_department VARCHAR(50),
    priority_level VARCHAR(20),
    sequence_id INTEGER REFERENCES workflow_sequences(id),
    stage_start_time TIMESTAMP,
    expected_completion_time TIMESTAMP,
    is_overdue BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. workflow_history - تاريخ سير العمل
CREATE TABLE IF NOT EXISTS workflow_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    order_number VARCHAR(20) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    sequence_id INTEGER REFERENCES workflow_sequences(id),
    from_stage_id INTEGER REFERENCES workflow_stages(id),
    to_stage_id INTEGER REFERENCES workflow_stages(id),
    from_stage_name VARCHAR(100),
    to_stage_name VARCHAR(100),
    action_type VARCHAR(50),
    performed_by_user INTEGER,
    performed_by_username VARCHAR(50),
    performed_by_department VARCHAR(50),
    duration_in_previous_stage INTERVAL,
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. inventory_transactions - حركات المخزون
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    transaction_type VARCHAR(50) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    unit_cost NUMERIC(10,2),
    reference_type VARCHAR(50),
    reference_id INTEGER,
    notes TEXT,
    created_by VARCHAR(50),
    organization_id INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. lot_transactions - حركات الدفعات
CREATE TABLE IF NOT EXISTS lot_transactions (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES product_lots(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    unit_cost NUMERIC(10,2),
    reference_type VARCHAR(50),
    reference_id INTEGER,
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 22. exchange_rates - أسعار الصرف
CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    currency_code VARCHAR(10) NOT NULL,
    currency_name VARCHAR(50) NOT NULL,
    exchange_rate NUMERIC(10,4) NOT NULL,
    buy_rate NUMERIC(10,4),
    sell_rate NUMERIC(10,4),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23. units - الوحدات
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    unit_code VARCHAR(20) UNIQUE NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    unit_name_en VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 24. theme_settings - إعدادات المظهر
CREATE TABLE IF NOT EXISTS theme_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    user_id VARCHAR(50),
    theme_name VARCHAR(50),
    primary_color VARCHAR(20),
    secondary_color VARCHAR(20),
    accent_color VARCHAR(20),
    background_color VARCHAR(20),
    text_color VARCHAR(20),
    font_family VARCHAR(50),
    font_size INTEGER DEFAULT 14,
    font_weight INTEGER DEFAULT 400,
    line_height NUMERIC(3,2) DEFAULT 1.5,
    letter_spacing NUMERIC(4,3) DEFAULT 0.025,
    border_radius INTEGER DEFAULT 8,
    header_height INTEGER DEFAULT 64,
    sidebar_width INTEGER DEFAULT 256,
    dark_mode BOOLEAN DEFAULT false,
    rtl_support BOOLEAN DEFAULT true,
    compact_mode BOOLEAN DEFAULT false,
    high_contrast BOOLEAN DEFAULT false,
    animation_speed VARCHAR(20) DEFAULT 'normal',
    button_style VARCHAR(20) DEFAULT 'rounded',
    card_style VARCHAR(20) DEFAULT 'elevated',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 25. print_settings - إعدادات الطباعة
CREATE TABLE IF NOT EXISTS print_settings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER DEFAULT 1,
    paper_size VARCHAR(10) DEFAULT 'A4',
    orientation VARCHAR(20) DEFAULT 'portrait',
    font_family VARCHAR(50) DEFAULT 'Arial',
    font_size INTEGER DEFAULT 12,
    margin_top NUMERIC(5,2) DEFAULT 20,
    margin_bottom NUMERIC(5,2) DEFAULT 20,
    margin_left NUMERIC(5,2) DEFAULT 15,
    margin_right NUMERIC(5,2) DEFAULT 15,
    show_logo BOOLEAN DEFAULT true,
    logo_position VARCHAR(20) DEFAULT 'top-left',
    logo_size VARCHAR(20) DEFAULT 'medium',
    show_header BOOLEAN DEFAULT true,
    header_text TEXT,
    show_footer BOOLEAN DEFAULT true,
    footer_text TEXT,
    show_company_info BOOLEAN DEFAULT true,
    show_bank_details BOOLEAN DEFAULT true,
    show_payment_terms BOOLEAN DEFAULT true,
    show_page_numbers BOOLEAN DEFAULT true,
    show_print_date BOOLEAN DEFAULT true,
    use_colors BOOLEAN DEFAULT true,
    primary_color VARCHAR(20) DEFAULT '#2563eb',
    secondary_color VARCHAR(20) DEFAULT '#64748b',
    print_copies INTEGER DEFAULT 2,
    auto_print BOOLEAN DEFAULT false,
    default_printer VARCHAR(100),
    invoice_template VARCHAR(50) DEFAULT 'modern',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 26. general_settings - الإعدادات العامة
CREATE TABLE IF NOT EXISTS general_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    category VARCHAR(50) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, category, setting_key)
);

-- 27. workflow_settings - إعدادات سير العمل
CREATE TABLE IF NOT EXISTS workflow_settings (
    id SERIAL PRIMARY KEY,
    workflow_system_mandatory BOOLEAN DEFAULT true,
    send_notifications BOOLEAN DEFAULT true,
    track_time_in_stages BOOLEAN DEFAULT true,
    allow_skip_stages BOOLEAN DEFAULT false,
    allow_parallel_processing BOOLEAN DEFAULT false,
    require_approval_notes BOOLEAN DEFAULT true,
    require_rejection_reason BOOLEAN DEFAULT true,
    auto_assign_to_department BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 28. document_settings - إعدادات المستندات
CREATE TABLE IF NOT EXISTS document_settings (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    field_type VARCHAR(50),
    default_value TEXT,
    is_required BOOLEAN DEFAULT false,
    show_in_screen BOOLEAN DEFAULT true,
    show_in_print BOOLEAN DEFAULT true,
    display_order INTEGER,
    validation_rules TEXT,
    mandatory_batch BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 29. batch_settings - إعدادات الدفعات
CREATE TABLE IF NOT EXISTS batch_settings (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    mandatory_batch_selection BOOLEAN DEFAULT false,
    require_expiry_date BOOLEAN DEFAULT false,
    auto_select_fifo BOOLEAN DEFAULT true,
    allow_negative_stock BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 30. custom_roles - الأدوار المخصصة
CREATE TABLE IF NOT EXISTS custom_roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    description TEXT,
    permissions JSONB DEFAULT '{}',
    hierarchy INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 31. user_role_assignments - تعيين الأدوار للمستخدمين
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    role_id VARCHAR(50) REFERENCES custom_roles(id),
    assigned_by VARCHAR(50),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- 32. audit_logs - سجل التدقيق
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    user_name VARCHAR(100),
    session_id VARCHAR(100),
    module VARCHAR(50),
    action VARCHAR(50),
    status VARCHAR(20),
    old_values JSONB,
    new_values JSONB,
    affected_records JSONB,
    details TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 33. error_logs - سجل الأخطاء
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_id VARCHAR(100) UNIQUE,
    level VARCHAR(20) DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    context JSONB,
    user_id VARCHAR(50),
    url TEXT,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 34. failed_login_attempts - محاولات تسجيل الدخول الفاشلة
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    failure_reason VARCHAR(100),
    attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 35. password_reset_requests - طلبات إعادة تعيين كلمة المرور
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    reset_code VARCHAR(10) NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 36. user_favorites - المفضلات
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    favorite_type VARCHAR(50) NOT NULL,
    favorite_name VARCHAR(100) NOT NULL,
    favorite_title VARCHAR(100),
    favorite_component VARCHAR(100),
    favorite_icon VARCHAR(50),
    favorite_color VARCHAR(20),
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 37. organization_activity_log - سجل أنشطة المنظمة
CREATE TABLE IF NOT EXISTS organization_activity_log (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    user_id INTEGER,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 38. message_templates - قوالب الرسائل
CREATE TABLE IF NOT EXISTS message_templates (
    id SERIAL PRIMARY KEY,
    template_code VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    template_category VARCHAR(50),
    message_content TEXT NOT NULL,
    variables JSONB,
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 39. scheduled_messages - الرسائل المجدولة
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES message_templates(id),
    recipient_type VARCHAR(50) NOT NULL,
    recipient_phones JSONB NOT NULL,
    message_content TEXT NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    repeat_type VARCHAR(20),
    repeat_until DATE,
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 40. whatsapp_notification_settings - إعدادات إشعارات واتساب
CREATE TABLE IF NOT EXISTS whatsapp_notification_settings (
    id SERIAL PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT true,
    phone_numbers JSONB,
    notification_threshold VARCHAR(50),
    message_template TEXT,
    send_daily_summary BOOLEAN DEFAULT false,
    daily_summary_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 41. whatsapp_notification_log - سجل إشعارات واتساب
CREATE TABLE IF NOT EXISTS whatsapp_notification_log (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(20),
    product_name VARCHAR(100),
    phone_number VARCHAR(20),
    message_content TEXT,
    status VARCHAR(20),
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 42. customer_notification_settings - إعدادات إشعارات العملاء
CREATE TABLE IF NOT EXISTS customer_notification_settings (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    notification_method VARCHAR(20) DEFAULT 'whatsapp',
    preferred_phone VARCHAR(20),
    notify_on_received BOOLEAN DEFAULT true,
    notify_on_preparing BOOLEAN DEFAULT true,
    notify_on_quality_check BOOLEAN DEFAULT false,
    notify_on_ready_to_ship BOOLEAN DEFAULT true,
    notify_on_shipped BOOLEAN DEFAULT true,
    notify_on_delivered BOOLEAN DEFAULT true,
    notify_on_cancelled BOOLEAN DEFAULT true,
    send_daily_summary BOOLEAN DEFAULT false,
    daily_summary_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 43. customer_notification_log - سجل إشعارات العملاء
CREATE TABLE IF NOT EXISTS customer_notification_log (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    order_id INTEGER,
    order_number VARCHAR(20),
    notification_type VARCHAR(50),
    notification_method VARCHAR(20),
    phone_number VARCHAR(20),
    message_content TEXT,
    status VARCHAR(20),
    error_message TEXT,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    provider_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 44. notifications - الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    message TEXT NOT NULL,
    recipient_user_id INTEGER,
    recipient_role VARCHAR(50),
    recipient_department VARCHAR(50),
    priority_level VARCHAR(20) DEFAULT 'normal',
    related_order_id INTEGER,
    related_order_number VARCHAR(20),
    related_order_type VARCHAR(20),
    stage_id INTEGER REFERENCES workflow_stages(id),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    scheduled_send_time TIMESTAMP,
    send_email BOOLEAN DEFAULT false,
    send_sms BOOLEAN DEFAULT false,
    send_whatsapp BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 45. notification_templates - قوالب الإشعارات
CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    template_code VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title_template TEXT,
    message_template TEXT NOT NULL,
    send_email BOOLEAN DEFAULT false,
    send_sms BOOLEAN DEFAULT false,
    send_whatsapp BOOLEAN DEFAULT false,
    default_priority VARCHAR(20) DEFAULT 'normal',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 46. notification_rules - قواعد الإشعارات
CREATE TABLE IF NOT EXISTS notification_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    trigger_condition TEXT,
    target_stage_id INTEGER REFERENCES workflow_stages(id),
    target_role VARCHAR(50),
    target_department VARCHAR(50),
    template_code VARCHAR(50),
    hours_delay INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 47. workflow_notifications - إشعارات سير العمل
CREATE TABLE IF NOT EXISTS workflow_notifications (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES workflow_stages(id),
    notification_type VARCHAR(50) NOT NULL,
    notification_method VARCHAR(20) NOT NULL,
    recipient_type VARCHAR(50) NOT NULL,
    recipient_identifier VARCHAR(100),
    message_template TEXT,
    delay_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 48. stage_flexibility_settings - إعدادات مرونة المراحل
CREATE TABLE IF NOT EXISTS stage_flexibility_settings (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE CASCADE,
    is_optional BOOLEAN DEFAULT false,
    can_skip BOOLEAN DEFAULT false,
    skip_conditions TEXT,
    requires_approval BOOLEAN DEFAULT false,
    requires_previous_approval BOOLEAN DEFAULT false,
    max_duration_hours INTEGER,
    warning_hours INTEGER,
    escalation_hours INTEGER,
    escalation_to_department VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 49. workflow_stage_departments - أقسام مراحل سير العمل
CREATE TABLE IF NOT EXISTS workflow_stage_departments (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE CASCADE,
    department_name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 50. department_stages - مراحل الأقسام
CREATE TABLE IF NOT EXISTS department_stages (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES workflow_stages(id),
    department_name VARCHAR(50) NOT NULL,
    can_initiate BOOLEAN DEFAULT false,
    can_approve BOOLEAN DEFAULT false,
    can_reject BOOLEAN DEFAULT false,
    is_default_stage BOOLEAN DEFAULT false,
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 51. employee_stages - مراحل الموظفين
CREATE TABLE IF NOT EXISTS employee_stages (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES workflow_stages(id),
    user_id INTEGER,
    username VARCHAR(50),
    department_name VARCHAR(50),
    can_approve BOOLEAN DEFAULT false,
    can_reject BOOLEAN DEFAULT false,
    can_reassign BOOLEAN DEFAULT false,
    is_primary_responsible BOOLEAN DEFAULT false,
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 52. cities - المدن
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 53. product_categories - فئات المنتجات
CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 54. customer_users - مستخدمي بوابة العملاء
CREATE TABLE IF NOT EXISTS customer_users (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 55. customer_sessions - جلسات العملاء
CREATE TABLE IF NOT EXISTS customer_sessions (
    id SERIAL PRIMARY KEY,
    customer_user_id INTEGER REFERENCES customer_users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 56. customer_permissions - صلاحيات العملاء
CREATE TABLE IF NOT EXISTS customer_permissions (
    id SERIAL PRIMARY KEY,
    customer_user_id INTEGER REFERENCES customer_users(id) ON DELETE CASCADE,
    can_view_orders BOOLEAN DEFAULT true,
    can_create_orders BOOLEAN DEFAULT false,
    can_view_products BOOLEAN DEFAULT true,
    can_view_prices BOOLEAN DEFAULT true,
    can_view_stock BOOLEAN DEFAULT false,
    can_view_balance BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 57. user_invitations - دعوات المستخدمين
CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER DEFAULT 1,
    email VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    invitation_token VARCHAR(100) UNIQUE NOT NULL,
    invited_by INTEGER,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 58. pervasive_settings - إعدادات Pervasive
CREATE TABLE IF NOT EXISTS pervasive_settings (
    id SERIAL PRIMARY KEY,
    connection_name VARCHAR(100) NOT NULL,
    connection_type VARCHAR(20) NOT NULL,
    odbc_dsn VARCHAR(100),
    odbc_driver VARCHAR(100),
    database_name VARCHAR(100),
    username VARCHAR(100),
    password_encrypted TEXT,
    connection_string TEXT,
    api_url VARCHAR(200),
    timeout_seconds INTEGER DEFAULT 30,
    max_retries INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    last_test_status VARCHAR(20),
    last_test_message TEXT,
    last_test_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 59. message_statistics - إحصائيات الرسائل
CREATE TABLE IF NOT EXISTS message_statistics (
    id SERIAL PRIMARY KEY,
    stat_date DATE NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_pending INTEGER DEFAULT 0,
    success_rate NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 60. inventory_notification_settings - إعدادات إشعارات المخزون
CREATE TABLE IF NOT EXISTS inventory_notification_settings (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    phone_numbers TEXT[],
    notification_threshold VARCHAR(50),
    message_template TEXT,
    send_daily_summary BOOLEAN DEFAULT false,
    daily_summary_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 61. inventory_notification_log - سجل إشعارات المخزون
CREATE TABLE IF NOT EXISTS inventory_notification_log (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(20),
    product_name VARCHAR(100),
    notification_type VARCHAR(50),
    phone_number VARCHAR(20),
    message_content TEXT,
    status VARCHAR(20),
    error_message TEXT,
    twilio_message_id VARCHAR(100),
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 62. product_warehouse_stock - مخزون المنتجات في المخازن
CREATE TABLE IF NOT EXISTS product_warehouse_stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    warehouse_name VARCHAR(100),
    location VARCHAR(100),
    batch_number VARCHAR(50),
    serial_number VARCHAR(50),
    manufacturing_date DATE,
    expiry_date DATE,
    actual_balance INTEGER DEFAULT 0,
    available_quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    inventory_value NUMERIC(12,2) DEFAULT 0,
    stock_status VARCHAR(20) DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

\echo 'تم إنشاء جميع الجداول بنجاح!'

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: إنشاء الفهارس (Indexes)
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إنشاء الفهارس...'

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_product_lots_number ON product_lots(lot_number);
CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_status ON product_lots(status);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_email ON user_settings(email);
CREATE INDEX IF NOT EXISTS idx_workflow_history_order ON workflow_history(order_id, order_type);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);

\echo 'تم إنشاء الفهارس بنجاح!'

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5: إنشاء الـ Triggers
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إنشاء الـ Triggers...'

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_item_groups_updated_at BEFORE UPDATE ON item_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_warehouses_updated_at BEFORE UPDATE ON product_warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_stock_updated_at BEFORE UPDATE ON product_stock FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_lots_updated_at BEFORE UPDATE ON product_lots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_stages_updated_at BEFORE UPDATE ON workflow_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_sequences_updated_at BEFORE UPDATE ON workflow_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_workflow_status_updated_at BEFORE UPDATE ON order_workflow_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_theme_settings_updated_at BEFORE UPDATE ON theme_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_print_settings_updated_at BEFORE UPDATE ON print_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_general_settings_updated_at BEFORE UPDATE ON general_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_settings_updated_at BEFORE UPDATE ON workflow_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_settings_updated_at BEFORE UPDATE ON document_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_batch_settings_updated_at BEFORE UPDATE ON batch_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_custom_roles_updated_at BEFORE UPDATE ON custom_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

\echo 'تم إنشاء الـ Triggers بنجاح!'

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6: إدخال البيانات التجريبية الأساسية
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'إدخال البيانات التجريبية...'

-- إدخال إعدادات النظام
INSERT INTO system_settings (organization_id, company_name, company_name_en, company_address, company_phone, company_email, default_currency, language, timezone)
VALUES (1, 'شركة الأنظمة المتقدمة', 'Advanced Systems Co.', 'الرياض، المملكة العربية السعودية', '+966-11-1234567', 'info@company.sa', 'SAR', 'ar', 'Asia/Riyadh')
ON CONFLICT DO NOTHING;

-- إدخال المستخدمين (كلمة المرور: admin123 مشفرة بـ SHA-256)
INSERT INTO user_settings (username, email, password_hash, full_name, role, department, is_active, permissions, organization_id)
VALUES 
('admin', 'admin@company.sa', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'مدير النظام', 'مدير عام', 'الإدارة', true, '{"all": true}', 1),
('sales_manager', 'sales@company.sa', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'مدير المبيعات', 'مدير مبيعات', 'المبيعات', true, '{"sales": {"read": true, "write": true}}', 1),
('warehouse_manager', 'warehouse@company.sa', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'مدير المخازن', 'مدير مخازن', 'المخازن', true, '{"inventory": {"read": true, "write": true}}', 1)
ON CONFLICT (username) DO NOTHING;

-- إدخال مجموعات الأصناف
INSERT INTO item_groups (organization_id, group_code, group_name, description, is_active)
VALUES 
(1, 'GRP001', 'الإلكترونيات', 'جميع المنتجات الإلكترونية', true),
(1, 'GRP002', 'الأجهزة المنزلية', 'أجهزة كهربائية منزلية', true),
(1, 'GRP003', 'الملابس', 'ملابس وأزياء', true)
ON CONFLICT (group_code) DO NOTHING;

-- إدخال المخازن
INSERT INTO warehouses (warehouse_code, warehouse_name, location, is_active)
VALUES 
('WH001', 'المخزن الرئيسي', 'الرياض', true),
('WH002', 'مخزن جدة', 'جدة', true),
('WH003', 'مخزن الدمام', 'الدمام', true)
ON CONFLICT (warehouse_code) DO NOTHING;

-- إدخال الوحدات
INSERT INTO units (unit_code, unit_name, unit_name_en, is_active)
VALUES 
('PCS', 'قطعة', 'Piece', true),
('BOX', 'علبة', 'Box', true),
('KG', 'كيلو', 'Kilogram', true),
('M', 'متر', 'Meter', true),
('L', 'لتر', 'Liter', true)
ON CONFLICT (unit_code) DO NOTHING;

-- إدخال أسعار الصرف
INSERT INTO exchange_rates (organization_id, currency_code, currency_name, exchange_rate, buy_rate, sell_rate)
VALUES 
(1, 'USD', 'دولار أمريكي', 3.75, 3.74, 3.76),
(1, 'EUR', 'يورو', 4.10, 4.08, 4.12),
(1, 'GBP', 'جنيه إسترليني', 4.75, 4.73, 4.77)
ON CONFLICT DO NOTHING;

-- إدخال مراحل سير العمل
INSERT INTO workflow_stages (stage_code, stage_name, stage_name_en, stage_type, requires_approval, stage_color, icon_name, is_active)
VALUES 
('DRAFT', 'مسودة', 'Draft', 'initial', false, '#6b7280', 'edit', true),
('REVIEW', 'مراجعة', 'Review', 'process', true, '#f59e0b', 'eye', true),
('APPROVE', 'اعتماد', 'Approval', 'approval', true, '#10b981', 'check', true),
('EXECUTE', 'تنفيذ', 'Execution', 'process', false, '#3b82f6', 'play', true),
('COMPLETE', 'مكتمل', 'Complete', 'final', false, '#059669', 'check-circle', true),
('CANCEL', 'ملغي', 'Cancelled', 'final', true, '#dc2626', 'x-circle', true)
ON CONFLICT (stage_code) DO NOTHING;

-- إدخال تسلسلات سير العمل
INSERT INTO workflow_sequences (sequence_name, sequence_type, description, is_default, is_active, created_by)
VALUES 
('تسلسل المبيعات الافتراضي', 'sales', 'تسلسل سير العمل الافتراضي لطلبيات المبيعات', true, true, 1),
('تسلسل المشتريات الافتراضي', 'purchase', 'تسلسل سير العمل الافتراضي لطلبيات المشتريات', true, true, 1)
ON CONFLICT DO NOTHING;

-- إدخال إعدادات سير العمل
INSERT INTO workflow_settings (workflow_system_mandatory, send_notifications, track_time_in_stages)
VALUES (true, true, true)
ON CONFLICT DO NOTHING;

-- إدخال إعدادات المظهر
INSERT INTO theme_settings (organization_id, theme_name, primary_color, secondary_color, accent_color, dark_mode, rtl_support)
VALUES (1, 'النمط الافتراضي', '#2563eb', '#64748b', '#10b981', false, true)
ON CONFLICT DO NOTHING;

\echo 'تم إدخال البيانات التجريبية بنجاح!'

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7: تحديث الإحصائيات
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'تحديث إحصائيات قاعدة البيانات...'

ANALYZE;

\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'تم إنشاء قاعدة البيانات بنجاح!'
\echo 'Database Setup Completed Successfully!'
\echo '═══════════════════════════════════════════════════════════════════════════'

-- عرض ملخص الجداول المنشأة
SELECT 
    'تم إنشاء ' || COUNT(*) || ' جدول بنجاح' as summary
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'ملاحظات مهمة:'
\echo '1. كلمة المرور الافتراضية لجميع المستخدمين: admin123'
\echo '2. يمكنك الآن البدء باستخدام النظام'
\echo '3. لإدخال المزيد من البيانات التجريبية، استخدم scripts/09-comprehensive-test-data.sql'
\echo '═══════════════════════════════════════════════════════════════════════════'
