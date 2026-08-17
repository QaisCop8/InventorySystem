-- جدول إعدادات المستخدمين
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(255),
    full_name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50),
    department VARCHAR(100),
    organization_id INTEGER,
    permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    theme_preference VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'ar',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(20) DEFAULT '24h',
    notifications_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    sidebar_collapsed BOOLEAN DEFAULT false,
    dashboard_layout JSONB,
    datagrid_settings JSONB DEFAULT '{}',
    avatar_url TEXT,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_email ON user_settings(email);
