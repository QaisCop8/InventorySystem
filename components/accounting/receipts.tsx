"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import UnifiedReceiptVoucher, {
  type VoucherJournalRow,
  type VoucherChequeRow,
  type VoucherCardRow,
  type VoucherNoteRow,
  type VoucherRecord,
} from "./unified-receipt-voucher"
import { Edit, Plus, Search } from "lucide-react"

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

interface BankOption {
  id: number
  bank_code?: string
  bank_name: string
}

interface BranchOption {
  id: number
  branch_code?: string
  branch_name: string
  bank_id: number | null
}

interface ReceiptsProps {
  voucherType: 1 | 2
}

const TYPE_LABELS: Record<1 | 2, { title: string; listTitle: string; addLabel: string; customerLabel: string }> = {
  1: { title: "سند قبض", listTitle: "سندات القبض", addLabel: "إضافة سند قبض", customerLabel: "المقبوض منه" },
  2: { title: "سند صرف", listTitle: "سندات الصرف", addLabel: "إضافة سند صرف", customerLabel: "المدفوع له" },
}

const emptyJournalRow: VoucherJournalRow = {
  account_id: null,
  account_code: "",
  account_name: "",
  amount: null,
  note: "",
  cost_centers: [],
}

const emptyChequeRow: VoucherChequeRow = {
  bank_account: "",
  cheq_num: "",
  bank_no: "",
  bank_id: null,
  bank_name: "",
  branch_no: "",
  branch_id: null,
  branch_name: "",
  due_date: "",
  amount: null,
  cheq_owner_name: "",
}

const emptyCardRow: VoucherCardRow = {
  card_type_id: null,
  card_type_name: "",
  card_no: "",
  expire_date: "",
  account_id: null,
  account_code: "",
  account_name: "",
  amount: null,
  bank_amount: null,
}

const buildInitialForm = (voucherType: 1 | 2): VoucherRecord => ({
  id: 0,
  vch_type: voucherType,
  vch_code: "",
  vch_date: new Date().toISOString().slice(0, 10),
  vch_book_id: null,
  currency_id: null,
  rate: 1,
  customer_account_id: null,
  customer_name: "",
  to_account_id: null,
  cash_amount: null,
  cash_account_id: null,
  check_amount: null,
  check_account_id: null,
  credit_card_amount: null,
  credit_card_account_id: null,
  amount: 0,
  payment_classification_id: null,
  salesman_id: null,
  manual_voucher: "",
  manual_date: "",
  note: "",
  status: 1,
  journal: [{ ...emptyJournalRow }],
  cheques: [{ ...emptyChequeRow }],
  cards: [{ ...emptyCardRow }],
  notes: [],
})

const normalizeVoucher = (record: Partial<VoucherRecord>, voucherType: 1 | 2): VoucherRecord => ({
  ...buildInitialForm(voucherType),
  ...record,
  journal: record.journal?.length ? (record.journal as VoucherJournalRow[]) : [{ ...emptyJournalRow }],
  cheques: record.cheques?.length ? (record.cheques as VoucherChequeRow[]) : [{ ...emptyChequeRow }],
  cards: record.cards?.length ? (record.cards as VoucherCardRow[]) : [{ ...emptyCardRow }],
  notes: (record.notes as VoucherNoteRow[]) || [],
})

