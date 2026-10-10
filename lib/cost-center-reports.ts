// تقارير مراكز التكلفة — تعريف مشترك بين الخادم (app/api/reports/cost-centers) والواجهة والقائمة والصلاحيات.

export const COST_CENTER_REPORTS = {
  "statement-with-cc": { section: "cc-statement-with-report", title: "كشف حساب مع اظهار مركز تكلفة", shape: "lines" },
  "statement-by-cc": { section: "cc-statement-by-report", title: "كشف حساب حسب مركز تكلفة", shape: "lines" },
  "accounts-movement-cc": { section: "cc-accounts-movement-report", title: "حركة الحسابات لمراكز التكلفة", shape: "pivot" },
  "transactions-with-cc": { section: "cc-transactions-report", title: "تقرير الحركات مع اظهار مركز تكلفة", shape: "lines" },
  "trial-balance-cc": { section: "cc-trial-balance-report", title: "ميزان مراجعة بمراكز التكلفة", shape: "trial" },
  "trial-balance-accounts": { section: "cc-trial-balance-accounts-report", title: "ميزان مراجعة بالحسابات", shape: "trial" },
  "income-statement-cc": { section: "cc-income-statement-report", title: "قائمة الدخل بمراكز التكلفة", shape: "pivot" },
  "balance-sheet-cc": { section: "cc-balance-sheet-report", title: "ميزانية عمومية بمراكز التكلفة", shape: "pivot" },
  "income-statement-by-cc": { section: "cc-income-statement-by-report", title: "قائمة الدخل حسب مركز التكلفة", shape: "pivot" },
  "balance-sheet-by-cc": { section: "cc-balance-sheet-by-report", title: "ميزانية عمومية حسب مركز التكلفة", shape: "pivot" },
} as const

export type CostCenterReportKind = keyof typeof COST_CENTER_REPORTS

export const COST_CENTER_REPORT_KINDS = Object.keys(COST_CENTER_REPORTS) as CostCenterReportKind[]

/** القسم (section) في القائمة/الصلاحيات ⇐ نوع التقرير */
export const costCenterKindForSection = (section: string) =>
  COST_CENTER_REPORT_KINDS.find((kind) => COST_CENTER_REPORTS[kind].section === section) || null
