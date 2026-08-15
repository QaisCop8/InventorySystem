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

// نسخة أولى لمرة واحدة فقط (حارسها COUNT(*) أدناه) من access_category/access_list الحاليتين بقاعدة
// الشركة المرجعية (نفس القاعدة التي كان lib/provisioning.ts يعتمدها ضمنياً "قالباً" سلفاً) إلى قاعدة
// الإدارة — بعدها تصبح قاعدة الإدارة وحدها المصدر المُعتمَد، ولا تُعاد هذه النسخة أبداً (لا تُكرَّر
// ولا تُحدِّث صفوفاً أضافها مسؤول المنصة لاحقاً عبر الشاشة الجديدة).
/* Legacy reference-database importer intentionally disabled. New tenants are restored
   from the project dump and no database is used as a template.
async function seedAccessDefinitionsFromReferenceOnce(): Promise<void> {
  // Retained only for source compatibility with older builds; provisioning no longer
  // calls this importer or reads from another database.
  const templateUrl = ""
  const existing = await sql`SELECT COUNT(*)::int AS n FROM access_category`
  if (Number(existing[0]?.n) > 0) return

  if (!templateUrl) return
  // قالب الشركات يُنشأ مرة واحدة بواسطة scripts/bootstrap-databases.sh ويحوي التعريفات الثابتة.
  const referencePool = new Pool({ connectionString: templateUrl })
  try {
    const categories = await referencePool.query(`SELECT id, name FROM access_category ORDER BY id`)
    for (const category of categories.rows) {
      await sql`INSERT INTO access_category (id, name) VALUES (${category.id}, ${category.name}) ON CONFLICT (id) DO NOTHING`
    }
    const items = await referencePool.query(`SELECT id, name, category_id FROM access_list ORDER BY id`)
    for (const item of items.rows) {
      await sql`INSERT INTO access_list (id, name, category_id) VALUES (${item.id}, ${item.name}, ${item.category_id}) ON CONFLICT (id) DO NOTHING`
    }
  } finally {
    await referencePool.end()
  }

  // الإدراج بمعرّف صريح أعلاه لا يُقدِّم تسلسل SERIAL (nextval لم يُستدعَ إطلاقاً) — فيبقى متأخراً
  // عند رقمه الافتراضي بينما الجدول يحوي فعلياً معرّفات أعلى بكثير، فيصطدم أول إدراج طبيعي لاحق
  // (بلا معرّف صريح، كإضافة صلاحية جديدة من شاشة "تعريف الصلاحيات") بمعرّف موجود مسبقاً
  // (duplicate key value violates unique constraint). يُزامَن التسلسلان هنا فوراً بعد هذا النسخ.
  await sql`SELECT setval(pg_get_serial_sequence('access_category', 'id'), COALESCE((SELECT MAX(id) FROM access_category), 1))`
  await sql`SELECT setval(pg_get_serial_sequence('access_list', 'id'), COALESCE((SELECT MAX(id) FROM access_list), 1))`
}
*/

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
