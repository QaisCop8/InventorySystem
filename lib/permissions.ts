import sql, { getPoolForDb, memoInTransaction, resolveCurrentDbName } from "@/lib/database"
import managementSql, {
  ensureSalesDraftPermissionDefinitions,
  ensureTransactionPermissionDefinitions,
} from "@/lib/management-db"
import {
  isAdminRoleName,
  legacyTransactionPermissionName,
  TRANSACTION_ACTION_LABELS,
  TRANSACTION_FAMILY_ACTIONS,
  TRANSACTION_PERMISSION_NAME_OVERRIDES,
  RENAMED_TRANSACTION_PERMISSIONS,
  REMOVED_TRANSACTION_PERMISSION_NAMES,
  LEGACY_DUPLICATE_PERMISSION_NAMES,
  transactionActionsFor,
  TRANSACTION_FAMILIES,
  TRANSACTION_PERMISSION_CATEGORY,
  POS_CASHIER_PERMISSION_CATEGORY,
  POS_CASHIER_PERMISSIONS,
  CREDIT_LIMIT_PERMISSION_CATEGORY,
  CREDIT_LIMIT_OVERRIDE_PERMISSION,
  ACCOUNT_BALANCE_VIEW_PERMISSION,
  PURCHASE_PRICE_PERMISSION_CATEGORY,
  PURCHASE_PRICE_VIEW_PERMISSION,
  RESTAURANT_PERMISSION_CATEGORY,
  USER_ADMIN_PERMISSION,
  USER_ADMIN_PERMISSION_CATEGORY,
  EXCHANGE_RATE_PERMISSION_CATEGORY,
  EXCHANGE_RATE_PERMISSIONS,
  RESTAURANT_PERMISSIONS,
  CHEQUE_OPERATION_PERMISSION_CATEGORY,
  CHEQUE_OPERATION_PERMISSIONS,
  ALL_VOUCHER_PRICING_PERMISSION_NAMES,
  ALL_VOUCHER_OUTPUT_PERMISSION_NAMES,
  VOUCHER_OUTPUT_ACTIONS,
  VOUCHER_OUTPUT_FAMILIES,
  voucherOutputPermissionName,
  REMOVED_VOUCHER_PRICING_PERMISSION_NAMES,
  VOUCHER_PRICING_FAMILIES,
  voucherPricingActionsFor,
  voucherPricingPermissionName,
  transactionPermissionName,
  HR_TRANSACTION_FAMILIES,
  type PosCashierPermission,
  type TransactionAction,
  type TransactionFamily,
} from "@/lib/transaction-permission-definitions"
import { REPORT_DEFINITIONS, REPORT_PERMISSION_CATEGORY, reportPermissionNameForTitle, type ReportPermissionAction } from "@/lib/report-permission-definitions"
import { seedFilePermissionDefinitions } from "@/lib/file-permission-seed"
import { FILE_ACTIONS, FILE_FAMILY_KEYS, filePermissionName } from "@/lib/file-permission-definitions"

// نظام الأدوار الوظيفية (job_roles/role_permissions) + الصلاحية الفعّالة للمستخدم = مركز صريح
// (user_access) إن وُجد → وإلا صلاحية دوره الوظيفي (role_permissions) → وإلا رفض. انظر خطة
// C:\Users\USER\.claude\plans\resilient-sprouting-sketch.md للسياق الكامل.

export const DEFAULT_JOB_ROLES = [
  { name: "مدير", grantAll: true },
  { name: "محاسب", grantAll: false },
  { name: "كاشير", grantAll: false },
] as const

// Legacy full-access users still inherit access when no explicit user/role
// decision exists. An explicit denial always takes precedence.
// كانت علامة "جميع الصلاحيات" تمنح كل شيء ضمنياً — أُلغيت (2026-11-09): المسؤول تحدده isSystemAdmin وحدها
export const LEGACY_FULL_ACCESS_SQL = `FALSE`

