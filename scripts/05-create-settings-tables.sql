-- إنشاء جداول الإعدادات
-- Settings Tables Creation Script

-- جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL DEFAULT 'شركة النظام المتكامل',
    company_address TEXT DEFAULT 'الرياض، المملكة العربية السعودية',
    company_phone VARCHAR(50) DEFAULT '+966501234567',
    company_email VARCHAR(100) DEFAULT 'info@company.com',
    company_website VARCHAR(100) DEFAULT 'www.company.com',
    tax_number VARCHAR(50) DEFAULT '123456789',
    commercial_register VARCHAR(50) DEFAULT 'CR123456789',
    numbering_system VARCHAR(20) DEFAULT 'auto' CHECK (numbering_system IN ('auto', 'manual')),
    invoice_prefix VARCHAR(10) DEFAULT 'INV',
    order_prefix VARCHAR(10) DEFAULT 'ORD',
    fiscal_year_start DATE DEFAULT '2024-01-01',
    default_currency VARCHAR(10) DEFAULT 'SAR',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول إعدادات المستخدمين
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
    department VARCHAR(100),
    permissions TEXT, -- JSON string of permissions
    language VARCHAR(10) DEFAULT 'ar',
    theme VARCHAR(20) DEFAULT 'light',
    notifications_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول إعدادات الطباعة
CREATE TABLE IF NOT EXISTS print_settings (
    id SERIAL PRIMARY KEY,
    setting_type VARCHAR(50) NOT NULL, -- 'documents' or 'reports'
    document_type VARCHAR(50) NOT NULL, -- 'invoice', 'order', 'receipt', etc.
    paper_size VARCHAR(20) DEFAULT 'A4',
    orientation VARCHAR(20) DEFAULT 'portrait',
    margins_top INTEGER DEFAULT 20,
    margins_bottom INTEGER DEFAULT 20,
    margins_left INTEGER DEFAULT 20,
    margins_right INTEGER DEFAULT 20,
    header_enabled BOOLEAN DEFAULT true,
    footer_enabled BOOLEAN DEFAULT true,
    logo_enabled BOOLEAN DEFAULT true,
    watermark_enabled BOOLEAN DEFAULT false,
    watermark_text VARCHAR(100),
    font_family VARCHAR(50) DEFAULT 'Arial',
    font_size INTEGER DEFAULT 12,
    line_spacing DECIMAL(3,1) DEFAULT 1.2,
    copies INTEGER DEFAULT 1,
    printer_name VARCHAR(100),
    auto_print BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- توافق مع قواعد بيانات قديمة: إضافة الأعمدة المطلوبة إذا كانت غير موجودة
ALTER TABLE print_settings
    ADD COLUMN IF NOT EXISTS setting_type VARCHAR(50);

ALTER TABLE print_settings
    ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);

ALTER TABLE print_settings
    ADD COLUMN IF NOT EXISTS paper_size VARCHAR(20) DEFAULT 'A4';

ALTER TABLE print_settings
    ADD COLUMN IF NOT EXISTS orientation VARCHAR(20) DEFAULT 'portrait';

UPDATE print_settings
SET setting_type = COALESCE(setting_type, 'documents')
WHERE setting_type IS NULL;

UPDATE print_settings
SET document_type = COALESCE(document_type, 'invoice')
WHERE document_type IS NULL;

-- جدول الإعدادات العامة
CREATE TABLE IF NOT EXISTS general_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    category VARCHAR(50) NOT NULL, -- 'system', 'ui', 'business', 'integration'
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- can be accessed by non-admin users
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول إعدادات API
CREATE TABLE IF NOT EXISTS api_settings (
    id SERIAL PRIMARY KEY,
    api_name VARCHAR(100) NOT NULL,
    api_url VARCHAR(255),
    api_key VARCHAR(255),
    api_secret VARCHAR(255),
    is_enabled BOOLEAN DEFAULT false,
    timeout_seconds INTEGER DEFAULT 30,
    retry_attempts INTEGER DEFAULT 3,
    rate_limit INTEGER DEFAULT 100, -- requests per minute
    webhook_url VARCHAR(255),
    webhook_secret VARCHAR(255),
    last_sync TIMESTAMP,
    sync_frequency VARCHAR(50) DEFAULT 'manual', -- 'manual', 'hourly', 'daily', 'weekly'
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إدراج البيانات الافتراضية

-- إعدادات النظام الافتراضية
INSERT INTO system_settings (id, company_name, company_address, company_phone, company_email) 
VALUES (1, 'شركة النظام المتكامل', 'الرياض، المملكة العربية السعودية', '+966501234567', 'info@company.com')
ON CONFLICT (id) DO NOTHING;

-- مستخدم افتراضي
INSERT INTO user_settings (user_id, username, full_name, email, role, department) 
VALUES 
(1, 'admin', 'مدير النظام', 'admin@company.com', 'admin', 'الإدارة'),
(2, 'manager', 'مدير المبيعات', 'sales@company.com', 'manager', 'المبيعات'),
(3, 'user', 'موظف المبيعات', 'user@company.com', 'user', 'المبيعات')
ON CONFLICT (user_id) DO NOTHING;

-- إعدادات الطباعة الافتراضية
INSERT INTO print_settings (setting_type, document_type, paper_size, orientation) 
VALUES 
('documents', 'invoice', 'A4', 'portrait'),
('documents', 'order', 'A4', 'portrait'),
('reports', 'sales_report', 'A4', 'landscape'),
('reports', 'inventory_report', 'A4', 'portrait')
ON CONFLICT DO NOTHING;

-- الإعدادات العامة الافتراضية
INSERT INTO general_settings (setting_key, setting_value, setting_type, category, description) 
VALUES 
('default_country', 'السعودية', 'string', 'system', 'الدولة الافتراضية'),
('whatsapp_number', '+966501234567', 'string', 'business', 'رقم الواتس آب للشركة'),
('support_email', 'support@company.com', 'string', 'business', 'إيميل الدعم الفني'),
('backup_frequency', 'daily', 'string', 'system', 'تكرار النسخ الاحتياطي'),
('max_file_size', '10', 'number', 'system', 'الحد الأقصى لحجم الملف (MB)'),
('enable_notifications', 'true', 'boolean', 'ui', 'تفعيل الإشعارات'),
('session_timeout', '60', 'number', 'system', 'انتهاء الجلسة (دقيقة)')
ON CONFLICT (setting_key) DO NOTHING;

-- إعدادات API الافتراضية
INSERT INTO api_settings (api_name, api_url, is_enabled) 
VALUES 
('WhatsApp Business', 'https://api.whatsapp.com', false),
('SMS Gateway', 'https://api.sms.com', false),
('Payment Gateway', 'https://api.payment.com', false),
('Accounting System', 'https://api.accounting.com', false)
ON CONFLICT DO NOTHING;

-- إنشاء الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_print_settings_type ON print_settings(setting_type, document_type);
CREATE INDEX IF NOT EXISTS idx_general_settings_category ON general_settings(category);
CREATE INDEX IF NOT EXISTS idx_api_settings_name ON api_settings(api_name);
