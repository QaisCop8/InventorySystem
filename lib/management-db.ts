import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { isNeonDatabaseUrl, withDatabaseName } from "./db-url"

const MANAGEMENT_DB_NAME = "management"

function buildSqlClient(connectionUrl: string) {
  if (!isNeonDatabaseUrl(connectionUrl)) {
    const pool = new Pool({ connectionString: connectionUrl })
    const client: any = async (strings: TemplateStringsArray, ...values: any[]) => {
      const conn = await pool.connect()
      try {
        const query = strings.reduce((prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""), "")
        const result = await conn.query(query, values)
        return result.rows
      } finally {
        conn.release()
      }
    }
    // استعلام نصّي خام (بلا قالب) — تحتاجه lib/provisioning.ts لتنفيذ CREATE DATABASE، وهي عبارة
    // DDL لا يمكن تمرير اسمها كمعامل $1 مربوط عادي.
    client.unsafe = async (text: string, params: any[] = []) => {
      const conn = await pool.connect()
      try {
        const result = await conn.query(text, params)
        return result.rows
      } finally {
        conn.release()
      }
    }
    return client
  }
  return neon(connectionUrl)
}

const managementUrl = (process.env.DATABASE_URL || "").trim()
const adminUrl = managementUrl ? withDatabaseName(managementUrl, "postgres") : ""

function createNoopSqlClient(): any {
  const client: any = async () => []
  client.unsafe = async () => []
  return client
}

// اتصال ثابت بقاعدة "الإدارة" (management) — على عكس sql الافتراضي في lib/database.ts، هذا الاتصال
// لا يتبدّل أبداً بحسب الشركة/الجلسة الحالية؛ يبقى دوماً نفس قاعدة الإدارة بصرف النظر عن أي كوكي
// tenant_db مضبوط، لأنها تخزّن حسابات المستخدمين والشركات نفسها لا بيانات شركة بعينها.
const sql: any = managementUrl ? buildSqlClient(managementUrl) : createNoopSqlClient()

export default sql

let managementDbEnsured: Promise<void> | null = null

// تُنشئ قاعدة management بالاتصال بقاعدة الصيانة postgres. لا تعتمد عملية البدء على وجود
// inventory_system أو أي قاعدة شركة مسبقاً.
async function ensureManagementDatabaseExists() {
  if (!managementUrl || !adminUrl) return
  const pool = new Pool({ connectionString: adminUrl })
  try {
    const existing = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [MANAGEMENT_DB_NAME])
    if (existing.rows.length === 0) {
      await pool.query(`CREATE DATABASE "${MANAGEMENT_DB_NAME}"`)
    }
  } finally {
    await pool.end()
  }
}

