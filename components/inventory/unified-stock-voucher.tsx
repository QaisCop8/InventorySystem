"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import DateTimeControl from "@/components/common/date-time-control"
import Util from "@/components/common/Util"
import { FileText, Package, Calculator, MessageSquare } from "lucide-react"

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
  isSaving?: boolean
  currentIndex?: number
  totalRecords?: number
  isFirstRecord?: boolean
  isLastRecord?: boolean
  onNew?: () => void
  onSave?: () => void
  onDelete?: () => void
  onNavigate?: (direction: "first" | "previous" | "next" | "last") => void
  errorMessages?: string[]
}

const TYPE_LABELS: Record<StockVoucherType, { title: string }> = {
  12: { title: "سند ادخال بضاعة" },
  13: { title: "سند اخراج بضاعة" },
  14: { title: "ارسالية داخلية" },
  15: { title: "سند استعمال" },
}

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

// انتقال ملاحظة عن سباق مشابه لِما وُوجِه في unified-receipt-voucher.tsx هذه الجلسة: شبكة Wijmo
// تُصفّر تحديدها عند كل تبديل لمرجع itemsSource — لذا تُستخدم هنا نفس الحلول المُثبَتة: كائن
// CollectionView ثابت لا يُستبدَل أبداً (بدل useMemo يُنتج مصفوفة جديدة كل تعديل)، وresolveFlexControl
// لتطبيع غلاف React الذي قد يُخزَّن أحياناً بدل عنصر التحكم الفعلي في مرجع الشبكة.
const resolveFlexControl = (grid: any): any => (grid && grid.control && !grid.columns ? grid.control : grid)

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
  isSaving = false,
  currentIndex = 0,
  totalRecords = 0,
  isFirstRecord = true,
  isLastRecord = true,
  onNew,
  onSave,
  onDelete,
  onNavigate,
  errorMessages = [],
}: UnifiedStockVoucherProps) {
  const labels = TYPE_LABELS[voucherType]
  const isInternalDelivery = voucherType === INTERNAL_DELIVERY_VCH_TYPE
  const isUseVoucher = voucherType === USE_VOUCHER_VCH_TYPE
  const isLocked = form.status === 2 || form.status === 3
  // ترتيب التنقل بـ Tab/Enter بين أعمدة شبكة الأصناف — يطابق ترتيب الأعمدة الفعلي في scheme
  // (batch_number وexpiry_date مُستثنيان لِـ"ارسالية داخلية" لأنهما غير مرئيين أصلاً في تلك الشبكة).
  const fieldOrder = isInternalDelivery
    ? ["product_code", "warehouse_name", "unit", "quantity", "unit_price", "note"]
    : ["product_code", "warehouse_name", "unit", "quantity", "unit_price", "batch_number", "expiry_date", "note"]
  const messagesRef = useRef<any>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState("items")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [warehouseSearchOpen, setWarehouseSearchOpen] = useState(false)
  const [warehouseSearchRow, setWarehouseSearchRow] = useState<number | null>(null)
  const [warehouseSearchTarget, setWarehouseSearchTarget] = useState<"row" | "from_store" | "to_store">("row")

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.show?.(errorMessages.map((detail) => ({ severity: "error", summary: "", detail, life: 4000 })))
    }
  }, [errorMessages])

  // ينتقل التركيز إلى تاريخ السند عند فتح الحوار أو عرض سجل مختلف (سجل جديد، سجل تم التنقل إليه،
  // أو إعادة ضبط الحقول بعد الحفظ) — مطابق لِـ unified-receipt-voucher.tsx.
  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => dateInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code])

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
  const resolveDefaultWarehouse = (product: any): { id: number | null; name: string } => {
    const productWarehouseId = product?.default_store ? Number(product.default_store) : null
    const candidateId = productWarehouseId || (defaultItemWarehouseId ? Number(defaultItemWarehouseId) : null)
    if (candidateId) {
      const match = warehouses.find((w) => Number(w.id) === candidateId)
      if (match) return { id: match.id, name: match.warehouse_name }
      return { id: candidateId, name: "" }
    }
    const first = warehouses[0]
    return first ? { id: first.id, name: first.warehouse_name } : { id: null, name: "" }
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

  const handleRequestSave = () => {
    onSave?.()
  }

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
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="stock-voucher-form flex h-[96vh] w-[97vw] max-w-[1500px] max-h-[96vh] flex-col overflow-hidden p-0"
        dir="rtl"
      >
        <UniversalToolbar
          currentRecord={currentIndex + 1}
          totalRecords={totalRecords}
          onNew={onNew}
          onSave={handleRequestSave}
          onDelete={() => setShowDeleteConfirm(true)}
          onFirst={() => onNavigate?.("first")}
          onPrevious={() => onNavigate?.("previous")}
          onNext={() => onNavigate?.("next")}
          onLast={() => onNavigate?.("last")}
          isSaving={isSaving}
          canSave={!isLocked}
          canDelete={form.id > 0 && form.status !== 3}
          isFirstRecord={isFirstRecord}
          isLastRecord={isLastRecord}
        />

        <div
          className="relative min-h-0 flex-1 overflow-y-auto rounded-b-3xl bg-slate-50/60 px-6 py-4"
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
            </DialogTitle>
          </DialogHeader>

          <fieldset disabled={isLocked} className="contents">
            {/* تفاصيل السند + تفاصيل المستودعات/العميل */}
            <div className="grid gap-4 lg:grid-cols-2">
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
                      <Input id="vch-code" value={form.vch_code} onChange={(e) => onFormChange("vch_code", e.target.value)} maxLength={20} />
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
                        onChange={(e: any) => onFormChange("currency_id", e.value ?? null)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-rate">سعر الصرف *</Label>
                      <Input
                        id="vch-rate"
                        type="number"
                        value={numberValue(form.rate)}
                        onChange={(e) => onFormChange("rate", e.target.value ? Number(e.target.value) : 1)}
                        disabled={form.currency_id != null && form.currency_id === baseCurrencyId}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-manual-code">سند يدوي</Label>
                      <Input id="vch-manual-code" value={form.manual_voucher} onChange={(e) => onFormChange("manual_voucher", e.target.value)} maxLength={30} />
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

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <Package className="h-3.5 w-3.5" />
                  {isInternalDelivery ? "تفاصيل المستودعات" : "تفاصيل العميل"}
                </div>
                {isInternalDelivery ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>من مستودع *</Label>
                      <div className="flex gap-2 invoice-currency-dropdown-wrap">
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
                  <div className="grid gap-3">
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
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList>
                <TabsTrigger value="items">الاصناف</TabsTrigger>
                <TabsTrigger value="quantities">تفاصيل كميات الصنف</TabsTrigger>
                {isUseVoucher && <TabsTrigger value="accounts">تفاصيل حسابات الاصناف</TabsTrigger>}
                <TabsTrigger value="notes">ملاحظات</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={chequeGridRef}
                    style={{ height: "300px" }}
                    scheme={scheme}
                    dataSource={itemsCollectionView}
                    idProperty="ser"
                    isReport={isLocked}
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
            </Tabs>
          </fieldset>

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

        <ConfirmDialogYesNo
          visible={showDeleteConfirm}
          message={form.status === 2 ? "السند مرحل هل تريد الغاؤه منطقياً؟" : `هل تريد حذف هذا ${labels.title}؟`}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete?.()
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
