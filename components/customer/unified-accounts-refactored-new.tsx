"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Plus, AlertCircle } from "lucide-react"

interface AccountType {
  id: number
  name: string
}

interface AccountItem {
  id: number
  code: string
  name: string
  name_lang2?: string | null
  type?: number | null
  type_name?: string
  father_id?: number | null
  father_name?: string
  level_no: number
  finanical_list_id: number
  finanical_list_assests_id?: number | null
  finanical_list_liabilities_id?: number | null
  finanical_list_income_id?: number | null
  currency_id?: number | null
  currency_code?: string
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: number
  transaction_type_action: number
  max_transaction_amount: number
  max_transaction_amount_action: number
  max_balance_amount: number
  max_balance_action?: number | null
  budget_exceeding_perc?: number | null
  budget_exceeding_action?: number | null
  unified_report_account_no?: string | null
  unified_report_group_code?: string | null
  notes?: string | null
  show_notes_in_transactions_soa: boolean
  status: string
  created_at?: string
  updated_at?: string
}

interface FormState {
  code: string
  name: string
  name_lang2: string
  type: string
  father_id: string
  level_no: string
  finanical_list_id: string
  finanical_list_assests_id: string
  finanical_list_liabilities_id: string
  finanical_list_income_id: string
  currency_id: string
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: string
  transaction_type_action: string
  max_transaction_amount: string
  max_transaction_amount_action: string
  max_balance_amount: string
  max_balance_action: string
  budget_exceeding_perc: string
  budget_exceeding_action: string
  unified_report_account_no: string
  unified_report_group_code: string
  notes: string
  show_notes_in_transactions_soa: boolean
  status: string
}

interface UnifiedAccountsProps {
  action?: "new"
  onOpenChange?: (open: boolean) => void
  inWindowManager?: boolean
  closeWindow?: () => void
}

