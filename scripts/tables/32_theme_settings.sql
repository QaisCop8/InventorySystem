-- جدول إعدادات المظهر
CREATE TABLE IF NOT EXISTS theme_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    organization_id INTEGER,
    theme_name VARCHAR(100),
    dark_mode BOOLEAN DEFAULT false,
    primary_color VARCHAR(20) DEFAULT '#3b82f6',
    secondary_color VARCHAR(20) DEFAULT '#8b5cf6',
    accent_color VARCHAR(20) DEFAULT '#10b981',
    background_color VARCHAR(20) DEFAULT '#ffffff',
    text_color VARCHAR(20) DEFAULT '#1f2937',
    font_family VARCHAR(100) DEFAULT 'Cairo',
    font_size INTEGER DEFAULT 14,
    font_weight INTEGER DEFAULT 400,
    line_height NUMERIC(3,1) DEFAULT 1.5,
    letter_spacing NUMERIC(3,2) DEFAULT 0,
    border_radius INTEGER DEFAULT 8,
    sidebar_width INTEGER DEFAULT 280,
    header_height INTEGER DEFAULT 64,
    compact_mode BOOLEAN DEFAULT false,
    high_contrast BOOLEAN DEFAULT false,
    rtl_support BOOLEAN DEFAULT true,
    animation_speed VARCHAR(20) DEFAULT 'normal',
    button_style VARCHAR(20) DEFAULT 'rounded',
    card_style VARCHAR(20) DEFAULT 'elevated',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_theme_settings_user ON theme_settings(user_id);
