// صلاحيات التقارير — صلاحية "استعلام" مستقلة لكل تقرير، تُدار من شاشة الصلاحيات (للدور/المستخدم/الفرع).
// مشتركة بين الخادم (التعريف والفحص) والواجهة (إخفاء التقارير غير المسموح بها من القائمة ومنع فتحها).

export const REPORT_PERMISSION_CATEGORY = "صلاحيات التقارير"

export type ReportDefinition = { section: string; title: string }

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { section: "item-card-report", title: "بطاقة صنف" },
  { section: "item-balances-report", title: "أرصدة المخزون بتاريخ معين" },
  { section: "item-valuation-report", title: "تقييم المخزون بتاريخ معين" },
  { section: "expiry-balances-report", title: "أرصدة الأصناف حسب تاريخ الصلاحية" },
  { section: "items-profit-report", title: "تقرير نسبة أرباح المخزون" },
  { section: "period-profit-report", title: "تقرير ارباح فترة معينة" },
  { section: "item-sales-cost-report", title: "تكلفة مبيعات صنف" },
  { section: "invoice-profit-report", title: "أرباح فاتورة معينة" },
  { section: "pricing-inventory", title: "تسعير الإخراجات" },
  { section: "receivables-statement-report", title: "بيان حساب الذمة" },
  { section: "accounting-statement-report", title: "بيان حساب محاسبي" },
  { section: "receivables-balances-report", title: "تقرير أرصدة الذمم بتاريخ معين" },
  { section: "accounting-balances-report", title: "تقرير أرصدة الحسابات بتاريخ معين" },
  { section: "receivables-aging-report", title: "تقرير تعمير الذمم" },
  { section: "vouchers-report", title: "تقرير السندات" },
  { section: "transactions-report", title: "تقرير الحركات" },
  { section: "trial-balance-report", title: "ميزان المراجعة" },
  { section: "balance-sheet-report", title: "الميزانية العمومية" },
  { section: "income-statement-report", title: "قائمة الدخل" },
  { section: "deliveries-report", title: "تقرير الارساليات" },
  { section: "internal-deliveries-report", title: "تقرير الارساليات الداخلية" },
  { section: "consignment-invoices-report", title: "الفواتير الصادرة من إرسالية برسم البيع" },
  { section: "tax-calculation-report", title: "تقرير كشف احتساب الضريبة" },
  { section: "tax-sales-statement-report", title: "كشف المبيعات الضريبية" },
  { section: "tax-purchases-statement-report", title: "كشف المشتريات الضريبية" },
  { section: "tax-sales-purchases-report", title: "تقرير المبيعات والمشتريات الضريبية" },
  { section: "tax-maqasa-sales-report", title: "تقرير مبيعات المقاصة" },
  { section: "tax-maqasa-purchases-report", title: "تقرير مشتريات المقاصة" },
  { section: "cc-statement-with-report", title: "كشف حساب مع اظهار مركز تكلفة" },
  { section: "cc-statement-by-report", title: "كشف حساب حسب مركز تكلفة" },
  { section: "cc-accounts-movement-report", title: "حركة الحسابات لمراكز التكلفة" },
  { section: "cc-transactions-report", title: "تقرير الحركات مع اظهار مركز تكلفة" },
  { section: "cc-trial-balance-report", title: "ميزان مراجعة بمراكز التكلفة" },
  { section: "cc-trial-balance-accounts-report", title: "ميزان مراجعة بالحسابات" },
  { section: "cc-income-statement-report", title: "قائمة الدخل بمراكز التكلفة" },
  { section: "cc-balance-sheet-report", title: "ميزانية عمومية بمراكز التكلفة" },
  { section: "cc-income-statement-by-report", title: "قائمة الدخل حسب مركز التكلفة" },
  { section: "cc-balance-sheet-by-report", title: "ميزانية عمومية حسب مركز التكلفة" },
  { section: "order-reports", title: "ملخص الطلبيات" },
  { section: "orders-detailed-report", title: "تقرير الطلبيات تفصيلي" },
  { section: "orders-total-report", title: "تقرير الطلبيات إجمالي" },
  { section: "orders-by-item-report", title: "الطلبيات حسب الصنف" },
  { section: "orders-by-party-report", title: "الطلبيات حسب العميل/المورد" },
  { section: "orders-backlog-report", title: "الطلبيات غير المسلّمة" },
  { section: "orders-by-salesman-report", title: "الطلبيات حسب المندوب" },
  { section: "batch-log-report", title: "أرشفة الرقم التشغيلي" },
  { section: "serial-movements-report", title: "تقرير حركات السيريال" },
  { section: "production-detailed-report", title: "تقرير الانتاج تفصيلي" },
  { section: "production-produced-report", title: "المواد المنتجة حسب الصنف" },
  { section: "production-raw-report", title: "استهلاك المواد الخام حسب الصنف" },
  { section: "production-vouchers-report", title: "تكلفة سندات الانتاج" },
  { section: "cashier-log-report", title: "تقرير متابعة الكاشير" },
  { section: "pos-custody-report", title: "تقرير عهد البيع بالتجزئة" },
  { section: "cashier-log-total-report", title: "تقرير حركات الكاشير إجمالي" },
  { section: "cashier-log-detailed-report", title: "تقرير حركات الكاشير تفصيلي" },
  { section: "task-orders-report", title: "تقارير أوامر العمل" },
  { section: "restaurant-tables-report", title: "تقرير الطاولات" },
  { section: "restaurant-orders-report", title: "طلبات المطعم تفصيلي" },
  { section: "restaurant-items-report", title: "الأصناف المباعة في المطعم" },
  { section: "restaurant-waiters-report", title: "المطعم حسب النادل" },
  { section: "restaurant-locations-report", title: "المطعم حسب الموقع" },
  { section: "restaurant-hours-report", title: "أوقات الذروة في المطعم" },
  { section: "voucher-audit-report", title: "تقرير ارشفة السندات" },
  { section: "report-audit-report", title: "تقرير ارشفة التقارير" },
  { section: "sales-drafts-archive-report", title: "تقرير ارشفة مسودات طلبيات المبيعات" },
  { section: "salary-items-report", title: "تقرير بنود الرواتب" },
  { section: "income-tax-report", title: "ضريبة دخل الموظفين" },
  { section: "attendance-detailed-report", title: "دخول الموظفين تفصيلي" },
  { section: "attendance-summary-report", title: "دخول الموظفين إجمالي" },
]

/** اسم الصلاحية كما يظهر في شاشة الصلاحيات. */
export const reportPermissionName = (title: string) => `استعلام ${title}`
export const reportPrintPermissionName = (title: string) => `طباعة التقرير ${title}`
export const reportWhatsAppPermissionName = (title: string) => `إرسال التقرير عبر واتساب ${title}`

export type ReportPermissionAction = "access" | "print" | "whatsapp"
export const reportPermissionNameForTitle = (title: string, action: ReportPermissionAction) => {
  if (action === "print") return reportPrintPermissionName(title)
  if (action === "whatsapp") return reportWhatsAppPermissionName(title)
  return reportPermissionName(title)
}

const BY_SECTION = new Map(REPORT_DEFINITIONS.map((definition) => [definition.section, definition]))
export const reportDefinitionFor = (section: string | null | undefined) => (section ? BY_SECTION.get(section) : undefined)
export const isReportSection = (section: string | null | undefined) => Boolean(reportDefinitionFor(section))
export const reportPermissionNameFor = (section: string, action: ReportPermissionAction = "access") => {
  const definition = reportDefinitionFor(section)
  return definition ? reportPermissionNameForTitle(definition.title, action) : null
}
