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
  // شاشات الشيكات (الأسماء = عناوين القائمة الجانبية) — كل عملية على الشيك صلاحية مستقلة في CHEQUE_OPERATION_PERMISSIONS
  cheque_book: "دفاتر الشيكات",
  cheque_register: "الشيكات",
  cheque_operation: "عمليات الشيكات",
  cheque_deposit_bulk: "إيداع الشيكات",
  cheque_endorse_bulk: "تجيير الشيكات",
  outgoing_cheque_clear: "إخراج الشيكات الصادرة",
  // تتبع أوامر العمل (الأسماء = عناوين القائمة الجانبية)
  task_orders_admin: "إدارة الأقسام وسير العمل",
  order_checklist: "قوائم تحقق الطلبيات",
  sales_order_draft: "مسودات طلبيات المبيعات",
  task_board: "متابعة طلباتي",
  order_confirmation: "تأكيد الطلبيات",
  task_order_approval: "اعتماد الطلبيات الجاهزة",
  journal: "سند قيد",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  sales_order: "طلبية مبيعات",
  purchase_order: "طلبية مشتريات",
  purchase_planning: "تخطيط المشتريات الذكي",
  fixed_asset: "الأصول الثابتة",
  bank_reconciliation: "التسوية البنكية",
  promotion: "العروض والأسعار الخاصة",
  // برامج المساعدات (قسائم بلا بطاقة، lib/aid-program.ts) — الصرف نفسه من الكاشير بصلاحية "ادخال فاتورة كاشير"
  aid_program: "برامج المساعدات",
  period_lock: "إقفال الفترات",
  landed_cost: "تحميل تكاليف الشحن والجمارك",
  year_end_closing: "إقفال السنة المالية",
  voucher_posting_tools: "ترحيل السندات",
  account_access: "صلاحيات المستخدمين على الحسابات",
  // أدوات: إرسال مرفقات (فاتورة مشتريات / سند قبض) للمدير، وبريد رسائل الموظفين لاستلامها ومعالجتها
  manager_attachment: "التواصل مع الإدارة",
  manager_inbox: "بريد رسائل الموظفين",
  bulk_items: "تعديل الأصناف",
  manufacturing_components_import: "استيراد مكونات التصنيع من اكسل",
  // نظام ادارة الموظفين — الأسماء مطابقة لعناوين القائمة الجانبية (تُجمَّع بها في شاشة الصلاحيات). شاشة الموظفين نفسها
  // صلاحيات ملفات (lib/file-permission-definitions.ts) وتقاريره صلاحيات تقارير.
  hr_jobs: "الوظائف",
  hr_salary_items: "بنود الراتب",
  hr_tax_rules: "قوانين ضريبة الدخل",
  hr_tax_exemptions: "الإعفاءات الضريبية",
  hr_shifts: "الورديات وجدول المناوبات",
  hr_official_holidays: "العطل الرسمية",
  hr_attendance_devices: "إعداد أجهزة الحضور",
  hr_employee_salary_items: "بنود رواتب الموظفين",
  hr_salary_periods: "فتح راتب شهر",
  hr_attendance_records: "حركات البصمة (الحضور والدوام)",
  hr_attendance_processing: "معالجة حركات الدخول والخروج",
  hr_attendance_editor: "تعديل سجلات الدوام",
  hr_attendance_transactions: "حركات الدوام (إضافي وخصومات)",
  hr_salary_advances: "السلف",
  hr_salary_loans: "القروض",
  hr_cash_deductions: "خصم نقدي",
  hr_salary_journal: "إغلاق وتنفيذ قيد الراتب",
} as const

