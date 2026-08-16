import crypto from "crypto"
import path from "path"
import { spawn } from "child_process"
import { existsSync } from "fs"
import managementSql, { ensureManagementTables } from "./management-db"
import { getPoolForDb } from "./database"
import { withDatabaseName } from "./db-url"

function generateDbName(): string {
  return `co_${crypto.randomBytes(4).toString("hex")}`
}

function resolvePgRestorePath(): string {
  const configuredPath = process.env.PG_RESTORE_PATH?.trim()
  if (configuredPath) return configuredPath

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files"
    for (const version of ["18", "17", "16", "15", "14"]) {
      const candidate = path.join(programFiles, "PostgreSQL", version, "bin", "pg_restore.exe")
      if (existsSync(candidate)) return candidate
    }
  }

  return "pg_restore"
}

async function generateUniqueDbName(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateDbName()
    const existing = await managementSql`SELECT id FROM companies WHERE db_name = ${candidate}`
    if (existing.length === 0) return candidate
  }
  throw new Error("تعذّر توليد معرّف فريد لقاعدة بيانات الشركة")
}

function restoreCompanyDatabase(dbName: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured")

  const dumpPath = process.env.DATABASE_DUMP_PATH?.trim() || path.join(process.cwd(), "backupDB.sql")
  const targetUrl = new URL(withDatabaseName(databaseUrl, dbName))
  const restoreEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: targetUrl.hostname,
    PGPORT: targetUrl.port || "5432",
    PGUSER: decodeURIComponent(targetUrl.username),
    PGPASSWORD: decodeURIComponent(targetUrl.password),
    PGDATABASE: dbName,
  }
  const sslMode = targetUrl.searchParams.get("sslmode")
  if (sslMode) restoreEnv.PGSSLMODE = sslMode

  return new Promise((resolve, reject) => {
    const child = spawn(
      resolvePgRestorePath(),
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", dbName, dumpPath],
      { env: restoreEnv, windowsHide: true },
    )
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      const hint = error.code === "ENOENT"
        ? " Install PostgreSQL 18 client tools or set PG_RESTORE_PATH to the full pg_restore executable path."
        : ""
      reject(new Error(`Unable to start pg_restore: ${error.message}.${hint}`))
    })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`pg_restore failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}

async function createCompanyDatabaseFromScript(dbName: string) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }

  const { Pool } = await import("pg")
  const adminUrl = withDatabaseName(process.env.DATABASE_URL, "postgres")

  if (!adminUrl) {
    throw new Error("تعذّر بناء رابط الاتصال لقاعدة الشركة الجديدة")
  }

  const adminPool = new Pool({ connectionString: adminUrl })
  try {
    const existing = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])
    if (existing.rows.length > 0) throw new Error(`Database ${dbName} already exists`)
    // Always create an empty database. The project dump supplies its schema and
    // default rows; no existing PostgreSQL database is used as a template.
    await adminPool.query(`CREATE DATABASE "${dbName}"`)
    try {
      await restoreCompanyDatabase(dbName)
    } catch (error) {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      ).catch(() => {})
      await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {})
      throw error
    }
  } finally {
    await adminPool.end().catch(() => {})
  }
}

async function ensureBasicProductsTable(tenantClient: ReturnType<typeof getPoolForDb>) {
  // تأكد من وجود جدول products الأساسي
  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      product_code VARCHAR(100) UNIQUE NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      product_name_en VARCHAR(255),
      barcode VARCHAR(100),
      description TEXT,
      category_id INTEGER,
      subcategory VARCHAR(100),
      classifications VARCHAR(255),
      product_type VARCHAR(50),
      brand VARCHAR(100),
      model VARCHAR(100),
      default_store INTEGER,
      manufacturer_number VARCHAR(100),
      original_number VARCHAR(100),
      supplier_id INTEGER,
      supplier_name VARCHAR(255),
      supplier_code VARCHAR(100),
      main_unit VARCHAR(50),
      secondary_unit VARCHAR(50),
      conversion_factor NUMERIC(10,4) DEFAULT 1,
      selling_price NUMERIC(15,2),
      retail_price NUMERIC(15,2),
      wholesale_price NUMERIC(15,2),
      last_purchase_price NUMERIC(15,2),
      average_cost NUMERIC(15,2),
      currency VARCHAR(10) DEFAULT 'SAR',
      tax_rate NUMERIC(5,2) DEFAULT 0,
      discount_rate NUMERIC(5,2) DEFAULT 0,
      min_stock_level NUMERIC(15,2),
      max_stock_level NUMERIC(15,2),
      reorder_point NUMERIC(15,2),
      order_quantity NUMERIC(15,2),
      max_quantity NUMERIC(15,2),
      location VARCHAR(100),
      weight NUMERIC(10,2),
      dimensions VARCHAR(100),
      color VARCHAR(50),
      size VARCHAR(50),
      material VARCHAR(100),
      country_of_origin VARCHAR(100),
      warranty_period INTEGER,
      shelf_life INTEGER,
      has_batch BOOLEAN DEFAULT false,
      batch_tracking BOOLEAN DEFAULT false,
      has_expiry BOOLEAN DEFAULT false,
      expiry_tracking BOOLEAN DEFAULT false,
      serial_tracking BOOLEAN DEFAULT false,
      has_colors BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'active',
      entry_date DATE,
      image_url TEXT,
      product_image TEXT,
      attachments TEXT,
      notes TEXT,
      general_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  // إنشاء الفهارس الأساسية
  // The canonical dump predates products.barcode. CREATE TABLE IF NOT EXISTS does
  // not add missing columns to an existing restored table, so migrate it before
  // creating the barcode index below.
  await tenantClient.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100)`, [])

  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code)`, [])
  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name)`, [])
  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`, [])
  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)`, [])
  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`, [])

  // تأكد من وجود الجداول الأخرى الأساسية
  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      branch_code VARCHAR(50) NOT NULL,
      branch_name VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      department_code VARCHAR(50),
      department_name VARCHAR(255),
      branch_id INTEGER REFERENCES branches(id),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      username VARCHAR(100),
      email VARCHAR(100),
      password_hash VARCHAR(255),
      full_name VARCHAR(255),
      role VARCHAR(100),
      department VARCHAR(100),
      organization_id INTEGER,
      permissions JSONB,
      branch_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS user_access (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      access_id INTEGER,
      is_granted BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS voucher_book_user_permissions_tbl (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      voucher_type_id INTEGER,
      vch_book_id INTEGER,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )
}

async function ensureModernVoucherItemsTable(tenantClient: ReturnType<typeof getPoolForDb>) {
  // تأكد من وجود جدول رؤوس الفواتير أولاً
  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS voucher_header_tbl (
      id SERIAL PRIMARY KEY,
      voucher_type_id INTEGER,
      vch_book_id INTEGER,
      vch_date DATE,
      vch_code VARCHAR(50),
      branch_id INTEGER,
      user_id VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(`DROP TABLE IF EXISTS public.voucher_items CASCADE`, [])
  await tenantClient.query(`DROP TABLE IF EXISTS public.voucher_items_tbl CASCADE`, [])

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS voucher_items_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      item_id INTEGER,
      item_name VARCHAR(140),
      unit_id INTEGER,
      qnty DOUBLE PRECISION,
      bonus DOUBLE PRECISION,
      discount DOUBLE PRECISION,
      vat_classification_id INTEGER,
      vat_amount DOUBLE PRECISION,
      vat_ratio DOUBLE PRECISION,
      price DOUBLE PRECISION,
      note VARCHAR(200),
      cost_price DOUBLE PRECISION,
      barcode VARCHAR(150),
      size_id INTEGER,
      color_taste_id INTEGER,
      length INTEGER,
      width INTEGER,
      height INTEGER,
      count INTEGER,
      order_item_id INTEGER,
      delivery_item_id INTEGER,
      production_date DATE,
      expiry_date DATE,
      batch_no VARCHAR(30),
      store_id INTEGER,
      journal_id INTEGER,
      return_sales_invoice_id INTEGER
    )`,
    [],
  )
  await tenantClient.query(`CREATE INDEX IF NOT EXISTS idx_voucher_items_tbl_voucher_id ON voucher_items_tbl(voucher_id)`, [])
}

