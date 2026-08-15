import crypto from "crypto"
import { execFileSync } from "child_process"
import path from "path"
import managementSql, { ensureManagementTables } from "./management-db"
import { getPoolForDb } from "./database"

function generateDbName(): string {
  return `co_${crypto.randomBytes(4).toString("hex")}`
}

async function generateUniqueDbName(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateDbName()
    const existing = await managementSql`SELECT id FROM companies WHERE db_name = ${candidate}`
    if (existing.length === 0) return candidate
  }
  throw new Error("تعذّر توليد معرّف فريد لقاعدة بيانات الشركة")
}

const templateDbName = "company_template"

async function ensureCompanyTemplateDatabaseExists() {
  if (!process.env.DATABASE_URL) return

  const { Pool } = await import("pg")
  const { withDatabaseName } = await import("./db-url")
  const adminUrl = withDatabaseName(process.env.DATABASE_URL, "postgres")
  if (!adminUrl) return

  const adminPool = new Pool({ connectionString: adminUrl })
  try {
    const existing = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [templateDbName])
    if (existing.rows.length > 0) return
  } finally {
    await adminPool.end().catch(() => {})
  }

  const bootstrapScript = path.resolve(process.cwd(), "scripts", "bootstrap-databases.sh")
  try {
    execFileSync("bash", [bootstrapScript], {
      env: process.env,
      stdio: "inherit",
    })
  } catch (error) {
    console.error("[provisioning] bootstrap-databases.sh failed while creating company template:", error)
    throw new Error("تعذّر إنشاء قاعدة القالب company_template. تأكد من تشغيل bootstrap-databases.sh أو التحقق من وجود قاعدة company_template على الخادم.")
  }
}

async function ensureModernVoucherItemsTable(tenantClient: ReturnType<typeof getPoolForDb>) {
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

// تعريفات الصلاحيات والبيانات الثابتة موجودة أصلاً داخل company_template. هنا نمنح admin
// جميع التعريفات الموجودة في قاعدة الشركة الجديدة من دون قراءة أي قاعدة مرجعية خارجية.
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

// صلاحيات دفاتر السندات (voucher_book_user_permissions_tbl — انظر app/api/voucher-book-permissions/
// _lib.ts لشرح الجداول الثلاثة) لمستخدم admin (user_id='1'/id=1 المُنشأ للتو): تُمنَح كل الدفاتر
// (voucher_books_tbl، مُستنسَخة ببياناتها أصلاً ضمن LOOKUP_TABLES أعلاه) لكل نوع سند (voucher_types_tbl)
// دون استثناء — بلا هذا لا يستطيع admin استخدام أي سند إطلاقاً بشركة حديثة التزويد (شاشة كل سند تفرض
// دفتراً من ضمن صلاحيات المستخدم). الدفتر الافتراضي (is_default=1) هو الدفتر المُسمّى "0" تحديداً
// (يُنشَأ دوماً ضمن ensureTables بذلك المسار) لا أول دفتر بالترتيب، مطابقاً لطلب المستخدم صراحةً.
async function seedVoucherBookPermissionsForAdmin(tenantClient: ReturnType<typeof getPoolForDb>) {
  const types = await tenantClient.query(`SELECT id FROM voucher_types_tbl WHERE COALESCE(status, 1) != 3`, [])
  const books = await tenantClient.query(`SELECT id, name FROM voucher_books_tbl`, [])
  if (books.length === 0) return

  const defaultBook = books.find((b: any) => String(b.name).trim() === "0") ?? books[0]

  for (const type of types) {
    for (const book of books) {
      await tenantClient.query(
        `INSERT INTO voucher_book_user_permissions_tbl (user_id, voucher_type_id, vch_book_id, is_default) VALUES ($1, $2, $3, $4)`,
        ["1", type.id, book.id, book.id === defaultBook.id ? 1 : 0],
      )
    }
  }
}

// فرع وقسم افتراضيان لكل شركة جديدة — بلا أي فرع/قسم، شاشات كثيرة (تسجيل الدخول نفسه عبر
// user_settings.branch_id، شاشات المخزون والسندات) تفترض وجود فرع واحد على الأقل.
async function seedDefaultBranchAndSection(tenantClient: ReturnType<typeof getPoolForDb>) {
  const branchResult = await tenantClient.query(
    `INSERT INTO branches (branch_code, branch_name, is_active, status) VALUES ($1, $2, true, 1) RETURNING id`,
    ["0001", "الرئيسي"],
  )
  const branchId = branchResult[0].id

  await tenantClient.query(
    `INSERT INTO departments (department_code, department_name, branch_id, is_active) VALUES ($1, $2, $3, true)`,
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
     VALUES ($1, $2, $3, true, 1)`,
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

async function clearFreshCompanySeedData(tenantClient: ReturnType<typeof getPoolForDb>) {
  const tables = ["products", "banks", "bank_accounts"]
  for (const tableName of tables) {
    if (await tableExists(tenantClient, tableName)) {
      await tenantClient.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`, [])
    }
  }
}

export async function provisionCompanyDatabase(
  company: { id: number; name: string; requestedByEmail: string; requestedByFullName: string; requestedByPasswordHash: string },
  approvedByUserId: number,
  // expiryDays: مدة الاشتراك الممنوحة عند التزويد (365 للاعتماد العادي عبر لوحة الإدارة، 10 للشركة
  // التجريبية ذاتية الاعتماد — انظر app/api/management/companies/trial/route.ts).
  options: { expiryDays?: number } = {},
) {
  await ensureManagementTables()
  await ensureCompanyTemplateDatabaseExists()

  const dbName = await generateUniqueDbName()

  // ينسخ PostgreSQL المخطط والبيانات الثابتة من القالب الذي أنشأه سكربت التثبيت. لا توجد قراءة
  // أو حاجة إلى قاعدة inventory_system عند تشغيل التطبيق أو اعتماد شركة.
  await managementSql.unsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${templateDbName}"`)

  const tenantClient = getPoolForDb(dbName)

  await ensureModernProductColumns(tenantClient)
  await ensureModernVoucherItemsTable(tenantClient)
  const branchId = await seedDefaultBranchAndSection(tenantClient)
  await seedDefaultStore(tenantClient)
  await seedDefaultSystemSettings(tenantClient)
  await clearFreshCompanySeedData(tenantClient)

  await tenantClient.query(
    `INSERT INTO user_settings (
      user_id, username, email, password_hash, full_name, role, department,
      organization_id, permissions, branch_id, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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

  await seedAccessListsAndGrantAdmin(tenantClient)
  await seedVoucherBookPermissionsForAdmin(tenantClient)

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
