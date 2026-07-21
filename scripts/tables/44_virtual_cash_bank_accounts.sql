-- جدول حسابات الصناديق والبنوك الافتراضية
CREATE TABLE IF NOT EXISTS virtual_cash_bank_accounts (
  id SERIAL PRIMARY KEY,
  currency_id INTEGER REFERENCES currencies(id) ON DELETE SET NULL,
  cash_account_id INTEGER REFERENCES account_tbl(id) ON DELETE SET NULL,
  incoming_checks_account_id INTEGER REFERENCES account_tbl(id) ON DELETE SET NULL,
  returned_checks_account_id INTEGER REFERENCES account_tbl(id) ON DELETE SET NULL,
  card_account_id INTEGER REFERENCES account_tbl(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_virtual_cash_bank_accounts_currency_id ON virtual_cash_bank_accounts(currency_id);
CREATE INDEX IF NOT EXISTS idx_virtual_cash_bank_accounts_cash_account_id ON virtual_cash_bank_accounts(cash_account_id);
