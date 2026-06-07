"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { AlertCircle } from "lucide-react"

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
}

export default function UnifiedAccounts({ action, onOpenChange }: UnifiedAccountsProps) {
  const searchParams = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [autoOpenedFromQuery, setAutoOpenedFromQuery] = useState(false)
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingState, setLoadingState] = useState<string>("") // for tracking "unified-sale-order"
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

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
  }

  useEffect(() => {
    if (loading || autoOpenedFromQuery) return

    const queryAction = searchParams.get("action")
    if (action === "new" || queryAction === "new") {
      handleNew()
      setAutoOpenedFromQuery(true)
    }
  }, [loading, autoOpenedFromQuery, searchParams, action])

  useEffect(() => {
    if (onOpenChange) onOpenChange(dialogOpen)
  }, [dialogOpen, onOpenChange])

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("Code and Name are required")
      return
    }

    try {
      setSaving(true)
      setLoadingState("unified-sale-order")
      
      // Determine if this is an edit or add based on currentAccount.id > 0
      const isEdit = currentAccount?.id != null && currentAccount.id > 0
      const url = isEdit ? `/api/accounts/${currentAccount.id}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"

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
      
      // Reset fields after successful save
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
      
      setDialogOpen(false)
      await loadData()
      
      // Prepare for new entry (execute on new)
      handleNew()
    } catch (err) {
      console.error(err)
      setError("Error saving account")
    } finally {
      setSaving(false)
      setLoadingState("")
    }
  }

  const handleDelete = async () => {
    if (!currentAccount || currentAccount.id <= 0) return
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
  }

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[100vh] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden"
          dir="rtl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-4">
            <h2 className="text-xl font-semibold">
              {currentAccount?.id != null && currentAccount.id > 0 
                ? `تعديل الحساب: ${currentAccount.code}` 
                : "إضافة حساب جديد"}
            </h2>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              ✕
            </Button>
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block">Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Account code"
                />
              </div>
              <div>
                <Label className="mb-2 block">Name (AR) *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Account name"
                />
              </div>
              <div>
                <Label className="mb-2 block">Name (EN)</Label>
                <Input
                  value={formData.name_lang2}
                  onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })}
                  placeholder="English name"
                />
              </div>
              <div>
                <Label className="mb-2 block">Type</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
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
                <Label className="mb-2 block">Parent Account</Label>
                <Select
                  value={formData.father_id || "__no_parent__"}
                  onValueChange={(val) => setFormData({ ...formData, father_id: val === "__no_parent__" ? "" : val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__no_parent__">None</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Level</Label>
                <Input
                  type="number"
                  value={formData.level_no}
                  onChange={(e) => setFormData({ ...formData, level_no: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Financial List ID</Label>
                <Input
                  type="number"
                  value={formData.finanical_list_id}
                  onChange={(e) => setFormData({ ...formData, finanical_list_id: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Currency ID</Label>
                <Input
                  type="number"
                  value={formData.currency_id}
                  onChange={(e) => setFormData({ ...formData, currency_id: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Transaction Type</Label>
                <Input
                  type="number"
                  value={formData.transaction_type}
                  onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Max Transaction Amount</Label>
                <Input
                  type="number"
                  value={formData.max_transaction_amount}
                  onChange={(e) => setFormData({ ...formData, max_transaction_amount: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Max Balance Amount</Label>
                <Input
                  type="number"
                  value={formData.max_balance_amount}
                  onChange={(e) => setFormData({ ...formData, max_balance_amount: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Unified Report Account No</Label>
                <Input
                  value={formData.unified_report_account_no}
                  onChange={(e) => setFormData({ ...formData, unified_report_account_no: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Status</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نشط">نشط</SelectItem>
                    <SelectItem value="موقوف">موقوف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Flags</h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.allow_trans_with_diff_curr}
                    onCheckedChange={(checked) => setFormData({ ...formData, allow_trans_with_diff_curr: Boolean(checked) })}
                  />
                  <span className="text-sm">Allow Transactions with Different Currency</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.iscalc_curr_diff_rates}
                    onCheckedChange={(checked) => setFormData({ ...formData, iscalc_curr_diff_rates: Boolean(checked) })}
                  />
                  <span className="text-sm">Calculate Currency Difference Rates</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.show_notes_in_transactions_soa}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_notes_in_transactions_soa: Boolean(checked) })}
                  />
                  <span className="text-sm">Show Notes in Transactions</span>
                </label>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes"
                className="h-20"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t bg-slate-50 px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!currentAccount?.id || currentAccount.id <= 0}>
              Delete
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? `Saving... (${loadingState || "unified-sale-order"})` : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
