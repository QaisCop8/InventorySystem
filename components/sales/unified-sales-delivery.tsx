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
import AttachmentManager from "@/components/common/AttachmentManager"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import StoresSearchPopup from "@/components/products/StoresSearchPopup"
import UnitsSearchPopup from "@/components/products/UnitsSearchPopup"
import InvoiceFromDeliveryPopup from "@/components/sales/InvoiceFromDeliveryPopup"
import InvoiceFromOrderPopup from "@/components/sales/InvoiceFromOrderPopup"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import ItemExpiryDatePicker, { type ExpiryLotAllocation } from "@/components/common/ItemExpiryDatePicker"
import MeasurementInputDialog from "@/components/common/MeasurementInputDialog"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import { Menu } from "@grapecity/wijmo.input"
import PrimeDropdown from "@/components/common/FocusDropdown"
import DateTimeControl from "@/components/common/date-time-control"
import Util from "@/components/common/Util"
import { useToast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { FileText, Package, Calculator, MessageSquare, Wallet, TrendingUp, Percent } from "lucide-react"
import { readVoucherClipboard, writeVoucherClipboard, type VoucherClipboardPayload } from "@/lib/voucher-clipboard"

// vch_type per voucher_types_tbl (app/api/sales-vouchers/_lib.ts, IDs 16-23) — هذا المكوّن يخدم
// الأنواع الثمانية جميعها الآن عبر خاصية voucherType (بنفس أسلوب unified-stock-voucher.tsx مع
// أنواعه الأربعة)، بدل خدمة النوع 17 (إرسالية مبيعات) حصراً كما كان. الثوابت هنا بدل استيرادها من
// _lib.ts (كود خادم يستخدم `sql` مباشرة، لا يجوز استيراده داخل مكوّن "use client").
export type SalesVoucherSubType = 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
export const SALES_INVOICE_VCH_TYPE: SalesVoucherSubType = 12
export const DELIVERY_SELL_VCH_TYPE: SalesVoucherSubType = 13
export const DELIVERY_CONSIGNMENT_SALE_VCH_TYPE: SalesVoucherSubType = 14
export const RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE: SalesVoucherSubType = 15
export const RETURN_SELL_VCH_TYPE: SalesVoucherSubType = 16
export const PURCHASE_INVOICE_VCH_TYPE: SalesVoucherSubType = 17
export const DELIVERY_PAY_VCH_TYPE: SalesVoucherSubType = 18
export const RETURN_PURCHASE_VCH_TYPE: SalesVoucherSubType = 19

export const SALES_VOUCHER_TYPE_LABELS: Record<SalesVoucherSubType, { title: string; listTitle: string }> = {
  12: { title: "فاتورة مبيعات", listTitle: "فواتير المبيعات" },
  13: { title: "إرسالية مبيعات", listTitle: "إرساليات المبيعات" },
  14: { title: "إرسالية برسم البيع", listTitle: "إرساليات برسم البيع" },
  15: { title: "مرتجع إرسالية برسم البيع", listTitle: "مرتجعات إرسالية برسم البيع" },
  16: { title: "مرتجع مبيعات", listTitle: "مرتجعات المبيعات" },
  17: { title: "فاتورة مشتريات", listTitle: "فواتير المشتريات" },
  18: { title: "إرسالية مشتريات", listTitle: "إرساليات المشتريات" },
  19: { title: "مرتجع مشتريات", listTitle: "مرتجعات المشتريات" },
}

// نفس تدرّج التبويبات (زمردي←تركوازي عند التفعيل) المُطبَّق أصلاً بـunified-journal.tsx/unified-
// receipt-voucher.tsx وunified-stock-voucher.tsx — يُطبَّق هنا أيضاً لتوحيد شكل التبويبات عبر كل
// شاشات السندات.
const voucherTabTriggerClass =
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md"

// خيارات تبويب "الضريبة" — نفس تسميات/قيم taxClassificationOptions وinvoiceTypeOptions
// وoffsetCodeOptions في components/orders/unified-sale-invoices.tsx حرفياً.
export const TAX_CLASSIFICATION_OPTIONS = [
  { label: "ضريبية", value: 1 },
  { label: "معفاه", value: 2 },
  { label: "صفرية", value: 3 },
]
export const INVOICE_SOURCE_TYPE_OPTIONS = [
  { label: "عادية", value: 1 },
  { label: "من ارسالية", value: 2 },
  { label: "من طلبية", value: 3 },
]
export const INVOICE_TYPE_OPTIONS = [
  { label: "للتجارة", value: 1 },
  { label: "خدمات", value: 2 },
  { label: "أصول", value: 3 },
]
export const MAQASA_CODE_OPTIONS = [
  { label: "تجارية", value: 1 },
  { label: "أصول", value: 2 },
  { label: "خدمات", value: 3 },
]

// حساب الضريبة الافتراضي حسب اتجاه السند: مبيعات (فاتورة/إرسالية/مرتجع مبيعات وبرسم البيع) أم
// مشتريات (فاتورة/إرسالية/مرتجع مشتريات) — يقرر أي حقل إعدادات عامة (sales/purchase tax account)
// يُستخدَم كافتراضي لحقل "حساب الضريبة" بتبويب "بيانات اضافية".
export const SALES_DIRECTION_VCH_TYPES: readonly SalesVoucherSubType[] = [12, 13, 14, 15, 16]

export interface SalesVoucherItemRow {
  product_id: number | null
  product_code: string
  product_name: string
  barcode: string
  warehouse_id: number | null
  warehouse_name: string
  unit: string
  quantity: number | null
  bonus_quantity: number | null
  unit_price: number | null
  discount_percent: number | null
  total_price: number | null
  batch_number: string
  expiry_date: string
  serial_numbers: string[]
  source_voucher_id: number | null
  source_voucher_type: number | null
  source_currency_id?: number | null
  source_currency_code?: string
  source_rate?: number
  note: string
  // أبعاد/عدد اختيارية بمستوى السطر — نفس الآلية والأعمدة الأربعة في unified-stock-voucher.tsx
  // (تظهر فقط إن فُعِّلت أعمدتها من إعدادات السند أو احتاجها صنف نوع قياسه غير عادي فعلياً).
  length: number | null
  width: number | null
  height: number | null
  count: number | null
  // مُخزَّنان من بيانات الصنف عند اختياره — لفتح ItemExpiryDatePicker تلقائياً عند إدخال كمية موجبة
  // لصنف متتبَّع، بنفس منطق سند اخراج بضاعة (إرسالية المبيعات تستهلك من مخزون قائم دوماً).
  has_expiry?: boolean
  has_batch?: boolean
  // نوع القياس وأبعاد الصنف الافتراضية — نفس measurment_id/product_length/product_width/product_density
  // في unified-stock-voucher.tsx، تقرر recalcQuantityFromMeasurement أدناه.
  measurment_id?: number | null
  product_length?: number | null
  product_width?: number | null
  product_density?: number | null
  // للعرض فقط (تفاصيل كميات الصنف) — لا تُرسَل للحفظ.
  current_stock?: number
  units?: { unit_id: number; unit_name: string; price: number; barcode: string; to_main_qnty: number }[]
  // تبويب "تفاصيل حسابات الاصناف" — يظهر فقط لفاتورة مبيعات/مشتريات ومردود مبيعات/مشتريات (انظر
  // ITEM_ACCOUNT_CONFIG أدناه). حساب واحد لكل سطر (بخلاف سند الاستعمال في unified-stock-voucher.tsx
  // الذي يحمل حسابَي مشتريات/مصروف معاً)، يُملأ تلقائياً من حساب الصنف نفسه إن وُجد وإلا من الحساب
  // الافتراضي المُعرَّف بالإعدادات العامة، وقابل للتعديل يدوياً عبر زر البحث.
  account_id: number | null
  account_code?: string
  account_name?: string
  account_cost_centers?: JournalCostCenterSelection[]
  // السعر شامل (الضريبة) — للعرض فقط، يُحتسَب من unit_price (المُخزَّن دوماً غير شامل الضريبة)
  // ونسبة ضريبة السند كاملاً (form.vat_percent) عند كل مزامنة لـitemsCollectionView، وليس حقلاً
  // محفوظاً بذاته.
  unit_price_incl_tax?: number
}

export interface SalesDeliveryRecord {
  id: number
  vch_type: number
  vch_code: string
  vch_date: string
  vch_book_id: number | null
  currency_id: number | null
  rate: number
  account_id: number | null
  customer_name: string
  to_store_id: number | null
  salesman_id: number | null
  shipping_address: string
  linked_order_id: number | null
  // خصم/ضريبة على مستوى السند كاملاً (لا لكل سطر) — نفس نموذج unified-sales-order.tsx بالضبط:
  // discount_type "percentage"|"amount"، discount_value إما نسبة أو مبلغ ثابت بحسبه، vat_percent
  // نسبة ضريبة واحدة تُطبَّق على (المجموع الفرعي - الخصم). بلا تكلفة شحن/رسوم أخرى (غير مطلوبة هنا).
  discount_type: "percentage" | "amount"
  discount_value: number
  vat_percent: number
  amount: number
  manual_voucher: string
  manual_date: string
  note: string
  status: number
  is_printed: number
  // تبويب "الضريبة" — تصنيف ضريبي (1=ضريبية، 2=معفاة، 3=صفرية)، نوع الفاتورة (1=للتجارة، 2=خدمات،
  // 3=أصول)، هل السعر بالطباعة يشمل الضريبة، مقاصة (تحوّل بضاعة بين طرفين تُحصَّل ضريبتها لاحقاً)
  // وكودها (1=تجارية، 2=أصول، 3=خدمات) — كلها أعمدة محجوزة أصلاً على voucher_header_tbl
  // (vat_classification_id/invoice_type/vat_included/is_maqasa/maqasa_type، انظر receipts/_lib.ts).
  vat_classification_id: number | null
  invoice_type: number | null
  vat_included: boolean
  is_maqasa: boolean
  maqasa_type: number | null
  // تبويب "بيانات اضافية" — حساب الصندوق (من إعدادات المستخدم بحسب العملة) وحساب الضريبة (من
  // الحسابات الافتراضية بالإعدادات العامة)، للعرض فقط code/name (تُجلَب عبر JOIN من الخادم).
  cash_account_id: number | null
  cash_account_code?: string
  cash_account_name?: string
  tax_account_id: number | null
  tax_account_code?: string
  tax_account_name?: string
  phone: string
  due_date: string
  is_exported_sales: boolean
  // المنطقة — بجانب المندوب أسفل حقل العميل مباشرة، مصدرها المدن المُعرَّفة بالتعريفات
  // (cities/voucher_header_tbl.location_id، أقرب عمود محجوز مطابق لمعنى "منطقة").
  city_id: number | null
  invoice_source_type?: number | null
  source_voucher_id: number | null
  source_voucher_type: number | null
  has_linked_invoice?: boolean
  items: SalesVoucherItemRow[]
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

interface UnifiedSalesDeliveryProps {
  voucherType: SalesVoucherSubType
  dialogOpen: boolean
  onOpenChange: (open: boolean) => void
  form: SalesDeliveryRecord
  onFormChange: <K extends keyof SalesDeliveryRecord>(field: K, value: SalesDeliveryRecord[K]) => void
  onBookChange?: (bookId: number | null) => void
  // يُستدعى عند كل تغيير للعملة (بما فيها تعيينها الأولي بسند جديد) — يُحدِّث حساب الصندوق الافتراضي
  // (تبويب "بيانات اضافية") وفق إعدادات المستخدم لتلك العملة. انظر handleCurrencyChange في
  // sales-delivery.tsx.
  onCurrencyChange?: (currencyId: number | null) => void
  onItemsChange: (items: SalesVoucherItemRow[]) => void
  voucherBooks?: LookupOption[]
  currencyOptions?: CurrencyOption[]
  baseCurrencyId?: number | null
  warehouses?: WarehouseOption[]
  defaultItemWarehouseId?: number | null
  salesmen?: LookupOption[]
  cities?: LookupOption[]
  // "اعدادات اخرى" (تبويب الحسابات الافتراضية للمستخدم) — إن فُعِّل، يُعامَل ما يكتبه المستخدم في
  // عمود "السعر" كسعر شامل الضريبة فيُحوَّل فوراً لغير شامل قبل تخزينه في unit_price (انظر
  // handleCellEditEnded أدناه).
  priceEntryIncludesTax?: boolean
  // نسبة الضريبة الافتراضية من الإعدادات العامة (نسبة الضريبة / نسبة الضريبة-مقاصة) — تُقرَأ فقط
  // عند تأكيد المستخدم إعادة نسبة الضريبة الافتراضية بعد الرجوع لتصنيف "ضريبية" من معفاه/صفرية
  // (انظر handleVatClassificationChange أدناه)؛ isMaqasa يحدّد أيهما (18 مثلاً بدل 16 إن مقاصة).
  resolveDefaultVatPercent?: (isMaqasa: boolean) => number
  isSaving?: boolean
  isLoading?: boolean
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
  onCodeResolved?: (id: number) => void
  onCodeNotFound?: (code: string) => void
  errorMessages?: string[]
}

// تاريخ اصطلاحي لصنف بلا تتبع صلاحية فعلي — نفس القيمة والسبب المُستخدَمين في unified-stock-voucher.tsx
// وstock-vouchers/_lib.ts (NO_EXPIRY_SENTINEL_DATE) للتوافق مع نفس ledger "المتاح".
const DEFAULT_EXPIRY_DATE = "1990-01-01"

const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : value)

const normalizeVoucherCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10)

