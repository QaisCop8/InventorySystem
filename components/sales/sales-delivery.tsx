"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit, Plus, Search } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import UnifiedSalesDelivery, {
  type SalesDeliveryRecord,
  type SalesVoucherItemRow,
  DELIVERY_SELL_VCH_TYPE,
  toGridDateString,
} from "./unified-sales-delivery"
import type { PostVoucherAction } from "@/components/common/post-voucher-dialog"

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

const TITLE = "إرسالية مبيعات"
const LIST_TITLE = "إرساليات المبيعات"

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
  total_price: null,
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
}

const buildInitialForm = (): SalesDeliveryRecord => ({
  id: 0,
  vch_type: DELIVERY_SELL_VCH_TYPE,
  vch_code: "",
  vch_date: new Date().toISOString().slice(0, 10),
  vch_book_id: null,
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
  vat_percent: 0,
  amount: 0,
  manual_voucher: "",
  manual_date: new Date().toISOString().slice(0, 10),
  note: "",
  status: 1,
  is_printed: 0,
  items: [{ ...emptyItemRow }],
})

const normalizeVoucher = (record: Partial<SalesDeliveryRecord>): SalesDeliveryRecord => ({
  ...buildInitialForm(),
  ...record,
  manual_date: record.manual_date || record.vch_date || buildInitialForm().manual_date,
  items: record.items?.length
    ? (record.items as SalesVoucherItemRow[]).map((item) => ({ ...item, expiry_date: toGridDateString(item.expiry_date) }))
    : [{ ...emptyItemRow }],
})

export default function SalesDelivery() {
  const { user } = useAuth()

  const [vouchers, setVouchers] = useState<SalesDeliveryRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [defaultBookId, setDefaultBookId] = useState<number | null>(null)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<number | null>(null)
  const [salesmen, setSalesmen] = useState<LookupOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<SalesDeliveryRecord>(buildInitialForm())
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errorMessages, setErrorMessages] = useState<string[]>([])

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
      const response = await fetch(`/api/sales-vouchers?vch_type=${DELIVERY_SELL_VCH_TYPE}`)
      const data = await response.json()
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch sales delivery vouchers", error)
      setVouchers([])
    }
  }

  const fetchLookups = async () => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${DELIVERY_SELL_VCH_TYPE}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const warehouseDefaultsUrl = user?.id ? `/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}` : null
      const [currenciesRes, booksRes, warehousesRes, warehouseDefaultsRes, salesmenRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(booksUrl).catch(() => null),
        fetch("/api/warehouses").catch(() => null),
        warehouseDefaultsUrl ? fetch(warehouseDefaultsUrl).catch(() => null) : Promise.resolve(null),
        fetch("/api/salesmen").catch(() => null),
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
      if (salesmenRes?.ok) {
        const data = await salesmenRes.json()
        setSalesmen(Array.isArray(data) ? data : Array.isArray(data?.salesmen) ? data.salesmen : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const fetchDefaults = async (): Promise<{ bookId: number | null; currencyId: number | null }> => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${DELIVERY_SELL_VCH_TYPE}${
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
      const response = await fetch(`/api/sales-vouchers/generate-number?vch_type=${DELIVERY_SELL_VCH_TYPE}&vch_book_id=${bookId}`)
      if (!response.ok) return fallbackCode
      const data = await response.json()
      return data.code || fallbackCode
    } catch (error) {
      console.error("Failed to generate sales delivery voucher number", error)
      return fallbackCode
    }
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
    setIsLoading(true)
    try {
      const defaults = await fetchDefaults()
      const code = await generateCode(defaults.bookId)
      setForm({ ...buildInitialForm(), vch_code: code, vch_book_id: defaults.bookId, currency_id: defaults.currencyId })
      setErrorMessages([])
      setDialogOpen(true)
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
      const index = vouchers.findIndex((v) => v.id === id)
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

  const validateVoucher = (data: SalesDeliveryRecord): string | null => {
    if (!data.vch_code.trim()) return "رقم السند مطلوب"
    if (!data.vch_book_id) return "دفتر السندات مطلوب"
    if (!data.currency_id) return "العملة مطلوبة"
    if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"
    if (!data.account_id) return "يجب اختيار العميل"
    const items = (data.items || []).filter((i) => i.product_id)
    if (items.length === 0) return "يجب إدخال صنف واحد على الأقل"
    if (items.some((i) => !i.warehouse_id)) return "يجب اختيار المستودع لكل صنف"
    if (items.some((i) => !(Number(i.quantity || 0) > 0))) return "يجب إدخال الكمية لكل صنف"
    return null
  }

  const saveVoucher = async (action: PostVoucherAction = "save") => {
    const status = action === "save" || action === "save_print" ? form.status || 1 : 2
    const isPrinted = action === "post_print" ? 1 : form.is_printed || 0
    const dataToSave: SalesDeliveryRecord = { ...form, status, is_printed: isPrinted }

    const validationError = validateVoucher(dataToSave)
    if (validationError) {
      setErrorMessages([validationError])
      return
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
        const error = await response.json()
        setErrorMessages([error.error || "فشل في حفظ السند"])
        return
      }

      await fetchVouchers()
      const defaults = await fetchDefaults()
      const bookId = form.vch_book_id ?? defaults.bookId
      const code = await generateCode(bookId)
      setForm({ ...buildInitialForm(), vch_code: code, vch_book_id: bookId, currency_id: defaults.currencyId })
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

  const onFormChange = <K extends keyof SalesDeliveryRecord>(field: K, value: SalesDeliveryRecord[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="w-full max-w-full space-y-6" dir="rtl">
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

      <UnifiedSalesDelivery
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
        salesmen={salesmen}
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
        onClone={cloneVoucher}
        onCodeResolved={handleCodeResolved}
        onCodeNotFound={handleCodeNotFound}
        errorMessages={errorMessages}
      />
    </div>
  )
}
