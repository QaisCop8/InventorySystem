-- Ensure voucher types table exists
CREATE TABLE IF NOT EXISTS public.voucher_types
(
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    status integer DEFAULT 1,
    CONSTRAINT voucher_types_pkey PRIMARY KEY (id)
);

-- Create vouchers table (similar to orders) with vch_type relation
CREATE TABLE IF NOT EXISTS public.vouchers
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY,
    voucher_code character varying(20) NOT NULL,
    voucher_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    customer_id integer,
    customer_name character varying(100),
    customer_phone character varying(20),
    salesman_id integer,
    currency_id integer,
    exchange_rate numeric(10,4) DEFAULT 1,
    delivery_date timestamp without time zone,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_type integer,
    vat_amount numeric(12,2) DEFAULT 0,
    vat_percent numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0,
    vch_type integer NOT NULL DEFAULT 1,
    vch_status integer DEFAULT 1,
    delivery_address character varying(150) NOT NULL DEFAULT '',
    reference_number character varying(30) NOT NULL DEFAULT '',
    reference_number_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    shipping_cost numeric(12,2) DEFAULT 0,
    other_charges numeric(12,2) DEFAULT 0,
    general_notes character varying(300),
    internal_notes character varying(300),
    delivery_notes character varying(300),
    deleted boolean NOT NULL DEFAULT false,
    received_by character varying(15) DEFAULT '',
    customer_order_no character varying(15) DEFAULT '',
    user_id character varying(255),
    printed integer,
    printed_count integer,
    is_exported integer DEFAULT 0,
    exported_sales boolean DEFAULT false,
    tax_classification integer DEFAULT 1,
    invoice_type integer DEFAULT 1,
    is_offset boolean DEFAULT false,
    offset_code integer,
    CONSTRAINT vouchers_pkey PRIMARY KEY (id),
    CONSTRAINT vouchers_voucher_code_key UNIQUE (voucher_code),
    CONSTRAINT vouchers_vch_type_fkey FOREIGN KEY (vch_type)
        REFERENCES public.voucher_types (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT vouchers_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.user_settings (user_id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT vouchers_customer_id_fkey FOREIGN KEY (customer_id)
        REFERENCES public.customers (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

-- If vouchers table existed before, ensure vch_type is present and linked
ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS vch_type integer;

ALTER TABLE public.vouchers
    ALTER COLUMN vch_type SET DEFAULT 1;

UPDATE public.vouchers
SET vch_type = COALESCE(vch_type, 1)
WHERE vch_type IS NULL;

ALTER TABLE public.vouchers
    ALTER COLUMN vch_type SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'order_number'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_number TO voucher_code;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'order_date'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_date TO voucher_date;
    END IF;
END $$;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS voucher_code character varying(20);

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS voucher_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS reference_number_date timestamp without time zone;

UPDATE public.vouchers
SET voucher_date = COALESCE(voucher_date, CURRENT_TIMESTAMP)
WHERE voucher_date IS NULL;

UPDATE public.vouchers
SET reference_number_date = COALESCE(reference_number_date, voucher_date, CURRENT_TIMESTAMP)
WHERE reference_number_date IS NULL;

ALTER TABLE public.vouchers
    ALTER COLUMN voucher_code SET NOT NULL;

ALTER TABLE public.vouchers
    ALTER COLUMN voucher_date SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'order_status2'
    ) THEN
        ALTER TABLE public.vouchers RENAME COLUMN order_status2 TO vch_status;
    END IF;
END $$;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS vch_status integer DEFAULT 1;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS vch_book character varying(20) DEFAULT 'R';

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS tax_classification integer DEFAULT 1;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS invoice_type integer DEFAULT 1;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS is_offset boolean DEFAULT false;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS offset_code integer;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS exported_sales boolean DEFAULT false;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'tax_classification'
          AND data_type <> 'integer'
    ) THEN
        ALTER TABLE public.vouchers
        ALTER COLUMN tax_classification TYPE integer
        USING (
            CASE
                WHEN tax_classification IS NULL THEN NULL
                WHEN TRIM(tax_classification::text) IN ('1', 'ضريبية') THEN 1
                WHEN TRIM(tax_classification::text) IN ('2', 'معفاه') THEN 2
                WHEN TRIM(tax_classification::text) IN ('3', 'صفرية') THEN 3
                ELSE NULL
            END
        );
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'invoice_type'
          AND data_type <> 'integer'
    ) THEN
        ALTER TABLE public.vouchers
        ALTER COLUMN invoice_type TYPE integer
        USING (
            CASE
                WHEN invoice_type IS NULL THEN NULL
                WHEN TRIM(invoice_type::text) IN ('1', 'للتجارة') THEN 1
                WHEN TRIM(invoice_type::text) IN ('2', 'خدمات') THEN 2
                WHEN TRIM(invoice_type::text) IN ('3', 'أصول') THEN 3
                ELSE NULL
            END
        );
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'offset_code'
          AND data_type <> 'integer'
    ) THEN
        ALTER TABLE public.vouchers
        ALTER COLUMN offset_code TYPE integer
        USING (
            CASE
                WHEN offset_code IS NULL THEN NULL
                WHEN TRIM(offset_code::text) IN ('1','تجارية') THEN 1
                WHEN TRIM(offset_code::text) IN ('2','أصول') THEN 2
                WHEN TRIM(offset_code::text) IN ('3','خدمات') THEN 3
                ELSE NULL
            END
        );
    END IF;