export const toGridDateString = (value: string | null | undefined): string => (value || "").trim().slice(0, 10)

// نفس resolveFlexControl/selectCell/waitForGridReady في unified-stock-voucher.tsx حرفياً — انظر
// شرحهما هناك (يطبّعان غلاف React الخاص بـWijmo عن عنصر التحكم الفعلي).
const resolveFlexControl = (grid: any): any => {
  if (!grid) return null
  if ("control" in grid) {
    const control = grid.control
    return control && control.columns ? control : null
  }
  return grid.columns ? grid : null
}

const safeFinishEditing = (grid: any) => {
  const control = resolveFlexControl(grid)
  if (!control || typeof control.finishEditing !== "function") return
  control.finishEditing()
}

// قراءة .selection الآمنة — نفس عطل "Cannot read properties of null (reading 'selection')" الذي
// كان يُظَنّ مُعالَجاً بالفعل عبر resolveFlexControl (انظر تعليقها بـunified-stock-voucher.tsx):
// control وcontrol.columns كلاهما صحيحان فعلاً فيمرّ فحصها، لكن getter الخاص بـ.selection نفسه في
// Wijmo يتحطّم داخلياً بحالة حدّية أخرى (حقل باطني آخر لا يزال null أثناء نافذة زمنية قصيرة من
// إعادة بناء تخطيط الشبكة) — try/catch يكفي إذ هذه القراءة مجرد تحسين (حفظ موضع التحديد السابق قبل
// تحديث itemsSource) لا حرج بتجاهله عند فشله.
const readGridSelection = (grid: any): { row: number; col: number } | null => {
  try {
    const sel = grid?.selection
    return sel ? { row: sel.row, col: sel.col } : null
  } catch {
    return null
  }
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

// ترتيب أعمدة الشبكة القابلة للتوقف عبر Tab/Enter — batch_number/expiry_date مُستثنيان (كالإرسالية
// الداخلية في unified-stock-voucher.tsx) لأنهما للقراءة فقط، يُملآن حصراً عبر ItemExpiryDatePicker.
// أعمدة الأبعاد الأربعة لم تعد ضمن هذا الترتيب — تُدخَل عبر MeasurementInputDialog بدل أن تكون
// أعمدة شبكة منفصلة.
const fieldOrder = ["product_code", "quantity", "bonus_quantity", "unit_price", "discount_percent", "note"]

const emptyItemRow: SalesVoucherItemRow = {
  product_id: null,
  product_code: "",
  product_name: "",
  barcode: "",
  warehouse_id: null,
  warehouse_name: "",
  unit: "",
  quantity: null,
  bonus_quantity: null,
  unit_price: null,
  discount_percent: null,
  total_price: null,
  batch_number: "",
  expiry_date: "",
  serial_numbers: [],
  source_voucher_id: null,
  source_voucher_type: null,
  source_currency_id: null,
  source_currency_code: "",
  source_rate: undefined,
  note: "",
  length: null,
  width: null,
  height: null,
  count: null,
  account_id: null,
}

// تبويب "تفاصيل حسابات الاصناف" يظهر فقط لفاتورة مبيعات/مشتريات ومردود مبيعات/مشتريات (وليس
// لأنواع الإرسالية الأربعة الأخرى) — لكل نوع حقل حساب على الصنف نفسه (products.<productField>)
// يُقرأ أولاً، وإلا فالحساب الافتراضي من الإعدادات العامة (system_settings.<settingsKey>، انظر
// default_selling_account_id وأخواتها في components/settings/system-settings.tsx).
const ITEM_ACCOUNT_CONFIG: Partial<Record<SalesVoucherSubType, { productField: string; settingsKey: string }>> = {
  [SALES_INVOICE_VCH_TYPE]: { productField: "selling_account_id", settingsKey: "default_selling_account_id" },
  [RETURN_SELL_VCH_TYPE]: { productField: "selling_returns_account_id", settingsKey: "default_selling_returns_account_id" },
  [PURCHASE_INVOICE_VCH_TYPE]: { productField: "purchase_account_id", settingsKey: "default_purchase_account_id" },
  [RETURN_PURCHASE_VCH_TYPE]: { productField: "purchase_returns_account_id", settingsKey: "default_purchase_returns_account_id" },
}

// مبلغ السطر = الكمية × السعر فقط — لا خصم/ضريبة بمستوى السطر (نُقِلا لمستوى السند كاملاً، انظر
// discount_type/discount_value/vat_percent في SalesDeliveryRecord وtotals أدناه، بنفس نموذج
// unified-sales-order.tsx تماماً).
const recalcLineAmounts = (row: SalesVoucherItemRow): Pick<SalesVoucherItemRow, "total_price"> => {
  const quantity = Number(row.quantity || 0)
  const price = Number(row.unit_price || 0)
  const discountPercent = Number(row.discount_percent || 0)
  return { total_price: Math.round(quantity * price * (1 - discountPercent / 100) * 100) / 100 }
}

export default function UnifiedSalesDelivery({
  voucherType,
  dialogOpen,
  onOpenChange,
  form,
  onFormChange,
  onBookChange,
  onCurrencyChange,
  onItemsChange,
  voucherBooks = [],
  currencyOptions = [],
  baseCurrencyId,
  warehouses = [],
  defaultItemWarehouseId = null,
  salesmen = [],
  cities = [],
  priceEntryIncludesTax = false,
  resolveDefaultVatPercent,
  isSaving = false,
  isLoading = false,
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
}: UnifiedSalesDeliveryProps) {
  const TITLE = SALES_VOUCHER_TYPE_LABELS[voucherType].title
  const isDeliveryVoucher = [DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, DELIVERY_PAY_VCH_TYPE].includes(voucherType)
  const isSalesDeliveryVoucher = [DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE].includes(voucherType)
  const isPurchaseDeliveryVoucher = voucherType === DELIVERY_PAY_VCH_TYPE
  // عنوان بطاقة الملخص أعلى الشاشة يتبع نوع السند الفعلي بدل "ملخص الطلبية" الثابت: فاتورة
  // لفاتورة مبيعات/مشتريات، مرتجع لمرتجع مبيعات/مشتريات (بما فيها مرتجع إرسالية برسم البيع)،
  // وإرسالية لبقية الأنواع (إرسالية مبيعات/برسم البيع/مشتريات).
  const summaryLabel = TITLE.includes("مرتجع") ? "ملخص المرتجع" : TITLE.includes("فاتورة") ? "ملخص الفاتورة" : "ملخص الارسالية"
  const { toast } = useToast()
  const isLocked = form.status === 2 || form.status === 3
  const isFromDelivery = Number(form.invoice_source_type || 1) === 2
  const statusBadge = form.has_linked_invoice
    ? "مرحل - تم إصدار فاتورة"
    : form.status === 3
      ? "ملغي منطقياً"
      : form.status === 2
        ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل")
        : ""

  const messagesRef = useRef<any>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const vchCodeInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState("items")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // تأكيد إعادة نسبة الضريبة الافتراضية عند الرجوع لتصنيف "ضريبية" من معفاه/صفرية — انظر
  // handleVatClassificationChange أدناه.
  const [showVatRestoreConfirm, setShowVatRestoreConfirm] = useState(false)
  const [invoiceFromDeliveryOpen, setInvoiceFromDeliveryOpen] = useState(false)
  const [invoiceFromOrderOpen, setInvoiceFromOrderOpen] = useState(false)
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [warehouseSearchOpen, setWarehouseSearchOpen] = useState(false)
  const [warehouseSearchRow, setWarehouseSearchRow] = useState<number | null>(null)
  const [unitsSearchOpen, setUnitsSearchOpen] = useState(false)
  const [unitsSearchRow, setUnitsSearchRow] = useState<number | null>(null)

  const handleInvoiceSourceTypeChange = (value: number) => {
    onFormChange("invoice_source_type", value)
    if (value === 2 && dialogOpen) {
      setInvoiceFromDeliveryOpen(true)
      return
    }
    if (value === 3 && dialogOpen) {
      setInvoiceFromOrderOpen(true)
      return
    }
    if (value !== 2 && value !== 3) {
      onFormChange("source_voucher_id" as keyof SalesDeliveryRecord, null)
      onFormChange("source_voucher_type" as keyof SalesDeliveryRecord, null)
      onItemsChange(
        form.items.map((item) => ({
          ...item,
          source_voucher_id: null,
          source_voucher_type: null,
        })),
      )
    }
  }
  // نافذة اختيار الدفعة/تاريخ الصلاحية — إرسالية المبيعات تستهلك من مخزون قائم دوماً (بخلاف سند
  // ادخال بضاعة)، فتُفتَح دائماً لصنف متتبَّع عند إدخال كمية موجبة، بنفس منطق سند اخراج بضاعة
  // تماماً في unified-stock-voucher.tsx.
  const [expiryLotPickerOpen, setExpiryLotPickerOpen] = useState(false)
  const [expiryLotPickerRow, setExpiryLotPickerRow] = useState<number | null>(null)
  const [expiryLotPickerQuantity, setExpiryLotPickerQuantity] = useState(0)
  const [expiryLotPickerReservedByLot, setExpiryLotPickerReservedByLot] = useState<Record<string, number>>({})
  // نافذة "بيانات القياس" (الطول/العرض/الارتفاع/العدد) — تفتح بدل الكتابة المباشرة في خلية "الكمية"
  // لأي صنف نوع قياسه غير عادي (measurment_id != 1)، انظر handleBeginningEdit أدناه.
  const [measurementDialogOpen, setMeasurementDialogOpen] = useState(false)
  const [measurementDialogRow, setMeasurementDialogRow] = useState<number | null>(null)
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const [customerInfo, setCustomerInfo] = useState<{ credit_limit: string; address: string } | null>(null)
  const [stockByProductId, setStockByProductId] = useState<Record<number, number>>({})

  // تبويب "تفاصيل حسابات الاصناف" — نفس نمط ensureAccountsLoaded/ensureDefaultItemAccountsLoaded/
  // resolveAccountDefaults في unified-stock-voucher.tsx (سند الاستعمال)، لكن بحساب واحد لكل سطر
  // بدل حسابَي مشتريات/مصروف معاً.
  const itemAccountConfig = ITEM_ACCOUNT_CONFIG[voucherType]
  const showAccountsTab = Boolean(itemAccountConfig)
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const accountsListRef = useRef<AccountItem[]>([])
  const accountsFetchRef = useRef<Promise<AccountItem[]> | null>(null)
  const defaultAccountIdRef = useRef<number | null | undefined>(undefined)
  const defaultAccountFetchRef = useRef<Promise<number | null> | null>(null)
  const [itemAccountsSearchOpen, setItemAccountsSearchOpen] = useState(false)
  const [itemAccountsSearchRow, setItemAccountsSearchRow] = useState<number | null>(null)
  const [itemCostCenterOpen, setItemCostCenterOpen] = useState(false)
  const [itemCostCenterAccount, setItemCostCenterAccount] = useState<AccountItem | null>(null)
  const [itemCostCenterRow, setItemCostCenterRow] = useState<number | null>(null)
  // شبكة الحسابات FlexGrid منفصل فعلياً عن شبكة الأصناف الرئيسية (itemsGridRef) — تحتاج مرجع
  // تركيز خاصاً بها، نفس accountsGridRef/lastAccountsFocusedCellRef في unified-stock-voucher.tsx.
  const accountsGridRef = useRef<any>(null)
  const pendingAccountsFocusRef = useRef<{ row: number; col: string } | null>(null)
  const lastAccountsFocusedCellRef = useRef<{ row: number; col: string } | null>(null)

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.show?.(errorMessages.map((detail) => ({ severity: "error", summary: "", detail, life: 4000 })))
    }
  }, [errorMessages])

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => {
      if (document.activeElement === vchCodeInputRef.current) return
      dateInputRef.current?.focus()
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code])

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

  // بيانات العميل الإضافية (حد الائتمان/العنوان) — تُجلَب من جدول customers عبر account_id (انظر
  // فلتر account_id الإضافي في app/api/customers/route.ts)، منفصلة عن AutoCompleteAccount (بحث
  // account_tbl الخام بلا هذه الحقول). تُصفَّر عند غياب عميل مختار.
  useEffect(() => {
    if (!form.account_id) {
      setCustomerInfo(null)
      return
    }
    let cancelled = false
    fetch(`/api/customers?account_id=${form.account_id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (cancelled) return
        const customer = Array.isArray(rows) ? rows[0] : null
        setCustomerInfo(customer ? { credit_limit: customer.credit_limit || "", address: customer.address || "" } : null)
      })
      .catch(() => {
        if (!cancelled) setCustomerInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [form.account_id])

  const handleCodeBlur = async () => {
    const raw = form.vch_code.trim()
    if (!raw) return
    try {
      const query = new URLSearchParams({ vch_type: String(voucherType), raw })
      if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id))
      const response = await fetch(`/api/sales-vouchers/resolve-code?${query.toString()}`)
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
  // نفس نمط formRef في unified-stock-voucher.tsx — يقرأه معالِج Alt+C (نسخ سند للحافظة العابرة
  // لنوع السند، انظر lib/voucher-clipboard.ts) دون حاجة لإدراج كل حقل رأس يقرأه بمصفوفة تبعيات
  // useEffect أدناه (المُقتصرة على id/status اللازمين لِـF3/F4 فقط).
  const formRef = useRef(form)
  formRef.current = form
  const warehousesRef = useRef(warehouses)
  warehousesRef.current = warehouses
  const defaultItemWarehouseIdRef = useRef(defaultItemWarehouseId)
  defaultItemWarehouseIdRef.current = defaultItemWarehouseId

  // تاريخ الانتهاء: يظهر فقط إن كان مفعّلاً بإعدادات السند وكان يوجد فعلياً صنف واحد على الأقل متتبَّع
  // (تاريخ صلاحية أو رقم تشغيلي) بالسند — لا فائدة من عمود يبقى فارغاً دوماً لسند لا يحوي أي صنف متتبَّع.
  const showExpiryColumn =
    Util.getVoucherSettingScreenData(voucherType, "expiry_date") && items.some((i) => i.has_expiry || i.has_batch)

  // كل حقول fieldOrder محطة توقف دائمة الآن (الأبعاد/العدد لم تعد أعمدة شبكة، تُدخَل عبر
  // MeasurementInputDialog بدلاً من ذلك) — يكفي فحص حدود المصفوفة بدل تخطٍّ شرطي.
  const findNextRelevantFieldIndex = (startIndex: number): number => (startIndex < fieldOrder.length ? startIndex : -1)

  const [itemsCollectionView] = useState(() => new wjcCore.CollectionView<any>([]))
  const itemsGridRef = useRef<any>(null)
  const pendingFocusRef = useRef<{ row: number; col: string } | null>(null)
  const pendingFocusRow = useRef<number | null>(null)
  const skipAutoLookupRef = useRef(false)
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
      () => itemsGridRef.current,
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

  const handleRequestSaveRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!doHotKeys.current || showDeleteConfirm || postDialogOpen || showUnsavedConfirm || isSaving) return
      // Intercept Escape to close inner popups first, and prevent closing parent dialog while saving or popups open
      if (event.key === "Escape") {
        // Close popups in priority order
        if (productSearchOpen) {
          event.preventDefault()
          setProductSearchOpen(false)
          popupHasClosed()
          return
        }
        if (warehouseSearchOpen) {
          event.preventDefault()
          setWarehouseSearchOpen(false)
          popupHasClosed()
          return
        }
        if (unitsSearchOpen) {
          event.preventDefault()
          setUnitsSearchOpen(false)
          popupHasClosed()
          return
        }
        if (expiryLotPickerOpen) {
          event.preventDefault()
          setExpiryLotPickerOpen(false)
          return
        }
        if (measurementDialogOpen) {
          event.preventDefault()
          setMeasurementDialogOpen(false)
          return
        }
        if (invoiceFromDeliveryOpen) {
          event.preventDefault()
          setInvoiceFromDeliveryOpen(false)
          return
        }
        if (invoiceFromOrderOpen) {
          event.preventDefault()
          setInvoiceFromOrderOpen(false)
          return
        }
        if (itemAccountsSearchOpen) {
          event.preventDefault()
          setItemAccountsSearchOpen(false)
          return
        }
        if (itemCostCenterOpen) {
          event.preventDefault()
          setItemCostCenterOpen(false)
          return
        }
        // If none of the inner popups are open, allow Dialog to handle closing (it will run guardedAction)
      }
      if (event.key === "F3") {
        event.preventDefault()
        safeFinishEditing(itemsGridRef.current)
        setTimeout(() => handleRequestSaveRef.current(), 0)
        return
      }
      if (event.key === "F4") {
        event.preventDefault()
        if (form.id > 0 && form.status === 1) {
          setShowDeleteConfirm(true)
        }
        return
      }

      // Alt+C/Alt+V: نسخ/لصق سند عابر لنوع السند (ارسالية مبيعات ↔ سند مخزون بـunified-stock-
      // voucher.tsx) عبر حافظة مشتركة بـlocalStorage — نفس الآلية والتعليق التفصيلي هناك.
      if (event.altKey && (event.key === "c" || event.key === "C")) {
        event.preventDefault()
        const currentForm = formRef.current
        if (!(currentForm.id > 0)) {
          messagesRef.current?.show?.([{ severity: "warn", summary: "", detail: "يجب حفظ السند أولاً قبل نسخه", life: 2500 }])
          return
        }
        const payload: VoucherClipboardPayload = {
          sourceKind: "sales_delivery",
          sourceVchType: currentForm.vch_type,
          sourceVchCode: currentForm.vch_code,
          copiedAt: new Date().toISOString(),
          header: {
            currency_id: currentForm.currency_id,
            rate: currentForm.rate,
            account_id: currentForm.account_id,
            customer_name: currentForm.customer_name,
            to_store_id: currentForm.to_store_id,
            note: currentForm.note,
          },
          items: itemsRef.current
            .filter((r) => r.product_id)
            .map((r) => ({
              product_id: r.product_id,
              product_code: r.product_code,
              product_name: r.product_name,
              barcode: r.barcode,
              warehouse_id: r.warehouse_id,
              warehouse_name: r.warehouse_name,
              unit: r.unit,
              quantity: r.quantity,
              unit_price: r.unit_price,
              total_price: r.total_price,
              batch_number: r.batch_number,
              expiry_date: r.expiry_date,
              note: r.note,
              measurment_id: r.measurment_id ?? null,
              product_length: r.product_length ?? null,
              product_width: r.product_width ?? null,
              product_density: r.product_density ?? null,
              length: r.length,
              width: r.width,
              height: r.height,
              count: r.count,
              has_expiry: r.has_expiry,
              has_batch: r.has_batch,
              units: r.units,
            })),
        }
        writeVoucherClipboard(payload)
        messagesRef.current?.show?.([
          { severity: "success", summary: "", detail: `تم نسخ السند ${currentForm.vch_code} (${payload.items.length} صنف)`, life: 2500 },
        ])
        return
      }

      if (event.altKey && (event.key === "v" || event.key === "V")) {
        event.preventDefault()
        if (isLocked) return
        const clipboard = readVoucherClipboard()
        if (!clipboard || clipboard.items.length === 0) {
          messagesRef.current?.show?.([{ severity: "warn", summary: "", detail: "لا يوجد سند منسوخ للصقه", life: 2500 }])
          return
        }
        onFormChange("currency_id", clipboard.header.currency_id)
        onFormChange("rate", clipboard.header.rate)
        onFormChange("account_id", clipboard.header.account_id)
        onFormChange("customer_name", clipboard.header.customer_name)
        onFormChange("to_store_id", clipboard.header.to_store_id)
        onFormChange("note", clipboard.header.note)

        const pastedRows: SalesVoucherItemRow[] = clipboard.items.map((it) => ({
          ...emptyItemRow,
          product_id: it.product_id,
          product_code: it.product_code,
          product_name: it.product_name,
          barcode: it.barcode,
          warehouse_id: it.warehouse_id,
          warehouse_name: it.warehouse_name,
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.total_price,
          batch_number: it.batch_number,
          expiry_date: it.expiry_date,
          note: it.note,
          measurment_id: it.measurment_id ?? 1,
          product_length: it.product_length,
          product_width: it.product_width,
          product_density: it.product_density,
          length: it.length,
          width: it.width,
          height: it.height,
          count: it.count,
          has_expiry: it.has_expiry,
          has_batch: it.has_batch,
          units: it.units,
        }))
        const existing = itemsRef.current.filter((r) => r.product_id)
        const nextItems = [...existing, ...pastedRows]
        itemsRef.current = nextItems
        onItemsChange(nextItems)
        messagesRef.current?.show?.([
          { severity: "success", summary: "", detail: `تم لصق ${pastedRows.length} صنف من السند ${clipboard.sourceVchCode}`, life: 2500 },
        ])
        return
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown)
    return () => window.removeEventListener("keydown", onGlobalKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.status, showDeleteConfirm, postDialogOpen, showUnsavedConfirm])

  useEffect(() => {
    try {
      const gridBeforeSync = resolveFlexControl(itemsGridRef.current)
      const prevSelection = readGridSelection(gridBeforeSync)

      // السعر شامل (الضريبة) — حقل عرض فقط يُحتسَب هنا من unit_price (المُخزَّن دوماً غير شامل
      // الضريبة) ونسبة ضريبة السند كاملاً (form.vat_percent، ضريبة على مستوى السند وليس السطر)،
      // وليس حقلاً محفوظاً بذاته.
      const vatPercent = Number(form.vat_percent || 0)
      itemsCollectionView.sourceCollection = items.map((row, i) => ({
        ...row,
        ser: i + 1,
        unit_price_incl_tax: vatPercent > 0 ? Math.round(Number(row.unit_price || 0) * (1 + vatPercent / 100) * 100) / 100 : Number(row.unit_price || 0),
      }))
      itemsCollectionView.refresh()

      const pending = pendingFocusRef.current
      if (pending) {
        pendingFocusRef.current = null
        // نفس السبب والتعليق التفصيلي في unified-stock-voucher.tsx: إعادة تعيين sourceCollection أعلاه
        // تُصفِّر currentPosition الداخلي لِـWijmo فوراً، فيتسابق ذلك مع استرجاع الصف عبر
        // waitForGridReady (المبنية على setTimeout) وحدها — يُطبَّق الاسترجاع أولاً بنفس التِّك مباشرة
        // إن كانت الشبكة جاهزة فعلاً (كفرع prevSelection أدناه المُثبَت أصلاً)، ولا يُلجَأ لِـ
        // waitForGridReady إلا إن لم تكن الشبكة جاهزة بعد.
        const gridNow = resolveFlexControl(itemsGridRef.current)
        if (gridNow && gridNow.rows && gridNow.rows.length > pending.row) {
          selectCell(gridNow, pending.row, pending.col)
          gridNow.focus()
        } else {
          waitForGridReady(
            () => itemsGridRef.current,
            (grid) => {
              selectCell(grid, pending.row, pending.col)
              grid.focus()
            },
            20,
            pending.row + 1,
          )
        }
      } else if (prevSelection) {
        const grid = resolveFlexControl(itemsGridRef.current)
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
    } catch (err) {
      console.error("Error synchronizing items grid:", err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, form.vat_percent])

  // تفاصيل كميات الصنف: يجلب current_stock الفعلي (product_stock) لكل صنف مختلف بالسند عبر
  // /api/inventory/products?id=<id> — يُعاد الجلب فقط عند تغيّر مجموعة الأصناف المختارة فعلياً (لا
  // كل تعديل كمية) لتفادي طلبات متكررة أثناء الكتابة.
  const uniqueProductIds = useMemo(
    () => Array.from(new Set(items.filter((r) => r.product_id).map((r) => Number(r.product_id)))),
    [items],
  )
  useEffect(() => {
    if (uniqueProductIds.length === 0) {
      setStockByProductId({})
      return
    }
    let cancelled = false
    Promise.all(
      uniqueProductIds.map((id) =>
        fetch(`/api/inventory/products?id=${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => ({ id, stock: Number(data?.products?.[0]?.current_stock ?? data?.[0]?.current_stock ?? 0) }))
          .catch(() => ({ id, stock: 0 })),
      ),
    ).then((results) => {
      if (cancelled) return
      const map: Record<number, number> = {}
      results.forEach((r) => {
        map[r.id] = r.stock
      })
      setStockByProductId(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueProductIds.join(",")])

  const patchItemRow = (index: number, patch: Partial<SalesVoucherItemRow>) => {
    if (isLocked) return
    const safePatch = patch.expiry_date !== undefined ? { ...patch, expiry_date: toGridDateString(patch.expiry_date) } : patch
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

  // نفس منطق applyExpiryAllocations في unified-stock-voucher.tsx: الدفعة الأولى على السطر الحالي،
  // وأي دفعات إضافية (تخصيص متعدد الدفعات لتغطية كمية واحدة) كسطور جديدة مطابقة للصنف مباشرة بعده.
  const applyExpiryAllocations = (index: number, allocations: ExpiryLotAllocation[]) => {
    if (isLocked || allocations.length === 0) return
    const baseRow = itemsRef.current[index]
    if (!baseRow) return
    const [first, ...rest] = allocations
    const buildRow = (allocation: ExpiryLotAllocation): SalesVoucherItemRow => {
      const patched: SalesVoucherItemRow = {
        ...baseRow,
        batch_number: allocation.batch_number,
        expiry_date: toGridDateString(allocation.expiry_date),
        quantity: allocation.quantity,
      }
      return { ...patched, ...recalcLineAmounts(patched) }
    }
    const updatedFirst = buildRow(first)
    const extraRows = rest.map(buildRow)
    const next = [...itemsRef.current]
    next.splice(index, 1, updatedFirst, ...extraRows)
    itemsRef.current = next
    onItemsChange(next)
  }

  const quantityTotal = items.reduce((sum, row) => sum + Number(row.quantity || 0), 0)

  // نفس معادلة totals في unified-sales-order.tsx بالضبط (بلا تكلفة شحن/رسوم أخرى): المجموع الفرعي من
  // الأصناف، ثم خصم بمستوى السند كاملاً (نسبة أو مبلغ ثابت)، ثم ضريبة على الصافي بعد الخصم.
  const totals = useMemo(() => {
    // الخصم بمستوى السطر (عمود "الخصم %") يُطبَّق أولاً قبل خصم/ضريبة السند كاملاً — نفس معادلة
    // computeTotalAmount في app/api/sales-vouchers/route.ts بالضبط.
    const subtotal = items.reduce((sum, row) => {
      const lineDiscountPercent = Number(row.discount_percent || 0)
      return sum + Number(row.quantity || 0) * Number(row.unit_price || 0) * (1 - lineDiscountPercent / 100)
    }, 0)
    const discountValue = Number(form.discount_value || 0)
    const discount = form.discount_type === "amount" ? discountValue : (subtotal * discountValue) / 100
    const taxPercent = Number(form.vat_percent || 0)
    const tax = ((subtotal - discount) * taxPercent) / 100
    const total = subtotal - discount + tax
    return { subtotal, discount, tax, total }
  }, [items, form.discount_type, form.discount_value, form.vat_percent])

  // مسودة نص حقل "الصافي للدفع" أثناء الكتابة فيه فقط (خلاف ذلك null فتُعرَض totals.total مباشرة) —
  // إبقاء الحقل غير مربوط بـtotals.total مباشرة أثناء الكتابة يمنع "قفز" المؤشّر/القيمة المعروضة مع
  // كل حرف بسبب إعادة الحساب الفورية؛ يُطبَّق الخصم الجديد فقط عند مغادرة الحقل (onBlur).
  const [netPayableDraft, setNetPayableDraft] = useState<string | null>(null)

  // يُعيد احتساب "قيمة الخصم" من الصافي للدفع الذي كتبه المستخدم مباشرة (نسبة الضريبة تبقى كما هي)
  // — قد تصبح قيمة الخصم سالبة إن رفع المستخدم الصافي فوق المجموع الحالي (كتقريب فاتورة 10.89 الى
  // 11 مثلاً)، وهذا مقصود ومسموح به هنا (انظر تخفيف حد قيمة الخصم الأدنى أدناه).
  const applyDesiredNetPayable = (desiredTotal: number) => {
    const taxPercent = Number(form.vat_percent || 0)
    const netBeforeTax = taxPercent > 0 ? desiredTotal / (1 + taxPercent / 100) : desiredTotal
    const requiredDiscount = totals.subtotal - netBeforeTax
    if (form.discount_type === "amount") {
      onFormChange("discount_value", Math.round(Math.min(requiredDiscount, totals.subtotal) * 100) / 100)
    } else {
      const percent = totals.subtotal > 0 ? (requiredDiscount / totals.subtotal) * 100 : 0
      onFormChange("discount_value", Math.round(Math.min(percent, 100) * 100) / 100)
    }
  }

  const normalizeUnits = (rawUnits: any[] | undefined): NonNullable<SalesVoucherItemRow["units"]> =>
    (rawUnits || []).map((u) => ({
      unit_id: u.unit_id,
      unit_name: u.unit_name || "",
      price: Number(u.price ?? u.unit_price ?? 0),
      barcode: u.barcode || "",
      to_main_qnty: Number(u.to_main_qnty ?? 1),
    }))

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

  const resolveBatchExpiryFlags = (product: any): { hasExpiry: boolean; hasBatch: boolean } => ({
    hasExpiry: Boolean(product?.has_expiry_date),
    hasBatch: Boolean(product?.has_batch_number),
  })

  // نفس ensureAccountsLoaded في unified-stock-voucher.tsx (سند الاستعمال) — تُجلَب مرة واحدة فقط
  // لهذه الشاشة ولا تُعاد إن كانت مُحمَّلة مسبقاً.
  const ensureAccountsLoaded = (): Promise<AccountItem[]> => {
    if (accountsListRef.current.length > 0) return Promise.resolve(accountsListRef.current)
    if (!accountsFetchRef.current) {
      accountsFetchRef.current = fetch("/api/accounts")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const mapped: AccountItem[] = Array.isArray(data)
            ? data.map((item: any) => ({
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
              }))
            : []
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

  // الحساب الافتراضي لهذا النوع من إعدادات النظام العامة (system_settings.<settingsKey> —
  // default_selling_account_id وأخواتها) — يُستخدَم فقط إن لم يحمل الصنف نفسه حساباً خاصاً به.
  const ensureDefaultAccountLoaded = (): Promise<number | null> => {
    if (defaultAccountIdRef.current !== undefined) return Promise.resolve(defaultAccountIdRef.current)
    if (!defaultAccountFetchRef.current) {
      defaultAccountFetchRef.current = fetch("/api/settings/system")
        .then((res) => (res.ok ? res.json() : {}))
        .then((settings: any) => {
          const key = itemAccountConfig?.settingsKey
          const resolved = key && settings?.[key] ? Number(settings[key]) : null
          defaultAccountIdRef.current = resolved
          return resolved
        })
        .catch(() => {
          defaultAccountIdRef.current = null
          return null
        })
    }
    return defaultAccountFetchRef.current
  }

  // حساب الصنف لهذا السطر: أولاً حقل حساب الصنف نفسه (products.<productField>) إن كان أكبر من
  // صفر، وإلا الحساب الافتراضي بالإعدادات العامة — نفس منطق resolveAccountDefaults في
  // unified-stock-voucher.tsx بحساب واحد بدل حسابَين.
  const resolveItemAccountDefault = async (product: any): Promise<{ id: number; code: string; name: string } | null> => {
    if (!itemAccountConfig) return null
    const [accounts, defaultAccountId] = await Promise.all([ensureAccountsLoaded(), ensureDefaultAccountLoaded()])
    const productAccountId = Number(product?.[itemAccountConfig.productField]) > 0 ? Number(product[itemAccountConfig.productField]) : null
    const accountId = productAccountId || defaultAccountId
    if (!accountId) return null
    const account = accounts.find((a) => a.id === accountId)
    return account ? { id: account.id, code: account.code, name: account.name } : { id: accountId, code: "", name: "" }
  }

  // زر "مراكز التكلفة" بشبكة الحسابات — نفس openItemCostCenter في unified-stock-voucher.tsx.
  const openItemCostCenter = (index: number) => {
    const row = itemsRef.current[index]
    const accountId = row?.account_id
    if (!accountId) return
    const account = accountsListRef.current.find((a) => a.id === accountId) || null
    lastAccountsFocusedCellRef.current = { row: index, col: "btnCostCenter" }
    popupHasCalled()
    setItemCostCenterAccount(account)
    setItemCostCenterOpen(true)
    setItemCostCenterRow(index)
  }

  // تُجلَب مسبقاً عند فتح الشاشة فقط لأنواع السندات الأربعة التي تستخدم هذا التبويب فعلياً.
  useEffect(() => {
    if (!dialogOpen || !showAccountsTab) return
    void ensureAccountsLoaded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, showAccountsTab])

  // "نسخ الحساب الى اسفل" / "نسخ مراكز التكلفة الى اسفل" — قائمة كليك يمين على عمود "رقم الحساب"
  // بشبكة تفاصيل حسابات الاصناف. تُطبَّق فقط على الأسطر التي تحمل صنفاً فعلياً (product_id) أسفل
  // السطر المُختار (لا فوقه، ولا على أسطر فارغة بلا صنف بعد)، عبر patchItemRow/onItemsChange بدل
  // التعديل المباشر على itemsCollectionView حتى تبقى حالة React (form.items) متزامنة قبل الحفظ.
  const copyAccountToRowsBelow = (sourceIndex: number) => {
    if (isLocked) return
    const source = itemsRef.current[sourceIndex]
    if (!source?.account_id) return
    const next = itemsRef.current.map((row, i) => {
      if (i <= sourceIndex || !(Number(row.product_id) > 0)) return row
      return { ...row, account_id: source.account_id, account_code: source.account_code, account_name: source.account_name }
    })
    itemsRef.current = next
    onItemsChange(next)
  }

  const copyCostCentersToRowsBelow = (sourceIndex: number) => {
    if (isLocked) return
    const source = itemsRef.current[sourceIndex]
    const sourceCostCenters = Array.isArray(source?.account_cost_centers) ? source!.account_cost_centers : []
    const next = itemsRef.current.map((row, i) => {
      if (i <= sourceIndex || !(Number(row.product_id) > 0)) return row
      return { ...row, account_cost_centers: [...sourceCostCenters] }
    })
    itemsRef.current = next
    onItemsChange(next)
  }

  // قائمة الكليك يمين نفسها تُبنى وتُربَط من جديد كل مرة يُفتَح فيها تبويب "تفاصيل حسابات الاصناف"
  // فعلياً (لا فقط عند فتح الشاشة) — Radix Tabs يُلغي تركيب محتوى التبويب غير النشط افتراضياً
  // (unmount)، فتُستبدَل شبكة الحسابات (accountsGridRef) بمثيل Wijmo جديد كل مرة يُعاد فيها فتح هذا
  // التبويب تحديداً، ويجب إرفاق المستمع بمثيلها الجديد في كل مرة.
  useEffect(() => {
    if (!showAccountsTab || activeTab !== "accounts") return
    waitForGridReady(
      () => accountsGridRef.current,
      (grid) => {
        // قد يكون التبويب تبدَّل بعيداً عن "الحسابات" (فيُفكَّك عنصر Wijmo، وتُصفَّر hostElement)
        // أثناء محاولات الاستطلاع المتكررة لـwaitForGridReady (حتى 20 محاولة كل 50ms) قبل أن
        // يستدعي onReady فعلياً — فحص دفاعي يمنع محاولة إرفاق المستمع بعنصر لم يعد موجوداً.
        if (!grid?.hostElement) return
        const menuHost = document.createElement("div")
        menuHost.dir = "rtl"
        const menu = new Menu(menuHost, {
          owner: grid.hostElement,
          displayMemberPath: "header",
          subItemsPath: "",
          commandParameterPath: "cmd",
          openOnHover: true,
          closeOnLeave: false,
          itemsSource: [
            { header: "نسخ الحساب الى اسفل", cmd: "copyAccountDown" },
            { header: "نسخ مراكز التكلفة الى اسفل", cmd: "copyCostCentersDown" },
          ],
          command: {
            canExecuteCommand: () => true,
            executeCommand: (cmd: string) => {
              const row = grid.selection?.row ?? -1
              if (row < 0) return
              if (cmd === "copyAccountDown") copyAccountToRowsBelow(row)
              else if (cmd === "copyCostCentersDown") copyCostCentersToRowsBelow(row)
            },
          },
        })
        grid.menu = menu
        grid.hostElement.addEventListener(
          "contextmenu",
          (e: any) => {
            const ht = grid.hitTest(e)
            if (ht.panel !== grid.cells) return
            const col = grid.columns[ht.col]
            if (!col || col.name !== "account_code") return
            grid.select(ht.row, ht.col)
            e.preventDefault()
            menu.show(e)
          },
          true,
        )
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAccountsTab, activeTab])

  // كمية نفس الصنف/المستودع "المحجوزة" فعلياً بسطور أخرى غير محفوظة بعد — نفس computeReservedByLot
  // في unified-stock-voucher.tsx.
  const computeReservedByLot = (excludeRow: number, productId: number, warehouseId: number): Record<string, number> => {
    const reserved: Record<string, number> = {}
    itemsRef.current.forEach((row, idx) => {
      if (idx === excludeRow) return
      if (row.product_id !== productId) return
      if (Number(row.warehouse_id) !== warehouseId) return
      const rowToMainQty = row.units?.find((u) => u.unit_name === row.unit)?.to_main_qnty ?? 1
      const mainQty = Number(row.quantity || 0) * rowToMainQty
      if (mainQty <= 0) return
      const key = `${row.batch_number || ""}||${row.expiry_date ? row.expiry_date.slice(0, 10) : ""}`
      reserved[key] = (reserved[key] || 0) + mainQty
    })
    return reserved
  }

  const lookupProductByCode = async (
    row: number,
    code: string,
    sourceField: "product_code" | "barcode",
    autoAdvanceOnSuccess = false,
    previousRow?: SalesVoucherItemRow,
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
      const itemAccount = showAccountsTab ? await resolveItemAccountDefault(product) : null
      if (!isMountedRef.current) return
      const patched: SalesVoucherItemRow = {
        ...currentRow,
        product_id: product.id,
        product_code: product.product_code,
        product_name: product.product_name,
        barcode: product.barcode || product.first_barcode || "",
        unit: product.unit_name || currentRow?.unit || "",
        unit_price: unitPrice,
        units: normalizeUnits(product.units),
        has_expiry: hasExpiry,
        has_batch: hasBatch,
        // نوع القياس وأبعاد الصنف الافتراضية — نفس lookupProductByCode في unified-stock-voucher.tsx،
        // العدد يُصفَّر لـ1 دوماً عند اختيار صنف مطابقاً لِـfillItemInfo المرجعي.
        measurment_id: product.measurment_id != null ? Number(product.measurment_id) : 1,
        product_length: product.length != null ? Number(product.length) : null,
        product_width: product.width != null ? Number(product.width) : null,
        product_density: product.density != null ? Number(product.density) : null,
        count: 1,
        ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
        ...(itemAccount ? { account_id: itemAccount.id, account_code: itemAccount.code, account_name: itemAccount.name } : {}),
      }
      patchItemRow(row, { ...patched, ...recalcLineAmounts(patched) })
      if (autoAdvanceOnSuccess) {
        const nextFieldIndex = findNextRelevantFieldIndex(fieldOrder.indexOf("product_code") + 1)
        pendingFocusRef.current = { row, col: nextFieldIndex === -1 ? "quantity" : fieldOrder[nextFieldIndex] }
      }
    } catch {
      if (!isMountedRef.current) return
      const message = sourceField === "barcode" ? "رقم الباركود المدخل غير موجود" : "رقم الصنف المدخل غير موجود"
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: message, life: 3000 }])
      if (previousRow?.product_id) {
        if (sourceField === "barcode") patchItemRow(row, { barcode: previousRow.barcode })
        else patchItemRow(row, { product_code: previousRow.product_code })
      } else if (sourceField === "barcode") {
        patchItemRow(row, { product_id: null, product_name: "", barcode: "" })
      } else {
        patchItemRow(row, { product_id: null, product_name: "", product_code: "" })
      }
      if (autoAdvanceOnSuccess) {
        pendingFocusRef.current = { row, col: sourceField }
      }
    }
  }

  // نفس handleCellEditEnded في unified-stock-voucher.tsx بالبنية (وهي المطلوب إعادة استخدامها حرفياً
  // حسب طلب المستخدم)، مع فرع إضافي لـbonus_quantity (غير موجود هناك أصلاً) — لا خصم/ضريبة بمستوى
  // السطر هنا (نُقِلا لمستوى السند كاملاً، انظر totals/form.discount_type أعلاه).
  const handleCellEditEnded = (grid: any, e: any) => {
    itemsGridRef.current = grid
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
      const adjusted = Util.adjustCode(rawValue, 10).toUpperCase()
      patchItemRow(row, { product_code: adjusted })
      if (skipAutoLookupRef.current) return
      void lookupProductByCode(row, adjusted, "product_code", false, previousRow)
    } else if (colName === "barcode") {
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
      const currentRow = itemsRef.current[row]
      const patched = { ...currentRow, quantity }
      patchItemRow(row, { quantity, ...recalcLineAmounts(patched) })
      // إرسالية مبيعات تستهلك دائماً من مخزون قائم — تُفتَح نافذة اختيار الدفعة/تاريخ الصلاحية فور
      // إدخال كمية موجبة لصنف متتبَّع، بلا استثناء (بخلاف سند ادخال بضاعة في stock-voucher).
      if (currentRow?.product_id && (currentRow.has_expiry || currentRow.has_batch) && Number(quantity || 0) > 0) {
        if (!currentRow.warehouse_id) {
          messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد المستودع اولا", life: 3000 }])
          patchItemRow(row, { quantity: null, ...recalcLineAmounts({ ...currentRow, quantity: null }) })
          return
        }
        setExpiryLotPickerRow(row)
        setExpiryLotPickerQuantity(Number(quantity))
        setExpiryLotPickerReservedByLot(computeReservedByLot(row, currentRow.product_id, Number(currentRow.warehouse_id)))
        setExpiryLotPickerOpen(true)
      }
    } else if (colName === "bonus_quantity") {
      const bonusQuantity = value === "" || value === null ? null : Number(value)
      patchItemRow(row, { bonus_quantity: bonusQuantity })
    } else if (colName === "unit_price") {
      const rawUnitPrice = value === "" || value === null ? null : Number(value)
      // "السعر عند الادخال يشمل الضريبة" (إعدادات المستخدم): ما كتبه المستخدم هنا يُعامَل كسعر شامل
      // الضريبة، فيُحوَّل فوراً لغير شامل (السعر ÷ (1+نسبة الضريبة/100)) قبل تخزينه في unit_price —
      // unit_price يبقى دوماً غير شامل الضريبة داخلياً (نفس أساس عمود "السعر شامل" أعلاه).
      const vatPercent = Number(form.vat_percent || 0)
      const unitPrice =
        rawUnitPrice !== null && priceEntryIncludesTax && vatPercent > 0
          ? Math.round((rawUnitPrice / (1 + vatPercent / 100)) * 100) / 100
          : rawUnitPrice
      const currentRow = itemsRef.current[row]
      const patched = { ...currentRow, unit_price: unitPrice }
      patchItemRow(row, { unit_price: unitPrice, ...recalcLineAmounts(patched) })
    } else if (colName === "discount_percent") {
      const rawDiscount = value === "" || value === null ? null : Number(value)
      // يجب ألا تتجاوز نسبة الخصم 100% — أي قيمة أكبر تعني مبلغاً سالباً بالسطر، وهو خطأ إدخال دوماً.
      const discountPercent = rawDiscount === null ? null : Math.min(Math.max(rawDiscount, 0), 100)
      if (rawDiscount !== null && rawDiscount > 100) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "نسبة الخصم يجب ألا تتجاوز 100%", life: 3000 }])
      }
      const currentRow = itemsRef.current[row]
      const patched = { ...currentRow, discount_percent: discountPercent }
      patchItemRow(row, { discount_percent: discountPercent, ...recalcLineAmounts(patched) })
    } else if (colName === "note") {
      patchItemRow(row, { note: String(value ?? "") })
    }
  }

  // يمنع بدء تحرير خلية "الكمية"/"البونص" لسطر نوع قياس صنفه غير عادي (تُحتسَب الكمية تلقائياً من
  // الأبعاد/العدد، والبونص تابع لها) ويفتح نافذة "بيانات القياس" بدلاً من ذلك عند أي محاولة تحرير
  // الكمية (كتابة حرف، F2، نقر مزدوج — كلها تُطلق beginningEdit في Wijmo) — نفس handleBeginningEdit
  // في unified-stock-voucher.tsx، مع فرع bonus_quantity الإضافي هنا (العمود غير موجود هناك أصلاً).
  const handleBeginningEdit = (grid: any, e: any) => {
    const colName = grid?.columns?.[e.col]?.binding
    const row = itemsRef.current[e.row]
    if (isFromDelivery && colName !== "unit_price") {
      e.cancel = true
      return
    }
    if (colName === "quantity") {
      if (row && Number(row.measurment_id || 1) !== 1) {
        e.cancel = true
        if (row.product_id) {
          popupHasCalled()
          setMeasurementDialogRow(e.row)
          setMeasurementDialogOpen(true)
        }
      }
    } else if (colName === "bonus_quantity") {
      if (row && Number(row.measurment_id || 1) !== 1) {
        e.cancel = true
      }
    }
  }

  const handleWarehouseSelect = (store: WarehouseOption) => {
    setWarehouseSearchOpen(false)
    popupHasClosed()
    if (warehouseSearchRow === null) {
      restoreGridFocus(lastFocusedCellRef.current)
      return
    }
    patchItemRow(warehouseSearchRow, { warehouse_id: store.id, warehouse_name: store.warehouse_name })
    pendingFocusRef.current = { row: warehouseSearchRow, col: "unit" }
  }

  const handleUnitSelect = ({ selected_unit }: { product: { name: string }; selected_unit: NonNullable<SalesVoucherItemRow["units"]>[number] }) => {
    setUnitsSearchOpen(false)
    popupHasClosed()
    if (unitsSearchRow === null) {
      restoreGridFocus(lastFocusedCellRef.current)
      return
    }
    const row = unitsSearchRow
    const currentRow = itemsRef.current[row]
    const patched = { ...currentRow, unit: selected_unit.unit_name, unit_price: selected_unit.price }
    patchItemRow(row, { unit: selected_unit.unit_name, unit_price: selected_unit.price, ...recalcLineAmounts(patched) })
    pendingFocusRef.current = { row, col: "quantity" }
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
    const itemAccount = showAccountsTab ? await resolveItemAccountDefault(product) : null
    if (!isMountedRef.current) return
    const unitPrice = unit?.price ?? product.first_price ?? 0
    const patched: SalesVoucherItemRow = {
      ...currentRow,
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      barcode: product.barcode || product.first_barcode || "",
      unit: unit?.unit_name || product.first_unit || "",
      unit_price: unitPrice,
      units: normalizeUnits(product.units),
      has_expiry: hasExpiry,
      has_batch: hasBatch,
      measurment_id: product.measurment_id != null ? Number(product.measurment_id) : 1,
      product_length: product.length != null ? Number(product.length) : null,
      product_width: product.width != null ? Number(product.width) : null,
      product_density: product.density != null ? Number(product.density) : null,
      count: 1,
      ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
      ...(itemAccount ? { account_id: itemAccount.id, account_code: itemAccount.code, account_name: itemAccount.name } : {}),
    }
    patchItemRow(row, { ...patched, ...recalcLineAmounts(patched) })
    const nextFieldIndex = findNextRelevantFieldIndex(fieldOrder.indexOf("product_code") + 1)
    pendingFocusRef.current = { row, col: nextFieldIndex === -1 ? "quantity" : fieldOrder[nextFieldIndex] }
  }

  const handleKeyDown = (grid: any, e: any) => {
    // يُستدعى مرتين لكل ضغطة مفتاح فعلياً: مرة بمعطيات Wijmo الصحيحة (grid/e سليمَين)، ومرة أخرى
    // بمعطيات غير مكتملة (onKeyDown ليس حدثاً مُوثَّقاً في FlexGridInputs، فيبدو أن React يلتقطها
    // كخاصية DOM أصلية على العنصر المُغلَّف ويستدعيها بوسيط واحد فقط) — بلا هذا الحارس، محاولة قراءة
    // e.keyCode على undefined بالاستدعاء الثاني تُطلِق استثناءً غير مُلتقَط يقطع معالجة الحدث كاملة،
    // فيمنع Wijmo من بدء تحرير الخلية إطلاقاً بعد أول ضغطة مفتاح (هذا هو سبب "الشبكة لا تقبل الكتابة").
    if (!grid || !grid.selection || !e || typeof e.keyCode === "undefined") return
    itemsGridRef.current = grid
    if (doHotKeys.current === false) return
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
      safeFinishEditing(grid)
      pendingFocusRow.current = row
      lastFocusedCellRef.current = { row, col: "product_code" }
      popupHasCalled()
      setTimeout(() => setProductSearchOpen(true), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "warehouse_name") {
      e.preventDefault()
      safeFinishEditing(grid)
      setWarehouseSearchRow(row)
      lastFocusedCellRef.current = { row, col: "warehouse_name" }
      popupHasCalled()
      setTimeout(() => setWarehouseSearchOpen(true), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "unit") {
      e.preventDefault()
      safeFinishEditing(grid)
      setUnitsSearchRow(row)
      lastFocusedCellRef.current = { row, col: "unit" }
      popupHasCalled()
      setTimeout(() => setUnitsSearchOpen(true), 0)
      return
    }

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      const previousRow = colName === "product_code" || colName === "barcode" ? itemsRef.current[row] : undefined
      if (colName === "product_code" || colName === "barcode") skipAutoLookupRef.current = true
      safeFinishEditing(grid)
      skipAutoLookupRef.current = false
      grid.focus()
      const currentRow = itemsRef.current[row]

      if (colName === "product_code" && !currentRow?.product_code?.trim()) {
        pendingFocusRow.current = row
        lastFocusedCellRef.current = { row, col: "product_code" }
        popupHasCalled()
        setTimeout(() => setProductSearchOpen(true), 0)
        return
      }

      if (colName === "product_code") {
        void lookupProductByCode(row, currentRow?.product_code ?? "", "product_code", true, previousRow)
        return
      }

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
      if (currentFieldIndex === -1) {
        // عمود بلا ترتيب Tab/Enter مخصّص بـfieldOrder — نفس منطق unified-stock-voucher.tsx: ينتقل
        // افتراضياً للعمود المرئي التالي بنفس الشبكة (متخطّياً أعمدة الأزرار التي يبدأ اسمها بـ"btn")
        // بدل تجاهل الضغطة كلياً.
        const isSelectableColumn = (gc: any) => gc && gc.visible !== false && !String(gc.binding || "").startsWith("btn")
        let nextCol = -1
        for (let c = col + 1; c < grid.columns.length; c++) {
          if (isSelectableColumn(grid.columns[c])) {
            nextCol = c
            break
          }
        }
        if (nextCol >= 0) {
          selectCell(grid, row, grid.columns[nextCol].binding)
        } else {
          const nextRow = row + 1 <= itemsRef.current.length - 1 ? row + 1 : row
          const firstCol = grid.columns.find(isSelectableColumn)
          if (firstCol) selectCell(grid, nextRow, firstCol.binding)
        }
        return
      }
      // يتخطّى أعمدة الأبعاد غير ذات الصلة بنوع قياس هذا السطر تحديداً — نفس منطق
      // findNextRelevantFieldIndex في unified-stock-voucher.tsx.
      const nextFieldIndex = findNextRelevantFieldIndex(currentFieldIndex + 1)
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

  const scheme = useMemo(
    () => ({
      name: "SalesDeliveryItemsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number", visible: Util.getVoucherSettingScreenData(voucherType, "ser") },
        { header: "الباركود", name: "barcode", width: 110, visible: Util.getVoucherSettingScreenData(voucherType, "barcode"), isReadOnly: isLocked || isFromDelivery },
        { header: "رقم الصنف", name: "product_code", width: 110, visible: Util.getVoucherSettingScreenData(voucherType, "code"), isReadOnly: isLocked || isFromDelivery },
        {
          header: " ",
          name: "btnSearchProduct",
          width: 55,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked || isFromDelivery) return
            pendingFocusRow.current = ctx.row.index
            lastFocusedCellRef.current = { row: ctx.row.index, col: "product_code" }
            popupHasCalled()
            setTimeout(() => setProductSearchOpen(true), 0)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "code"),
          visibleInColumnChooser: true,
        },
        { header: "اسم الصنف", name: "product_name", width: "*", minWidth: 160, isReadOnly: isLocked || isFromDelivery },
        {
          header: "المستودع",
          name: "warehouse_name",
          width: 120,
          isReadOnly: true,
          visible: Util.getVoucherSettingScreenData(voucherType, "store"),
        },
        {
          header: " ",
          name: "btnSearchWarehouse",
          width: 55,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked || isFromDelivery) return
            setWarehouseSearchRow(ctx.row.index)
            lastFocusedCellRef.current = { row: ctx.row.index, col: "warehouse_name" }
            popupHasCalled()
            setTimeout(() => setWarehouseSearchOpen(true), 0)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "store"),
          visibleInColumnChooser: true,
        },
        { header: "الوحدة", name: "unit", width: 80, isReadOnly: true, visible: Util.getVoucherSettingScreenData(voucherType, "unit") },
        {
          header: " ",
          name: "btnSearchUnits",
          width: 55,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked || isFromDelivery) return
            setUnitsSearchRow(ctx.row.index)
            lastFocusedCellRef.current = { row: ctx.row.index, col: "unit" }
            popupHasCalled()
            setTimeout(() => setUnitsSearchOpen(true), 0)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "unit"),
          visibleInColumnChooser: true,
        },
        {
          header: "الكمية",
          name: "quantity",
          width: 90,
          dataType: wjcCore.DataType.Number,
          isReadOnly: isLocked || isFromDelivery,
          // للقراءة فقط لنوع قياس غير عادي — تُحتسَب تلقائياً من الأبعاد/العدد المُدخَلة عبر
          // MeasurementInputDialog؛ المنع الفعلي بمستوى الخلية عبر beginningEdit (isReadOnly هنا
          // خاصية عمود ثابتة لا تفرّق بين الأسطر).
        },
        { header: "البونص", name: "bonus_quantity", width: 80, dataType: wjcCore.DataType.Number, visible: Util.getVoucherSettingScreenData(voucherType, "bonus"), isReadOnly: isLocked || isFromDelivery },
        { header: "السعر", name: "unit_price", width: 90, dataType: wjcCore.DataType.Number, visible: Util.getVoucherSettingScreenData(voucherType, "price"), isReadOnly: isLocked },
        {
          header: "الخصم %",
          name: "discount_percent",
          width: 90,
          isReadOnly: isLocked || isFromDelivery,
          visible: Util.getVoucherSettingScreenData(voucherType, "discount"),
        },
        {
          header: "السعر شامل",
          name: "unit_price_incl_tax",
          width: 90,
          dataType: wjcCore.DataType.Number,
          isReadOnly: true,
          visible: Util.getVoucherSettingScreenData(voucherType, "price_excl_tax"),
        },
        { header: "المبلغ", name: "total_price", width: 110, dataType: wjcCore.DataType.Number, isReadOnly: isLocked || isFromDelivery },
        {
          header: "الرقم التشغيلي",
          name: "batch_number",
          width: 110,
          isReadOnly: true,
          visible: Util.getVoucherSettingScreenData(voucherType, "batch"),
        },
        {
          header: "تاريخ الانتهاء",
          name: "expiry_date",
          width: 120,
          isReadOnly: true,
          // يظهر فقط إن كان مفعّلاً بإعدادات السند وكان يوجد صنف متتبَّع (صلاحية أو رقم تشغيلي) فعلياً
          // بالسند حالياً — انظر showExpiryColumn أعلاه.
          visible: showExpiryColumn,
        },
        {
          header: " ",
          name: "btnwhen loading Serials",
          width: 55,
          buttonBody: "button",
          align: "center",
          title: "الأرقام التسلسلية",
          iconType: "list",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setSerialsRow(ctx.row.index)
            setSerialsOpen(true)
          },
          visible: Util.getVoucherSettingScreenData(voucherType, "serial"),
          visibleInColumnChooser: true,
        },
        { header: "ملاحظة", name: "note", width: 130, isReadOnly: isLocked || isFromDelivery },
        {
          header: " ",
          name: "btnDelete",
          width: 55,
          buttonBody: "button",
          align: "center",
          iconType: "delete",
          className: "danger",
          isReadOnly: true,
          visible: !isLocked && !isFromDelivery,
          visibleInColumnChooser: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked || isFromDelivery) return
            removeItemRow(ctx.row.index)
          },
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [isLocked, isFromDelivery, showExpiryColumn],
  )

  // شبكة تبويب "تفاصيل حسابات الاصناف" — تُبنى من نفس itemsCollectionView (نفس الأسطر بنفس
  // الترتيب/الفهرسة الفعلية بالضبط كشبكة الاصناف الرئيسية)، بحساب واحد قابل للتعديل يدوياً عبر
  // زر البحث بدل حسابَي مشتريات/مصروف معاً كسند الاستعمال في unified-stock-voucher.tsx.
  const accountsScheme = useMemo(
    () => ({
      name: "SalesVoucherAccountsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number" },
        { header: "رقم الصنف", name: "product_code", width: 110, isReadOnly: true },
        { header: "اسم الصنف", name: "product_name", width: "*", minWidth: 160, isReadOnly: true },
        { header: "رقم الحساب", name: "account_code", width: 130, isReadOnly: true },
        {
          name: "btnSearchAccount",
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
            lastAccountsFocusedCellRef.current = { row: ctx.row.index, col: "btnSearchAccount" }
            popupHasCalled()
            setItemAccountsSearchRow(ctx.row.index)
            setItemAccountsSearchOpen(true)
          },
          visible: true,
        },
        { header: "الحساب", name: "account_name", width: 200, isReadOnly: true },
        {
          name: "btnCostCenter",
          header: "مراكز التكلفة",
          width: 100,
          buttonBody: "button",
          align: "center",
          title: "مراكز التكلفة",
          iconType: "money",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => openItemCostCenter(ctx.row.index),
          visible: true,
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [isLocked],
  )

  // نافذة الأرقام التسلسلية لكل سطر — قائمة نصية بسيطة (مطابقة لـProductNumbers.tsx المستخدَم
  // لأرقام الصنف الأصلية/المصنع) بدل جدول علاقي مستقل، إذ لا حاجة هنا لأكثر من قائمة أرقام لكل سطر.
  const [serialsOpen, setSerialsOpen] = useState(false)
  const [serialsRow, setSerialsRow] = useState<number | null>(null)
  const [serialsDraft, setSerialsDraft] = useState("")
  useEffect(() => {
    if (serialsOpen && serialsRow !== null) {
      setSerialsDraft((itemsRef.current[serialsRow]?.serial_numbers || []).join("\n"))
    }
  }, [serialsOpen, serialsRow])

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

  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    event.preventDefault()
    const focusable = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, select, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute("disabled"))
    const index = focusable.indexOf(target)
    if (index >= 0 && index < focusable.length - 1) focusable[index + 1]?.focus()
  }

  const anyInnerPopupOpen = () =>
    productSearchOpen || warehouseSearchOpen || unitsSearchOpen || expiryLotPickerOpen || measurementDialogOpen ||
    invoiceFromDeliveryOpen || invoiceFromOrderOpen || itemAccountsSearchOpen || itemCostCenterOpen || showVatRestoreConfirm || showDeleteConfirm || postDialogOpen || showUnsavedConfirm

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (open) {
          onOpenChange(true)
          return
        }
        // Prevent closing while saving or when any inner popup is open
        if (isSaving || anyInnerPopupOpen()) {
          // optionally notify user when trying to close during save
          if (isSaving) messagesRef.current?.show?.([{ severity: "warn", summary: "", detail: "جاري الحفظ... الرجاء الانتظار", life: 2000 }])
          return
        }
        guardedAction(() => onOpenChange(false))
      }}
    >
      <DialogContent
          className="sales-delivery-form flex h-[96vh] w-[97vw] max-w-[1800px] max-h-[96vh] flex-col overflow-hidden p-0 transition-shadow"
          dir="rtl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          style={dialogOpen ? { border: "1px solid rgba(16,185,129,0.22)", boxShadow: "0 20px 60px rgba(16,185,129,0.12)" } : undefined}
        >
        <UniversalToolbar
          currentRecord={currentIndex + 1}
          totalRecords={totalRecords}
          onNew={() => guardedAction(() => onNew?.())}
          onSave={handleRequestSave}
          onDelete={() => setShowDeleteConfirm(true)}
          onFirst={() => { console.debug('[UnifiedSalesDelivery] toolbar: first clicked'); guardedAction(() => onNavigate?.("last")) }}
          onPrevious={() => { console.debug('[UnifiedSalesDelivery] toolbar: previous clicked'); guardedAction(() => onNavigate?.("next")) }}
          onNext={() => { console.debug('[UnifiedSalesDelivery] toolbar: next clicked'); guardedAction(() => onNavigate?.("previous")) }}
          onLast={() => { console.debug('[UnifiedSalesDelivery] toolbar: last clicked'); guardedAction(() => onNavigate?.("first")) }}
          onPrint={onPrint}
          onClone={onClone}
          isSaving={isSaving}
          isLoading={isLoading}
          canSave={!isLocked}
          canPrint={form.id > 0}
          canClone={form.id > 0}
          canDelete={form.id > 0 && form.status !== 3 && !form.has_linked_invoice}
          isFirstRecord={isFirstRecord}
          isLastRecord={isLastRecord}
        />

        <div
          className="relative min-h-0 flex-1 overflow-y-auto rounded-b-3xl bg-slate-50/60 px-4 py-3 sm:px-6 sm:py-4 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" as any }}
          onKeyDown={handleFormEnterAsTab}
        >
          <ProgressSpinner loading={isSaving || isLoading} />
          <Messages innerRef={messagesRef} />

          <DialogHeader className="mb-3 overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-3 shadow-lg">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-white sm:text-xl">
              <Package className="h-5 w-5" />
              {TITLE}
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

          <div className="sticky top-0 z-40 mb-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-700" />
                <span className="text-sm font-medium">{summaryLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-semibold">{Util.formatNumber(totals.subtotal, Util.getSystemSetting(17))}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">الخصم</span>
                  <span className="font-semibold text-red-600">-{Util.formatNumber(totals.discount, Util.getSystemSetting(17))}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">الضريبة</span>
                  <span className="font-semibold">{Util.formatNumber(totals.tax, Util.getSystemSetting(17))}</span>
                </div>
                <Separator orientation="vertical" className="hidden h-10 md:block" />
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">الإجمالي</span>
                  <span className="text-lg font-bold text-emerald-700">{Util.formatNumber(totals.total, Util.getSystemSetting(17))}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <FileText className="h-3.5 w-3.5" />
              تفاصيل السند
            </div>
            <div className="grid gap-3">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-5 lg:grid-cols-5">
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
                    onChange={(e: any) => (onBookChange ? onBookChange(e.value ?? null) : onFormChange("vch_book_id", e.value ?? null))}
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
                    maxLength={10}
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
                    onChange={async (e: any) => {
                      const newCurrencyId = e.value ?? null
                      onFormChange("currency_id", newCurrencyId)
                      onCurrencyChange?.(newCurrencyId)
                      if (!newCurrencyId || newCurrencyId === baseCurrencyId) {
                        onFormChange("rate", 1)
                        return
                      }
                      try {
                        const query = new URLSearchParams({
                          currency_id: String(newCurrencyId),
                          date: form.vch_date ? form.vch_date.slice(0, 10) : "",
                        })
                        const response = await fetch(`/api/exchange-rates/lookup?${query.toString()}`)
                        const data = response.ok ? await response.json() : null
                        onFormChange("rate", data?.rate ?? 1)
                      } catch {
                        onFormChange("rate", 1)
                      }
                    }}
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

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                <div className="col-span-1">
                  <AutoCompleteAccount
                    label={isPurchaseDeliveryVoucher ? "المورد *" : "العميل *"}
                    value={form.account_id != null ? String(form.account_id) : ""}
                    valueMode="id"
                    onValueChange={() => {}}
                    onAccountSelect={(account) => {
                      if (isFromDelivery) {
                        messagesRef.current?.show?.([
                          {
                            severity: "warn",
                            summary: "",
                            detail: isPurchaseDeliveryVoucher
                              ? "لا يمكن تغيير المورد لفاتورة من إرسالية. لحساب مورد جديد، أغلق الفاتورة واحفظ التغييرات أولاً."
                              : "لا يمكن تغيير العميل لفاتورة من إرسالية. لحساب عميل جديد، أغلق الفاتورة واحفظ التغييرات أولاً.",
                            life: 5000,
                          },
                        ])
                        return
                      }
                      onFormChange("account_id", account?.id ?? null)
                      onFormChange("customer_name", account?.name ?? "")
                    }}
                    searchAllowedTypeValues={isPurchaseDeliveryVoucher ? [3, 5] : [2, 5]}
                    disabled={isLocked || isFromDelivery}
                  />
                </div>
                <div className="col-span-2 grid gap-1.5">
                  <Label htmlFor="payer-name">اسم الدافع</Label>
                  <Input
                    id="payer-name"
                    value={form.customer_name}
                    onChange={(e) => onFormChange("customer_name", e.target.value)}
                    disabled={isLocked || isFromDelivery}
                    className="text-right"
                  />
                </div>
              </div>

              <div className={`grid gap-3 ${
                (voucherType === SALES_INVOICE_VCH_TYPE || voucherType === PURCHASE_INVOICE_VCH_TYPE)
                  ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 md:grid-cols-2"
              }`}>
                {(voucherType === SALES_INVOICE_VCH_TYPE || voucherType === PURCHASE_INVOICE_VCH_TYPE) && (
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>نوع الفاتورة</Label>
                    <PrimeDropdown
                      value={form.invoice_source_type || 1}
                      options={INVOICE_SOURCE_TYPE_OPTIONS}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر"
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => {
                        const value = Number(e.value) || 1
                        handleInvoiceSourceTypeChange(value)
                      }}
                    />
                  </div>
                )}
                <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                  <Label>المندوب</Label>
                  <PrimeDropdown
                    value={form.salesman_id}
                    options={salesmen}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="اختر"
                    filter
                    disabled={isLocked}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    panelStyle={{ zIndex: 10000 }}
                    onChange={(e: any) => onFormChange("salesman_id", e.value ?? null)}
                  />
                </div>
                <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                  <Label>المنطقة</Label>
                  <PrimeDropdown
                    value={form.city_id ?? 0}
                    options={[{ id: 0, name: "بلا" }, ...cities]}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="اختر"
                    filter
                    disabled={isLocked}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    panelStyle={{ zIndex: 10000 }}
                    onChange={(e: any) => onFormChange("city_id", e.value ? Number(e.value) : null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                  <Label>التصنيف الضريبي</Label>
                  <PrimeDropdown
                    value={form.vat_classification_id || 1}
                    options={TAX_CLASSIFICATION_OPTIONS}
                    optionLabel="label"
                    optionValue="value"
                    disabled={isLocked}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    panelStyle={{ zIndex: 10000 }}
                    onChange={(e: any) => {
                      const nextValue = Number(e.value) || 1
                      const previousValue = form.vat_classification_id || 1
                      onFormChange("vat_classification_id", nextValue)
                      if (nextValue === 2 || nextValue === 3) {
                        // معفاه/صفرية: لا نسبة ضريبة أصلاً — تُصفَّر تلقائياً (الحقل يُعطَّل، انظر
                        // Input نسبة الضريبة أدناه).
                        onFormChange("vat_percent", 0)
                      } else if (nextValue === 1 && (previousValue === 2 || previousValue === 3)) {
                        // عودة فعلية من معفاه/صفرية الى ضريبية — يُسأل المستخدم قبل إعادة النسبة
                        // الافتراضية بدل فرضها مباشرة (قد يكون له نسبة أخرى مقصودة).
                        setShowVatRestoreConfirm(true)
                      }
                    }}
                  />
                </div>
                <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                  <Label>النوع</Label>
                  <PrimeDropdown
                    value={form.invoice_type || 1}
                    options={INVOICE_TYPE_OPTIONS}
                    optionLabel="label"
                    optionValue="value"
                    disabled={isLocked}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    panelStyle={{ zIndex: 10000 }}
                    onChange={(e: any) => onFormChange("invoice_type", Number(e.value) || 1)}
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.is_maqasa}
                    disabled={isLocked}
                    onChange={(e) => {
                      onFormChange("is_maqasa", e.target.checked)
                      onFormChange("maqasa_type", e.target.checked ? form.maqasa_type || 1 : null)
                    }}
                  />
                  مقاصة
                </label>
                {form.is_maqasa && (
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>كود المقاصة</Label>
                    <PrimeDropdown
                      value={form.maqasa_type}
                      options={MAQASA_CODE_OPTIONS}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر"
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("maqasa_type", Number(e.value) || null)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList dir="rtl" className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
              <TabsTrigger value="items" className={voucherTabTriggerClass}>الاصناف</TabsTrigger>
              {showAccountsTab && <TabsTrigger value="accounts" className={voucherTabTriggerClass}>تفاصيل حسابات الاصناف</TabsTrigger>}
              <TabsTrigger value="extra_data" className={voucherTabTriggerClass}>بيانات اضافية</TabsTrigger>
              <TabsTrigger value="quantities" className={voucherTabTriggerClass}>تفاصيل كميات الصنف</TabsTrigger>
              <TabsTrigger value="notes" className={voucherTabTriggerClass}>ملاحظات</TabsTrigger>
              <TabsTrigger value="attachments" className={voucherTabTriggerClass}>المرفقات</TabsTrigger>
              <TabsTrigger value="custom_fields" className={voucherTabTriggerClass}>الحقول الإضافية</TabsTrigger>
            </TabsList>

            <fieldset disabled={isLocked} className="contents">
              <TabsContent value="items" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={itemsGridRef}
                    style={{ height: "300px" }}
                    scheme={scheme}
                    dataSource={itemsCollectionView}
                    idProperty="ser"
                    isReport={false}
                    isReadOnly={isLocked}
                    showContextMenu={false}
                    copyItemStoreDown={true}
                    cellEditEnded={(s: any, e: any) => handleCellEditEnded(s, e)}
                    beginningEdit={(s: any, e: any) => handleBeginningEdit(s, e)}
                    onKeyDown={(s: any, e: any) => handleKeyDown(s, e)}
                    keyActionEnter={KeyAction.None}
                    keyActionTab={KeyAction.None}
                    dontConvertToCards={true}
                  />
                </div>
              </TabsContent>

              {showAccountsTab && (
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
                      copyItemStoreDown={true}
                      dontConvertToCards={true}
                    />
                  </div>
                </TabsContent>
              )}

              <TabsContent value="extra_data" className="mt-4 min-h-[360px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                {!isDeliveryVoucher && (
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <div className="text-sm font-bold text-slate-600">الحسابات</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <AutoCompleteAccount
                        label="حساب الصندوق *"
                        value={form.cash_account_id != null ? String(form.cash_account_id) : ""}
                        valueMode="id"
                        onValueChange={() => {}}
                        onAccountSelect={(account) => {
                          onFormChange("cash_account_id", account?.id ?? null)
                          onFormChange("cash_account_code", account?.code ?? "")
                          onFormChange("cash_account_name", account?.name ?? "")
                        }}
                        disabled={isLocked}
                      />
                      <AutoCompleteAccount
                        label="حساب الضريبة *"
                        value={form.tax_account_id != null ? String(form.tax_account_id) : ""}
                        valueMode="id"
                        onValueChange={() => {}}
                        onAccountSelect={(account) => {
                          onFormChange("tax_account_id", account?.id ?? null)
                          onFormChange("tax_account_code", account?.code ?? "")
                          onFormChange("tax_account_name", account?.name ?? "")
                        }}
                        disabled={isLocked}
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="customer-phone">هاتف العميل</Label>
                    <Input
                      id="customer-phone"
                      value={form.phone}
                      onChange={(e) => onFormChange("phone", e.target.value)}
                      disabled={isLocked}
                      dir="ltr"
                      className="text-right"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="due-date">اخر موعد للدفع</Label>
                    <DateTimeControl
                      id="due-date"
                      value={form.due_date ? form.due_date.slice(0, 10) : ""}
                      disabled={isLocked}
                      onChange={(value) => onFormChange("due_date", value)}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.is_exported_sales}
                    disabled={isLocked}
                    onChange={(e) => onFormChange("is_exported_sales", e.target.checked)}
                  />
                  مبيعات مصدرة
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.vat_included}
                    disabled={isLocked}
                    onChange={(e) => onFormChange("vat_included", e.target.checked)}
                  />
                  السعر في الطباعة يشمل الضريبة
                </label>
              </TabsContent>

              <TabsContent value="quantities" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-3 py-2 text-right">رقم الصنف</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">اسم الصنف</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">الكمية المطلوبة</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">الرصيد الحالي بالمخزون</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.filter((r) => r.product_id).map((row, i) => (
                        <tr key={i}>
                          <td className="border border-slate-200 px-3 py-2">{row.product_code}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.product_name}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.quantity ?? 0}</td>
                          <td className="border border-slate-200 px-3 py-2">
                            {row.product_id != null && stockByProductId[row.product_id] !== undefined ? stockByProductId[row.product_id] : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    ملاحظة
                  </Label>
                  <Textarea value={form.note} onChange={(e) => onFormChange("note", e.target.value)} rows={6} disabled={isLocked} />
                </div>
              </TabsContent>

              <TabsContent value="attachments" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <AttachmentManager modelName="voucher" recordId={form.id > 0 ? form.id : null} disabled={isLocked} />
              </TabsContent>

              <TabsContent value="custom_fields" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="py-4 text-center text-sm text-slate-400">لا توجد حقول إضافية معرّفة لهذا النوع من السندات</p>
              </TabsContent>
            </fieldset>
          </Tabs>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <fieldset disabled={isLocked} className="contents">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <Percent className="h-3.5 w-3.5" />
                  الخصومات والضرائب
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                      <Label>نوع الخصم</Label>
                      <PrimeDropdown
                        value={form.discount_type || "percentage"}
                        options={[
                          { label: "نسبة مئوية", value: "percentage" },
                          { label: "مبلغ ثابت", value: "amount" },
                        ]}
                        optionLabel="label"
                        optionValue="value"
                        disabled={isLocked}
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        panelStyle={{ zIndex: 10000 }}
                        onChange={(e: any) => onFormChange("discount_type", (e.value as "percentage" | "amount") ?? "percentage")}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>قيمة الخصم</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.discount_value || 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          let value = Number.parseFloat(e.target.value) || 0
                          // يُسمَح بقيمة سالبة (كتقريب فاتورة كـ10.89 الى 11 يتطلّب "خصماً سالباً") —
                          // الحد الأعلى وحده يبقى مضبوطاً (100% أو المجموع الفرعي بحسب نوع الخصم).
                          value = form.discount_type === "amount" ? Math.min(value, totals.subtotal) : Math.min(value, 100)
                          onFormChange("discount_value", value)
                        }}
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>نسبة الضريبة (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.vat_percent || 0}
                      // معفاه/صفرية: لا نسبة ضريبة أصلاً — تُصفَّر وتُعطَّل الكتابة المباشرة (انظر
                      // فرع vat_classification_id في PrimeDropdown أعلاه لسبب التصفير التلقائي).
                      disabled={isLocked || form.vat_classification_id === 2 || form.vat_classification_id === 3}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onFormChange("vat_percent", Number.parseFloat(e.target.value) || 0)}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>الصافي للدفع</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={netPayableDraft ?? totals.total.toFixed(2)}
                      onFocus={(e) => {
                        setNetPayableDraft(totals.total.toFixed(2))
                        e.target.select()
                      }}
                      onChange={(e) => setNetPayableDraft(e.target.value)}
                      onBlur={() => {
                        if (netPayableDraft !== null) {
                          const desired = Number.parseFloat(netPayableDraft)
                          if (!Number.isNaN(desired)) applyDesiredNetPayable(desired)
                        }
                        setNetPayableDraft(null)
                      }}
                      className="text-right font-bold"
                      dir="rtl"
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-emerald-700">
                <Calculator className="h-3.5 w-3.5" />
                ملخص المبالغ
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">مجموع الكميات:</span>
                  <span className="font-semibold">{Util.formatNumber(quantityTotal, Util.getSystemSetting(17))}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">المجموع الفرعي:</span>
                  <span className="font-semibold">{Util.formatNumber(totals.subtotal, Util.getSystemSetting(17))}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">الخصم:</span>
                  <span className="font-semibold text-red-600">-{Util.formatNumber(totals.discount, Util.getSystemSetting(17))}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">الضريبة:</span>
                  <span className="font-semibold">{Util.formatNumber(totals.tax, Util.getSystemSetting(17))}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white/70 p-3">
                  <span className="text-base font-bold">المجموع الكلي:</span>
                  <span className="text-xl font-bold text-emerald-700">{Util.formatNumber(totals.total, Util.getSystemSetting(17))}</span>
                </div>
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
        {showAccountsTab && (
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
            // "يجب عرض حساب محاسبي فقط" — نوع 1 في ACCOUNT_TYPE_OPTIONS (account-search-dialog.tsx)،
            // بخلاف AutoCompleteAccount الخاص بالعميل/المورد (searchAllowedTypeValues={[2, 3, 5]}).
            allowedTypeValues={[1]}
            onSelect={(account) => {
              if (itemAccountsSearchRow === null) return
              const row = itemAccountsSearchRow
              patchItemRow(row, {
                account_id: account.id,
                account_code: account.code,
                account_name: account.name,
                account_cost_centers: [],
              })
              pendingAccountsFocusRef.current = { row, col: "btnCostCenter" }
            }}
          />
        )}
        {showAccountsTab && (
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
            value={itemCostCenterRow !== null ? items[itemCostCenterRow]?.account_cost_centers : undefined}
            onChange={(selection) => {
              if (itemCostCenterRow === null) return
              patchItemRow(itemCostCenterRow, { account_cost_centers: selection })
            }}
          />
        )}
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

        <InvoiceFromDeliveryPopup
          open={invoiceFromDeliveryOpen}
          onOpenChange={(open) => {
            setInvoiceFromDeliveryOpen(open)
          }}
          voucherType={voucherType}
          onCancel={() => {
            handleInvoiceSourceTypeChange(1)
          }}
          onSelect={(delivery, customer, items, selectedDeliveries) => {
            const invoiceRate = Number(form.rate || 1)
            const convertedItems = items.map((item) => {
              const unitPrice = Number(item.unit_price || 0)
              const itemSourceRate = Number(item.source_rate || 1)
              const convertedUnitPrice = itemSourceRate && invoiceRate ? Math.round((unitPrice * itemSourceRate / invoiceRate) * 100) / 100 : unitPrice
              const sourceDelivery = selectedDeliveries?.find((entry) => entry.id === item.source_voucher_id) || delivery
              return {
                ...item,
                source_voucher_id: sourceDelivery?.id ?? null,
                source_voucher_type: sourceDelivery?.vch_type ?? null,
                source_currency_id: sourceDelivery?.currency_id ?? null,
                source_currency_code: sourceDelivery?.currency_code ?? "",
                source_rate: sourceDelivery?.rate ?? 1,
                unit_price: convertedUnitPrice,
                ...recalcLineAmounts({ ...item, unit_price: convertedUnitPrice }),
              }
            })

            const sourceSubtotal = (selectedDeliveries || []).reduce((sum, sourceDelivery) => {
              const deliveryItems = items.filter((item) => item.source_voucher_id === sourceDelivery.id)
              const deliverySubtotal = deliveryItems.reduce((deliverySum, item) => {
                const unitPrice = Number(item.unit_price || 0)
                const quantity = Number(item.quantity || 0)
                return deliverySum + unitPrice * quantity
              }, 0)
              return sum + deliverySubtotal
            }, 0)

            const computedDiscountPercent = sourceSubtotal > 0
              ? Math.min(100, Math.max(0, (selectedDeliveries || []).reduce((sum, sourceDelivery) => {
                  const discountValue = Number(sourceDelivery.discount_value || 0)
                  if (!discountValue) return sum
                  const deliveryItems = items.filter((item) => item.source_voucher_id === sourceDelivery.id)
                  const deliverySubtotal = deliveryItems.reduce((deliverySum, item) => {
                    const unitPrice = Number(item.unit_price || 0)
                    const quantity = Number(item.quantity || 0)
                    return deliverySum + unitPrice * quantity
                  }, 0)
                  if (!deliverySubtotal) return sum
                  const equivalentPercent = sourceDelivery.discount_type === "amount"
                    ? (discountValue / deliverySubtotal) * 100
                    : discountValue
                  return sum + (deliverySubtotal * equivalentPercent)
                }, 0) / sourceSubtotal))
              : 0

            onFormChange("account_id", customer.id)
            onFormChange("customer_name", customer.name || "")
            onFormChange("source_voucher_id" as keyof SalesDeliveryRecord, selectedDeliveries?.[0]?.id ?? delivery.id)
            onFormChange("source_voucher_type" as keyof SalesDeliveryRecord, selectedDeliveries?.[0]?.vch_type ?? delivery.vch_type)
            onFormChange("discount_type", "percentage")
            onFormChange("discount_value", Number(computedDiscountPercent.toFixed(2)))
            onItemsChange(convertedItems)
          }}
        />

        <InvoiceFromOrderPopup
          open={invoiceFromOrderOpen}
          onOpenChange={(open) => {
            setInvoiceFromOrderOpen(open)
          }}
          voucherType={voucherType}
          onCancel={() => {
            handleInvoiceSourceTypeChange(1)
          }}
          onSelect={(order, customer, items, selectedOrders) => {
            const invoiceRate = Number(form.rate || 1)
            const convertedItems = items.map((item) => {
              const unitPrice = Number(item.unit_price || 0)
              const itemSourceRate = Number(item.source_rate || 1)
              const convertedUnitPrice = itemSourceRate && invoiceRate ? Math.round((unitPrice * itemSourceRate / invoiceRate) * 100) / 100 : unitPrice
              return {
                ...item,
                source_voucher_id: order.id,
                source_voucher_type: item.source_voucher_type ?? 3,
                source_currency_id: order.currency_id ?? null,
                source_currency_code: order.currency_code ?? "",
                source_rate: order.exchange_rate ?? 1,
                unit_price: convertedUnitPrice,
                ...recalcLineAmounts({ ...item, unit_price: convertedUnitPrice }),
              }
            })

            const sourceSubtotal = items.reduce((sum, item) => {
              const quantity = Number(item.quantity || 0)
              const price = Number(item.unit_price || 0)
              return sum + quantity * price
            }, 0)
            const computedDiscountPercent = sourceSubtotal > 0
              ? Math.min(100, Math.max(0, selectedOrders.reduce((sum, selectedOrder) => {
                  const discountValue = Number(selectedOrder.discount_amount || 0)
                  if (!discountValue) return sum
                  const equivalentPercent = selectedOrder.discount_type === "amount"
                    ? (discountValue / sourceSubtotal) * 100
                    : discountValue
                  return sum + equivalentPercent
                }, 0)))
              : 0

            onFormChange("account_id", customer.id)
            onFormChange("customer_name", customer.name || "")
            onFormChange("source_voucher_id" as keyof SalesDeliveryRecord, order.id)
            onFormChange("source_voucher_type" as keyof SalesDeliveryRecord, 3)
            onFormChange("discount_type", "percentage")
            onFormChange("discount_value", Number(computedDiscountPercent.toFixed(2)))
            onItemsChange(convertedItems)
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
              ? itemsRef.current[expiryLotPickerRow]?.units?.find((u) => u.unit_name === itemsRef.current[expiryLotPickerRow!]?.unit)?.to_main_qnty ?? 1
              : 1
          }
          warehouseName={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.warehouse_name || "" : ""}
          warehouseId={expiryLotPickerRow !== null ? itemsRef.current[expiryLotPickerRow]?.warehouse_id ?? null : null}
          hasBatch={expiryLotPickerRow !== null ? Boolean(itemsRef.current[expiryLotPickerRow]?.has_batch) : false}
          reservedByLot={expiryLotPickerReservedByLot}
          onConfirm={(allocations) => {
            if (expiryLotPickerRow !== null) applyExpiryAllocations(expiryLotPickerRow, allocations)
            setExpiryLotPickerOpen(false)
            setExpiryLotPickerRow(null)
            setExpiryLotPickerReservedByLot({})
          }}
          onCancel={() => {
            if (expiryLotPickerRow !== null) {
              const row = expiryLotPickerRow
              const currentRow = itemsRef.current[row]
              patchItemRow(row, { quantity: null, ...recalcLineAmounts({ ...currentRow, quantity: null }) })
              pendingFocusRef.current = { row, col: "quantity" }
            }
            setExpiryLotPickerOpen(false)
            setExpiryLotPickerRow(null)
            setExpiryLotPickerReservedByLot({})
          }}
        />

        <MeasurementInputDialog
          open={measurementDialogOpen}
          onOpenChange={(open) => {
            setMeasurementDialogOpen(open)
            if (!open) {
              popupHasClosed()
              // نفس نمط AccountSearchDialog أدناه: إن أُغلِقت النافذة بعد تأكيد فقد ضبط onConfirm
              // pendingFocusRef فعلاً (لعمود "unit_price") — استرجاع تركيز افتراضي هنا كان يتسابق
              // معه ويُعيد التركيز أحياناً لعمود "quantity" خطأً. يُطبَّق فقط إن أُغلِقت دون تأكيد.
              if (!pendingFocusRef.current) {
                restoreGridFocus(measurementDialogRow !== null ? { row: measurementDialogRow, col: "quantity" } : null)
              }
            }
          }}
          measurmentId={measurementDialogRow !== null ? Number(itemsRef.current[measurementDialogRow]?.measurment_id || 1) : 1}
          productName={measurementDialogRow !== null ? itemsRef.current[measurementDialogRow]?.product_name : undefined}
          initialValues={
            measurementDialogRow !== null
              ? {
                  length: itemsRef.current[measurementDialogRow]?.length ?? null,
                  width: itemsRef.current[measurementDialogRow]?.width ?? null,
                  height: itemsRef.current[measurementDialogRow]?.height ?? null,
                  count: itemsRef.current[measurementDialogRow]?.count ?? null,
                }
              : undefined
          }
          productLength={measurementDialogRow !== null ? itemsRef.current[measurementDialogRow]?.product_length : null}
          productWidth={measurementDialogRow !== null ? itemsRef.current[measurementDialogRow]?.product_width : null}
          productDensity={measurementDialogRow !== null ? itemsRef.current[measurementDialogRow]?.product_density : null}
          onConfirm={(values, quantity) => {
            if (measurementDialogRow === null) return
            const row = measurementDialogRow
            const patched = { ...itemsRef.current[row], ...values, quantity }
            patchItemRow(row, { ...values, quantity, ...recalcLineAmounts(patched) })
            pendingFocusRef.current = { row, col: "unit_price" }
          }}
        />

        <ConfirmDialogYesNo
          visible={showDeleteConfirm}
          message={form.status === 2 ? "السند مرحل هل تريد الغاؤه منطقياً؟" : `هل تريد حذف هذا ${TITLE}؟`}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete?.()
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        <ConfirmDialogYesNo
          visible={showVatRestoreConfirm}
          message="هل تريد اعادة نسبة الضريبة الى الافتراضية؟"
          onConfirm={() => {
            setShowVatRestoreConfirm(false)
            onFormChange("vat_percent", resolveDefaultVatPercent?.(!!form.is_maqasa) ?? 0)
          }}
          onCancel={() => setShowVatRestoreConfirm(false)}
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

        <PostVoucherDialog
          visible={postDialogOpen}
          isSaving={isSaving}
          onSelect={(action) => {
            setPostDialogOpen(false)
            onSave(action)
          }}
          onCancel={() => setPostDialogOpen(false)}
        />

        {serialsOpen && serialsRow !== null && (
          <Dialog open={serialsOpen} onOpenChange={(open) => !open && setSerialsOpen(false)}>
            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader>
                <DialogTitle>الأرقام التسلسلية — {itemsRef.current[serialsRow]?.product_name}</DialogTitle>
              </DialogHeader>
              <Textarea
                value={serialsDraft}
                onChange={(e) => setSerialsDraft(e.target.value)}
                rows={8}
                placeholder="رقم تسلسلي واحد في كل سطر"
                disabled={isLocked}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSerialsOpen(false)}>إلغاء</Button>
                <Button
                  onClick={() => {
                    const numbers = serialsDraft.split("\n").map((s) => s.trim()).filter(Boolean)
                    patchItemRow(serialsRow, { serial_numbers: numbers })
                    setSerialsOpen(false)
                  }}
                  disabled={isLocked}
                >
                  حفظ
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
