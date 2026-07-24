"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import DataGridView from "@/components/common/DataGridView"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import StoresSearchPopup from "@/components/products/StoresSearchPopup"
import UnitsSearchPopup from "@/components/products/UnitsSearchPopup"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import DatePickerDialog from "@/components/common/date-picker-dialog"
import ItemExpiryDatePicker, { type ExpiryLotAllocation } from "@/components/common/ItemExpiryDatePicker"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import PrimeDropdown from "@/components/common/FocusDropdown"
import DateTimeControl from "@/components/common/date-time-control"
import Util from "@/components/common/Util"
import { useToast } from "@/hooks/use-toast"
import { FileText, Package, Calculator, MessageSquare, RefreshCw } from "lucide-react"

// vch_type per voucher_types_tbl: 12=سند ادخال بضاعة, 13=سند اخراج بضاعة,
// 14=ارسالية داخلية, 15=سند استعمال.
export type StockVoucherType = 12 | 13 | 14 | 15
export const STOCK_IN_VCH_TYPE: StockVoucherType = 12
export const STOCK_OUT_VCH_TYPE: StockVoucherType = 13
export const INTERNAL_DELIVERY_VCH_TYPE: StockVoucherType = 14
export const USE_VOUCHER_VCH_TYPE: StockVoucherType = 15

export interface VoucherItemRow {
  product_id: number | null
  product_code: string
  product_name: string
  // للقراءة فقط، يُملأ تلقائياً عند اختيار الصنف (products.barcode/first_barcode بحسب مصدر البيانات
  // — انظر تعليق handleProductSelect/lookupProductByCode) — عمود اختياري تتحكم به إعدادات السند
  // (الاعمدة التي تظهر في السند ← الباركود) مثل باقي الأعمدة الاختيارية.
  barcode: string
  warehouse_id: number | null
  warehouse_name: string
  unit: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  batch_number: string
  expiry_date: string
  // أبعاد/عدد اختيارية بمستوى السطر — تظهر فقط إن فُعِّلت أعمدتها من إعدادات السند (نفس آلية
  // Util.getVoucherSettingScreenData الخاصة ببقية الأعمدة الاختيارية)؛ معلوماتية بحتة حالياً، لا
  // تدخل في أي حساب تلقائي للكمية.
  length: number | null
  width: number | null
  height: number | null
  count: number | null
  note: string
  expense_account_id: number | null
  purchase_account_id: number | null
  expense_cost_centers: JournalCostCenterSelection[]
  purchase_cost_centers: JournalCostCenterSelection[]
  // للعرض فقط (تفاصيل كميات الصنف) — لا تُرسَل للحفظ.
  current_stock?: number
  // مُخزَّنان من بيانات الصنف عند اختياره (products.has_expiry/has_batch) — تُستخدَم للتحقق من
  // إلزامية تاريخ الصلاحية/الرقم التشغيلي في سند ادخال بضاعة دون إعادة الاستعلام عن الصنف عند
  // كل حفظ؛ الخادم يُعيد التحقق من نفس القاعدة مستقلاً عبر validateItemBatchExpiry.
  has_expiry?: boolean
  has_batch?: boolean
  // نوع القياس (products.measurment_id) مُخزَّن من الصنف عند اختياره — يقرر recalcQuantityFromMeasurement
  // كيفية احتساب "الكمية" تلقائياً من الطول/العرض/الارتفاع/العدد بدل إدخالها يدوياً (مطابق لـ
  // measurement_id وcellEditEnded حالة 'length'/'width'/'height'/'count' في StockInVoucher.js
  // المرجعي). 1 = عادي: لا حساب تلقائي، الكمية تُكتب يدوياً كما هي اليوم. product_length/
  // product_width/product_density أبعاد الصنف الافتراضية نفسها (products.length/width/density)
  // — تُستخدَمان فقط لحالتَي "اعمال زجاج"/"بروفايل متر" (9/10) اللتين تضربان البُعد المُدخَل بالسطر
  // بالبُعد/الكثافة الافتراضيَين للصنف نفسه، لا تُعرَضان كعمودين وتُترَكان بلا حفظ.
  measurment_id?: number | null
  product_length?: number | null
  product_width?: number | null
  product_density?: number | null
  // للعرض فقط في شبكة "تفاصيل حسابات الاصناف" (سند الاستعمال) — تُشتق من expense_account_id/
  // purchase_account_id عند اختيارهما عبر البحث أو التعبئة التلقائية من الصنف/الإعدادات؛ القيمة
  // المُرسَلة فعلياً للحفظ هي المعرّف (expense_account_id/purchase_account_id) فقط.
  purchase_account_code?: string
  purchase_account_name?: string
  expense_account_code?: string
  expense_account_name?: string
  // وحدات الصنف المختار في هذا السطر (لِزر البحث عن الوحدة بجانب عمود الوحدة) — لا تُرسَل للحفظ.
  units?: { unit_id: number; unit_name: string; price: number; barcode: string; to_main_qnty: number }[]
}

export interface VoucherRecord {
  id: number
  vch_type: StockVoucherType
  vch_code: string
  vch_date: string
  vch_book_id: number | null
  currency_id: number | null
  rate: number
  account_id: number | null
  customer_name: string
  to_store_id: number | null
  from_store_id: number | null
  amount: number
  manual_voucher: string
  manual_date: string
  note: string
  status: number
  is_printed: number
  items: VoucherItemRow[]
}

interface LookupOption {
  id: number
  name: string
}
interface CurrencyOption {
  value: number
  label: string
}
interface WarehouseOption {
  id: number
  warehouse_name: string
  code: string
}

interface UnifiedStockVoucherProps {
  voucherType: StockVoucherType
  dialogOpen: boolean
  onOpenChange: (open: boolean) => void
  form: VoucherRecord
  onFormChange: <K extends keyof VoucherRecord>(field: K, value: VoucherRecord[K]) => void
  onItemsChange: (items: VoucherItemRow[]) => void
  voucherBooks?: LookupOption[]
  currencyOptions?: CurrencyOption[]
  baseCurrencyId?: number | null
  warehouses?: WarehouseOption[]
  // ترتيب اختيار المستودع الافتراضي عند اختيار صنف: مستودع الصنف نفسه (products.default_store)
  // → المستودع الافتراضي للمستخدم (هذا الحقل) → أول مستودع في النظام.
  defaultItemWarehouseId?: number | null
  // مصدر قائمة "فئة السعر" لزر إعادة احتساب الأسعار — من /api/pricecategory.
  priceCategories?: LookupOption[]
  // "طريقة احتساب تكلفة الصنف في سندات ادخال/ اخراج/ استعمال" من اعدادات عامة — تُطبَّق تلقائياً
  // كفئة السعر الافتراضية عند فتح سند جديد من هذه الأنواع الثلاثة (لا تُطبَّق على الارسالية الداخلية
  // ولا عند عرض/تعديل سند محفوظ مسبقاً).
  defaultCostPriceCategoryId?: number | null
  isSaving?: boolean
  currentIndex?: number
  totalRecords?: number
  isFirstRecord?: boolean
  isLastRecord?: boolean
  onNew?: () => void
  onSave: (action?: PostVoucherAction) => void
  onValidateSave?: () => string | null
  onDelete?: () => void
  onNavigate?: (direction: "first" | "previous" | "next" | "last") => void
  onPrint?: () => void
  onClone?: () => void
  // كتابة يدوية في رقم السند تُعاد صياغتها عبر /resolve-code، ثم يُعرض السند إن كان موجوداً بهذا
  // الرقم، أو تُصفَّر الحقول لسند جديد بهذا الرقم إن لم يوجد — نفس نمط unified-receipt-voucher.tsx.
  onCodeResolved?: (id: number) => void
  onCodeNotFound?: (code: string) => void
  errorMessages?: string[]
}

const TYPE_LABELS: Record<StockVoucherType, { title: string }> = {
  12: { title: "سند ادخال بضاعة" },
  13: { title: "سند اخراج بضاعة" },
  14: { title: "ارسالية داخلية" },
  15: { title: "سند استعمال" },
}

// فئات سعر خاصة (معرّفات سالبة) تُعرَض دائماً في أعلى قائمة "فئة السعر" قبل صفوف جدول pricecategory
// الحقيقية — نفس فكرة prices_class_list.splice في StockInVoucher.js القديم. "سعر الإنتاج" مُعطَّلة
// لأنه لا يوجد لها مصدر بيانات في هذا النظام (لا BOM ولا عمود تكلفة تصنيع)؛ البقية مدعومة فعلياً
// (انظر app/api/inventory/products/prices-by-category/route.ts لمنطق -2/-3/-4/-5).
export const SPECIAL_PRICE_CATEGORIES = [
  { id: -1, name: "سعر الإنتاج", disabled: true },
  { id: -2, name: "يدوي", disabled: false },
  { id: -3, name: "متوسط الأسعار", disabled: false },
  { id: -4, name: "داخل أول خارج أول", disabled: false },
  { id: -5, name: "اخر سعر", disabled: false },
]

// تاريخ افتراضي يُضبَط لِـ"تاريخ الصلاحية" عند اختيار صنف يتطلب تتبع الصلاحية ولم يكن للسطر
// تاريخ محدَّد مسبقاً — قيمة اصطلاحية (بدل تركه فارغاً) يُعدّلها المستخدم لاحقاً عبر التقويم.
const DEFAULT_EXPIRY_DATE = "1990-01-01"

// يحلّل تاريخاً كتبه المستخدم يدوياً في خلية "تاريخ الصلاحية" — new Date(string) الافتراضي في JS
// غير موثوق لصيغ كهذه (يرفض بعضها كلياً كـ"01.01.2026"، ويُفسّر بعضها كـMM/DD/YYYY حسب المتصفح
// لا DD/MM/YYYY المتوقَّع محلياً). يقبل فاصل - أو . أو / بين ثلاثة أجزاء، ويُميّز ترتيب
// YYYY-MM-DD عن DD-MM-YYYY بطول الجزء الأول فقط (٤ أرقام ⇐ سنة أولاً)، فتُغطّى كل الصيغ التي
// يُحتمل أن يكتبها المستخدم: 01-01-2026، 2026-02-02، 01.01.2026، 2026.01.01، 01/01/2026، 2026/01/01.
const parseFlexibleDate = (raw: string): Date | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d{1,4})[-./](\d{1,2})[-./](\d{1,4})$/)
  if (!match) return null
  const [, p1, p2, p3] = match
  let year: number
  let month: number
  let day: number
  if (p1.length === 4) {
    year = Number(p1)
    month = Number(p2)
    day = Number(p3)
  } else {
    day = Number(p1)
    month = Number(p2)
    year = Number(p3)
  }
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null
  if (year < 100) year += 2000
  // new Date(y, m, d) يُطبّع مكوّنات فائضة (كـ31 فبراير) لتاريخ لاحق بدل رفضها — التحقق أدناه يرفض
  // أي إدخال طُبِّع فعلياً بدل قبوله بصمت كتاريخ مختلف عمّا كتبه المستخدم حرفياً.
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

// يبني نص "YYYY-MM-DD" من مكوّنات محلية للتاريخ (لا Date.toISOString التي تُحوِّل لتوقيت UTC)
// — استخدام toISOString هنا كان يُزيح التاريخ يوماً كاملاً للخلف في أي منطقة زمنية تسبق UTC (مثل
// توقيت فلسطين +02:00/+03:00): 01/01/2028 كانت تُحفَظ فعلياً كـ2027-12-31.
const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

// يُقنِّن أي نص تاريخ (من محلل الإدخال المرن، من تخصيصات ItemExpiryDatePicker، أو من الخادم عند
// فتح سند محفوظ) لصيغة "YYYY-MM-DD" بحتة بلا أي مكوّن وقت عرَضي — عمود "تاريخ الانتهاء" بالشبكة نصي
// بحت عمداً (بلا dataType:"Date"، انظر تعليق العمود بالأسفل) فلا حاجة لأي تنسيق خاص بـWijmo هنا،
// فقط ضمان اتساق الصيغة المعروضة/المحفوظة. .slice(0,10) يجعلها متكافئة القوة لو طُبِّقت مرتين.
export const toGridDateString = (value: string): string => (value || "").trim().slice(0, 10)

// جدول المنتجات في هذه القاعدة يحمل هذين العلمين فعلياً بأسماء الأعمدة has_expiry_date/
// has_batch_number (مؤكَّد عبر استجابة GET /api/inventory/products) — وليس has_expiry/has_batch
// كما افتُرِض ابتداءً استناداً لِمسار كود آخر (app/api/inventory/products/route.ts) تبيَّن أنه
// يشير لعمودين غير موجودين فعلياً في هذه القاعدة. يُفحَص أيضاً expiry_tracking/batch_tracking
// وhas_expiry/has_batch احتياطياً تحسّباً لاختلاف المخطط بين بيئات مختلفة.
const resolveBatchExpiryFlags = (product: any): { hasExpiry: boolean; hasBatch: boolean } => ({
  hasExpiry: !!(product?.has_expiry_date ?? product?.has_expiry ?? product?.expiry_tracking),
  hasBatch: !!(product?.has_batch_number ?? product?.has_batch ?? product?.batch_tracking),
})

// يحتسب "الكمية" تلقائياً من الطول/العرض/الارتفاع/العدد بحسب نوع قياس الصنف (measurment_id) — نفس
// جدول الحالات بالضبط في cellEditEnded الخاص بـStockInVoucher.js المرجعي (حالة 'length'/'width'/
// 'height'/'count'): 1=عادي (لا حساب، ترجع الكمية كما هي)، 2/8=مساحة م2 ومساحة+ارتفاع (عرض×طول×عدد
// — نعم، case 8 يستخدم نفس معادلة case 2 حرفياً في المرجع، لا يضرب بالارتفاع رغم اسمها)، 3=حجم م3
// (طول×عرض×ارتفاع×عدد)، 4/5=وزن كغم وبروفايل (طول×عدد)، 6=محيط (٢×(طول+عرض)×عدد)، 7=عدد فقط
// (=العدد وحده)، 9=اعمال زجاج (يضرب البُعد المُدخَل بالسطر بأبعاد الصنف الافتراضية نفسها: طول
// الصنف×الطول المُدخَل + عرض الصنف×العرض المُدخَل، كله ×عدد)، 10=بروفايل متر (كثافة الصنف×طول
// السطر×عدد).
export const recalcQuantityFromMeasurement = (row: VoucherItemRow): number | null => {
  const measurmentId = Number(row.measurment_id || 1)
  if (measurmentId === 1) return row.quantity
  const length = Number(row.length || 0)
  const width = Number(row.width || 0)
  const height = Number(row.height || 0)
  const count = Number(row.count || 0)
  switch (measurmentId) {
    case 2:
    case 8:
      return width * length * count
    case 3:
      return length * width * height * count
    case 4:
    case 5:
      return length * count
    case 6:
      return (2 * length + 2 * width) * count
    case 7:
      return count
    case 9:
      return (Number(row.product_length || 0) * length + Number(row.product_width || 0) * width) * count
    case 10:
      return Number(row.product_density || 0) * length * count
    default:
      return row.quantity
  }
}