END $$;

UPDATE public.vouchers
SET vch_book = COALESCE(NULLIF(TRIM(vch_book), ''), 'R')
WHERE vch_book IS NULL OR TRIM(vch_book) = '';

UPDATE public.vouchers
SET exported_sales = COALESCE(exported_sales, false)
WHERE exported_sales IS NULL;

UPDATE public.vouchers
SET tax_classification = COALESCE(tax_classification, 1)
WHERE tax_classification IS NULL;

UPDATE public.vouchers
SET invoice_type = COALESCE(invoice_type, 1)
WHERE invoice_type IS NULL;

UPDATE public.vouchers
SET is_offset = COALESCE(is_offset, false)
WHERE is_offset IS NULL;

UPDATE public.vouchers
SET offset_code = NULL
WHERE COALESCE(is_offset, false) = false;

UPDATE public.vouchers
SET offset_code = COALESCE(offset_code, 1)
WHERE COALESCE(is_offset, false) = true;

UPDATE public.vouchers
SET vch_status = COALESCE(vch_status, 1)
WHERE vch_status IS NULL;

ALTER TABLE public.vouchers
    ALTER COLUMN vch_status SET DEFAULT 1;

ALTER TABLE public.vouchers
    DROP COLUMN IF EXISTS order_status;

ALTER TABLE public.vouchers
    DROP COLUMN IF EXISTS order_decision;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'vouchers_vch_type_fkey'
          AND table_name = 'vouchers'
    ) THEN
        ALTER TABLE public.vouchers
            ADD CONSTRAINT vouchers_vch_type_fkey
            FOREIGN KEY (vch_type)
            REFERENCES public.voucher_types (id)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION;
    END IF;
END $$;

-- Create voucher_items table (similar to order_items)
CREATE TABLE IF NOT EXISTS public.voucher_items
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY,
    voucher_id integer NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(255) NOT NULL,
    quantity numeric(12,2) NOT NULL DEFAULT 0,
    price numeric(12,2) NOT NULL DEFAULT 0,
    discount numeric(12,2) NOT NULL DEFAULT 0,
    order_item_id integer,
    delivery_item_id integer,
    barcode character varying(100),
    unit_id integer,
    store_id integer,
    delivered_quantity numeric(12,2) NOT NULL DEFAULT 0,
    expiry_date date,
    batch_number character varying(30),
    item_status integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bonus double precision DEFAULT 0,
    CONSTRAINT voucher_items_pkey PRIMARY KEY (id),
    CONSTRAINT voucher_items_voucher_fkey FOREIGN KEY (voucher_id)
        REFERENCES public.vouchers (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

ALTER TABLE public.voucher_items
    ADD COLUMN IF NOT EXISTS order_item_id integer;

ALTER TABLE public.voucher_items
    ADD COLUMN IF NOT EXISTS delivery_item_id integer;

CREATE INDEX IF NOT EXISTS idx_vouchers_vch_type ON public.vouchers(vch_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_vch_book ON public.vouchers(vch_book);
CREATE INDEX IF NOT EXISTS idx_vouchers_customer_id ON public.vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_code ON public.vouchers(voucher_code);
CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher_id ON public.voucher_items(voucher_id);
