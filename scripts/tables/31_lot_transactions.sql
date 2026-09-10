-- جدول حركات اللوتات
CREATE TABLE IF NOT EXISTS lot_transactions (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER REFERENCES product_lots(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    quantity NUMERIC(15,2) NOT NULL,
    unit_cost NUMERIC(15,2),
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lot_transactions_lot ON lot_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_transactions_type ON lot_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_lot_transactions_reference ON lot_transactions(reference_type, reference_id);
