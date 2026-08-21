-- Internal Manufacturing Request, voucher type 20.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM voucher_types_tbl WHERE id = 20 AND name <> 'طلب صناعة داخلي') THEN
    RAISE EXCEPTION 'voucher type 20 is already assigned to another voucher type';
  END IF;
END $$;

INSERT INTO voucher_types_tbl (id, name, status)
VALUES (20, 'طلب صناعة داخلي', 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE voucher_header_tbl
  ADD COLUMN IF NOT EXISTS internal_status INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS manufacturing_branch_id INTEGER,
  ADD COLUMN IF NOT EXISTS destination_warehouse_id INTEGER;

ALTER TABLE voucher_items_tbl
  ADD COLUMN IF NOT EXISTS free_quantity DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_quantity DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepared_quantity DOUBLE PRECISION DEFAULT 0;

CREATE TABLE IF NOT EXISTS internal_manufacturing_events (
  id SERIAL PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  from_status INTEGER,
  to_status INTEGER,
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internal_manufacturing_events_voucher
  ON internal_manufacturing_events(voucher_id, created_at);