// مُذاكَرة مفتاحها اسم قاعدة الشركة (dbName) — لا علم واحد للعملية بأكملها كما في ensureBranchColumn
// (lib/auth.ts) أو ensureThemeSettingsColumns (app/api/settings/theme/route.ts): تينانت لاحق يصل
// لنفس عملية Node الدافئة بعد أن اكتمل أول تينانت مختلف كان سيتخطّى DDL هذه القاعدة بالخطأ لولا هذا
// المفتاح — نفس نمط clientCache/rawPoolCache في lib/database.ts.
async function mergeDuplicateAccessDefinitions(client: ReturnType<typeof getPoolForDb>): Promise<void> {
  const permissionTables = [
    { table: "role_permissions", keys: ["role_id"] },
    { table: "role_branch_permissions", keys: ["role_id", "branch_id"] },
    { table: "user_branch_permissions", keys: ["user_id", "branch_id"] },
    { table: "user_access", keys: ["user_id"] },
  ] as const

  for (const { table, keys } of permissionTables) {
    const exists = await client.query(`SELECT to_regclass($1) AS table_name`, [table])
    if (!exists[0]?.table_name) continue
    const keyList = keys.join(", ")
    const sourceKeys = keys.map((key) => `source.${key}`).join(", ")
    const targetMatch = keys.map((key) => `target.${key} = source.${key}`).join(" AND ")
    const grantMatch = keys.map((key) => `target.${key} = grants.${key}`).join(" AND ")
    await client.query(
      `WITH duplicate_map AS (
         SELECT duplicate.id AS duplicate_id, MIN(canonical.id) AS canonical_id
         FROM access_list duplicate
         JOIN access_list canonical ON LOWER(BTRIM(canonical.name)) = LOWER(BTRIM(duplicate.name))
         GROUP BY duplicate.id
       ), source AS (
         SELECT ${keyList}, duplicate_map.canonical_id AS access_id, BOOL_OR(grant_row.is_granted) AS is_granted
         FROM ${table} grant_row
         JOIN duplicate_map ON duplicate_map.duplicate_id = grant_row.access_id
         GROUP BY ${keyList}, duplicate_map.canonical_id
       )
       INSERT INTO ${table} (${keyList}, access_id, is_granted)
       SELECT ${sourceKeys}, source.access_id, source.is_granted FROM source
       WHERE NOT EXISTS (
         SELECT 1 FROM ${table} target
         WHERE ${targetMatch} AND target.access_id = source.access_id
       )`,
      [],
    )
    await client.query(
      `WITH duplicate_map AS (
         SELECT duplicate.id AS duplicate_id, MIN(canonical.id) AS canonical_id
         FROM access_list duplicate
         JOIN access_list canonical ON LOWER(BTRIM(canonical.name)) = LOWER(BTRIM(duplicate.name))
         GROUP BY duplicate.id
       ), grants AS (
         SELECT ${keyList}, duplicate_map.canonical_id AS access_id, BOOL_OR(grant_row.is_granted) AS is_granted
         FROM ${table} grant_row
         JOIN duplicate_map ON duplicate_map.duplicate_id = grant_row.access_id
         GROUP BY ${keyList}, duplicate_map.canonical_id
       )
       UPDATE ${table} target SET is_granted = grants.is_granted
       FROM grants WHERE ${grantMatch} AND target.access_id = grants.access_id`,
      [],
    )
  }

  await client.query(
    `DELETE FROM access_list duplicate USING access_list canonical
     WHERE LOWER(BTRIM(duplicate.name)) = LOWER(BTRIM(canonical.name))
       AND duplicate.id > canonical.id`,
    [],
  )
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_access_list_normalized_name
     ON access_list (LOWER(BTRIM(name)))`,
    [],
  )
}

const ensuredTenants = new Map<string, Promise<void>>()
// ~20 أمر CREATE/ALTER كانت تُنفَّذ مع أول طلب في كل نسخة خادم جديدة (Cloudflare) قبل حفظ الصلاحيات وغيره —
// ثوانٍ مع قاعدة بعيدة. تُسجَّل الآن في app_schema_state (نفس جدول lib/schema-once.ts) فتتخطاها النسخ اللاحقة
// باستعلامين. ارفع هذا الرقم عند تعديل الجداول أدناه لإعادة تطبيقها مرة واحدة على كل شركة.
const PERMISSION_TABLES_VERSION = "permission-tables:5"

export function ensurePermissionTables(dbName: string): Promise<void> {
  let promise = ensuredTenants.get(dbName)
  if (!promise) {
    const client = getPoolForDb(dbName)
    promise = (async () => {
      const [stateTable] = await client.query(`SELECT to_regclass('public.app_schema_state') IS NOT NULL AS ok`, [])
      if (stateTable?.ok) {
        const [applied] = await client.query(`SELECT version FROM app_schema_state WHERE key = 'permission-tables'`, [])
        if (applied?.version === PERMISSION_TABLES_VERSION) return
      }
      // Create permission definitions before tables whose foreign keys reference them.
      // This also repairs older tenant databases that do not yet have access_list.
      await client.query(
        `CREATE TABLE IF NOT EXISTS access_category (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      await client.query(
        `CREATE TABLE IF NOT EXISTS access_list (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category_id INTEGER REFERENCES access_category(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      await client.query(
        `ALTER TABLE access_list ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        [],
      )
      await client.query(
        `ALTER TABLE access_list ADD COLUMN IF NOT EXISTS sort_order INTEGER`,
        [],
      )
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
          user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
          branch_id INTEGER NOT NULL,
          access_id INTEGER NOT NULL REFERENCES access_list(id) ON DELETE CASCADE,
          is_granted BOOLEAN NOT NULL DEFAULT true,
          PRIMARY KEY (user_id, branch_id, access_id)
        )`,
        [],
      )
      // عضوية فرع بسيطة (بلا بعد access_id) — منفصلة تماماً عن user_branch_permissions أعلاه: تلك
      // مقيَّدة بصلاحية بعينها، وهذه فقط "هل يعمل هذا المستخدم بهذا الفرع إطلاقاً". بلا أي صف لمستخدم
      // = غير مقيَّد (يصل لكل الفروع، السلوك الحالي دون تغيير) — نفس اصطلاح جداول product_branches/
      // customer_branches/account_branches الوسيطة (فراغ = بلا قيد)؛ صف واحد أو أكثر = يقتصر عليها.
      // بلا FK صريح على branch_id، بنفس أسلوب user_branch_permissions/role_branch_permissions أعلاه.
      await client.query(
        `CREATE TABLE IF NOT EXISTS user_branches (
          user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
          branch_id INTEGER NOT NULL,
          PRIMARY KEY (user_id, branch_id)
        )`,
        [],
      )
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS job_role_id INTEGER REFERENCES job_roles(id) ON DELETE SET NULL`, [])
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS management_user_id INTEGER`, [])
      await client.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS branch_id INTEGER`, [])
      await client.query(
        `CREATE TABLE IF NOT EXISTS tenant_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      // جهاز واحد لكل مستخدم (lib/tenant-auth.ts): بيانات الجهاز، والجلسة المُزاحة بدخول من جهاز آخر تبقى مُعلَّمة
      // (revoked_at) ليعرف الجهاز القديم سبب خروجه بدل «يجب تسجيل الدخول» العامة
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)`, [])
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT`, [])
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP`, [])
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(30)`, [])
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`, [])
      await client.query(`ALTER TABLE tenant_sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(64)`, [])
      await client.query(`CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions (user_id, expires_at)`, [])
      await client.query(`CREATE TABLE IF NOT EXISTS app_schema_state (key TEXT PRIMARY KEY, version TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`, [])
      await client.query(
        `INSERT INTO app_schema_state (key, version, applied_at) VALUES ('permission-tables', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW()`,
        [PERMISSION_TABLES_VERSION],
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
/**
 * مسؤول النظام: المستخدم رقم 0، أو أول مستخدم في الشركة (منشئها)، أو الدور الوظيفي "مدير" (admin، مدير النظام…).
 * حقل role النصي لا يُعتمد (كان كل مستخدم جديد يُحفظ "مدير النظام" افتراضياً).
 * يرى كل الفروع (لا يقيّده user_branches) وكل الصلاحيات ممنوحة له في كل فرع، ومنها صلاحيات المستخدمين.
 */
export async function isSystemAdmin(userId: string | number | null | undefined): Promise<boolean> {
  if (userId == null || String(userId).trim() === "") return false
  if (String(userId).trim() === "0") return true
  const row = ((await memoInTransaction(`system-admin:${userId}`, () => sql`
    SELECT jr.name AS job_role_name, (us.user_id = (SELECT MIN(user_id) FROM user_settings)) AS first_user
    FROM user_settings us LEFT JOIN job_roles jr ON jr.id = us.job_role_id
    WHERE us.user_id::text = ${String(userId)} LIMIT 1
  ` as Promise<any[]>)) as any[])[0]
  return Boolean(row && (row.first_user || isAdminRoleName(row.job_role_name)))
}

export async function hasEffectivePermission(userId: string, accessId: number, branchId?: number | null): Promise<boolean> {
  if (await isSystemAdmin(userId)) return true
  const requestedBranchId = Number.isInteger(branchId) && Number(branchId) > 0 ? Number(branchId) : null
  const rows = await sql`
    SELECT COALESCE(ubp.is_granted, ua.is_granted, rbp.is_granted, rp.is_granted, ${sql.unsafe(LEGACY_FULL_ACCESS_SQL)}) AS is_granted
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

// معرّف صلاحية الكاشير لكل قاعدة — كان كل فحص صلاحية (حتى 5 مع كل حفظ فاتورة) يُعيد ~7 استعلامات إنشاء/منح
// منها مسح كامل لجدول المستخدمين. يُخزَّن فقط حين كان الصف موجوداً مسبقاً (لا حين أُنشئ للتو داخل معاملة قد
// تُلغى)؛ منح الصلاحية للمستخدمين الجدد تتولاه مزامنة الصلاحيات (syncPermissionDefinitions).
const posCashierAccessIds = new Map<string, number>()

export async function ensurePosCashierPermission(permission: PosCashierPermission): Promise<number> {
  const name = POS_CASHIER_PERMISSIONS[permission]
  const dbName = await resolveCurrentDbName()
  const cached = posCashierAccessIds.get(`${dbName}\u0000${permission}`)
  if (cached) return cached
  await ensurePermissionTables(dbName)
  const categoryRows = await sql`
    INSERT INTO access_category (name)
    SELECT ${POS_CASHIER_PERMISSION_CATEGORY}
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name=${POS_CASHIER_PERMISSION_CATEGORY})
    RETURNING id
  `
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name=${POS_CASHIER_PERMISSION_CATEGORY} ORDER BY id LIMIT 1`)[0]
  const inserted = await sql`
    INSERT INTO access_list (name, category_id)
    SELECT ${name}, ${Number(category.id)}
    WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${name}))) ON CONFLICT DO NOTHING
    RETURNING id
  `
  const access = inserted[0] || (await sql`SELECT id FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${name})) ORDER BY id LIMIT 1`)[0]
  await sql`UPDATE access_list SET category_id=${Number(category.id)} WHERE id=${Number(access.id)}`
  await sql`
    INSERT INTO role_permissions (role_id, access_id, is_granted)
    SELECT id, ${Number(access.id)}, TRUE FROM job_roles WHERE LOWER(name)=LOWER('مدير')
    ON CONFLICT (role_id, access_id) DO NOTHING
  `
  if (!inserted[0]) posCashierAccessIds.set(`${dbName}\u0000${permission}`, Number(access.id))
  return Number(access.id)
}

