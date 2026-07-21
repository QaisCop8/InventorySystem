-- Create the users currencies default account mapping table
CREATE TABLE IF NOT EXISTS users_currencies_default_account_tbl (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  currency_id INTEGER,
  account_type VARCHAR(50) NOT NULL,
  account_id INTEGER,
  FOREIGN KEY (account_id) REFERENCES account_tbl(id) ON DELETE SET NULL,
  FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES user_settings(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_currencies_default_account_tbl_user_id ON users_currencies_default_account_tbl(user_id);
CREATE INDEX IF NOT EXISTS idx_users_currencies_default_account_tbl_currency_id ON users_currencies_default_account_tbl(currency_id);
CREATE INDEX IF NOT EXISTS idx_users_currencies_default_account_tbl_account_id ON users_currencies_default_account_tbl(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_currencies_default_account_tbl_user_currency_type ON users_currencies_default_account_tbl(user_id, currency_id, account_type);