async function ensureModernProductColumns(tenantClient: ReturnType<typeof getPoolForDb>) {
  const productColumns: Array<[string, string]> = [
    ["barcode", "VARCHAR(100)"],
    ["product_name_en", "TEXT"],
    ["category_id", "INTEGER"],
    ["main_stock_id", "INTEGER"],
    ["default_store", "INTEGER"],
    ["brand", "TEXT"],
    ["model", "TEXT"],
    ["factory_number", "TEXT"],
    ["original_number", "TEXT"],
    ["measurment_unit", "INTEGER DEFAULT 1"],
    ["measurment_id", "INTEGER DEFAULT 1"],
    ["last_purchase_price", "NUMERIC(18,4) DEFAULT 0"],
    ["currency_id", "INTEGER DEFAULT 1"],
    ["tax_rate", "NUMERIC(18,4) DEFAULT 0"],
    ["discount_rate", "NUMERIC(18,4) DEFAULT 0"],
    ["location", "TEXT"],
    ["has_expiry_date", "BOOLEAN DEFAULT false"],
    ["has_batch_number", "BOOLEAN DEFAULT false"],
    ["serial_tracking", "BOOLEAN DEFAULT false"],
    ["status", "INTEGER DEFAULT 1"],
    ["type", "INTEGER DEFAULT 1"],
    ["service_type", "INTEGER DEFAULT 0"],
    ["product_type", "INTEGER DEFAULT 1"],
    ["tax_classification_id", "INTEGER"],
    ["length", "NUMERIC(18,4) DEFAULT 0"],
    ["width", "NUMERIC(18,4) DEFAULT 0"],
    ["height", "NUMERIC(18,4) DEFAULT 0"],
    ["density", "NUMERIC(18,4) DEFAULT 0"],
    ["color", "TEXT"],
    ["size", "TEXT"],
    ["notes", "TEXT"],
    ["manufacturer_company", "TEXT"],
    ["product_image", "TEXT"],
    ["selling_account_id", "INTEGER"],
    ["purchase_account_id", "INTEGER"],
    ["selling_returns_account_id", "INTEGER"],
    ["purchase_returns_account_id", "INTEGER"],
    ["stock_end_account_id", "INTEGER"],
    ["stock_start_account_id", "INTEGER"],
    ["production_account_id", "INTEGER"],
    ["municipality_service_account_id", "INTEGER"],
    ["lsti3mal_account_id", "INTEGER"],
    ["deleted", "BOOLEAN DEFAULT false"],
    ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
    ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
    ["entry_date", "DATE DEFAULT CURRENT_DATE"],
    ["has_colors", "BOOLEAN DEFAULT false"],
  ]

  for (const [columnName, columnType] of productColumns) {
    await tenantClient.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}`, [])
  }
}

// بعد إنشاء قاعدة الشركة من dump المشروع مباشرة، نمنح admin جميع التعريفات الموجودة في قاعدة
// الشركة الجديدة دون الحاجة إلى أي قالب منفصل أو قاعدة مرجعية خارجية.
async function seedAccessListsAndGrantAdmin(tenantClient: ReturnType<typeof getPoolForDb>) {
  const accessList = await tenantClient.query(`SELECT id FROM access_list ORDER BY id`, [])
  for (const item of accessList) {
    await tenantClient.query(
      `INSERT INTO user_access (user_id, access_id, is_granted) VALUES ($1, $2, true)
       ON CONFLICT (user_id, access_id) DO UPDATE SET is_granted = true`,
      ["1", item.id],
    )
  }
}

async function seedManagementAccessDefinitions(tenantClient: ReturnType<typeof getPoolForDb>) {
  const categories = await tenantClient.query(`SELECT id, name FROM access_category ORDER BY id`, [])
  for (const category of categories) {
    await managementSql`
      INSERT INTO access_category (id, name)
      VALUES (${category.id}, ${category.name})
      ON CONFLICT (id) DO NOTHING
    `
  }

  const items = await tenantClient.query(`SELECT id, name, category_id FROM access_list ORDER BY id`, [])
  for (const item of items) {
    await managementSql`
      INSERT INTO access_list (id, name, category_id)
      VALUES (${item.id}, ${item.name}, ${item.category_id})
      ON CONFLICT (id) DO NOTHING
    `
  }

  await managementSql`SELECT setval(pg_get_serial_sequence('access_category', 'id'), COALESCE((SELECT MAX(id) FROM access_category), 1))`
  await managementSql`SELECT setval(pg_get_serial_sequence('access_list', 'id'), COALESCE((SELECT MAX(id) FROM access_list), 1))`
}

// صلاحيات دفاتر السندات (voucher_book_user_permissions_tbl — انظر app/api/voucher-book-permissions/
// _lib.ts لشرح الجداول الثلاثة) لمستخدم admin (user_id='1'/id=1 المُنشأ للتو): تُمنَح كل الدفاتر
// (voucher_books_tbl، مُستنسَخة ببياناتها أصلاً ضمن LOOKUP_TABLES أعلاه) لكل نوع سند (voucher_types_tbl)
// دون استثناء — بلا هذا لا يستطيع admin استخدام أي سند إطلاقاً بشركة حديثة التزويد (شاشة كل سند تفرض
// دفتراً من ضمن صلاحيات المستخدم). الدفتر الافتراضي (is_default=1) هو الدفتر المُسمّى "0" تحديداً
// (يُنشَأ دوماً ضمن ensureTables بذلك المسار) لا أول دفتر بالترتيب، مطابقاً لطلب المستخدم صراحةً.
async function seedVoucherBookPermissionsForAdmin(
  tenantClient: ReturnType<typeof getPoolForDb>,
  adminUserRowId: number,
) {
  const types = await tenantClient.query(`SELECT id FROM voucher_types_tbl WHERE COALESCE(status, 1) != 3`, [])
  const books = await tenantClient.query(`SELECT id, name FROM voucher_books_tbl`, [])
  if (books.length === 0) return

  const defaultBook = books.find((b: any) => String(b.name).trim() === "0") ?? books[0]

  // The dump can already contain permissions for its placeholder admin. Replace
  // those rows instead of appending another full copy on every provisioning retry.
  await tenantClient.query(`DELETE FROM voucher_book_user_permissions_tbl WHERE user_id = $1`, [adminUserRowId])

  for (const type of types) {
    for (const book of books) {
      await tenantClient.query(
        `INSERT INTO voucher_book_user_permissions_tbl (user_id, voucher_type_id, vch_book_id, is_default) VALUES ($1, $2, $3, $4)`,
        [adminUserRowId, type.id, book.id, book.id === defaultBook.id ? 1 : 0],
      )
    }
  }
}

// فرع وقسم افتراضيان لكل شركة جديدة — بلا أي فرع/قسم، شاشات كثيرة (تسجيل الدخول نفسه عبر
// user_settings.branch_id، شاشات المخزون والسندات) تفترض وجود فرع واحد على الأقل.
async function seedDefaultBranchAndSection(tenantClient: ReturnType<typeof getPoolForDb>) {
  const branchResult = await tenantClient.query(
    `INSERT INTO branches (branch_code, branch_name, is_active, status)
     VALUES ($1, $2, true, 1)
     ON CONFLICT (branch_code) DO UPDATE SET
       branch_name = EXCLUDED.branch_name,
       is_active = true,
       status = 1
     RETURNING id`,
    ["0001", "الرئيسي"],
  )
  const branchId = branchResult[0].id

  await tenantClient.query(
    `INSERT INTO departments (department_code, department_name, branch_id, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (department_code) DO UPDATE SET
       department_name = EXCLUDED.department_name,
       branch_id = EXCLUDED.branch_id,
       is_active = true`,
    ["D1", "الادارة", branchId],
  )

  return branchId
}

// مستودع افتراضي واحد باسم "الرئيسي" (مطابق لاسم الفرع الافتراضي) — بلا هذا تُنشئ /api/warehouses
// GET (أول استدعاء لها فقط، إذ الجدول فارغ) خمسة مستودعات إنجليزية الاسم (MAIN/SALES/PROD/DMGD/RETN)
// بدل مستودع واحد يطابق تسمية الفرع؛ إدراجه هنا مسبقاً يجعل ذلك المسار اللاحق بلا أثر (شرطه
// COUNT(*) = 0 لن يتحقق).
async function seedDefaultStore(tenantClient: ReturnType<typeof getPoolForDb>) {
  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      warehouse_code VARCHAR(10) UNIQUE NOT NULL,
      warehouse_name VARCHAR(100) NOT NULL,
      warehouse_name_en VARCHAR(100),
      description TEXT,
      location VARCHAR(200),
      is_active BOOLEAN DEFAULT true,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )
  await tenantClient.query(
    `INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_name_en, is_active, status)
     VALUES ($1, $2, $3, true, 1)
     ON CONFLICT (warehouse_code) DO UPDATE SET
       warehouse_name = EXCLUDED.warehouse_name,
       warehouse_name_en = EXCLUDED.warehouse_name_en,
       is_active = true,
       status = 1`,
    ["MAIN", "الرئيسي", "Main"],
  )
}

async function tableExists(tenantClient: ReturnType<typeof getPoolForDb>, tableName: string) {
  const rows = await tenantClient.query(
    `SELECT to_regclass($1) AS table_name`,
    [`public.${tableName}`],
  )
  return !!rows[0]?.table_name
}

async function seedDefaultSystemSettings(tenantClient: ReturnType<typeof getPoolForDb>) {
  if (!(await tableExists(tenantClient, "system_settings"))) {
    await tenantClient.query(
      `CREATE TABLE IF NOT EXISTS system_settings (
        id VARCHAR(100) PRIMARY KEY,
        description VARCHAR(255),
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      [],
    )
  }

  const idTypeRows = await tenantClient.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'system_settings' AND column_name = 'id'
     LIMIT 1`,
    [],
  )
  const idIsInteger = /int/i.test(String(idTypeRows[0]?.data_type || ""))

  await tenantClient.query(`ALTER TABLE system_settings ALTER COLUMN id TYPE VARCHAR(100) USING id::TEXT`, []).catch(() => {})
  await tenantClient.query(`ALTER TABLE system_settings ALTER COLUMN id DROP DEFAULT`, []).catch(() => {})
  await tenantClient.query(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description TEXT`, []).catch(() => {})
  await tenantClient.query(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS value TEXT`, []).catch(() => {})

  const rows = [
    ["invoice_prefix", "INV"],
    ["sales_invoice_prefix", "INV"],
    ["delivery_sell_prefix", "DSL"],
    ["purchase_invoice_prefix", "INV"],
    ["invoice_start", "1"],
    ["sales_invoice_start", "1"],
    ["delivery_sell_start", "1"],
    ["purchase_invoice_start", "1"],
  ] as const

  for (const [key, value] of rows) {
    if (idIsInteger) {
      const updated = await tenantClient.query(
        `UPDATE system_settings SET description = $1, value = $2 WHERE description = $1`,
        [key, value],
      )
      if (Number(updated?.[0]?.rowCount ?? 0) === 0) {
        await tenantClient.query(
          `INSERT INTO system_settings (description, value) VALUES ($1, $2)`,
          [key, value],
        )
      }
    } else {
      await tenantClient.query(
        `INSERT INTO system_settings (id, description, value) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, value = EXCLUDED.value`,
        [key, key, value],
      )
    }
  }
}

// Only shared reference/lookup values are allowed to survive the project-dump
// restore. Everything that belongs to a company (files/master records,
// transactions, users, logs, attachments, workflow executions, etc.) must start
// empty. New-company defaults such as its branch, store and administrator are
// inserted after this cleanup.
const FRESH_COMPANY_LOOKUP_TABLES = new Set([
  "access_category",
  "access_list",
  "account_classification_types",
  "balance_sheet_assets_items",
  "balance_sheet_liabilities_items",
  "income_statement_items",
  "payment_classifications_tbl",
  "tax_classifications",
  "pricecategory",
  "measurment_types_tbl",
  "cities",
  "currency",
  "units",
  "customer_categories",
  "supplier_categories",
  "item_categories",
  "item_groups",
  "product_categories",
  "cheque_status_tbl",
  "cheque_book_status_tbl",
  "cheques_type_tbl",
  "credit_card_main_types_tbl",
  "credit_card_commission_types_tbl",
  "credit_cards_types_tbl",
  "voucher_types_tbl",
  "voucher_books_tbl",
  "voucher_status_tbl",
  "voucher_journal_type_tbl",
  "voucher_journal_type_caption_tbl",
  "workflow_stages",
  "workflow_sequences",
  "workflow_sequence_steps",
])

const SCHEMA_METADATA_TABLES = new Set(["_prisma_migrations", "schema_migrations"])

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

async function clearFreshCompanyNonLookupData(tenantClient: ReturnType<typeof getPoolForDb>) {
  const tables = await tenantClient.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [],
  )

  const tablesToClear = tables
    .map((row: { table_name: string }) => row.table_name)
    .filter((tableName: string) =>
      !FRESH_COMPANY_LOOKUP_TABLES.has(tableName) &&
      !SCHEMA_METADATA_TABLES.has(tableName) &&
      tableName !== "spatial_ref_sys" &&
      tableName !== "geography_columns" &&
      tableName !== "geometry_columns"
    )

  if (tablesToClear.length === 0) return

  const tableList = tablesToClear.map(quoteIdentifier).join(", ")
  await tenantClient.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`, [])
}

