export const FILE_FAMILIES = {
  customers: "العملاء",
  suppliers: "الموردين",
  employees: "الموظفين",
  subscribers: "المشتركين",
  items: "الأصناف",
  services: "الخدمات",
  cars: "السيارات",
  drivers: "السائقين",
  accounts: "الحسابات",
  banks: "البنوك",
  branches: "الفروع",
  "bank-accounts": "حسابات البنوك",
  "credit-cards": "بطاقات الائتمان",
  "restaurant-locations": "مواقع المطاعم",
  "restaurant-tables": "طاولات المطاعم",
} as const

export type FileFamily = keyof typeof FILE_FAMILIES
export type FileAction = "access" | "view" | "create" | "update" | "delete"
export const FILE_ACTION_LABELS: Record<FileAction, string> = {
  access: "الدخول لشاشة", view: "استعلام", create: "إضافة", update: "تعديل", delete: "حذف",
}
export const FILE_PERMISSION_CATEGORY = "الملفات والتعريفات"
export const FILE_ACTIONS = Object.keys(FILE_ACTION_LABELS) as FileAction[]
export const FILE_FAMILY_KEYS = Object.keys(FILE_FAMILIES) as FileFamily[]

export function filePermissionName(family: FileFamily, action: FileAction) {
  return `${FILE_ACTION_LABELS[action]} ${FILE_FAMILIES[family]}`
}

const normalize = (value: string) => String(value || "").replace(/[ً-ٟـ]/g, "").replace(/[إأآ]/g, "ا")
  .replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase()
const FAMILY_ALIASES: Record<FileFamily, string[]> = {
  customers: ["الزبائن", "الزبون", "العميل"], suppliers: ["الموردون", "المورد"],
  employees: ["الموظفون", "الموظف"], subscribers: ["المشتركون", "المشترك"],
  items: ["الصنف", "صنف", "المواد"], services: ["الخدمة", "خدمة"], cars: ["السيارة"], drivers: ["السائقون", "السائق"],
  accounts: ["الحسابات المحاسبية", "الحسابات المحاسبيه", "الحساب"], banks: ["البنك"], branches: ["الفرع"],
  "bank-accounts": ["الحسابات البنكية", "الحساب البنكي", "حساب البنك"],
  "credit-cards": ["بطاقات الإئتمان", "بطاقة الائتمان", "بطاقات الفيزا"],
  "restaurant-locations": ["مواقع المطعم", "موقع المطعم"],
  "restaurant-tables": ["طاولات المطعم", "طاولة المطعم"],
}
const ACTION_PREFIXES: Record<FileAction, string[]> = {
  access: ["الدخول لشاشة", "الدخول إلى شاشة", "الدخول لشاشات", "فتح شاشة"],
  view: ["استعلام", "عرض"], create: ["إضافة", "اضافة", "إدخال", "ادخال"], update: ["تعديل"], delete: ["حذف"],
}

export function parseFilePermission(name: string): { family: FileFamily; action: FileAction } | null {
  const value = normalize(name)
  for (const action of FILE_ACTIONS) {
    for (const prefix of ACTION_PREFIXES[action]) {
      const start = `${normalize(prefix)} `
      if (!value.startsWith(start)) continue
      const target = value.slice(start.length).replace(/^تعريف /, "")
      const family = FILE_FAMILY_KEYS.find(key => [FILE_FAMILIES[key], ...FAMILY_ALIASES[key]].some(alias => normalize(alias) === target))
      if (family) return { family, action }
    }
  }
  return null
}

export function fileFamilyForSection(section: string | null | undefined): FileFamily | null {
  if (section === "products" || section === "purchase-planning") return "items"
  return section && Object.prototype.hasOwnProperty.call(FILE_FAMILIES, section) ? section as FileFamily : null
}

export type FileAccessEntry = { access_name?: string | null; is_granted?: unknown }
export function hasFilePermissionEntries(entries: FileAccessEntry[] | null, family: FileFamily, action: FileAction): boolean {
  if (!entries) return false
  const granted = (key: FileAction) => {
    const canonical = entries.filter(entry => entry.access_name === filePermissionName(family, key))
    const matches = canonical.length ? canonical : entries.filter(entry => {
      const parsed = parseFilePermission(entry.access_name || "")
      return parsed?.family === family && parsed.action === key
    })
    return matches.length > 0 && matches.every(entry => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
  }
  return granted("access") && (action === "access" || granted(action))
}