export async function hasPosCashierPermission(userId: string, permission: PosCashierPermission, branchId: number): Promise<boolean> {
  const accessId = await ensurePosCashierPermission(permission)
  const rows = await sql`
    SELECT (
      COALESCE(ubp.is_granted, ua.is_granted, FALSE)
      OR COALESCE(rbp.is_granted, rp.is_granted, FALSE)
    ) AS is_granted
    FROM user_settings us
    LEFT JOIN user_branch_permissions ubp
      ON ubp.user_id=us.user_id AND ubp.branch_id=${branchId} AND ubp.access_id=${accessId}
    LEFT JOIN user_access ua ON ua.user_id=us.user_id AND ua.access_id=${accessId}
    LEFT JOIN role_branch_permissions rbp
      ON rbp.role_id=us.job_role_id AND rbp.branch_id=${branchId} AND rbp.access_id=${accessId}
    LEFT JOIN role_permissions rp ON rp.role_id=us.job_role_id AND rp.access_id=${accessId}
    WHERE us.user_id=${userId}
    LIMIT 1
  `
  return Boolean(rows[0]?.is_granted)
}

// صلاحية مسمّاة عامة (خارج مصفوفة الحركات) — تُنشأ عند أول استخدام وتُمنح لدور "مدير"،
// والفحص بنفس منطق hasEffectivePermission (فرعي → مستخدم → دور).
const namedAccessIds = new Map<string, number>()

export async function ensureNamedPermission(name: string, categoryName: string): Promise<number> {
  const dbName = await resolveCurrentDbName()
  const cacheKey = `${dbName}\u0000${name}`
  const cached = namedAccessIds.get(cacheKey)
  if (cached) return cached
  await ensurePermissionTables(dbName)
  const categoryRows = await sql`
    INSERT INTO access_category (name)
    SELECT ${categoryName}
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name=${categoryName})
    RETURNING id
  `
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name=${categoryName} ORDER BY id LIMIT 1`)[0]
  const inserted = await sql`
    INSERT INTO access_list (name, category_id)
    SELECT ${name}, ${Number(category.id)}
    WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${name}))) ON CONFLICT DO NOTHING
    RETURNING id
  `
  const access = inserted[0] || (await sql`SELECT id FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${name})) ORDER BY id LIMIT 1`)[0]
  if (inserted[0]) {
    await sql`
      INSERT INTO role_permissions (role_id, access_id, is_granted)
      SELECT id, ${Number(access.id)}, TRUE FROM job_roles WHERE LOWER(name)=LOWER('مدير')
      ON CONFLICT (role_id, access_id) DO NOTHING
    `
  } else {
    namedAccessIds.set(cacheKey, Number(access.id))
  }
  return Number(access.id)
}

export async function hasNamedPermission(userId: string, name: string, categoryName: string, branchId?: number | null): Promise<boolean> {
  const accessId = await ensureNamedPermission(name, categoryName)
  return hasEffectivePermission(userId, accessId, branchId)
}

// يُرمى عند رفض صلاحية — رسالته جاهزة للعرض مباشرة للمستخدم (تحمل اسم الصلاحية الفعلي من
// access_list، لا معرِّفها الرقمي فقط).
export class PermissionDeniedError extends Error {}

// كل الفروع التي يملك فيها المستخدم صلاحية بعينها فعلياً — نفس منطق COALESCE وترتيب الأولوية في
// hasEffectivePermission أعلاه حرفياً، لكن مُقيَّماً لكل فرع دفعة واحدة (JOIN مع branches) بدل فرع
// واحد فقط. يُستخدَم عندما تحتاج شاشة عرض بيانات مُقيَّدة بالفرع (كالأصناف) تجميع النتائج من كل فرع
// يملك المستخدم صلاحية استعلامه فيه، لا فرعه النشط فقط.
export async function getGrantedBranchIds(userId: string, accessId: number): Promise<number[]> {
  if (await isSystemAdmin(userId)) return ((await sql`SELECT id FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false)`) as any[]).map((r: any) => Number(r.id))
  const rows = await sql`
    SELECT b.id
    FROM branches b
    CROSS JOIN (SELECT job_role_id, permissions FROM user_settings WHERE user_id = ${userId} LIMIT 1) us
    LEFT JOIN user_branch_permissions ubp ON ubp.user_id = ${userId} AND ubp.branch_id = b.id AND ubp.access_id = ${accessId}
    LEFT JOIN user_access ua ON ua.access_id = ${accessId} AND ua.user_id = ${userId}
    LEFT JOIN role_branch_permissions rbp ON rbp.role_id = us.job_role_id AND rbp.branch_id = b.id AND rbp.access_id = ${accessId}
    LEFT JOIN role_permissions rp ON rp.role_id = us.job_role_id AND rp.access_id = ${accessId}
    WHERE NOT COALESCE((to_jsonb(b)->>'is_bank_branch')::boolean, false)
      AND COALESCE(ubp.is_granted, ua.is_granted, rbp.is_granted, rp.is_granted, ${sql.unsafe(LEGACY_FULL_ACCESS_SQL)}) = TRUE
  `
  return rows.map((r: any) => Number(r.id))
}

// حارس جاهز لبداية أي مسار API يحتاج فرض صلاحية مُقيَّدة بالفرع فعلياً على الخادم (لا فقط إخفاءها
// بالواجهة عبر Util.checkUserAccess المخزَّنة بـlocalStorage، التي لا تمنع طلب fetch نفسه إطلاقاً).
// يرمي PermissionDeniedError برسالة جاهزة للعرض عند عدم وجود أي فرع مصرَّح به؛ وإلا يُعيد قائمة
// الفروع المصرَّح بها لتُستخدَم في تصفية الاستعلام.
export async function requireBranchAccess(userId: string | null, accessId: number): Promise<number[]> {
  if (!userId) throw new PermissionDeniedError("يجب تسجيل الدخول")
  const grantedBranchIds = await getGrantedBranchIds(userId, accessId)
  if (grantedBranchIds.length === 0) {
    const accessRow = (await sql`SELECT name FROM access_list WHERE id = ${accessId}`)[0]
    throw new PermissionDeniedError(`لا يوجد لديك صلاحية ${accessRow?.name || ""}`.trim())
  }
  return grantedBranchIds
}

const filePermissionSeeds = new Map<string, Promise<void>>()

export async function ensureFilePermissions(dbName: string): Promise<void> {
  await ensurePermissionTables(dbName)
  let pending = filePermissionSeeds.get(dbName)
  if (!pending) {
    pending = seedFilePermissionDefinitions(getPoolForDb(dbName)).catch(error => {
      filePermissionSeeds.delete(dbName)
      throw error
    })
    filePermissionSeeds.set(dbName, pending)
  }
  await pending
}

// المزامنة الكاملة أدناه مئات الاستعلامات المتتالية — سريعة محلياً لكنها ثوانٍ طويلة مع قاعدة بعيدة
// (Neon من Cloudflare) وكانت تُنفَّذ مع كل تحميل صفحة. البصمة = تعريفات الكود + صلاحيات قاعدة الإدارة +
// أعداد صفوف الشركة (صلاحيات/فئات/أدوار/مستخدمين)؛ إن طابقت آخر مزامنة ناجحة (permission_sync_state)
// تُتخطّى المزامنة. ارفع PERMISSION_SYNC_VERSION عند تغيير منطق المزامنة نفسه لإجبار إعادة تشغيلها.
const PERMISSION_SYNC_VERSION = 10
const PERMISSION_SYNC_MEMO_MS = 5 * 60_000
const permissionSyncMemo = new Map<string, { fingerprint: string; at: number }>()

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function permissionSyncFingerprint(client: ReturnType<typeof getPoolForDb>): Promise<string | null> {
  try {
    const [management] = await managementSql`
      SELECT
        (SELECT COALESCE(json_agg(json_build_array(id, name) ORDER BY id), '[]'::json) FROM access_category) AS categories,
        (SELECT COALESCE(json_agg(json_build_array(id, name, category_id) ORDER BY id), '[]'::json) FROM access_list) AS items`
    const [tenant] = await client.query(
      `SELECT
         (SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM access_list) AS access_list,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM access_category) AS access_category,
         (SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM job_roles) AS job_roles,
         (SELECT COUNT(*)::text FROM user_settings) AS users`,
      [],
    )
    return sha256Hex(JSON.stringify({
      version: PERMISSION_SYNC_VERSION,
      code: [TRANSACTION_FAMILIES, TRANSACTION_ACTION_LABELS, TRANSACTION_FAMILY_ACTIONS, TRANSACTION_PERMISSION_NAME_OVERRIDES, POS_CASHIER_PERMISSIONS, CREDIT_LIMIT_OVERRIDE_PERMISSION, ACCOUNT_BALANCE_VIEW_PERMISSION, PURCHASE_PRICE_VIEW_PERMISSION, RESTAURANT_PERMISSIONS, CHEQUE_OPERATION_PERMISSIONS, ALL_VOUCHER_PRICING_PERMISSION_NAMES, ALL_VOUCHER_OUTPUT_PERMISSION_NAMES, USER_ADMIN_PERMISSION, EXCHANGE_RATE_PERMISSIONS, REPORT_DEFINITIONS.map((definition) => definition.title), ["access", "print", "whatsapp"], FILE_FAMILY_KEYS, FILE_ACTIONS],
      management,
      tenant,
    }))
  } catch (error) {
    console.error("[permissions] sync fingerprint failed; running full sync", error)
    return null
  }
}

// تُطبَّق عند تحميل الصفحة الرئيسية (انظر نقطة الاستدعاء بـauth-context.tsx) — بلا حاجة لتشغيل أي
// سكربت يدوي لكل شركة: أي تعريف صلاحية/دور جديد يُضاف هنا هنا تلقائياً بأول تحميل صفحة لاحق.
export async function syncPermissionDefinitions(dbName: string): Promise<void> {
  const memo = permissionSyncMemo.get(dbName)
  if (memo && Date.now() - memo.at < PERMISSION_SYNC_MEMO_MS) return
  await ensurePermissionTables(dbName)
  const client = getPoolForDb(dbName)
  const fingerprint = await permissionSyncFingerprint(client)
  if (fingerprint) {
    const stored = await client
      .query(`SELECT fingerprint FROM permission_sync_state WHERE id = 1`, [])
      .catch(() => [] as any[])
    if (stored[0]?.fingerprint === fingerprint) {
      permissionSyncMemo.set(dbName, { fingerprint, at: Date.now() })
      return
    }
  }

  await runPermissionDefinitionSync(dbName)

  // البصمة بعد المزامنة (الصفوف المُضافة للتو تغيّر أعداد الشركة)
  const synced = await permissionSyncFingerprint(client)
  if (!synced) return
  await client.query(
    `CREATE TABLE IF NOT EXISTS permission_sync_state (id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    [],
  )
  await client.query(
    `INSERT INTO permission_sync_state (id, fingerprint, synced_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, synced_at = NOW()`,
    [synced],
  )
  permissionSyncMemo.set(dbName, { fingerprint: synced, at: Date.now() })
}

