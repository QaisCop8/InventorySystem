-- جدول قوالب الرسائل
CREATE TABLE IF NOT EXISTS message_templates (
    id SERIAL PRIMARY KEY,
    template_code VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    template_category VARCHAR(50),
    message_content TEXT NOT NULL,
    variables JSONB,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_templates_code ON message_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(template_category);