export const HR_TRANSACTION_FAMILIES = (Object.keys(TRANSACTION_FAMILIES) as (keyof typeof TRANSACTION_FAMILIES)[])
  .filter((family) => family.startsWith("hr_"))

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
  // بدونها: إيداع/سحب/إغلاق الوردية فقط بلا المبيعات والرصيد المتوقع والفرق وسجل الحركات (lib/custody-details.ts)
  viewCustodyDetails: "السماح بمشاهدة تفاصيل العهدة",
  editQuantity: "تعديل الكمية - كاشير",
  invoiceDiscount: "ادخال خصم فاتورة - كاشير",
  itemDiscount: "ادخال خصم صنف - كاشير",
  createPoint: "اضافة تعريف نقطة بيع",
  editPoint: "تعديل تعريف نقطة بيع",
  // مجموع خصم الأصناف + خصم الفاتورة فوق "أعلى نسبة خصم" في إعدادات النقطة (بلا بطاقات الخصم والحملات)
  overrideDiscount: "السماح بتجاوز نسبة الخصم في الاعدادات - كاشير",
  // حملات نقاط البيع وبطاقات الخصم (تُفحص في api/campaigns و api/pos/discount-cards)
  createCampaign: "اضافة حملة",
  editCampaign: "تعديل حملة",
  deleteCampaign: "حذف حملة",
  stopCampaign: "ايقاف حملة",
  createDiscountCard: "ادخال بطاقة خصم",
  editDiscountCard: "تعديل بطاقة خصم",
  deleteDiscountCard: "حذف بطاقة خصم",
} as const

export type PosCashierPermission = keyof typeof POS_CASHIER_PERMISSIONS

// عمليات الشيكات (app/api/cheques/_lib.ts#CHEQUE_OPERATIONS): صلاحية لكل عملية تُفحص على فرع سند الشيك، في شاشة
// "عمليات الشيكات" وفي الشاشات الجماعية (إيداع/تجيير/إخراج). المفاتيح = رمز العملية.
export const CHEQUE_OPERATION_PERMISSION_CATEGORY = "عمليات الشيكات"
export const CHEQUE_OPERATION_PERMISSIONS = {
  deposit: "إيداع شيك وارد في البنك",
  postpone: "تغيير تاريخ استحقاق شيك وارد",
  return_source: "إرجاع شيك وارد للمصدر",
  return_bank: "إرجاع شيك وارد من البنك",
  endorse: "تحويل أو تجيير شيك وارد",
  undo_endorse: "إرجاع شيك محول أو مجير",
  retrieve_customer: "استرجاع شيك من الزبون",
  collection: "تحويل شيك وارد إلى حساب التحصيل",
  cash: "سحب شيك الزبون نقداً",
  transfer_account: "تحويل شيك وارد إلى حساب آخر",
  clear_outgoing: "إخراج شيك صادر مستحق من البنك",
  bank_return_supplier: "إرجاع البنك شيكاً صادراً إلى المورد",
  retrieve_supplier: "استرجاع شيك صادر من المورد",
  repay: "إعادة صرف شيك صادر مرتجع",
  postpone_outgoing: "تغيير تاريخ استحقاق شيك صادر",
} as const
export type ChequeOperationCode = keyof typeof CHEQUE_OPERATION_PERMISSIONS
export const chequeOperationPermissionName = (code: string) =>
  (CHEQUE_OPERATION_PERMISSIONS as Record<string, string>)[code] ?? null

