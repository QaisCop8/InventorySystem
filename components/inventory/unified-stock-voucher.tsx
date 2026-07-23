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
import type { JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import StoresSearchPopup from "@/components/products/StoresSearchPopup"
import UnitsSearchPopup from "@/components/products/UnitsSearchPopup"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import DateTimeControl from "@/components/common/date-time-control"
import Util from "@/components/common/Util"
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
  warehouse_id: number | null
  warehouse_name: string
  unit: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  batch_number: string
  expiry_date: string
  note: string
  expense_account_id: number | null
  purchase_account_id: number | null
  expense_cost_centers: JournalCostCenterSelection[]
  purchase_cost_centers: JournalCostCenterSelection[]
  // للعرض فقط (تفاصيل كميات الصنف) — لا تُرسَل للحفظ.
  current_stock?: number
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
const SPECIAL_PRICE_CATEGORIES = [
  { id: -1, name: "سعر الإنتاج", disabled: true },
  { id: -2, name: "يدوي", disabled: false },
  { id: -3, name: "متوسط الأسعار", disabled: false },
  { id: -4, name: "داخل أول خارج أول", disabled: false },
  { id: -5, name: "اخر سعر", disabled: false },
]

const emptyItemRow: VoucherItemRow = {
  product_id: null,
  product_code: "",
  product_name: "",
  warehouse_id: null,
  warehouse_name: "",
  unit: "",
  quantity: null,
  unit_price: null,
  total_price: null,
  batch_number: "",
  expiry_date: "",
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
  if (grid.columns) return grid
  return grid.control || null
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
  const isInternalDelivery = voucherType === INTERNAL_DELIVERY_VCH_TYPE
  const isUseVoucher = voucherType === USE_VOUCHER_VCH_TYPE
  // شارة الحالة في عنوان النافذة: ملغي منطقياً (status=3) تطغى على أي شيء آخر؛ خلاف ذلك "مرحل"
  // وحدها إن لم تُطبع بعد، أو "مرحل - مطبوع" إن طُبعت (is_printed=1) بعد الترحيل — مطابق لِـ
  // unified-receipt-voucher.tsx.
  const isLocked = form.status === 2 || form.status === 3
  const statusBadge =
    form.status === 3 ? "ملغي منطقياً" : form.status === 2 ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل") : ""
  // ترتيب التنقل بـ Tab/Enter بين أعمدة شبكة الأصناف — يطابق ترتيب الأعمدة الفعلي في scheme
  // (batch_number وexpiry_date مُستثنيان لِـ"ارسالية داخلية" لأنهما غير مرئيين أصلاً في تلك الشبكة).
  const fieldOrder = isInternalDelivery
    ? ["product_code", "warehouse_name", "unit", "quantity", "unit_price", "note"]
    : ["product_code", "warehouse_name", "unit", "quantity", "unit_price", "batch_number", "expiry_date", "note"]
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

  const [itemsCollectionView] = useState(() => new wjcCore.CollectionView<any>([]))
  const chequeGridRef = useRef<any>(null) // اسم مطابق للاصطلاح المستخدم سابقاً (مرجع للشبكة الرئيسية)
  const pendingFocusRef = useRef<{ row: number; col: string } | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const patchItemRow = (index: number, patch: Partial<VoucherItemRow>) => {
    if (isLocked) return
    const next = itemsRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
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

  // بحث صنف بكوده بعد تطبيعه لطول ثابت (حرف بادئة + 7 أرقام، مثل B207 → B0000207) — نفس منطق
  // Util.adjustCode المستخدم في unified-sales-order.tsx، مطبَّق هنا على شبكة سندات الحركات.
  const lookupProductByCode = async (row: number, code: string) => {
    try {
      const res = await fetch(`/api/inventory/products/search?query=${encodeURIComponent(code)}&priceCategoryId=0`)
      if (!isMountedRef.current) return
      if (!res.ok) throw new Error("not found")
      const product = await res.json()
      if (!isMountedRef.current) return
      if (!product || !product.id) throw new Error("not found")
      const currentRow = itemsRef.current[row]
      const unitPrice = product.price != null ? Number(product.price) : 0
      const warehousePatch = currentRow?.warehouse_id ? null : resolveDefaultWarehouse(product)
      patchItemRow(row, {
        product_id: product.id,
        product_code: product.product_code,
        product_name: product.product_name,
        unit: product.unit_name || currentRow?.unit || "",
        unit_price: unitPrice,
        total_price: recalcAmount(currentRow?.quantity ?? 0, unitPrice),
        units: normalizeUnits(product.units),
        ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
      })
    } catch {
      if (!isMountedRef.current) return
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد صنف بهذا الرقم: ${code}`, life: 3000 }])
      patchItemRow(row, { product_id: null, product_name: "" })
    }
  }

  const handleCellEditEnded = (grid: any, e: any) => {
    chequeGridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    const value = grid.getCellData(row, e.col, false)
    if (colName === "product_code") {
      const rawValue = String(value ?? "").trim()
      if (!rawValue) {
        patchItemRow(row, { product_code: "", product_id: null, product_name: "" })
        return
      }
      const adjusted = Util.adjustCode(rawValue, 8).toUpperCase()
      patchItemRow(row, { product_code: adjusted })
      void lookupProductByCode(row, adjusted)
    } else if (colName === "quantity") {
      const quantity = value === "" || value === null ? null : Number(value)
      patchItemRow(row, { quantity, total_price: recalcAmount(quantity, itemsRef.current[row]?.unit_price ?? null) })
    } else if (colName === "unit_price") {
      const unitPrice = value === "" || value === null ? null : Number(value)
      patchItemRow(row, { unit_price: unitPrice, total_price: recalcAmount(itemsRef.current[row]?.quantity ?? null, unitPrice) })
    } else if (colName === "unit") {
      patchItemRow(row, { unit: String(value ?? "") })
    } else if (colName === "batch_number") {
      patchItemRow(row, { batch_number: String(value ?? "") })
    } else if (colName === "expiry_date") {
      if (value === null || value === "") {
        patchItemRow(row, { expiry_date: "" })
        return
      }
      const parsed = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "تاريخ الانتهاء غير صحيح", life: 3000 }])
        patchItemRow(row, { expiry_date: itemsRef.current[row]?.expiry_date || "" })
        return
      }
      patchItemRow(row, { expiry_date: parsed.toISOString().slice(0, 10) })
    } else if (colName === "note") {
      patchItemRow(row, { note: String(value ?? "") })
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

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      grid.finishEditing?.()
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

      const currentFieldIndex = fieldOrder.indexOf(colName)
      if (currentFieldIndex === -1) return

      const isLastColumn = currentFieldIndex === fieldOrder.length - 1
      if (isLastColumn) {
        const isLastRow = row === itemsRef.current.length - 1
        if (isLastRow && currentRow?.product_id && Number(currentRow?.quantity || 0) > 0) {
          pendingFocusRef.current = { row: row + 1, col: "product_code" }
          addItemRow()
          return
        }
        selectCell(grid, row + 1 <= itemsRef.current.length - 1 ? row + 1 : row, "product_code")
        return
      }

      selectCell(grid, row, fieldOrder[currentFieldIndex + 1])
    }
  }

  const pendingFocusRow = useRef<number | null>(null)

  // مستودع الصنف الافتراضي عند اختياره في السند: مستودع الصنف نفسه (products.default_store)
  // → المستودع الافتراضي للمستخدم (defaultItemWarehouseId) → أول مستودع في النظام.
  // يُعيد null صراحةً عند تعذّر إيجاد أي مرشّح (بدل كائن "أجوَف" {id:null}) حتى يُفرَّق بوضوح
  // في نقاط الاستدعاء بين "لا يوجد مستودع افتراضي على الإطلاق" و"تم إيجاد مستودع".
  const resolveDefaultWarehouse = (product: any): { id: number; name: string } | null => {
    const productWarehouseId = product?.default_store ? Number(product.default_store) : null
    const candidateId = productWarehouseId || (defaultItemWarehouseId ? Number(defaultItemWarehouseId) : null)
    if (candidateId) {
      const match = warehouses.find((w) => Number(w.id) === candidateId)
      if (match) return { id: match.id, name: match.warehouse_name }
      return { id: candidateId, name: "" }
    }
    const first = warehouses[0]
    return first ? { id: first.id, name: first.warehouse_name } : null
  }

  const handleProductSelect = (products: any[]) => {
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
    const warehousePatch = currentRow?.warehouse_id ? null : resolveDefaultWarehouse(product)
    patchItemRow(row, {
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      unit: unit?.unit_name || product.first_unit || "",
      unit_price: unit?.price ?? product.first_price ?? 0,
      total_price: recalcAmount(itemsRef.current[row]?.quantity ?? 0, unit?.price ?? product.first_price ?? 0),
      units: normalizeUnits(product.units),
      ...(warehousePatch ? { warehouse_id: warehousePatch.id, warehouse_name: warehousePatch.name } : {}),
    })
    pendingFocusRef.current = { row, col: "quantity" }
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

  const scheme = useMemo(
    () => ({
      name: "StockVoucherItemsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number", visible: Util.getVoucherSettingScreenData(voucherType, "ser") },
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
        { header: "المستودع", name: "warehouse_name", width: 140, visible: Util.getVoucherSettingScreenData(voucherType, "store") },
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
          visible: Util.getVoucherSettingScreenData(voucherType, "store"),
          visibleInColumnChooser: true,
        },
        { header: "الوحدة", name: "unit", width: 90, visible: Util.getVoucherSettingScreenData(voucherType, "unit") },
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
        { header: "الكمية", name: "quantity", width: 100, dataType: "Number" },
        { header: "السعر", name: "unit_price", width: 100, dataType: "Number", visible: Util.getVoucherSettingScreenData(voucherType, "price") },
        { header: "المبلغ", name: "total_price", width: 110, dataType: "Number", isReadOnly: true },
        { header: "الرقم التشغيلي", name: "batch_number", width: 110, visible: !isInternalDelivery && Util.getVoucherSettingScreenData(voucherType, "batch") },
        {
          header: "تاريخ الانتهاء",
          name: "expiry_date",
          width: 130,
          dataType: "Date",
          visible: !isInternalDelivery && Util.getVoucherSettingScreenData(voucherType, "expiry_date"),
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
    [isLocked, isInternalDelivery, voucherType],
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

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}>
      <DialogContent
        className="stock-voucher-form flex h-[96vh] w-[97vw] max-w-[1500px] max-h-[96vh] flex-col overflow-hidden p-0"
        dir="rtl"
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

                {isInternalDelivery ? (
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>
                ) : (
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
                    {isUseVoucher && (
                      <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                        <Label>المستودع</Label>
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
                )}

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
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap w-56">
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
                  <div className="space-y-4">
                    {items.filter((r) => r.product_id).map((row, i) => {
                      const realIndex = items.indexOf(row)
                      return (
                        <div key={realIndex} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
                          <div className="md:col-span-2 text-sm font-semibold text-slate-600">{row.product_name}</div>
                          <AutoCompleteAccount
                            label="حساب المصروف"
                            value={row.expense_account_id != null ? String(row.expense_account_id) : ""}
                            valueMode="id"
                            onValueChange={() => {}}
                            onAccountSelect={(account) => patchItemRow(realIndex, { expense_account_id: account?.id ?? null })}
                            requiredTypeValues={[1]}
                            showCostCenterButton
                            costCenters={row.expense_cost_centers}
                            onCostCentersChange={(value) => patchItemRow(realIndex, { expense_cost_centers: value })}
                            disabled={isLocked}
                          />
                          <AutoCompleteAccount
                            label="حساب المشتريات"
                            value={row.purchase_account_id != null ? String(row.purchase_account_id) : ""}
                            valueMode="id"
                            onValueChange={() => {}}
                            onAccountSelect={(account) => patchItemRow(realIndex, { purchase_account_id: account?.id ?? null })}
                            requiredTypeValues={[1]}
                            showCostCenterButton
                            costCenters={row.purchase_cost_centers}
                            onCostCentersChange={(value) => patchItemRow(realIndex, { purchase_cost_centers: value })}
                            disabled={isLocked}
                          />
                        </div>
                      )
                    })}
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
