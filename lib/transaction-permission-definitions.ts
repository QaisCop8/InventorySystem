export type TransactionAction = "access" | "view" | "create" | "update" | "delete" | "post"

export const TRANSACTION_FAMILIES = {
  salesman_commission: "عمولات المندوبين",
  sales_invoice: "فاتورة مبيعات",
  sales_delivery: "إرسالية مبيعات",
  consignment_delivery: "إرسالية برسم البيع",
  consignment_return: "مرتجع إرسالية برسم البيع",
  sales_return: "مرتجع مبيعات",
  purchase_invoice: "فاتورة مشتريات",
  purchase_delivery: "إرسالية مشتريات",
  purchase_return: "مرتجع مشتريات",
  stock_in: "سند إدخال بضاعة",
  stock_out: "سند إخراج بضاعة",
  internal_delivery: "إرسالية داخلية",
  stock_use: "سند استعمال",
  receipt: "سند قبض",
  payment: "سند صرف",
  cheque_payment: "سند صرف شيكات",
  journal: "سند قيد",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  sales_order: "طلبية مبيعات",
  purchase_order: "طلبية مشتريات",
  fixed_asset: "الأصول الثابتة",
  bank_reconciliation: "التسوية البنكية",
  promotion: "العروض والأسعار الخاصة",
  period_lock: "إقفال الفترات",
} as const

export type TransactionFamily = keyof typeof TRANSACTION_FAMILIES

export const TRANSACTION_ACTION_LABELS: Record<TransactionAction, string> = {
  // الدخول لشاشة الحركة (ظهورها في القائمة وفتحها) — مثل "الدخول لشاشة فاتورة مبيعات"
  access: "الدخول لشاشة",
  view: "استعلام",
  create: "إدخال",
  update: "تعديل",
  delete: "حذف",
  post: "ترحيل وإلغاء ترحيل",
}

export const TRANSACTION_PERMISSION_CATEGORY = "صلاحيات الحركات"

export const POS_CASHIER_PERMISSION_CATEGORY = "كاشير نقطة البيع"
export const POS_CASHIER_PERMISSIONS = {
  access: "استعلام الفواتير - كاشير",
  history: "استعلام الفواتير - كاشير",
  sale: "ادخال فاتورة كاشير",
  return: "ادخال مردود - كاشير",
  gift: "ادخال هدية - كاشير",
  editInvoice: "تعديل فاتورة كاشير",
  deleteInvoice: "حذف فاتورة كاشير",
  drafts: "ادخال مسودة فاتورة - كاشير",
  receiveHandover: "استلام عهدة",
  handover: "تسليم عهدة",
  editQuantity: "تعديل الكمية - كاشير",
  invoiceDiscount: "ادخال خصم فاتورة - كاشير",
  itemDiscount: "ادخال خصم صنف - كاشير",
  createPoint: "اضافة تعريف نقطة بيع",
  editPoint: "تعديل تعريف نقطة بيع",
} as const

export type PosCashierPermission = keyof typeof POS_CASHIER_PERMISSIONS

// تجاوز حد الائتمان (حد الدين) المعرّف على العميل عند حفظ فاتورة مبيعات آجلة
export const CREDIT_LIMIT_PERMISSION_CATEGORY = "العملاء والذمم"
export const CREDIT_LIMIT_OVERRIDE_PERMISSION = "السماح بتجاوز حد الدين"
// رؤية حقل "الرصيد" للعميل/المورد/الحساب داخل شاشات الحركات (نفس فئة حد الائتمان)
export const ACCOUNT_BALANCE_VIEW_PERMISSION = "السماح بمشاهدة رصيد الحساب في الحركات"
// رؤية آخر سعر شراء للأصناف (قائمة الأصناف) — بلاها يظهر **** بدل السعر
export const PURCHASE_PRICE_PERMISSION_CATEGORY = "الأصناف"
export const PURCHASE_PRICE_VIEW_PERMISSION = "السماح بمشاهدة أسعار الشراء"

export function transactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return `${TRANSACTION_ACTION_LABELS[action]} ${TRANSACTION_FAMILIES[family]}`
}

export function legacyTransactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return action === "view" ? `عرض ${TRANSACTION_FAMILIES[family]}` : null
}

// شاشات القائمة (section بـapp/page.tsx) لكل نوع حركة — لصلاحية "الدخول لشاشة"
const TRANSACTION_SECTIONS: Record<string, TransactionFamily> = {
  "sales-orders": "sales_order",
  "purchase-orders": "purchase_order",
  "sale-invoices": "sales_invoice",
  "sales-invoices": "sales_invoice",
  "sales-delivery": "sales_delivery",
  "delivery-consignment-sale": "consignment_delivery",
  "return-delivery-consignment-sale": "consignment_return",
  "return-sell": "sales_return",
  "purchase-invoices": "purchase_invoice",
  "delivery-pay": "purchase_delivery",
  "return-purchase": "purchase_return",
  "stock-in-vouchers": "stock_in",
  "stock-out-vouchers": "stock_out",
  "internal-delivery-vouchers": "internal_delivery",
  "use-vouchers": "stock_use",
  "receipt-vouchers": "receipt",
  "payment-vouchers": "payment",
  "cheque-payment-vouchers": "cheque_payment",
  "journal-vouchers": "journal",
  "credit-notes": "credit_note",
  "debit-notes": "debit_note",
  "fixed-assets": "fixed_asset",
  "bank-reconciliation": "bank_reconciliation",
  promotions: "promotion",
  "period-locks": "period_lock",
  "salesman-commissions": "salesman_commission",
}

export function transactionFamilyForSection(section: string | null | undefined): TransactionFamily | null {
  return section && Object.prototype.hasOwnProperty.call(TRANSACTION_SECTIONS, section) ? TRANSACTION_SECTIONS[section] : null
}

export type TransactionAccessEntry = { access_name?: string | null; is_granted?: unknown }
/** الدخول لشاشة الحركة في الفرع النشط. قبل أن تصل الصلاحية الجديدة لقائمة المستخدم المخزّنة (لم تُحدَّث بعد) تبقى الشاشة متاحة. */
export function canAccessTransactionScreen(entries: TransactionAccessEntry[] | null, family: TransactionFamily): boolean {
  if (!entries) return true
  const name = transactionPermissionName(family, "access")
  const matches = entries.filter((entry) => String(entry.access_name || "").trim() === name)
  if (!matches.length) return true
  return matches.every((entry) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
}

export const ALL_TRANSACTION_PERMISSION_NAMES = (
  Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]
).flatMap((family) =>
  (Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[]).map((action) =>
    transactionPermissionName(family, action),
  ),
)
