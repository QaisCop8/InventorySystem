import crypto from "crypto"
import managementSql, { ensureManagementTables } from "./management-db"
import { getPoolForDb } from "./database"
import { getDatabaseNameFromUrl } from "./db-url"

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

const referenceDbName = getDatabaseNameFromUrl(process.env.DATABASE_URL || "")

interface ColumnInfo {
  column_name: string
  data_type: string
  udt_name: string
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
  is_nullable: "YES" | "NO"
  column_default: string | null
}

function isSerialColumn(col: ColumnInfo): boolean {
  return !!col.column_default && col.column_default.startsWith("nextval(")
}

function columnTypeSql(col: ColumnInfo): string {
  if (isSerialColumn(col)) return col.data_type === "bigint" ? "BIGSERIAL" : "SERIAL"

  switch (col.data_type) {
    case "character varying":
      return col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : "VARCHAR"
    case "numeric":
      return col.numeric_precision != null ? `NUMERIC(${col.numeric_precision}, ${col.numeric_scale ?? 0})` : "NUMERIC"
    case "timestamp without time zone":
      return "TIMESTAMP"
    case "timestamp with time zone":
      return "TIMESTAMPTZ"
    case "double precision":
      return "DOUBLE PRECISION"
    case "ARRAY":
      return `${col.udt_name.replace(/^_/, "")}[]`
    default:
      return col.data_type.toUpperCase()
  }
}

type ConstraintGroup = { type: "PRIMARY KEY" | "UNIQUE"; cols: string[] }

async function getConstraintGroups(referencePool: ReturnType<typeof getPoolForDb>, tableName: string) {
  const rows = await referencePool.query(
    `SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [tableName],
  )
  const groups = new Map<string, ConstraintGroup>()
  for (const r of rows) {
    if (!groups.has(r.constraint_name)) groups.set(r.constraint_name, { type: r.constraint_type, cols: [] })
    groups.get(r.constraint_name)!.cols.push(r.column_name)
  }
  return [...groups.values()]
}

function buildCreateTableSql(tableName: string, columns: ColumnInfo[], constraintGroups: ConstraintGroup[]): string {
  const colDefs = columns.map((col) => {
    let def = `"${col.column_name}" ${columnTypeSql(col)}`
    const serial = isSerialColumn(col)
    if (col.is_nullable === "NO" && !serial) def += " NOT NULL"
    if (col.column_default && !serial) def += ` DEFAULT ${col.column_default}`
    return def
  })

  const constraintDefs = constraintGroups.map((group) => {
    const cols = group.cols.map((c) => `"${c}"`).join(", ")
    return group.type === "PRIMARY KEY" ? `PRIMARY KEY (${cols})` : `UNIQUE (${cols})`
  })

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${[...colDefs, ...constraintDefs].join(",\n  ")}\n)`
}

// تُنسخ بنية قاعدة الشركة الجديدة بالكامل (كل الجداول) من القاعدة المرجعية (inventory_system، أي
// DATABASE_URL) بدل الاكتفاء بجدول user_settings فقط — عبر قراءة information_schema بدل كتابة كل
// جدول يدوياً (١٠٧ جدول حالياً)، حتى تبقى مطابقة تلقائياً لأي تعديل مستقبلي على المخطط دون حاجة
// لتحديث هذا الملف بكل مرة. تتعمّد تجاهل قيود المفاتيح الأجنبية (FK) لتفادي مشاكل ترتيب الإنشاء —
// نفس أسلوب بقية المشروع الذي ينشئ جداوله ذاتياً (CREATE TABLE IF NOT EXISTS) بلا FK صريحة غالباً.
async function cloneReferenceSchema(tenantClient: ReturnType<typeof getPoolForDb>) {
  const referencePool = getPoolForDb(referenceDbName)

  const tables = await referencePool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [],
  )

  for (const { table_name } of tables) {
    const columns: ColumnInfo[] = await referencePool.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table_name],
    )
    const constraintGroups = await getConstraintGroups(referencePool, table_name)
    const ddl = buildCreateTableSql(table_name, columns, constraintGroups)
    await tenantClient.query(ddl, [])
  }
}

// جدول أنواع السندات (voucher_types_tbl) قائمة ثابتة (طلبية مبيعات، فاتورة مبيعات، سند قبض...)
// تُستخدَم كمرجع (lookup) في كل شاشات السندات — تُنسخ قيمها فعلياً من القاعدة المرجعية بدل تركها
// فارغة، وإلا فشلت كل شاشات السندات لشركة حديثة التزويد رغم وجود الجدول.
async function seedVoucherTypes(tenantClient: ReturnType<typeof getPoolForDb>) {
  const referencePool = getPoolForDb(referenceDbName)
  const voucherTypes = await referencePool.query(`SELECT id, name, status FROM voucher_types_tbl ORDER BY id`, [])
  for (const vt of voucherTypes) {
    await tenantClient.query(
      `INSERT INTO voucher_types_tbl (id, name, status) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [vt.id, vt.name, vt.status],
    )
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

export async function provisionCompanyDatabase(company: { id: number; name: string; requestedByEmail: string; requestedByFullName: string; requestedByPasswordHash: string }, approvedByUserId: number) {
  await ensureManagementTables()

  const dbName = await generateUniqueDbName()

  // CREATE DATABASE يجب أن يُنفَّذ خارج أي معاملة (transaction) — استعلام مستقل عبر اتصال قاعدة
  // الإدارة (management)، وهو ما يوفّره sql.unsafe هنا بلا BEGIN/COMMIT محيطة.
  await managementSql.unsafe(`CREATE DATABASE "${dbName}"`)

  const tenantClient = getPoolForDb(dbName)

  await cloneReferenceSchema(tenantClient)
  await seedVoucherTypes(tenantClient)
  const branchId = await seedDefaultBranchAndSection(tenantClient)

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

  await managementSql`
    UPDATE companies
    SET db_name = ${dbName}, status = 'approved', approved_by = ${approvedByUserId}, approved_at = CURRENT_TIMESTAMP
    WHERE id = ${company.id}
  `

  return { dbName }
}
