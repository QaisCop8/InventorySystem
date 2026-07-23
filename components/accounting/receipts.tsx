"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/auth-context"
import UnifiedReceiptVoucher, {
  type VoucherJournalRow,
  type VoucherChequeRow,
  type VoucherCardRow,
  type VoucherNoteRow,
  type VoucherRecord,
} from "./unified-receipt-voucher"
import { Edit, Plus, Search } from "lucide-react"
import type { PostVoucherAction } from "@/components/common/post-voucher-dialog"
import VoucherPrintLayout, { type VoucherPrintData } from "@/components/common/voucher-print-layout"
import type { BankAccountRecord } from "@/components/admin/unified-bank-accounts"

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

interface CardTypeOption {
  id: number
  name: string
  currency_id: number | null
  financial_account_id: number | null
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

// vch_type per voucher_types_tbl: 8 = سند قبض, 9 = سند صرف.
interface ReceiptsProps {
  voucherType: 8 | 9
}

const TYPE_LABELS: Record<8 | 9, { title: string; listTitle: string; addLabel: string; customerLabel: string }> = {
  8: { title: "سند قبض", listTitle: "سندات القبض", addLabel: "إضافة سند قبض", customerLabel: "المقبوض منه" },
  9: { title: "سند صرف", listTitle: "سندات الصرف", addLabel: "إضافة سند صرف", customerLabel: "المدفوع له" },
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
  bank_account_id: null,
  jary_account_id: null,
  cheq_num: "",
  cheque_book_cheque_id: null,
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
  currency_id: null,
}

const buildInitialForm = (voucherType: 8 | 9): VoucherRecord => ({
  id: 0,
  vch_type: voucherType,
  vch_code: "",
  vch_date: new Date().toISOString().slice(0, 10),
  vch_book_id: null,
  currency_id: null,
  rate: 1,
  account_id: null,
  customer_name: "",
  to_account_id: null,
  cash_amount: null,
  cash_account_id: null,
  cash_account_cost_centers: [],
  check_amount: null,
  check_account_id: null,
  check_account_cost_centers: [],
  credit_card_amount: null,
  credit_card_account_id: null,
  credit_card_account_cost_centers: [],
  amount: 0,
  payment_classification_id: null,
  salesman_id: null,
  manual_voucher: "",
  manual_date: new Date().toISOString().slice(0, 10),
  note: "",
  status: 1,
  is_printed: 0,
  journal: [{ ...emptyJournalRow }],
  cheques: [{ ...emptyChequeRow, due_date: new Date().toISOString().slice(0, 10) }],
  cards: [{ ...emptyCardRow }],
  notes: [],
})

const normalizeVoucher = (record: Partial<VoucherRecord>, voucherType: 8 | 9): VoucherRecord => ({
  ...buildInitialForm(voucherType),
  ...record,
  manual_date: record.manual_date || record.vch_date || buildInitialForm(voucherType).manual_date,
  journal: record.journal?.length ? (record.journal as VoucherJournalRow[]) : [{ ...emptyJournalRow }],
  cheques: record.cheques?.length ? (record.cheques as VoucherChequeRow[]) : [{ ...emptyChequeRow }],
  cards: record.cards?.length ? (record.cards as VoucherCardRow[]) : [{ ...emptyCardRow }],
  notes: (record.notes as VoucherNoteRow[]) || [],
})

export default function Receipts({ voucherType }: ReceiptsProps) {
  const labels = TYPE_LABELS[voucherType]
  const { user } = useAuth()

  const [vouchers, setVouchers] = useState<VoucherRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [voucherBooks, setVoucherBooks] = useState<LookupOption[]>([])
  const [defaultBookId, setDefaultBookId] = useState<number | null>(null)
  const [banks, setBanks] = useState<BankOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([])
  const [disallowManualChequeEntryInPayment, setDisallowManualChequeEntryInPayment] = useState(false)
  const [salesmen, setSalesmen] = useState<LookupOption[]>([])
  const [paymentClassifications, setPaymentClassifications] = useState<LookupOption[]>([])
  const [cardTypes, setCardTypes] = useState<CardTypeOption[]>([])

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

  // النظام الافتراضي عند فتح سند جديد: أول عملة معرّفة في النظام (أصغر معرّف).
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
    // إعادة الجلب عند توفر user.id تُقيّد دفتر السندات بصلاحيات المستخدم الفعلي بمجرد اكتمال تسجيل الدخول.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherType, user?.id])

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
      const booksUrl = `/api/receipts/voucher-books?vch_type=${voucherType}${
        user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""
      }`
      const [currenciesRes, booksRes, banksRes, branchesRes, salesmenRes, classificationsRes, cardTypesRes, bankAccountsRes, systemSettingsRes] =
        await Promise.all([
          fetch("/api/exchange-rates").catch(() => null),
          fetch(booksUrl).catch(() => null),
          fetch("/api/banks").catch(() => null),
          fetch("/api/branches").catch(() => null),
          fetch("/api/salesmen").catch(() => null),
          fetch("/api/payment-classifications").catch(() => null),
          fetch("/api/credit-card-types").catch(() => null),
          fetch("/api/bank-accounts").catch(() => null),
          fetch("/api/settings/system").catch(() => null),
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
      if (bankAccountsRes?.ok) {
        const data = await bankAccountsRes.json()
        setBankAccounts(Array.isArray(data) ? data : [])
      }
      if (systemSettingsRes?.ok) {
        const data = await systemSettingsRes.json()
        const settings = data?.settings ?? data
        setDisallowManualChequeEntryInPayment(Boolean(settings?.disallow_manual_cheque_entry_in_payment))
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  // الرقم يتضمّن رمز دفتر السندات (مثال REF00001) فلا بد من تمريره دائماً.
  const generateCode = async (bookId: number | null) => {
    if (!bookId) return ""
    try {
      const response = await fetch(`/api/receipts/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}`)
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

  // نفس منطق تعبئة الحسابات الافتراضية المستخدم عند تغيير العملة يدوياً (handleCurrencyChange
  // في unified-receipt-voucher)، لكن هنا لتعبئتها فور فتح سند جديد بدل انتظار المستخدم لتغيير
  // العملة يدوياً ليحصل عليها.
  const fetchAccountDefaultsForCurrency = async (
    currencyId: number | null,
  ): Promise<{ cash_account_id: number | null; check_account_id: number | null; credit_card_account_id: number | null }> => {
    const empty = { cash_account_id: null, check_account_id: null, credit_card_account_id: null }
    if (!user?.id || !currencyId) return empty
    try {
      const response = await fetch(`/api/settings/users-currencies-default?user_id=${encodeURIComponent(user.id)}`)
      if (!response.ok) return empty
      const data = await response.json()
      const row = Array.isArray(data?.rows) ? data.rows.find((r: any) => Number(r.currency_id) === currencyId) : null
      return {
        cash_account_id: row?.cash_account_id ?? null,
        check_account_id: row?.incoming_checks_account_id ?? null,
        credit_card_account_id: row?.card_account_id ?? null,
      }
    } catch (error) {
      console.error("Failed to fetch default accounts for currency", error)
      return empty
    }
  }

  const openNewDialog = async () => {
    const defaults = await fetchDefaults()
    const accountDefaults = await fetchAccountDefaultsForCurrency(defaults.currencyId)
    const code = await generateCode(defaults.bookId)
    setForm({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: defaults.bookId,
      currency_id: defaults.currencyId,
      ...accountDefaults,
      cards: [{ ...emptyCardRow, currency_id: defaults.currencyId }],
    })
    setIsNewMode(true)
    setErrorMessages([])
    setDialogOpen(true)
  }

  // نسخ السند الحالي إلى سند جديد غير محفوظ: نفس البيانات (العميل/الحسابات/الشيكات/البطاقات)
  // برقم ودفتر وتاريخ جديد بدل مسحها، ليحفظها المستخدم كسند مستقل دون إعادة إدخالها.
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

  // تغيير دفتر السندات لسند جديد لم يُحفظ بعد يعيد توليد الرقم (رمز الدفتر جزء من الرقم) —
  // لا يُغيَّر رقم سند محفوظ مسبقاً لتجنّب إعادة ترقيم مستند موجود.
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

  // كتابة رقم سند موجود فعلاً في حقل رقم السند (بعد تصفيره وإعادة صياغته) تعرضه للتعديل.
  const handleCodeResolved = async (id: number) => {
    const details = await fetchVoucherDetails(id)
    if (!details) return
    const index = vouchers.findIndex((v) => v.id === id)
    setForm(normalizeVoucher(details, voucherType))
    setCurrentIndex(index >= 0 ? index : 0)
    setIsNewMode(false)
    setErrorMessages([])
  }

  // رقم لا يخص أي سند محفوظ -> تصفير كل الحقول والشبكات لسند جديد بهذا الرقم، مع إبقاء دفتر
  // السندات والعملة الحاليين لأنهما جزء من السياق الذي أُنشئ منه الرقم نفسه.
  const handleCodeNotFound = (code: string) => {
    setForm((f) => ({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: f.vch_book_id,
      currency_id: f.currency_id,
      cards: [{ ...emptyCardRow, currency_id: f.currency_id }],
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
    if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"

    if (!data.account_id) return `يجب اختيار ${labels.customerLabel}`

    const cashAmount = Number(data.cash_amount || 0)
    const checkAmount = Number(data.check_amount || 0)
    const creditCardAmount = Number(data.credit_card_amount || 0)
    const totalAmount = Number(data.amount || 0)

    if (cashAmount > 0 && !data.cash_account_id) return "يجب اختيار حساب الصندوق"
    if (checkAmount > 0) {
      if (voucherType === 9) {
        // سند الصرف: حساب صندوق الشيكات معطَّل — الحساب المقابل الفعلي يُشتق من jary_account_id
        // الخاص بالحساب البنكي المختار في شبكة الشيكات بدلاً منه.
        const anyRow = (data.cheques || []).find((row) => row.bank_account_id)
        if (!anyRow?.jary_account_id) return "الحساب البنكي المختار لا يملك حساب جاري معرَّف (jary_account_id) في تعريف الحسابات البنكية"
      } else if (!data.check_account_id) {
        return "يجب اختيار حساب صندوق الشيكات"
      }
    }
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
      // أي سطر لمسه المستخدم فعلياً (مبلغ أو رقم شيك أو رقم حساب) يجب أن يحمل بياناته الأساسية
      // كاملة قبل الحفظ — إغفال أيٍّ منها يجعل الشيك غير قابل للتتبع لاحقاً (تحصيل/إرجاع/إيداع).
      const enteredCheques = (data.cheques || []).filter(
        (row) => Number(row.amount || 0) > 0 || row.cheq_num || row.bank_account,
      )
      for (const row of enteredCheques) {
        if (!row.cheq_num) return "رقم الشيك مطلوب في تبويب الشيكات"
        if (!row.due_date) return "تاريخ الاستحقاق مطلوب في تبويب الشيكات"
        if (!row.bank_id) return "البنك مطلوب في تبويب الشيكات"
        if (!row.branch_id) return "الفرع مطلوب في تبويب الشيكات"
        if (voucherType === 9 && !row.bank_account) return "رقم الحساب مطلوب في تبويب الشيكات"
      }

      // سند الصرف يصدر شيكاته من حساب بنكي واحد فقط — لا يجوز خلط أكثر من حساب ضمن نفس السند.
      if (voucherType === 9) {
        const distinctAccounts = new Set(enteredCheques.map((row) => (row.bank_account || "").trim()).filter(Boolean))
        if (distinctAccounts.size > 1) {
          return "يجب أن تكون جميع الشيكات من نفس الحساب البنكي"
        }
      }

      const validCheques = enteredCheques.filter((row) => row.cheq_num && Number(row.amount || 0) > 0)
      const chequesTotal = validCheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      if (Math.round((chequesTotal - checkAmount) * 100) / 100 !== 0) {
        return "إجمالي تبويب الشيكات يجب أن يساوي مبلغ الشيكات"
      }
    }

    if (creditCardAmount > 0 && !data.cards?.[0]?.card_type_id) {
      return "يجب اختيار نوع البطاقة في تبويب تفاصيل البطاقة"
    }

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
      // حفظ عادي / حفظ وطباعة: تبقى الحالة كما هي (لا ترحيل). حفظ وترحيل / ترحيل وطباعة: تصبح
      // status=2 (مرحل) ويُقفل السند بعدها. علامة الطباعة (is_printed=1) تُسجَّل فقط عند "ترحيل
      // وطباعة" — أي طباعة أخرى (بما فيها حفظ وطباعة) لا تُغيّرها هنا إطلاقاً.
      const status = action === "save" || action === "save_print" ? form.status : 2
      const isPrinted = action === "post_print" ? 1 : form.is_printed || 0
      // سند الصرف: حساب صندوق الشيكات معطَّل في الواجهة دائماً null — الحساب المقابل الفعلي
      // لسطر قيد "شيكات" هو jary_account_id الخاص بالحساب البنكي المختار في شبكة الشيكات.
      const checkAccountId =
        voucherType === 9 ? (form.cheques || []).find((row) => row.bank_account_id)?.jary_account_id ?? null : form.check_account_id
      // المبلغ في تبويب تفاصيل البطاقة يتبع حقل "بطاقات" في الرئيسية دائماً.
      const dataToSave: VoucherRecord = {
        ...form,
        status,
        is_printed: isPrinted,
        check_account_id: checkAccountId,
        cards: [{ ...(form.cards?.[0] || emptyCardRow), amount: form.credit_card_amount }],
      }
      const response = await fetch("/api/receipts", {
        method,
        headers: { "Content-Type": "application/json" },
        // insert_user: يُسجَّل عند الإدراج فقط (POST يتجاهله PUT في _lib.ts)، لتوثيق مَن أنشأ
        // السند دون أن يتغيّر لاحقاً عند تعديل سند موجود من مستخدم آخر.
        body: JSON.stringify({ ...dataToSave, insert_user: user?.id || null }),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ السند"])
        return
      }
      const saved = await response.json()

      if (action === "post_print" || action === "save_print") {
        const journalRows = Array.isArray(saved.journal) ? saved.journal : []
        setPrintData({
          title: labels.title,
          copyLabel: action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",
          vch_code: saved.vch_code,
          vch_date: saved.vch_date,
          currency_name: currencies.find((c) => Number(c.currency_id ?? c.id) === saved.currency_id)?.currency_name,
          amount: Number(saved.amount || 0),
          manual_voucher: saved.manual_voucher,
          note: saved.note,
          rows: journalRows.map((row: any) => ({
            account_code: row.account_code,
            account_name: row.account_name,
            debit: row.credit_debit === 1 ? row.amount : null,
            credit: row.credit_debit === 2 ? row.amount : null,
            note: row.note,
          })),
        })
      }

      await fetchVouchers()
      const defaults = await fetchDefaults()
      const accountDefaults = await fetchAccountDefaultsForCurrency(defaults.currencyId)
      // يبقى دفتر السندات كما هو (نفس الدفتر المستخدم للسند الذي حُفظ للتو) بدل الرجوع للدفتر
      // الافتراضي — أكثر ملاءمة عند إدخال عدة سندات متتالية على نفس الدفتر.
      const bookId = form.vch_book_id ?? defaults.bookId
      const code = await generateCode(bookId)
      setForm({
        ...buildInitialForm(voucherType),
        vch_code: code,
        vch_book_id: bookId,
        currency_id: defaults.currencyId,
        ...accountDefaults,
        cards: [{ ...emptyCardRow, currency_id: defaults.currencyId }],
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

  // زر الطباعة المستقل (خارج تدفق الحفظ): سند فعال (status=1) لم يُرحَّل بعد يُطبع كـ"نسخة
  // للتدقيق" فقط دون أي تسجيل. سند مُرحَّل (status=2) يُسجَّل عليه is_printed=1 عند أول طباعة
  // فتظهر "نسخة اصلية"، وأي طباعة لاحقة له تظهر "نسخة" فقط دون إعادة التسجيل.
  const handlePrint = async () => {
    if (!(form.id > 0) || form.status === 3) return

    let isPrinted = form.is_printed || 0
    const copyLabel = form.status !== 2 ? "نسخة للتدقيق" : isPrinted === 1 ? "نسخة" : "نسخة اصلية"

    if (form.status === 2 && isPrinted !== 1) {
      try {
        const response = await fetch(`/api/receipts/${form.id}`, { method: "PATCH" })
        if (response.ok) {
          isPrinted = 1
          setForm((f) => ({ ...f, is_printed: 1 }))
        }
      } catch (error) {
        console.error("Failed to mark voucher as printed", error)
      }
    }

    const journalRows = Array.isArray(form.journal) ? form.journal : []
    setPrintData({
      title: labels.title,
      copyLabel,
      vch_code: form.vch_code,
      vch_date: form.vch_date,
      currency_name: currencyName(form.currency_id),
      amount: Number(form.amount || 0),
      manual_voucher: form.manual_voucher,
      note: form.note,
      rows: journalRows.map((row: any) => ({
        account_code: row.account_code,
        account_name: row.account_name,
        debit: row.credit_debit === 1 ? row.amount : null,
        credit: row.credit_debit === 2 ? row.amount : null,
        note: row.note,
      })),
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
    const accountDefaults = await fetchAccountDefaultsForCurrency(defaults.currencyId)
    const code = await generateCode(defaults.bookId)
    setForm({
      ...buildInitialForm(voucherType),
      vch_code: code,
      vch_book_id: defaults.bookId,
      currency_id: defaults.currencyId,
      ...accountDefaults,
      cards: [{ ...emptyCardRow, currency_id: defaults.currencyId }],
    })
    setCurrentIndex(0)
    setIsNewMode(true)
    setDialogOpen(true)
  }

  // سند مُرحَّل (status=2): لا يُحذف فعلياً، بل يُلغى منطقياً (status=3) فيبقى في voucher_header_tbl
  // كأثر تاريخي — هذا هو السلوك القديم لزر الحذف (الذي كان يُطبَّق على كل السندات سابقاً). يبقى
  // معروضاً في نفس النافذة بعد الإلغاء (وليس الانتقال لسند آخر) ليرى المستخدم حالته الجديدة فوراً.
  const logicalCancelVoucher = async () => {
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

  // سند بحالة فعال (status=1، لم يُرحَّل بعد): يُحذف فعلياً من voucher_header_tbl بعد أرشفته إلى
  // جداول log (انظر archiveAndDeleteVoucher في app/api/receipts/_lib.ts).
  const physicalDeleteVoucher = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch(`/api/receipts/${form.id}`, { method: "DELETE" })
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
        bankAccounts={bankAccounts}
        disallowManualChequeEntryInPayment={disallowManualChequeEntryInPayment}
        salesmen={salesmen}
        paymentClassifications={paymentClassifications}
        cardTypes={cardTypes}
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
        onJournalChange={(journal) => setForm((f) => ({ ...f, journal }))}
        onChequesChange={(cheques) => setForm((f) => ({ ...f, cheques }))}
        onCardsChange={(cards) => setForm((f) => ({ ...f, cards }))}
        onNotesChange={(notes) => setForm((f) => ({ ...f, notes }))}
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
