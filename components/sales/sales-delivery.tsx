"use client"

import { salesVoucherSnapshot } from "@/lib/sales-voucher-changes"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { ReceiptText } from "lucide-react"
import { peekVoucherPrefill, VOUCHER_PREFILL_EVENT } from "@/lib/ai-voucher-prefill"
import { useVoucherDeepLink } from "@/hooks/use-voucher-deep-link"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Plus, Search } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { VoucherDocumentPrinter } from "@/components/common/voucher-print-layout"
import type { PrintDocument } from "@/lib/voucher-print/document"
import { salesVoucherDocument } from "@/lib/voucher-print/sales"
import { shippingPrintFields } from "@/components/sales/shipping-address-dialog"
import UnifiedSalesDelivery, {
  type SalesDeliveryRecord,
  type SalesVoucherItemRow,
  type SalesVoucherSubType,
  SALES_VOUCHER_TYPE_LABELS,
  SALES_INVOICE_VCH_TYPE,
  RETURN_SELL_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  RETURN_PURCHASE_VCH_TYPE,
  DELIVERY_SELL_VCH_TYPE,
  DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  DELIVERY_PAY_VCH_TYPE,
  RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  SALES_DIRECTION_VCH_TYPES,
  toGridDateString,
} from "./unified-sales-delivery"
import type { PostVoucherAction } from "@/components/common/post-voucher-dialog"
import { useWorkspace } from "@/contexts/workspace-context"
import { serialsSummary } from "@/components/inventory/item-serials-dialog"
import { VoucherListTable, VoucherSearchButton, searchOnEnter, useVoucherListSearch } from "@/components/common/voucher-list-table"
import { logVoucherAudit } from "@/lib/audit-client"
import { useAnnounceTransactionSaved } from "@/lib/transaction-success"

interface LookupOption {
  id: number
  name: string
}
interface CurrencyRate {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}
interface WarehouseOption {
  id: number
  warehouse_name: string
  code: string
}

interface SalesDeliveryProps {
  voucherType: SalesVoucherSubType
}

// نفس الأنواع الأربعة التي يظهر لها تبويب "تفاصيل حسابات الاصناف" في unified-sales-delivery.tsx
// (ITEM_ACCOUNT_CONFIG هناك) — يجب أن يحمل كل صنف حساباً قبل الحفظ لهذه الأنواع فقط.
const ITEM_ACCOUNT_VCH_TYPES = new Set<SalesVoucherSubType>([
  SALES_INVOICE_VCH_TYPE,
  RETURN_SELL_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  RETURN_PURCHASE_VCH_TYPE,
])

const emptyItemRow: SalesVoucherItemRow = {
  product_id: null,
  product_code: "",
  product_name: "",
  barcode: "",
  warehouse_id: null,
  warehouse_name: "",
  unit: "",
  unit_name: "",
  quantity: null,
  bonus_quantity: null,
  unit_price: null,
  discount_percent: null,
  total_price: null,
  line_amount: null,
  batch_number: "",
  expiry_date: "",
  serial_numbers: [],
  source_voucher_id: null,
  source_voucher_type: null,
  note: "",
  length: null,
  width: null,
  height: null,
  count: null,
  account_id: null,
}