export default function Receipts({ voucherType }: ReceiptsProps) {
  const labels = TYPE_LABELS[voucherType]

  const [vouchers, setVouchers] = useState<VoucherRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [banks, setBanks] = useState<BankOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [salesmen, setSalesmen] = useState<LookupOption[]>([])
  const [paymentClassifications, setPaymentClassifications] = useState<LookupOption[]>([])
  const [cardTypes, setCardTypes] = useState<LookupOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [isNewMode, setIsNewMode] = useState(false)
  const [form, setForm] = useState<VoucherRecord>(buildInitialForm(voucherType))
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [errorMessages, setErrorMessages] = useState<string[]>([])

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
  }, [voucherType])

  const fetchVouchers = async () => {
    try {
      const response = await fetch(`/api/receipts?vch_type=${voucherType}`)
      const data = await response.json()
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch vouchers", error)
      setVouchers([])
    }
  }

  const fetchLookups = async () => {
    try {
      const [currenciesRes, booksRes, banksRes, branchesRes, salesmenRes, classificationsRes, cardTypesRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch(`/api/receipts/voucher-books?vch_type=${voucherType}`).catch(() => null),
        fetch("/api/banks").catch(() => null),
        fetch("/api/branches").catch(() => null),
        fetch("/api/salesmen").catch(() => null),
        fetch("/api/payment-classifications").catch(() => null),
        fetch("/api/credit-card-types").catch(() => null),
      ])

      if (currenciesRes?.ok) {
        const data = await currenciesRes.json()
        setCurrencies(Array.isArray(data?.rates) ? data.rates : [])
      }
      if (booksRes?.ok) {
        const data = await booksRes.json()
        setVoucherBooks(Array.isArray(data) ? data : [])
      }
      if (banksRes?.ok) {
        const data = await banksRes.json()
        setBanks(Array.isArray(data) ? data : [])
      }
      if (branchesRes?.ok) {
        const data = await branchesRes.json()
        setBranches(Array.isArray(data) ? data : [])
      }
      if (salesmenRes?.ok) {
        const data = await salesmenRes.json()
        setSalesmen(Array.isArray(data?.data) ? data.data : [])
      }
      if (classificationsRes?.ok) {
        const data = await classificationsRes.json()
        setPaymentClassifications(Array.isArray(data) ? data : [])
      }
      if (cardTypesRes?.ok) {
        const data = await cardTypesRes.json()
        setCardTypes(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const generateCode = async () => {
    try {
      const response = await fetch(`/api/receipts/generate-number?vch_type=${voucherType}`)
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
      const response = await fetch(`/api/receipts/${id}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Failed to fetch voucher details", error)
      return null
    }
  }

  const openNewDialog = async () => {
    const code = await generateCode()
    setForm({ ...buildInitialForm(voucherType), vch_code: code })
    setIsNewMode(true)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const openEditDialog = async (record: VoucherRecord, index: number) => {
    const details = await fetchVoucherDetails(record.id)
    setForm(normalizeVoucher(details || record, voucherType))
    setCurrentIndex(index)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
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

    if (!data.customer_account_id) return `يجب اختيار ${labels.customerLabel}`

    const cashAmount = Number(data.cash_amount || 0)
    const checkAmount = Number(data.check_amount || 0)
    const creditCardAmount = Number(data.credit_card_amount || 0)
    const totalAmount = Number(data.amount || 0)

    if (cashAmount > 0 && !data.cash_account_id) return "يجب اختيار حساب الصندوق"
    if (checkAmount > 0 && !data.check_account_id) return "يجب اختيار حساب صندوق الشيكات"
    if (creditCardAmount > 0 && !data.credit_card_account_id) return "يجب اختيار حساب البطاقات"

    if (totalAmount <= 0) return "يجب إدخال المبلغ"

    if (Math.round((cashAmount + checkAmount + creditCardAmount - totalAmount) * 100) / 100 !== 0) {
      return "مجموع (نقدي + شيكات + بطاقات) يجب أن يساوي المبلغ الإجمالي"
    }

    const journalRows = (data.journal || []).filter((row: VoucherJournalRow) => row.account_id && Number(row.amount || 0) > 0)
    if (journalRows.length === 0) {
      if (!data.to_account_id) return "يجب اختيار حساب مقابل (على حساب) أو إضافة سطر في تبويب الحسابات"
    } else {
      const journalTotal = journalRows.reduce((sum: number, row: VoucherJournalRow) => sum + Number(row.amount || 0), 0)
      if (Math.round((totalAmount - journalTotal) * 100) / 100 !== 0) {
        return "إجمالي تبويب الحسابات يجب أن يساوي المبلغ الإجمالي"
      }
    }

    if (checkAmount > 0) {
      const validCheques = (data.cheques || []).filter((row) => row.cheq_num && Number(row.amount || 0) > 0)
      const chequesTotal = validCheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      if (Math.round((chequesTotal - checkAmount) * 100) / 100 !== 0) {
        return "إجمالي تبويب الشيكات يجب أن يساوي مبلغ الشيكات"
      }
    }

    if (creditCardAmount > 0) {
      const validCards = (data.cards || []).filter((row) => (row.card_no || row.card_type_id) && Number(row.amount || 0) > 0)
      const cardsTotal = validCards.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      if (Math.round((cardsTotal - creditCardAmount) * 100) / 100 !== 0) {
        return "إجمالي تبويب البطاقات يجب أن يساوي مبلغ البطاقات"
      }
    }

    return null
  }

  const saveVoucher = async () => {
    const error = validateVoucher(form)
    if (error) {
      setErrorMessages([error])
      return
    }
    setErrorMessages([])

    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/receipts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ السند"])
        return
      }
      await fetchVouchers()
      const code = await generateCode()
      setForm({ ...buildInitialForm(voucherType), vch_code: code })
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ السند"])
    } finally {
      setIsSaving(false)
    }
  }

  const deleteVoucher = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/receipts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3 }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف السند")
      }
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

      const code = await generateCode()
      setForm({ ...buildInitialForm(voucherType), vch_code: code })
      setCurrentIndex(0)
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{labels.listTitle}</h1>
        <Button onClick={openNewDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {labels.addLabel}
        </Button>
      </div>

      {/* Statistics */}
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

      {/* Advanced Search */}
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
              <Label htmlFor="search-name">{labels.customerLabel}</Label>
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

      {/* List */}
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
                  <th className="border border-gray-300 px-4 py-2 text-right">{labels.customerLabel}</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">العملة</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">المبلغ</th>
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

      <UnifiedReceiptVoucher
        title={labels.title}
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={vouchers.length}
        currencies={currencies}
        voucherBooks={voucherBooks}
        banks={banks}
        branches={branches}
        salesmen={salesmen}
        paymentClassifications={paymentClassifications}
        cardTypes={cardTypes}
        form={form}
        isSaving={isSaving}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleDialogOpenChange}
        onNew={openNewDialog}
        onSave={saveVoucher}
        onDelete={() => form.id && setShowDeleteConfirm(true)}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        onJournalChange={(journal) => setForm((f) => ({ ...f, journal }))}
        onChequesChange={(cheques) => setForm((f) => ({ ...f, cheques }))}
        onCardsChange={(cards) => setForm((f) => ({ ...f, cards }))}
        onNotesChange={(notes) => setForm((f) => ({ ...f, notes }))}
        onConfirmDelete={deleteVoucher}
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
    </div>
  )
}
