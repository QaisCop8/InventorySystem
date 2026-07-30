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

// جداول "لوكاب" ثابتة (أنواع/تصنيفات/حالات نظامية عامة، لا بيانات شركة بعينها) — كل واحد منها
// مرجع (lookup) تعتمد عليه شاشات مختلفة (السندات، الشيكات، البطاقات الائتمانية، القوائم المالية،
// الضرائب...)، وبلا نسخ قيمها الفعلية من القاعدة المرجعية تبقى فارغة فتفشل تلك الشاشات لشركة حديثة
// التزويد رغم وجود الجداول نفسها. تقتصر القائمة عمداً على جداول لا تحمل company_id/branch_id ولا
// أي ربط ببيانات شركة بعينها (حسابات، فروع، بنوك...) — عكس جداول مثل account_tbl أو bank_accounts
// التي تُعتبر بيانات فعلية خاصة بكل شركة ويجب أن تبدأ فارغة تماماً لكل شركة جديدة.
// cost_center_types عمداً غير مُدرَج هنا (كان مُدرَجاً سابقاً) — كل شركة تبني مراكز كلفتها الخاصة من
// الصفر (لا قيمة مشتركة معقولة كسندات/عملات/تصنيفات ضريبة عامة)، فتبدأ فارغة تماماً كالحسابات نفسها.
const LOOKUP_TABLES = [
  "voucher_types_tbl",
  "voucher_books_tbl",
  "voucher_status_tbl",
  "voucher_journal_type_tbl",
  "voucher_journal_type_caption_tbl",
  "account_classification_types",
  "balance_sheet_assets_items",
  "balance_sheet_liabilities_items",
  "income_statement_items",
  "payment_classifications_tbl",
  "tax_classifications",
  "pricecategory",
  "measurment_types_tbl",
  "cities",
  "cheque_status_tbl",
  "cheque_book_status_tbl",
  "cheques_type_tbl",
  "credit_card_main_types_tbl",
  "credit_card_commission_types_tbl",
  // تسلسل/مراحل سير عمل طلبيات المبيعات (workflow engine عام غير مرتبط بشركة بعينها) — الترتيب
  // هنا مقصود (مراحل، ثم تسلسلات، ثم خطوات) لأن workflow_sequence_steps يشير لمعرّفات الجدولين
  // الأولين بنفس القيم المنسوخة حرفياً من القاعدة المرجعية، فيبقى الربط صحيحاً في قاعدة الشركة
  // الجديدة أيضاً. انظر scripts/29-seed-sales-order-workflow.sql للتسلسل الافتراضي المزروع في
  // القاعدة المرجعية نفسها.
  "workflow_stages",
  "workflow_sequences",
  "workflow_sequence_steps",
]

async function seedLookupTable(referencePool: ReturnType<typeof getPoolForDb>, tenantClient: ReturnType<typeof getPoolForDb>, tableName: string) {
  const columns = await referencePool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tableName],
  )
  const columnNames = columns.map((c: { column_name: string }) => c.column_name)
  const quotedCols = columnNames.map((c: string) => `"${c}"`).join(", ")
  const placeholders = columnNames.map((_: string, i: number) => `$${i + 1}`).join(", ")

  const rows = await referencePool.query(`SELECT * FROM "${tableName}" ORDER BY id`, [])
  for (const row of rows) {
    const values = columnNames.map((c: string) => row[c])
    await tenantClient.query(
      `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values,
    )
  }
}

async function seedLookupTables(tenantClient: ReturnType<typeof getPoolForDb>) {
  const referencePool = getPoolForDb(referenceDbName)
  for (const tableName of LOOKUP_TABLES) {
    await seedLookupTable(referencePool, tenantClient, tableName)
  }
}

// فئات وقوائم الصلاحيات (access_category, access_list) ثابتة (الملفات والتعريفات، الحركات،
// التقارير...) تُستخدَم في شاشة "صلاحيات المستخدمين" — تُنسخ من القاعدة المرجعية بنفس أسلوب
// voucher_types_tbl أعلاه، ثم تُمنَح جميعها افتراضياً لمستخدم admin (user_id='1') المُنشأ للتو
// حتى لا يبدأ بلا أي صلاحية رغم كونه مدير النظام.
async function seedAccessListsAndGrantAdmin(tenantClient: ReturnType<typeof getPoolForDb>) {
  const referencePool = getPoolForDb(referenceDbName)

  const categories = await referencePool.query(`SELECT id, name FROM access_category ORDER BY id`, [])
  for (const cat of categories) {
    await tenantClient.query(`INSERT INTO access_category (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [
      cat.id,
      cat.name,
    ])
  }

  const accessList = await referencePool.query(`SELECT id, name, category_id FROM access_list ORDER BY id`, [])
  for (const item of accessList) {
    await tenantClient.query(
      `INSERT INTO access_list (id, name, category_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [item.id, item.name, item.category_id],
    )
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

async function seedDefaultSystemSettings(tenantClient: ReturnType<typeof getPoolForDb>) {
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

  // system_settings.id قد يكون لا يزال SERIAL/عددياً قديماً بدل VARCHAR(100) المقصود (تلك الهجرة
  // تُنفَّذ فقط عند أول استدعاء لـensureSettingsTable بـapp/api/settings/system/route.ts — إن لم
  // يُستدعَ هذا المسار بعد على القاعدة المرجعية، ترثه كل شركة جديدة كما هو عبر cloneReferenceSchema
  // أعلاه). المحاولة الأولى هنا كانت تكتشف هذه الحالة وتُدرِج بعمودَي description/value بدل id (نفس
  // حل ensureSettingsTable) لكنها افترضت خطأً وجود تسلسل SERIAL يُعيّن id تلقائياً عند حذفه من
  // الإدراج — إن كان id عدداً صحيحاً بلا قيمة افتراضية أصلاً (الحالة الفعلية هنا: عمود عددي مُستنسَخ
  // بلا nextval)، يفشل الإدراج بـ"null value in column \"id\" violates not-null constraint" بدل ذلك.
  // الحل الأضمن: تهجير العمود صراحة لِـVARCHAR(100) (الشكل النهائي المقصود) على هذا الجدول الفارغ
  // تواً (شركة جديدة، بلا صفوف بعد فتُهاجَر بأمان دوماً) بدل محاولة التكيّف مع الشكل القديم.
  await tenantClient.query(`ALTER TABLE system_settings ALTER COLUMN id TYPE VARCHAR(100) USING id::TEXT`, []).catch(() => {})
  await tenantClient.query(`ALTER TABLE system_settings ALTER COLUMN id DROP DEFAULT`, []).catch(() => {})

  for (const [key, value] of rows) {
    await tenantClient.query(
      `INSERT INTO system_settings (id, description, value) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, value = EXCLUDED.value`,
      [key, key, value],
    )
  }
}

async function clearFreshCompanySeedData(tenantClient: ReturnType<typeof getPoolForDb>) {
  await tenantClient.query(`TRUNCATE TABLE products, banks, bank_accounts RESTART IDENTITY CASCADE`)
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

  // CREATE DATABASE يجب أن يُنفَّذ خارج أي معاملة (transaction) — استعلام مستقل عبر اتصال قاعدة
  // الإدارة (management)، وهو ما يوفّره sql.unsafe هنا بلا BEGIN/COMMIT محيطة.
  await managementSql.unsafe(`CREATE DATABASE "${dbName}"`)

  const tenantClient = getPoolForDb(dbName)

  await cloneReferenceSchema(tenantClient)
  await seedLookupTables(tenantClient)
  const branchId = await seedDefaultBranchAndSection(tenantClient)
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
