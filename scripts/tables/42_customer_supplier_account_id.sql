-- Add linked account ids to customer and supplier tables
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES account_tbl(id);

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES account_tbl(id);