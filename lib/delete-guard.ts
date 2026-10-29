import sql from "@/lib/database"

// فحص الارتباط قبل حذف أي تعريف (الملفات والتعريفات): يمسح كل أعمدة قاعدة الشركة التي قد تشير للسجل —
// بالمعرّف (أعمدة رقمية تطابق نمط الاسم) أو بالنص (أعمدة قديمة تحفظ الاسم، مثل وحدة السطر أو مدينة العميل) —
// ويتجاهل الصفوف المحذوفة أصلاً (status = 3 أو deleted/isdeleted = true). يعيد أسماء عربية للأماكن المرتبطة.

// أسماء عربية لكل جدول قد يشير لتعريف — أي جدول غير مذكور يظهر "سجلات مرتبطة أخرى" (لا اسم جدول إنجليزي للمستخدم)
const TABLE_LABELS: Record<string, string> = {
  // الأصناف والمخزون
  products: "بطاقات الأصناف", product_units: "وحدات الأصناف", product_prices: "أسعار الأصناف", product_unit_barcodes: "باركودات الأصناف",
  product_warehouses: "أرصدة المستودعات", product_warehouse_stock: "أرصدة المستودعات", product_stock: "أرصدة الأصناف", warehouse_inventory: "أرصدة المستودعات",
  inventory_transactions: "حركات المخزون", product_lots: "دفعات الأصناف", lot_transactions: "حركات الدفعات", lot_transaction_details: "حركات الدفعات",
  stock_batch: "الأرقام التشغيلية", stock_batch_log: "الأرقام التشغيلية", items_serials_tbl: "الأرقام التسلسلية", vouchers_items_serials_tbl: "الأرقام التسلسلية",
  product_branches: "فروع الأصناف", product_categories: "تصنيفات الأصناف", item_categories: "تصنيفات الأصناف", item_groups: "مجموعات الأصناف",
  product_costcenters_tbl: "مراكز تكلفة الأصناف", product_numbers: "الأرقام الأصلية للأصناف", product_related_items: "الأصناف المرتبطة",
  product_manufacturing_components: "مكونات التصنيع", product_brands_tbl: "ماركات الأصناف", product_atrributes_values_tbl: "خصائص الأصناف",
  stock_counts: "الجرد", stock_count_items: "أسطر الجرد", stock_count_serials: "أسطر الجرد", reorder_rules: "قواعد إعادة الطلب",
  warehouses: "المستودعات", warehouse_costcenters_tbl: "مراكز تكلفة المستودعات",
  // السندات والحركات
  voucher_header_tbl: "السندات", vouchers: "السندات", voucher_items_tbl: "أسطر السندات", voucher_items: "أسطر السندات",
  sales_voucher_items_tbl: "أسطر فواتير المبيعات", voucher_journal_detail_tbl: "قيود السندات", voucher_accounts_tbl: "حسابات السندات",
  voucher_costcenter_tbl: "مراكز تكلفة السندات", voucher_cards_detail_tbl: "دفعات البطاقات في السندات", voucher_notes_tbl: "ملاحظات السندات",
  voucher_related_vch_tbl: "السندات المرتبطة", voucher_item_attributes_tbl: "خصائص أسطر السندات", customer_vouchers: "سندات العملاء",
  invoice_settlements: "تسديد الفواتير", cheque_payment_voucher_items: "سندات صرف الشيكات", voucher_books_tbl: "دفاتر السندات",
  voucher_book_user_permissions_tbl: "صلاحيات دفاتر السندات",
  // الطلبيات والمبيعات
  orders: "الطلبيات", order_items: "أسطر الطلبيات", order_item_attributes_tbl: "خصائص أسطر الطلبيات", sales_orders: "طلبيات المبيعات",
  sales_order_items: "أسطر طلبيات المبيعات", purchase_orders: "طلبيات الشراء", purchase_order_items: "أسطر طلبيات الشراء",
  sales_order_drafts: "مسودات طلبيات المبيعات", sales_order_draft_items: "مسودات طلبيات المبيعات",
  customer_product_templates_tbl: "نماذج العملاء والأصناف", customer_product_template_customers_tbl: "نماذج العملاء والأصناف",
  customer_product_template_products_tbl: "نماذج العملاء والأصناف", promotions_tbl: "العروض والأسعار الخاصة",
  promotion_customers_tbl: "العروض والأسعار الخاصة", promotion_items_tbl: "العروض والأسعار الخاصة", sales_leads: "العملاء المحتملين",
  salesmen: "المندوبين", salesman_commission_rules: "عمولات المندوبين", salesman_commission_transactions: "عمولات المندوبين",
  salesman_commission_collections: "عمولات المندوبين", salesman_commission_payments: "عمولات المندوبين", salesman_targets: "أهداف المندوبين",
  task_customer_orders: "أوامر العمل", task_order_items: "أوامر العمل", task_workflow_items: "أوامر العمل",
  // العملاء والحسابات
  customers: "بطاقات العملاء/الموردين", suppliers: "الموردين", customer_branches: "فروع العملاء", customer_users: "مستخدمي بوابة العملاء",
  customer_portal_links_tbl: "روابط بوابة العملاء", customer_portal_payments_tbl: "دفعات بوابة العملاء", customer_categories: "تصنيفات العملاء",
  supplier_categories: "تصنيفات الموردين", account_tbl: "الحسابات", accounts: "الحسابات", account_branches: "فروع الحسابات",
  account_classifications_tbl: "تصنيفات الحسابات", account_classifications: "تصنيفات الحسابات", account_costcenters_tbl: "مراكز تكلفة الحسابات",
  users_currencies_default_account_tbl: "الحسابات الافتراضية للمستخدمين", virtual_cash_bank_accounts: "الحسابات الافتراضية للنظام",
  cost_centers: "مراكز التكلفة", cost_center_types: "أنواع مراكز التكلفة",
  // البنوك والشيكات والبطاقات
  cheques_tbl: "الشيكات", cheque_books_tbl: "دفاتر الشيكات", cheque_book_cheque_tbl: "شيكات الدفاتر", bank_accounts: "حسابات البنوك", banks: "البنوك",
  bank_reconciliations_tbl: "التسوية البنكية", bank_statement_lines_tbl: "كشوف البنك", bank_reconciliation_matches_tbl: "التسوية البنكية",
  credit_cards_types_tbl: "بطاقات الائتمان", credit_card_main_types_tbl: "أنواع بطاقات الائتمان",
  // نقاط البيع
  pos_points_tbl: "نقاط البيع", pos_sessions_tbl: "ورديات نقاط البيع", pos_sale_payments_tbl: "دفعات نقاط البيع", pos_cash_movements_tbl: "حركات صندوق الكاشير",
  pos_sale_drafts_tbl: "مسودات الكاشير", pos_gift_cards_tbl: "بطاقات الهدايا", pos_discount_cards_tbl: "بطاقات الخصم", pos_point_users_tbl: "مستخدمي نقاط البيع",
  pos_campaign_header_tbl: "حملات نقاط البيع", pos_campaign_items_tbl: "حملات نقاط البيع", pos_campaign_branches_tbl: "حملات نقاط البيع",
  pos_campaign_warehouses_tbl: "حملات نقاط البيع", pos_session_currencies_tbl: "ورديات نقاط البيع", pos_tobacco_custody_tbl: "عهدة الدخان",
  // الأصول والتكاليف والإقفال
  fa_assets_tbl: "الأصول الثابتة", fa_assets: "الأصول الثابتة", fa_categories_tbl: "فئات الأصول الثابتة", fa_books_tbl: "الأصول الثابتة",
  fa_transactions_tbl: "حركات الأصول الثابتة", fa_locations_tbl: "مواقع الأصول الثابتة", landed_costs_tbl: "تكاليف الشحن والجمارك",
  landed_cost_charges_tbl: "تكاليف الشحن والجمارك", fiscal_year_closings_tbl: "إقفال السنة المالية", period_locks_tbl: "إقفال الفترات",
  // الموظفون والرواتب
  employees: "الموظفين", employees_tbl: "الموظفين", employee_salary_items_tbl: "بنود رواتب الموظفين", payroll_tbl: "الرواتب",
  attendance_days_tbl: "الحضور والانصراف", attendance_transactions_tbl: "حركات الحضور", employee_jobs_tbl: "وظائف الموظفين",
  // الإعدادات العامة
  branches: "الفروع", departments: "الأقسام", user_settings: "إعدادات المستخدمين", users: "المستخدمين", drivers: "السائقين", cars: "السيارات",
  units: "الوحدات", cities: "المدن", pricecategory: "فئات الأسعار", tax_classifications: "التصنيفات الضريبية", license_types: "أنواع الرخص",
  income_statement_items: "بنود قائمة الدخل", balance_sheet_assets_items: "بنود الأصول", balance_sheet_liabilities_items: "بنود الخصوم",
  general_settings: "الإعدادات العامة", system_settings: "إعدادات النظام", sms_templates_tbl: "قوالب الرسائل", whatsapp_templates: "قوالب واتساب",
}
const label = (table: string) => TABLE_LABELS[table] || "سجلات مرتبطة أخرى"