export function ensureManagementTables(): Promise<void> {
  if (!managementUrl) return Promise.resolve()
  if (!managementDbEnsured) {
    managementDbEnsured = (async () => {
      await ensureManagementDatabaseExists()
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(150) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email_verified BOOLEAN DEFAULT false,
          email_verification_token VARCHAR(255),
          is_platform_admin BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      // Ensure `email_verified` exists for older databases created before this column was added
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`
      await sql`
        CREATE TABLE IF NOT EXISTS companies (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          db_name VARCHAR(100) UNIQUE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_by INTEGER REFERENCES users(id),
          approved_by INTEGER REFERENCES users(id),
          approved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      // انتهاء الاشتراك: يُضبَط سنة واحدة من تاريخ الاعتماد (provisionCompanyDatabase)، لا وقت
      // الإنشاء (طلب معلَّق قد ينتظر الموافقة أياماً قبل أن يبدأ الاشتراك فعلياً). "منتهية" حالة
      // محسوبة (status='approved' AND expiry_date < now()) لا عمود قائم بذاته — بهذا "تمديد
      // الاشتراك" يكفيه تحديث expiry_date وحدها لإعادة تفعيل الشركة تلقائياً دون أي تحوّل حالة إضافي.
      // status='stopped' حالة منفصلة (إيقاف إداري يدوي من لوحة التحكم)، تُميَّز عن الانتهاء الطبيعي
      // بالتاريخ لكن تُعامَل بنفس المنع تماماً عند اختيار الشركة (select-company).
      await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP`
      await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_of_users INTEGER DEFAULT 1`
      await sql`
        CREATE TABLE IF NOT EXISTS user_company (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          company_id INTEGER REFERENCES companies(id),
          role VARCHAR(20) DEFAULT 'owner',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, company_id)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS management_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // ارتباط موظف شركة بحساب إدارة عام (اختياري — يُضبَط فقط عبر مسار إنشاء المستخدم الجديد
      // ثنائي القاعدة، انظر lib/permissions.ts وخطة الصلاحيات) — نشِط/متوقف مقيَّد بهذه العلاقة
      // (شركة بعينها) لا بالحساب العام نفسه (users.is_active محجوز لمسؤول المنصة فقط).
      await sql`ALTER TABLE user_company ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`

      // تعريفات الصلاحيات القانونية (access_category/access_list) — قاعدة الإدارة هي المصدر الوحيد
      // للحقيقة من الآن فصاعداً (شاشة "تعريف الصلاحيات" بلوحة تحكم المنصة تكتب هنا)؛ كل قاعدة شركة
      // تُزامِن نسخة منها عند كل تحميل صفحة رئيسية (syncPermissionDefinitions بـlib/permissions.ts).
      await sql`
        CREATE TABLE IF NOT EXISTS access_category (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS access_list (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category_id INTEGER REFERENCES access_category(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`ALTER TABLE access_list ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
      await sql`ALTER TABLE access_list ADD COLUMN IF NOT EXISTS sort_order INTEGER`
      await sql`
        UPDATE access_list
        SET name = 'إضافة مسودة طلبية مبيعات', updated_at = CURRENT_TIMESTAMP
        WHERE name = 'ادخال مسودة طلبية مبيعات'
          AND NOT EXISTS (
            SELECT 1 FROM access_list existing
            WHERE existing.name = 'إضافة مسودة طلبية مبيعات'
          )
      `
      const draftCategoryRows = await sql`
        INSERT INTO access_category (name)
        SELECT 'الحركات'
        WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = 'الحركات')
        RETURNING id
      `
      const draftCategory = draftCategoryRows[0] || (await sql`SELECT id FROM access_category WHERE name = 'الحركات' ORDER BY id LIMIT 1`)[0]
      if (draftCategory?.id) {
        for (const permissionName of [
          'إضافة مسودة طلبية مبيعات',
          'تعديل مسودة طلبية مبيعات',
          'استعلام مسودة طلبية مبيعات',
        ]) {
          await sql`
            INSERT INTO access_list (name, category_id)
            SELECT ${permissionName}, ${draftCategory.id}
            WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${permissionName})
          `
        }
      }
      await sql`DELETE FROM access_list WHERE name IN ('استلام طلب الصناعة', 'تدقيق الصناعة', 'استلام الصناعة من الفرع')`
      await sql`UPDATE access_list SET sort_order = CASE name
        WHEN 'إنشاء طلب بضاعة داخلي' THEN 1
        WHEN 'تدقيق طلب البضاعة' THEN 2
        WHEN 'تجهيز طلبات البضاعة الداخلية' THEN 3
        WHEN 'تدقيق الطلبات الجاهزة' THEN 4
        WHEN 'إرسال طلبات البضاعة' THEN 5
        WHEN 'استلام طلبات البضاعة' THEN 6
        WHEN 'تدقيق البضاعة المستلمة' THEN 7
        ELSE sort_order END
        WHERE name IN ('إنشاء طلب بضاعة داخلي', 'تدقيق طلب البضاعة', 'تجهيز طلبات البضاعة الداخلية', 'تدقيق الطلبات الجاهزة', 'إرسال طلبات البضاعة', 'استلام طلبات البضاعة', 'تدقيق البضاعة المستلمة')`
      // مجهود أفضل (best effort): هذا استيراد لمرة واحدة من قاعدة مرجعية خارجية قد لا تملك الجداول
      // المتوقعة أو يتعذّر الاتصال بها — فشله يجب ألّا يُسقِط إنشاء جداول الإدارة نفسها، وإلا ستفشل
      // كل عملية تعتمد على ensureManagementTables (مثل إضافة صلاحية جديدة من "تعريف الصلاحيات")
      // بشكل دائم في كل طلب لاحق أيضاً، لا لمرة واحدة فقط.
    })().catch((error) => {
      managementDbEnsured = null
      throw error
    })
  }
  return managementDbEnsured
}

/**
 * Idempotent repair used by the permissions screen. Unlike the one-time table
 * initializer, this runs on every permission-definition sync, so a long-lived
 * server process also receives newly deployed access definitions immediately.
 */
export async function ensureSalesDraftPermissionDefinitions(): Promise<void> {
  await ensureManagementTables()

  await sql`
    UPDATE access_list
    SET name = 'إضافة مسودة طلبية مبيعات', updated_at = CURRENT_TIMESTAMP
    WHERE name = 'ادخال مسودة طلبية مبيعات'
      AND NOT EXISTS (
        SELECT 1 FROM access_list existing
        WHERE existing.name = 'إضافة مسودة طلبية مبيعات'
      )
  `

  const insertedCategories = await sql`
    INSERT INTO access_category (name)
    SELECT 'الحركات'
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = 'الحركات')
    RETURNING id
  `
  const category = insertedCategories[0] || (await sql`
    SELECT id FROM access_category WHERE name = 'الحركات' ORDER BY id LIMIT 1
  `)[0]

  if (!category?.id) return
  for (const permissionName of [
    "إضافة مسودة طلبية مبيعات",
    "تعديل مسودة طلبية مبيعات",
    "استعلام مسودة طلبية مبيعات",
  ]) {
    await sql`
      INSERT INTO access_list (name, category_id)
      SELECT ${permissionName}, ${category.id}
      WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${permissionName})
    `
  }
}

/** Seeds the canonical transaction/action permission matrix in management DB. */
export async function ensureTransactionPermissionDefinitions(): Promise<void> {
  await ensureManagementTables()
  const {
    TRANSACTION_ACTION_LABELS,
    TRANSACTION_FAMILIES,
    TRANSACTION_PERMISSION_CATEGORY,
    legacyTransactionPermissionName,
    transactionPermissionName,
  } = await import("@/lib/transaction-permission-definitions")

  await sql`
    SELECT setval(
      pg_get_serial_sequence('access_category', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM access_category), 0), 1),
      true
    )
  `
  await sql`
    SELECT setval(
      pg_get_serial_sequence('access_list', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM access_list), 0), 1),
      true
    )
  `

  const inserted = await sql`
    INSERT INTO access_category (name)
    SELECT ${TRANSACTION_PERMISSION_CATEGORY}
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = ${TRANSACTION_PERMISSION_CATEGORY})
    RETURNING id
  `
  const category = inserted[0] || (await sql`
    SELECT id FROM access_category WHERE name = ${TRANSACTION_PERMISSION_CATEGORY} ORDER BY id LIMIT 1
  `)[0]
  if (!category?.id) return

  for (const family of Object.keys(TRANSACTION_FAMILIES) as Array<keyof typeof TRANSACTION_FAMILIES>) {
    for (const action of Object.keys(TRANSACTION_ACTION_LABELS) as Array<keyof typeof TRANSACTION_ACTION_LABELS>) {
      const name = transactionPermissionName(family, action)
      const legacyName = legacyTransactionPermissionName(family, action)
      if (legacyName) {
        await sql`
          UPDATE access_list SET name = ${name}, category_id = ${category.id}, updated_at = CURRENT_TIMESTAMP
          WHERE name = ${legacyName}
            AND NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${name})
        `
      }
      await sql`
        INSERT INTO access_list (name, category_id)
        SELECT ${name}, ${category.id}
        WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${name})
      `
      await sql`UPDATE access_list SET category_id = ${category.id} WHERE name = ${name}`
    }
  }

  await sql`
    DELETE FROM access_list duplicate
    USING access_list canonical
    WHERE LOWER(BTRIM(duplicate.name)) = LOWER(BTRIM(canonical.name))
      AND duplicate.id > canonical.id
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_access_list_normalized_name
    ON access_list (LOWER(BTRIM(name)))
  `
}

let managementPool: Pool | null = null

// pg.Pool حقيقي لقاعدة الإدارة — يحتاجه أي كود يريد معاملة (BEGIN/COMMIT/ROLLBACK) عبر عدة استعلامات
// على نفس الاتصال (sql الافتراضي أعلاه يفتح ويُغلق اتصالاً منفصلاً بكل استدعاء، انظر buildSqlClient،
// فلا يصلح لمعاملة متعددة الاستعلامات)، بنفس نمط getTenantPool في lib/database.ts تماماً.
export function getManagementPool(): Pool {
  if (!managementUrl) {
    throw new Error("DATABASE_URL is not configured for management database access")
  }
  if (!managementPool) {
    managementPool = new Pool({ connectionString: managementUrl })
  }
  return managementPool
}
