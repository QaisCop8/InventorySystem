export const ASSET_STATUSES = {
  DRAFT: "مسودة",
  UNDER_CONSTRUCTION: "قيد الإنشاء",
  ACTIVE: "فعّال",
  SUSPENDED: "موقوف",
  FULLY_DEPRECIATED: "مهلك بالكامل",
  DISPOSED: "مستبعد",
} as const
export type AssetStatus = keyof typeof ASSET_STATUSES

export const ACQUISITION_SOURCES = {
  MANUAL: "شراء مباشر",
  PURCHASE_INVOICE: "فاتورة مشتريات",
  OPENING_BALANCE: "رصيد افتتاحي",
  CONSTRUCTION: "إنشاء / مشروع",
  DONATION: "تبرع / هبة",
  OTHER: "أخرى",
} as const
export type AcquisitionSource = keyof typeof ACQUISITION_SOURCES

export const TRANSACTION_TYPES = {
  ACQUISITION: "اقتناء",
  OPENING_BALANCE: "رصيد افتتاحي",
  ADDITION: "إضافة رأسمالية",
  DEPRECIATION: "إهلاك",
  DEPRECIATION_REVERSAL: "عكس إهلاك",
  DEPRECIATION_ADJUSTMENT: "تعديل سياسة الإهلاك",
  REVALUATION: "إعادة تقييم",
  IMPAIRMENT: "انخفاض قيمة",
  TRANSFER: "نقل",
  SUSPENSION: "إيقاف",
  RESUMPTION: "استئناف",
  DISPOSAL: "استبعاد",
} as const
export type TransactionType = keyof typeof TRANSACTION_TYPES

export const DISPOSAL_TYPES = {
  SALE: "بيع",
  SCRAP: "إتلاف / خردة",
  WRITE_OFF: "شطب",
  LOST: "فقدان",
  DONATION: "تبرع",
} as const
export type DisposalType = keyof typeof DISPOSAL_TYPES

export const BOOK_TYPES = {
  ACCOUNTING: "الدفتر المحاسبي",
  TAX: "الدفتر الضريبي",
  MANAGEMENT: "الدفتر الإداري",
} as const
export type BookType = keyof typeof BOOK_TYPES

export const LOCATION_TYPES = {
  SITE: "موقع / فرع",
  BUILDING: "مبنى",
  FLOOR: "طابق",
  ROOM: "غرفة / قسم",
  WAREHOUSE: "مستودع",
  OTHER: "أخرى",
} as const

export const DOCUMENT_TYPES = {
  INVOICE: "فاتورة شراء",
  WARRANTY: "كفالة",
  INSURANCE: "تأمين",
  REGISTRATION: "ترخيص / تسجيل",
  OWNERSHIP: "وثيقة ملكية",
  PHOTO: "صورة",
  MAINTENANCE: "مستند صيانة",
  OTHER: "أخرى",
} as const

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
