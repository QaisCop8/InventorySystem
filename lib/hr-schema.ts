import sql from "@/lib/database"

let ready: Promise<void> | null = null

export function ensureHrSchema() {
  if (ready) return ready
  ready = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS employee_jobs_tbl (id SERIAL PRIMARY KEY, code VARCHAR(30) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    await sql`CREATE TABLE IF NOT EXISTS salary_items_tbl (id SERIAL PRIMARY KEY, code VARCHAR(30) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL, item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('earning','deduction')), calculation_type VARCHAR(20) NOT NULL DEFAULT 'fixed', default_amount NUMERIC(18,3) DEFAULT 0, taxable BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    await sql`ALTER TABLE salary_items_tbl DROP CONSTRAINT IF EXISTS salary_items_tbl_item_type_check`
    await sql`ALTER TABLE salary_items_tbl ADD CONSTRAINT salary_items_tbl_item_type_check CHECK (item_type IN ('basic_salary','earning','deduction'))`
    await sql`ALTER TABLE salary_items_tbl ADD COLUMN IF NOT EXISTS other_name VARCHAR(150) DEFAULT ''`
    await sql`ALTER TABLE salary_items_tbl ADD COLUMN IF NOT EXISTS account_code VARCHAR(100)`
    await sql`ALTER TABLE salary_items_tbl ADD COLUMN IF NOT EXISTS calculation_method VARCHAR(20) DEFAULT 'fixed'`
    await sql`ALTER TABLE salary_items_tbl ADD COLUMN IF NOT EXISTS amount_period VARCHAR(20) DEFAULT 'monthly'`
    await sql`ALTER TABLE salary_items_tbl ADD COLUMN IF NOT EXISTS add_to_total_salary BOOLEAN DEFAULT true`
    await sql`UPDATE salary_items_tbl SET calculation_method=calculation_type WHERE calculation_type IN ('fixed','percentage')`
    await sql`UPDATE salary_items_tbl SET amount_period=calculation_type WHERE calculation_type IN ('monthly','daily')`
    await sql`CREATE TABLE IF NOT EXISTS tax_rules_tbl (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, from_amount NUMERIC(18,3) DEFAULT 0, to_amount NUMERIC(18,3), rate NUMERIC(9,4) DEFAULT 0, fixed_amount NUMERIC(18,3) DEFAULT 0, is_active BOOLEAN DEFAULT true)`
    await sql`CREATE TABLE IF NOT EXISTS tax_laws_tbl (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, other_name VARCHAR(150) NOT NULL DEFAULT '', account_code VARCHAR(100), currency VARCHAR(30), max_discount NUMERIC(18,3), discount_percent NUMERIC(9,4) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    await sql`CREATE TABLE IF NOT EXISTS tax_law_brackets_tbl (id SERIAL PRIMARY KEY, tax_law_id INTEGER NOT NULL REFERENCES tax_laws_tbl(id) ON DELETE CASCADE, from_amount NUMERIC(18,3) NOT NULL DEFAULT 0, to_amount NUMERIC(18,3), tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0)`
    await sql`CREATE TABLE IF NOT EXISTS tax_exemptions_tbl (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, annual_amount NUMERIC(18,3) DEFAULT 0, is_active BOOLEAN DEFAULT true)`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS other_name VARCHAR(150) DEFAULT ''`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS tax_law_id INTEGER REFERENCES tax_laws_tbl(id)`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS exemption_nature VARCHAR(30) DEFAULT 'personal'`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS exemption_value_type VARCHAR(20) DEFAULT 'amount'`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS max_amount NUMERIC(18,3) DEFAULT 0`
    await sql`ALTER TABLE tax_exemptions_tbl ADD COLUMN IF NOT EXISTS max_amount_type VARCHAR(20) DEFAULT 'amount'`
    await sql`CREATE TABLE IF NOT EXISTS employees_tbl (id SERIAL PRIMARY KEY, employee_code VARCHAR(30) UNIQUE NOT NULL, full_name VARCHAR(200) NOT NULL, national_id VARCHAR(50), gender VARCHAR(10), birth_date DATE, hire_date DATE NOT NULL, end_date DATE, department_id INTEGER REFERENCES departments(id), job_id INTEGER REFERENCES employee_jobs_tbl(id), branch_id INTEGER REFERENCES branches(id), salary_type VARCHAR(20) DEFAULT 'monthly', basic_salary NUMERIC(18,3) DEFAULT 0, bank_account VARCHAR(100), phone VARCHAR(50), email VARCHAR(150), address TEXT, tax_exemption_id INTEGER REFERENCES tax_exemptions_tbl(id), status INTEGER DEFAULT 1, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS other_name VARCHAR(200)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS passport_no VARCHAR(50)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS salary_currency VARCHAR(30)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS contract_type VARCHAR(30)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(150)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS iban VARCHAR(50)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS salary_account INTEGER`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS is_taxed BOOLEAN DEFAULT true`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS social_status VARCHAR(30)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS region VARCHAR(150)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS permanent_address TEXT`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS father_account_code VARCHAR(100)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS father_account INTEGER`
    await sql.unsafe(`DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees_tbl' AND column_name='salary_account' AND data_type<>'integer') THEN
          UPDATE employees_tbl e SET salary_account=COALESCE(
            (SELECT a.id::text FROM account_tbl a WHERE LOWER(TRIM(a.code))=LOWER(TRIM(e.salary_account)) LIMIT 1),
            CASE WHEN e.salary_account ~ '^[0-9]+$' AND e.salary_account::numeric<=2147483647 AND EXISTS (SELECT 1 FROM account_tbl a WHERE a.id=e.salary_account::integer) THEN e.salary_account ELSE NULL END
          );
          ALTER TABLE employees_tbl ALTER COLUMN salary_account TYPE INTEGER USING NULLIF(salary_account,'')::integer;
        END IF;
      END $$`, [])
    await sql`UPDATE employees_tbl e SET father_account=COALESCE(e.father_account,
      (SELECT a.id FROM account_tbl a WHERE LOWER(TRIM(a.code))=LOWER(TRIM(e.father_account_code)) LIMIT 1),
      CASE WHEN e.father_account_code ~ '^[0-9]+$' AND e.father_account_code::numeric<=2147483647 THEN (SELECT a.id FROM account_tbl a WHERE a.id=e.father_account_code::integer LIMIT 1) ELSE NULL END)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS account_currency VARCHAR(30)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS allow_different_currency BOOLEAN DEFAULT false`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS currency_difference BOOLEAN DEFAULT false`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS stop_transactions BOOLEAN DEFAULT false`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS tax_law_id INTEGER REFERENCES tax_laws_tbl(id)`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS image_url TEXT`
    await sql`ALTER TABLE employees_tbl ADD COLUMN IF NOT EXISTS device_user_id VARCHAR(100)`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS employees_device_user_id_unique ON employees_tbl(device_user_id) WHERE device_user_id IS NOT NULL AND device_user_id <> ''`
    await sql`CREATE TABLE IF NOT EXISTS employee_salary_items_tbl (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE, salary_item_id INTEGER NOT NULL REFERENCES salary_items_tbl(id), amount NUMERIC(18,3) DEFAULT 0, UNIQUE(employee_id, salary_item_id))`
    await sql`ALTER TABLE employee_salary_items_tbl ADD COLUMN IF NOT EXISTS percentage NUMERIC(9,4) DEFAULT 0`
    await sql`CREATE TABLE IF NOT EXISTS employee_stop_transactions_tbl (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE, voucher_type_id INTEGER NOT NULL REFERENCES voucher_types_tbl(id), is_stopped BOOLEAN DEFAULT false, stop_date DATE, UNIQUE(employee_id, voucher_type_id))`
    await sql`CREATE TABLE IF NOT EXISTS employee_tax_exemptions_tbl (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE, tax_exemption_id INTEGER NOT NULL REFERENCES tax_exemptions_tbl(id), exemption_type VARCHAR(20) DEFAULT 'annual', amount NUMERIC(18,3) DEFAULT 0, UNIQUE(employee_id, tax_exemption_id))`
    await sql`CREATE TABLE IF NOT EXISTS salary_periods_tbl (id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, status VARCHAR(20) DEFAULT 'open', opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP, UNIQUE(year, month))`
    await sql`CREATE TABLE IF NOT EXISTS payroll_tbl (id SERIAL PRIMARY KEY, period_id INTEGER NOT NULL REFERENCES salary_periods_tbl(id) ON DELETE CASCADE, employee_id INTEGER NOT NULL REFERENCES employees_tbl(id), basic_salary NUMERIC(18,3) DEFAULT 0, earnings NUMERIC(18,3) DEFAULT 0, deductions NUMERIC(18,3) DEFAULT 0, income_tax NUMERIC(18,3) DEFAULT 0, net_salary NUMERIC(18,3) DEFAULT 0, notes TEXT, UNIQUE(period_id, employee_id))`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS journal_id INTEGER`
    await sql`CREATE TABLE IF NOT EXISTS attendance_devices_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      code VARCHAR(50) NOT NULL UNIQUE,
      device_type VARCHAR(30) NOT NULL DEFAULT 'zkteco',
      ip_address VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL DEFAULT 4370,
      serial_number VARCHAR(100),
      branch_id INTEGER REFERENCES branches(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_sync_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
    await sql`CREATE TABLE IF NOT EXISTS attendance_logs_tbl (
      id BIGSERIAL PRIMARY KEY,
      device_id INTEGER REFERENCES attendance_devices_tbl(id) ON DELETE SET NULL,
      employee_id INTEGER REFERENCES employees_tbl(id) ON DELETE SET NULL,
      employee_code VARCHAR(100) NOT NULL,
      device_user_id VARCHAR(100),
      punch_time TIMESTAMP NOT NULL,
      punch_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
      verification_type VARCHAR(30) NOT NULL DEFAULT 'unknown',
      sync_status VARCHAR(20) NOT NULL DEFAULT 'manual',
      raw_payload JSONB,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(device_id, device_user_id, punch_time)
    )`
    await sql`CREATE TABLE IF NOT EXISTS shift_definitions_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      start_time TIME NOT NULL DEFAULT '08:00',
      end_time TIME NOT NULL DEFAULT '17:00',
      break_minutes INTEGER NOT NULL DEFAULT 0,
      grace_minutes INTEGER NOT NULL DEFAULT 0,
      is_overnight BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
    await sql`CREATE TABLE IF NOT EXISTS employee_shift_assignments_tbl (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      shift_id INTEGER REFERENCES shift_definitions_tbl(id) ON DELETE SET NULL,
      is_day_off BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(employee_id, weekday)
    )`
    await sql`CREATE TABLE IF NOT EXISTS official_holidays_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      holiday_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_paid BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, holiday_date, end_date)
    )`
    await sql`CREATE TABLE IF NOT EXISTS employee_holiday_exceptions_tbl (
      id SERIAL PRIMARY KEY,
      holiday_id INTEGER NOT NULL REFERENCES official_holidays_tbl(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE,
      is_day_off BOOLEAN NOT NULL DEFAULT true,
      UNIQUE(holiday_id, employee_id)
    )`
    await sql`CREATE TABLE IF NOT EXISTS shift_schedule_rules_tbl (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees_tbl(id) ON DELETE CASCADE,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      shift_id INTEGER REFERENCES shift_definitions_tbl(id) ON DELETE SET NULL,
      is_day_off BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (date_to >= date_from),
      CHECK ((employee_id IS NOT NULL) <> (department_id IS NOT NULL)),
      CHECK (is_day_off = true OR shift_id IS NOT NULL)
    )`
  })().catch((error) => { ready = null; throw error })
  return ready
}
