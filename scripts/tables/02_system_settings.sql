-- جدول إعدادات النظام - نموذج صفّي/مفتاح-قيمة
CREATE TABLE IF NOT EXISTS system_settings (
    id VARCHAR(100) PRIMARY KEY,
    description TEXT,
    value TEXT
);

-- Cleanup legacy columns from older schemas if they still exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'organization_id') THEN
        ALTER TABLE system_settings DROP COLUMN organization_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_name') THEN
        ALTER TABLE system_settings DROP COLUMN company_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_name_en') THEN
        ALTER TABLE system_settings DROP COLUMN company_name_en;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_email') THEN
        ALTER TABLE system_settings DROP COLUMN company_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_phone') THEN
        ALTER TABLE system_settings DROP COLUMN company_phone;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_address') THEN
        ALTER TABLE system_settings DROP COLUMN company_address;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'company_website') THEN
        ALTER TABLE system_settings DROP COLUMN company_website;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'tax_number') THEN
        ALTER TABLE system_settings DROP COLUMN tax_number;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'commercial_register') THEN
        ALTER TABLE system_settings DROP COLUMN commercial_register;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_currency') THEN
        ALTER TABLE system_settings DROP COLUMN default_currency;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'language') THEN
        ALTER TABLE system_settings DROP COLUMN language;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'timezone') THEN
        ALTER TABLE system_settings DROP COLUMN timezone;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'date_format') THEN
        ALTER TABLE system_settings DROP COLUMN date_format;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'time_format') THEN
        ALTER TABLE system_settings DROP COLUMN time_format;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'fiscal_year_start') THEN
        ALTER TABLE system_settings DROP COLUMN fiscal_year_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'auto_numbering') THEN
        ALTER TABLE system_settings DROP COLUMN auto_numbering;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'numbering_system') THEN
        ALTER TABLE system_settings DROP COLUMN numbering_system;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'invoice_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN invoice_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'invoice_start') THEN
        ALTER TABLE system_settings DROP COLUMN invoice_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'order_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN order_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'order_start') THEN
        ALTER TABLE system_settings DROP COLUMN order_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'purchase_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN purchase_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'purchase_start') THEN
        ALTER TABLE system_settings DROP COLUMN purchase_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'customer_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN customer_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'customer_start') THEN
        ALTER TABLE system_settings DROP COLUMN customer_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'supplier_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN supplier_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'supplier_start') THEN
        ALTER TABLE system_settings DROP COLUMN supplier_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'item_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN item_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'item_start') THEN
        ALTER TABLE system_settings DROP COLUMN item_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'item_group_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN item_group_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'item_group_start') THEN
        ALTER TABLE system_settings DROP COLUMN item_group_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_customer_parent_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_customer_parent_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_customer_credit_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_customer_credit_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_sales_tax_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_sales_tax_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_currency_transfer_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_currency_transfer_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_earned_discount_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_earned_discount_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_exchange_gain_loss_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_exchange_gain_loss_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_salesman_parent_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_salesman_parent_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_supplier_parent_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_supplier_parent_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_customer_subscription_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_customer_subscription_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_purchase_tax_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_purchase_tax_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_new_employee_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_new_employee_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_allowed_discount_account') THEN
        ALTER TABLE system_settings DROP COLUMN default_allowed_discount_account;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'paper_size') THEN
        ALTER TABLE system_settings DROP COLUMN paper_size;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'print_logo') THEN
        ALTER TABLE system_settings DROP COLUMN print_logo;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'print_footer') THEN
        ALTER TABLE system_settings DROP COLUMN print_footer;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'default_printer') THEN
        ALTER TABLE system_settings DROP COLUMN default_printer;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'working_days') THEN
        ALTER TABLE system_settings DROP COLUMN working_days;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'working_hours') THEN
        ALTER TABLE system_settings DROP COLUMN working_hours;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'session_timeout') THEN
        ALTER TABLE system_settings DROP COLUMN session_timeout;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'two_factor_auth') THEN
        ALTER TABLE system_settings DROP COLUMN two_factor_auth;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'password_policy') THEN
        ALTER TABLE system_settings DROP COLUMN password_policy;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'audit_log') THEN
        ALTER TABLE system_settings DROP COLUMN audit_log;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'account_prefix') THEN
        ALTER TABLE system_settings DROP COLUMN account_prefix;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'account_start') THEN
        ALTER TABLE system_settings DROP COLUMN account_start;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'created_at') THEN
        ALTER TABLE system_settings DROP COLUMN created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'updated_at') THEN
        ALTER TABLE system_settings DROP COLUMN updated_at;
    END IF;
END $$;
