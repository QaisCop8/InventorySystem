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
  production: "سند انتاج بضاعة",
  receipt: "سند قبض",
  payment: "سند صرف",
  cheque_payment: "سند صرف شيكات",
  journal: "سند قيد",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  sales_order: "طلبية مبيعات",
  purchase_order: "طلبية مشتريات",
  purchase_planning: "تخطيط المشتريات الذكي",
  fixed_asset: "الأصول الثابتة",
  bank_reconciliation: "التسوية البنكية",
  promotion: "العروض والأسعار الخاصة",
  period_lock: "إقفال الفترات",
  landed_cost: "تحميل تكاليف الشحن والجمارك",
  year_end_closing: "إقفال السنة المالية",
  voucher_posting_tools: "ترحيل السندات",
  account_access: "صلاحيات المستخدمين على الحسابات",
  // أدوات: إرسال مرفقات (فاتورة مشتريات / سند قبض) للمدير، وبريد الرسائل لاستلامها ومعالجتها
  manager_attachment: "إرسال مرفقات للمدير",
  manager_inbox: "بريد الرسائل",
  bulk_items: "تعديل الأصناف",
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

// شاشة المطعم (الطاولات): كل إجراء صلاحية مستقلة تُفحص على فرع الموقع (lib/restaurant.ts#authorizeRestaurant)
export const RESTAURANT_PERMISSION_CATEGORY = "المطاعم"
export const RESTAURANT_PERMISSIONS = {
  access: "الدخول لشاشة المطعم",
  openTable: "فتح طاولة - مطاعم",
  takeaway: "طلب سفري - مطاعم",
  addItems: "إضافة أصناف للطاولة - مطاعم",
  editItems: "تعديل أصناف الطاولة - مطاعم",
  deleteItems: "حذف أصناف من الطاولة - مطاعم",
  discount: "إدخال خصم - مطاعم",
  transfer: "نقل طاولة - مطاعم",
  merge: "دمج الطاولات - مطاعم",
  split: "فصل وتقسيم الطاولات - مطاعم",
  printBill: "طباعة حساب الطاولة - مطاعم",
  pay: "دفع حساب الطاولة - مطاعم",
  cancelOrder: "إلغاء طلب الطاولة - مطاعم",
  receiveCustody: "استلام عهدة - مطاعم",
  handoverCustody: "تسليم عهدة - مطاعم",
} as const

export type RestaurantPermission = keyof typeof RESTAURANT_PERMISSIONS
export const RESTAURANT_SCREEN_SECTION = "restaurant-pos"

