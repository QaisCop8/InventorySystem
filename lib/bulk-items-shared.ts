// تعديل الأصناف (أدوات): الحقول المسموح تعديلها جماعياً والفلاتر — مشتركة بين الواجهة والخادم (بلا قاعدة بيانات)

export const PRODUCT_TYPE_OPTIONS = [
  { label: "بضاعة تجارية", value: "1" },
  { label: "مواد خام", value: "2" },
  { label: "لوازم إنتاج", value: "3" },
  { label: "تحت التصنيع", value: "4" },
  { label: "بضاعة مصنعة", value: "5" },
  { label: "مواد للاستهلاك", value: "6" },
]

export const ITEM_STATUS_OPTIONS = [
  { label: "فعال", value: 1 },
  { label: "مجمد (غير نشط)", value: 2 },
]

type FieldDef = {
  label: string
  kind: "lookup" | "account" | "option" | "number" | "text"
  /** مصدر القائمة في meta (groups/categories/warehouses/taxClassifications) */
  source?: "groups" | "categories" | "warehouses" | "taxClassifications"
  options?: { label: string; value: string | number }[]
  required?: boolean
  max?: number
  maxLength?: number
  suffix?: string
}

export const BULK_ITEM_FIELDS = {
  main_stock_id: { label: "مجموعة الصنف", kind: "lookup", source: "groups" },
  category_id: { label: "التصنيف", kind: "lookup", source: "categories" },
  product_type: { label: "نوع المخزون", kind: "option", options: PRODUCT_TYPE_OPTIONS },
  status: { label: "الحالة", kind: "option", options: ITEM_STATUS_OPTIONS },
  tax_classification_id: { label: "التصنيف الضريبي", kind: "lookup", source: "taxClassifications" },
  tax_rate: { label: "نسبة الضريبة", kind: "number", max: 100, suffix: "%" },
  discount_rate: { label: "نسبة الخصم", kind: "number", max: 100, suffix: "%" },
  default_store: { label: "المستودع الافتراضي", kind: "lookup", source: "warehouses" },
  minimum_order_quantity: { label: "الحد الأدنى لكمية الطلب", kind: "number" },
  manufacturer_company: { label: "الشركة المصنعة", kind: "text", maxLength: 100 },
  location: { label: "موقع الصنف", kind: "text", maxLength: 100 },
  selling_account_id: { label: "حساب المبيعات", kind: "account" },
  purchase_account_id: { label: "حساب المشتريات", kind: "account" },
  selling_returns_account_id: { label: "حساب مردود المبيعات", kind: "account" },
  purchase_returns_account_id: { label: "حساب مردود المشتريات", kind: "account" },
} satisfies Record<string, FieldDef>

export type BulkItemField = keyof typeof BULK_ITEM_FIELDS

export type BulkItemFilters = {
  groupIds?: number[]
  categoryIds?: number[]
  productTypes?: string[]
  brandIds?: number[]
  taxClassificationIds?: number[]
  itemKind?: "" | "item" | "service"
  status?: "" | "active" | "frozen"
  search?: string
  codeFrom?: string
  codeTo?: string
}

/** percent موجبة = رفع، سالبة = خفض. priceCategoryId 0/null = كل فئات الأسعار. roundTo: 0 = 3 خانات، 0.05، 0.5، 1... */
export type BulkPriceChange = { percent: number; priceCategoryId?: number | null; roundTo?: number }
