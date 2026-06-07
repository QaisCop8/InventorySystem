-- Add account prefix and start numbering to system_settings
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS account_prefix VARCHAR(10) DEFAULT 'A',
ADD COLUMN IF NOT EXISTS account_start INTEGER DEFAULT 1;

-- Update existing records with default values if NULL
UPDATE system_settings 
SET account_prefix = 'A', account_start = 1 
WHERE account_prefix IS NULL OR account_start IS NULL;
