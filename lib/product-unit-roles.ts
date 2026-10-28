/**
 * أدوار وحدات الصنف (تبويب الوحدات في تعريف الصنف): وحدة الجرد / وحدة الشراء / وحدة التقارير.
 * كل دور: وحدة واحدة على الأكثر لكل صنف (product_units.is_*_unit)؛ إن لم يُؤشَّر أي وحدة يُستخدم الترتيب
 * السابق (أول وحدة = الوحدة الرئيسية).
 * - وحدة الجرد: الوحدة الافتراضية لسطور جرد المخازن.
 * - وحدة الشراء: الوحدة الافتراضية في طلبية/إرسالية/فاتورة المشتريات (ومرتجعها).
 * - وحدة التقارير: تقارير الأرصدة تعرض الكمية بها (الرصيد بالوحدة الرئيسية ÷ معاملها).
 * لا يستورد قاعدة البيانات — آمن للاستخدام في الواجهة.
 */
export type UnitRole = "stock_count" | "purchase" | "report"

export const UNIT_ROLE_COLUMNS: Record<UnitRole, "is_stock_count_unit" | "is_purchase_unit" | "is_report_unit"> = {
  stock_count: "is_stock_count_unit",
  purchase: "is_purchase_unit",
  report: "is_report_unit",
}

export const UNIT_ROLE_LABELS: Record<UnitRole, string> = {
  stock_count: "وحدة الجرد",
  purchase: "وحدة الشراء",
  report: "وحدة التقارير",
}

const flagged = (value: unknown) => value === true || value === "true" || value === 1 || value === "1" || value === "t"

/** الوحدة المؤشَّرة للدور، وإلا أول وحدة (السلوك السابق). */
export function pickRoleUnit<T extends Record<string, any>>(units: T[] | null | undefined, role?: UnitRole | null): T | undefined {
  const list = Array.isArray(units) ? units : []
  if (role) {
    const match = list.find((unit) => flagged(unit[UNIT_ROLE_COLUMNS[role]]))
    if (match) return match
  }
  return list[0]
}

export const isRoleUnit = (unit: Record<string, any> | null | undefined, role: UnitRole) => flagged(unit?.[UNIT_ROLE_COLUMNS[role]])
