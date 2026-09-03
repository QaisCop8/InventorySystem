"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Plus, Search } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import VoucherPrintLayout, { type VoucherPrintData } from "@/components/common/voucher-print-layout"
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
  // حساب الصندوق الافتراضي حسب عملة السند — من إعدادات المستخدم بحسب العملة
  // (users_currencies_default_account_tbl)؛ خريطة كاملة currency_id -> حساب مُجهَّزة مسبقاً عند فتح
  // الشاشة، تُقرأ عند كل تغيير عملة (handleCurrencyChange أدناه) بدل طلب شبكة جديد في كل مرة.
  const cashAccountsByCurrencyRef = useRef<Map<number, { id: number; code: string; name: string }>>(new Map())
  // "اعدادات اخرى" (تبويب الحسابات الافتراضية للمستخدم) — إن فُعِّل، يُعامَل ما يكتبه المستخدم في
  // عمود "السعر" كسعر شامل الضريبة فيُحوَّل فوراً لغير شامل قبل تخزينه في unit_price (انظر
  // handleCellEditEnded في unified-sales-delivery.tsx).
  const [priceEntryIncludesTax, setPriceEntryIncludesTax] = useState(false)

  const resolveCashAccountForCurrency = (currencyId: number | null) => {
    if (!currencyId) return null
    return cashAccountsByCurrencyRef.current.get(currencyId) ?? null
  }

  // يُستدعى من unified-sales-delivery.tsx عند كل تغيير للعملة (بما فيها التعيين الأولي لسند جديد)
  // — يُحدِّث حساب الصندوق تلقائياً وفق العملة الجديدة، أو يُفرِّغه إن لم يوجد حساب مُعرَّف لتلك العملة.
  const handleCurrencyChange = (currencyId: number | null) => {
    const resolved = resolveCashAccountForCurrency(currencyId)
    setForm((f) => ({
      ...f,
      cash_account_id: resolved?.id ?? null,
      cash_account_code: resolved?.code ?? "",
      cash_account_name: resolved?.name ?? "",
    }))
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
  const [form, setForm] = useState<SalesDeliveryRecord>(buildInitialForm())
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [printData, setPrintData] = useState<VoucherPrintData | null>(null)

  useEffect(() => {
    if (!printData) return
    const timer = setTimeout(() => window.print(), 150)
    return () => clearTimeout(timer)
  }, [printData])

  const [searchFilters, setSearchFilters] = useState({ code: "", dateFrom: "", dateTo: "" })

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
    fetchVouchers()
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
      const currencyDefaultsUrl = user?.id ? `/api/settings/users-currencies-default?user_id=${encodeURIComponent(user.id)}` : null
      const [currenciesRes, booksRes, warehousesRes, warehouseDefaultsRes, salesmenRes, systemSettingsRes, currencyDefaultsRes, citiesRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(booksUrl).catch(() => null),
        fetch("/api/warehouses").catch(() => null),
        warehouseDefaultsUrl ? fetch(warehouseDefaultsUrl).catch(() => null) : Promise.resolve(null),
        fetch("/api/salesmen").catch(() => null),
        fetch("/api/settings/system").catch(() => null),
        currencyDefaultsUrl ? fetch(currencyDefaultsUrl).catch(() => null) : Promise.resolve(null),
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
        setSalesmen(Array.isArray(data) ? data : Array.isArray(data?.salesmen) ? data.salesmen : [])
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
      if (currencyDefaultsRes?.ok) {
        const data = await currencyDefaultsRes.json()
        const rows = Array.isArray(data?.rows) ? data.rows : []
        const map = new Map<number, { id: number; code: string; name: string }>()
        for (const row of rows) {
          const currencyId = Number(row.currency_id)
          const cashAccountId = Number(row.cash_account_id)
          if (Number.isFinite(currencyId) && Number.isFinite(cashAccountId) && cashAccountId > 0) {
            map.set(currencyId, { id: cashAccountId, code: row.cash_account_code || "", name: row.cash_account_name || "" })
          }
        }
        cashAccountsByCurrencyRef.current = map
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

  const generateCode = async (bookId: number | null, fallbackCode = "") => {
    if (!bookId) return fallbackCode
    try {
      const response = await fetch(`/api/sales-vouchers/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}`)
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
    const previousCode = form.vch_code || ""
    setForm((f) => ({ ...f, vch_book_id: bookId }))
    if (form.id > 0 || !bookId) return
    const generated = await generateCode(bookId, previousCode)
    setForm((f) => ({ ...f, vch_code: generated || previousCode }))
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
    setErrorMessages([])
    setDialogOpen(true)
    setIsLoading(true)
    try {
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId)
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
    } finally {
      setIsLoading(false)
    }
  }

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
    if (!form.id) return
    setIsLoading(true)
    try {
      const code = await generateCode(form.vch_book_id)
    const today = new Date().toISOString().slice(0, 10)
    setForm((f) => ({
      ...f,
      id: 0,
      vch_code: code,
      vch_date: today,
      manual_date: today,
      status: 1,
      is_printed: 0,
    }))
    setErrorMessages([])
    } finally {
      setIsLoading(false)
    }
  }

  const validateVoucher = (data: SalesDeliveryRecord): string | null => {
    if (!data.vch_code.trim()) return "رقم السند مطلوب"
    if (!data.vch_book_id) return "دفتر السندات مطلوب"
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

    if (isDeliveryVoucherType) {
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

  const saveVoucher = async (action: PostVoucherAction = "save"): Promise<boolean> => {
    const status = action === "save" || action === "save_print" ? form.status || 1 : 2
    const isPrinted = action === "post_print" ? 1 : form.is_printed || 0
    const dataToSave: SalesDeliveryRecord = {
      ...form,
      status,
      is_printed: isPrinted,
      items: form.items.map((item) => ({
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
      const method = form.id > 0 ? "PUT" : "POST"
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
      if (action === "save_print" || action === "post_print") {
        setPrintData({
          title: SALES_VOUCHER_TYPE_LABELS[voucherType].title,
          copyLabel: action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",
          vch_code: savedVoucher.vch_code,
          vch_date: savedVoucher.vch_date,
          amount: Number(savedVoucher.amount || 0),
          manual_voucher: savedVoucher.manual_voucher,
          note: savedVoucher.note,
          rows: savedVoucher.items.filter((item) => item.product_id).map((item) => ({
            account_code: item.product_code,
            account_name: item.product_name,
            debit: Number(item.line_amount ?? item.total_price ?? 0),
            credit: null,
            note: item.note,
          })),
        })
      }

      try {
        await fetchVouchers()
        const defaults = await fetchDefaults()
        const bookId = form.vch_book_id ?? defaults.bookId
        const code = await generateCode(bookId)
        setForm({ ...buildInitialForm(), vch_code: code, vch_book_id: bookId, currency_id: defaults.currencyId })
      } catch (refreshError) {
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
      const code = await generateCode(defaults.bookId)
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

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    try {
      console.debug("handleNavigate called", { direction, currentIndex, filteredLength: filteredVouchers.length })
      if (filteredVouchers.length === 0) return
      let targetIndex = currentIndex
      // A newly generated voucher is conceptually positioned immediately after
      // the last saved voucher. The RTL toolbar maps its visible "previous"
      // action to `next`, so navigate to the actual last saved record instead
      // of advancing from the stale index of the record that was open before New.
      if (form.id <= 0 && direction === "next") targetIndex = filteredVouchers.length - 1
      else if (direction === "first") targetIndex = 0
      else if (direction === "last") targetIndex = filteredVouchers.length - 1
      else if (direction === "previous") targetIndex = Math.max(0, currentIndex - 1)
      else targetIndex = Math.min(filteredVouchers.length - 1, currentIndex + 1)

      const record = filteredVouchers[targetIndex]
      if (!record) {
        console.warn("handleNavigate: no record at targetIndex", { targetIndex, filteredLength: filteredVouchers.length })
        return
      }

      // Fetch fresh details from API (in case other users added/updated the record)
      setIsLoading(true)
      try {
        const details = await fetchVoucherDetails(record.id)
        setForm(normalizeVoucher(details || record))
        setCurrentIndex(targetIndex)
        setErrorMessages([])
        setDialogOpen(true)
      } finally {
        setIsLoading(false)
      }
    } catch (err) {
      console.error("handleNavigate error", err)
      throw err
    }
  }

  const onFormChange = <K extends keyof SalesDeliveryRecord>(field: K, value: SalesDeliveryRecord[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const useFullPageMode = fullscreenEnabled

  return (
    <div className={`w-full max-w-full ${useFullPageMode && dialogOpen ? "h-full" : "space-y-6"}`} dir="rtl">
      {!(useFullPageMode && dialogOpen) && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{LIST_TITLE}</h1>
        <Button onClick={openNewDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {`إضافة ${TITLE}`}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-blue-700">{`إجمالي ${LIST_TITLE}`}</p>
            <p className="text-3xl font-bold text-blue-900">{totalVouchers}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-purple-700">إجمالي المبالغ</p>
            <p className="text-3xl font-bold text-purple-900">{totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="search-code">رقم السند</Label>
              <Input
                id="search-code"
                value={searchFilters.code}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, code: e.target.value }))}
                className="text-right"
                placeholder="ابحث برقم السند..."
              />
            </div>
            <div>
              <Label htmlFor="search-date-from">من تاريخ</Label>
              <Input
                id="search-date-from"
                type="date"
                value={searchFilters.dateFrom}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="search-date-to">إلى تاريخ</Label>
              <Input
                id="search-date-to"
                type="date"
                value={searchFilters.dateTo}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`${LIST_TITLE} (${filteredVouchers.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-right">رقم السند</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">التاريخ</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">العميل</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">المبلغ</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">الحالة</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.map((voucher, index) => (
                  <tr key={voucher.id} className="cursor-pointer hover:bg-gray-50" onDoubleClick={() => openRow(voucher, index)}>
                    <td className="border border-gray-300 px-4 py-2">{voucher.vch_code}</td>
                    <td className="border border-gray-300 px-4 py-2">{voucher.vch_date?.slice(0, 10)}</td>
                    <td className="border border-gray-300 px-4 py-2">{voucher.customer_name}</td>
                    <td className="border border-gray-300 px-4 py-2">{Number(voucher.amount || 0).toLocaleString()}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
          {voucher.has_linked_invoice ? "تم إصدار فاتورة" : voucher.status === 2 ? "مرحل" : "مسودة"}
        </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            openRow(voucher, index)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredVouchers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-gray-300 px-4 py-6 text-center text-muted-foreground">
                      لا توجد سندات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      </>}

      <UnifiedSalesDelivery
        voucherType={voucherType}
        dialogOpen={dialogOpen}
        openFullscreen={useFullPageMode}
        onOpenChange={setDialogOpen}
        form={form}
        onFormChange={onFormChange}
        onBookChange={handleBookChange}
        onCurrencyChange={handleCurrencyChange}
        onItemsChange={(items) => setForm((f) => ({ ...f, items }))}
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
        currentIndex={currentIndex}
        totalRecords={filteredVouchers.length}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={currentIndex >= filteredVouchers.length - 1}
        onNew={openNewDialog}
        onSave={saveVoucher}
        onValidateSave={() => validateVoucher(form)}
        onDelete={handleDelete}
        onNavigate={handleNavigate}
        onClone={cloneVoucher}
        onCodeResolved={handleCodeResolved}
        onCodeNotFound={handleCodeNotFound}
        errorMessages={errorMessages}
      />
      <VoucherPrintLayout data={printData} />
    </div>
  )
}