// جداول السجلّات/التدقيق/الجلسات/الإشعارات لا تمنع الحذف: سجلّ قديم لسند محذوف لا يربط التعريف بحركة قائمة
const IGNORED_TABLE = /(_log|_logs|_log_tbl|_audit|audit_|_events|_snapshots_tbl|_sessions|^sessions$|notification|^chat_|^error_logs$|_statistics$|^app_schema_state$|^permission_|^failed_login|^password_|^tenant_|^management_|^user_favorites$|^onboarding_)/

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
  // أسطر السندات (قيود/أصناف/شيكات…) لا حالة لها — سطر في سند محذوف (status = 3) لا يمنع الحذف
  const hasVoucherHeader = table !== "voucher_header_tbl" && columns.some((c) => c.table_name === "voucher_header_tbl" && c.column_name === "status")
  if (hasVoucherHeader && own.some((c) => c.column_name === "voucher_id" && ["integer", "bigint"].includes(c.data_type))) {
    parts.push(`NOT EXISTS (SELECT 1 FROM voucher_header_tbl vh_guard WHERE vh_guard.id = "${table}"."voucher_id" AND COALESCE(vh_guard.status, 1) = 3)`)
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
    if (exclude.has(table) || IGNORED_TABLE.test(table) || found.has(label(table)) || excludeCols.has(`${table}.${column}`)) continue
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
