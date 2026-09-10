-- جدول الرسائل المجدولة
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES message_templates(id),
    message_content TEXT NOT NULL,
    recipient_type VARCHAR(50),
    recipient_phones JSONB,
    scheduled_time TIMESTAMP NOT NULL,
    repeat_type VARCHAR(50),
    repeat_until DATE,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_time ON scheduled_messages(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