// شاشة المطعم (الطاولات): كل إجراء صلاحية مستقلة تُفحص على فرع الموقع (lib/restaurant.ts#authorizeRestaurant)
export const RESTAURANT_PERMISSION_CATEGORY = "المطاعم"
export const RESTAURANT_PERMISSIONS = {
  access: "الدخول لشاشة المطعم",
  openTable: "فتح طاولة - مطاعم",
  takeaway: "طلب سفري - مطاعم",
  addItems: "إضافة أصناف للطاولة - مطاعم",
  editItems: "تعديل أصناف الطاولة - مطاعم",
  deleteItems: "حذف أصناف من الطاولة - مطاعم",
  removeTableService: "حذف خدمة الطاولة - مطاعم",
  discount: "إدخال خصم - مطاعم",
  transfer: "نقل طاولة - مطاعم",
  merge: "دمج الطاولات - مطاعم",
  split: "فصل وتقسيم الطاولات - مطاعم",
  printBill: "طباعة حساب الطاولة - مطاعم",
  pay: "دفع حساب الطاولة - مطاعم",
  cancelOrder: "إلغاء طلب الطاولة - مطاعم",
  receiveCustody: "استلام عهدة - مطاعم",
  handoverCustody: "تسليم عهدة - مطاعم",
  viewCustodyDetails: "السماح بمشاهدة تفاصيل العهدة - مطاعم",
  overrideDiscount: "السماح بتجاوز نسبة الخصم في الاعدادات - مطاعم",
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

// أسعار الصرف (نافذة أسعار الصرف اليومية وشاشة العملات — app/api/exchange-rates، lib/exchange-rate-access.ts):
// إضافة = أول إدخال لسعر اليوم أو عملة جديدة؛ تعديل = تغيير سعر اليوم بعد إدخاله؛ يوم سابق = أي حفظ بتاريخ قبل اليوم
// تسعير أسطر السندات (شاشة SalesDelivery: فواتير/إرساليات/مرتجعات المبيعات والمشتريات، وشاشة الطلبيات) — صلاحية لكل سند:
// "تعديل السعر في فاتورة مبيعات"... تظهر كعمليات إضافية في صف السند بشاشة الصلاحيات. تُفحص في الشاشة عند التعديل اليدوي.
export const VOUCHER_PRICING_ACTIONS = {
  price: "تعديل السعر في",
  item_discount: "إدخال خصم صنف في",
  general_discount: "إدخال خصم عام في",
  vat_rate: "تعديل نسبة الضريبة في",
} as const
export type VoucherPricingAction = keyof typeof VOUCHER_PRICING_ACTIONS
export const VOUCHER_PRICING_FAMILIES = [
  "sales_order", "sales_invoice", "sales_delivery", "consignment_delivery", "consignment_return", "sales_return",
  "purchase_order", "purchase_invoice", "purchase_delivery", "purchase_return",
] as const satisfies readonly TransactionFamily[]
export const voucherPricingPermissionName = (family: TransactionFamily, action: VoucherPricingAction) =>
  `${VOUCHER_PRICING_ACTIONS[action]} ${TRANSACTION_FAMILIES[family]}`
// ارسالية برسم البيع ومرتجعها: نقل بضاعة بلا تصنيف ضريبي ⇐ بلا صلاحية "تعديل نسبة الضريبة"
const NO_VAT_RATE_PRICING_FAMILIES: readonly TransactionFamily[] = ["consignment_delivery", "consignment_return"]
export const voucherPricingActionsFor = (family: TransactionFamily): VoucherPricingAction[] =>
  (Object.keys(VOUCHER_PRICING_ACTIONS) as VoucherPricingAction[]).filter((action) => action !== "vat_rate" || !NO_VAT_RATE_PRICING_FAMILIES.includes(family))
export const ALL_VOUCHER_PRICING_PERMISSION_NAMES = VOUCHER_PRICING_FAMILIES.flatMap((family) =>
  voucherPricingActionsFor(family).map((action) => voucherPricingPermissionName(family, action)))
/** أُنشئت ثم أُلغيت (2026-11-07) — تُحذف مع منحها */
export const REMOVED_VOUCHER_PRICING_PERMISSION_NAMES = NO_VAT_RATE_PRICING_FAMILIES.map((family) => voucherPricingPermissionName(family, "vat_rate"))

// طباعة/نسخ/إرسال SMS/إرسال واتساب لكل سند — تُفحص في شريط الأدوات الموحّد (UniversalToolbar) حسب شاشة التبويب،
// وتظهر عمليات إضافية في صف السند بشاشة الصلاحيات ("طباعة فاتورة مبيعات"...). "طباعة/نسخ طلبية مشتريات" كانتا
// موجودتين من تأسيس الشركات بلا فحص — نفس الاسم يُعاد استخدامه.
export const VOUCHER_OUTPUT_ACTIONS = {
  print: "طباعة",
  clone: "نسخ",
  sms: "إرسال SMS",
  whatsapp: "إرسال واتساب",
} as const
export type VoucherOutputAction = keyof typeof VOUCHER_OUTPUT_ACTIONS
export const VOUCHER_OUTPUT_FAMILIES = [
  "sales_order", "sales_invoice", "sales_delivery", "consignment_delivery", "consignment_return", "sales_return",
  "purchase_order", "purchase_invoice", "purchase_delivery", "purchase_return",
  "stock_in", "stock_out", "internal_delivery", "stock_use", "production",
  "receipt", "payment", "cheque_payment", "journal", "credit_note", "debit_note",
] as const satisfies readonly TransactionFamily[]
export const voucherOutputPermissionName = (family: TransactionFamily, action: VoucherOutputAction) =>
  `${VOUCHER_OUTPUT_ACTIONS[action]} ${TRANSACTION_FAMILIES[family]}`
export const isVoucherOutputFamily = (family: TransactionFamily | null | undefined): family is (typeof VOUCHER_OUTPUT_FAMILIES)[number] =>
  Boolean(family && (VOUCHER_OUTPUT_FAMILIES as readonly string[]).includes(family))
export const ALL_VOUCHER_OUTPUT_PERMISSION_NAMES = VOUCHER_OUTPUT_FAMILIES.flatMap((family) =>
  (Object.keys(VOUCHER_OUTPUT_ACTIONS) as VoucherOutputAction[]).map((action) => voucherOutputPermissionName(family, action)))

export const EXCHANGE_RATE_PERMISSION_CATEGORY = "أسعار الصرف"
export const EXCHANGE_RATE_PERMISSIONS = {
  add: "اضافة سعر الصرف",
  edit: "تعديل سعر صرف",
  editPast: "تعديل سعر صرف ليوم سابق",
} as const

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
  // المسؤول (isSystemAdmin على الخادم) تصله كل الصلاحيات ممنوحة ضمن entries
  if (!entries) return false
  return entries.some((entry) => String(entry.access_name || "").trim() === USER_ADMIN_PERMISSION && (entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true"))
}

/**
 * الإجراءات الفعلية لكل حركة — الافتراضي كل الإجراءات الستة؛ شاشات الأدوات تحتاج بعضها فقط
 * (لا معنى لـ"ترحيل تعديل الأصناف" أو "إدخال بريد رسائل الموظفين"). ما يُحذف من هنا يُزال من شاشة الصلاحيات ومن قاعدة البيانات.
 */
export const TRANSACTION_FAMILY_ACTIONS: Partial<Record<TransactionFamily, TransactionAction[]>> = {
  bulk_items: ["access", "update"],
  manufacturing_components_import: ["access", "update"],
  aid_program: ["access", "view", "create", "update", "delete"],
  cheque_book: ["access", "view", "create", "update"],
  cheque_register: ["access", "view"],
  cheque_operation: ["access"],
  cheque_deposit_bulk: ["access"],
  cheque_endorse_bulk: ["access"],
  outgoing_cheque_clear: ["access"],
  task_orders_admin: ["access", "view", "create", "update", "delete"],
  order_checklist: ["access", "view", "create", "update", "delete"],
  sales_order_draft: ["access", "view", "create", "update", "delete"],
  // متابعة طلباتي: العمل على المهمة يحدده تكليفها (القسم/المستخدم)؛ هنا ما يتجاوزه: رؤية كل المهام والتحويل والإجراء الإجباري
  task_board: ["access", "view", "update", "delete"],
  order_confirmation: ["access", "post"],
  task_order_approval: ["access", "post"],
  // أدوات: إقفال فترة/إلغاؤه، تنفيذ إقفال السنة/التراجع عنه. ترحيل السندات يفحص "ترحيل" كل سند على حدة فيكفيه الدخول.
  period_lock: ["access", "create", "update"],
  year_end_closing: ["access", "create", "delete"],
  voucher_posting_tools: ["access"],
  account_access: ["access", "update"],
  manager_attachment: ["access", "create"],
  manager_inbox: ["access", "view", "delete"],
  hr_jobs: ["access", "view", "create", "update", "delete"],
  hr_salary_items: ["access", "view", "create", "update", "delete"],
  hr_tax_rules: ["access", "view", "create", "update", "delete"],
  hr_tax_exemptions: ["access", "view", "create", "update", "delete"],
  hr_shifts: ["access", "view", "create", "update", "delete"],
  hr_official_holidays: ["access", "view", "create", "update", "delete"],
  hr_attendance_devices: ["access", "view", "create", "update", "delete"],
  hr_employee_salary_items: ["access", "view", "create", "update"],
  hr_salary_periods: ["access", "view", "create"],
  hr_attendance_records: ["access", "view", "create"],
  hr_attendance_processing: ["access", "view", "create"],
  hr_attendance_editor: ["access", "view", "update", "delete"],
  hr_salary_journal: ["access", "view", "post"],
}

/** أسماء أوضح لبعض الصلاحيات بدل "{الإجراء} {الحركة}" (مثل "تعديل تعديل الأصناف"). يجب أن تبقى فريدة في access_list. */
export const TRANSACTION_PERMISSION_NAME_OVERRIDES: Partial<Record<TransactionFamily, Partial<Record<TransactionAction, string>>>> = {
  bulk_items: { update: "تنفيذ تعديل الأصناف الجماعي" },
  manufacturing_components_import: { update: "حفظ مكونات التصنيع المستوردة" },
  aid_program: { view: "استعلام برامج المساعدات والمستفيدين", create: "إضافة نشاط مساعدة واستيراد مستفيدين", update: "تعديل نشاط مساعدة وتعبئة وإلغاء رموز المستفيدين", delete: "حذف نشاط مساعدة" },
  cheque_book: { view: "استعلام دفاتر الشيكات", create: "إضافة دفتر شيكات", update: "تعديل دفتر شيكات" },
  cheque_register: { view: "استعلام الشيكات وسجل عملياتها" },
  task_orders_admin: { view: "استعلام الأقسام وسير العمل", create: "إضافة قسم أو سير عمل", update: "تعديل الأقسام وسير العمل", delete: "حذف قسم أو سير عمل" },
  order_checklist: { view: "استعلام قوائم تحقق الطلبيات", create: "إضافة قائمة تحقق", update: "تعديل قائمة تحقق", delete: "حذف قائمة تحقق" },
  // نفس أسماء صلاحيات المسودات القائمة — فتبقى المنح كما هي
  sales_order_draft: { view: "استعلام مسودة طلبية مبيعات", create: "إضافة مسودة طلبية مبيعات", update: "تعديل مسودة طلبية مبيعات", delete: "إلغاء مسودة طلبية مبيعات" },
  task_board: { view: "استعلام كل مهام الأقسام", update: "تحويل مهمة لمستخدم آخر", delete: "الإنهاء والرفض الإجباري للمهام" },
  order_confirmation: { post: "تأكيد مسودة الطلبية وتحويلها لطلبية مبيعات" },
  task_order_approval: { post: "اعتماد الطلبية الجاهزة" },
  period_lock: { create: "إقفال فترة", update: "إلغاء إقفال فترة وتعديلها" },
  year_end_closing: { create: "تنفيذ إقفال السنة المالية", delete: "التراجع عن إقفال السنة المالية" },
  manager_attachment: { create: "التواصل مع الإدارة" },
  manager_inbox: { view: "استعلام ومعالجة بريد رسائل الموظفين", delete: "حذف مرفقات بريد رسائل الموظفين" },
  hr_salary_periods: { create: "تنفيذ فتح راتب شهر" },
  hr_attendance_records: { create: "إدخال وقراءة حركات البصمة (الحضور والدوام)" },
  hr_attendance_processing: { create: "تنفيذ معالجة حركات الدخول والخروج" },
  hr_attendance_editor: { view: "استعلام سجلات الدوام", update: "تعديل سجلات الدوام يدوياً", delete: "حذف سجلات الدوام" },
  hr_attendance_transactions: { post: "اعتماد حركات الدوام (إضافي وخصومات)" },
  hr_salary_journal: { post: "تنفيذ إغلاق الرواتب وقيد الراتب" },
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
  // شاشات أُعيدت تسميتها (2026-10-29): الأسماء الكاملة القديمة ← الجديدة — الصلاحيات تُطابَق بالاسم، فبدون هذا يفقد المستخدمون منحهم
  .concat([
    { from: "الدخول لشاشة إرسال مرفقات للمدير", to: transactionPermissionName("manager_attachment", "access") },
    { from: "إرسال مرفقات للمدير", to: transactionPermissionName("manager_attachment", "create") },
    { from: "الدخول لشاشة بريد الرسائل", to: transactionPermissionName("manager_inbox", "access") },
    { from: "استعلام ومعالجة بريد الرسائل", to: transactionPermissionName("manager_inbox", "view") },
    { from: "حذف مرفقات بريد الرسائل", to: transactionPermissionName("manager_inbox", "delete") },
    // 2026-11-07: «من Excel» ⇐ «من اكسل» ليطابق عنوان القائمة (تجميع شاشة الصلاحيات بالعنوان)
    { from: "الدخول لشاشة استيراد مكونات التصنيع من Excel", to: transactionPermissionName("manufacturing_components_import", "access") },
  ])

/** صلاحيات حركات لم تعد مستخدمة (إجراءات خارج TRANSACTION_FAMILY_ACTIONS) — تُحذف مع منحها */
export const REMOVED_TRANSACTION_PERMISSION_NAMES: string[] = (Object.keys(TRANSACTION_FAMILY_ACTIONS) as TransactionFamily[])
  .flatMap((family) => (Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[])
    .filter((action) => !transactionActionsFor(family).includes(action))
    .map((action) => defaultTransactionPermissionName(family, action)))

/** صلاحيات قديمة من تأسيس الشركة لا يفحصها شيء وتكرّر صلاحية حركة ("الدخول لشاشة طلبيات المشتريات" ⇐ "الدخول لشاشة طلبية مشتريات") — تُحذف مع منحها */
export const LEGACY_DUPLICATE_PERMISSION_NAMES: string[] = ["الدخول لشاشة طلبيات المشتريات"]

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
  "cheques-books": "cheque_book",
  cheques: "cheque_register",
  "cheque-operations": "cheque_operation",
  "cheque-deposit-bulk": "cheque_deposit_bulk",
  "cheque-endorse-bulk": "cheque_endorse_bulk",
  "outgoing-cheque-clear-bulk": "outgoing_cheque_clear",
  "task-orders-admin": "task_orders_admin",
  "order-checklists": "order_checklist",
  "draft-sales-order": "sales_order_draft",
  "task-orders-board": "task_board",
  "order-confirmation": "order_confirmation",
  "task-orders-approval": "task_order_approval",
  "journal-vouchers": "journal",
  "credit-notes": "credit_note",
  "debit-notes": "debit_note",
  "fixed-assets": "fixed_asset",
  "bank-reconciliation": "bank_reconciliation",
  promotions: "promotion",
  "aid-program": "aid_program",
  "period-locks": "period_lock",
  "landed-costs": "landed_cost",
  "year-end-closing": "year_end_closing",
  "voucher-posting-tools": "voucher_posting_tools",
  "account-access": "account_access",
  "manager-attachments": "manager_attachment",
  "manager-inbox": "manager_inbox",
  "bulk-items": "bulk_items",
  "manufacturing-components-import": "manufacturing_components_import",
  "salesman-commissions": "salesman_commission",
  "employee-jobs": "hr_jobs",
  "salary-items": "hr_salary_items",
  "tax-rules": "hr_tax_rules",
  "tax-exemptions": "hr_tax_exemptions",
  shifts: "hr_shifts",
  "official-holidays": "hr_official_holidays",
  "attendance-devices": "hr_attendance_devices",
  "employee-salary-items": "hr_employee_salary_items",
  "salary-periods": "hr_salary_periods",
  "attendance-records": "hr_attendance_records",
  "attendance-processing": "hr_attendance_processing",
  "attendance-editor": "hr_attendance_editor",
  "attendance-transactions": "hr_attendance_transactions",
  "salary-advances": "hr_salary_advances",
  "salary-loans": "hr_salary_loans",
  "cash-deductions": "hr_cash_deductions",
  "salary-journal": "hr_salary_journal",
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
