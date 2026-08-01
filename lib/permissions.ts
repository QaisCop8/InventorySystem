import sql, { getPoolForDb } from "@/lib/database"
import managementSql from "@/lib/management-db"

// نظام الأدوار الوظيفية (job_roles/role_permissions) + الصلاحية الفعّالة للمستخدم = مركز صريح
// (user_access) إن وُجد → وإلا صلاحية دوره الوظيفي (role_permissions) → وإلا رفض. انظر خطة
// C:\Users\USER\.claude\plans\resilient-sprouting-sketch.md للسياق الكامل.

export const DEFAULT_JOB_ROLES = [
  { name: "مدير", grantAll: true },
  { name: "محاسب", grantAll: false },
  { name: "كاشير", grantAll: false },
] as const

// مُذاكَرة مفتاحها اسم قاعدة الشركة (dbName) — لا علم واحد للعملية بأكملها كما في ensureBranchColumn
// (lib/auth.ts) أو ensureThemeSettingsColumns (app/api/settings/theme/route.ts): تينانت لاحق يصل
// لنفس عملية Node الدافئة بعد أن اكتمل أول تينانت مختلف كان سيتخطّى DDL هذه القاعدة بالخطأ لولا هذا
// المفتاح — نفس نمط clientCache/rawPoolCache في lib/database.ts.
const ensuredTenants = new Map<string, Promise<void>>()

export function ensurePermissionTables(dbName: string): Promise<void> {
  let promise = ensuredTenants.get(dbName)
  if (!promise) {
    const client = getPoolForDb(dbName)
    promise = (async () => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS job_roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          status INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_job_roles_name ON job_roles (LOWER(name))`,
        [],
      )
      await client.query(
        `CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL REFERENCES job_roles(id) ON DELETE CASCADE,
          access_id INTEGER NOT NULL REFERENCES access_list(id) ON DELETE CASCADE,
          is_granted BOOLEAN NOT NULL DEFAULT true,
          PRIMARY KEY (role_id, access_id)
        )`,
        [],
      )
      await client.query(
        `CREATE TABLE IF NOT EXISTS role_branch_permissions (
          role_id INTEGER NOT NULL REFERENCES job_roles(id) ON DELETE CASCADE,
          branch_id INTEGER NOT NULL,
          access_id INTEGER NOT NULL REFERENCES access_list(id) ON DELETE CASCADE,
          is_granted BOOLEAN NOT NULL DEFAULT true,
          PRIMARY KEY (role_id, branch_id, access_id)
        )`,
        [],
      )
      await client.query(
        `CREATE TABLE IF NOT EXISTS user_branch_permissions (
          user_id VARCHAR(255) NOT NULL,
          branch_id INTEGER NOT NULL,
          access_id INTEGER NOT NULL REFERENCES access_list(id) ON DELETE CASCADE,
          is_granted BOOLEAN NOT NULL DEFAULT true,
          PRIMARY KEY (user_id, branch_id, access_id)
        )`,
        [],
      )
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS job_role_id INTEGER REFERENCES job_roles(id) ON DELETE SET NULL`, [])
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS management_user_id INTEGER`, [])
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS branch_id INTEGER`, [])
      await client.query(
        `CREATE TABLE IF NOT EXISTS tenant_sessions (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
    })().catch((error) => {
      ensuredTenants.delete(dbName)
      throw error
    })
    ensuredTenants.set(dbName, promise)
  }
  return promise
}

// يُستخدَم من كل من مسار user-access (عرض الصلاحية الفعّالة لكل مستخدم) وlib/tenant-auth.ts
// (requirePermission) — منطق COALESCE واحد مكتوب مرة واحدة فقط.
export async function hasEffectivePermission(userId: string, accessId: number, branchId?: number | null): Promise<boolean> {
  const requestedBranchId = Number.isInteger(branchId) && Number(branchId) > 0 ? Number(branchId) : null
  const rows = await sql`
    SELECT COALESCE(ubp.is_granted, ua.is_granted, rbp.is_granted, rp.is_granted, FALSE) AS is_granted
    FROM user_settings us
    LEFT JOIN user_branch_permissions ubp
      ON ubp.user_id = us.user_id
      AND ubp.branch_id = COALESCE(${requestedBranchId}, us.branch_id)
      AND ubp.access_id = ${accessId}
    LEFT JOIN user_access ua ON ua.access_id = ${accessId} AND ua.user_id = us.user_id
    LEFT JOIN role_branch_permissions rbp
      ON rbp.role_id = us.job_role_id
      AND rbp.branch_id = COALESCE(${requestedBranchId}, us.branch_id)
      AND rbp.access_id = ${accessId}
    LEFT JOIN role_permissions rp ON rp.role_id = us.job_role_id AND rp.access_id = ${accessId}
    WHERE us.user_id = ${userId}
    LIMIT 1
  `
  return Boolean(rows[0]?.is_granted)
}

// تُطبَّق عند تحميل الصفحة الرئيسية (انظر نقطة الاستدعاء بـauth-context.tsx) — بلا حاجة لتشغيل أي
// سكربت يدوي لكل شركة: أي تعريف صلاحية/دور جديد يُضاف هنا هنا تلقائياً بأول تحميل صفحة لاحق.
export async function syncPermissionDefinitions(dbName: string): Promise<void> {
  await ensurePermissionTables(dbName)
  const client = getPoolForDb(dbName)

  // 1) نسخ أي صف access_category/access_list جديد من قاعدة الإدارة (management) لم يصل هذه الشركة
  //    بعد — لا يُحدَّث أي صف موجود مسبقاً إطلاقاً، فتخصيصات المسؤول (إعادة تسمية فئة/صلاحية) تبقى
  //    كما هي دوماً.
  const categories = await managementSql`SELECT id, name FROM access_category ORDER BY id`
  for (const category of categories) {
    await client.query(
      `INSERT INTO access_category (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [category.id, category.name],
    )
  }
  const accessItems = await managementSql`SELECT id, name, category_id FROM access_list ORDER BY id`
  for (const item of accessItems) {
    await client.query(
      `INSERT INTO access_list (id, name, category_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [item.id, item.name, item.category_id],
    )
  }

  // 2) زرع الأدوار الوظيفية الافتراضية الثلاثة (بلا تكرار حسب الاسم) — و"مدير" فقط، وفقط أول مرة
  //    يُزرَع فيها فعلياً (لا كل مرة يُوجَد فيها الصف مسبقاً)، يُمنَح كل صلاحية حالية بالشركة. هذا
  //    الفارق مهم: إعادة منح كل شيء لصف "مدير" موجود مسبقاً قد يُلغي إلغاءً متعمَّداً قام به المسؤول.
  const currentAccessIds: number[] = (await client.query(`SELECT id FROM access_list`, [])).map(
    (row: any) => Number(row.id),
  )
  for (const role of DEFAULT_JOB_ROLES) {
    const inserted = await client.query(
      `INSERT INTO job_roles (name) VALUES ($1) ON CONFLICT (LOWER(name)) DO NOTHING RETURNING id`,
      [role.name],
    )
    if (inserted.length === 0 || !role.grantAll) continue
    const roleId = inserted[0].id
    for (const accessId of currentAccessIds) {
      await client.query(
        `INSERT INTO role_permissions (role_id, access_id, is_granted) VALUES ($1, $2, true) ON CONFLICT (role_id, access_id) DO NOTHING`,
        [roleId, accessId],
      )
    }
  }
}
