"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle, FileSpreadsheet, Plus, RefreshCw } from "lucide-react"
import UnifiedAccounts from "@/components/customer/unified-accounts-refactored"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useWorkspace } from "@/contexts/workspace-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import PrimeDropdown from "@/components/common/FocusDropdown"
import MultiSelect from "@/components/common/MultiSelect"
import { AccountsImportDialog } from "@/components/import/accounts-import"

interface AccountType {
  id: number
  name: string
}

interface Account {
  id: number
  code: string
  name: string
  name_lang2?: string | null
  type?: number | null
  type_name?: string
  father_id?: number | null
  level_no: number
  finanical_list_id: number
  finanical_list_name?: string
  currency_id?: number | null
  allow_trans_with_diff_curr: number
  iscalc_curr_diff_rates: boolean
  transaction_type: number
  max_transaction_amount: number
  max_balance_amount: number
  notes?: string | null
  status: string
}

interface FormState {
  code: string
  name: string
  name_lang2: string
  type: string
  father_id: string
  level_no: string
  finanical_list_id: string
  currency_id: string
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: string
  max_transaction_amount: string
  max_balance_amount: string
  notes: string
  status: string
}

export default function Accounts() {
  const { fullscreenEnabled } = useWorkspace()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showUnifiedPopup, setShowUnifiedPopup] = useState(false)
  const [showExcelImportDialog, setShowExcelImportDialog] = useState(false)
  const [selectedUnifiedAccountId, setSelectedUnifiedAccountId] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [currencies, setCurrencies] = useState<Array<{ id?: number; currency_id?: number; currency_name?: string; currency_code?: string; name?: string; code?: string }>>([])
  const [balanceSheetAssets, setBalanceSheetAssets] = useState<Array<{ id: number; name: string }>>([])
  const [balanceSheetLiabilities, setBalanceSheetLiabilities] = useState<Array<{ id: number; name: string }>>([])
  const [incomeStatementItems, setIncomeStatementItems] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [filterFinancialList, setFilterFinancialList] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState("")
  

  const [formData, setFormData] = useState<FormState>({
    code: "",
    name: "",
    name_lang2: "",
    type: "",
    father_id: "",
    level_no: "1",
    finanical_list_id: "1",
    currency_id: "",
    allow_trans_with_diff_curr: false,
    iscalc_curr_diff_rates: false,
    transaction_type: "0",
    max_transaction_amount: "0",
    max_balance_amount: "0",
    notes: "",
    status: "نشط",
  })

  useEffect(() => {
    loadData()
  }, [])

  const normalizeAccountRecord = (item: any): Account => {
    const finanicalListId = Number(item.finanical_list_id ?? item.financial_list_id ?? 1) || 1
    const statusValue = item.status ?? item.account_status ?? "نشط"
    const normalizedStatus = typeof statusValue === "number" ? String(statusValue) : String(statusValue || "نشط")

    return {
      ...item,
      code: item.code || item.account_code || "",
      name: item.name || item.account_name || "",
      type: Number(item.type || 0),
      level_no: Number(item.level_no || 1),
      finanical_list_id: finanicalListId,
      finanical_list_name:
        item.finanical_list_name ||
        item.financial_list_name ||
        (finanicalListId === 1
          ? "الميزانية العمومية"
          : finanicalListId === 2
            ? "قائمة الدخل"
            : finanicalListId === 3
              ? "تقييم بضاعة"
              : ""),
      status: normalizedStatus,
    }
  }

  const normalizeAccountCode = (value: string) => {
    const cleaned = String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()

    if (!cleaned) return ""

    if (cleaned.length >= 10) {
      return cleaned.slice(0, 10)
    }

    // إكمال الرقم إلى 10 خانات بإضافة أصفار في النهاية (لا البداية) — كود مثل "110000000" (9 خانات)
    // يجب أن يصبح "1100000000" لا "0110000000"، حتى لا يتغيّر الرقم الفعلي المقصود بإضافة صفر
    // بمقدمته (يُحوّله لحساب مختلف تماماً ضمن هيكل الحسابات).
    if (/^\d+$/.test(cleaned)) {
      return cleaned.padEnd(10, "0")
    }

    return cleaned.padEnd(10, "0").slice(0, 10)
  }

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [typesRes, accountsRes, assetsRes, liabilitiesRes, incomeRes, currenciesRes] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts?type=1"),
        fetch("/api/balance-sheet-assets-items"),
        fetch("/api/balance-sheet-liabilities-items"),
        fetch("/api/income-statement-items"),
        fetch("/api/exchange-rates"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        setError("Failed to load data")
        return
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      const assetsData = assetsRes.ok ? await assetsRes.json() : []
      const liabilitiesData = liabilitiesRes.ok ? await liabilitiesRes.json() : []
      const incomeData = incomeRes.ok ? await incomeRes.json() : []
      const currenciesData = currenciesRes.ok ? await currenciesRes.json() : { rates: [] }

      setTypes(Array.isArray(typesData) ? typesData : [])
      setCurrencies(Array.isArray(currenciesData?.rates) ? currenciesData.rates : [])
      setBalanceSheetAssets(Array.isArray(assetsData) ? assetsData : [])
      setBalanceSheetLiabilities(Array.isArray(liabilitiesData) ? liabilitiesData : [])
      setIncomeStatementItems(Array.isArray(incomeData) ? incomeData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : [])
          .map(normalizeAccountRecord)
          .filter((account) => Number(account.type ?? 0) === 1),
      )
    } catch (err) {
      console.error(err)
      setError("Error loading data")
    } finally {
      setLoading(false)
    }
  }

  const refreshAccounts = async () => {
    setError("")
    try {
      const response = await fetch("/api/accounts?type=1")
      if (!response.ok) {
        setError("Failed to load accounts")
        return
      }

      const accountsData = await response.json()
      setAccounts((Array.isArray(accountsData) ? accountsData : []).map(normalizeAccountRecord))
    } catch (err) {
      console.error(err)
      setError("Error loading accounts")
    }
  }

  const accountScheme = useMemo(
    () => ({
      name: "AccountsScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 180, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: "*", minWidth: 320, isReadOnly: true },
        { header: "القائمة المالية", name: "finanical_list_name", width: 240, isReadOnly: true },
        { header: "الحالة", name: "status", width: 160, isReadOnly: true },
      ],
    }),
    [],
  )

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchSearch =
        !search ||
        account.code.toLowerCase().includes(search.toLowerCase()) ||
        account.name.toLowerCase().includes(search.toLowerCase())
      const matchFinancialList = !filterFinancialList.length || filterFinancialList.includes(String(account.finanical_list_id))
      const matchStatus = !filterStatus || account.status === filterStatus
      return matchSearch && matchFinancialList && matchStatus
    })
  }, [accounts, search, filterFinancialList, filterStatus])

  const stats = useMemo(
    () => [
      { label: "إجمالي الحسابات", value: accounts.length, color: "bg-blue-50" },
      {
        label: "الميزانية العمومية",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 1).length,
        color: "bg-green-50",
      },
      {
        label: "قائمة الدخل",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 2).length,
        color: "bg-amber-50",
      },
      {
        label: "تقييم بضاعة",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 3).length,
        color: "bg-slate-50",
      },
    ],
    [accounts],
  )

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      currency_id: "",
      allow_trans_with_diff_curr: false,
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      max_transaction_amount: "0",
      max_balance_amount: "0",
      notes: "",
      status: "نشط",
    })
    setEditingId(null)
  }

  const handleNew = () => {
    // Open unified accounts as a local dialog (like فاتورة جديدة)
    setSelectedUnifiedAccountId(null)
    setShowUnifiedPopup(true)
  }

  const handleOpenUnifiedAccount = (account: Account) => {
    setSelectedUnifiedAccountId(account.id)
    setShowUnifiedPopup(true)
  }

  

  const handleEdit = (account: Account) => {
    setFormData({
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(account.finanical_list_id || 1),
      currency_id: account.currency_id ? String(account.currency_id) : "",
      allow_trans_with_diff_curr: Boolean(account.allow_trans_with_diff_curr),
      iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
      transaction_type: String(account.transaction_type || 0),
      max_transaction_amount: String(account.max_transaction_amount || 0),
      max_balance_amount: String(account.max_balance_amount || 0),
      notes: account.notes || "",
      status: account.status || "نشط",
    })
    setEditingId(account.id)
    setError("")
    setMessage("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("رقم الحساب واسم الحساب مطلوبان")
      return
    }
    if (!["1", "2", "3"].includes(formData.finanical_list_id)) {
      setError("يرجى اختيار القائمة المالية")
      return
    }

    try {
      setSaving(true)
      const isEdit = editingId != null
      const url = isEdit ? `/api/accounts/${editingId}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"

      const payload = {
        code: normalizeAccountCode(formData.code),
        name: formData.name.trim(),
        name_lang2: formData.name_lang2.trim() || null,
        type: formData.type ? Number(formData.type) : null,
        father_id: formData.father_id ? Number(formData.father_id) : null,
        level_no: Number(formData.level_no || 1),
        finanical_list_id: Number(formData.finanical_list_id || 1),
        currency_id: formData.currency_id ? Number(formData.currency_id) : null,
        allow_trans_with_diff_curr: formData.allow_trans_with_diff_curr,
        iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
        transaction_type: Number(formData.transaction_type || 0),
        max_transaction_amount: Number(formData.max_transaction_amount || 0),
        max_balance_amount: Number(formData.max_balance_amount || 0),
        notes: formData.notes.trim() || null,
        status: formData.status,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to save account")
        return
      }

      let savedAccount: any = {}
      try {
        savedAccount = await response.json()
      } catch {
        savedAccount = {}
      }

      const accountId = Number(savedAccount?.id ?? editingId ?? 0)
      const nextAccount: Account = {
        ...(editingId != null ? accounts.find((item) => Number(item.id) === Number(editingId)) : {}),
        ...savedAccount,
        id: accountId,
        code: savedAccount?.code || savedAccount?.account_code || formData.code.trim(),
        name: savedAccount?.name || savedAccount?.account_name || formData.name.trim(),
        name_lang2: savedAccount?.name_lang2 || formData.name_lang2.trim() || null,
        type: Number(savedAccount?.type ?? formData.type ?? 0),
        father_id: savedAccount?.father_id ?? (formData.father_id ? Number(formData.father_id) : null),
        level_no: Number(savedAccount?.level_no ?? formData.level_no ?? 1),
        finanical_list_id: Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1),
        finanical_list_name:
          savedAccount?.finanical_list_name ||
          (Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 1
            ? "الميزانية العمومية"
            : Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 2
              ? "قائمة الدخل"
              : Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 3
                ? "تقييم بضاعة"
                : ""),
        currency_id: savedAccount?.currency_id ?? (formData.currency_id ? Number(formData.currency_id) : null),
        allow_trans_with_diff_curr: Number(savedAccount?.allow_trans_with_diff_curr ?? (formData.allow_trans_with_diff_curr ? 1 : 0)),
        iscalc_curr_diff_rates: Boolean(savedAccount?.iscalc_curr_diff_rates ?? formData.iscalc_curr_diff_rates),
        transaction_type: Number(savedAccount?.transaction_type ?? formData.transaction_type ?? 0),
        max_transaction_amount: Number(savedAccount?.max_transaction_amount ?? formData.max_transaction_amount ?? 0),
        max_balance_amount: Number(savedAccount?.max_balance_amount ?? formData.max_balance_amount ?? 0),
        notes: savedAccount?.notes ?? (formData.notes.trim() || null),
        status: savedAccount?.status || formData.status,
      }

      setAccounts((prev) => {
        const next = [...prev]
        const index = next.findIndex((item) => Number(item.id) === accountId)
        if (index >= 0) {
          next[index] = nextAccount
        } else {
          next.unshift(nextAccount)
        }
        return next
      })

      resetForm()
      setDialogOpen(false)
      setMessage(isEdit ? "تم تعديل الحساب بنجاح" : "تم إنشاء الحساب بنجاح")
    } catch (err) {
      console.error(err)
      setError("Error saving account")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الحساب؟")) return

    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("Failed to delete account")
        return
      }
      setMessage("تم حذف الحساب بنجاح")
      setAccounts((prev) => prev.filter((item) => Number(item.id) !== Number(id)))
    } catch (err) {
      console.error(err)
      setError("Error deleting account")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الحسابات المحاسبية...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 lg:p-6" dir="rtl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">نظام الحسابات</p>
            <h2 className="text-2xl font-semibold">إدارة الحسابات</h2>
            <p className="text-sm text-muted-foreground">إدارة الحسابات المحاسبية وتصنيفاتها</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 gap-2" variant="outline" onClick={() => setShowExcelImportDialog(true)}>
              <FileSpreadsheet className="h-4 w-4" /> استيراد من اكسل
            </Button>
            <Button className="h-11 gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" /> حساب جديد
            </Button>
          </div>
        </div>

        {/* Stats Cards (now collapsible) */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="stats">
            <AccordionTrigger className="text-sm font-medium">الاحصائيات</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <Card key={stat.label} className={stat.color}>
                    <CardContent className="p-6 text-right">
                      <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                      <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>اضافة حساب او تعديل حساب</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {error && (
                <Alert className="border-red-200 bg-red-50 text-red-900">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {message && (
                <Alert className="border-green-200 bg-green-50 text-green-900">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">كود الحساب</Label>
                  <Input
                    value={formData.code}
                    maxLength={10}
                    dir="ltr"
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) })}
                    onBlur={() => setFormData((current) => ({ ...current, code: normalizeAccountCode(current.code) }))}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">اسم الحساب</Label>
                  <Input maxLength={100} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">الاسم بلغة أخرى</Label>
                  <Input value={formData.name_lang2} onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">نوع الحساب</Label>
                  <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نوع الحساب" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={String(type.id)}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">القائمة المالية</Label>
                  <PrimeDropdown
                    inputId="financial_list_id"
                    value={formData.finanical_list_id}
                    options={[
                      { label: "اختر", value: "" },
                      { label: "الميزانية العمومية", value: "1" },
                      { label: "قائمة الدخل", value: "2" },
                      { label: "تقييم بضاعة", value: "3" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر القائمة المالية"
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => setFormData({ ...formData, finanical_list_id: e.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">الحالة</Label>
                  <PrimeDropdown
                    inputId="status"
                    value={formData.status}
                    options={[
                      { label: "نشط", value: "نشط" },
                      { label: "موقوف", value: "موقوف" },
                      { label: "محذوف", value: "محذوف" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر الحالة"
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => setFormData({ ...formData, status: e.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">ملاحظات</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="h-24" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ الحساب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AccountsImportDialog open={showExcelImportDialog} onOpenChange={setShowExcelImportDialog} onImported={() => { void loadData() }} />

        {/* Search & Filters */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة الحسابات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="mb-2 block text-sm">اسم الحساب</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم أو اسم الحساب" className="h-10" />
              </div>
              <div>
                <MultiSelect
                  caption="القائمة المالية"
                  inputId="filterFinancialList"
                  value={filterFinancialList}
                  options={[
                    { label: "الميزانية العمومية", value: "1" },
                    { label: "قائمة الدخل", value: "2" },
                    { label: "تقييم بضاعة", value: "3" },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="كل القوائم المالية"
                  showFilter={true}
                  showCheck={true}
                  showMultiSelect={true}
                  onChange={(e: any) => setFilterFinancialList(Array.isArray(e.value) ? e.value.map(String) : [])}
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm">الحالة</Label>
                <PrimeDropdown
                  inputId="filterStatus"
                  value={filterStatus || ""}
                  options={[
                    { label: "كل الحالات", value: "" },
                    { label: "نشط", value: "نشط" },
                    { label: "موقوف", value: "موقوف" },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="كل الحالات"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setFilterStatus(String(e.value ?? ""))}
                />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" className="h-10 w-full" onClick={refreshAccounts}>
                  <RefreshCw className="mr-2 h-4 w-4" /> تحديث
                </Button>
              </div>
            </div>

            {error && (
              <Alert className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="mb-4 border-green-400 bg-green-50 text-green-700">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            {/* Table */}
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700 w-12">##</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 min-w-[120px]">رقم الحساب</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 min-w-[200px]">اسم الحساب</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 min-w-[150px]">القائمة المالية</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 min-w-[100px]">الحالة</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 w-20">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        لا توجد حسابات متطابقة
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((account, index) => (
                      <tr
                        key={account.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer border-slate-100"
                        onDoubleClick={() => handleOpenUnifiedAccount(account)}
                      >
                        <td className="px-4 py-3 text-slate-700 font-medium">{index + 1}</td>
                        <td className="px-4 py-3 text-slate-700">{account.code}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{account.name}</td>
                        <td className="px-4 py-3 text-slate-700">{account.finanical_list_name || "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                              account.status === "نشط"
                                ? "bg-emerald-100 text-emerald-700"
                                : account.status === "موقوف"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {account.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 flex gap-2 justify-end">
                          <button
                            onClick={() => handleOpenUnifiedAccount(account)}
                            className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition"
                            title="تفاصيل"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        {/* Unified accounts opened as local popup (like فاتورة جديدة) */}
        <Dialog open={showUnifiedPopup} onOpenChange={setShowUnifiedPopup}>
          <DialogContent inline={fullscreenEnabled && showUnifiedPopup} className="flex h-[min(90dvh,900px)] max-h-[calc(100dvh-1rem)] w-[95vw] max-w-[1200px] flex-col overflow-hidden p-0" dir="rtl"
                    onPointerDownOutside={(event) => event.preventDefault()}
                    onEscapeKeyDown={(event) => event.preventDefault()}
                  >
              
                <UnifiedAccounts
                  action={selectedUnifiedAccountId == null ? "new" : undefined}
                  accountId={selectedUnifiedAccountId}
                  inWindowManager
                  closeWindow={() => {
                    setShowUnifiedPopup(false)
                    setSelectedUnifiedAccountId(null)
                  }}
                />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
