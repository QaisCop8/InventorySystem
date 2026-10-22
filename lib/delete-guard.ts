import sql from "@/lib/database"

// فحص الارتباط قبل حذف أي تعريف (الملفات والتعريفات): يمسح كل أعمدة قاعدة الشركة التي قد تشير للسجل —
// بالمعرّف (أعمدة رقمية تطابق نمط الاسم) أو بالنص (أعمدة قديمة تحفظ الاسم، مثل وحدة السطر أو مدينة العميل) —
// ويتجاهل الصفوف المحذوفة أصلاً (status = 3 أو deleted/isdeleted = true). يعيد أسماء عربية للأماكن المرتبطة.

const TABLE_LABELS: Record<string, string> = {
  products: "بطاقات الأصناف", product_units: "وحدات الأصناف", product_prices: "أسعار الأصناف", product_unit_barcodes: "باركودات الأصناف",
  product_warehouses: "أرصدة المستودعات", inventory_transactions: "حركات المخزون", voucher_items_tbl: "أسطر السندات", voucher_items: "أسطر السندات",
  sales_voucher_items_tbl: "أسطر فواتير المبيعات", voucher_header_tbl: "السندات", vouchers: "السندات", orders: "الطلبيات", order_items: "أسطر الطلبيات",
  purchase_order_items: "أسطر طلبيات الشراء", sales_order_items: "أسطر طلبيات المبيعات", sales_orders: "طلبيات المبيعات", purchase_orders: "طلبيات الشراء",
  customers: "العملاء/الموردين", suppliers: "الموردين", user_settings: "إعدادات المستخدمين", pos_points_tbl: "نقاط البيع", drivers: "السائقين",
  account_tbl: "الحسابات", accounts: "الحسابات", account_classifications_tbl: "تصنيفات الحسابات", account_classifications: "تصنيفات الحسابات",
  account_costcenters_tbl: "مراكز تكلفة الحسابات", product_costcenters_tbl: "مراكز تكلفة الأصناف", voucher_costcenter_tbl: "مراكز تكلفة السندات",
  voucher_accounts_tbl: "حسابات السندات", voucher_journal_detail_tbl: "قيود السندات", cost_centers: "مراكز التكلفة",
  cheques_tbl: "الشيكات", stock_counts_tbl: "الجرد", stock_count_lines_tbl: "أسطر الجرد", bank_accounts: "حسابات البنوك", credit_cards_types_tbl: "بطاقات الائتمان",
  pos_sessions_tbl: "ورديات نقاط البيع", pos_sale_payments_tbl: "دفعات نقاط البيع", salesmen: "المندوبين", fa_assets: "الأصول الثابتة",
  landed_costs_tbl: "تكاليف الشحن والجمارك", bank_reconciliations_tbl: "التسوية البنكية", employees: "الموظفين",
}
const label = (table: string) => TABLE_LABELS[table] || table

type ColumnMeta = { table_name: string; column_name: string; data_type: string }

async function schemaColumns(): Promise<ColumnMeta[]> {
  return (await sql`
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = current_schema()
  `) as ColumnMeta[]
}

const SAFE = /^[a-z_][a-z0-9_]*$/i

/** شرط "الصف غير محذوف" حسب أعمدة الجدول (status رقمي = 3، deleted/isdeleted منطقي). */
function liveCondition(table: string, columns: ColumnMeta[]) {
  const own = columns.filter((c) => c.table_name === table)
  const parts: string[] = []
  const status = own.find((c) => c.column_name === "status")
  if (status && ["integer", "smallint", "bigint"].includes(status.data_type)) parts.push(`COALESCE("status", 1) <> 3`)
  for (const flag of ["deleted", "isdeleted", "is_deleted"]) {
    const col = own.find((c) => c.column_name === flag)
    if (col?.data_type === "boolean") parts.push(`COALESCE("${flag}", false) = false`)
  }
  return parts.length ? ` AND ${parts.join(" AND ")}` : ""
}

export type UsageRule = {
  /** أعمدة رقمية تشير للمعرّف (مطابقة لاسم العمود). */
  idColumns?: RegExp
  /** أعمدة نصية تحفظ الاسم/الرمز بدل المعرّف (مطابقة لاسم العمود) — تُقارَن مع textValues. */
  textColumns?: RegExp
  textValues?: (string | number | null | undefined)[]
  /** جداول تُستثنى (الجدول نفسه وجداول إعداده التي تُحذف معه). */
  excludeTables?: string[]
  /** أعمدة مستثناة بالاسم الكامل table.column (تشابه أسماء بلا علاقة). */
  excludeColumns?: string[]
}

/** أماكن استخدام السجل — قائمة أسماء عربية بلا تكرار (فارغة = يمكن الحذف). */
export async function findUsages(id: number, rule: UsageRule): Promise<string[]> {
  const columns = await schemaColumns()
  const exclude = new Set(rule.excludeTables || [])
  const excludeCols = new Set(rule.excludeColumns || [])
  const texts = [...new Set((rule.textValues || []).map((v) => String(v ?? "").trim()).filter(Boolean))]
  const found = new Set<string>()
  for (const col of columns) {
    const { table_name: table, column_name: column, data_type: type } = col
    if (exclude.has(table) || found.has(label(table)) || excludeCols.has(`${table}.${column}`)) continue
    if (!SAFE.test(table) || !SAFE.test(column)) continue
    const numeric = ["integer", "smallint", "bigint", "numeric"].includes(type)
    const textual = ["character varying", "text", "character"].includes(type)
    let where = ""
    let params: unknown[] = []
    if (numeric && rule.idColumns?.test(column)) { where = `"${column}" = $1`; params = [id] }
    else if (textual && texts.length && rule.textColumns?.test(column)) { where = `BTRIM("${column}") = ANY($1::text[])`; params = [texts] }
    else continue
    try {
      const rows = await sql.unsafe(`SELECT 1 FROM "${table}" WHERE ${where}${liveCondition(table, columns)} LIMIT 1`, params)
      if (rows[0]) found.add(label(table))
    } catch { /* جدول/عمود غير متوافق — يُتجاهل */ }
  }
  return [...found]
}

/** أماكن استخدام حساب (account_tbl.id) — كل عمود ينتهي بـ account_id/…_account وما شابه. */
export function findAccountUsages(accountId: number, excludeTables: string[] = []) {
  return findUsages(accountId, {
    idColumns: /^(account_id|acc_id|account|.+_account_id|.+_account)$/,
    excludeTables: ["account_tbl", "account_stop_transactions_tbl", "account_costcenters_tbl", "account_classifications_tbl", "account_branches", "sms_log_tbl", ...excludeTables],
  })
}

/** رسالة الرفض الموحّدة. */
export function usageMessage(kind: string, name: string, usages: string[]) {
  const list = usages.slice(0, 6).join("، ") + (usages.length > 6 ? "…" : "")
  return `لا يمكن حذف ${kind}${name ? ` "${name}"` : ""} لأنه مستخدم في: ${list} — يمكنك إيقافه بدلاً من حذفه`
}