export default function UnifiedAccounts({ action, onOpenChange, inWindowManager, closeWindow }: UnifiedAccountsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("main")
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [costCenters, setCostCenters] = useState<any[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [financialListType, setFinancialListType] = useState("")
  const [balanceSheetAssets, setBalanceSheetAssets] = useState<any[]>([])
  const [balanceSheetLiabilities, setBalanceSheetLiabilities] = useState<any[]>([])
  const [incomeStatementAccounts, setIncomeStatementAccounts] = useState<any[]>([])
  const [merchandiseAccounts, setMerchandiseAccounts] = useState<any[]>([])

  const [formData, setFormData] = useState<FormState>({
    code: "",
    name: "",
    name_lang2: "",
    type: "",
    father_id: "",
    level_no: "1",
    finanical_list_id: "1",
    finanical_list_assests_id: "",
    finanical_list_liabilities_id: "",
    finanical_list_income_id: "",
    currency_id: "",
    allow_trans_with_diff_curr: false,
    iscalc_curr_diff_rates: false,
    transaction_type: "0",
    transaction_type_action: "0",
    max_transaction_amount: "0",
    max_transaction_amount_action: "0",
    max_balance_amount: "0",
    max_balance_action: "",
    budget_exceeding_perc: "",
    budget_exceeding_action: "",
    unified_report_account_no: "",
    unified_report_group_code: "",
    notes: "",
    show_notes_in_transactions_soa: false,
    status: "نشط",
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [typesRes, accountsRes] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        setError("Failed to load data")
        return
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      let currenciesData: any[] = []
      let companiesData: any[] = []
      let costCentersData: any[] = []
      let balanceSheetAssetsData: any[] = []
      let balanceSheetLiabilitiesData: any[] = []
      let incomeStatementData: any[] = []

      try {
        const curRes = await fetch("/api/currencies")
        if (curRes.ok) currenciesData = await curRes.json()
      } catch (_) {}
      try {
        const compRes = await fetch("/api/companies")
        if (compRes.ok) companiesData = await compRes.json()
      } catch (_) {}
      try {
        const ccRes = await fetch("/api/cost-centers")
        if (ccRes.ok) costCentersData = await ccRes.json()
      } catch (_) {}
      try {
        const assetsRes = await fetch("/api/balance-sheet-assets-items")
        if (assetsRes.ok) {
          const json = await assetsRes.json()
          balanceSheetAssetsData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        }
      } catch (_) {}
      try {
        const liabilitiesRes = await fetch("/api/balance-sheet-liabilities-items")
        if (liabilitiesRes.ok) {
          const json = await liabilitiesRes.json()
          balanceSheetLiabilitiesData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        }
      } catch (_) {}
      try {
        const incomeRes = await fetch("/api/income-statement-items")
        if (incomeRes.ok) {
          const json = await incomeRes.json()
          incomeStatementData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        }
      } catch (_) {}

      setTypes(Array.isArray(typesData) ? typesData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : []).map((item: any) => ({
          ...item,
          code: item.code || item.account_code || "",
          name: item.name || item.account_name || "",
          type: Number(item.type || item.classification_type_id || 0),
          level_no: Number(item.level_no || 1),
          finanical_list_id: Number(item.finanical_list_id || 1),
        })),
      )
      setCurrencies(Array.isArray(currenciesData) ? currenciesData : [])
      setCompanies(Array.isArray(companiesData) ? companiesData : [])
      setCostCenters(Array.isArray(costCentersData) ? costCentersData : [])
      setBalanceSheetAssets(Array.isArray(balanceSheetAssetsData) ? balanceSheetAssetsData : [])
      setBalanceSheetLiabilities(Array.isArray(balanceSheetLiabilitiesData) ? balanceSheetLiabilitiesData : [])
      setIncomeStatementAccounts(Array.isArray(incomeStatementData) ? incomeStatementData : [])
      setCurrentIndex(0)
    } catch (err) {
      console.error(err)
      setError("Error loading data")
    } finally {
      setLoading(false)
    }
  }

  const currentAccount = useMemo(() => accounts[currentIndex] || null, [accounts, currentIndex])

  const loadAccountToForm = useCallback((account: AccountItem) => {
    setFormData({
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(account.finanical_list_id || 1),
      finanical_list_assests_id: account.finanical_list_assests_id ? String(account.finanical_list_assests_id) : "",
      finanical_list_liabilities_id: account.finanical_list_liabilities_id ? String(account.finanical_list_liabilities_id) : "",
      finanical_list_income_id: account.finanical_list_income_id ? String(account.finanical_list_income_id) : "",
      currency_id: account.currency_id ? String(account.currency_id) : "",
      allow_trans_with_diff_curr: Boolean(account.allow_trans_with_diff_curr),
      iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
      transaction_type: String(account.transaction_type || 0),
      transaction_type_action: String(account.transaction_type_action || 0),
      max_transaction_amount: String(account.max_transaction_amount || 0),
      max_transaction_amount_action: String(account.max_transaction_amount_action || 0),
      max_balance_amount: String(account.max_balance_amount || 0),
      max_balance_action: account.max_balance_action ? String(account.max_balance_action) : "",
      budget_exceeding_perc: account.budget_exceeding_perc ? String(account.budget_exceeding_perc) : "",
      budget_exceeding_action: account.budget_exceeding_action ? String(account.budget_exceeding_action) : "",
      unified_report_account_no: account.unified_report_account_no || "",
      unified_report_group_code: account.unified_report_group_code || "",
      notes: account.notes || "",
      show_notes_in_transactions_soa: Boolean(account.show_notes_in_transactions_soa),
      status: account.status || "نشط",
    })
    if ((account as any).image_url) {
      setImagePreview((account as any).image_url)
    } else {
      setImagePreview(null)
    }
  }, [])

  const handleNew = () => {
    setFormData({
      code: "",
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      finanical_list_assests_id: "",
      finanical_list_liabilities_id: "",
      finanical_list_income_id: "",
      currency_id: "",
      allow_trans_with_diff_curr: false,
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      transaction_type_action: "0",
      max_transaction_amount: "0",
      max_transaction_amount_action: "0",
      max_balance_amount: "0",
      max_balance_action: "",
      budget_exceeding_perc: "",
      budget_exceeding_action: "",
      unified_report_account_no: "",
      unified_report_group_code: "",
      notes: "",
      show_notes_in_transactions_soa: false,
      status: "نشط",
    })
    setDialogOpen(true)
    setActiveTab("main")
  }

  useEffect(() => {
    console.log("[unified-refactored] mount/effect action:", action)
    if (action === "new") {
      setActiveTab("main")
      setDialogOpen(true)
      console.log("[unified-refactored] set dialogOpen true due to action=new")
    }
  }, [action])

  useEffect(() => {
    console.log("[unified-refactored] dialogOpen changed:", dialogOpen)
    if (onOpenChange) onOpenChange(dialogOpen)
  }, [dialogOpen, onOpenChange])

  useEffect(() => {
    if (dialogOpen) {
      loadData()
    }
  }, [dialogOpen])

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("Code and Name are required")
      return
    }

    try {
      setSaving(true)
      const isEdit = currentAccount?.id != null
      const url = isEdit ? `/api/accounts/${currentAccount.id}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"
      const imageBase64 = imagePreview && imagePreview.startsWith("data:") ? imagePreview.split(",")[1] : null

      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        name_lang2: formData.name_lang2.trim() || null,
        type: formData.type ? Number(formData.type) : null,
        father_id: formData.father_id ? Number(formData.father_id) : null,
        level_no: Number(formData.level_no || 1),
        finanical_list_id: Number(formData.finanical_list_id || 1),
        finanical_list_assests_id: formData.finanical_list_assests_id ? Number(formData.finanical_list_assests_id) : null,
        finanical_list_liabilities_id: formData.finanical_list_liabilities_id ? Number(formData.finanical_list_liabilities_id) : null,
        finanical_list_income_id: formData.finanical_list_income_id ? Number(formData.finanical_list_income_id) : null,
        currency_id: formData.currency_id ? Number(formData.currency_id) : null,
        allow_trans_with_diff_curr: formData.allow_trans_with_diff_curr,
        iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
        transaction_type: Number(formData.transaction_type || 0),
        transaction_type_action: Number(formData.transaction_type_action || 0),
        max_transaction_amount: Number(formData.max_transaction_amount || 0),
        max_transaction_amount_action: Number(formData.max_transaction_amount_action || 0),
        max_balance_amount: Number(formData.max_balance_amount || 0),
        max_balance_action: formData.max_balance_action ? Number(formData.max_balance_action) : null,
        budget_exceeding_perc: formData.budget_exceeding_perc ? Number(formData.budget_exceeding_perc) : null,
        budget_exceeding_action: formData.budget_exceeding_action ? Number(formData.budget_exceeding_action) : null,
        unified_report_account_no: formData.unified_report_account_no.trim() || null,
        unified_report_group_code: formData.unified_report_group_code.trim() || null,
        notes: formData.notes.trim() || null,
        show_notes_in_transactions_soa: formData.show_notes_in_transactions_soa,
        status: formData.status,
        image_base64: imageBase64,
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

      setMessage(isEdit ? "Account updated successfully" : "Account created successfully")
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("Error saving account")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!currentAccount) return
    if (!window.confirm("Are you sure?")) return

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("Failed to delete account")
        return
      }
      setMessage("Account deleted successfully")
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("Error deleting account")
    }
  }

  const handleFirst = () => {
    if (accounts.length) {
      setCurrentIndex(0)
      loadAccountToForm(accounts[0])
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      setCurrentIndex(newIndex)
      loadAccountToForm(accounts[newIndex])
    }
  }

  const handleNext = () => {
    if (currentIndex < accounts.length - 1) {
      const newIndex = currentIndex + 1
      setCurrentIndex(newIndex)
      loadAccountToForm(accounts[newIndex])
    }
  }

  const handleLast = () => {
    if (accounts.length) {
      const lastIndex = accounts.length - 1
      setCurrentIndex(lastIndex)
      loadAccountToForm(accounts[lastIndex])
    }
  }

  const handleOpenDialog = () => {
    if (currentAccount) {
      loadAccountToForm(currentAccount)
    }
    setDialogOpen(true)
    setActiveTab("main")
  }

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>
  }

  if (inWindowManager) {
    return (
      <div className="w-full h-full p-0 gap-0 flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-4">
          <h2 className="text-xl font-semibold">{currentAccount?.id ? `Edit Account: ${currentAccount.code}` : "New Account"}</h2>
          <Button variant="ghost" onClick={() => closeWindow && closeWindow()}>
            ✕
          </Button>
        </div>

        <div className="border-b bg-white/95 px-4 py-2">
          <UniversalToolbar
            currentRecord={accounts.length > 0 ? currentIndex + 1 : 0}
            totalRecords={accounts.length}
            onNew={handleNew}
            onSave={() => void handleSave()}
            onDelete={handleDelete}
            onFirst={handleFirst}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLast={handleLast}
            canDelete={currentAccount?.id != null}
            isSaving={saving}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{message}</AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="h-auto w-full justify-end overflow-x-auto rounded-md bg-gradient-to-l from-blue-50 to-slate-100 p-1 flex-row-reverse">
              <TabsTrigger value="main" className="data-[state=active]:bg-white">البيانات الأساسية</TabsTrigger>
              <TabsTrigger value="additional-data" className="data-[state=active]:bg-white">محددات الحساب</TabsTrigger>
              <TabsTrigger value="stop-transactions" className="data-[state=active]:bg-white">إيقاف الحركات</TabsTrigger>
              <TabsTrigger value="constraints" className="data-[state=active]:bg-white">الحدود المالية</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-6">
              <div className="space-y-4 border-b pb-6">
                <h4 className="font-semibold text-base">المعلومات الأساسية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">رقم الحساب *</Label>
                    <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="رقم الحساب" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">اسم الحساب (AR) *</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="اسم الحساب" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">اسم الحساب (EN)</Label>
                    <Input value={formData.name_lang2} onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })} placeholder="Account name in English" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">نوع الحساب</Label>
                    <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">الحساب الرئيسي (أب)</Label>
                    <Select
                      value={formData.father_id || "__no_parent__"}
                      onValueChange={(val) => setFormData({ ...formData, father_id: val === "__no_parent__" ? "" : val })}
                    >
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="بدون" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__no_parent__">بدون</SelectItem>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            {acc.code} - {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">المستوى</Label>
                    <Input type="number" value={formData.level_no} onChange={(e) => setFormData({ ...formData, level_no: e.target.value })} placeholder="1" className="text-right" />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-b pb-6">
                <h4 className="font-semibold text-base">الإعدادات المالية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">العملة</Label>
                    <Select value={formData.currency_id || "__no_currency__"} onValueChange={(val) => setFormData({ ...formData, currency_id: val === "__no_currency__" ? "" : val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر العملة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__no_currency__">بدون</SelectItem>
                        {currencies.map((c) => (
                          <SelectItem key={c.id || c.currency_id} value={String(c.id ?? c.currency_id)}>
                            {c.name || c.currency_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">القائمة المالية *</Label>
                    <Select value={financialListType} onValueChange={(val) => {
                      setFinancialListType(val)
                      setFormData({ ...formData, finanical_list_id: val })
                    }}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر القائمة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">الميزانية العمومية</SelectItem>
                        <SelectItem value="2">قائمة الدخل</SelectItem>
                        <SelectItem value="3">تقييم بضاعة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {financialListType === "1" && (
                    <>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">اصول الميزانية</Label>
                        <Select value={formData.finanical_list_assests_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_assests_id: val === "__no_selection__" ? "" : val })}>
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="اختر الأصول" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no_selection__">بدون</SelectItem>
                            {balanceSheetAssets.map((asset) => (
                              <SelectItem key={asset.id} value={String(asset.id)}>
                                {asset.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">خصموم الميزانية</Label>
                        <Select value={formData.finanical_list_liabilities_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_liabilities_id: val === "__no_selection__" ? "" : val })}>
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="اختر الخصوم" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no_selection__">بدون</SelectItem>
                            {balanceSheetLiabilities.map((liability) => (
                              <SelectItem key={liability.id} value={String(liability.id)}>
                                {liability.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {financialListType === "2" && (
                    <div>
                      <Label className="mb-2 block text-sm font-medium">قائمة الدخل</Label>
                      <Select value={formData.finanical_list_income_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_income_id: val === "__no_selection__" ? "" : val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر من قائمة الدخل" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_selection__">بدون</SelectItem>
                          {incomeStatementAccounts.map((income) => (
                            <SelectItem key={income.id} value={String(income.id)}>
                              {income.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {financialListType === "3" && (
                    <div className="md:col-span-2">
                      <Label className="mb-2 block text-sm font-medium">تقييم البضاعة</Label>
                      <Select value={formData.finanical_list_assests_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_assests_id: val === "__no_selection__" ? "" : val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر طريقة التقييم" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_selection__">بدون</SelectItem>
                          {merchandiseAccounts.map((merc) => (
                            <SelectItem key={merc.id} value={String(merc.id)}>
                              {merc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="mb-2 block text-sm font-medium">السماح بعمل حركة بغير عملته</Label>
                    <Select value={String(formData.allow_trans_with_diff_curr || 0)} onValueChange={(val) => setFormData({ ...formData, allow_trans_with_diff_curr: val === "1" })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر الخيار" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">مسموح بدون تسية</SelectItem>
                        <SelectItem value="1">مسموح مع تسية</SelectItem>
                        <SelectItem value="2">غير مسموح</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-medium">حساب الربح والخسارة من فروق العملات</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Checkbox 
                        checked={formData.iscalc_curr_diff_rates} 
                        onCheckedChange={(checked) => setFormData({ ...formData, iscalc_curr_diff_rates: checked as boolean })}
                      />
                      <span className="text-sm">نعم</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-base">بيانات إضافية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">الشركة</Label>
                    <Select value={(formData as any).company_id || "__no_company__"} onValueChange={(val) => setFormData({ ...formData, ...( { company_id: val === "__no_company__" ? "" : val } as any) })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر الشركة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__no_company__">بدون</SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name || c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">مركز الكلفة الافتراضي</Label>
                    <Select value={(formData as any).cost_center_id || "__no_cost_center__"} onValueChange={(val) => setFormData({ ...formData, ...( { cost_center_id: val === "__no_cost_center__" ? "" : val } as any) })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر مركز الكلفة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__no_cost_center__">بدون</SelectItem>
                        {costCenters.map((cc) => (
                          <SelectItem key={cc.id} value={String(cc.id)}>
                            {cc.name || cc.center_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">رقم الحساب في التقرير الموحد</Label>
                    <Input value={formData.unified_report_account_no} onChange={(e) => setFormData({ ...formData, unified_report_account_no: e.target.value })} placeholder="رقم الحساب" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">صورة الحساب (اختياري)</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files && e.target.files[0]
                          if (f) {
                            setImageFile(f)
                            const reader = new FileReader()
                            reader.onload = () => setImagePreview(String(reader.result))
                            reader.readAsDataURL(f)
                          }
                        }}
                        className="text-sm"
                      />
                      {imagePreview && (
                        <img src={imagePreview} alt="preview" className="h-12 w-12 object-cover rounded border" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="additional-data" className="space-y-4">
              <div className="space-y-4">
                <h4 className="font-semibold text-base">محددات الحساب الإضافية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">نوع الحركة</Label>
                    <Select value={formData.transaction_type} onValueChange={(val) => setFormData({ ...formData, transaction_type: val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">عام</SelectItem>
                        <SelectItem value="1">دائن</SelectItem>
                        <SelectItem value="2">مدين</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">الحد الأقصى للحركة</Label>
                    <Input type="number" value={formData.max_transaction_amount} onChange={(e) => setFormData({ ...formData, max_transaction_amount: e.target.value })} placeholder="0" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">الحد الأقصى للرصيد</Label>
                    <Input type="number" value={formData.max_balance_amount} onChange={(e) => setFormData({ ...formData, max_balance_amount: e.target.value })} placeholder="0" className="text-right" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">نسبة تجاوز الميزانية (%)</Label>
                    <Input type="number" value={formData.budget_exceeding_perc} onChange={(e) => setFormData({ ...formData, budget_exceeding_perc: e.target.value })} placeholder="0" className="text-right" />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">ملاحظات</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="أدخل الملاحظات هنا" className="text-right" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={formData.show_notes_in_transactions_soa} 
                    onCheckedChange={(checked) => setFormData({ ...formData, show_notes_in_transactions_soa: checked as boolean })}
                  />
                  <Label className="text-sm">عرض الملاحظات في كشف الحساب</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stop-transactions" className="space-y-4">
              <div className="space-y-4">
                <h4 className="font-semibold text-base">إيقاف الحركات على الحساب</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50">
                    <Checkbox 
                      id="stop_credit"
                      checked={formData.transaction_type_action === "1"}
                      onCheckedChange={(checked) => setFormData({ ...formData, transaction_type_action: checked ? "1" : "0" })}
                    />
                    <Label htmlFor="stop_credit" className="cursor-pointer">إيقاف الحركات الدائنة</Label>
                  </div>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50">
                    <Checkbox 
                      id="stop_debit"
                      checked={formData.transaction_type_action === "2"}
                      onCheckedChange={(checked) => setFormData({ ...formData, transaction_type_action: checked ? "2" : "0" })}
                    />
                    <Label htmlFor="stop_debit" className="cursor-pointer">إيقاف الحركات المدينة</Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="constraints" className="space-y-4">
              <div className="space-y-4">
                <h4 className="font-semibold text-base">الحدود المالية والإجراءات</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للحركة</Label>
                    <Select value={formData.max_transaction_amount_action || "0"} onValueChange={(val) => setFormData({ ...formData, max_transaction_amount_action: val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر الإجراء" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">تحذير</SelectItem>
                        <SelectItem value="1">منع</SelectItem>
                        <SelectItem value="2">السماح</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للرصيد</Label>
                    <Select value={formData.max_balance_action || "0"} onValueChange={(val) => setFormData({ ...formData, max_balance_action: val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر الإجراء" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">تحذير</SelectItem>
                        <SelectItem value="1">منع</SelectItem>
                        <SelectItem value="2">السماح</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الميزانية</Label>
                    <Select value={formData.budget_exceeding_action || "0"} onValueChange={(val) => setFormData({ ...formData, budget_exceeding_action: val })}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="اختر الإجراء" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">تحذير</SelectItem>
                        <SelectItem value="1">منع</SelectItem>
                        <SelectItem value="2">السماح</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 border-t bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={() => closeWindow && closeWindow()}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!currentAccount?.id}>
            حذف
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 lg:p-6" dir="rtl">
      <div className="sticky top-2 z-20 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur">
        <UniversalToolbar
          currentRecord={accounts.length > 0 ? currentIndex + 1 : 0}
          totalRecords={accounts.length}
          onNew={handleNew}
          onSave={() => {
            if (!dialogOpen) handleOpenDialog()
            else void handleSave()
          }}
          onDelete={handleDelete}
          onFirst={handleFirst}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onLast={handleLast}
          canDelete={currentAccount?.id != null}
        />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Accounts List</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account, idx) => (
                <Button
                  key={account.id}
                  variant={currentIndex === idx ? "default" : "outline"}
                  className="text-left h-auto p-3"
                  onClick={() => {
                    setCurrentIndex(idx)
                    loadAccountToForm(account)
                  }}
                >
                  <div>
                    <div className="font-semibold">{account.code}</div>
                    <div className="text-sm opacity-75">{account.name}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (onOpenChange) onOpenChange(open)
      }}>
        <DialogContent
          className="w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[100vh] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden"
          dir="rtl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-4">
            <h2 className="text-xl font-semibold">{currentAccount?.id ? `Edit Account: ${currentAccount.code}` : "New Account"}</h2>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              ✕
            </Button>
          </div>

          <div className="border-b bg-white/95 px-4 py-2">
            <UniversalToolbar
              currentRecord={accounts.length > 0 ? currentIndex + 1 : 0}
              totalRecords={accounts.length}
              onNew={handleNew}
              onSave={() => void handleSave()}
              onDelete={handleDelete}
              onFirst={handleFirst}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onLast={handleLast}
              canDelete={currentAccount?.id != null}
              isSaving={saving}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription className="text-green-800">{message}</AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="h-auto w-full justify-end overflow-x-auto rounded-md bg-gradient-to-l from-blue-50 to-slate-100 p-1 flex-row-reverse">
                <TabsTrigger value="main" className="data-[state=active]:bg-white">البيانات الأساسية</TabsTrigger>
                <TabsTrigger value="additional-data" className="data-[state=active]:bg-white">محددات الحساب</TabsTrigger>
                <TabsTrigger value="stop-transactions" className="data-[state=active]:bg-white">إيقاف الحركات</TabsTrigger>
                <TabsTrigger value="constraints" className="data-[state=active]:bg-white">الحدود المالية</TabsTrigger>
              </TabsList>

              <TabsContent value="main" className="space-y-6">
                <div className="space-y-4 border-b pb-6">
                  <h4 className="font-semibold text-base">المعلومات الأساسية</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">رقم الحساب *</Label>
                      <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="رقم الحساب" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">اسم الحساب (AR) *</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="اسم الحساب" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">اسم الحساب (EN)</Label>
                      <Input value={formData.name_lang2} onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })} placeholder="Account name in English" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">نوع الحساب</Label>
                      <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                        <SelectContent>
                          {types.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الحساب الرئيسي (أب)</Label>
                      <Select
                        value={formData.father_id || "__no_parent__"}
                        onValueChange={(val) => setFormData({ ...formData, father_id: val === "__no_parent__" ? "" : val })}
                      >
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="بدون" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_parent__">بدون</SelectItem>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={String(acc.id)}>
                              {acc.code} - {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">المستوى</Label>
                      <Input type="number" value={formData.level_no} onChange={(e) => setFormData({ ...formData, level_no: e.target.value })} placeholder="1" className="text-right" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-b pb-6">
                  <h4 className="font-semibold text-base">الإعدادات المالية</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">العملة</Label>
                      <Select value={formData.currency_id || "__no_currency__"} onValueChange={(val) => setFormData({ ...formData, currency_id: val === "__no_currency__" ? "" : val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر العملة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_currency__">بدون</SelectItem>
                          {currencies.map((c) => (
                            <SelectItem key={c.id || c.currency_id} value={String(c.id ?? c.currency_id)}>
                              {c.name || c.currency_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">القائمة المالية *</Label>
                      <Select value={financialListType} onValueChange={(val) => {
                        setFinancialListType(val)
                        setFormData({ ...formData, finanical_list_id: val })
                      }}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر القائمة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">الميزانية العمومية</SelectItem>
                          <SelectItem value="2">قائمة الدخل</SelectItem>
                          <SelectItem value="3">تقييم بضاعة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {financialListType === "1" && (
                      <>
                        <div>
                          <Label className="mb-2 block text-sm font-medium">اصول الميزانية</Label>
                          <Select value={formData.finanical_list_assests_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_assests_id: val === "__no_selection__" ? "" : val })}>
                            <SelectTrigger className="text-right">
                              <SelectValue placeholder="اختر الأصول" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__no_selection__">بدون</SelectItem>
                              {balanceSheetAssets.map((asset) => (
                                <SelectItem key={asset.id} value={String(asset.id)}>
                                  {asset.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="mb-2 block text-sm font-medium">خصموم الميزانية</Label>
                          <Select value={formData.finanical_list_liabilities_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_liabilities_id: val === "__no_selection__" ? "" : val })}>
                            <SelectTrigger className="text-right">
                              <SelectValue placeholder="اختر الخصوم" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__no_selection__">بدون</SelectItem>
                              {balanceSheetLiabilities.map((liability) => (
                                <SelectItem key={liability.id} value={String(liability.id)}>
                                  {liability.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {financialListType === "2" && (
                      <div>
                        <Label className="mb-2 block text-sm font-medium">قائمة الدخل</Label>
                        <Select value={formData.finanical_list_income_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_income_id: val === "__no_selection__" ? "" : val })}>
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="اختر من قائمة الدخل" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no_selection__">بدون</SelectItem>
                            {incomeStatementAccounts.map((income) => (
                              <SelectItem key={income.id} value={String(income.id)}>
                                {income.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {financialListType === "3" && (
                      <div className="md:col-span-2">
                        <Label className="mb-2 block text-sm font-medium">تقييم البضاعة</Label>
                        <Select value={formData.finanical_list_assests_id || "__no_selection__"} onValueChange={(val) => setFormData({ ...formData, finanical_list_assests_id: val === "__no_selection__" ? "" : val })}>
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="اختر طريقة التقييم" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no_selection__">بدون</SelectItem>
                            {merchandiseAccounts.map((merc) => (
                              <SelectItem key={merc.id} value={String(merc.id)}>
                                {merc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block text-sm font-medium">السماح بعمل حركة بغير عملته</Label>
                      <Select value={String(formData.allow_trans_with_diff_curr || 0)} onValueChange={(val) => setFormData({ ...formData, allow_trans_with_diff_curr: val === "1" })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر الخيار" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">مسموح بدون تسية</SelectItem>
                          <SelectItem value="1">مسموح مع تسية</SelectItem>
                          <SelectItem value="2">غير مسموح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block text-sm font-medium">حساب الربح والخسارة من فروق العملات</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Checkbox 
                          checked={formData.iscalc_curr_diff_rates} 
                          onCheckedChange={(checked) => setFormData({ ...formData, iscalc_curr_diff_rates: checked as boolean })}
                        />
                        <span className="text-sm">نعم</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-base">بيانات إضافية</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الشركة</Label>
                      <Select value={(formData as any).company_id || "__no_company__"} onValueChange={(val) => setFormData({ ...formData, ...( { company_id: val === "__no_company__" ? "" : val } as any) })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر الشركة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_company__">بدون</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name || c.company_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">مركز الكلفة الافتراضي</Label>
                      <Select value={(formData as any).cost_center_id || "__no_cost_center__"} onValueChange={(val) => setFormData({ ...formData, ...( { cost_center_id: val === "__no_cost_center__" ? "" : val } as any) })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر مركز الكلفة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_cost_center__">بدون</SelectItem>
                          {costCenters.map((cc) => (
                            <SelectItem key={cc.id} value={String(cc.id)}>
                              {cc.name || cc.center_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">رقم الحساب في التقرير الموحد</Label>
                      <Input value={formData.unified_report_account_no} onChange={(e) => setFormData({ ...formData, unified_report_account_no: e.target.value })} placeholder="رقم الحساب" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">صورة الحساب (اختياري)</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files && e.target.files[0]
                            if (f) {
                              setImageFile(f)
                              const reader = new FileReader()
                              reader.onload = () => setImagePreview(String(reader.result))
                              reader.readAsDataURL(f)
                            }
                          }}
                          className="text-sm"
                        />
                        {imagePreview && (
                          <img src={imagePreview} alt="preview" className="h-12 w-12 object-cover rounded border" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="additional-data" className="space-y-4">
                <div className="space-y-4">
                  <h4 className="font-semibold text-base">محددات الحساب الإضافية</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">نوع الحركة</Label>
                      <Select value={formData.transaction_type} onValueChange={(val) => setFormData({ ...formData, transaction_type: val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">عام</SelectItem>
                          <SelectItem value="1">دائن</SelectItem>
                          <SelectItem value="2">مدين</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الحد الأقصى للحركة</Label>
                      <Input type="number" value={formData.max_transaction_amount} onChange={(e) => setFormData({ ...formData, max_transaction_amount: e.target.value })} placeholder="0" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الحد الأقصى للرصيد</Label>
                      <Input type="number" value={formData.max_balance_amount} onChange={(e) => setFormData({ ...formData, max_balance_amount: e.target.value })} placeholder="0" className="text-right" />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">نسبة تجاوز الميزانية (%)</Label>
                      <Input type="number" value={formData.budget_exceeding_perc} onChange={(e) => setFormData({ ...formData, budget_exceeding_perc: e.target.value })} placeholder="0" className="text-right" />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">ملاحظات</Label>
                    <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="أدخل الملاحظات هنا" className="text-right" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={formData.show_notes_in_transactions_soa} 
                      onCheckedChange={(checked) => setFormData({ ...formData, show_notes_in_transactions_soa: checked as boolean })}
                    />
                    <Label className="text-sm">عرض الملاحظات في كشف الحساب</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="stop-transactions" className="space-y-4">
                <div className="space-y-4">
                  <h4 className="font-semibold text-base">إيقاف الحركات على الحساب</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50">
                      <Checkbox 
                        id="stop_credit"
                        checked={formData.transaction_type_action === "1"}
                        onCheckedChange={(checked) => setFormData({ ...formData, transaction_type_action: checked ? "1" : "0" })}
                      />
                      <Label htmlFor="stop_credit" className="cursor-pointer">إيقاف الحركات الدائنة</Label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50">
                      <Checkbox 
                        id="stop_debit"
                        checked={formData.transaction_type_action === "2"}
                        onCheckedChange={(checked) => setFormData({ ...formData, transaction_type_action: checked ? "2" : "0" })}
                      />
                      <Label htmlFor="stop_debit" className="cursor-pointer">إيقاف الحركات المدينة</Label>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="constraints" className="space-y-4">
                <div className="space-y-4">
                  <h4 className="font-semibold text-base">الحدود المالية والإجراءات</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للحركة</Label>
                      <Select value={formData.max_transaction_amount_action || "0"} onValueChange={(val) => setFormData({ ...formData, max_transaction_amount_action: val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر الإجراء" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">تحذير</SelectItem>
                          <SelectItem value="1">منع</SelectItem>
                          <SelectItem value="2">السماح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للرصيد</Label>
                      <Select value={formData.max_balance_action || "0"} onValueChange={(val) => setFormData({ ...formData, max_balance_action: val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر الإجراء" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">تحذير</SelectItem>
                          <SelectItem value="1">منع</SelectItem>
                          <SelectItem value="2">السماح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الميزانية</Label>
                      <Select value={formData.budget_exceeding_action || "0"} onValueChange={(val) => setFormData({ ...formData, budget_exceeding_action: val })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر الإجراء" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">تحذير</SelectItem>
                          <SelectItem value="1">منع</SelectItem>
                          <SelectItem value="2">السماح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-end gap-2 border-t bg-slate-50 px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!currentAccount?.id}>
              حذف
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
