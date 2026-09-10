-- جدول الأدوار المخصصة
CREATE TABLE IF NOT EXISTS custom_roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    description TEXT,
    permissions JSONB,
    hierarchy INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_name ON custom_roles(name);
CREATE INDEX IF NOT EXISTS idx_custom_roles_hierarchy ON custom_roles(hierarchy);