export default function SalesDelivery({ voucherType }: SalesDeliveryProps) {
  const { user, activeBranchId } = useAuth()
  const { fullscreenEnabled } = useWorkspace()
  const TITLE = SALES_VOUCHER_TYPE_LABELS[voucherType].title
  const LIST_TITLE = SALES_VOUCHER_TYPE_LABELS[voucherType].listTitle

  // نسبة الضريبة الافتراضية (system_settings.tax_rate، الإعدادات العامة) — تُجلَب مرة واحدة عند
  // فتح الشاشة (fetchLookups أدناه) وتُقرأ هنا كمرجع بدل حالة React، إذ لا داعي لإعادة رسم الشاشة
  // عند وصولها؛ تُستخدَم فقط عند بناء سند جديد لاحقاً.
  const defaultVatPercentRef = useRef<number>(0)
  // نسبة الضريبة الافتراضية عند المقاصة (system_settings.tax_rate_clearing) — تُستخدَم بدل
  // defaultVatPercentRef أعلاه فقط عند تأكيد المستخدم إعادة النسبة الافتراضية وform.is_maqasa فعّال
  // (انظر resolveDefaultVatPercent أدناه وhandleVatClassificationChange في unified-sales-delivery.tsx).
  const defaultVatPercentClearingRef = useRef<number>(0)
  const resolveDefaultVatPercent = (isMaqasa: boolean) =>
    isMaqasa ? defaultVatPercentClearingRef.current : defaultVatPercentRef.current
  // حساب الضريبة الافتراضي (تبويب "بيانات اضافية") — من الحسابات الافتراضية بالإعدادات العامة:
  // default_sales_tax_account لأنواع المبيعات (فاتورة/إرسالية مبيعات وبرسم البيع ومرتجعاتها)،
  // default_purchase_tax_account لأنواع المشتريات — يُحدَّد اتجاه هذا السند بمجرد اختيار voucherType
  // (خاصية ثابتة للشاشة كاملة، لا لكل سند)، فيُجلَب مرة واحدة أيضاً عند فتح الشاشة.
  const defaultTaxAccountRef = useRef<{ id: number; code: string; name: string } | null>(null)
  // Cache the current user's branch defaults for the initial new-voucher render.
  // Opening the voucher or changing branch/currency refreshes these from the server.
  const cashAccountsByCurrencyRef = useRef<Map<number, { id: number; code: string; name: string }>>(new Map())
  const cashAccountScopeRef = useRef<string>("")
  // "اعدادات اخرى" (تبويب الحسابات الافتراضية للمستخدم) — إن فُعِّل، يُعامَل ما يكتبه المستخدم في
  // عمود "السعر" كسعر شامل الضريبة فيُحوَّل فوراً لغير شامل قبل تخزينه في unit_price (انظر
  // handleCellEditEnded في unified-sales-delivery.tsx).
  const [priceEntryIncludesTax, setPriceEntryIncludesTax] = useState(false)

  const resolveCashAccountForCurrency = (currencyId: number | null) => {
    if (!currencyId || cashAccountScopeRef.current !== `${user?.id}:${activeBranchId}`) return null
    return cashAccountsByCurrencyRef.current.get(currencyId) ?? null
  }

  // مُعرَّفتان هنا (لا بمستوى الوحدة) لاعتمادهما على voucherType الخاص بهذه الشاشة تحديداً — نفس
  // النوع يُستخدَم عند بناء أي سند جديد/فارغ بدل النوع 17 (إرسالية مبيعات) الثابت سابقاً.
  const buildInitialForm = (): SalesDeliveryRecord => ({
    id: 0,
    vch_type: voucherType,
    vch_code: "",
    vch_date: new Date().toISOString().slice(0, 10),
    vch_book_id: null,
    branch_id: activeBranchId ?? null,
    currency_id: null,
    rate: 1,
    account_id: null,
    customer_name: "",
    to_store_id: null,
    salesman_id: null,
    shipping_address: "",
    shipping_info: null,
    linked_order_id: null,
    discount_type: "percentage",
    discount_value: 0,
    vat_percent: defaultVatPercentRef.current,
    amount: 0,
    manual_voucher: "",
    manual_date: new Date().toISOString().slice(0, 10),
    note: "",
    status: 1,
    is_printed: 0,
    vat_classification_id: 1,
    invoice_type: 1,
    invoice_source_type: 1,
    vat_included: false,
    is_maqasa: false,
    maqasa_type: null,
    cash_account_id: null,
    cash_account_code: "",
    cash_account_name: "",
    tax_account_id: defaultTaxAccountRef.current?.id ?? null,
    tax_account_code: defaultTaxAccountRef.current?.code ?? "",
    tax_account_name: defaultTaxAccountRef.current?.name ?? "",
    phone: "",
    due_date: "",
    is_exported_sales: false,
    city_id: null,
    source_voucher_id: null,
    source_voucher_type: null,
    has_linked_invoice: false,
    items: [{ ...emptyItemRow }],
  })

  const normalizeVoucher = (record: Partial<SalesDeliveryRecord>): SalesDeliveryRecord => ({
    ...buildInitialForm(),
    ...record,
    manual_date: record.manual_date || record.vch_date || buildInitialForm().manual_date,
    items: record.items?.length
      ? (record.items as any[]).map((item) => ({
          ...emptyItemRow,
          ...item,
          product_id: item.product_id ?? item.item_id ?? null,
          product_code: String(item.product_code || item.current_product_code || "").trim(),
          product_name: String(item.product_name || item.current_product_name || item.item_name || "").trim(),
          barcode: String(item.barcode || "").trim(),
          warehouse_id: item.warehouse_id ?? item.store_id ?? null,
          warehouse_name: String(item.warehouse_name || ""),
          unit: String(item.unit || item.unit_name || "").trim(),
          unit_name: String(item.unit_name || item.unit || "").trim(),
          quantity: item.quantity ?? item.qnty ?? null,
          bonus_quantity: item.bonus_quantity ?? item.bonus ?? null,
          unit_price: item.price != null ? Number(item.price) : null,
          discount_percent: item.discount_percent ?? item.discount ?? null,
          total_price: item.total_price ?? item.amount ?? item.line_amount ?? (Number(item.quantity ?? item.qnty ?? 0) * Number(item.price ?? 0)),
          line_amount: item.line_amount ?? item.amount ?? item.total_price ?? (Number(item.quantity ?? item.qnty ?? 0) * Number(item.price ?? 0)),
          batch_number: String(item.batch_number || item.batch_no || ""),
          expiry_date: toGridDateString(item.expiry_date),
          serial_numbers: Array.isArray(item.serial_numbers) ? item.serial_numbers : [],
          has_serial: item.has_serial === undefined ? undefined : Boolean(item.has_serial),
          serials: Array.isArray(item.serials) ? item.serials : [],
          serials_text: item.has_serial ? serialsSummary({ ...item, quantity: item.quantity ?? item.qnty, bonus_quantity: item.bonus_quantity ?? item.bonus }) : "",
          source_voucher_id: item.source_voucher_id ?? null,
          source_voucher_type: item.source_voucher_type ?? null,
          order_item_id: item.order_item_id == null ? null : Number(item.order_item_id),
          delivery_item_id: item.delivery_item_id == null ? null : Number(item.delivery_item_id),
          note: String(item.note || ""),
          length: item.length ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          count: item.count ?? null,
          account_id: item.account_id ?? null,
          account_code: String(item.account_code || ""),
          account_name: String(item.account_name || ""),
        }))
      : [{ ...emptyItemRow }],
  })


  const [vouchers, setVouchers] = useState<SalesDeliveryRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [defaultBookId, setDefaultBookId] = useState<number | null>(null)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<number | null>(null)
  const [salesmen, setSalesmen] = useState<LookupOption[]>([])
  const [cities, setCities] = useState<LookupOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setFormState] = useState<SalesDeliveryRecord>(buildInitialForm())
  const formRef = useRef(form)
  const cleanFormRef = useRef(form)
  const copiedVoucherRef = useRef(false)
  const editForm = (update: SalesDeliveryRecord | ((current: SalesDeliveryRecord) => SalesDeliveryRecord)) => {
    const next = typeof update === "function" ? update(formRef.current) : update
    formRef.current = next
    setFormState(next)
  }
  // Only loading/new/successful-save transitions establish a clean baseline.
  const setForm = (update: SalesDeliveryRecord | ((current: SalesDeliveryRecord) => SalesDeliveryRecord)) => {
    bookChangeRequestRef.current++
    pendingBookChangeRef.current = null
    editForm(update)
    cleanFormRef.current = structuredClone(formRef.current)
    copiedVoucherRef.current = false
  }
  const hasUnsavedChanges = (items = formRef.current.items) => copiedVoucherRef.current ||
    salesVoucherSnapshot({ ...formRef.current, items }) !== salesVoucherSnapshot(cleanFormRef.current)
  const bookChangeRequestRef = useRef(0)
  const pendingBookChangeRef = useRef<Promise<void> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [printData, setPrintData] = useState<PrintDocument | null>(null)
  // "تمت العملية بنجاح" في نافذة السند بعد نجاح الحفظ (lib/transaction-success.ts)
  const announceSaved = useAnnounceTransactionSaved()
  const printCurrencyName = (currencyId: number | null) => {
    const currency = currencies.find((item) => Number(item.currency_id ?? item.id) === Number(currencyId))
    return currency?.currency_name || currency?.currency_code || ""
  }
  const [gridResetToken, setGridResetToken] = useState(0)

  useEffect(() => {
    if (!dialogOpen || isLoading || !user?.id || !form.branch_id) return
    let cancelled = false
    const branchId = form.branch_id
    const currencyId = form.currency_id
    const voucherId = form.id
    const originalAccountId = form.cash_account_id
    fetch(`/api/settings/users-currencies-default?user_id=${encodeURIComponent(user.id)}&branch_id=${branchId}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("تعذر تحميل حساب الصندوق الافتراضي")
        return response.json()
      })
      .then(data => {
        if (cancelled) return
        const map = new Map<number, { id: number; code: string; name: string }>()
        for (const row of Array.isArray(data?.rows) ? data.rows : []) {
          const id = Number(row.cash_account_id)
          if (Number.isSafeInteger(id) && id > 0) map.set(Number(row.currency_id), { id, code: row.cash_account_code || "", name: row.cash_account_name || "" })
        }
        cashAccountsByCurrencyRef.current = map
        cashAccountScopeRef.current = `${user.id}:${branchId}`
        const account = currencyId ? map.get(currencyId) : null
        editForm(current => {
          if (current.id !== voucherId || current.branch_id !== branchId || current.currency_id !== currencyId || current.cash_account_id !== originalAccountId || [2, 3].includes(Number(current.status))) return current
          // Preserve a saved/manual account on opening; branch/currency changes clear it first.
          if (current.id > 0 && current.cash_account_id) return current
          const defaults = { cash_account_id: account?.id ?? null, cash_account_code: account?.code ?? "", cash_account_name: account?.name ?? "" }
          // Defaults are not user edits; preserve other outstanding changes.
          cleanFormRef.current = { ...cleanFormRef.current, ...defaults }
          return { ...current, ...defaults }
        })
      })
      .catch(error => { if (!cancelled) setErrorMessages([error.message]) })
    return () => { cancelled = true }
  }, [dialogOpen, isLoading, user?.id, form.id, form.branch_id, form.currency_id, gridResetToken])


  const listSearch = useVoucherListSearch({ code: "", dateFrom: "", dateTo: "" })
  const { draft: searchDraft, setDraft: setSearchDraft, filters: searchFilters } = listSearch
  const runSearch = () => void listSearch.load(fetchVouchers, searchDraft)

  const totalVouchers = vouchers.length
  const totalAmount = useMemo(() => vouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0), [vouchers])

  const currencyOptions = useMemo(
    () => currencies.map((c) => ({ value: Number(c.currency_id ?? c.id), label: c.currency_name || c.currency_code || "" })),
    [currencies],
  )
  const baseCurrencyId = useMemo(
    () =>
      currencies.reduce<number | null>((min, c) => {
        const id = Number(c.currency_id ?? c.id)
        if (!Number.isFinite(id)) return min
        return min === null || id < min ? id : min
      }, null),
    [currencies],
  )

  const filteredVouchers = useMemo(() => {
    const codeQuery = searchFilters.code.trim().toLowerCase()
    return vouchers.filter((voucher) => {
      if (codeQuery && !voucher.vch_code.toLowerCase().includes(codeQuery)) return false
      if (searchFilters.dateFrom && voucher.vch_date?.slice(0, 10) < searchFilters.dateFrom) return false
      if (searchFilters.dateTo && voucher.vch_date?.slice(0, 10) > searchFilters.dateTo) return false
      return true
    })
  }, [vouchers, searchFilters])

  useEffect(() => {
    void listSearch.load(fetchVouchers)
    fetchLookups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const fetchVouchers = async () => {
    try {
      const response = await fetch(`/api/sales-vouchers?vch_type=${voucherType}`)
      const data = await response.json()
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch sales delivery vouchers", error)
      setVouchers([])
    }
  }

  const fetchLookups = async () => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${voucherType}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const warehouseDefaultsUrl = user?.id ? `/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}` : null
      const [currenciesRes, booksRes, warehousesRes, warehouseDefaultsRes, salesmenRes, systemSettingsRes, citiesRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(booksUrl).catch(() => null),
        fetch("/api/warehouses").catch(() => null),
        warehouseDefaultsUrl ? fetch(warehouseDefaultsUrl).catch(() => null) : Promise.resolve(null),
        fetch("/api/salesmen").catch(() => null),
        fetch("/api/settings/system").catch(() => null),
        fetch("/api/cities").catch(() => null),
      ])
      if (currenciesRes?.ok) {
        const data = await currenciesRes.json()
        setCurrencies(Array.isArray(data?.rates) ? data.rates : [])
      }
      if (booksRes?.ok) {
        const data = await booksRes.json()
        setVoucherBooks(Array.isArray(data?.books) ? data.books : [])
        setDefaultBookId(data?.default_book_id ?? null)
      }
      if (warehousesRes?.ok) {
        const data = await warehousesRes.json()
        setWarehouses(Array.isArray(data) ? data : [])
      }
      if (warehouseDefaultsRes?.ok) {
        const data = await warehouseDefaultsRes.json()
        setDefaultItemWarehouseId(data?.default_item_warehouse_id ?? null)
        setPriceEntryIncludesTax(Boolean(data?.price_entry_includes_tax))
      } else {
        setDefaultItemWarehouseId(null)
        setPriceEntryIncludesTax(false)
      }
      if (salesmenRes?.ok) {
        const data = await salesmenRes.json()
        const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.salesmen) ? data.salesmen : []
        setSalesmen(rows.filter((salesman: LookupOption & { is_active?: boolean }) => salesman.is_active !== false))
      }
      if (citiesRes?.ok) {
        const data = await citiesRes.json()
        setCities(Array.isArray(data) ? data : [])
      }
      if (systemSettingsRes?.ok) {
        const data = await systemSettingsRes.json()
        defaultVatPercentRef.current = Number(data?.tax_rate) || 0
        defaultVatPercentClearingRef.current = Number(data?.tax_rate_clearing) || 0

        // حساب الضريبة الافتراضي بحسب اتجاه هذا النوع من السندات (مبيعات/مشتريات) — انظر شرح
        // defaultTaxAccountRef أعلاه. يحتاج طلباً إضافياً لجلب رقم/اسم الحساب (الإعدادات العامة لا
        // تخزّن سوى المعرّف).
        const isSalesDirection = (SALES_DIRECTION_VCH_TYPES as readonly number[]).includes(voucherType)
        const taxAccountId = Number(isSalesDirection ? data?.default_sales_tax_account : data?.default_purchase_tax_account) || null
        if (taxAccountId) {
          try {
            const accountRes = await fetch(`/api/accounts/${taxAccountId}`)
            if (accountRes.ok) {
              const account = await accountRes.json()
              defaultTaxAccountRef.current = { id: taxAccountId, code: account?.code || "", name: account?.name || "" }
            }
          } catch {
            // تجاهل — يبقى حقل حساب الضريبة فارغاً افتراضياً إن تعذّر الجلب.
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const fetchDefaults = async (): Promise<{ bookId: number | null; currencyId: number | null }> => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${voucherType}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const [booksRes, currenciesRes] = await Promise.all([
        fetch(booksUrl).catch(() => null),
        fetch("/api/exchange-rates").catch(() => null),
      ])

      let bookId: number | null = null
      if (booksRes?.ok) {
        const data = await booksRes.json()
        setVoucherBooks(Array.isArray(data?.books) ? data.books : [])
        bookId = data?.default_book_id ?? null
        setDefaultBookId(bookId)
      }

      let currencyId: number | null = null
      if (currenciesRes?.ok) {
        const data = await currenciesRes.json()
        const rates = Array.isArray(data?.rates) ? data.rates : []
        setCurrencies(rates)
        currencyId = rates.reduce((min: number | null, c: CurrencyRate) => {
          const id = Number(c.currency_id ?? c.id)
          if (!Number.isFinite(id)) return min
          return min === null || id < min ? id : min
        }, null)
      }

      return { bookId, currencyId }
    } catch (error) {
      console.error("Failed to fetch voucher defaults", error)
      return { bookId: defaultBookId, currencyId: baseCurrencyId }
    }
  }

  const generateCode = async (bookId: number | null, fallbackCode = "", branchId: number | null = null) => {
    if (bookId == null) return fallbackCode
    try {
      const response = await fetch(`/api/sales-vouchers/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}${branchId ? `&branch_id=${branchId}` : ""}`)
      if (!response.ok) return fallbackCode
      const data = await response.json()
      return data.code || fallbackCode
    } catch (error) {
      console.error("Failed to generate sales delivery voucher number", error)
      return fallbackCode
    }
  }

  // تغيير دفتر السندات (قبل الحفظ فقط، أي سند جديد بعد لم يُحفَظ بعد — form.id > 0 يعني سنداً
  // محفوظاً فعلياً فلا يُعاد توليد رقمه) يعيد توليد رقم السند وفق الدفتر الجديد — بنفس نمط
  // handleBookChange في credit-note.tsx/journal.tsx/receipts.tsx (لم تكن هذه الشاشة تطبّقه إطلاقاً).
  const handleBookChange = async (bookId: number | null) => {
    const requestId = ++bookChangeRequestRef.current
    const current = { ...formRef.current, vch_book_id: bookId }
    formRef.current = current
    editForm(current)
    if (current.id > 0 || bookId == null) return
    const pending = (async () => {
      const generated = await generateCode(bookId, current.vch_code || "", current.branch_id)
      if (requestId !== bookChangeRequestRef.current) return
      const next = { ...formRef.current, vch_book_id: bookId, vch_code: generated || current.vch_code }
      formRef.current = next
      editForm(next)
    })()
    pendingBookChangeRef.current = pending
    await pending
    if (requestId === bookChangeRequestRef.current) pendingBookChangeRef.current = null
  }

  // تغيير الفرع لسند جديد لم يُحفظ بعد يعيد توليد الرقم (بادئة السند + رمز الفرع + رمز الدفتر + التسلسل).
  const regenerateCodeForBranch = async (branchId: number | null, initialSelection: boolean) => {
    const current = formRef.current
    if (current.id > 0 || current.vch_book_id == null || !branchId) return
    const requestId = ++bookChangeRequestRef.current
    const pending = (async () => {
      const generated = await generateCode(current.vch_book_id, current.vch_code || "", branchId)
      if (requestId !== bookChangeRequestRef.current || formRef.current.branch_id !== branchId) return
      const next = { ...formRef.current, vch_code: generated || formRef.current.vch_code }
      formRef.current = next
      editForm(next)
      if (initialSelection) cleanFormRef.current = { ...cleanFormRef.current, vch_code: next.vch_code }
    })()
    pendingBookChangeRef.current = pending
    await pending
    if (requestId === bookChangeRequestRef.current) pendingBookChangeRef.current = null
  }

  const fetchVoucherDetails = async (id: number): Promise<SalesDeliveryRecord | null> => {
    try {
      const response = await fetch(`/api/sales-vouchers/${id}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Failed to fetch sales delivery voucher details", error)
      return null
    }
  }

  // المساعد الذكي (مرفق فاتورة) ⇐ سند جديد يُعبّأ داخل الشاشة (unified-sales-delivery يستهلك المعلّق)
  const openNewDialogRef = useRef<() => Promise<void>>(async () => undefined)
  useEffect(() => {
    const check = () => { if (peekVoucherPrefill(voucherType) && !dialogOpenRef.current) void openNewDialogRef.current() }
    check()
    window.addEventListener(VOUCHER_PREFILL_EVENT, check)
    return () => window.removeEventListener(VOUCHER_PREFILL_EVENT, check)
  }, [voucherType])
  const dialogOpenRef = useRef(false)
  dialogOpenRef.current = dialogOpen

  const openNewDialog = async () => {
    const cachedBookId = defaultBookId
    const cachedCurrencyId = baseCurrencyId
    const cachedCashAccount = resolveCashAccountForCurrency(cachedCurrencyId)

    setForm({
      ...buildInitialForm(),
      vch_book_id: cachedBookId,
      currency_id: cachedCurrencyId,
      cash_account_id: cachedCashAccount?.id ?? null,
      cash_account_code: cachedCashAccount?.code ?? "",
      cash_account_name: cachedCashAccount?.name ?? "",
    })
    setGridResetToken((value) => value + 1)
    setErrorMessages([])
    setDialogOpen(true)
    setIsLoading(true)
    try {
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId, "", buildInitialForm().branch_id)
      const cashAccount = resolveCashAccountForCurrency(defaults.currencyId)
      setForm({
        ...buildInitialForm(),
        vch_code: code,
        vch_book_id: defaults.bookId,
        currency_id: defaults.currencyId,
        cash_account_id: cashAccount?.id ?? null,
        cash_account_code: cashAccount?.code ?? "",
        cash_account_name: cashAccount?.name ?? "",
      })
    } finally {
      setIsLoading(false)
    }
  }
  openNewDialogRef.current = openNewDialog

  const openRow = async (record: SalesDeliveryRecord, index: number) => {
    setIsLoading(true)
    try {
      const details = await fetchVoucherDetails(record.id)
      setForm(normalizeVoucher(details || record))
      setCurrentIndex(index)
      setErrorMessages([])
      setDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCodeResolved = async (id: number) => {
    setIsLoading(true)
    try {
      const details = await fetchVoucherDetails(id)
      if (!details) return
      const index = filteredVouchers.findIndex((v) => v.id === id)
      setForm(normalizeVoucher(details))
      setCurrentIndex(index >= 0 ? index : 0)
      setErrorMessages([])
      return true
    } finally {
      setIsLoading(false)
    }
  }

  useVoucherDeepLink(async id => {
    if (await handleCodeResolved(id)) setDialogOpen(true)
  }, Boolean(user?.id), voucherType)

  const handleCodeNotFound = (code: string) => {
    setForm((f) => ({
      ...buildInitialForm(),
      vch_code: code,
      vch_book_id: f.vch_book_id,
      currency_id: f.currency_id,
    }))
    setErrorMessages([])
  }

  const cloneVoucher = async () => {
    const form = formRef.current
    if (!form.id) return
    logVoucherAudit({ action: "clone", voucher_id: Number(form.id) })
    setIsLoading(true)
    try {
      // دفتر السند الأصلي غير متاح للمستخدم في هذا النوع ⇐ النسخة على الدفتر الافتراضي (وإلا يرفض الحفظ "يجب تحديد دفتر السندات")
      const bookAllowed = voucherBooks.some((book) => Number(book.id) === Number(form.vch_book_id))
      const bookId = bookAllowed ? form.vch_book_id : (await fetchDefaults()).bookId ?? form.vch_book_id
      const code = await generateCode(bookId, "", form.branch_id)
    const today = new Date().toISOString().slice(0, 10)
    copiedVoucherRef.current = true
    editForm((f) => ({
      ...f,
      vch_book_id: bookId,
      id: 0,
      vch_code: code,
      vch_date: today,
      manual_date: today,
      status: 1,
      is_printed: 0,
      invoice_source_type: 1,
      source_voucher_id: null,
      source_voucher_type: null,
      has_linked_invoice: false,
      // هوية بيع نقطة البيع للسند الأصلي: الخادم يعيد السند الأصلي كـ"مكرر" لنفس pos_client_sale_id بلا إدراج ⇐ تُمسح مع روابطه
      ...({ pos_client_sale_id: null, pos_point_id: null, pos_session_id: null, pos_payments: [], linked_order_id: null } as any),
      // الأرقام التسلسلية فريدة لكل قطعة ⇐ لا تُنسَخ (تُدخَل من جديد للسند الجديد)
      items: f.items.map(item => ({ ...item, order_item_id: null, delivery_item_id: null, source_voucher_id: null, source_voucher_type: null, ...((item as any).serials?.length || (item as any).serials_text ? { serials: [], serials_text: "" } : {}) })),
    }))
    setErrorMessages([])
    } finally {
      setIsLoading(false)
    }
  }

  const validateVoucher = (data: SalesDeliveryRecord): string | null => {
    if (!data.vch_code.trim()) return "رقم السند مطلوب"
    if (data.vch_book_id == null || !voucherBooks.some(book => Number(book.id) === Number(data.vch_book_id))) return "يجب تحديد دفتر السندات"
    if (!data.currency_id) return "العملة مطلوبة"
    if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"
    if (data.invoice_source_type === 2 && (!data.source_voucher_id || !data.source_voucher_type)) {
      return "يجب اختيار الإرسالية المصدرية للفاتورة"
    }
    if (data.invoice_source_type === 3 && (!data.source_voucher_id || !data.source_voucher_type)) {
      return "يجب اختيار الطلبية المصدرية للفاتورة"
    }
    const isDeliveryVoucherType = [DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, DELIVERY_PAY_VCH_TYPE].includes(voucherType)
    const isPurchaseDeliveryVoucherType = voucherType === DELIVERY_PAY_VCH_TYPE
    // ارسالية برسم البيع ومرتجعها تتبع المندوب لا العميل (كما في شامل)
    const isSalesmanVoucherType = [DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE].includes(voucherType)
    if (voucherType === SALES_INVOICE_VCH_TYPE && Number(data.invoice_source_type) === 4 && !(data.items || []).some((item: any) => Number(item.delivery_item_id) > 0)) {
      return "يجب اختيار ارسالية برسم البيع للفاتورة"
    }
    if (voucherType === RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE && !(data.items || []).some((item: any) => Number(item.delivery_item_id) > 0)) {
      return "يجب اختيار ارسالية برسم البيع للمرتجع"
    }

    if (isSalesmanVoucherType) {
      if (!data.salesman_id) return "يجب اختيار المندوب"
    } else if (isDeliveryVoucherType) {
      if (!data.account_id) {
        return isPurchaseDeliveryVoucherType ? "يجب إدخال المورد" : "يجب إدخال العميل"
      }
    } else {
      // العميل نفسه اختياري الآن (بيع نقدي بلا عميل مسجَّل) — لكن عندها يجب تحديد حساب الصندوق
      // (سيُقفَل عليه بدل حساب العميل) واسم الدافع (بديل اسم العميل) معاً كحد أدنى للتوثيق المحاسبي.
      if (!data.account_id) {
        if (!data.cash_account_id) return "يجب اختيار حساب الصندوق عند عدم اختيار العميل"
        if (!data.customer_name?.trim()) return "يجب إدخال اسم الدافع عند عدم اختيار العميل"
      }
    }
    if (
      Number(data.vat_percent || 0) > 0 &&
      !data.tax_account_id &&
      ![DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, DELIVERY_PAY_VCH_TYPE].includes(voucherType)
    ) {
      return "يجب اختيار حساب الضريبة لوجود نسبة ضريبة على السند"
    }
    const items = (data.items || []).filter((i) => i.product_id)
    if (items.length === 0) return "يجب إدخال صنف واحد على الأقل"
    if (items.some((i) => !i.warehouse_id)) return "يجب اختيار المستودع لكل صنف"
    if (items.some((i) => !i.unit_id && !String(i.unit_name || i.unit || "").trim())) return "يجب اختيار الوحدة لكل صنف"
    if (items.some((i) => !(Number(i.quantity || 0) > 0))) return "يجب إدخال الكمية لكل صنف"
    if (items.some((i) => Number(i.discount_percent || 0) < 0 || Number(i.discount_percent || 0) > 100)) {
      return "نسبة الخصم يجب ألا تتجاوز 100% لكل صنف"
    }
    const itemWithMissingAttributes = items.find((item) => {
      const attributes = Array.isArray((item as any).attributes) ? (item as any).attributes : []
      const selected = (item as any).selected_attributes && typeof (item as any).selected_attributes === "object"
        ? (item as any).selected_attributes
        : {}
      return attributes.length > 0 && attributes.some((attribute: any) => !String(selected[attribute.name] || "").trim())
    })
    if (itemWithMissingAttributes) {
      return `الصنف - ${itemWithMissingAttributes.product_name || itemWithMissingAttributes.product_code} له ميزات وخصائص يجب تحديدها لا يمكن حفظ السند`
    }
    // فاتورة مبيعات/مشتريات ومردود مبيعات/مشتريات فقط: تبويب "تفاصيل حسابات الاصناف" يُنشئ قيداً
    // محاسبياً لكل صنف (buildSalesVoucherJournalRows في app/api/sales-vouchers/_lib.ts)، فيجب أن
    // يحمل كل صنف حساباً قبل الحفظ وإلا يبقى القيد غير مكتمل/غير متوازن.
    if (ITEM_ACCOUNT_VCH_TYPES.has(voucherType) && items.some((i) => !i.account_id)) {
      return "رقم حساب الصنف غير محدد يرجى الذهاب الى تاب تفاصيل حسابات الاصناف وتحديد الحساب للاصناف"
    }
    return null
  }

  const saveVoucherInternal = async (action: PostVoucherAction = "save", keepSavedVoucher = false): Promise<boolean> => {
    await pendingBookChangeRef.current
    const currentForm = formRef.current
    const status = action === "save" || action === "save_print" ? currentForm.status || 1 : 2
    const isPrinted = action === "post_print" ? 1 : currentForm.is_printed || 0
    const dataToSave: SalesDeliveryRecord = {
      ...currentForm,
      status,
      is_printed: isPrinted,
      items: currentForm.items.filter((item) => item.product_id).map((item) => ({
        ...item,
        price: item.unit_price == null ? 0 : Number(item.unit_price),
      })) as SalesVoucherItemRow[],
    }
    console.log("Saving voucher", { action, dataToSave })
    const validationError = validateVoucher(dataToSave)
    if (validationError) {
      setErrorMessages([validationError])
      return false
    }
    setIsSaving(true)
    setErrorMessages([])
    try {
      const method = currentForm.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/sales-vouchers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      })
      if (!response.ok) {
        const responseText = await response.text()
        let errorMessage = ""
        try {
          const error = JSON.parse(responseText)
          const messages: unknown[] = Array.isArray(error?.errors) ? error.errors : [error?.error, error?.message]
          errorMessage = messages.filter((message): message is string => typeof message === "string" && Boolean(message.trim())).join("\n")
        } catch {
          errorMessage = responseText.trim()
        }
        setErrorMessages([errorMessage || "فشل في حفظ السند"])
        return false
      }

      const savedVoucher = normalizeVoucher(await response.json())
      announceSaved()
      if (action === "save_print" || action === "post_print") {
        const shippingFields = await shippingPrintFields(savedVoucher)
        setPrintData(salesVoucherDocument(savedVoucher, {
          shippingFields,
          voucherTypeId: voucherType,
          title: SALES_VOUCHER_TYPE_LABELS[voucherType].title,
          copyLabel: action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",
          currencyName: printCurrencyName(savedVoucher.currency_id),
          partyLabel: [17, 18, 19].includes(Number(voucherType)) ? "المورد" : "العميل",
        }))
      }

      try {
        await fetchVouchers()
        if (keepSavedVoucher) { setForm(savedVoucher); return true }
        const defaults = await fetchDefaults()
        const bookId = currentForm.vch_book_id ?? defaults.bookId
        const code = await generateCode(bookId, "", buildInitialForm().branch_id)
        const nextForm = { ...buildInitialForm(), vch_code: code, vch_book_id: bookId, currency_id: defaults.currencyId }
        formRef.current = nextForm
        setForm(nextForm)
        setGridResetToken((value) => value + 1)
      } catch (refreshError) {
        setForm(savedVoucher)
        console.error("Voucher saved, but refreshing the voucher screen failed", refreshError)
      }
      setDialogOpen(true)
      return true
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ السند"])
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const savingRequestRef = useRef(false)
  const saveVoucher = async (action: PostVoucherAction = "save", keepSavedVoucher = false): Promise<boolean> => {
    if (savingRequestRef.current) return false
    savingRequestRef.current = true
    setIsSaving(true)
    try { return await saveVoucherInternal(action, keepSavedVoucher) }
    finally { savingRequestRef.current = false; setIsSaving(false) }
  }

  const advanceAfterDelete = async () => {
    setIsLoading(true)
    try {
      await fetchVouchers()
      const nextList = vouchers.filter((v) => v.id !== form.id)
      if (nextList.length > 0) {
        const targetIndex = Math.min(Math.max(0, currentIndex), nextList.length - 1)
        const next = nextList[targetIndex]
        if (next) {
          const details = await fetchVoucherDetails(next.id)
          setForm(normalizeVoucher(details || next))
          setCurrentIndex(targetIndex)
          setDialogOpen(true)
          return
        }
      }
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId, "", buildInitialForm().branch_id)
      setForm({ ...buildInitialForm(), vch_code: code, vch_book_id: defaults.bookId, currency_id: defaults.currencyId })
      setCurrentIndex(0)
      setDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    setIsSaving(true)
    setErrorMessages([])
    try {
      if (form.status === 2) {
        const response = await fetch("/api/sales-vouchers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, status: 3 }),
        })
        if (!response.ok) {
          const error = await response.json().catch(() => null)
          setErrorMessages([error?.error || "فشل في إلغاء السند"])
          return
        }
        const saved = await response.json()
        window.dispatchEvent(new Event("pos-session-changed"))
        await fetchVouchers()
        setForm(normalizeVoucher(saved))
        setDialogOpen(true)
      } else {
        const response = await fetch(`/api/sales-vouchers/${form.id}`, { method: "DELETE" })
        if (!response.ok) {
          const error = await response.json().catch(() => null)
          setErrorMessages([error?.error || "فشل في حذف السند"])
          return
        }
        await advanceAfterDelete()
      }
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حذف/إلغاء السند"])
    } finally {
      setIsSaving(false)
    }
  }

  const handlePrint = async () => { await printVoucher() }

  const printVoucher = async () => {
    const form = formRef.current
    if (!(form.id > 0) || form.status === 3) return
    const copyLabel = form.status !== 2 ? "نسخة للتدقيق" : form.is_printed === 1 ? "نسخة" : "نسخة اصلية"
    if (form.status === 2 && form.is_printed !== 1) {
      try {
        const response = await fetch(`/api/sales-vouchers/${form.id}`, { method: "PATCH" })
        if (response.ok) setForm((current) => ({ ...current, is_printed: 1 }))
      } catch (error) {
        console.error("Failed to mark sales voucher as printed", error)
      }
    }
    const shippingFields = await shippingPrintFields(form)
    setPrintData(salesVoucherDocument(form, {
      shippingFields,
      voucherTypeId: voucherType,
      title: SALES_VOUCHER_TYPE_LABELS[voucherType].title,
      copyLabel: copyLabel,
      currencyName: printCurrencyName(form.currency_id),
      partyLabel: [17, 18, 19].includes(Number(voucherType)) ? "المورد" : "العميل",
    }))
  }

  const navigationPending = useRef(false)
  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    if (navigationPending.current || isLoading || isSaving) return
    navigationPending.current = true
    setIsLoading(true)
    try {
      const query = new URLSearchParams({ direction, currentId: String(Math.max(0, formRef.current.id)), vch_type: String(voucherType) })
      const response = await fetch(`/api/transaction-navigation?${query}`, { cache: "no-store" })
      const record = await response.json()
      if (!response.ok) throw new Error(record?.error || "تعذر التنقل بين السندات")
      if (!record?.id) return
      const details = await fetchVoucherDetails(record.id)
      if (!details) throw new Error("تعذر تحميل تفاصيل السند")
      setForm(normalizeVoucher(details))
      setCurrentIndex(filteredVouchers.findIndex(row => row.id === record.id))
      setErrorMessages([])
      setDialogOpen(true)
    } catch (error) {
      setErrorMessages([error instanceof Error ? error.message : "تعذر التنقل بين السندات"])
    } finally {
      navigationPending.current = false
      setIsLoading(false)
    }
  }

  const onFormChange = <K extends keyof SalesDeliveryRecord>(field: K, value: SalesDeliveryRecord[K]) => {
    const branchChanged = field === "branch_id" && formRef.current.branch_id !== value
    const initialSelection = branchChanged && formRef.current.branch_id == null && cleanFormRef.current.branch_id == null
    if (branchChanged) queueMicrotask(() => void regenerateCodeForBranch(Number(value) || null, initialSelection))
    editForm((f) => ({ ...f, [field]: value, ...((field === "branch_id" || field === "currency_id") && f[field] !== value ? { cash_account_id: null, cash_account_code: "", cash_account_name: "" } : {}) }))
  }
  // قيمة محسوبة (نسبة الضريبة الفعلية على مستوى الصنف): تُحدَّث في السند وفي خط الأساس معاً فلا تُعدّ تعديلاً
  const onDerivedFormChange = <K extends keyof SalesDeliveryRecord>(field: K, value: SalesDeliveryRecord[K]) => {
    cleanFormRef.current = { ...cleanFormRef.current, [field]: value }
    editForm((f) => ({ ...f, [field]: value }))
  }

  const useFullPageMode = fullscreenEnabled


  // عرض سند بالمعرّف من نافذة بحث السندات (زر البحث بجانب رقم السند) — نفس مسار التنقل
  const openVoucherById = async (voucherId: number) => {
    setIsLoading(true)
    try {
      const details = await fetchVoucherDetails(voucherId)
      if (!details) throw new Error("تعذر تحميل تفاصيل السند")
      setForm(normalizeVoucher(details))
      setCurrentIndex(filteredVouchers.findIndex(row => row.id === voucherId))
      setErrorMessages([])
      setDialogOpen(true)
    } catch (error) {
      setErrorMessages([error instanceof Error ? error.message : "تعذر عرض السند"])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`voucher-list-page w-full max-w-full ${useFullPageMode && dialogOpen ? "h-full" : "space-y-6"}`} dir="rtl">
      {!(useFullPageMode && dialogOpen) && <>
      <VoucherListHero icon={ReceiptText} title={<>{LIST_TITLE}</>} addLabel={<>{`إضافة ${TITLE}`}</>} onNew={openNewDialog} />

      <VoucherStats stats={[{ label: <>{`إجمالي ${LIST_TITLE}`}</>, value: <>{totalVouchers}</> }, { label: <>إجمالي المبالغ</>, value: <>{totalAmount.toLocaleString("en-US")}</> }]} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_1fr_1fr_auto]" onKeyDown={searchOnEnter(runSearch)}>
            <div>
              <Label htmlFor="search-code">رقم السند</Label>
              <Input
                id="search-code"
                value={searchDraft.code}
                onChange={(e) => setSearchDraft((prev) => ({ ...prev, code: e.target.value }))}
                className="text-right"
                placeholder="ابحث برقم السند..."
              />
            </div>
            <div>
              <Label htmlFor="search-date-from">من تاريخ</Label>
              <Input
                id="search-date-from"
                type="date"
                value={searchDraft.dateFrom}
                onChange={(e) => setSearchDraft((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="search-date-to">إلى تاريخ</Label>
              <Input
                id="search-date-to"
                type="date"
                value={searchDraft.dateTo}
                onChange={(e) => setSearchDraft((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            <VoucherSearchButton onClick={runSearch} loading={listSearch.loading} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`${LIST_TITLE} (${filteredVouchers.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="min-h-0">
            <VoucherListTable
              loading={listSearch.loading}
              rows={filteredVouchers.map((voucher) => ({ ...voucher, display_date: voucher.vch_date?.slice(0, 10), display_amount: Number(voucher.amount || 0).toLocaleString("en-US"), invoice_display: voucher.has_linked_invoice ? "تم إصدار فاتورة" : "", salesman_display: salesmen.find((salesman) => Number(salesman.id) === Number((voucher as any).salesman_id))?.name || "" }))}
              columns={[
                { header: "رقم السند", name: "vch_code", width: 150, isReadOnly: true },
                { header: "التاريخ", name: "display_date", width: 130, isReadOnly: true },
                // ارسالية برسم البيع ومرتجعها تتبع المندوب لا العميل
                [DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE].includes(voucherType)
                  ? { header: "المندوب", name: "salesman_display", width: "*", isReadOnly: true }
                  : { header: "العميل", name: "customer_name", width: "*", isReadOnly: true },
                { header: "المبلغ", name: "display_amount", width: 130, isReadOnly: true },
                { header: "حالة السند", name: "voucher_status", width: 130, isReadOnly: true },
                // الإرساليات: هل صدرت عنها فاتورة (كانت تُدمج سابقاً بعمود الحالة)
                ...(filteredVouchers.some((voucher) => voucher.has_linked_invoice) ? [{ header: "الفاتورة", name: "invoice_display", width: 140, isReadOnly: true }] : []),
              ]}
              onOpen={(row: any) => { const voucher = row.item || row; openRow(voucher, filteredVouchers.findIndex((item) => item.id === voucher.id)) }}
            />
          </div>
        </CardContent>
      </Card>

      </>}

      <UnifiedSalesDelivery
        onOpenVoucherById={(voucherId) => void openVoucherById(voucherId)}
        voucherType={voucherType}
        dialogOpen={dialogOpen}
        openFullscreen={useFullPageMode}
        onOpenChange={setDialogOpen}
        form={form}
        onFormChange={onFormChange}
        onBookChange={handleBookChange}
        onItemsChange={(items) => editForm((f) => ({ ...f, items }))}
        hasUnsavedChanges={hasUnsavedChanges}
        gridResetToken={gridResetToken}
        voucherBooks={voucherBooks}
        currencyOptions={currencyOptions}
        baseCurrencyId={baseCurrencyId}
        warehouses={warehouses}
        defaultItemWarehouseId={defaultItemWarehouseId}
        salesmen={salesmen}
        cities={cities}
        priceEntryIncludesTax={priceEntryIncludesTax}
        resolveDefaultVatPercent={resolveDefaultVatPercent}
        isSaving={isSaving}
        isLoading={isLoading}
        // الترقيم والأول/السابق حسب ترتيب السندات (id تصاعدياً) — نفس ترتيب أزرار التنقل في الخادم؛ القائمة نفسها مرتبة من الأحدث
        currentIndex={Math.max(0, [...filteredVouchers].sort((a, b) => a.id - b.id).findIndex((row) => row.id === form.id))}
        totalRecords={filteredVouchers.length}
        isFirstRecord={form.id > 0 && !filteredVouchers.some((row) => row.id < form.id)}
        isLastRecord={form.id > 0 && !filteredVouchers.some((row) => row.id > form.id)}
        onNew={openNewDialog}
        onSave={saveVoucher}
        onDerivedFormChange={onDerivedFormChange}
        onValidateSave={async () => { await pendingBookChangeRef.current; return validateVoucher(formRef.current) }}
        onDelete={handleDelete}
        onPrint={handlePrint}
        onNavigate={handleNavigate}
        onClone={cloneVoucher}
        onCodeResolved={handleCodeResolved}
        onCodeNotFound={handleCodeNotFound}
        errorMessages={errorMessages}
      />
      <VoucherDocumentPrinter document={printData} />
    </div>
  )
}
