export type TransactionAction = "view" | "create" | "update" | "delete" | "post"

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
} as const

export type TransactionFamily = keyof typeof TRANSACTION_FAMILIES

export const TRANSACTION_ACTION_LABELS: Record<TransactionAction, string> = {
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

export function transactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return `${TRANSACTION_ACTION_LABELS[action]} ${TRANSACTION_FAMILIES[family]}`
}

export function legacyTransactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return action === "view" ? `عرض ${TRANSACTION_FAMILIES[family]}` : null
}

export const ALL_TRANSACTION_PERMISSION_NAMES = (
  Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]
).flatMap((family) =>
  (Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[]).map((action) =>
    transactionPermissionName(family, action),
  ),
)