// أي أبعاد يتطلّبها كل نوع قياس — نفس الشروط بالضبط في validateAddNewRow الخاص بـStockInVoucher.js
// المرجعي (طول لكل الأنواع غير عادي/محيط/عدد فقط، عرض لمساحة/حجم/محيط/مساحة+ارتفاع/اعمال زجاج،
// ارتفاع لحجم م3 فقط، وعدد لأي نوع غير عادي). تُستخدَم لكل من: (أ) التحقق قبل الحفظ، (ب) إظهار
// عمود بعينه بالشبكة تلقائياً حتى لو كان مخفياً بإعدادات السند إن احتاجه صنفٌ مُدرَج فعلياً.
export const measurementRequiresLength = (measurmentId: number): boolean => [2, 3, 4, 5, 8, 9, 10].includes(measurmentId)
export const measurementRequiresWidth = (measurmentId: number): boolean => [2, 3, 6, 8, 9].includes(measurmentId)
export const measurementRequiresHeight = (measurmentId: number): boolean => measurmentId === 3
export const measurementRequiresCount = (measurmentId: number): boolean => measurmentId !== 1

// يتحقق من سطر واحد: الأبعاد المطلوبة لنوع قياسه مُدخَلة فعلاً، ثم أن "الكمية" المُخزَّنة تطابق
// ناتج معادلة نوع القياس (حاجز أخير — عادة تتطابقان تلقائياً بفضل إعادة الحساب الفورية عند تعديل أي
// بُعد في handleCellEditEnded، لكن هذا يلتقط أي حالة لم تمر عبر ذلك المسار، كسند مُحمَّل من الخادم
// أو تلاعب مباشر بالبيانات). يُعيد null إن كان السطر سليماً أو نوع قياسه عادي (1).
export const validateItemMeasurement = (row: VoucherItemRow): string | null => {
  const measurmentId = Number(row.measurment_id || 1)
  if (measurmentId === 1) return null
  const label = row.product_name || row.product_code || ""
  if (measurementRequiresLength(measurmentId) && !(Number(row.length) > 0)) return `يجب ادخال الطول للصنف - ${label}`
  if (measurementRequiresWidth(measurmentId) && !(Number(row.width) > 0)) return `يجب ادخال العرض للصنف - ${label}`
  if (measurementRequiresHeight(measurmentId) && !(Number(row.height) > 0)) return `يجب ادخال الارتفاع للصنف - ${label}`
  if (measurementRequiresCount(measurmentId) && !(Number(row.count) > 0)) return `يجب ادخال العدد للصنف - ${label}`
  const expectedQuantity = recalcQuantityFromMeasurement(row)
  if (expectedQuantity != null && Math.abs(Number(expectedQuantity) - Number(row.quantity || 0)) > 1e-6) {
    return `الكمية للصنف - ${label} - غير مطابقة لمعادلة نوع القياس (الطول×العرض×الارتفاع×العدد حسب النوع)`
  }
  return null
}

// نفس دالة التطبيع المستخدَمة في unified-journal.tsx لِـ AccountSearchDialog/AccountCostCenters —
// مُكرَّرة هنا بدل استيرادها لعدم وجود مصدر مشترك مُصدَّر لها حالياً.
const mapAccount = (item: any): AccountItem => ({
  id: Number(item.id),
  code: String(item.code || item.account_code || ""),
  name: String(item.name || item.account_name || ""),
  name_lang2: item.name_lang2 ?? null,
  level_no: Number(item.level_no || 1),
  finanical_list_id: Number(item.finanical_list_id || 1),
  currency_id: item.currency_id != null ? Number(item.currency_id) : null,
  allow_trans_with_diff_curr: Number(item.allow_trans_with_diff_curr || 0),
  iscalc_curr_diff_rates: Boolean(item.iscalc_curr_diff_rates),
  transaction_type: Number(item.transaction_type || 0),
  transaction_type_action: Number(item.transaction_type_action || 0),
  max_transaction_amount: Number(item.max_transaction_amount || 0),
  max_transaction_amount_action: Number(item.max_transaction_amount_action || 0),
  max_balance_amount: Number(item.max_balance_amount || 0),
  show_notes_in_transactions_soa: Boolean(item.show_notes_in_transactions_soa),
  status: item.status || "نشط",
  cost_centers: Array.isArray(item.cost_centers) ? item.cost_centers : [],
})

const emptyItemRow: VoucherItemRow = {
  product_id: null,
  product_code: "",
  product_name: "",
  barcode: "",
  warehouse_id: null,
  warehouse_name: "",
  unit: "",
  quantity: null,
  unit_price: null,
  total_price: null,
  batch_number: "",
  expiry_date: "",
  length: null,
  width: null,
  height: null,
  count: null,
  note: "",
  expense_account_id: null,
  purchase_account_id: null,
  expense_cost_centers: [],
  purchase_cost_centers: [],
}

const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : value)
const normalizeVoucherCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "")

// انتقال ملاحظة عن سباق مشابه لِما وُوجِه في unified-receipt-voucher.tsx هذه الجلسة: شبكة Wijmo
// تُصفّر تحديدها عند كل تبديل لمرجع itemsSource — لذا تُستخدم هنا نفس الحلول المُثبَتة: كائن
// CollectionView ثابت لا يُستبدَل أبداً (بدل useMemo يُنتج مصفوفة جديدة كل تعديل)، وresolveFlexControl
// لتطبيع غلاف React الذي قد يُخزَّن أحياناً بدل عنصر التحكم الفعلي في مرجع الشبكة.
const resolveFlexControl = (grid: any): any => {
  if (!grid) return null
  // "control" في المفتاح (لا truthiness فقط) يُميّز غلاف React (wjcGrid.FlexGrid) عن عنصر التحكم
  // الأصلي — الاعتماد سابقاً على truthiness عمود grid.columns وحدها كان غير كافٍ: الغلاف نفسه قد
  // يُظهر columns بشكل عابر قبل أن يكتمل تركيب Control الأصلي بداخله (grid.control لا يزال null)،
  // فيُعاد الغلاف ذاته بدل null، وأي قراءة لاحقة لـ.selection عليه تتحطّم لأن getter الخاص به
  // يمرّرها إلى control الذي لا يزال null (نفس عطل "Cannot read properties of null (reading
  // 'selection')" الذي كان يُظَنّ أنه أُصلِح سابقاً — لم يكن كافياً لهذه الحالة الحدّية).
  if ("control" in grid) {
    const control = grid.control
    return control && control.columns ? control : null
  }
  return grid.columns ? grid : null
}

const selectCell = (rawGrid: any, row: number, colName: string) => {
  const grid = resolveFlexControl(rawGrid)
  if (!grid || !grid.columns) return
  const colIndex = grid.columns.findIndex((c: any) => c.binding === colName)
  if (colIndex >= 0) grid.select(new CellRange(row, colIndex))
}

const waitForGridReady = (getGrid: () => any, onReady: (grid: any) => void, attempts = 10, minRows = 0) => {
  const grid = resolveFlexControl(getGrid())
  if (grid && grid.columns && (!minRows || (grid.rows && grid.rows.length >= minRows))) {
    onReady(grid)
    return
  }
  if (attempts <= 0) return
  setTimeout(() => waitForGridReady(getGrid, onReady, attempts - 1, minRows), 50)
}

