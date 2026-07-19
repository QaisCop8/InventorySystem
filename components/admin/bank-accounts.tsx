"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UnifiedBankAccounts, { type BankAccountRecord } from "@/components/admin/unified-bank-accounts"
import { Edit } from "lucide-react"

interface BranchOption {
  id: number
  branch_code: string
  branch_name: string
  bank_id: number | null
}

interface BankOption {
  id: number
  bank_code?: string
  bank_name: string
}

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

const initialForm: BankAccountRecord = {
  id: 0,
  branch_id: null,
  code: "",
  actual_bank_code: "",
  currency_id: null,
  name: "",
  name_lang2: "",
  jary_account_id: null,
  tahsil_account_id: null,
  tahsil_commission_account_id: null,
  payed_checks_account_id: null,
  returned_checks_account_id: null,
  returned_checks_commission: null,
  add_returned_check_commision_on_customer: false,
  tahsil_checks_commission: null,
  returned_checks_commission_currency_id: null,
  tahsil_checks_commission_currency_id: null,
  check_value_period: null,
  checks_deposit_period: null,
  notes: "",
  status: 1,
}

export default function BankAccounts() {
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([])
  const [banks, setBanks] = useState<BankOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isNewMode, setIsNewMode] = useState(false)
  const [form, setForm] = useState<BankAccountRecord>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [errorMessages, setErrorMessages] = useState<string[]>([])

  const visibleBankAccounts = useMemo(() => bankAccounts.filter((b) => b.status !== 3), [bankAccounts])

  const totalAccounts = visibleBankAccounts.length
  const activeAccounts = visibleBankAccounts.filter((b) => b.status === 1).length
  const inactiveAccounts = totalAccounts - activeAccounts

  useEffect(() => {
    fetchBanks()
    fetchBranches()
    fetchCurrencies()
    fetchBankAccounts()
  }, [])

  const fetchBanks = async () => {
    try {
      const response = await fetch("/api/banks")
      const data = await response.json()
      setBanks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch banks", error)
      setBanks([])
    }
  }

  const fetchBranches = async () => {
    try {
      const response = await fetch("/api/branches")
      const data = await response.json()
      setBranches(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch branches", error)
      setBranches([])
    }
  }

  const fetchCurrencies = async () => {
    try {
      const response = await fetch("/api/exchange-rates")
      const data = await response.json()
      setCurrencies(Array.isArray(data?.rates) ? data.rates : [])
    } catch (error) {
      console.error("Failed to fetch currencies", error)
      setCurrencies([])
    }
  }

  const fetchBankAccounts = async () => {
    try {
      const response = await fetch("/api/bank-accounts")
      const data = await response.json()
      setBankAccounts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch bank accounts", error)
      setBankAccounts([])
    }
  }

  const openNewDialog = () => {
    setForm(initialForm)
    setIsNewMode(true)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const openEditDialog = (record: BankAccountRecord, index: number) => {
    setForm(record)
    setCurrentIndex(index)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  // Stops at the first failing rule so only one message is ever shown at a time.
  // Code uniqueness is intentionally NOT checked here (it would race with the
  // load-existing-record behavior in handleCodeBlur) — the API is the source of
  // truth for that and returns its own error at save time.
  const validateBankAccount = (data: BankAccountRecord): string | null => {
    const code = data.code.trim()
    if (!code) return "رقم الحساب مطلوب"
    if (!/^[A-Z0-9-]+$/.test(code)) return "رقم الحساب يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و - فقط"

    if (!data.currency_id || !currencies.some((c) => Number(c.currency_id ?? c.id) === data.currency_id)) {
      return "يجب اختيار العملة"
    }

    const actualCode = data.actual_bank_code.trim()
    if (actualCode && bankAccounts.some((b) => b.actual_bank_code.trim() === actualCode && b.id !== data.id)) {
      return "رقم الحساب الفعلي مستخدم مسبقاً"
    }

    const nameAr = data.name.trim().toLowerCase()
    const nameEn = data.name_lang2.trim().toLowerCase()
    if (!nameAr && !nameEn) {
      return "يجب إدخال اسم الحساب بالعربي أو الإنجليزي"
    }
    if (
      bankAccounts.some(
        (b) =>
          b.id !== data.id &&
          ((nameAr && b.name.trim().toLowerCase() === nameAr) ||
            (nameEn && b.name_lang2.trim().toLowerCase() === nameEn)),
      )
    ) {
      return "اسم الحساب مستخدم مسبقاً"
    }

    if (!data.branch_id) return "يجب اختيار البنك والفرع"

    if (
      !data.jary_account_id ||
      !data.tahsil_account_id ||
      !data.tahsil_commission_account_id ||
      !data.payed_checks_account_id ||
      !data.returned_checks_account_id
    ) {
      return "يجب تعبئة جميع الحسابات المحاسبية"
    }

    return null
  }

  const saveBankAccount = async () => {
    const error = validateBankAccount(form)
    if (error) {
      setErrorMessages([error])
      return
    }
    setErrorMessages([])

    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/bank-accounts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ حساب البنك"])
        return
      }
      await fetchBankAccounts()
      setForm(initialForm)
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ حساب البنك"])
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBankAccount = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/bank-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3 }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف حساب البنك")
      }
      await fetchBankAccounts()
      setShowDeleteConfirm(false)

      const nextList = visibleBankAccounts.filter((b) => b.id !== form.id)
      if (nextList.length > 0) {
        const targetIndex = Math.min(Math.max(0, currentIndex), nextList.length - 1)
        const next = nextList[targetIndex]
        if (next) {
          setForm(next)
          setCurrentIndex(targetIndex)
          setIsNewMode(false)
          setDialogOpen(true)
          return
        }
      }

      setForm(initialForm)
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

  const handleNavigateRecord = (record: BankAccountRecord) => {
    setForm(record)
    const targetIndex = visibleBankAccounts.findIndex((b) => b.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setShowDeleteConfirm(false)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const handleCodeBlur = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return

    const found = bankAccounts.find((b) => b.code === trimmed)
    if (found) {
      const foundIndex = visibleBankAccounts.findIndex((b) => b.id === found.id)
      setForm(found)
      setCurrentIndex(foundIndex >= 0 ? foundIndex : 0)
      setIsNewMode(false)
    } else if (form.id > 0) {
      // Was pointing at a previously loaded record — detach it so save creates a new
      // record instead of overwriting the old one with a code that doesn't exist yet.
      setForm({ ...initialForm, code: trimmed })
      setIsNewMode(true)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base">إجمالي حسابات البنوك</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalAccounts}</div>
            <div className="text-sm text-muted-foreground">عدد الحسابات المعروضة</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardHeader>
            <CardTitle className="text-base">الحسابات الفعالة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{activeAccounts}</div>
            <div className="text-sm text-muted-foreground">الحسابات ذات الحالة نشط</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-base">الحسابات المعطلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{inactiveAccounts}</div>
            <div className="text-sm text-muted-foreground">الحسابات غير النشطة</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الحسابات البنكية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-semibold">الحسابات البنكية</div>
                <p className="text-sm text-muted-foreground">إدارة حسابات الشركة لدى البنوك والفروع</p>
              </div>
              <Button onClick={openNewDialog} className="whitespace-nowrap">
                إضافة حساب بنك
              </Button>
            </div>

            <div className="overflow-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الحساب</TableHead>
                    <TableHead className="text-right">اسم الحساب</TableHead>
                    <TableHead className="text-right">الفرع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBankAccounts.map((account, index) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer"
                      onDoubleClick={() => openEditDialog(account, index)}
                    >
                      <TableCell className="text-right">{account.code}</TableCell>
                      <TableCell className="text-right">{account.name}</TableCell>
                      <TableCell className="text-right">
                        {branches.find((b) => b.id === account.branch_id)?.branch_name || "-"}
                      </TableCell>
                      <TableCell className="text-right">{account.status === 1 ? "نشط" : "متوقف"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditDialog(account, index)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <UnifiedBankAccounts
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={visibleBankAccounts.length}
        banks={banks}
        branches={branches}
        currencies={currencies}
        form={form}
        isSaving={isSaving}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleDialogOpenChange}
        onNew={openNewDialog}
        onSave={saveBankAccount}
        onDelete={() => form.id && setShowDeleteConfirm(true)}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        onConfirmDelete={deleteBankAccount}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        onCodeBlur={handleCodeBlur}
        canSave={
          !!form.code.trim() &&
          !!(form.name.trim() || form.name_lang2.trim()) &&
          !!form.currency_id &&
          currencies.some((c) => Number(c.currency_id ?? c.id) === form.currency_id)
        }
        isFirstRecord={currentIndex <= 0}
        isLastRecord={visibleBankAccounts.length === 0 ? true : currentIndex >= visibleBankAccounts.length - 1}
        isNewMode={isNewMode}
        errorMessages={errorMessages}
        allBankAccounts={bankAccounts}
      />
    </div>
  )
}
