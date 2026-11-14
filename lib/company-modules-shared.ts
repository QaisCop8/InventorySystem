// وحدات إضافية تُفعَّل لكل شركة من لوحة إدارة المنصة (companies.enabled_modules بقاعدة الإدارة) — لا يراها مستخدمو
// الشركة ولا يفعّلونها. شاشات الوحدة تظهر بالقائمة فقط إن كانت مفعّلة للشركة، والخادم يفرضها (lib/company-modules.ts).
// مشترك بين الواجهة والخادم (بلا قاعدة بيانات).

export const COMPANY_MODULES = {
  data_migration: { label: "ترحيل البيانات من البرامج الأخرى", sections: ["data-migration"] },
} as const

export type CompanyModule = keyof typeof COMPANY_MODULES

export const isCompanyModule = (value: unknown): value is CompanyModule =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(COMPANY_MODULES, value)

/** الوحدة التي تتطلبها الشاشة، أو null لشاشة متاحة دائماً */
export function moduleForSection(section: string | null | undefined): CompanyModule | null {
  if (!section) return null
  for (const [module, definition] of Object.entries(COMPANY_MODULES)) {
    if ((definition.sections as readonly string[]).includes(section)) return module as CompanyModule
  }
  return null
}
