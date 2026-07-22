"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/auth-context"
import UnifiedCreditNote, { type VoucherRecord } from "./unified-credit-note"
import { Edit, Plus, Search } from "lucide-react"
import type { PostVoucherAction } from "@/components/common/post-voucher-dialog"
import VoucherPrintLayout, { type VoucherPrintData } from "@/components/common/voucher-print-layout"

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface LookupOption {
  id: number
  name: string
}

// vch_type per credit-notes/_lib.ts: 10 = اشعار دائن, 11 = اشعار مدين.
interface CreditNoteProps {
  voucherType: 10 | 11
}

const TYPE_LABELS: Record<10 | 11, { title: string; listTitle: string; addLabel: string }> = {
  10: { title: "اشعار دائن", listTitle: "الاشعارات الدائنة", addLabel: "إضافة اشعار دائن" },
  11: { title: "اشعار مدين", listTitle: "الاشعارات المدينة", addLabel: "إضافة اشعار مدين" },
}

const buildInitialForm = (voucherType: 10 | 11): VoucherRecord => ({
  id: 0,
  vch_type: voucherType,
  vch_code: "",
  vch_date: new Date().toISOString().slice(0, 10),
  vch_book_id: null,
  currency_id: null,
  rate: 1,
  account_id: null,
  customer_name: "",
  account_cost_centers: [],
  debit_account_id: null,
  debit_account_cost_centers: [],
  vat_account_id: null,
  vat_account_cost_centers: [],
  amount_journal_type_8: null,
  vat_percent: 0,
  vat: null,
  amount: 0,
  payment_classification_id: null,
  salesman_id: null,
  manual_voucher: "",
  manual_date: new Date().toISOString().slice(0, 10),
  note: "",
  status: 1,
  is_printed: 0,
})

const normalizeVoucher = (record: Partial<VoucherRecord>, voucherType: 10 | 11): VoucherRecord => ({
  ...buildInitialForm(voucherType),
  ...record,
  manual_date: record.manual_date || record.vch_date || buildInitialForm(voucherType).manual_date,
})