export default function UnifiedStockVoucher({
  voucherType,
  dialogOpen,
  onOpenChange,
  form,
  onFormChange,
  onItemsChange,
  voucherBooks = [],
  currencyOptions = [],
  baseCurrencyId,
  warehouses = [],
  defaultItemWarehouseId = null,
  priceCategories = [],
  defaultCostPriceCategoryId = null,
  isSaving = false,
  currentIndex = 0,
  totalRecords = 0,
  isFirstRecord = true,
  isLastRecord = true,
  onNew,
  onSave,
  onValidateSave,
  onDelete,
  onNavigate,
  onPrint,
  onClone,
  onCodeResolved,
  onCodeNotFound,
  errorMessages = [],
}: UnifiedStockVoucherProps) {
  const labels = TYPE_LABELS[voucherType]
  const { toast } = useToast()
  const isInternalDelivery = voucherType === INTERNAL_DELIVERY_VCH_TYPE
  const isUseVoucher = voucherType === USE_VOUCHER_VCH_TYPE
  // شارة الحالة في عنوان النافذة: ملغي منطقياً (status=3) تطغى على أي شيء آخر؛ خلاف ذلك "مرحل"
  // وحدها إن لم تُطبع بعد، أو "مرحل - مطبوع" إن طُبعت (is_printed=1) بعد الترحيل — مطابق لِـ
  // unified-receipt-voucher.tsx.
  const isLocked = form.status === 2 || form.status === 3
  const statusBadge =
    form.status === 3 ? "ملغي منطقياً" : form.status === 2 ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل") : ""
  // ترتيب التنقل بـ Tab/Enter بين أعمدة شبكة الأصناف — يطابق ترتيب الأعمدة الفعلي المرئي في scheme.
  // warehouse_name مرئي بالسطر لسند الاستعمال وسند ادخال بضاعة وسند اخراج بضاعة (showRowWarehouseColumn)
  // — أصناف هذه الأنواع قد تدخل/تُصرف من مستودعات مختلفة لكل سطر؛ الإرسالية الداخلية وحدها تبقى
  // على مستودعَين من رأس السند (من/الى مستودع) فيبقى العمود مُخفى لها. batch_number وexpiry_date
  // مُستثنيان أيضاً من ترتيب Tab/Enter لِـ"ارسالية داخلية" لأنهما للقراءة فقط هناك (تُملآن حصراً عبر
  // ItemExpiryDatePicker) — batch_number يبقى مرئياً لها رغم ذلك (خلافاً لـexpiry_date المُخفى كلياً).
  const showRowWarehouseColumn = isUseVoucher || voucherType === STOCK_IN_VCH_TYPE || voucherType === STOCK_OUT_VCH_TYPE
  // warehouse_name وunit للقراءة فقط الآن (تُملآن تلقائياً/عبر زر بحث حصراً، مثل product_name) فلا
  // حاجة لإدراجهما في ترتيب Tab/Enter — نفس معاملة product_name غير المُدرَج هنا لذات السبب.
  const fieldOrder = isInternalDelivery
    ? ["product_code", "length", "width", "height", "count", "quantity", "unit_price", "note"]
    : ["product_code", "length", "width", "height", "count", "quantity", "unit_price", "batch_number", "expiry_date", "note"]
  const messagesRef = useRef<any>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const vchCodeInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState("items")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [warehouseSearchOpen, setWarehouseSearchOpen] = useState(false)
  const [warehouseSearchRow, setWarehouseSearchRow] = useState<number | null>(null)
  const [warehouseSearchTarget, setWarehouseSearchTarget] = useState<"row" | "from_store" | "to_store">("row")
  const [unitsSearchOpen, setUnitsSearchOpen] = useState(false)
  const [unitsSearchRow, setUnitsSearchRow] = useState<number | null>(null)
  const [expiryDatePickerOpen, setExpiryDatePickerOpen] = useState(false)
  const [expiryDateRow, setExpiryDateRow] = useState<number | null>(null)
  // نافذة اختيار الدفعة/تاريخ الصلاحية عند إدخال الكمية — فقط لسندات اخراج بضاعة/استعمال/ارسالية
  // داخلية (استهلاك من مخزون قائم قد يحمل أكثر من دفعة)؛ سند ادخال بضاعة يبقى على نمط "تاريخ
  // صلاحية مكتوب مباشرة" الحالي (DEFAULT_EXPIRY_DATE + التقويم أعلاه) لأنه يُدخِل دفعة جديدة.
  const [expiryLotPickerOpen, setExpiryLotPickerOpen] = useState(false)
  const [expiryLotPickerRow, setExpiryLotPickerRow] = useState<number | null>(null)
  const [expiryLotPickerQuantity, setExpiryLotPickerQuantity] = useState(0)
  const [expiryLotPickerWarehouseId, setExpiryLotPickerWarehouseId] = useState<number | null>(null)
  const [expiryLotPickerReservedByLot, setExpiryLotPickerReservedByLot] = useState<Record<string, number>>({})
  // تبويب "تفاصيل حسابات الاصناف" (سند الاستعمال فقط) — بحث حساب مشترك بين عمودَي المشتريات/
  // المصروف (يُميَّز بـ itemAccountsSearchField) مطابقاً لنمط journalSearchOpen في
  // unified-journal.tsx، ومركز تكلفة مشترك بنفس الفكرة.
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const accountsListRef = useRef<AccountItem[]>([])
  const accountsFetchRef = useRef<Promise<AccountItem[]> | null>(null)
  const [itemAccountsSearchOpen, setItemAccountsSearchOpen] = useState(false)
  const [itemAccountsSearchRow, setItemAccountsSearchRow] = useState<number | null>(null)
  const [itemAccountsSearchField, setItemAccountsSearchField] = useState<"expense" | "purchase">("expense")
  const [itemCostCenterOpen, setItemCostCenterOpen] = useState(false)
  const [itemCostCenterAccount, setItemCostCenterAccount] = useState<AccountItem | null>(null)
  const [itemCostCenterRow, setItemCostCenterRow] = useState<number | null>(null)
  const [itemCostCenterField, setItemCostCenterField] = useState<"expense" | "purchase">("expense")
  // حسابات الأصناف الافتراضية من إعدادات النظام (تبويب "الحسابات الافتراضية للاصناف") — تُستخدَم
  // فقط إن لم يحمل الصنف نفسه حساب مصروف/مشتريات خاصاً به (products.lsti3mal_account_id/
  // purchase_account_id)؛ تُجلَب مرة واحدة وتُخزَّن هنا بدل استعلام /api/settings/system عند كل
  // اختيار صنف.
  const defaultItemAccountsRef = useRef<{ purchase: number | null; expense: number | null } | null>(null)
  const defaultItemAccountsFetchRef = useRef<Promise<{ purchase: number | null; expense: number | null }> | null>(null)
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)
  // فئة السعر المختارة لِزر "إعادة احتساب الأسعار"، وتأكيد تغيير العملة (يُسأل المستخدم عن إعادة
  // احتساب الأسعار تناسبياً مع سعر الصرف الجديد) — نفس نمط onCurrencyChanged/PricingWay في
  // StockInVoucher.js القديم.
  const [priceCategoryId, setPriceCategoryId] = useState<number | null>(null)
  const [showCurrencyRecalcConfirm, setShowCurrencyRecalcConfirm] = useState(false)
  const pendingCurrencyIdRef = useRef<number | null>(null)
  const [showPriceRecalcConfirm, setShowPriceRecalcConfirm] = useState(false)
  const combinedPriceCategories = useMemo(
    () => [...SPECIAL_PRICE_CATEGORIES, ...priceCategories.map((c) => ({ ...c, disabled: false }))],
    [priceCategories],
  )

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.show?.(errorMessages.map((detail) => ({ severity: "error", summary: "", detail, life: 4000 })))
    }
  }, [errorMessages])

  // يجلب قائمة الحسابات مسبقاً عند فتح سند استعمال — فقط لهذا النوع لأنه الوحيد الذي يستخدم تبويب
  // "تفاصيل حسابات الاصناف" (مطابق لِـ ensureAccountsLoaded في unified-journal.tsx).
  useEffect(() => {
    if (!dialogOpen || !isUseVoucher) return
    void ensureAccountsLoaded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, isUseVoucher])

  // يُطبِّق "طريقة احتساب تكلفة الصنف في سندات ادخال/ اخراج/ استعمال" (اعدادات عامة) كفئة سعر
  // افتراضية عند فتح سند جديد (form.id فارغ) من أحد هذه الأنواع الثلاثة فقط — لا يُطبَّق على
  // الارسالية الداخلية (لا تملك فئة سعر أصلاً) ولا يُطبَّق عند فتح سند محفوظ مسبقاً حتى لا يُلغي
  // فئة السعر التي اختارها المستخدم فعلياً عند إنشائه.
  useEffect(() => {
    if (!dialogOpen || form.id || isInternalDelivery) return
    if (voucherType !== STOCK_IN_VCH_TYPE && voucherType !== STOCK_OUT_VCH_TYPE && voucherType !== USE_VOUCHER_VCH_TYPE) return
    setPriceCategoryId(defaultCostPriceCategoryId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, voucherType, isInternalDelivery, defaultCostPriceCategoryId])

  // ينتقل التركيز إلى تاريخ السند عند فتح الحوار أو عرض سجل مختلف (سجل جديد، سجل تم التنقل إليه،
  // أو إعادة ضبط الحقول بعد الحفظ) — مطابق لِـ unified-receipt-voucher.tsx. form.vch_code ضمن
  // الاعتماديات لأنه يتغيّر أيضاً عند الضغط على "جديد" مرتين متتاليتين قبل الحفظ (id يبقى 0 في
  // الحالتين)، لكنه يتغيّر أيضاً بكل ضغطة مفتاح أثناء الكتابة في حقل رقم السند نفسه — فيُعاد تشغيل
  // هذا الأثر حينها ويخطف التركيز من الحقل بعد 120ms منتصف الكتابة. الفحص أدناه (عنصر التركيز
  // الحالي هو حقل رقم السند) يمنع ذلك تحديداً دون التأثير على حالة "جديد مرتين".
  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => {
      if (document.activeElement === vchCodeInputRef.current) return
      dateInputRef.current?.focus()
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code])

  // لقطة النموذج عند فتح السند/التنقل إليه — تُقارَن بها الحالة الحالية لتحديد وجود تعديلات غير
  // محفوظة قبل تنفيذ أي إجراء يُغادر السند الحالي (جديد/تنقل/إغلاق) — نفس نمط unified-receipt-voucher.tsx.
  const initialSnapshotRef = useRef<string>(JSON.stringify(form))
  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify(form)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code])

  const guardedAction = (action: () => void) => {
    if (showUnsavedConfirm) return
    if (JSON.stringify(form) !== initialSnapshotRef.current) {
      pendingActionRef.current = action
      setShowUnsavedConfirm(true)
    } else {
      action()
    }
  }

  // كتابة يدوية في رقم السند (مثال R1 أو 1 فقط) تُعاد صياغتها دائماً كـ {بادئة}{رمز الدفتر}
  // {تسلسل مبطّن} عبر /resolve-code، ثم يُعرض السند إن كان موجوداً بهذا الرقم (بعد التأكد من عدم
  // وجود تعديلات غير محفوظة في السند الحالي)، أو تُصفَّر كل الحقول والشبكات لسند جديد بهذا الرقم
  // — مطابق لِـ handleCodeBlur في unified-receipt-voucher.tsx.
  const handleCodeBlur = async () => {
    const raw = form.vch_code.trim()
    if (!raw) return
    try {
      const query = new URLSearchParams({ vch_type: String(voucherType), raw })
      if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id))
      const response = await fetch(`/api/stock-vouchers/resolve-code?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || "تعذر تحديد رقم السند", life: 3000 }])
        return
      }
      if (data.code && data.code !== form.vch_code) {
        onFormChange("vch_code", data.code)
      }
      if (data.exists && data.id) {
        if (data.id === form.id) return
        guardedAction(() => onCodeResolved?.(data.id))
      } else if (!data.exists && data.code) {
        guardedAction(() => onCodeNotFound?.(data.code))
      }
    } catch (error) {
      console.error("Failed to resolve voucher code", error)
    }
  }

  // يمنع تطبيق نتيجة بحث الصنف (غير المتزامن) بعد إغلاق الحوار أو فكّ تركيب المكوّن — استدعاء
  // patchItemRow بعد ذلك كان يصل بشبكة Wijmo إلى حالة غير مستقرة (control فارغ) فتتحطّم.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const items = form.items || []
  const itemsRef = useRef(items)
  itemsRef.current = items
  // مرجع دائم التحديث لـform — تستخدمه دوال تُستدعى من مُعالِجات Wijmo المُمرَّرة كخاصية لـ
  // DataGridView (كـcellEditEnded)؛ إن أبقى المُغلِّف الخاص بـWijmo على أول دالة مُرَّرت له دون
  // إعادة ربطها عند كل تحديث، تبقى القيم المُغلَقة عليها (كـform.from_store_id) كما كانت عند أول
  // تركيب للشبكة (عادة فارغة) رغم تحديث المستخدم لها فعلياً بعدها — استخدام .current بدل الإغلاق
  // المباشر على form يضمن قراءة أحدث قيمة دوماً، بنفس أسلوب itemsRef أعلاه تماماً.
  const formRef = useRef(form)
  formRef.current = form
  // نفس سبب formRef أعلاه: تُقرَأ warehouses/defaultItemWarehouseId من دوال يستدعيها
  // handleCellEditEnded المربوط بخاصية cellEditEnded لِـWijmo — إن لم تُعِد الشبكة ربط هذه الخاصية
  // عند كل تحديث تبقى القيمتان كما كانتا عند أول تركيب (قائمة مستودعات فارغة قبل اكتمال أول جلب
  // API)، فيفشل resolveDefaultWarehouse بصمت لاحقاً رغم اكتمال الجلب فعلياً ورغم تحديث الخاصيتين.
  const warehousesRef = useRef(warehouses)
  warehousesRef.current = warehouses
  const defaultItemWarehouseIdRef = useRef(defaultItemWarehouseId)
  defaultItemWarehouseIdRef.current = defaultItemWarehouseId

  const [itemsCollectionView] = useState(() => new wjcCore.CollectionView<any>([]))
  const chequeGridRef = useRef<any>(null) // اسم مطابق للاصطلاح المستخدم سابقاً (مرجع للشبكة الرئيسية)
  const pendingFocusRef = useRef<{ row: number; col: string } | null>(null)
  // شبكة تبويب "تفاصيل حسابات الاصناف" (accountsScheme) مرتبطة بنفس itemsCollectionView لكنها
  // FlexGrid منفصل فعلياً عن الشبكة الرئيسية (chequeGridRef) — تحتاج مرجع تركيز خاصاً بها، وإلا
  // فـselectCell/restoreGridFocus أعلاه ستُطبَّق خطأً على الشبكة الرئيسية (وقد تكون غير ظاهرة أصلاً
  // إن كان المستخدم على تبويب "الحسابات") بدل شبكة الحسابات التي فتحت نافذة البحث فعلياً.
  const accountsGridRef = useRef<any>(null)
  const pendingAccountsFocusRef = useRef<{ row: number; col: string } | null>(null)
  const lastAccountsFocusedCellRef = useRef<{ row: number; col: string } | null>(null)
  // يمنع handleCellEditEnded من تشغيل بحث مزدوج عند Enter/Tab على عمودَي رقم الصنف/الباركود —
  // handleKeyDown يضبطه true قبل استدعاء grid.finishEditing() (الذي يُشغِّل cellEditEnded مباشرة)
  // ثم يُعيده false فوراً بعدها، ليتولّى هو نفسه استدعاء lookupProductByCode بانتظار نتيجتها.
  const skipAutoLookupRef = useRef(false)

  // نفس نمط unified-sales-order.tsx: أي نافذة بحث مفتوحة (منتج/مستودع) تُعطّل اختصارات لوحة
  // المفاتيح الخاصة بالشبكة (F7/F10/Tab/Enter) ريثما تُغلَق، لمنع تسرّب هذه المفاتيح للنافذة
  // المنبثقة أو تنفيذها خلفها دون قصد.
  const doHotKeys = useRef(true)
  const lastFocusedCellRef = useRef<{ row: number; col: string } | null>(null)
  const popupHasCalled = () => {
    doHotKeys.current = false
  }
  const popupHasClosed = () => {
    doHotKeys.current = true
  }
  const restoreGridFocus = (target: { row: number; col: string } | null) => {
    if (!target) return
    waitForGridReady(
      () => chequeGridRef.current,
      (grid) => {
        selectCell(grid, target.row, target.col)
        grid.focus()
      },
      20,
      target.row + 1,
    )
  }
  const restoreAccountsGridFocus = (target: { row: number; col: string } | null) => {
    if (!target) return
    waitForGridReady(
      () => accountsGridRef.current,
      (grid) => {
        selectCell(grid, target.row, target.col)
        grid.focus()
      },
      20,
      target.row + 1,
    )
  }

  // مرجع لأحدث نسخة من handleRequestSave (يُسنَد إليه لاحقاً في كل تصيير — انظر أسفل الملف)،
  // ليقرأه مستمع F3 دائماً محدَّثاً رغم أن مصفوفة تبعيات useEffect أدناه لا تتضمن form بأكمله (فقط
  // id/status اللازمين لـF4). بدونه يبقى مستمع F3 متجمّداً على النسخة الأولى من handleRequestSave
  // (وبالتالي form.items وقت التركيب فقط) طالما لم يتغيّر id/status — فيرى دائماً صفوفاً فارغة حتى
  // لو أضاف المستخدم أصنافاً فعلياً بعدها.
  const handleRequestSaveRef = useRef<() => void>(() => {})

  // F3 يحفظ السند، F4 يحذفه (فقط لسند محفوظ فعلاً بحالة مسودة — id>0 وstatus=1). كلاهما مُعطَّل
  // ريثما تكون أي نافذة منبثقة (بحث صنف/مستودع/وحدة، تأكيد الحذف، أو نافذة "كيف تريد الحفظ؟")
  // مفتوحة عبر doHotKeys — نفس العلَم المُستخدَم لتعطيل اختصارات الشبكة أثناء ذلك — ويعود العمل
  // تلقائياً بعد إغلاقها.
  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!doHotKeys.current || showDeleteConfirm || postDialogOpen || showUnsavedConfirm) return
      if (event.key === "F3") {
        event.preventDefault()
        // خلافاً للنقر على زر "حفظ" (يُفقِد الشبكة تركيزها فيُنهي Wijmo تحرير الخلية النشطة قبل
        // وصول الحدث)، F3 لا يُغيّر التركيز إطلاقاً — فيبقى أي تعديل نشط في خلية الشبكة (كرقم صنف
        // كُتب للتو) غير مُطبَّق على itemsSource/form.items عند وصول هذا الحدث. يُنهى التحرير النشط
        // صراحةً، ثم يُؤجَّل التحقق/الحفظ لِتِك التالي لِتُتاح فرصة لتحديث form.items أولاً.
        resolveFlexControl(chequeGridRef.current)?.finishEditing?.()
        setTimeout(() => handleRequestSaveRef.current(), 0)
        return
      }
      if (event.key === "F4") {
        event.preventDefault()
        if (form.id > 0 && form.status === 1) {
          setShowDeleteConfirm(true)
        }
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown)
    return () => window.removeEventListener("keydown", onGlobalKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.status, showDeleteConfirm, postDialogOpen, showUnsavedConfirm])

  useEffect(() => {
    const gridBeforeSync = resolveFlexControl(chequeGridRef.current)
    const prevSelection = gridBeforeSync?.selection
      ? { row: gridBeforeSync.selection.row, col: gridBeforeSync.selection.col }
      : null

    itemsCollectionView.sourceCollection = items.map((row, i) => ({ ...row, ser: i + 1 }))
    itemsCollectionView.refresh()

    const pending = pendingFocusRef.current
    if (pending) {
      pendingFocusRef.current = null
      waitForGridReady(
        () => chequeGridRef.current,
        (grid) => {
          selectCell(grid, pending.row, pending.col)
          grid.focus()
        },
        20,
        pending.row + 1,
      )
    } else if (prevSelection) {
      const grid = resolveFlexControl(chequeGridRef.current)
      if (grid && grid.rows && grid.rows.length > prevSelection.row) {
        grid.select(new CellRange(prevSelection.row, prevSelection.col))
      }
    }

    const pendingAccounts = pendingAccountsFocusRef.current
    if (pendingAccounts) {
      pendingAccountsFocusRef.current = null
      waitForGridReady(
        () => accountsGridRef.current,
        (grid) => {
          selectCell(grid, pendingAccounts.row, pendingAccounts.col)
          grid.focus()
        },
        20,
        pendingAccounts.row + 1,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const patchItemRow = (index: number, patch: Partial<VoucherItemRow>) => {
    if (isLocked) return
    const safePatch =
      patch.expiry_date !== undefined ? { ...patch, expiry_date: toGridDateString(patch.expiry_date) } : patch
    const next = itemsRef.current.map((row, i) => (i === index ? { ...row, ...safePatch } : row))
    itemsRef.current = next
    onItemsChange(next)
  }

  const addItemRow = () => {
    if (isLocked) return
    const next = [...itemsRef.current, { ...emptyItemRow }]
    itemsRef.current = next
    onItemsChange(next)
  }

  const removeItemRow = (index: number) => {
    if (isLocked) return
    const next = itemsRef.current.filter((_, i) => i !== index)
    itemsRef.current = next.length > 0 ? next : [{ ...emptyItemRow }]
    onItemsChange(itemsRef.current)
  }

  // يوزّع الكمية المُدخَلة على دفعة/دفعات مُختارة من نافذة ItemExpiryDatePicker: الدفعة الأولى
  // تُكتب على السطر الحالي مباشرة، وأي دفعات إضافية (تخصيص عبر أكثر من دفعة لتغطية كمية واحدة)
  // تُدرَج كسطور جديدة مطابقة لنفس الصنف مباشرة بعد السطر الحالي — مطابق لسلوك
  // btnItemExpiryDateYes في StockInVoucher.js المرجعي (يُضيف سطراً منفصلاً لكل دفعة إضافية).
  const applyExpiryAllocations = (index: number, allocations: ExpiryLotAllocation[]) => {
    if (isLocked || allocations.length === 0) return
    const baseRow = itemsRef.current[index]
    if (!baseRow) return
    const [first, ...rest] = allocations
    const updatedFirst: VoucherItemRow = {
      ...baseRow,
      batch_number: first.batch_number,
      expiry_date: toGridDateString(first.expiry_date),
      quantity: first.quantity,
      total_price: recalcAmount(first.quantity, baseRow.unit_price),
    }
    const extraRows: VoucherItemRow[] = rest.map((allocation) => ({
      ...baseRow,
      batch_number: allocation.batch_number,
      expiry_date: toGridDateString(allocation.expiry_date),
      quantity: allocation.quantity,
      total_price: recalcAmount(allocation.quantity, baseRow.unit_price),
    }))
    const next = [...itemsRef.current]
    next.splice(index, 1, updatedFirst, ...extraRows)
    itemsRef.current = next
    onItemsChange(next)
  }

  const chequesTotal = items.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  const amountTotal = items.reduce((sum, row) => sum + Number(row.total_price || 0), 0)

  const recalcAmount = (quantity: number | null, price: number | null) => {
    const q = Number(quantity || 0)
    const p = Number(price || 0)
    return Math.round(q * p * 100) / 100
  }

  // يوحّد شكل وحدات الصنف القادمة من مصدرين مختلفين (نافذة بحث الأصناف تُرجع unit_id/unit_name/price،
  // وبحث الكود عبر /api/inventory/products/search يُرجع unit_id/unit_name/unit_price/to_main_qnty).
  const normalizeUnits = (rawUnits: any[] | undefined): NonNullable<VoucherItemRow["units"]> =>
    (rawUnits || []).map((u) => ({
      unit_id: u.unit_id,
      unit_name: u.unit_name || "",
      price: Number(u.price ?? u.unit_price ?? 0),
      barcode: u.barcode || "",
      to_main_qnty: Number(u.to_main_qnty ?? 1),
    }))

  // بحث صنف بكوده (بعد تطبيعه لطول ثابت: حرف بادئة + 7 أرقام، مثل B207 → B0000207) أو بباركوده —
  // تُستدعى من فرعَي "product_code" و"barcode" في handleCellEditEnded معاً، إذ /api/inventory/
  // products/search?query=... يبحث بالكود أولاً ثم بالباركود احتياطياً (product_unit_barcodes) من
  // جهة الخادم فعلياً، فتُخدَم الحالتان بنفس الاستدعاء دون تمييز من هنا — نفس منطق
  // fetchProductByCodeOrBarcode/FillItem في unified-sales-order.tsx لكن بدالة استدعاء واحدة بدل
  // اثنتين مطابقتين تقريباً.
  // sourceField يحدّد أي عمود بدأ البحث (لمسح قيمته وإبقاء التركيز عليه عند الفشل)، وautoAdvanceOnSuccess
  // يُفعَّل فقط عند الاستدعاء من Enter/Tab (handleKeyDown) — يُنقِل المؤشّر تلقائياً للعمود التالي بعد
  // نجاح البحث (بانتظار النتيجة فعلياً بدل التنقّل الفوري كما كان سابقاً)، ويبقى معطَّلاً عند الاستدعاء
  // من cellEditEnded (نقر بالماوس خارج الخلية) حتى لا يخطف التركيز ممّا نقر إليه المستخدم فعلياً.
  const lookupProductByCode = async (
    row: number,
    code: string,
    sourceField: "product_code" | "barcode",
    autoAdvanceOnSuccess = false,
    // لقطة السطر قبل هذا التعديل — إن كان يحمل صنفاً محمَّلاً فعلاً (product_id) عند الفشل، تُستَرجَع
    // قيمة العمود المُعدَّل فقط لما كانت عليه (كود/باركود الصنف المحمَّل)، وتبقى بقية بيانات السطر
    // كما هي دون مسح؛ خلاف ذلك (سطر فارغ أصلاً) يُمسَح العمود كسابقاً.
    previousRow?: VoucherItemRow,
  ) => {
    try {
      const res = await fetch(`/api/inventory/products/search?query=${encodeURIComponent(code)}&priceCategoryId=0`)
      if (!isMountedRef.current) return
      if (!res.ok) throw new Error("not found")
      const product = await res.json()
      if (!isMountedRef.current) return
      if (!product || !product.id) throw new Error("not found")
      const currentRow = itemsRef.current[row]
      const unitPrice = product.price != null ? Number(product.price) : 0
      const warehousePatch = resolveDefaultWarehouse(product)
      const { hasExpiry, hasBatch } = resolveBatchExpiryFlags(product)
      const { purchase, expense } = await resolveAccountDefaults(product)
      if (!isMountedRef.current) return
      patchItemRow(row, {
        product_id: product.id,
        product_code: product.product_code,
        product_name: product.product_name,
        // بحث الكود عبر /api/inventory/products/search يُرجع barcode، وبحث القائمة عبر
        // /api/inventory/products (نافذة البحث) يُرجع first_barcode — نفس ازدواجية unit_name/
        // first_unit وprice/first_price المُعالَجة أدناه لذات المصدرين.
        barcode: product.barcode || product.first_barcode || "",
        unit: product.unit_name || currentRow?.unit || "",
        unit_price: unitPrice,
        total_price: recalcAmount(currentRow?.quantity ?? 0, unitPrice),
        units: normalizeUnits(product.units),
        has_expiry: hasExpiry,
        has_batch: hasBatch,
        // نوع القياس وأبعاد الصنف الافتراضية (لحالتَي 9/10 في recalcQuantityFromMeasurement) —
        // العدد يُصفَّر لـ1 دوماً عند اختيار صنف مطابقاً لِـfillItemInfo المرجعي.
        measurment_id: product.measurment_id != null ? Number(product.measurment_id) : 1,
        product_length: product.length != null ? Number(product.length) : null,
        product_width: product.width != null ? Number(product.width) : null,
        product_density: product.density != null ? Number(product.density) : null,
        count: 1,
        ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
        ...(hasExpiry && !currentRow?.expiry_date ? { expiry_date: DEFAULT_EXPIRY_DATE } : {}),
        ...(purchase
          ? { purchase_account_id: purchase.id, purchase_account_code: purchase.code, purchase_account_name: purchase.name }
          : {}),
        ...(expense ? { expense_account_id: expense.id, expense_account_code: expense.code, expense_account_name: expense.name } : {}),
      })
      if (autoAdvanceOnSuccess) {
        // نفس منطق handleProductSelect بعد اختيار صنف من النافذة المنبثقة: العمود التالي لِـ"رقم
        // الصنف" يعتمد على نوع قياس الصنف (طول/عرض/ارتفاع/عدد إن لزم، وإلا الكمية مباشرة) — تُطبَّق
        // هنا أيضاً بصرف النظر عن كون البحث بدأ من عمود الباركود أو رقم الصنف نفسه.
        const nextFieldIndex = findNextRelevantFieldIndex(fieldOrder.indexOf("product_code") + 1, itemsRef.current[row])
        pendingFocusRef.current = { row, col: nextFieldIndex === -1 ? "quantity" : fieldOrder[nextFieldIndex] }
      }
    } catch {
      if (!isMountedRef.current) return
      const message = sourceField === "barcode" ? "رقم الباركود المدخل غير موجود" : "رقم الصنف المدخل غير موجود"
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: message, life: 3000 }])
      if (previousRow?.product_id) {
        if (sourceField === "barcode") {
          patchItemRow(row, { barcode: previousRow.barcode })
        } else {
          patchItemRow(row, { product_code: previousRow.product_code })
        }
      } else if (sourceField === "barcode") {
        patchItemRow(row, { product_id: null, product_name: "", barcode: "" })
      } else {
        patchItemRow(row, { product_id: null, product_name: "", product_code: "" })
      }
      // يُبقي المؤشّر في نفس العمود الذي بدأ منه البحث (بدل الانتقال التلقائي) — يُطبَّق فقط عند
      // البحث القادم من Enter/Tab (autoAdvanceOnSuccess=true)؛ عند النقر بالماوس خارج الخلية لا داعي
      // لسرقة التركيز ممّا نقر إليه المستخدم فعلياً.
      if (autoAdvanceOnSuccess) {
        pendingFocusRef.current = { row, col: sourceField }
      }
    }
  }

  const handleCellEditEnded = (grid: any, e: any) => {
    chequeGridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    const value = grid.getCellData(row, e.col, false)
    if (colName === "product_code") {
      const previousRow = itemsRef.current[row]
      const rawValue = String(value ?? "").trim()
      if (!rawValue) {
        patchItemRow(row, { product_code: "", product_id: null, product_name: "" })
        return
      }
      const adjusted = Util.adjustCode(rawValue, 8).toUpperCase()
      patchItemRow(row, { product_code: adjusted })
      // يتخطّى البحث إن كان Enter/Tab (handleKeyDown) سيُشغِّله بنفسه بعد قليل — انظر تعليق
      // skipAutoLookupRef أدناه لسبب تفادي بحث مزدوج.
      if (skipAutoLookupRef.current) return
      void lookupProductByCode(row, adjusted, "product_code", false, previousRow)
    } else if (colName === "barcode") {
      // كالباركود في unified-sales-order.tsx: يجلب الصنف مباشرة عند إدخال/مسح باركود بالسطر — بلا
      // تطبيع Util.adjustCode (خاص بصيغة كود الصنف الثابتة الطول، لا الباركود المتغيّر الطول).
      const previousRow = itemsRef.current[row]
      const rawValue = String(value ?? "").trim()
      if (!rawValue) {
        patchItemRow(row, { barcode: "", product_id: null, product_name: "" })
        return
      }
      patchItemRow(row, { barcode: rawValue })
      if (skipAutoLookupRef.current) return
      void lookupProductByCode(row, rawValue, "barcode", false, previousRow)
    } else if (colName === "quantity") {
      const quantity = value === "" || value === null ? null : Number(value)
      patchItemRow(row, { quantity, total_price: recalcAmount(quantity, itemsRef.current[row]?.unit_price ?? null) })
      // اخراج بضاعة/استعمال/ارسالية داخلية تستهلك من مخزون قائم قد يحمل أكثر من دفعة/تاريخ صلاحية
      // — يفتح نافذة اختيار الدفعة(دفعات) فور إدخال كمية موجبة لصنف له تتبع صلاحية أو دفعة، مطابقاً
      // لِـ"if (has_expiry || has_batch_no) ... this.openItemExpiryDate(colName)" في cellEditEnded
      // الخاص بـStockInVoucher.js المرجعي. سند ادخال بضاعة مُستثنى عمداً (دفعة جديدة تُكتب مباشرة
      // عبر عمود "تاريخ الانتهاء" + التقويم، لا تُختار من مخزون موجود).
      const currentRow = itemsRef.current[row]
      if (
        voucherType !== STOCK_IN_VCH_TYPE &&
        currentRow?.product_id &&
        (currentRow.has_expiry || currentRow.has_batch) &&
        Number(quantity || 0) > 0
      ) {
        const consumptionWarehouseId = resolveConsumptionWarehouseId(currentRow)
        if (!consumptionWarehouseId) {
          messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد المستودع اولا", life: 3000 }])
          patchItemRow(row, { quantity: null, total_price: recalcAmount(null, currentRow?.unit_price ?? null) })
          return
        }
        setExpiryLotPickerRow(row)
        setExpiryLotPickerQuantity(Number(quantity))
        setExpiryLotPickerWarehouseId(consumptionWarehouseId)
        setExpiryLotPickerReservedByLot(computeReservedByLot(row, currentRow.product_id, consumptionWarehouseId))
        setExpiryLotPickerOpen(true)
      }
    } else if (colName === "unit_price") {
      const unitPrice = value === "" || value === null ? null : Number(value)
      patchItemRow(row, { unit_price: unitPrice, total_price: recalcAmount(itemsRef.current[row]?.quantity ?? null, unitPrice) })
    } else if (colName === "length" || colName === "width" || colName === "height" || colName === "count") {
      const dimensionValue = value === "" || value === null ? null : Number(value)
      const updatedRow = { ...itemsRef.current[row], [colName]: dimensionValue }
      // نوع قياس غير "عادي" (1) يحتسب الكمية تلقائياً من الأبعاد/العدد بدل كتابتها يدوياً — نفس
      // منطق StockInVoucher.js المرجعي (انظر تعليق recalcQuantityFromMeasurement أعلاه).
      const shouldRecalc = Number(updatedRow.measurment_id || 1) !== 1
      const quantity = shouldRecalc ? recalcQuantityFromMeasurement(updatedRow) : updatedRow.quantity
      patchItemRow(row, {
        [colName]: dimensionValue,
        ...(shouldRecalc
          ? { quantity, total_price: recalcAmount(quantity, updatedRow.unit_price ?? null) }
          : {}),
      })
    } else if (colName === "unit") {
      patchItemRow(row, { unit: String(value ?? "") })
    } else if (colName === "batch_number") {
      patchItemRow(row, { batch_number: String(value ?? "") })
    } else if (colName === "expiry_date") {
      // نشط للكتابة المباشرة في سند ادخال بضاعة فقط (isReadOnly في scheme لبقية الأنواع) — لباقي
      // السندات يُملأ هذا الحقل حصراً عبر ItemExpiryDatePicker (اختيار من دفعة قائمة)، فلا يصل هذا
      // الفرع أصلاً لتلك الأنواع.
      if (value === null || value === "") {
        patchItemRow(row, { expiry_date: "" })
        return
      }
      const parsed = value instanceof Date ? value : parseFlexibleDate(String(value))
      if (!parsed || Number.isNaN(parsed.getTime())) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "تاريخ الانتهاء غير صحيح", life: 3000 }])
        patchItemRow(row, { expiry_date: itemsRef.current[row]?.expiry_date || "" })
        return
      }
      const nextExpiryDate = toLocalDateString(parsed)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const enteredDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      // تنبيه Toast فقط لتاريخ أقدم من اليوم — لا يُرفَض الإدخال ولا يُستعاد أي قيمة سابقة (بخلاف
      // تاريخ غير صحيح الصياغة أعلاه الذي يبقى مرفوضاً كلياً)؛ للمستخدم أسبابه أحياناً لإدخال تاريخ
      // ماضٍ (بضاعة سبق انتهاء صلاحيتها فعلياً) فتُترَك القيمة كما كُتبت مع تنبيهه فقط. الشرط
      // `nextExpiryDate !== itemsRef.current[row]?.expiry_date` يمنع تكرار نفس التنبيه إن أعاد
      // Wijmo إطلاق cellEditEnded لخلية لم تتغيّر قيمتها فعلياً (كخلية تحمل تاريخ 1990-01-01
      // الافتراضي عند اختيار الصنف، دون أن يكتب المستخدم عليها شيئاً).
      if (enteredDay.getTime() < today.getTime() && nextExpiryDate !== itemsRef.current[row]?.expiry_date) {
        toast({
          title: "تنبيه",
          description: "تاريخ انتهاء الصلاحية للصنف أقل من تاريخ اليوم",
          variant: "destructive",
        })
      }
      patchItemRow(row, { expiry_date: nextExpiryDate })
    } else if (colName === "note") {
      patchItemRow(row, { note: String(value ?? "") })
    }
  }

  // يمنع بدء تحرير خلية "الكمية" لسطر نوع قياس صنفه غير عادي (تُحتسَب تلقائياً من الأبعاد/العدد،
  // انظر recalcQuantityFromMeasurement) — isReadOnly بمستوى العمود في scheme لا يكفي هنا لأنه ثابت
  // لكل الأسطر، بينما نوع القياس (وبالتالي إمكانية تحرير الكمية يدوياً) قد يختلف سطراً عن آخر بنفس
  // السند. beginningEdit خاصية أصلية من Wijmo FlexGrid تُمرَّر مباشرة عبر DataGridView (بلا معالجة
  // إضافية في DataGridView.js نفسه)، فتصل هنا كما هي.
  const handleBeginningEdit = (grid: any, e: any) => {
    const colName = grid?.columns?.[e.col]?.binding
    const row = itemsRef.current[e.row]
    if (colName === "quantity") {
      if (row && Number(row.measurment_id || 1) !== 1) e.cancel = true
      return
    }
    // أعمدة الأبعاد الأربعة: تُمنَع الكتابة المباشرة إن لم يكن البُعد المُقابِل مطلوباً فعلياً لنوع
    // قياس هذا السطر تحديداً — نفس الشرط المستخدَم لتخطّيها بالتنقّل (Tab/Enter) أعلاه، فتتّسق
    // الحالتان (لا تُتاح الكتابة المباشرة بالنقر بالماوس على عمود لا يصله المؤشّر أصلاً بالتنقّل).
    if (colName === "length" || colName === "width" || colName === "height" || colName === "count") {
      if (!isDimensionFieldRelevant(colName, row)) e.cancel = true
    }
  }

  const handleKeyDown = (grid: any, e: any) => {
    chequeGridRef.current = grid
    if (doHotKeys.current === false) return
    if (!grid || !grid.selection) return
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding

    if (e.keyCode === Util.keyboardKeys.F7) {
      e.preventDefault()
      if (!isLocked) removeItemRow(row)
      return
    }

    if (e.keyCode === Util.keyboardKeys.F10 && colName === "product_code") {
      e.preventDefault()
      grid.finishEditing?.()
      setWarehouseSearchTarget("row")
      pendingFocusRow.current = row
      lastFocusedCellRef.current = { row, col: "product_code" }
      popupHasCalled()
      // مؤجَّل عمداً — انظر التعليق في فرع Tab/Enter أدناه لسبب ذلك.
      setTimeout(() => setProductSearchOpen(true), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "warehouse_name") {
      e.preventDefault()
      grid.finishEditing?.()
      setWarehouseSearchRow(row)
      lastFocusedCellRef.current = { row, col: "warehouse_name" }
      popupHasCalled()
      setTimeout(() => setWarehouseSearchOpen(true), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "unit") {
      e.preventDefault()
      grid.finishEditing?.()
      setUnitsSearchRow(row)
      lastFocusedCellRef.current = { row, col: "unit" }
      popupHasCalled()
      setTimeout(() => setUnitsSearchOpen(true), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "expiry_date" && voucherType === STOCK_IN_VCH_TYPE) {
      e.preventDefault()
      if (isLocked) return
      grid.finishEditing?.()
      setExpiryDateRow(row)
      setExpiryDatePickerOpen(true)
      return
    }

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      // يُلتَقَط قبل finishEditing (الذي يكتب القيمة الجديدة فوقه عبر handleCellEditEnded) — يُستخدَم
      // لاسترجاع كود/باركود الصنف المحمَّل سابقاً على هذا السطر إن فشل بحث القيمة الجديدة.
      const previousRow =
        colName === "product_code" || colName === "barcode" ? itemsRef.current[row] : undefined
      if (colName === "product_code" || colName === "barcode") skipAutoLookupRef.current = true
      grid.finishEditing?.()
      skipAutoLookupRef.current = false
      grid.focus()
      const currentRow = itemsRef.current[row]

      if (colName === "product_code" && !currentRow?.product_code?.trim()) {
        pendingFocusRow.current = row
        lastFocusedCellRef.current = { row, col: "product_code" }
        popupHasCalled()
        // يُؤجَّل فتح النافذة المنبثقة لِتُتاح الفرصة لِـ grid.finishEditing()/focus() أعلاه لإنهاء
        // دورة Wijmo الداخلية أولاً؛ فتحها مباشرةً بنفس اللحظة (نفس الـ tick) كان يسبب تحطماً في
        // مُغلِّف React الخاص بـ Wijmo (قراءة columns من عنصر تحكم لم يُستقر بعد).
        setTimeout(() => setProductSearchOpen(true), 0)
        return
      }

      // رقم الصنف بقيمة: التنقّل ينتظر نتيجة البحث فعلياً (autoAdvanceOnSuccess) بدل الانتقال الفوري
      // كسابقاً — عند النجاح ينتقل للعمود المناسب (كما في handleProductSelect)، وعند الفشل يُمسَح
      // ويبقى المؤشّر عليه (انظر ذيل lookupProductByCode).
      if (colName === "product_code") {
        void lookupProductByCode(row, currentRow?.product_code ?? "", "product_code", true, previousRow)
        return
      }

      // الباركود: فارغ ⇐ انتقال مباشر لرقم الصنف بلا بحث؛ غير فارغ ⇐ نفس منطق رقم الصنف أعلاه
      // (ينتظر نتيجة البحث قبل التنقّل).
      if (colName === "barcode") {
        const rawBarcode = String(currentRow?.barcode ?? "").trim()
        if (!rawBarcode) {
          selectCell(grid, row, "product_code")
          return
        }
        void lookupProductByCode(row, rawBarcode, "barcode", true, previousRow)
        return
      }

      const currentFieldIndex = fieldOrder.indexOf(colName)
      if (currentFieldIndex === -1) return

      // يتخطّى أعمدة الأبعاد غير ذات الصلة بنوع قياس هذا السطر تحديداً (measurment_id) — المؤشّر
      // "لا يصل" إليها إطلاقاً بدل التوقف عندها ثم منع التحرير فقط (beginningEdit أدناه يمنع
      // التحرير المباشر بالنقر أيضاً، لكن هذا يمنع حتى الوصول عبر Tab/Enter كما طُلِب).
      const nextFieldIndex = findNextRelevantFieldIndex(currentFieldIndex + 1, currentRow)
      if (nextFieldIndex === -1) {
        const isLastRow = row === itemsRef.current.length - 1
        if (isLastRow && currentRow?.product_id && Number(currentRow?.quantity || 0) > 0) {
          pendingFocusRef.current = { row: row + 1, col: "product_code" }
          addItemRow()
          return
        }
        selectCell(grid, row + 1 <= itemsRef.current.length - 1 ? row + 1 : row, "product_code")
        return
      }

      selectCell(grid, row, fieldOrder[nextFieldIndex])
    }
  }

  const pendingFocusRow = useRef<number | null>(null)

  // يضمن اكتمال جلب قائمة الحسابات قبل أول استخدام لها (بحث/تعبئة تلقائية) — نفس نمط
  // ensureAccountsLoaded في unified-journal.tsx. تُجلَب فقط لسند الاستعمال (isUseVoucher) لأنها
  // الوحيدة التي تستخدم تبويب "تفاصيل حسابات الاصناف".
  const ensureAccountsLoaded = (): Promise<AccountItem[]> => {
    if (accountsListRef.current.length > 0) return Promise.resolve(accountsListRef.current)
    if (!accountsFetchRef.current) {
      accountsFetchRef.current = fetch("/api/accounts")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const mapped = Array.isArray(data) ? data.map(mapAccount) : []
          accountsListRef.current = mapped
          setAccountsList(mapped)
          return mapped
        })
        .catch(() => {
          accountsListRef.current = []
          setAccountsList([])
          return []
        })
    }
    return accountsFetchRef.current
  }

  // حسابات الأصناف الافتراضية (تبويب "الحسابات الافتراضية للاصناف" في إعدادات النظام) — تُستخدَم
  // فقط عندما لا يحمل الصنف المُختار حساب مصروف/مشتريات خاصاً به.
  const ensureDefaultItemAccountsLoaded = (): Promise<{ purchase: number | null; expense: number | null }> => {
    if (defaultItemAccountsRef.current) return Promise.resolve(defaultItemAccountsRef.current)
    if (!defaultItemAccountsFetchRef.current) {
      defaultItemAccountsFetchRef.current = fetch("/api/settings/system")
        .then((r) => (r.ok ? r.json() : {}))
        .then((settings: any) => {
          const resolved = {
            purchase: settings?.default_purchase_account_id ? Number(settings.default_purchase_account_id) : null,
            expense: settings?.default_lsti3mal_account_id ? Number(settings.default_lsti3mal_account_id) : null,
          }
          defaultItemAccountsRef.current = resolved
          return resolved
        })
        .catch(() => {
          const resolved = { purchase: null, expense: null }
          defaultItemAccountsRef.current = resolved
          return resolved
        })
    }
    return defaultItemAccountsFetchRef.current
  }

  // حساب المصروف/المشتريات الافتراضيان لصنف سند الاستعمال عند اختياره: حساب الصنف نفسه
  // (products.lsti3mal_account_id لحساب المصروف، products.purchase_account_id لحساب المشتريات)
  // أولاً، وإلا الحساب الافتراضي العام من إعدادات النظام — مطابق لطلب المستخدم صراحةً. لا شيء
  // لغير سند الاستعمال (الحقلان غير مستخدَمين أصلاً لبقية الأنواع).
  const resolveAccountDefaults = async (
    product: any,
  ): Promise<{ purchase: { id: number; code: string; name: string } | null; expense: { id: number; code: string; name: string } | null }> => {
    if (!isUseVoucher) return { purchase: null, expense: null }
    const [accounts, defaults] = await Promise.all([ensureAccountsLoaded(), ensureDefaultItemAccountsLoaded()])
    const resolve = (id: number | null): { id: number; code: string; name: string } | null => {
      if (!id) return null
      const account = accounts.find((a) => a.id === id)
      return account ? { id: account.id, code: account.code, name: account.name } : { id, code: "", name: "" }
    }
    const purchaseId = Number(product?.purchase_account_id) > 0 ? Number(product.purchase_account_id) : defaults.purchase
    const expenseId = Number(product?.lsti3mal_account_id) > 0 ? Number(product.lsti3mal_account_id) : defaults.expense
    return { purchase: resolve(purchaseId), expense: resolve(expenseId) }
  }

  const openItemCostCenter = (index: number, field: "expense" | "purchase") => {
    if (isLocked) return
    const row = itemsRef.current[index]
    const accountId = field === "expense" ? row?.expense_account_id : row?.purchase_account_id
    if (!accountId) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد الحساب أولاً", life: 3000 }])
      return
    }
    const account = accountsListRef.current.find((a) => a.id === accountId) || null
    lastAccountsFocusedCellRef.current = { row: index, col: field === "purchase" ? "btnCostCenterPurchase" : "btnCostCenterExpense" }
    popupHasCalled()
    setItemCostCenterAccount(account)
    setItemCostCenterField(field)
    setItemCostCenterOpen(true)
    setItemCostCenterRow(index)
  }

  // مستودع الصنف الافتراضي عند اختياره في السند: مستودع الصنف نفسه (products.default_store)
  // → المستودع الافتراضي للمستخدم (defaultItemWarehouseId) → أول مستودع في النظام.
  // يُعيد null صراحةً عند تعذّر إيجاد أي مرشّح (بدل كائن "أجوَف" {id:null}) حتى يُفرَّق بوضوح
  // في نقاط الاستدعاء بين "لا يوجد مستودع افتراضي على الإطلاق" و"تم إيجاد مستودع".
  const resolveDefaultWarehouse = (product: any): { id: number; name: string } | null => {
    const currentWarehouses = warehousesRef.current
    const productWarehouseId = product?.default_store ? Number(product.default_store) : null
    const candidateId = productWarehouseId || (defaultItemWarehouseIdRef.current ? Number(defaultItemWarehouseIdRef.current) : null)
    if (candidateId) {
      const match = currentWarehouses.find((w) => Number(w.id) === candidateId)
      if (match) return { id: match.id, name: match.warehouse_name }
      return { id: candidateId, name: "" }
    }
    const first = currentWarehouses[0]
    return first ? { id: first.id, name: first.warehouse_name } : null
  }

  // المستودع الذي يُحتسَب منه "المتاح" عند اختيار دفعة/تاريخ صلاحية لكمية خارجة — يختلف حسب نوع
  // السند: سند استعمال وسند اخراج بضاعة يستهلكان من مستودع كل سطر (عمود المستودع الخاص بكل منهما،
  // showRowWarehouseColumn)، أما الإرسالية الداخلية فتستهلك من "من مستودع" تحديداً (وليس "الى
  // مستودع" الذي هو وجهة النقل لا مصدره).
  const resolveConsumptionWarehouseId = (row: any): number | null => {
    if (isInternalDelivery) return formRef.current.from_store_id ? Number(formRef.current.from_store_id) : null
    return row?.warehouse_id ? Number(row.warehouse_id) : null
  }

  const resolveConsumptionWarehouseName = (row: any): string => {
    if (isInternalDelivery) return warehousesRef.current.find((w) => w.id === formRef.current.from_store_id)?.warehouse_name || ""
    return row?.warehouse_name || ""
  }

  // كمية نفس الصنف/المستودع "المحجوزة" فعلياً بسطور أخرى غير محفوظة بعد بنفس شبكة السند (سطر ثانٍ
  // للصنف نفسه أُضيف يدوياً، أو سطور إضافية ناتجة عن applyExpiryAllocations لصنف آخر يشارك نفس
  // الدفعة/تاريخ الصلاحية) — يجب طرحها من "المتاح" المُحتسَب من قاعدة البيانات في ItemExpiryDatePicker
  // وإلا يرى المستخدم نفس الكمية الكاملة متاحة لكل سطر رغم أن سطراً سابقاً استهلك منها بالفعل. تُحوَّل
  // كمية كل سطر آخر للوحدة الرئيسية بمعامل تحويل ذلك السطر (وحدته قد تختلف عن وحدة السطر الحالي)،
  // وتُجمَّع لكل مجموعة (رقم تشغيلي، تاريخ صلاحية) على حِدة.
  const computeReservedByLot = (excludeRow: number, productId: number, warehouseId: number): Record<string, number> => {
    const reserved: Record<string, number> = {}
    itemsRef.current.forEach((row, idx) => {
      if (idx === excludeRow) return
      if (row.product_id !== productId) return
      if (resolveConsumptionWarehouseId(row) !== warehouseId) return
      const rowToMainQty = row.units?.find((u) => u.unit_name === row.unit)?.to_main_qnty ?? 1
      const mainQty = Number(row.quantity || 0) * rowToMainQty
      if (mainQty <= 0) return
      const key = `${row.batch_number || ""}||${row.expiry_date ? row.expiry_date.slice(0, 10) : ""}`
      reserved[key] = (reserved[key] || 0) + mainQty
    })
    return reserved
  }

  const handleProductSelect = async (products: any[]) => {
    const product = products?.[0]
    setProductSearchOpen(false)
    popupHasClosed()
    if (!product) {
      restoreGridFocus(lastFocusedCellRef.current)
      return
    }
    const row = pendingFocusRow.current ?? itemsRef.current.length - 1
    const unit = product.units?.[0]
    const currentRow = itemsRef.current[row]
    const warehousePatch = resolveDefaultWarehouse(product)
    const { hasExpiry, hasBatch } = resolveBatchExpiryFlags(product)
    const { purchase, expense } = await resolveAccountDefaults(product)
    if (!isMountedRef.current) return
    patchItemRow(row, {
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      barcode: product.barcode || product.first_barcode || "",
      unit: unit?.unit_name || product.first_unit || "",
      unit_price: unit?.price ?? product.first_price ?? 0,
      total_price: recalcAmount(itemsRef.current[row]?.quantity ?? 0, unit?.price ?? product.first_price ?? 0),
      units: normalizeUnits(product.units),
      has_expiry: hasExpiry,
      has_batch: hasBatch,
      // نوع القياس وأبعاد الصنف الافتراضية (لحالتَي 9/10 في recalcQuantityFromMeasurement) —
      // العدد يُصفَّر لـ1 دوماً عند اختيار صنف مطابقاً لِـfillItemInfo المرجعي.
      measurment_id: product.measurment_id != null ? Number(product.measurment_id) : 1,
      product_length: product.length != null ? Number(product.length) : null,
      product_width: product.width != null ? Number(product.width) : null,
      product_density: product.density != null ? Number(product.density) : null,
      count: 1,
      ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
      ...(hasExpiry && !currentRow?.expiry_date ? { expiry_date: DEFAULT_EXPIRY_DATE } : {}),
      ...(purchase
        ? { purchase_account_id: purchase.id, purchase_account_code: purchase.code, purchase_account_name: purchase.name }
        : {}),
      ...(expense ? { expense_account_id: expense.id, expense_account_code: expense.code, expense_account_name: expense.name } : {}),
    })
    // الوجهة التالية بعد اختيار صنف تعتمد على نوع قياسه: عادي (1) ⇐ الكمية كالمعتاد، غير ذلك ⇐ أول
    // عمود بُعد يحتاجه فعلياً (بترتيب طول←عرض←ارتفاع←عدد، متخطّياً غير المطلوب منها) — نفس منطق
    // findNextRelevantFieldIndex المستخدَم بتنقّل Tab/Enter، مطبَّقاً هنا لحظة اختيار الصنف مباشرة.
    const nextFieldIndex = findNextRelevantFieldIndex(fieldOrder.indexOf("product_code") + 1, itemsRef.current[row])
    pendingFocusRef.current = { row, col: nextFieldIndex === -1 ? "quantity" : fieldOrder[nextFieldIndex] }
  }

  const handleWarehouseSelect = (store: WarehouseOption) => {
    setWarehouseSearchOpen(false)
    popupHasClosed()
    if (warehouseSearchTarget === "from_store") {
      onFormChange("from_store_id", store.id)
      return
    }
    if (warehouseSearchTarget === "to_store") {
      onFormChange("to_store_id", store.id)
      return
    }
    if (warehouseSearchRow === null) {
      restoreGridFocus(lastFocusedCellRef.current)
      return
    }
    patchItemRow(warehouseSearchRow, { warehouse_id: store.id, warehouse_name: store.warehouse_name })
    pendingFocusRef.current = { row: warehouseSearchRow, col: "unit" }
  }

  const handleUnitSelect = ({ selected_unit }: { product: { name: string }; selected_unit: NonNullable<VoucherItemRow["units"]>[number] }) => {
    setUnitsSearchOpen(false)
    popupHasClosed()
    if (unitsSearchRow === null) {
      restoreGridFocus(lastFocusedCellRef.current)
      return
    }
    const currentRow = itemsRef.current[unitsSearchRow]
    patchItemRow(unitsSearchRow, {
      unit: selected_unit.unit_name,
      unit_price: selected_unit.price,
      total_price: recalcAmount(currentRow?.quantity ?? 0, selected_unit.price),
    })
    pendingFocusRef.current = { row: unitsSearchRow, col: "quantity" }
  }

  // تُظهِر عمود بُعد بعينه (طول/عرض/ارتفاع/عدد) تلقائياً حتى لو كان مخفياً بإعدادات السند (الشرط
  // الأول) إن كان أي صنف مُدرَج فعلياً بالسند يحتاجه فعلياً بحسب نوع قياسه (الشرط الثاني) — وإلا
  // يبقى صنف بنوع قياس غير عادي غير قادر على إدخال أبعاده أصلاً لمجرد أن الإعداد العام معطَّل.
  const showLengthColumn =
    Util.getVoucherSettingScreenData(voucherType, "length") || items.some((i) => measurementRequiresLength(Number(i.measurment_id || 1)))
  const showWidthColumn =
    Util.getVoucherSettingScreenData(voucherType, "width") || items.some((i) => measurementRequiresWidth(Number(i.measurment_id || 1)))
  const showHeightColumn =
    Util.getVoucherSettingScreenData(voucherType, "height") || items.some((i) => measurementRequiresHeight(Number(i.measurment_id || 1)))
  const showCountColumn =
    Util.getVoucherSettingScreenData(voucherType, "count") || items.some((i) => measurementRequiresCount(Number(i.measurment_id || 1)))
  // نفس سبب formRef/warehousesRef: تُقرَأ هذه القيم من handleBeginningEdit/handleKeyDown المربوطين
  // بخاصيتَي beginningEdit/onKeyDown لِـWijmo — إن لم تُعِد الشبكة ربطهما عند كل تحديث (كما ثبت
  // فعلياً مع cellEditEnded سابقاً بهذا الملف)، يبقى الإغلاق الخاص بهما محتفظاً بقيم showXColumn كما
  // كانت عند أول تركيب (غالباً بلا أي صنف مُدرَج بعد)، فتُحسَب أعمدة الأبعاد دوماً "غير مرئية" ولو
  // اختير صنف يحتاجها فعلياً بعد ذلك — تظهر المشكلة كأن العمود "للقراءة فقط دوماً" رغم صحة الشرط
  // البرمجي نفسه. .current يضمن قراءة أحدث قيمة دوماً بصرف النظر عن توقيت آخر إعادة ربط فعلية.
  const showLengthColumnRef = useRef(showLengthColumn)
  showLengthColumnRef.current = showLengthColumn
  const showWidthColumnRef = useRef(showWidthColumn)
  showWidthColumnRef.current = showWidthColumn
  const showHeightColumnRef = useRef(showHeightColumn)
  showHeightColumnRef.current = showHeightColumn
  const showCountColumnRef = useRef(showCountColumn)
  showCountColumnRef.current = showCountColumn

  // يحدّد هل يستحق حقل بعينه من fieldOrder التوقف عنده أثناء تنقّل Tab/Enter (وأيضاً أثناء إسناد
  // الوجهة الأولى بعد اختيار صنف أدناه) — أعمدة الأبعاد الأربعة فقط مشروطة (يجب أن تكون مرئية أصلاً
  // وأن يحتاجها نوع قياس هذا السطر تحديداً)، أي حقل آخر (product_code/quantity/unit_price/...)
  // يبقى محطة توقف دائماً. مطابق لِـgetFocus في StockInVoucher.js المرجعي من حيث الفكرة (تخطّي
  // أبعاد لا يحتاجها نوع القياس الحالي) لكن مُشتقّاً آلياً من نفس دوال measurementRequires* المستخدَمة
  // بالتحقق أعلاه، بدل جدول حالات يدوي منفصل قد يتعارض معها في حالات هامشية (كـ"محيط"/"اعمال زجاج").
  const isDimensionFieldRelevant = (fieldName: string, row: VoucherItemRow | undefined): boolean => {
    const measurmentId = Number(row?.measurment_id || 1)
    switch (fieldName) {
      case "length":
        return showLengthColumnRef.current && measurementRequiresLength(measurmentId)
      case "width":
        return showWidthColumnRef.current && measurementRequiresWidth(measurmentId)
      case "height":
        return showHeightColumnRef.current && measurementRequiresHeight(measurmentId)
      case "count":
        return showCountColumnRef.current && measurementRequiresCount(measurmentId)
      default:
        return true
    }
  }

  // أول فهرس في fieldOrder ابتداءً من startIndex يستحق التوقف عنده لهذا السطر — أو -1 إن لم يبقَ
  // شيء (نهاية الصف، ينتقل عندها الاستدعاء لمنطق "آخر عمود" المعتاد: صف جديد/product_code بالصف
  // التالي).
  const findNextRelevantFieldIndex = (startIndex: number, row: VoucherItemRow | undefined): number => {
    for (let i = startIndex; i < fieldOrder.length; i++) {
      if (isDimensionFieldRelevant(fieldOrder[i], row)) return i
    }
    return -1
  }

  const scheme = useMemo(
    () => ({
      name: "StockVoucherItemsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number", visible: Util.getVoucherSettingScreenData(voucherType, "ser") },
        {
          header: "الباركود",
          name: "barcode",
          width: 120,
          // قابل للكتابة المباشرة (مسح ضوئي أو كتابة يدوية) — يجلب الصنف تلقائياً عبر
          // lookupProductByCode (نفس مسار "رقم الصنف"، ونفس نقطة API التي تبحث بالكود أولاً ثم
          // بالباركود احتياطياً)، مطابقاً لعمود الباركود في unified-sales-order.tsx. يُملأ أيضاً
          // تلقائياً عند اختيار الصنف عبر رقمه/نافذة البحث (products.barcode/first_barcode).
          visible: Util.getVoucherSettingScreenData(voucherType, "barcode"),
        },
        { header: "رقم الصنف", name: "product_code", width: 120, visible: Util.getVoucherSettingScreenData(voucherType, "code") },
        {
          header: " ",
          name: "btnSearchProduct",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "",
          iconType: "search",
          className: "",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            pendingFocusRow.current = ctx.row.index
            lastFocusedCellRef.current = { row: ctx.row.index, col: "product_code" }
            popupHasCalled()
            // مؤجَّل عمداً — النقر قد يقع أثناء تحرير خلية أخرى نشطة (تُنهى editها أولاً)، وفتح
            // النافذة مباشرةً بنفس اللحظة تسبَّب سابقاً بتحطّم في مُغلِّف React الخاص بـ Wijmo.
            setTimeout(() => setProductSearchOpen(true), 0)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "code"),
          visibleInColumnChooser: true,
        },
        
        { header: "اسم الصنف", name: "product_name", width: "*", minWidth: 180, isReadOnly: true },
        // عمود "المستودع" بالسطر مرئي لسند الاستعمال وسند ادخال بضاعة (showRowWarehouseColumn) —
        // أصناف هذين النوعين قد تدخل/تُصرف من مستودعات مختلفة لكل سطر، بخلاف اخراج البضاعة
        // والإرسالية الداخلية التي تختار مستودعاً واحداً من رأس السند (المستودع/من والى مستودع)
        // يُشتقّ منه warehouse_id لكل سطر تلقائياً عند الحفظ (انظر saveVoucher في stock-vouchers.tsx).
        {
          header: "المستودع",
          name: "warehouse_name",
          width: 140,
          // للقراءة فقط مثل اسم الصنف — يُملأ تلقائياً عند اختيار الصنف (resolveDefaultWarehouse) أو
          // عبر زر البحث (btnSearchWarehouse) حصراً، لا بالكتابة المباشرة (كتابة نص حر قد لا يطابق
          // أي مستودع فعلي في النظام، فلا يُشتقّ منه warehouse_id صحيح).
          isReadOnly: true,
          visible: showRowWarehouseColumn && Util.getVoucherSettingScreenData(voucherType, "store"),
        },
        {
          header: " ",
          name: "btnSearchWarehouse",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "",
          iconType: "search",
          className: "",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setWarehouseSearchTarget("row")
            setWarehouseSearchRow(ctx.row.index)
            lastFocusedCellRef.current = { row: ctx.row.index, col: "warehouse_name" }
            popupHasCalled()
            setTimeout(() => setWarehouseSearchOpen(true), 0)
          },
          visible: showRowWarehouseColumn && Util.getVoucherSettingScreenData(voucherType, "store"),
          visibleInColumnChooser: true,
        },
        {
          header: "الوحدة",
          name: "unit",
          width: 90,
          // للقراءة فقط مثل المستودع/اسم الصنف — تُملأ تلقائياً عند اختيار الصنف أو عبر زر البحث
          // (btnSearchUnits) حصراً، لا بالكتابة المباشرة (نص حر قد لا يطابق أي وحدة فعلية للصنف).
          isReadOnly: true,
          visible: Util.getVoucherSettingScreenData(voucherType, "unit"),
        },
        {
          header: " ",
          name: "btnSearchUnits",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "",
          iconType: "search",
          className: "",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setUnitsSearchRow(ctx.row.index)
            lastFocusedCellRef.current = { row: ctx.row.index, col: "unit" }
            popupHasCalled()
            setTimeout(() => setUnitsSearchOpen(true), 0)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "unit"),
          visibleInColumnChooser: true,
        },
        { header: "الطول", name: "length", width: 90, dataType: "Number", visible: showLengthColumn },
        { header: "العرض", name: "width", width: 90, dataType: "Number", visible: showWidthColumn },
        { header: "الارتفاع", name: "height", width: 90, dataType: "Number", visible: showHeightColumn },
        { header: "العدد", name: "count", width: 90, dataType: "Number", visible: showCountColumn },
        {
          header: "الكمية",
          name: "quantity",
          width: 100,
          dataType: "Number",
          // للقراءة فقط لنوع قياس غير عادي — تُحتسَب تلقائياً من الأبعاد/العدد (recalcQuantityFromMeasurement)
          // بدل كتابتها يدوياً؛ المنع الفعلي بمستوى الخلية عبر beginningEdit أدناه (isReadOnly هنا
          // خاصية عمود ثابتة لا تفرّق بين الأسطر، فلا تكفي وحدها إذ قد تختلف أنواع القياس بين أسطر
          // نفس السند).
        },
        { header: "السعر", name: "unit_price", width: 100, dataType: "Number", visible: Util.getVoucherSettingScreenData(voucherType, "price") },
        { header: "المبلغ", name: "total_price", width: 110, dataType: "Number", isReadOnly: true },
        {
          header: "الرقم التشغيلي",
          name: "batch_number",
          width: 110,
          // نشط للكتابة المباشرة في سند ادخال بضاعة فقط (دفعة جديدة تُكتب يدوياً) — بقية أنواع
          // سندات الحركة (بما فيها الارسالية الداخلية) تستهلك من مخزون قائم فتُملأ هذه الخانة حصراً
          // عبر ItemExpiryDatePicker، فتبقى للعرض فقط هناك — نفس معاملة عمود expiry_date تماماً.
          isReadOnly: voucherType !== STOCK_IN_VCH_TYPE,
          visible: Util.getVoucherSettingScreenData(voucherType, "batch"),
        },
        {
          header: "تاريخ الانتهاء",
          name: "expiry_date",
          width: 130,
          // عمداً بلا dataType:"Date"/format هنا — Wijmo يُحوِّل أي نص مكتوب في خلية كهذه عبر
          // Globalize.parseDate(نص, "MM/dd/yyyy") عند إنهاء التحرير، وهذا يتعارض مع صيغ الإدخال التي
          // نقبلها نحن (YYYY-MM-DD وDD-MM-YYYY بفواصل -/./ متعددة، مُفسَّرة بترتيب محلي)؛ لتاريخ
          // بفاصل "/" وأرقام ≤ 12 كليهما (كـ05/03/2026) يَنجح تحويل Wijmo الخاص بصمت لكن بترتيب شهر/
          // يوم معكوس (Globalize يُفسِّره MM/dd لا DD/MM)، فيصل لِـhandleCellEditEnded ككائن Date
          // خاطئ جاهز قبل أن تُتاح لِـparseFlexibleDate أدناه فرصة تفسيره بصيغتنا الصحيحة أصلاً.
          // إبقاء العمود نصياً بحتاً يُلغي أي تدخّل من محرّك Globalize لِـWijmo كلياً، فتبقى السيطرة
          // الكاملة على التحليل والتحقق والصيغة النهائية المعروضة (YYYY-MM-DD، غير قابلة للَبس) بيدنا.
          // نشط للكتابة المباشرة في سند ادخال بضاعة فقط — بقية أنواع سندات الحركة تستهلك من مخزون
          // قائم فتُملأ هذه الخانة حصراً عبر ItemExpiryDatePicker (اختيار دفعة عند إدخال الكمية)،
          // فتبقى للعرض فقط هناك (تُظهر ما اختاره المستخدم بالفعل، بلا تعديل يدوي مباشر).
          isReadOnly: voucherType !== STOCK_IN_VCH_TYPE,
          visible: !isInternalDelivery && Util.getVoucherSettingScreenData(voucherType, "expiry_date"),
        },
        {
          name: "btnExpiryDate",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "calendar",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setExpiryDateRow(ctx.row.index)
            setExpiryDatePickerOpen(true)
          },
          // زر التقويم أيضاً حصراً لسند ادخال بضاعة — لبقية الأنواع لا معنى لاختيار تاريخ يدوياً
          // بمعزل عن دفعة فعلية متوفرة في المخزون (ItemExpiryDatePicker هو المصدر الوحيد لها).
          visible: voucherType === STOCK_IN_VCH_TYPE && !isInternalDelivery && Util.getVoucherSettingScreenData(voucherType, "expiry_date"),
          visibleInColumnChooser: true,
        },
        { header: "ملاحظة", name: "note", width: 140 },
        {
          header: " ",
          name: "btnDelete",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "",
          iconType: "delete",
          className: "danger",
          isReadOnly: true,
          visible: !isLocked,
          visibleInColumnChooser: true,
          onClick: (e: any, ctx: any) => removeItemRow(ctx.row.index),
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [isLocked, isInternalDelivery, voucherType, showLengthColumn, showWidthColumn, showHeightColumn, showCountColumn],
  )

  // شبكة تبويب "تفاصيل حسابات الاصناف" (سند الاستعمال فقط) — تُبنى من نفس itemsCollectionView
  // (نفس الأسطر بنفس الترتيب/الفهرسة الفعلية بالضبط كشبكة الاصناف الرئيسية)؛ محمول Wijmo يدعم
  // ربط أكثر من FlexGrid بنفس الـCollectionView دون تعارض.
  const accountsScheme = useMemo(
    () => ({
      name: "UseVoucherAccountsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number" },
        { header: "رقم الصنف", name: "product_code", width: 110, isReadOnly: true },
        { header: "اسم الصنف", name: "product_name", width: "*", minWidth: 160, isReadOnly: true },
        { header: "رقم حساب المشتريات", name: "purchase_account_code", width: 130, isReadOnly: true },
        { header: "حساب المشتريات", name: "purchase_account_name", width: 160, isReadOnly: true },
        {
          name: "btnSearchPurchase",
          header: " ",
          width: 55,
          buttonBody: "button",
          align: "center",
          title: "بحث عن حساب",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            if (!itemsRef.current[ctx.row.index]?.product_id) return
            lastAccountsFocusedCellRef.current = { row: ctx.row.index, col: "btnSearchPurchase" }
            popupHasCalled()
            setItemAccountsSearchField("purchase")
            setItemAccountsSearchRow(ctx.row.index)
            setItemAccountsSearchOpen(true)
          },
          visible: true,
        },
        {
          name: "btnCostCenterPurchase",
          header: "مراكز التكلفة",
          width: 100,
          buttonBody: "button",
          align: "center",
          title: "مراكز التكلفة",
          iconType: "money",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => openItemCostCenter(ctx.row.index, "purchase"),
          visible: true,
        },
        { header: "رقم حساب المصروف", name: "expense_account_code", width: 130, isReadOnly: true },
        { header: "حساب المصروف", name: "expense_account_name", width: 160, isReadOnly: true },
        {
          name: "btnSearchExpense",
          header: " ",
          width: 55,
          buttonBody: "button",
          align: "center",
          title: "بحث عن حساب",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            if (!itemsRef.current[ctx.row.index]?.product_id) return
            lastAccountsFocusedCellRef.current = { row: ctx.row.index, col: "btnSearchExpense" }
            popupHasCalled()
            setItemAccountsSearchField("expense")
            setItemAccountsSearchRow(ctx.row.index)
            setItemAccountsSearchOpen(true)
          },
          visible: true,
        },
        {
          name: "btnCostCenterExpense",
          header: "مراكز التكلفة",
          width: 100,
          buttonBody: "button",
          align: "center",
          title: "مراكز التكلفة",
          iconType: "money",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => openItemCostCenter(ctx.row.index, "expense"),
          visible: true,
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [isLocked],
  )

  // يضبط عملة/سعر صرف السند فعلياً (دون أي سؤال) — 1 لعملة الأساس، وإلا آخر سعر بتاريخ <= تاريخ
  // السند من exchange_rates. يُعيد سعر الصرف الجديد لاستخدامه في إعادة احتساب أسعار الأصناف.
  const applyCurrencyChange = async (newCurrencyId: number | null): Promise<number> => {
    onFormChange("currency_id", newCurrencyId)
    if (!newCurrencyId || newCurrencyId === baseCurrencyId) {
      onFormChange("rate", 1)
      return 1
    }
    try {
      const query = new URLSearchParams({
        currency_id: String(newCurrencyId),
        date: form.vch_date ? form.vch_date.slice(0, 10) : "",
      })
      const response = await fetch(`/api/exchange-rates/lookup?${query.toString()}`)
      const data = response.ok ? await response.json() : null
      const rate = data?.rate ?? 1
      onFormChange("rate", rate)
      return rate
    } catch (error) {
      console.error("Failed to fetch exchange rate", error)
      onFormChange("rate", 1)
      return 1
    }
  }

  // يُعيد قياس سعر كل صنف تناسبياً مع نسبة سعر الصرف القديم للجديد (price * oldRate / newRate) —
  // نفس معادلة onCurrencyChanged في StockInVoucher.js القديم.
  const rescaleItemPricesForRate = (oldRate: number, newRate: number) => {
    if (!newRate || newRate === oldRate) return
    const next = itemsRef.current.map((row) => {
      if (!row.product_id) return row
      // مبقاة بدقة أعلى (6 خانات) بدل خانتين — تقريب كل صنف لخانتين عند كل تبديل عملة يراكم
      // انحرافاً ملحوظاً عند التنقل ذهاباً وإياباً بين عملتين (مثال: 547 ← دولار ← شيكل تعود 547.01
      // بدل 547 بالضبط)، لأن كل تقريب يُبنى على نتيجة التقريب السابق لا على السعر الأصلي.
      const newPrice = Math.round((((Number(row.unit_price) || 0) * oldRate) / newRate) * 1e6) / 1e6
      return { ...row, unit_price: newPrice, total_price: recalcAmount(row.quantity, newPrice) }
    })
    itemsRef.current = next
    onItemsChange(next)
  }

  // عند تغيير عملة السند: إن وُجد صنف واحد مُدخَل فعلاً في الشبكة تُعرض أولاً رسالة تسأل إن كان
  // يجب إعادة احتساب أسعار الأصناف تناسبياً مع سعر الصرف الجديد قبل تطبيق التغيير فعلياً — نفس
  // منطق onCurrencyChanged في StockInVoucher.js القديم. لا يوجد أصناف بعد → يُطبَّق التغيير مباشرة.
  const handleCurrencyChange = async (newCurrencyId: number | null) => {
    if (newCurrencyId === form.currency_id) return
    const hasItems = itemsRef.current.some((row) => row.product_id)
    if (!hasItems) {
      await applyCurrencyChange(newCurrencyId)
      return
    }
    pendingCurrencyIdRef.current = newCurrencyId
    setShowCurrencyRecalcConfirm(true)
  }

  // يُصفِّر سعر كل صنف (بلا طلب شبكة) — اختيار "يدوي" يعني أن المستخدم سيُدخل الأسعار بنفسه.
  const applyManualZeroPrices = () => {
    const next = itemsRef.current.map((row) => {
      if (!row.product_id) return row
      return { ...row, unit_price: 0, total_price: recalcAmount(row.quantity, 0) }
    })
    itemsRef.current = next
    onItemsChange(next)
  }

  // يجلب سعر كل صنف من فئة السعر المختارة عبر endpoint جماعي، ويستبدل به سعر كل سطر — نظير
  // PricingWay/ItemsRecalculateWay في StockInVoucher.js القديم. فئة السعر قد تكون صفاً حقيقياً من
  // جدول pricecategory (معرّف موجب) أو إحدى الفئات الخاصة (معرّف سالب): -2 يدوي (يُصفَّر محلياً دون
  // وصول هذه الدالة إطلاقاً)، -3/-4/-5 مُحسَّبة من دفعات المخزون/تاريخ الشراء عبر الـ endpoint
  // نفسه، -1 (سعر الإنتاج) مُعطَّلة في القائمة أصلاً (SPECIAL_PRICE_CATEGORIES) فلا تصل هنا.
  const recalcPricesFromCategory = async () => {
    const rows = itemsRef.current.filter((row) => row.product_id)
    if (!priceCategoryId || rows.length === 0) return
    if (priceCategoryId === -2) {
      applyManualZeroPrices()
      return
    }
    try {
      const response = await fetch("/api/inventory/products/prices-by-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_category_id: priceCategoryId,
          items: rows.map((row) => ({ product_id: row.product_id, unit_name: row.unit })),
        }),
      })
      if (!response.ok) return
      const data = await response.json()
      const results: { price: number }[] = Array.isArray(data?.results) ? data.results : []
      let resultIndex = 0
      const next = itemsRef.current.map((row) => {
        if (!row.product_id) return row
        const price = Number(results[resultIndex]?.price || 0)
        resultIndex++
        return { ...row, unit_price: price, total_price: recalcAmount(row.quantity, price) }
      })
      itemsRef.current = next
      onItemsChange(next)
    } catch (error) {
      console.error("Failed to recalculate prices by category", error)
    }
  }

  const handleRecalcPricesClick = () => {
    if (!priceCategoryId || !itemsRef.current.some((row) => row.product_id)) return
    setShowPriceRecalcConfirm(true)
  }

  // يتحقق من صحة السند قبل عرض نافذة "كيف تريد الحفظ؟" — مطابق لِـ unified-receipt-voucher.tsx.
  const handleRequestSave = () => {
    if (isLocked) return
    const error = onValidateSave?.()
    if (error) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: error, sticky: false, life: 4000 }])
      return
    }
    setPostDialogOpen(true)
  }
  handleRequestSaveRef.current = handleRequestSave

  // نفس منطق unified-receipt-voucher.tsx: Enter خارج الشبكة يتصرف كـ Tab وينتقل للحقل التالي،
  // بدل إرسال/تفعيل السلوك الافتراضي للمتصفح على النموذج.
  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    if (target.closest(".wj-flexgrid")) return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null && !el.closest(".wj-flexgrid"))

    const currentIndex = focusable.indexOf(target)
    if (currentIndex === -1) return
    event.preventDefault()
    focusable[currentIndex + 1]?.focus()
  }

  // مُشترَك بين فرعَي "ارسالية داخلية" وبقية الأنواع (كان سابقاً محصوراً بفرع العميل فقط، فيختفي
  // للإرسالية الداخلية التي لا تملك حقل عميل أصلاً).
  const priceCategoryBlock = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid flex-1 gap-1.5 invoice-currency-dropdown-wrap">
        <Label>فئة السعر</Label>
        <PrimeDropdown
          value={priceCategoryId}
          options={combinedPriceCategories}
          optionLabel="name"
          optionValue="id"
          optionDisabled="disabled"
          placeholder="اختر فئة السعر"
          filter
          disabled={isLocked}
          className="invoice-currency-dropdown w-full"
          panelClassName="invoice-currency-dropdown-panel"
          appendTo="self"
          panelStyle={{ zIndex: 10000 }}
          onChange={(e: any) => setPriceCategoryId(e.value ?? null)}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={isLocked || !priceCategoryId}
        onClick={handleRecalcPricesClick}
        className="flex items-center gap-2"
      >
        <RefreshCw className="h-4 w-4" />
        إعادة إحتساب الأسعار
      </Button>
    </div>
  )

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}>
      <DialogContent
        className="stock-voucher-form flex h-[96vh] w-[97vw] max-w-[1500px] max-h-[96vh] flex-col overflow-hidden p-0"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <UniversalToolbar
          currentRecord={currentIndex + 1}
          totalRecords={totalRecords}
          onNew={() => guardedAction(() => onNew?.())}
          onSave={handleRequestSave}
          onDelete={() => setShowDeleteConfirm(true)}
          onFirst={() => guardedAction(() => onNavigate?.("first"))}
          onPrevious={() => guardedAction(() => onNavigate?.("previous"))}
          onNext={() => guardedAction(() => onNavigate?.("next"))}
          onLast={() => guardedAction(() => onNavigate?.("last"))}
          onPrint={onPrint}
          onClone={onClone}
          isSaving={isSaving}
          canSave={!isLocked}
          canPrint={form.id > 0}
          canClone={form.id > 0}
          canDelete={form.id > 0 && form.status !== 3}
          isFirstRecord={isFirstRecord}
          isLastRecord={isLastRecord}
        />

        <div
          className="relative min-h-0 flex-1 overflow-y-auto rounded-b-3xl bg-slate-50/60 px-6 py-4 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" as any }}
          onKeyDown={handleFormEnterAsTab}
        >
          <ProgressSpinner loading={isSaving} />
          <Messages innerRef={messagesRef} />

          <DialogHeader className="mb-3 overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-3 shadow-lg">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-white sm:text-xl">
              <Package className="h-5 w-5" />
              {labels.title}
              {form.id > 0 ? (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30">{form.vch_code}</span>
              ) : (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30">مسودة</span>
              )}
              {statusBadge && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                    form.status === 3 ? "bg-rose-500/20 text-rose-50 ring-rose-200/40" : "bg-amber-400/20 text-amber-50 ring-amber-200/40"
                  }`}
                >
                  {statusBadge}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* لا يُستخدَم <fieldset disabled={isLocked}> هنا (كما في تبويبات الأصناف) عمداً: يحتاج
              حقل "رقم السند" البقاء قابلاً للتعديل حتى لسند مُقفَل (مُرحَّل/ملغى) للتنقل إلى سند آخر
              بكتابة رقمه مباشرة — وfieldset يُعطِّل كل حقوله الفرعية بلا استثناء بصرف النظر عن أي
              disabled صريح على الحقل نفسه. لذا كل حقل هنا يحمل disabled={isLocked} صراحة عدا رقم السند. */}
          <>
            {/* تفاصيل السند (يضم أيضاً العميل/المستودعات ضمن نفس البطاقة) */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <FileText className="h-3.5 w-3.5" />
                تفاصيل السند
              </div>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>دفتر السندات *</Label>
                    <PrimeDropdown
                      value={form.vch_book_id}
                      options={voucherBooks}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("vch_book_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-code">رقم السند *</Label>
                    <Input
                      ref={vchCodeInputRef}
                      id="vch-code"
                      value={form.vch_code}
                      onChange={(e) => onFormChange("vch_code", normalizeVoucherCode(e.target.value))}
                      onBlur={handleCodeBlur}
                      maxLength={20}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-date">تاريخ السند *</Label>
                    <DateTimeControl
                      id="vch-date"
                      ref={dateInputRef}
                      value={form.vch_date ? form.vch_date.slice(0, 10) : ""}
                      disabled={isLocked}
                      onChange={(value) => onFormChange("vch_date", value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>العملة *</Label>
                    <PrimeDropdown
                      value={form.currency_id}
                      options={currencyOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر العملة"
                      filter
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => void handleCurrencyChange(e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-rate">سعر الصرف *</Label>
                    <Input
                      id="vch-rate"
                      type="number"
                      value={numberValue(form.rate)}
                      onChange={(e) => onFormChange("rate", e.target.value ? Number(e.target.value) : 1)}
                      disabled={isLocked || (form.currency_id != null && form.currency_id === baseCurrencyId)}
                    />
                  </div>
                </div>

                {/* العميل يظهر لكل أنواع سندات الحركة (بما فيها الإرسالية الداخلية) — حقل اختياري
                    دوماً (validateVoucher لا يفرضه)، بينما من/الى مستودع تبقى خاصة بالإرسالية
                    الداخلية والمستودع خاص بسند الاستعمال، تُعرَض إضافةً للعميل لا بدلاً عنه. */}
                <div className="grid gap-3 md:grid-cols-2">
                  <AutoCompleteAccount
                    label="العميل"
                    value={form.account_id != null ? String(form.account_id) : ""}
                    valueMode="id"
                    onValueChange={() => {}}
                    onAccountSelect={(account) => onFormChange("account_id", account?.id ?? null)}
                    searchAllowedTypeValues={[2, 3, 5]}
                    disabled={isLocked}
                  />
                  {priceCategoryBlock}
                  {isInternalDelivery && (
                    <>
                      <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                        <Label>من مستودع *</Label>
                        <PrimeDropdown
                          value={form.from_store_id}
                          options={warehouses}
                          optionLabel="warehouse_name"
                          optionValue="id"
                          placeholder="اختر"
                          filter
                          disabled={isLocked}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          panelStyle={{ zIndex: 10000 }}
                          onChange={(e: any) => onFormChange("from_store_id", e.value ?? null)}
                        />
                      </div>
                      <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                        <Label>الى مستودع *</Label>
                        <PrimeDropdown
                          value={form.to_store_id}
                          options={warehouses}
                          optionLabel="warehouse_name"
                          optionValue="id"
                          placeholder="اختر"
                          filter
                          disabled={isLocked}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          panelStyle={{ zIndex: 10000 }}
                          onChange={(e: any) => onFormChange("to_store_id", e.value ?? null)}
                        />
                      </div>
                    </>
                  )}
                  {/* مستودع واحد لكامل السند من رأس السند — الآن فقط لإرسالية داخلية غير المستودعة هنا
                      أصلاً (لها من/الى مستودع أعلاه)؛ بقية الأنواع الثلاثة (ادخال/اخراج بضاعة، استعمال)
                      لها جميعاً عمود "المستودع" الخاص بها بالسطر (showRowWarehouseColumn) الآن — أصنافها
                      قد تدخل/تُصرف من مستودعات مختلفة لكل سطر. هذا الشرط يبقى دفاعياً فقط. */}
                  {!isInternalDelivery && !showRowWarehouseColumn && (
                    <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                      <Label>المستودع *</Label>
                      <PrimeDropdown
                        value={form.to_store_id}
                        options={warehouses}
                        optionLabel="warehouse_name"
                        optionValue="id"
                        placeholder="اختر"
                        filter
                        disabled={isLocked}
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        panelStyle={{ zIndex: 10000 }}
                        onChange={(e: any) => onFormChange("to_store_id", e.value ?? null)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-manual-code">سند يدوي</Label>
                    <Input
                      id="vch-manual-code"
                      value={form.manual_voucher}
                      onChange={(e) => onFormChange("manual_voucher", e.target.value)}
                      disabled={isLocked}
                      maxLength={30}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-manual-date">تاريخ السند اليدوي</Label>
                    <DateTimeControl
                      id="vch-manual-date"
                      value={form.manual_date ? form.manual_date.slice(0, 10) : ""}
                      disabled={isLocked}
                      onChange={(value) => onFormChange("manual_date", value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>

          {/* Tabs خارج fieldset عمداً — يبقى التنقل بين التبويبات ممكناً حتى لسند مُقفَل (مُرحَّل/ملغى)،
              وfieldset منفصل أدناه يُعطِّل حقول كل تبويب فقط دون تعطيل أزرار التبويبات نفسها. */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            {/* dir صريح هنا (بدل الاعتماد فقط على وراثته من DialogContent) لضمان أن "الاصناف" —
                أول عنصر بترتيب DOM — يظهر في أقصى اليمين دائماً، بصرف النظر عن أي تعارض في تتالي
                الاتجاه عبر بوابة Radix Dialog/Tabs. */}
            <TabsList dir="rtl">
              <TabsTrigger value="items">الاصناف</TabsTrigger>
              <TabsTrigger value="quantities">تفاصيل كميات الصنف</TabsTrigger>
              {isUseVoucher && <TabsTrigger value="accounts">تفاصيل حسابات الاصناف</TabsTrigger>}
              <TabsTrigger value="notes">ملاحظات</TabsTrigger>
            </TabsList>

            <fieldset disabled={isLocked} className="contents">
              <TabsContent value="items" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={chequeGridRef}
                    style={{ height: "300px" }}
                    scheme={scheme}
                    dataSource={itemsCollectionView}
                    idProperty="ser"
                    // isReport يمنع التعديل فعلياً (isReadOnly على FlexGrid) لكنه يُبدّل أيضاً وضع
                    // التحديد لصف كامل ويُلوّن الصفوف بأسلوب "تقرير" — لا يُراد ذلك هنا، فقط منع
                    // التعديل، لذا isReadOnly مُمرَّر صراحةً (يُبطِل قيمة isReport الافتراضية داخل
                    // DataGridView.js لأنه يُنشَر بعدها في الـ props) بينما isReport يبقى false
                    // فيحافظ الجدول على شكله ولون تحديده المعتاد بالخلية.
                    isReport={false}
                    isReadOnly={isLocked}
                    showContextMenu={false}
                    cellEditEnded={(s: any, e: any) => handleCellEditEnded(s, e)}
                    beginningEdit={(s: any, e: any) => handleBeginningEdit(s, e)}
                    onKeyDown={(s: any, e: any) => handleKeyDown(s, e)}
                    keyActionEnter={KeyAction.None}
                    keyActionTab={KeyAction.None}
                    dontConvertToCards={true}
                  />
                </div>
              </TabsContent>

              <TabsContent value="quantities" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-3 py-2 text-right">رقم الصنف</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">اسم الصنف</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">الكمية المطلوبة</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">الرصيد الحالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.filter((r) => r.product_id).map((row, i) => (
                        <tr key={i}>
                          <td className="border border-slate-200 px-3 py-2">{row.product_code}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.product_name}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.quantity ?? 0}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.current_stock ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {isUseVoucher && (
                <TabsContent value="accounts" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="w-full max-w-full overflow-x-auto">
                    <DataGridView
                      innerRef={accountsGridRef}
                      style={{ height: "300px" }}
                      scheme={accountsScheme}
                      dataSource={itemsCollectionView}
                      idProperty="ser"
                      isReport={false}
                      isReadOnly={isLocked}
                      showContextMenu={false}
                      dontConvertToCards={true}
                    />
                  </div>
                </TabsContent>
              )}

              <TabsContent value="notes" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    ملاحظة
                  </Label>
                  <Textarea value={form.note} onChange={(e) => onFormChange("note", e.target.value)} rows={6} disabled={isLocked} />
                </div>
              </TabsContent>
            </fieldset>
          </Tabs>

          {/* ملخص المبالغ */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-700">
              <Calculator className="h-3.5 w-3.5" />
              ملخص المبالغ
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-muted-foreground">مجموع الكميات</span>
                <span className="text-lg font-bold">{chequesTotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-muted-foreground">المجموع</span>
                <span className="text-lg font-bold">{amountTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <ProductSearchPopup
          visible={productSearchOpen}
          onClose={() => {
            setProductSearchOpen(false)
            popupHasClosed()
            restoreGridFocus(lastFocusedCellRef.current)
          }}
          onSelect={handleProductSelect}
          priceCategoryId={0}
          ShowSelect={false}
          searchText=""
        />
        <StoresSearchPopup
          visible={warehouseSearchOpen}
          onClose={() => {
            setWarehouseSearchOpen(false)
            popupHasClosed()
            restoreGridFocus(lastFocusedCellRef.current)
          }}
          onSelect={handleWarehouseSelect}
          stores={warehouses as any}
        />
        <UnitsSearchPopup
          visible={unitsSearchOpen}
          product={{ name: unitsSearchRow !== null ? itemsRef.current[unitsSearchRow]?.product_name || "" : "" }}
          units={unitsSearchRow !== null ? itemsRef.current[unitsSearchRow]?.units || [] : []}
          onClose={() => {
            setUnitsSearchOpen(false)
            popupHasClosed()
            restoreGridFocus(lastFocusedCellRef.current)
          }}
          onSelect={handleUnitSelect}
        />

        <DatePickerDialog
          open={expiryDatePickerOpen}
          onOpenChange={setExpiryDatePickerOpen}
          value={expiryDateRow !== null ? itemsRef.current[expiryDateRow]?.expiry_date : null}
          title="تاريخ صلاحية الصنف"
          onSelect={(isoDate) => {
            if (expiryDateRow === null) return
            const row = expiryDateRow
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            // تنبيه Toast فقط — انظر نفس الشرح بالتعليق أعلى فرع expiry_date في handleCellEditEnded.
            if (new Date(isoDate).getTime() < today.getTime() && isoDate !== itemsRef.current[row]?.expiry_date) {
              toast({
                title: "تنبيه",
                description: "تاريخ انتهاء الصلاحية للصنف أقل من تاريخ اليوم",
                variant: "destructive",
              })
            }
            patchItemRow(row, { expiry_date: isoDate })
            pendingFocusRef.current = { row, col: "note" }
          }}
        />

        <ItemExpiryDatePicker
          open={expiryLotPickerOpen}
          productId={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.product_id ?? null : null}
          productCode={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.product_code || "" : ""}
          productName={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.product_name || "" : ""}
          requiredQuantity={expiryLotPickerQuantity}
          unitName={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.unit || "" : ""}
          toMainQty={
            expiryLotPickerRow !== null
              ? itemsRef.current[expiryLotPickerRow]?.units?.find(
                  (u) => u.unit_name === itemsRef.current[expiryLotPickerRow!]?.unit,
                )?.to_main_qnty ?? 1
              : 1
          }
          warehouseName={
            expiryLotPickerRow !== null ? resolveConsumptionWarehouseName(itemsRef.current[expiryLotPickerRow]) : ""
          }
          warehouseId={expiryLotPickerWarehouseId}
          hasBatch={expiryLotPickerRow !== null ? Boolean(itemsRef.current[expiryLotPickerRow]?.has_batch) : false}
          reservedByLot={expiryLotPickerReservedByLot}
          onConfirm={(allocations) => {
            if (expiryLotPickerRow !== null) {
              applyExpiryAllocations(expiryLotPickerRow, allocations)
            }
            setExpiryLotPickerOpen(false)
            setExpiryLotPickerRow(null)
            setExpiryLotPickerWarehouseId(null)
            setExpiryLotPickerReservedByLot({})
          }}
          onCancel={() => {
            // نفس سلوك btnItemExpiryDateCancel المرجعي — إلغاء الاختيار يُفرِغ الكمية المُدخَلة بدل
            // تركها بلا دفعة/تاريخ صلاحية محدَّد.
            if (expiryLotPickerRow !== null) {
              const row = expiryLotPickerRow
              patchItemRow(row, { quantity: null, total_price: recalcAmount(null, itemsRef.current[row]?.unit_price ?? null) })
              pendingFocusRef.current = { row, col: "quantity" }
            }
            setExpiryLotPickerOpen(false)
            setExpiryLotPickerRow(null)
            setExpiryLotPickerWarehouseId(null)
            setExpiryLotPickerReservedByLot({})
          }}
        />

        <AccountSearchDialog
          open={itemAccountsSearchOpen}
          onOpenChange={(open) => {
            setItemAccountsSearchOpen(open)
            if (!open) {
              popupHasClosed()
              // إن أُغلِقت النافذة دون اختيار (Escape/زر الإغلاق) فلن يكون onSelect قد ضبط
              // pendingAccountsFocusRef أدناه — تُعاد الشبكة للتركيز على نفس زر البحث الذي فتحها.
              if (!pendingAccountsFocusRef.current) restoreAccountsGridFocus(lastAccountsFocusedCellRef.current)
            }
          }}
          accounts={accountsList}
          onSelect={(account) => {
            if (itemAccountsSearchRow === null) return
            const row = itemAccountsSearchRow
            if (itemAccountsSearchField === "purchase") {
              patchItemRow(row, {
                purchase_account_id: account.id,
                purchase_account_code: account.code,
                purchase_account_name: account.name,
                purchase_cost_centers: [],
              })
              pendingAccountsFocusRef.current = { row, col: "btnCostCenterPurchase" }
            } else {
              patchItemRow(row, {
                expense_account_id: account.id,
                expense_account_code: account.code,
                expense_account_name: account.name,
                expense_cost_centers: [],
              })
              pendingAccountsFocusRef.current = { row, col: "btnCostCenterExpense" }
            }
          }}
        />

        <AccountCostCenters
          open={itemCostCenterOpen}
          onOpenChange={(open) => {
            setItemCostCenterOpen(open)
            if (!open) {
              popupHasClosed()
              restoreAccountsGridFocus(lastAccountsFocusedCellRef.current)
            }
          }}
          account={itemCostCenterAccount}
          value={
            itemCostCenterRow !== null
              ? itemCostCenterField === "expense"
                ? items[itemCostCenterRow]?.expense_cost_centers
                : items[itemCostCenterRow]?.purchase_cost_centers
              : undefined
          }
          onChange={(selection) => {
            if (itemCostCenterRow === null) return
            if (itemCostCenterField === "expense") patchItemRow(itemCostCenterRow, { expense_cost_centers: selection })
            else patchItemRow(itemCostCenterRow, { purchase_cost_centers: selection })
          }}
        />

        <ConfirmDialogYesNo
          visible={showDeleteConfirm}
          message={form.status === 2 ? "السند مرحل هل تريد الغاؤه منطقياً؟" : `هل تريد حذف هذا ${labels.title}؟`}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete?.()
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        <ConfirmDialogYesNo
          visible={showUnsavedConfirm}
          message="تم تعديل البيانات، هل تريد الحفظ؟"
          showBack
          onConfirm={() => {
            setShowUnsavedConfirm(false)
            pendingActionRef.current = null
            onSave("save")
          }}
          onCancel={() => {
            setShowUnsavedConfirm(false)
            const action = pendingActionRef.current
            pendingActionRef.current = null
            action?.()
          }}
          onBack={() => setShowUnsavedConfirm(false)}
        />

        <ConfirmDialogYesNo
          visible={showCurrencyRecalcConfirm}
          message="تغيير العملة يغير سعر الصرف، هل تريد تغيير الأسعار بناءا على ذلك؟"
          onConfirm={async () => {
            setShowCurrencyRecalcConfirm(false)
            const oldRate = Number(form.rate) || 1
            const newCurrencyId = pendingCurrencyIdRef.current
            pendingCurrencyIdRef.current = null
            const newRate = await applyCurrencyChange(newCurrencyId)
            rescaleItemPricesForRate(oldRate, newRate)
          }}
          onCancel={async () => {
            setShowCurrencyRecalcConfirm(false)
            const newCurrencyId = pendingCurrencyIdRef.current
            pendingCurrencyIdRef.current = null
            await applyCurrencyChange(newCurrencyId)
          }}
        />

        <ConfirmDialogYesNo
          visible={showPriceRecalcConfirm}
          message="سيتم إعادة احتساب أسعار جميع الأصناف حسب فئة السعر المختارة، هل تريد المتابعة؟"
          onConfirm={() => {
            setShowPriceRecalcConfirm(false)
            void recalcPricesFromCategory()
          }}
          onCancel={() => setShowPriceRecalcConfirm(false)}
        />

        <PostVoucherDialog
          visible={postDialogOpen}
          isSaving={isSaving}
          onSelect={(action) => {
            setPostDialogOpen(false)
            onSave(action)
          }}
          onCancel={() => setPostDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
