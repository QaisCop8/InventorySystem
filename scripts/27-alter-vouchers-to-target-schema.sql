BEGIN;

-- Ensure dependency table exists for FK vouchers.vch_type -> voucher_types.id
CREATE TABLE IF NOT EXISTS public.voucher_types (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    status integer DEFAULT 1,
    CONSTRAINT voucher_types_pkey PRIMARY KEY (id)
);

-- Ensure base table exists (safe no-op if already present)
CREATE TABLE IF NOT EXISTS public.vouchers (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT vouchers_pkey PRIMARY KEY (id)
);

-- Normalize legacy column names if they still exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vouchers' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_number TO voucher_code;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vouchers' AND column_name = 'order_date'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_date TO voucher_date;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vouchers' AND column_name = 'order_status2'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_status2 TO vch_status;
    END IF;
END $$;

-- Add missing columns
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS voucher_code character varying(20);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS voucher_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS customer_id integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS customer_name character varying(100);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS customer_phone character varying(20);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS salesman_id integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS currency_id integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,4) DEFAULT 1;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS delivery_date timestamp without time zone;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS discount_type integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS vat_percent numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS vch_type integer DEFAULT 1;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS vch_status integer DEFAULT 1;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS delivery_address character varying(150) DEFAULT '';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS reference_number character varying(30) DEFAULT '';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS reference_number_date timestamp without time zone;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS shipping_cost numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS other_charges numeric(12,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS general_notes character varying(300);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS internal_notes character varying(300);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS delivery_notes character varying(300);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS received_by character varying(15) DEFAULT '';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS customer_order_no character varying(15) DEFAULT '';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS user_id character varying(255);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS printed integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS printed_count integer;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS is_exported integer DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS exported_sales boolean DEFAULT false;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS tax_classification integer DEFAULT 1;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS invoice_type integer DEFAULT 1;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS is_offset boolean DEFAULT false;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS offset_code integer;

-- Enforce defaults exactly as target schema
ALTER TABLE public.vouchers ALTER COLUMN voucher_date SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ALTER COLUMN exchange_rate SET DEFAULT 1;
ALTER TABLE public.vouchers ALTER COLUMN discount_amount SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN vat_amount SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN vat_percent SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN total_amount SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN vch_type SET DEFAULT 1;
ALTER TABLE public.vouchers ALTER COLUMN vch_status SET DEFAULT 1;
ALTER TABLE public.vouchers ALTER COLUMN delivery_address SET DEFAULT '';
ALTER TABLE public.vouchers ALTER COLUMN reference_number SET DEFAULT '';
ALTER TABLE public.vouchers ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.vouchers ALTER COLUMN shipping_cost SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN other_charges SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN deleted SET DEFAULT false;
ALTER TABLE public.vouchers ALTER COLUMN received_by SET DEFAULT '';
ALTER TABLE public.vouchers ALTER COLUMN customer_order_no SET DEFAULT '';
ALTER TABLE public.vouchers ALTER COLUMN is_exported SET DEFAULT 0;
ALTER TABLE public.vouchers ALTER COLUMN exported_sales SET DEFAULT false;
ALTER TABLE public.vouchers ALTER COLUMN tax_classification SET DEFAULT 1;
ALTER TABLE public.vouchers ALTER COLUMN invoice_type SET DEFAULT 1;
ALTER TABLE public.vouchers ALTER COLUMN is_offset SET DEFAULT false;

-- Backfill required values before NOT NULL
UPDATE public.vouchers SET voucher_date = CURRENT_TIMESTAMP WHERE voucher_date IS NULL;
UPDATE public.vouchers SET vch_type = 1 WHERE vch_type IS NULL;
UPDATE public.vouchers SET delivery_address = '' WHERE delivery_address IS NULL;
UPDATE public.vouchers SET reference_number = '' WHERE reference_number IS NULL;
UPDATE public.vouchers SET deleted = false WHERE deleted IS NULL;

-- Enforce NOT NULL exactly as target schema
ALTER TABLE public.vouchers ALTER COLUMN voucher_code SET NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN vch_type SET NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN delivery_address SET NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN reference_number SET NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN deleted SET NOT NULL;

-- Remove columns not present in your target vouchers schema
ALTER TABLE public.vouchers DROP COLUMN IF EXISTS vch_book;

-- Ensure constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vouchers_voucher_code_key'
          AND conrelid = 'public.vouchers'::regclass
    ) THEN
        ALTER TABLE public.vouchers
            ADD CONSTRAINT vouchers_voucher_code_key UNIQUE (voucher_code);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vouchers_vch_type_fkey'
          AND conrelid = 'public.vouchers'::regclass
    ) THEN
        ALTER TABLE public.vouchers
            ADD CONSTRAINT vouchers_vch_type_fkey FOREIGN KEY (vch_type)
            REFERENCES public.voucher_types (id)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vouchers_user_id_fkey'
          AND conrelid = 'public.vouchers'::regclass
    ) THEN
        ALTER TABLE public.vouchers
            ADD CONSTRAINT vouchers_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES public.user_settings (user_id)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vouchers_customer_id_fkey'
          AND conrelid = 'public.vouchers'::regclass
    ) THEN
        ALTER TABLE public.vouchers
            ADD CONSTRAINT vouchers_customer_id_fkey FOREIGN KEY (customer_id)
            REFERENCES public.customers (id)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION;
    END IF;
END $$;

COMMIT;