/** الدخول لشاشة المطعم من قائمة صلاحيات المستخدم المخزّنة — قبل وصول الصلاحية للقائمة (لم تُحدَّث بعد) تبقى الشاشة متاحة والخادم يفرضها. */
export function canAccessRestaurantScreen(entries: TransactionAccessEntry[] | null): boolean {
  if (!entries) return true
  const matches = entries.filter((entry) => String(entry.access_name || "").trim() === RESTAURANT_PERMISSIONS.access)
  if (!matches.length) return true
  return matches.every((entry) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
}

// تجاوز حد الائتمان (حد الدين) المعرّف على العميل عند حفظ فاتورة مبيعات آجلة
export const CREDIT_LIMIT_PERMISSION_CATEGORY = "العملاء والذمم"
export const CREDIT_LIMIT_OVERRIDE_PERMISSION = "السماح بتجاوز حد الدين"
// رؤية حقل "الرصيد" للعميل/المورد/الحساب داخل شاشات الحركات (نفس فئة حد الائتمان)
export const ACCOUNT_BALANCE_VIEW_PERMISSION = "السماح بمشاهدة رصيد الحساب في الحركات"
// رؤية آخر سعر شراء للأصناف (قائمة الأصناف) — بلاها يظهر **** بدل السعر
export const PURCHASE_PRICE_PERMISSION_CATEGORY = "الأصناف"
export const PURCHASE_PRICE_VIEW_PERMISSION = "السماح بمشاهدة أسعار الشراء"

// إعدادات المستخدمين والصلاحيات (الإعدادات ← اعدادات المستخدمين): تُفتح فقط لمسؤول (دور "مدير"/admin أو "جميع
// الصلاحيات") أو لمن مُنح صراحةً هذه الصلاحية — خلافاً لباقي الشاشات، غياب الصلاحية من القائمة يعني المنع.
export const USER_ADMIN_PERMISSION_CATEGORY = "الإعدادات"
export const USER_ADMIN_PERMISSION = "إدارة المستخدمين والصلاحيات"
export const USER_ADMIN_SECTIONS = [
  "user-settings", "permissions", "job-roles", "role-permissions", "user-default-accounts", "voucher-book-permissions", "user-branch-access-matrix",
] as const
const ADMIN_ROLE_NAMES = new Set(["admin", "administrator", "مدير", "مدير النظام", "مسؤول النظام"])
export const isAdminRoleName = (name: unknown) => ADMIN_ROLE_NAMES.has(String(name ?? "").trim().toLowerCase())
export const isUserAdminSection = (section: string | null | undefined) => Boolean(section && (USER_ADMIN_SECTIONS as readonly string[]).includes(section))

/** الدخول لشاشات المستخدمين والصلاحيات من جهة الواجهة (الخادم يفرضها أيضاً على عمليات الحفظ). */
export function canAccessUserAdminScreen(entries: TransactionAccessEntry[] | null, user: { role?: string | null; permissions?: Record<string, unknown> | null } | null): boolean {
  if (!user) return false
  const permissions = user.permissions || {}
  if (permissions["all"] || permissions["جميع الصلاحيات"] || isAdminRoleName(user.role)) return true
  if (!entries) return false
  return entries.some((entry) => String(entry.access_name || "").trim() === USER_ADMIN_PERMISSION && (entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true"))
}

/**
 * الإجراءات الفعلية لكل حركة — الافتراضي كل الإجراءات الستة؛ شاشات الأدوات تحتاج بعضها فقط
 * (لا معنى لـ"ترحيل تعديل الأصناف" أو "إدخال بريد الرسائل"). ما يُحذف من هنا يُزال من شاشة الصلاحيات ومن قاعدة البيانات.
 */
export const TRANSACTION_FAMILY_ACTIONS: Partial<Record<TransactionFamily, TransactionAction[]>> = {
  bulk_items: ["access", "update"],
  manager_attachment: ["access", "create"],
  manager_inbox: ["access", "view", "delete"],
}

/** أسماء أوضح لبعض الصلاحيات بدل "{الإجراء} {الحركة}" (مثل "تعديل تعديل الأصناف"). يجب أن تبقى فريدة في access_list. */
export const TRANSACTION_PERMISSION_NAME_OVERRIDES: Partial<Record<TransactionFamily, Partial<Record<TransactionAction, string>>>> = {
  bulk_items: { update: "تنفيذ تعديل الأصناف الجماعي" },
  manager_attachment: { create: "إرسال مرفقات للمدير" },
  manager_inbox: { view: "استعلام ومعالجة بريد الرسائل", delete: "حذف مرفقات بريد الرسائل" },
}

export const transactionActionsFor = (family: TransactionFamily): TransactionAction[] =>
  TRANSACTION_FAMILY_ACTIONS[family] ?? (Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[])

const defaultTransactionPermissionName = (family: TransactionFamily, action: TransactionAction) =>
  `${TRANSACTION_ACTION_LABELS[action]} ${TRANSACTION_FAMILIES[family]}`

export function transactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return TRANSACTION_PERMISSION_NAME_OVERRIDES[family]?.[action] ?? defaultTransactionPermissionName(family, action)
}

/** صلاحيات تُعاد تسميتها (الاسم الافتراضي القديم ← الاسم الجديد) مع الإبقاء على المنح */
export const RENAMED_TRANSACTION_PERMISSIONS: { from: string; to: string }[] = (Object.keys(TRANSACTION_PERMISSION_NAME_OVERRIDES) as TransactionFamily[])
  .flatMap((family) => (Object.keys(TRANSACTION_PERMISSION_NAME_OVERRIDES[family] || {}) as TransactionAction[])
    .map((action) => ({ from: defaultTransactionPermissionName(family, action), to: transactionPermissionName(family, action) })))

/** صلاحيات حركات لم تعد مستخدمة (إجراءات خارج TRANSACTION_FAMILY_ACTIONS) — تُحذف مع منحها */
export const REMOVED_TRANSACTION_PERMISSION_NAMES: string[] = (Object.keys(TRANSACTION_FAMILY_ACTIONS) as TransactionFamily[])
  .flatMap((family) => (Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[])
    .filter((action) => !transactionActionsFor(family).includes(action))
    .map((action) => defaultTransactionPermissionName(family, action)))

export function legacyTransactionPermissionName(family: TransactionFamily, action: TransactionAction) {
  return action === "view" ? `عرض ${TRANSACTION_FAMILIES[family]}` : null
}

// شاشات القائمة (section بـapp/page.tsx) لكل نوع حركة — لصلاحية "الدخول لشاشة"
const TRANSACTION_SECTIONS: Record<string, TransactionFamily> = {
  "sales-orders": "sales_order",
  "purchase-orders": "purchase_order",
  "purchase-planning": "purchase_planning",
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
  "production-vouchers": "production",
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
  "landed-costs": "landed_cost",
  "year-end-closing": "year_end_closing",
  "voucher-posting-tools": "voucher_posting_tools",
  "account-access": "account_access",
  "manager-attachments": "manager_attachment",
  "manager-inbox": "manager_inbox",
  "bulk-items": "bulk_items",
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
  transactionActionsFor(family).map((action) =>
    transactionPermissionName(family, action),
  ),
)
