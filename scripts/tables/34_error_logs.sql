-- جدول سجلات الأخطاء
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_id VARCHAR(100) UNIQUE,
    level VARCHAR(20) DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_id INTEGER,
    user_agent TEXT,
    context JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);