export default function CreditNote({ voucherType }: CreditNoteProps) {
  const labels = TYPE_LABELS[voucherType]
  const { user } = useAuth()

  const [vouchers, setVouchers] = useState<VoucherRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [defaultBookId, setDefaultBookId] = useState<number | null>(null)
  const [salesmen, setSalesmen] = useState<LookupOption[]>([])
  const [paymentClassifications, setPaymentClassifications] = useState<LookupOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [isNewMode, setIsNewMode] = useState(false)
  const [form, setForm] = useState<VoucherRecord>(buildInitialForm(voucherType))
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [printData, setPrintData] = useState<VoucherPrintData | null>(null)

  useEffect(() => {
    if (!printData) return
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [printData])

  const [searchFilters, setSearchFilters] = useState({ code: "", name: "", currencyId: "__all__", dateFrom: "", dateTo: "" })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const totalVouchers = vouchers.length
  const totalAmount = useMemo(() => vouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0), [vouchers])
  const thisMonthCount = useMemo(() => {
    const now = new Date()
    return vouchers.filter((v) => {
      const d = new Date(v.vch_date)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
  }, [vouchers])
  const averageAmount = totalVouchers > 0 ? totalAmount / totalVouchers : 0

  const currencyName = (currencyId: number | null) => {
    const currency = currencies.find((c) => Number(c.currency_id ?? c.id) === currencyId)
    return currency?.currency_name || currency?.currency_code || ""
  }

  const firstCurrencyId = (): number | null =>
    currencies.reduce<number | null>((min, c) => {
      const id = Number(c.currency_id ?? c.id)
      if (!Number.isFinite(id)) return min
      return min === null || id < min ? id : min
    }, null)

  const filteredVouchers = useMemo(() => {
    const codeQuery = searchFilters.code.trim().toLowerCase()
    const nameQuery = searchFilters.name.trim().toLowerCase()
    return vouchers.filter((voucher) => {
      if (codeQuery && !voucher.vch_code.toLowerCase().includes(codeQuery)) return false
      if (nameQuery && !(voucher.customer_name || "").toLowerCase().includes(nameQuery)) return false
      if (searchFilters.currencyId !== "__all__" && String(voucher.currency_id ?? "") !== searchFilters.currencyId) return false
      if (searchFilters.dateFrom && voucher.vch_date?.slice(0, 10) < searchFilters.dateFrom) return false
      if (searchFilters.dateTo && voucher.vch_date?.slice(0, 10) > searchFilters.dateTo) return false
      return true
    })
  }, [vouchers, searchFilters])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchFilters, voucherType])

  const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / pageSize))
  const pageStart = filteredVouchers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filteredVouchers.length)
  const pagedVouchers = useMemo(
    () => filteredVouchers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredVouchers, currentPage, pageSize],
  )

  useEffect(() => {
    fetchVouchers()
    fetchLookups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherType, user?.id])

  const fetchVouchers = async () => {
    try {
      const response = await fetch(`/api/credit-notes?vch_type=${voucherType}`)
      const data = await response.json()
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch vouchers", error)
      setVouchers([])
    }
  }

  const fetchLookups = async () => {
    try {
      const booksUrl = `/api/receipts/voucher-books?vch_type=${voucherType}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const [currenciesRes, booksRes, salesmenRes, classificationsRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(booksUrl).catch(() => null),
        fetch("/api/salesmen").catch(() => null),
        fetch("/api/payment-classifications").catch(() => null),
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
      if (salesmenRes?.ok) {
        const data = await salesmenRes.json()
        setSalesmen(Array.isArray(data?.data) ? data.data : [])
      }
      if (classificationsRes?.ok) {
        const data = await classificationsRes.json()
        setPaymentClassifications(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const generateCode = async (bookId: number | null) => {
    if (!bookId) return ""
    try {
      const response = await fetch(`/api/credit-notes/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}`)
      if (!response.ok) return ""
      const data = await response.json()
      return data.code || ""
    } catch (error) {
      console.error("Failed to generate voucher number", error)
      return ""
    }
  }

  const fetchVoucherDetails = async (id: number): Promise<VoucherRecord | null> => {
    try {
      const response = await fetch(`/api/credit-notes/${id}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Failed to fetch voucher details", error)
      return null
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
        currencyId = rates.reduce((min: number | null, c: CurrencyOption) => {
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

  const openNewDialog = async () => {
    const defaults = await fetchDefaults()
    const code = await generateCode(defaults.bookId)
    setForm({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: defaults.bookId,
      currency_id: defaults.currencyId,
    })
    setIsNewMode(true)
    setErrorMessages([])
    setDialogOpen(true)
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
    setIsNewMode(true)
    setErrorMessages([])
  }

  const handleBookChange = async (bookId: number | null) => {
    setForm((f) => ({ ...f, vch_book_id: bookId }))
    if (!isNewMode || !bookId) return
    const code = await generateCode(bookId)
    setForm((f) => ({ ...f, vch_code: code }))
  }

  const openEditDialog = async (record: VoucherRecord, index: number) => {
    const details = await fetchVoucherDetails(record.id)
    setForm(normalizeVoucher(details || record, voucherType))
    setCurrentIndex(index)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const handleCodeResolved = async (id: number) => {
    const details = await fetchVoucherDetails(id)
    if (!details) return
    const index = vouchers.findIndex((v) => v.id === id)
    setForm(normalizeVoucher(details, voucherType))
    setCurrentIndex(index >= 0 ? index : 0)
    setIsNewMode(false)
    setErrorMessages([])
  }

  const handleCodeNotFound = (code: string) => {
    setForm((f) => ({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: f.vch_book_id,
      currency_id: f.currency_id,
    }))
    setIsNewMode(true)
    setErrorMessages([])
  }

  const validateVoucher = (data: VoucherRecord): string | null => {
    const code = data.vch_code.trim()
    if (!code) return "رقم السند مطلوب"
    if (!/^[A-Z0-9-]+$/.test(code)) return "رقم السند يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و - فقط"

    if (!data.vch_date) return "تاريخ السند مطلوب"
    if (voucherBooks.length > 0 && !data.vch_book_id) return "يجب اختيار دفتر السندات"
    if (!data.currency_id || !currencies.some((c) => Number(c.currency_id ?? c.id) === data.currency_id)) {
      return "يجب اختيار العملة"
    }

    if (!data.account_id) return "يجب اختيار العميل"
    if (!data.debit_account_id) return "يجب اختيار الحساب المدين"
    if (!data.vat_account_id) return "يجب اختيار حساب الضريبة"

    if (!data.amount_journal_type_8 || Number(data.amount_journal_type_8) <= 0) return "يجب إدخال المبلغ"
    if (!data.amount || Number(data.amount) <= 0) return "يجب إدخال المجموع"
    if (Number(data.vat_percent) < 0) return "نسبة الضريبة غير صحيحة"
    if (Number(data.vat) < 0) return "الضريبة غير صحيحة"

    return null
  }

  const saveVoucher = async (action: PostVoucherAction = "save") => {
    const error = validateVoucher(form)
    if (error) {
      setErrorMessages([error])
      return
    }
    setErrorMessages([])

    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const status = action === "save" || action === "save_print" ? form.status : 2
      const isPrinted = action === "post_print" ? 1 : form.is_printed || 0
      const dataToSave: VoucherRecord = { ...form, status, is_printed: isPrinted }
      const response = await fetch("/api/credit-notes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dataToSave, insert_user: user?.id || null }),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ السند"])
        return
      }
      const saved = await response.json()

      if (action === "post_print" || action === "save_print") {
        setPrintData({
          title: labels.title,
          copyLabel: action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",
          vch_code: saved.vch_code,
          vch_date: saved.vch_date,
          currency_name: currencies.find((c) => Number(c.currency_id ?? c.id) === saved.currency_id)?.currency_name,
          amount: Number(saved.amount || 0),
          manual_voucher: saved.manual_voucher,
          note: saved.note,
          rows: [
            { account_code: saved.vat_account_code, account_name: saved.vat_account_name, debit: saved.vat > 0 ? saved.vat : null, credit: null, note: "" },
            {
              account_code: saved.debit_account_code,
              account_name: saved.debit_account_name,
              debit: saved.amount_journal_type_8,
              credit: null,
              note: "",
            },
            { account_code: saved.account_code, account_name: saved.account_name, debit: null, credit: saved.amount, note: "" },
          ],
        })
      }

      await fetchVouchers()
      const defaults = await fetchDefaults()
      const bookId = form.vch_book_id ?? defaults.bookId
      const code = await generateCode(bookId)
      setForm({
        ...buildInitialForm(voucherType),
        vch_code: code,
        vch_book_id: bookId,
        currency_id: defaults.currencyId,
      })
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ السند"])
    } finally {
      setIsSaving(false)
    }
  }

  const handlePrint = async () => {
    if (!(form.id > 0) || form.status === 3) return

    let isPrinted = form.is_printed || 0
    const copyLabel = form.status !== 2 ? "نسخة للتدقيق" : isPrinted === 1 ? "نسخة" : "نسخة اصلية"

    if (form.status === 2 && isPrinted !== 1) {
      try {
        const response = await fetch(`/api/credit-notes/${form.id}`, { method: "PATCH" })
        if (response.ok) {
          isPrinted = 1
          setForm((f) => ({ ...f, is_printed: 1 }))
        }
      } catch (error) {
        console.error("Failed to mark voucher as printed", error)
      }
    }

    setPrintData({
      title: labels.title,
      copyLabel,
      vch_code: form.vch_code,
      vch_date: form.vch_date,
      currency_name: currencyName(form.currency_id),
      amount: Number(form.amount || 0),
      manual_voucher: form.manual_voucher,
      note: form.note,
      rows: [
        { account_code: form.vat_account_code, account_name: form.vat_account_name, debit: (form.vat || 0) > 0 ? form.vat : null, credit: null, note: "" },
        {
          account_code: form.debit_account_code,
          account_name: form.debit_account_name,
          debit: form.amount_journal_type_8,
          credit: null,
          note: "",
        },
        { account_code: form.account_code, account_name: form.account_name, debit: null, credit: form.amount, note: "" },
      ],
    })
  }

  const advanceAfterDelete = async () => {
    await fetchVouchers()
    setShowDeleteConfirm(false)

    const nextList = vouchers.filter((v) => v.id !== form.id)
    if (nextList.length > 0) {
      const targetIndex = Math.min(Math.max(0, currentIndex), nextList.length - 1)
      const next = nextList[targetIndex]
      if (next) {
        const details = await fetchVoucherDetails(next.id)
        setForm(normalizeVoucher(details || next, voucherType))
        setCurrentIndex(targetIndex)
        setIsNewMode(false)
        setDialogOpen(true)
        return
      }
    }

    const defaults = await fetchDefaults()
    const code = await generateCode(defaults.bookId)
    setForm({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: defaults.bookId,
      currency_id: defaults.currencyId,
    })
    setCurrentIndex(0)
    setIsNewMode(true)
    setDialogOpen(true)
  }

  const logicalCancelVoucher = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/credit-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3 }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في إلغاء السند")
      }
      const saved = await response.json()
      await fetchVouchers()
      setShowDeleteConfirm(false)
      setForm(normalizeVoucher(saved, voucherType))
      setIsNewMode(false)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const physicalDeleteVoucher = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch(`/api/credit-notes/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف السند")
      }
      await advanceAfterDelete()
    } catch (error) {
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = () => (form.status === 2 ? logicalCancelVoucher() : physicalDeleteVoucher())

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && showDeleteConfirm) return
    setDialogOpen(open)
  }

  const handleNavigateRecord = (record: VoucherRecord) => {
    setForm(normalizeVoucher(record, voucherType))
    const targetIndex = vouchers.findIndex((v) => v.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setShowDeleteConfirm(false)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const openRow = (voucher: VoucherRecord) => {
    const index = vouchers.findIndex((v) => v.id === voucher.id)
    openEditDialog(voucher, index >= 0 ? index : 0)
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">{`إجمالي ${labels.listTitle}`}</p>
                <p className="text-3xl font-bold text-blue-900">{totalVouchers}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200">
                <span className="text-lg font-bold text-blue-700">{totalVouchers}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">سندات هذا الشهر</p>
                <p className="text-3xl font-bold text-green-900">{thisMonthCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200">
                <span className="text-lg font-bold text-green-700">{thisMonthCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-6">
            <div>
              <p className="text-sm font-medium text-purple-700">إجمالي المبالغ</p>
              <p className="text-3xl font-bold text-purple-900">{totalAmount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="p-6">
            <div>
              <p className="text-sm font-medium text-amber-700">متوسط قيمة السند</p>
              <p className="text-3xl font-bold text-amber-900">
                {averageAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث المتقدم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <Label htmlFor="search-name">العميل</Label>
              <Input
                id="search-name"
                value={searchFilters.name}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, name: e.target.value }))}
                className="text-right"
                placeholder="ابحث بالاسم..."
              />
            </div>
            <div>
              <Label htmlFor="search-currency">العملة</Label>
              <Select
                value={searchFilters.currencyId}
                onValueChange={(value) => setSearchFilters((prev) => ({ ...prev, currencyId: value }))}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">جميع العملات</SelectItem>
                  {currencies.map((c) => (
                    <SelectItem key={c.currency_id ?? c.id} value={String(c.currency_id ?? c.id)}>
                      {c.currency_name || c.currency_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
                  <th className="border border-gray-300 px-4 py-2 text-right">العميل</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">العملة</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">المجموع</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pagedVouchers.map((voucher) => (
                  <tr key={voucher.id} className="cursor-pointer hover:bg-gray-50" onDoubleClick={() => openRow(voucher)}>
                    <td className="border border-gray-300 px-4 py-2">{voucher.vch_code}</td>
                    <td className="border border-gray-300 px-4 py-2">{voucher.vch_date?.slice(0, 10)}</td>
                    <td className="border border-gray-300 px-4 py-2">{voucher.customer_name}</td>
                    <td className="border border-gray-300 px-4 py-2">{currencyName(voucher.currency_id)}</td>
                    <td className="border border-gray-300 px-4 py-2">{Number(voucher.amount || 0).toLocaleString()}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            openRow(voucher)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedVouchers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-gray-300 px-4 py-6 text-center text-muted-foreground">
                      لا توجد نتائج
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                عرض {pageStart} إلى {pageEnd} من {filteredVouchers.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                >
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  التالي
                </Button>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-10 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <UnifiedCreditNote
        title={labels.title}
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={vouchers.length}
        currencies={currencies}
        voucherBooks={voucherBooks}
        salesmen={salesmen}
        paymentClassifications={paymentClassifications}
        form={form}
        isSaving={isSaving}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleDialogOpenChange}
        onNew={openNewDialog}
        onSave={saveVoucher}
        onValidateSave={() => validateVoucher(form)}
        onDelete={() => form.id && setShowDeleteConfirm(true)}
        onClone={cloneVoucher}
        onPrint={handlePrint}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        onBookChange={handleBookChange}
        onCodeResolved={handleCodeResolved}
        onCodeNotFound={handleCodeNotFound}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        canSave={
          !!form.vch_code.trim() &&
          !!form.vch_date &&
          !!form.currency_id &&
          currencies.some((c) => Number(c.currency_id ?? c.id) === form.currency_id)
        }
        isFirstRecord={currentIndex <= 0}
        isLastRecord={vouchers.length === 0 ? true : currentIndex >= vouchers.length - 1}
        isNewMode={isNewMode}
        errorMessages={errorMessages}
      />
      <VoucherPrintLayout data={printData} />
    </div>
  )
}