export async function provisionCompanyDatabase(
  company: { id: number; name: string; requestedByEmail: string; requestedByFullName: string; requestedByPasswordHash: string },
  approvedByUserId: number,
  // expiryDays: مدة الاشتراك الممنوحة عند التزويد (365 للاعتماد العادي عبر لوحة الإدارة، 10 للشركة
  // التجريبية ذاتية الاعتماد — انظر app/api/management/companies/trial/route.ts).
  options: { expiryDays?: number } = {},
) {
  await ensureManagementTables()

  const dbName = await generateUniqueDbName()
  await createCompanyDatabaseFromScript(dbName)

  const tenantClient = getPoolForDb(dbName)

  // تأكد من وجود الجداول الأساسية (خاصة products) قبل محاولة إضافة الأعمدة
  await ensureBasicProductsTable(tenantClient)
  await ensureModernProductColumns(tenantClient)
  await ensureModernVoucherItemsTable(tenantClient)
  await clearFreshCompanyNonLookupData(tenantClient)
  const branchId = await seedDefaultBranchAndSection(tenantClient)
  await seedDefaultStore(tenantClient)
  await seedDefaultSystemSettings(tenantClient)
  await seedManagementAccessDefinitions(tenantClient)

  // A restored or partially seeded database may contain the placeholder admin under
  // either unique key. Clear both identities before inserting the company's owner;
  // ON CONFLICT can target only one constraint and therefore cannot handle both safely.
  await tenantClient.query(
    `DELETE FROM voucher_book_user_permissions_tbl
     WHERE user_id IN (
       SELECT id FROM user_settings WHERE user_id = $1 OR LOWER(username) = LOWER($2)
     )`,
    ["1", "admin"],
  )
  await tenantClient.query(
    `DELETE FROM user_settings WHERE user_id = $1 OR LOWER(username) = LOWER($2)`,
    ["1", "admin"],
  )
  const insertedAdmin = await tenantClient.query(
    `INSERT INTO user_settings (
      user_id, username, email, password_hash, full_name, role, department,
      organization_id, permissions, branch_id, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      "1",
      "admin",
      company.requestedByEmail,
      company.requestedByPasswordHash,
      company.requestedByFullName,
      "مدير النظام",
      "الإدارة",
      1,
      JSON.stringify(["جميع الصلاحيات"]),
      branchId,
      true,
    ],
  )
  const adminUserRowId = Number(insertedAdmin[0]?.id)
  if (!Number.isInteger(adminUserRowId) || adminUserRowId <= 0) {
    throw new Error("Failed to create the tenant administrator")
  }

  await seedAccessListsAndGrantAdmin(tenantClient)
  await seedVoucherBookPermissionsForAdmin(tenantClient, adminUserRowId)

  // اشتراك بمدة expiryDays (سنة واحدة افتراضياً) من تاريخ الاعتماد الفعلي، ونطاق مستخدمين افتراضي
  // = 1 (محجوز لاستخدام مستقبلي — لا فرض/تحقق فعلي لعدد المستخدمين مقابل هذا الحد بعد).
  const expiryDays = options.expiryDays ?? 365
  const updated = await managementSql`
    UPDATE companies
    SET db_name = ${dbName}, status = 'approved', approved_by = ${approvedByUserId}, approved_at = CURRENT_TIMESTAMP,
        expiry_date = CURRENT_TIMESTAMP + (${expiryDays} * INTERVAL '1 day'), number_of_users = 1
    WHERE id = ${company.id}
    RETURNING expiry_date
  `

  return { dbName, expiryDate: updated[0]?.expiry_date ?? null }
}
