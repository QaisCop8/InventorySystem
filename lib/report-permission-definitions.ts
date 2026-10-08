// صلاحيات التقارير — صلاحية "استعلام" مستقلة لكل تقرير، تُدار من شاشة الصلاحيات (للدور/المستخدم/الفرع).
// مشتركة بين الخادم (التعريف والفحص) والواجهة (إخفاء التقارير غير المسموح بها من القائمة ومنع فتحها).

export const REPORT_PERMISSION_CATEGORY = "صلاحيات التقارير"

export type ReportDefinition = { section: string; title: string }

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { section: "item-card-report", title: "بطاقة صنف" },
  { section: "item-balances-report", title: "أرصدة المخزون بتاريخ معين" },
  { section: "item-valuation-report", title: "تقييم المخزون بتاريخ معين" },
  { section: "items-profit-report", title: "تقرير نسبة أرباح المخزون" },
  { section: "period-profit-report", title: "تقرير ارباح فترة معينة" },
  { section: "item-sales-cost-report", title: "تكلفة مبيعات صنف" },
  { section: "invoice-profit-report", title: "أرباح فاتورة معينة" },
  { section: "pricing-inventory", title: "تسعير الإخراجات" },
  { section: "receivables-statement-report", title: "بيان حساب الذمة" },
  { section: "accounting-statement-report", title: "بيان حساب محاسبي" },
  { section: "receivables-balances-report", title: "تقرير أرصدة الذمم بتاريخ معين" },
  { section: "accounting-balances-report", title: "تقرير أرصدة الحسابات بتاريخ معين" },
  { section: "vouchers-report", title: "تقرير السندات" },
  { section: "transactions-report", title: "تقرير الحركات" },
  { section: "trial-balance-report", title: "ميزان المراجعة" },
  { section: "balance-sheet-report", title: "الميزانية العمومية" },
  { section: "income-statement-report", title: "قائمة الدخل" },
  { section: "order-reports", title: "تقارير الطلبيات" },
  { section: "batch-log-report", title: "أرشفة الرقم التشغيلي" },
  { section: "cashier-log-report", title: "تقرير متابعة الكاشير" },
  { section: "cashier-log-total-report", title: "تقرير حركات الكاشير إجمالي" },
  { section: "cashier-log-detailed-report", title: "تقرير حركات الكاشير تفصيلي" },
  { section: "task-orders-report", title: "تقارير أوامر العمل" },
  { section: "sales-drafts-archive-report", title: "تقرير ارشفة مسودات طلبيات المبيعات" },
  { section: "salary-items-report", title: "تقرير بنود الرواتب" },
  { section: "income-tax-report", title: "ضريبة دخل الموظفين" },
  { section: "attendance-detailed-report", title: "دخول الموظفين تفصيلي" },
  { section: "attendance-summary-report", title: "دخول الموظفين إجمالي" },
]

/** اسم الصلاحية كما يظهر في شاشة الصلاحيات. */
export const reportPermissionName = (title: string) => `استعلام ${title}`

const BY_SECTION = new Map(REPORT_DEFINITIONS.map((definition) => [definition.section, definition]))
export const reportDefinitionFor = (section: string | null | undefined) => (section ? BY_SECTION.get(section) : undefined)
export const isReportSection = (section: string | null | undefined) => Boolean(reportDefinitionFor(section))
export const reportPermissionNameFor = (section: string) => {
  const definition = reportDefinitionFor(section)
  return definition ? reportPermissionName(definition.title) : null
}
