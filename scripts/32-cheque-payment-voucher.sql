BEGIN;

INSERT INTO voucher_types_tbl (id, name, status)
VALUES (21, 'سند صرف شيكات', 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

CREATE TABLE IF NOT EXISTS cheque_payment_voucher_items (
  id SERIAL PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
  cheque_id INTEGER NOT NULL REFERENCES cheques_tbl(id) ON DELETE RESTRICT,
  amount DOUBLE PRECISION NOT NULL,
  order_no INTEGER NOT NULL DEFAULT 1,
  UNIQUE (voucher_id, cheque_id)
);

CREATE INDEX IF NOT EXISTS idx_cheque_payment_items_cheque
  ON cheque_payment_voucher_items (cheque_id);

CREATE TABLE IF NOT EXISTS cheque_operations_log_tbl (
  id SERIAL PRIMARY KEY,
  cheque_id INTEGER NOT NULL REFERENCES cheques_tbl(id) ON DELETE CASCADE,
  operation_code VARCHAR(40) NOT NULL,
  operation_name VARCHAR(100) NOT NULL,
  previous_status_id INTEGER,
  new_status_id INTEGER,
  operation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  new_due_date TIMESTAMP,
  account_id INTEGER,
  note TEXT,
  user_id VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS voucher_id INTEGER;
ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_current_account_id INTEGER;
ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_bank_account_id INTEGER;
ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_due_date TIMESTAMP;
ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_voucher_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_cheque_operations_log_voucher
  ON cheque_operations_log_tbl (voucher_id)
  WHERE status <> 9;

COMMIT;
