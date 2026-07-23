"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Plus, Search } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import UnifiedStockVoucher, { type VoucherRecord, type VoucherItemRow, type StockVoucherType } from "./unified-stock-voucher"
import type { PostVoucherAction } from "@/components/common/post-voucher-dialog"
import StockVoucherPrintLayout, { type StockVoucherPrintData } from "@/components/common/stock-voucher-print-layout"

interface StockVouchersProps {
  voucherType: StockVoucherType
}

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

const TYPE_LABELS: Record<StockVoucherType, { title: string; listTitle: string; addLabel: string }> = {
  12: { title: "سند ادخال بضاعة", listTitle: "سندات ادخال البضاعة", addLabel: "إضافة سند ادخال بضاعة" },
  13: { title: "سند اخراج بضاعة", listTitle: "سندات اخراج البضاعة", addLabel: "إضافة سند اخراج بضاعة" },
  14: { title: "ارسالية داخلية", listTitle: "الارساليات الداخلية", addLabel: "إضافة ارسالية داخلية" },
  15: { title: "سند استعمال", listTitle: "سندات الاستعمال", addLabel: "إضافة سند استعمال" },
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

const buildInitialForm = (voucherType: StockVoucherType): VoucherRecord => ({
  id: 0,
  vch_type: voucherType,
  vch_code: "",
  vch_date: new Date().toISOString().slice(0, 10),
  vch_book_id: null,
  currency_id: null,
  rate: 1,
  account_id: null,
  customer_name: "",
  to_store_id: null,
  from_store_id: null,
  amount: 0,
  manual_voucher: "",
  manual_date: new Date().toISOString().slice(0, 10),
  note: "",
  status: 1,
  is_printed: 0,
  items: [{ ...emptyItemRow }],
})

const normalizeVoucher = (record: Partial<VoucherRecord>, voucherType: StockVoucherType): VoucherRecord => ({
  ...buildInitialForm(voucherType),
  ...record,
  manual_date: record.manual_date || record.vch_date || buildInitialForm(voucherType).manual_date,
  items: record.items?.length ? (record.items as VoucherItemRow[]) : [{ ...emptyItemRow }],
})

export default function StockVouchers({ voucherType }: StockVouchersProps) {
  const labels = TYPE_LABELS[voucherType]
  const { user } = useAuth()

  const [vouchers, setVouchers] = useState<VoucherRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [defaultBookId, setDefaultBookId] = useState<number | null>(null)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<number | null>(null)
  const [priceCategories, setPriceCategories] = useState<LookupOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<VoucherRecord>(buildInitialForm(voucherType))
  const [isSaving, setIsSaving] = useState(false)
  // تحميل عند "جديد"/التنقل/عرض سجل (مختلف عن isSaving الخاص بالحفظ فعلياً) — يعطّل الواجهة ريثما
  // تُجلَب بيانات السند (تفاصيل + أرقام تسلسلية) من الخادم.
  const [isLoading, setIsLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [printData, setPrintData] = useState<StockVoucherPrintData | null>(null)

  const [searchFilters, setSearchFilters] = useState({ code: "", dateFrom: "", dateTo: "" })

  const totalVouchers = vouchers.length
  const totalAmount = useMemo(() => vouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0), [vouchers])

  const currencyOptions = useMemo(
    () => currencies.map((c) => ({ value: Number(c.currency_id ?? c.id), label: c.currency_name || c.currency_code || "" })),
    [currencies],
  )
  const baseCurrencyId = useMemo(
    () => currencies.reduce<number | null>((min, c) => {
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
  }, [voucherType, user?.id])

  useEffect(() => {
    if (!printData) return
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [printData])

  const fetchVouchers = async () => {
    try {
      const response = await fetch(`/api/stock-vouchers?vch_type=${voucherType}`)
      const data = await response.json()
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch stock vouchers", error)
      setVouchers([])
    }
  }

  const fetchLookups = async () => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${voucherType}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const warehouseDefaultsUrl = user?.id ? `/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}` : null
      const [currenciesRes, booksRes, warehousesRes, warehouseDefaultsRes, priceCategoriesRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(booksUrl).catch(() => null),
        fetch("/api/warehouses").catch(() => null),
        warehouseDefaultsUrl ? fetch(warehouseDefaultsUrl).catch(() => null) : Promise.resolve(null),
        fetch("/api/pricecategory").catch(() => null),
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
      } else {
        setDefaultItemWarehouseId(null)
      }
      if (priceCategoriesRes?.ok) {
        const data = await priceCategoriesRes.json()
        setPriceCategories(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  // يجلب دفتر السندات الافتراضي وأول عملة مباشرة من الخادم بدل الاعتماد على state قد لا يكون
  // اكتمل تحميله بعد (مثلاً إن ضغط المستخدم "جديد" قبل أن يكتمل fetchLookups عند فتح الصفحة).
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
      return { bookId: defaultBookId, currencyId: firstCurrencyId() }
    }
  }

  const generateCode = async (bookId: number | null) => {
    if (!bookId) return ""
    try {
      const response = await fetch(`/api/stock-vouchers/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}`)
      if (!response.ok) return ""
      const data = await response.json()
      return data.code || ""
    } catch (error) {
      console.error("Failed to generate stock voucher number", error)
      return ""
    }
  }

  const fetchVoucherDetails = async (id: number): Promise<VoucherRecord | null> => {
    try {
      const response = await fetch(`/api/stock-vouchers/${id}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Failed to fetch stock voucher details", error)
      return null
    }
  }

  const firstCurrencyId = () => baseCurrencyId

  const openNewDialog = async () => {
    setIsLoading(true)
    try {
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId)
      setForm({ ...buildInitialForm(voucherType), vch_code: code, vch_book_id: defaults.bookId, currency_id: defaults.currencyId })
      setErrorMessages([])
      setDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const openRow = async (record: VoucherRecord, index: number) => {
    setIsLoading(true)
    try {
      const details = await fetchVoucherDetails(record.id)
      setForm(normalizeVoucher(details || record, voucherType))
      setCurrentIndex(index)
      setErrorMessages([])
      setDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  // رقم سند غير مرتبط بأي سجل معروض حالياً (كُتب يدوياً في الحقل) — يُبحث عنه مباشرة بمعرّفه.
  const handleCodeResolved = async (id: number) => {
    setIsLoading(true)
    try {
      const details = await fetchVoucherDetails(id)
      if (!details) return
      const index = vouchers.findIndex((v) => v.id === id)
      setForm(normalizeVoucher(details, voucherType))
      setCurrentIndex(index >= 0 ? index : 0)
      setErrorMessages([])
    } finally {
      setIsLoading(false)
    }
  }

  // رقم لا يخص أي سند محفوظ -> تصفير كل الحقول والشبكات لسند جديد بهذا الرقم، مع إبقاء دفتر
  // السندات والعملة الحاليين لأنهما جزء من السياق الذي أُنشئ منه الرقم نفسه.
  const handleCodeNotFound = (code: string) => {
    setForm((f) => ({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: f.vch_book_id,
      currency_id: f.currency_id,
    }))
    setErrorMessages([])
  }

  // نسخ السند الحالي إلى سند جديد غير محفوظ: نفس البيانات (المستودعات/العميل/الأصناف) برقم وتاريخ
  // جديد بدل مسحها، ليحفظها المستخدم كسند مستقل دون إعادة إدخالها — مطابق لِـ cloneVoucher في receipts.tsx.
  const cloneVoucher = async () => {
    if (!form.id) return
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
  }

  // سند فعال (status=1) لم يُرحَّل بعد يُطبع كـ"نسخة للتدقيق" فقط دون أي تسجيل. سند مُرحَّل
  // (status=2) يُسجَّل عليه is_printed=1 عند أول طباعة فتظهر "نسخة اصلية"، وأي طباعة لاحقة له
  // تظهر "نسخة" فقط دون إعادة التسجيل — مطابق لِـ handlePrint في receipts.tsx.
  const handlePrintVoucher = async () => {
    if (!(form.id > 0) || form.status === 3) return

    let isPrinted = form.is_printed || 0
    const copyLabel = form.status !== 2 ? "نسخة للتدقيق" : isPrinted === 1 ? "نسخة" : "نسخة اصلية"

    if (form.status === 2 && isPrinted !== 1) {
      try {
        const response = await fetch(`/api/stock-vouchers/${form.id}`, { method: "PATCH" })
        if (response.ok) {
          isPrinted = 1
          setForm((f) => ({ ...f, is_printed: 1 }))
        }
      } catch (error) {
        console.error("Failed to mark stock voucher as printed", error)
      }
    }

    const rows = (form.items || []).filter((i) => i.product_id)
    setPrintData({
      title: labels.title,
      copyLabel,
      vch_code: form.vch_code,
      vch_date: form.vch_date,
      manual_voucher: form.manual_voucher,
      note: form.note,
      rows: rows.map((row) => ({
        product_code: row.product_code,
        product_name: row.product_name,
        warehouse_name: row.warehouse_name,
        unit: row.unit,
        quantity: row.quantity,
        unit_price: row.unit_price,
        total_price: row.total_price,
      })),
    })
  }

  const validateVoucher = (data: VoucherRecord): string | null => {
    if (!data.vch_code.trim()) return "رقم السند مطلوب"
    if (!data.vch_book_id) return "دفتر السندات مطلوب"
    if (!data.currency_id) return "العملة مطلوبة"
    if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"
    const items = (data.items || []).filter((i) => i.product_id)
    if (items.length === 0) return "يجب إدخال صنف واحد على الأقل"
    if (items.some((i) => !i.warehouse_id)) return "يجب اختيار المستودع لكل صنف"
    if (items.some((i) => !(Number(i.quantity || 0) > 0))) return "يجب إدخال الكمية لكل صنف"
    if (voucherType === 14 && (!data.from_store_id || !data.to_store_id)) return "يجب اختيار المستودع المرسل والمستودع المستلم"
    if (voucherType === 15 && items.some((i) => !i.expense_account_id || !i.purchase_account_id)) {
      return "يجب اختيار حساب المصروف وحساب المشتريات لكل صنف"
    }
    return null
  }

  const saveVoucher = async (action: PostVoucherAction = "save") => {
    // حفظ عادي / حفظ وطباعة: تبقى الحالة كما هي (لا ترحيل). حفظ وترحيل / ترحيل وطباعة: تصبح
    // status=2 (مرحل) ويُقفل السند بعدها ويُطبَّق أثر المخزون — نفس منطق receipts.tsx.
    const status = action === "save" || action === "save_print" ? form.status || 1 : 2
    const isPrinted = action === "post_print" ? 1 : form.is_printed || 0
    const dataToSave: VoucherRecord = { ...form, status, is_printed: isPrinted }
    const validationError = validateVoucher(dataToSave)
    if (validationError) {
      setErrorMessages([validationError])
      return
    }
    setIsSaving(true)
    setErrorMessages([])
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/stock-vouchers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      })
      if (!response.ok) {
        const error = await response.json()
        setErrorMessages([error.error || "فشل في حفظ السند"])
        return
      }
      const saved = await response.json()

      if (action === "post_print" || action === "save_print") {
        const rows = (dataToSave.items || []).filter((i) => i.product_id)
        setPrintData({
          title: labels.title,
          copyLabel: action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",
          vch_code: saved.vch_code,
          vch_date: saved.vch_date,
          manual_voucher: saved.manual_voucher,
          note: saved.note,
          rows: rows.map((row) => ({
            product_code: row.product_code,
            product_name: row.product_name,
            warehouse_name: row.warehouse_name,
            unit: row.unit,
            quantity: row.quantity,
            unit_price: row.unit_price,
            total_price: row.total_price,
          })),
        })
      }

      await fetchVouchers()
      const defaults = await fetchDefaults()
      // يبقى دفتر السندات كما هو (نفس الدفتر المستخدم للسند الذي حُفظ للتو) بدل الرجوع للدفتر
      // الافتراضي — أكثر ملاءمة عند إدخال عدة سندات متتالية على نفس الدفتر.
      const bookId = form.vch_book_id ?? defaults.bookId
      const code = await generateCode(bookId)
      setForm({ ...buildInitialForm(voucherType), vch_code: code, vch_book_id: bookId, currency_id: defaults.currencyId })
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ السند"])
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
          setForm(normalizeVoucher(details || next, voucherType))
          setCurrentIndex(targetIndex)
          setDialogOpen(true)
          return
        }
      }
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId)
      setForm({ ...buildInitialForm(voucherType), vch_code: code, vch_book_id: defaults.bookId, currency_id: defaults.currencyId })
      setCurrentIndex(0)
      setDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      if (form.status === 2) {
        const response = await fetch("/api/stock-vouchers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, status: 3 }),
        })
        if (!response.ok) throw new Error("فشل في إلغاء السند")
        const saved = await response.json()
        await fetchVouchers()
        setForm(normalizeVoucher(saved, voucherType))
        setDialogOpen(true)
      } else {
        const response = await fetch(`/api/stock-vouchers/${form.id}`, { method: "DELETE" })
        if (!response.ok) throw new Error("فشل في حذف السند")
        await advanceAfterDelete()
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    if (filteredVouchers.length === 0) return
    let targetIndex = currentIndex
    if (direction === "first") targetIndex = 0
    else if (direction === "last") targetIndex = filteredVouchers.length - 1
    else if (direction === "previous") targetIndex = Math.max(0, currentIndex - 1)
    else targetIndex = Math.min(filteredVouchers.length - 1, currentIndex + 1)

    const record = filteredVouchers[targetIndex]
    if (!record) return
    await openRow(record, targetIndex)
  }

  const onFormChange = <K extends keyof VoucherRecord>(field: K, value: VoucherRecord[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="w-full max-w-full space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{labels.listTitle}</h1>
        <Button onClick={openNewDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {labels.addLabel}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-blue-700">{`إجمالي ${labels.listTitle}`}</p>
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
          <CardTitle>{`${labels.listTitle} (${filteredVouchers.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-right">رقم السند</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">التاريخ</th>
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
                    <td className="border border-gray-300 px-4 py-2">{Number(voucher.amount || 0).toLocaleString()}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{voucher.status === 2 ? "مرحل" : "مسودة"}</td>
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
                    <td colSpan={5} className="border border-gray-300 px-4 py-6 text-center text-muted-foreground">
                      لا توجد سندات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UnifiedStockVoucher
        voucherType={voucherType}
        dialogOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        onFormChange={onFormChange}
        onItemsChange={(items) => setForm((f) => ({ ...f, items }))}
        voucherBooks={voucherBooks}
        currencyOptions={currencyOptions}
        baseCurrencyId={baseCurrencyId}
        warehouses={warehouses}
        defaultItemWarehouseId={defaultItemWarehouseId}
        priceCategories={priceCategories}
        isSaving={isSaving || isLoading}
        currentIndex={currentIndex}
        totalRecords={filteredVouchers.length}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={currentIndex >= filteredVouchers.length - 1}
        onNew={openNewDialog}
        onSave={saveVoucher}
        onValidateSave={() => validateVoucher(form)}
        onDelete={handleDelete}
        onNavigate={handleNavigate}
        onPrint={handlePrintVoucher}
        onClone={cloneVoucher}
        onCodeResolved={handleCodeResolved}
        onCodeNotFound={handleCodeNotFound}
        errorMessages={errorMessages}
      />
      <StockVoucherPrintLayout data={printData} />
    </div>
  )
}