async function runPermissionDefinitionSync(dbName: string): Promise<void> {
  await ensurePermissionTables(dbName)
  try {
    await ensureSalesDraftPermissionDefinitions()
    await ensureTransactionPermissionDefinitions()
  } catch (error) {
    // A temporary management DB/schema failure must never prevent tenant login
    // or permission refresh. Canonical transaction permissions are also seeded
    // locally by name below.
    console.error("[permissions] management permission seed failed; continuing with tenant definitions", error)
  }
  const client = getPoolForDb(dbName)

  // Keep the existing access id so all role/user/branch grants survive the
  // terminology change from "عرض" to "استعلام".
  for (const family of Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]) {
    for (const action of transactionActionsFor(family)) {
      const legacyName = legacyTransactionPermissionName(family, action)
      if (!legacyName) continue
      await client.query(
        `UPDATE access_list SET name = $1::varchar, updated_at = CURRENT_TIMESTAMP
         WHERE name = $2::varchar
           AND NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar)))`,
        [transactionPermissionName(family, action), legacyName],
      )
    }
  }

  // Preserve the access id and all existing role/user grants when standardizing
  // the sales-draft create permission name in older company databases.
  await client.query(
    `UPDATE access_list
     SET name = $1::varchar, updated_at = CURRENT_TIMESTAMP
     WHERE name = $2::varchar
       AND NOT EXISTS (SELECT 1 FROM access_list existing WHERE LOWER(BTRIM(existing.name)) = LOWER(BTRIM($1::varchar)))`,
    ["إضافة مسودة طلبية مبيعات", "ادخال مسودة طلبية مبيعات"],
  )

  const cashierPermissionRenames: Array<[string, string]> = [
    ["استخدام الكاشير", POS_CASHIER_PERMISSIONS.access],
    ["إدخال فاتورة مبيعات من الكاشير", POS_CASHIER_PERMISSIONS.sale],
    ["إدخال مردود من الكاشير", POS_CASHIER_PERMISSIONS.return],
    ["إصدار هدية من الكاشير", POS_CASHIER_PERMISSIONS.gift],
    ["إدارة عهدة الكاشير", POS_CASHIER_PERMISSIONS.receiveHandover],
    ["استعلام فواتير الكاشير", POS_CASHIER_PERMISSIONS.history],
    ["حذف فاتورة من الكاشير", POS_CASHIER_PERMISSIONS.deleteInvoice],
    ["إدارة مسودات الكاشير", POS_CASHIER_PERMISSIONS.drafts],
    ["تطبيق خصم في الكاشير", POS_CASHIER_PERMISSIONS.invoiceDiscount],
  ]
  for (const [legacyName, currentName] of cashierPermissionRenames) {
    await client.query(
      `UPDATE access_list SET name=$1::varchar,updated_at=CURRENT_TIMESTAMP
       WHERE name=$2::varchar AND NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar)))`,
      [currentName, legacyName],
    )
  }

  // 1) نسخ أي صف access_category/access_list جديد من قاعدة الإدارة (management) لم يصل هذه الشركة
  //    بعد — لا يُحدَّث أي صف موجود مسبقاً إطلاقاً، فتخصيصات المسؤول (إعادة تسمية فئة/صلاحية) تبقى
  //    كما هي دوماً.
  let categories: any[] = []
  let accessItems: any[] = []
  try {
    categories = await managementSql`SELECT id, name FROM access_category ORDER BY id`
    accessItems = await managementSql`SELECT id, name, category_id FROM access_list ORDER BY id`
  } catch (error) {
    console.error("[permissions] management permission read failed; continuing with tenant definitions", error)
  }
  for (const category of categories) {
    await client.query(
      `INSERT INTO access_category (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [category.id, category.name],
    )
  }
  for (const item of accessItems) {
    await client.query(
      `INSERT INTO access_list (id, name, category_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [item.id, item.name, item.category_id],
    )
  }

  // Rows copied from management retain their explicit ids. Advance both local
  // sequences before any name-based fallback inserts, otherwise PostgreSQL can
  // reuse an occupied id and make permission refresh fail with HTTP 500.
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('access_category', 'id'),
       GREATEST(COALESCE((SELECT MAX(id) FROM access_category), 0), 1),
       true
     )`,
    [],
  )
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('access_list', 'id'),
       GREATEST(COALESCE((SELECT MAX(id) FROM access_list), 0), 1),
       true
     )`,
    [],
  )

  await ensureFilePermissions(dbName)

  // Management ids can collide with tenant-local ids. Ensure the complete
  // transaction matrix by name as well, using the tenant's category id.
  const transactionCategoryRows = await client.query(
    `INSERT INTO access_category (name)
     SELECT $1::varchar
     WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = $1::varchar)
     RETURNING id`,
    [TRANSACTION_PERMISSION_CATEGORY],
  )
  const transactionCategory =
    transactionCategoryRows[0] ||
    (await client.query(`SELECT id FROM access_category WHERE name = $1::varchar ORDER BY id LIMIT 1`, [
      TRANSACTION_PERMISSION_CATEGORY,
    ]))[0]
  // أسماء أوضح لبعض الصلاحيات: يُعاد تسمية الصف القديم قبل الإدراج فيبقى معرّفه ومنح المستخدمين/الأدوار عليه
  for (const rename of RENAMED_TRANSACTION_PERMISSIONS) {
    // أُنشئ صف الاسم الجديد (بلا منح غالباً) قبل أن تُعرَّف إعادة التسمية والصف القديم ما زال موجوداً بمنحه ⇐ يُحذف
    // الجديد ليُعاد تسمية القديم؛ وإلا يُحذف القديم لاحقاً كاسم متروك ويفقد المستخدمون صلاحياتهم (مثل بريد الرسائل)
    const fresh = await client.query(
      `SELECT n.id FROM access_list n
       WHERE LOWER(BTRIM(n.name)) = LOWER(BTRIM($1::varchar)) AND EXISTS (SELECT 1 FROM access_list o WHERE o.name = $2::varchar)`,
      [rename.to, rename.from],
    )
    for (const row of fresh as Array<{ id: number }>) {
      for (const table of ["user_access", "role_permissions", "user_branch_permissions", "role_branch_permissions"]) {
        await client.query(`DELETE FROM ${table} WHERE access_id = $1`, [row.id]).catch(() => undefined)
      }
      await client.query(`DELETE FROM access_list WHERE id = $1`, [row.id])
    }
    await client.query(
      `UPDATE access_list SET name = $1::varchar, updated_at = CURRENT_TIMESTAMP
       WHERE name = $2::varchar AND NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar)))`,
      [rename.to, rename.from],
    )
  }
  // إجراءات لم تعد مستخدمة (TRANSACTION_FAMILY_ACTIONS) والأسماء القديمة المتبقية بعد إعادة التسمية: تُحذف مع منحها
  const obsoletePermissionNames = [...REMOVED_TRANSACTION_PERMISSION_NAMES, ...RENAMED_TRANSACTION_PERMISSIONS.map((rename) => rename.from), ...LEGACY_DUPLICATE_PERMISSION_NAMES, ...REMOVED_VOUCHER_PRICING_PERMISSION_NAMES]
  if (obsoletePermissionNames.length) {
    const obsolete = `SELECT id FROM access_list WHERE name = ANY($1::text[])`
    for (const table of ["user_access", "role_permissions", "user_branch_permissions", "role_branch_permissions"]) {
      await client.query(`DELETE FROM ${table} WHERE access_id IN (${obsolete})`, [obsoletePermissionNames]).catch(() => undefined)
    }
    await client.query(`DELETE FROM access_list WHERE name = ANY($1::text[])`, [obsoletePermissionNames])
  }

  if (transactionCategory?.id) {
    for (const family of Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]) {
      for (const action of transactionActionsFor(family)) {
        const name = transactionPermissionName(family, action)
        await client.query(
          `INSERT INTO access_list (name, category_id)
           SELECT $1::varchar, $2::integer
           WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar))) ON CONFLICT DO NOTHING`,
          [name, transactionCategory.id],
        )
        await client.query(`UPDATE access_list SET category_id = $2::integer WHERE name = $1::varchar`, [name, transactionCategory.id])
      }
    }
  }

  // "الدخول لشاشة {الحركة}" (أُضيفت 2026-10-15): مرة واحدة لكل شركة تُمنح لكل مستخدم/دور (وعلى مستوى الفروع) يملك أي
  // صلاحية ممنوحة على نفس الحركة — فلا يفقد أحد شاشة يعمل عليها اليوم. لا تُعاد بعد ذلك، فتقييد المسؤول لاحقاً يبقى.
  await client.query(`CREATE TABLE IF NOT EXISTS permission_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`, [])
  // The purchase planning page previously followed purchase-order permissions. Carry over access and view
  // once so existing users keep their current reach, while the new utility permission remains independently editable.
  const purchasePlanningScreenMigration = "purchase-planning-screen-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [purchasePlanningScreenMigration])).length) {
    const targetNames = [
      transactionPermissionName("purchase_planning", "access"),
      transactionPermissionName("purchase_planning", "view"),
    ]
    const sourceNames = [
      transactionPermissionName("purchase_order", "access"),
      transactionPermissionName("purchase_order", "view"),
    ]
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM unnest($1::text[], $2::text[]) AS m(target_name, source_name)
         JOIN access_list target ON LOWER(BTRIM(target.name)) = LOWER(BTRIM(m.target_name))
         JOIN access_list source ON LOWER(BTRIM(source.name)) = LOWER(BTRIM(m.source_name))
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [targetNames, sourceNames],
      )
    }
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [purchasePlanningScreenMigration])
  }

  // شاشات نظام ادارة الموظفين (hr_*) كانت بلا صلاحيات (2026-11-02): مرة واحدة لكل شركة تُمنح كل صلاحياتها لمن يملك
  // "الدخول لشاشة الموظفين" (مستخدم/دور، وعلى مستوى الفروع) ولدور المدير — فلا يفقد أحد شاشة يعمل عليها اليوم.
  const hrScreensMigration = "hr-screens-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [hrScreensMigration])).length) {
    const hrNames = HR_TRANSACTION_FAMILIES.flatMap((family) => transactionActionsFor(family).map((action) => transactionPermissionName(family, action)))
    const sourceName = filePermissionName("employees", "access")
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM access_list target
         JOIN access_list source ON LOWER(BTRIM(source.name)) = LOWER(BTRIM($2::varchar))
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         WHERE target.name = ANY($1::text[])
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [hrNames, sourceName],
      )
    }
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE LOWER(BTRIM(r.name)) IN ('مدير', 'admin', 'administrator', 'مدير النظام', 'مسؤول النظام') AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [hrNames],
    )
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [hrScreensMigration])
  }

  // السلف والقروض والخصم النقدي (2026-11-08): مرة واحدة لكل شركة تُمنح صلاحياتها لمن يملك "الدخول لشاشة فتح راتب شهر"
  // (مستخدم/دور، وعلى مستوى الفروع) ولدور المدير.
  const hrDeductionsMigration = "hr-salary-deductions-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [hrDeductionsMigration])).length) {
    const deductionNames = (["hr_salary_advances", "hr_salary_loans", "hr_cash_deductions"] as const)
      .flatMap((family) => transactionActionsFor(family).map((action) => transactionPermissionName(family, action)))
    const sourceName = transactionPermissionName("hr_salary_periods", "access")
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM access_list target
         JOIN access_list source ON LOWER(BTRIM(source.name)) = LOWER(BTRIM($2::varchar))
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         WHERE target.name = ANY($1::text[])
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [deductionNames, sourceName],
      )
    }
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE LOWER(BTRIM(r.name)) IN ('مدير', 'admin', 'administrator', 'مدير النظام', 'مسؤول النظام') AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [deductionNames],
    )
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [hrDeductionsMigration])
  }

  const screenAccessMigration = "transaction-screen-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [screenAccessMigration])).length) {
    const accessNames: string[] = []
    const sourceNames: string[] = []
    for (const family of Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]) {
      for (const action of transactionActionsFor(family)) {
        if (action === "access") continue
        accessNames.push(transactionPermissionName(family, "access"))
        sourceNames.push(transactionPermissionName(family, action))
      }
    }
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM unnest($1::text[], $2::text[]) AS m(access_name, source_name)
         JOIN access_list target ON LOWER(BTRIM(target.name)) = LOWER(BTRIM(m.access_name))
         JOIN access_list source ON LOWER(BTRIM(source.name)) = LOWER(BTRIM(m.source_name))
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [accessNames, sourceNames],
      )
    }
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [screenAccessMigration])
  }

  // صلاحيات التقارير: صلاحية "استعلام" لكل تقرير. عند إنشائها لأول مرة في الشركة تُمنح لكل الأدوار
  // القائمة (لا يفقد أحد وصوله للتقارير بعد التحديث) — ثم يقيّدها المسؤول من شاشة الصلاحيات.
  const reportCategoryRows = await client.query(
    `INSERT INTO access_category (name)
     SELECT $1::varchar
     WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = $1::varchar)
     RETURNING id`,
    [REPORT_PERMISSION_CATEGORY],
  )
  const reportCategory = reportCategoryRows[0] || (await client.query(
    `SELECT id FROM access_category WHERE name = $1::varchar ORDER BY id LIMIT 1`,
    [REPORT_PERMISSION_CATEGORY],
  ))[0]
  if (reportCategory?.id) {
    for (const [index, definition] of REPORT_DEFINITIONS.entries()) {
      const actions: ReportPermissionAction[] = ["access", "print", "export", "whatsapp"]
      for (const [actionIndex, action] of actions.entries()) {
        const name = reportPermissionNameForTitle(definition.title, action)
        const inserted = await client.query(
          `INSERT INTO access_list (name, category_id)
           SELECT $1::varchar, $2::integer
           WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar))) ON CONFLICT DO NOTHING
           RETURNING id`,
          [name, reportCategory.id],
        )
        if (inserted[0]?.id) {
          await client.query(
            `INSERT INTO role_permissions (role_id, access_id, is_granted)
             SELECT id, $1::integer, TRUE FROM job_roles
             ON CONFLICT (role_id, access_id) DO NOTHING`,
            [inserted[0].id],
          )
        }
        await client.query(`UPDATE access_list SET category_id = $2::integer, sort_order = $3::integer WHERE name = $1::varchar`, [name, reportCategory.id, index * actions.length + actionIndex + 1])
      }
    }
  }

  const cashierCategoryRows = await client.query(
    `INSERT INTO access_category (name)
     SELECT $1::varchar
     WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = $1::varchar)
     RETURNING id`,
    [POS_CASHIER_PERMISSION_CATEGORY],
  )
  const cashierCategory = cashierCategoryRows[0] || (await client.query(
    `SELECT id FROM access_category WHERE name = $1::varchar ORDER BY id LIMIT 1`,
    [POS_CASHIER_PERMISSION_CATEGORY],
  ))[0]
  if (cashierCategory?.id) {
    for (const name of Object.values(POS_CASHIER_PERMISSIONS)) {
      const inserted = await client.query(
        `INSERT INTO access_list (name, category_id)
         SELECT $1::varchar, $2::integer
         WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar))) ON CONFLICT DO NOTHING
         RETURNING id`,
        [name, cashierCategory.id],
      )
      const access = inserted[0] || (await client.query(`SELECT id FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar)) ORDER BY id LIMIT 1`, [name]))[0]
      await client.query(`UPDATE access_list SET category_id = $2::integer WHERE id = $1::integer`, [access.id, cashierCategory.id])
      await client.query(
        `INSERT INTO role_permissions (role_id, access_id, is_granted)
         SELECT id, $1::integer, TRUE FROM job_roles WHERE LOWER(name)=LOWER('مدير')
         ON CONFLICT (role_id, access_id) DO NOTHING`,
        [access.id],
      )
    }
  }

  // "السماح بتجاوز حد الدين" و"مشاهدة الرصيد" و"مشاهدة أسعار الشراء" — تظهر بشاشة الصلاحيات مباشرة
  // (لا فقط بعد أول فحص لها)، وتُمنح لدور "مدير"
  for (const [categoryName, permissionNames] of [
    [CREDIT_LIMIT_PERMISSION_CATEGORY, [CREDIT_LIMIT_OVERRIDE_PERMISSION, ACCOUNT_BALANCE_VIEW_PERMISSION]],
    [PURCHASE_PRICE_PERMISSION_CATEGORY, [PURCHASE_PRICE_VIEW_PERMISSION]],
    [RESTAURANT_PERMISSION_CATEGORY, Object.values(RESTAURANT_PERMISSIONS)],
    [CHEQUE_OPERATION_PERMISSION_CATEGORY, Object.values(CHEQUE_OPERATION_PERMISSIONS)],
    [USER_ADMIN_PERMISSION_CATEGORY, [USER_ADMIN_PERMISSION]],
    [EXCHANGE_RATE_PERMISSION_CATEGORY, Object.values(EXCHANGE_RATE_PERMISSIONS)],
    [TRANSACTION_PERMISSION_CATEGORY, ALL_VOUCHER_PRICING_PERMISSION_NAMES],
    [TRANSACTION_PERMISSION_CATEGORY, ALL_VOUCHER_OUTPUT_PERMISSION_NAMES],
  ] as const) {
  const creditCategoryRows = await client.query(
    `INSERT INTO access_category (name)
     SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = $1::varchar)
     RETURNING id`,
    [categoryName],
  )
  const creditCategory = creditCategoryRows[0] || (await client.query(
    `SELECT id FROM access_category WHERE name = $1::varchar ORDER BY id LIMIT 1`,
    [categoryName],
  ))[0]
  for (const permissionName of permissionNames) if (creditCategory?.id) {
    const inserted = await client.query(
      `INSERT INTO access_list (name, category_id)
       SELECT $1::varchar, $2::integer
       WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar))) ON CONFLICT DO NOTHING
       RETURNING id`,
      [permissionName, creditCategory.id],
    )
    if (inserted[0]?.id) {
      await client.query(
        `INSERT INTO role_permissions (role_id, access_id, is_granted)
         SELECT id, $1::integer, TRUE FROM job_roles WHERE LOWER(name)=LOWER('مدير')
         ON CONFLICT (role_id, access_id) DO NOTHING`,
        [inserted[0].id],
      )
    }
  }
  }

  // شاشات الشيكات وعملياتها صارت صلاحيات مستقلة (2026-11-03) — كانت تتبع "سند صرف شيكات"/"سند قيد". مرة واحدة لكل
  // شركة تُمنح كلها لمن يملك أي صلاحية ممنوحة على سند صرف شيكات أو "إدخال سند قيد" (مستخدم/دور، وعلى مستوى الفروع)
  // ولأدوار المدير — فلا يفقد أحد شاشة أو عملية يعمل عليها اليوم. لا تُعاد، فتقييد المسؤول لاحقاً يبقى.
  const chequeScreensMigration = "cheque-screens-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [chequeScreensMigration])).length) {
    const chequeFamilies: TransactionFamily[] = ["cheque_book", "cheque_register", "cheque_operation", "cheque_deposit_bulk", "cheque_endorse_bulk", "outgoing_cheque_clear"]
    const targetNames = [
      ...chequeFamilies.flatMap((family) => transactionActionsFor(family).map((action) => transactionPermissionName(family, action))),
      ...Object.values(CHEQUE_OPERATION_PERMISSIONS),
    ]
    const sourceNames = [...transactionActionsFor("cheque_payment").map((action) => transactionPermissionName("cheque_payment", action)), transactionPermissionName("journal", "create")]
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM access_list target
         JOIN access_list source ON LOWER(BTRIM(source.name)) = ANY(SELECT LOWER(BTRIM(n)) FROM unnest($2::text[]) n)
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         WHERE target.name = ANY($1::text[])
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [targetNames, sourceNames],
      )
    }
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE LOWER(BTRIM(r.name)) IN ('مدير', 'admin', 'administrator', 'مدير النظام', 'مسؤول النظام') AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [targetNames],
    )
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [chequeScreensMigration])
  }

  // تعديل السعر/خصم الصنف/الخصم العام/نسبة الضريبة في كل سند (2026-11-07) — كانت مفتوحة لكل من يدخل أو يعدّل السند.
  // مرة واحدة لكل شركة: تُمنح لمن يملك "إدخال" أو "تعديل" ذلك السند (مستخدم/دور، وعلى مستوى الفروع) فلا يتغير عمل أحد اليوم،
  // ثم يقيّدها المسؤول من شاشة الصلاحيات. لا تُعاد.
  // الطلبيات (طلبية مبيعات/مشتريات) أُضيفت بعد v1 ⇐ ترحيل مستقل لها حتى تُمنح في الشركات التي طُبّق فيها v1 مسبقاً
  for (const [voucherPricingMigration, families] of [
    ["voucher-pricing-permissions-v1", VOUCHER_PRICING_FAMILIES.filter((family) => family !== "sales_order" && family !== "purchase_order")],
    ["voucher-pricing-permissions-orders-v1", ["sales_order", "purchase_order"]],
  ] as const) {
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [voucherPricingMigration])).length) {
    for (const family of families) {
      const targetNames = voucherPricingActionsFor(family).map((action) => voucherPricingPermissionName(family, action))
      const sourceNames = [transactionPermissionName(family, "create"), transactionPermissionName(family, "update")]
      for (const [table, keys] of [
        ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
        ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
      ] as const) {
        const columns = keys.join(",")
        const selected = keys.map((key) => `granted.${key}`).join(",")
        await client.query(
          `INSERT INTO ${table} (${columns}, access_id, is_granted)
           SELECT DISTINCT ${selected}, target.id, TRUE
           FROM access_list target
           JOIN access_list source ON LOWER(BTRIM(source.name)) = ANY(SELECT LOWER(BTRIM(n)) FROM unnest($2::text[]) n)
           JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
           WHERE target.name = ANY($1::text[])
           ON CONFLICT (${columns}, access_id) DO NOTHING`,
          [targetNames, sourceNames],
        )
      }
    }
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [voucherPricingMigration])
  }
  }

  // طباعة/نسخ/إرسال SMS/إرسال واتساب لكل سند (2026-11-07) — كانت مفتوحة لكل من يرى السند. مرة واحدة لكل شركة: تُمنح لمن
  // يملك "استعلام" أو "إدخال" أو "تعديل" ذلك السند (مستخدم/دور، وعلى مستوى الفروع). DO UPDATE لا DO NOTHING: "طباعة/نسخ طلبية
  // مشتريات" موجودتان من تأسيس الشركات بقيم لم يفحصها شيء — لا يجوز أن تمنع الطباعة فجأة. لا تُعاد بعد ذلك.
  const voucherOutputMigration = "voucher-output-permissions-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [voucherOutputMigration])).length) {
    for (const family of VOUCHER_OUTPUT_FAMILIES) {
      const targetNames = (Object.keys(VOUCHER_OUTPUT_ACTIONS) as (keyof typeof VOUCHER_OUTPUT_ACTIONS)[]).map((action) => voucherOutputPermissionName(family, action))
      const sourceNames = [transactionPermissionName(family, "view"), transactionPermissionName(family, "create"), transactionPermissionName(family, "update")]
      for (const [table, keys] of [
        ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
        ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
      ] as const) {
        const columns = keys.join(",")
        const selected = keys.map((key) => `granted.${key}`).join(",")
        await client.query(
          `INSERT INTO ${table} (${columns}, access_id, is_granted)
           SELECT DISTINCT ${selected}, target.id, TRUE
           FROM access_list target
           JOIN access_list source ON LOWER(BTRIM(source.name)) = ANY(SELECT LOWER(BTRIM(n)) FROM unnest($2::text[]) n)
           JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
           WHERE target.name = ANY($1::text[])
           ON CONFLICT (${columns}, access_id) DO UPDATE SET is_granted = TRUE`,
          [targetNames, sourceNames],
        )
      }
    }
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [voucherOutputMigration])
  }

  // تتبع أوامر العمل صار بصلاحيات لكل شاشة (2026-11-03) — كان مفتوحاً لكل مستخدم مسجّل، وإدارته لمدير النظام فقط.
  // مرة واحدة لكل شركة: الشاشات اليومية لكل الأدوار (عدا كاشير) وللمستخدمين بلا دور، وما كان لمدير النظام لأدوار
  // المدير ولمستخدمي "مدير النظام"، والدخول/الإلغاء للمسودات لمن يملك صلاحيات المسودات القائمة.
  const taskOrdersMigration = "task-orders-screens-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [taskOrdersMigration])).length) {
    const name = transactionPermissionName
    const everyone = [
      name("task_board", "access"), name("order_confirmation", "access"), name("order_confirmation", "post"),
      name("task_order_approval", "access"), name("task_order_approval", "post"), name("order_checklist", "access"), name("order_checklist", "view"),
    ]
    const adminOnly = [
      ...transactionActionsFor("task_orders_admin").map((action) => name("task_orders_admin", action)),
      name("order_checklist", "create"), name("order_checklist", "update"), name("order_checklist", "delete"),
      name("task_board", "view"), name("task_board", "update"), name("task_board", "delete"),
      ...transactionActionsFor("sales_order_draft").map((action) => name("sales_order_draft", action)),
    ]
    const adminRoles = `LOWER(BTRIM(r.name)) IN ('مدير', 'admin', 'administrator', 'مدير النظام', 'مسؤول النظام')`
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE LOWER(BTRIM(r.name)) <> 'كاشير' AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [everyone],
    )
    await client.query(
      `INSERT INTO user_access (user_id, access_id, is_granted)
       SELECT us.user_id, a.id, TRUE FROM user_settings us CROSS JOIN access_list a
       WHERE us.job_role_id IS NULL AND a.name = ANY($1::text[])
       ON CONFLICT (user_id, access_id) DO NOTHING`,
      [everyone],
    )
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE ${adminRoles} AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [[...everyone, ...adminOnly]],
    )
    await client.query(
      `INSERT INTO user_access (user_id, access_id, is_granted)
       SELECT us.user_id, a.id, TRUE FROM user_settings us CROSS JOIN access_list a
       WHERE BTRIM(COALESCE(us.role, '')) = 'مدير النظام' AND a.name = ANY($1::text[])
       ON CONFLICT (user_id, access_id) DO NOTHING`,
      [[...everyone, ...adminOnly]],
    )
    // الدخول لشاشة المسودات لمن يملك أي صلاحية مسودة، والإلغاء (كان يتبع "تعديل") لمن يملك التعديل — مستخدم/دور، وبالفروع
    for (const [targets, sources] of [
      [[name("sales_order_draft", "access")], [name("sales_order_draft", "view"), name("sales_order_draft", "create"), name("sales_order_draft", "update")]],
      [[name("sales_order_draft", "delete")], [name("sales_order_draft", "update")]],
    ] as const) {
      for (const [table, keys] of [
        ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
        ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
      ] as const) {
        const columns = keys.join(",")
        const selected = keys.map((key) => `granted.${key}`).join(",")
        await client.query(
          `INSERT INTO ${table} (${columns}, access_id, is_granted)
           SELECT DISTINCT ${selected}, target.id, TRUE
           FROM access_list target
           JOIN access_list source ON source.name = ANY($2::text[])
           JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
           WHERE target.name = ANY($1::text[])
           ON CONFLICT (${columns}, access_id) DO NOTHING`,
          [targets, sources],
        )
      }
    }
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [taskOrdersMigration])
  }

  // برامج المساعدات (2026-11-03): صلاحيات جديدة لم تُمنح لأحد في الشركات القائمة فلم تظهر الشاشة. مرة واحدة لكل شركة:
  // لأدوار المدير/مدير النظام، ولمن يملك تعريف نقاط البيع أو الحملات (الصرف يتم من الكاشير) — مستخدمين وأدواراً وبالفروع.
  const aidProgramMigration = "aid-program-access-v1"
  if (!(await client.query(`SELECT 1 FROM permission_migrations WHERE name = $1::varchar`, [aidProgramMigration])).length) {
    const targetNames = transactionActionsFor("aid_program").map((action) => transactionPermissionName("aid_program", action))
    const sourceNames = [POS_CASHIER_PERMISSIONS.createPoint, POS_CASHIER_PERMISSIONS.editPoint, POS_CASHIER_PERMISSIONS.createCampaign, POS_CASHIER_PERMISSIONS.editCampaign]
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      const selected = keys.map((key) => `granted.${key}`).join(",")
      await client.query(
        `INSERT INTO ${table} (${columns}, access_id, is_granted)
         SELECT DISTINCT ${selected}, target.id, TRUE
         FROM access_list target
         JOIN access_list source ON LOWER(BTRIM(source.name)) = ANY(SELECT LOWER(BTRIM(n)) FROM unnest($2::text[]) n)
         JOIN ${table} granted ON granted.access_id = source.id AND granted.is_granted = TRUE
         WHERE target.name = ANY($1::text[])
         ON CONFLICT (${columns}, access_id) DO NOTHING`,
        [targetNames, sourceNames],
      )
    }
    await client.query(
      `INSERT INTO role_permissions (role_id, access_id, is_granted)
       SELECT r.id, a.id, TRUE FROM job_roles r CROSS JOIN access_list a
       WHERE LOWER(BTRIM(r.name)) IN ('مدير', 'admin', 'administrator', 'مدير النظام', 'مسؤول النظام') AND a.name = ANY($1::text[])
       ON CONFLICT (role_id, access_id) DO NOTHING`,
      [targetNames],
    )
    await client.query(`INSERT INTO permission_migrations (name) VALUES ($1::varchar) ON CONFLICT DO NOTHING`, [aidProgramMigration])
  }

  // Name-based fallback for tenant databases whose locally-created access ids
  // collide with newer management ids. This guarantees these definitions are
  // visible in صلاحيات المستخدمين even when an id-based copy is skipped.
  const draftCategoryRows = await client.query(
    `INSERT INTO access_category (name)
     SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = $1::varchar)
     RETURNING id`,
    ["الحركات"],
  )
  const draftCategory =
    draftCategoryRows[0] ||
    (await client.query(`SELECT id FROM access_category WHERE name = $1::varchar ORDER BY id LIMIT 1`, ["الحركات"]))[0]
  if (draftCategory?.id) {
    for (const permissionName of [
      "إضافة مسودة طلبية مبيعات",
      "تعديل مسودة طلبية مبيعات",
      "استعلام مسودة طلبية مبيعات",
    ]) {
      await client.query(
        `INSERT INTO access_list (name, category_id)
         SELECT $1::varchar, $2::integer
         WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1::varchar))) ON CONFLICT DO NOTHING`,
        [permissionName, draftCategory.id],
      )
    }
  }

  // 2) زرع الأدوار الوظيفية الافتراضية الثلاثة (بلا تكرار حسب الاسم) — و"مدير" فقط، وفقط أول مرة
  //    يُزرَع فيها فعلياً (لا كل مرة يُوجَد فيها الصف مسبقاً)، يُمنَح كل صلاحية حالية بالشركة. هذا
  //    الفارق مهم: إعادة منح كل شيء لصف "مدير" موجود مسبقاً قد يُلغي إلغاءً متعمَّداً قام به المسؤول.
  // Older databases may contain the same permission under multiple groups.
  // Merge those rows by normalized name while retaining all effective grants.
  await mergeDuplicateAccessDefinitions(client)

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

  // دور "كاشير" افتراضياً: شاشات الكاشير والمطاعم فقط، وكل صلاحية أخرى ممنوعة صراحةً (بلا قرار = مسموح في القوائم).
  // يملأ فقط ما لا قرار له للدور (ON CONFLICT DO NOTHING) — فما عدّله المسؤول يبقى، والصلاحيات الجديدة لاحقاً ممنوعة له.
  const cashierAllowed = [...Object.values(POS_CASHIER_PERMISSIONS), ...Object.values(RESTAURANT_PERMISSIONS)]
  await client.query(
    `INSERT INTO role_permissions (role_id, access_id, is_granted)
     SELECT r.id, a.id, LOWER(BTRIM(a.name)) = ANY(SELECT LOWER(BTRIM(n)) FROM unnest($1::text[]) n)
     FROM job_roles r CROSS JOIN access_list a
     WHERE LOWER(BTRIM(r.name)) = 'كاشير'
     ON CONFLICT (role_id, access_id) DO NOTHING`,
    [cashierAllowed],
  )
}
