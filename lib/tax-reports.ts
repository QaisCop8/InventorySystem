// التقارير الضريبية — تعريف مشترك بين الخادم (app/api/reports/tax) والواجهة والقائمة والصلاحيات.

export const TAX_REPORTS = {
  calculation: { section: "tax-calculation-report", title: "تقرير كشف احتساب الضريبة" },
  sales: { section: "tax-sales-statement-report", title: "كشف المبيعات الضريبية" },
  purchases: { section: "tax-purchases-statement-report", title: "كشف المشتريات الضريبية" },
  "sales-purchases": { section: "tax-sales-purchases-report", title: "تقرير المبيعات والمشتريات الضريبية" },
  "maqasa-sales": { section: "tax-maqasa-sales-report", title: "تقرير مبيعات المقاصة" },
  "maqasa-purchases": { section: "tax-maqasa-purchases-report", title: "تقرير مشتريات المقاصة" },
} as const

export type TaxReportKind = keyof typeof TAX_REPORTS
export const TAX_REPORT_KINDS = Object.keys(TAX_REPORTS) as TaxReportKind[]

// قيم حقول تبويب "الضريبة" في السندات (components/sales/unified-sales-delivery.tsx)
export const VAT_CLASSIFICATIONS: Record<number, string> = { 1: "ضريبية", 2: "معفاه", 3: "صفرية" }
export const INVOICE_TYPES: Record<number, string> = { 1: "للتجارة", 2: "خدمات", 3: "أصول" }
export const MAQASA_CODES: Record<number, string> = { 1: "تجارية", 2: "أصول", 3: "خدمات" }
