"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { Building2 as Building2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UnifiedBranches from "@/components/admin/unified-branches"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Edit, MoreHorizontal } from "lucide-react"

interface Branch {
  id: number
  branch_code: string
  branch_name: string
  branch_symbol?: string
  bank_id: number | null
  bank_name?: string
  status: number
}

interface BranchForm {
  id: number
  branch_code: string
  branch_name: string
  branch_symbol: string
  bank_id: number | null
  status: number
}

const initialForm: BranchForm = {
  id: 0,
  branch_code: "",
  branch_name: "",
  branch_symbol: "",
  bank_id: null,
  status: 1,
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [banks, setBanks] = useState<{ id: number; bank_name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isNewMode, setIsNewMode] = useState(false)
  const [form, setForm] = useState<BranchForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBankValidationError, setShowBankValidationError] = useState(false)
  const [showBranchCodeValidationError, setShowBranchCodeValidationError] = useState(false)
  const [showSymbolValidationError, setShowSymbolValidationError] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [hasBankSelectionBeenTouched, setHasBankSelectionBeenTouched] = useState(false)
  const [selectedBankId, setSelectedBankId] = useState<number | "all">("all")

  const visibleBranches = useMemo(() => branches.filter((branch) => branch.status !== 3), [branches])

  const filteredBranches = useMemo(() => {
    const activeBranches = visibleBranches.filter((branch) => branch.status !== 3)
    if (selectedBankId === "all") return activeBranches
    return activeBranches.filter((branch) => branch.bank_id === selectedBankId)
  }, [visibleBranches, selectedBankId])

  const totalBranches = filteredBranches.length
  const activeBranches = filteredBranches.filter((branch) => branch.status === 1).length
  const inactiveBranches = totalBranches - activeBranches
  const currentBranch = useMemo(() => filteredBranches[currentIndex] || null, [filteredBranches, currentIndex])
  const branchCodeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchBanks()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (dialogOpen) {
      branchCodeRef.current?.focus()
    }
  }, [dialogOpen])

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
    setLoading(true)
    try {
      const response = await fetch("/api/branches")
      const data = await response.json()
      setBranches(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch branches", error)
      setBranches([])
    } finally {
      setLoading(false)
    }
  }

  const normalizeBankId = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return null
    const parsed = typeof value === "string" ? Number(value) : value
    if (Number.isNaN(parsed) || parsed <= 0) return null
    return parsed
  }

  const sanitizeNumericCode = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return ""
    return String(value).replace(/\D/g, "")
  }

  const openNewBranchDialog = () => {
    setForm(initialForm)
    setIsNewMode(true)
    setShowBankValidationError(false)
    setShowBranchCodeValidationError(false)
    setHasBankSelectionBeenTouched(false)
    setShowSymbolValidationError(false)
    setSaveError("")
    setDialogOpen(true)
  }

  const openEditBranchDialog = (branch: Branch, index: number) => {
    setForm({
      id: branch.id,
      branch_code: branch.branch_code,
      branch_name: branch.branch_name,
      branch_symbol: branch.branch_symbol || "",
      bank_id: normalizeBankId(branch.bank_id),
      status: branch.status,
    })
    setCurrentIndex(index)
    setIsNewMode(false)
    setShowBankValidationError(false)
    setShowBranchCodeValidationError(false)
    setHasBankSelectionBeenTouched(false)
    setDialogOpen(true)
  }

  const saveBranch = async () => {
    const branchCode = sanitizeNumericCode(form.branch_code)
    const normalizedForm = {
      ...form,
      branch_code: branchCode,
      bank_id: normalizeBankId(form.bank_id),
    }

    const hasValidBranchCode = /^\d{1,4}$/.test(branchCode)
    const symbol = String(form.branch_symbol || "").trim().toUpperCase()
    const symbolTaken = branches.some((b) => (b.branch_symbol || "").toUpperCase() === symbol && b.id !== form.id)
    const hasValidBank = normalizedForm.bank_id !== null

    if (!hasValidBranchCode) {
      setShowBranchCodeValidationError(true)
      return
    }

    if (!symbol || symbolTaken) {
      setShowSymbolValidationError(true)
      return
    }

    if (!normalizedForm.branch_name.trim() || !hasValidBank) {
      if (!hasValidBank) {
        setShowBankValidationError(true)
        setHasBankSelectionBeenTouched(true)
      }
      return
    }

    setShowBranchCodeValidationError(false)
    setShowBankValidationError(false)
    setShowSymbolValidationError(false)
    setSaveError("")

    setIsSaving(true)
    try {
      const method = normalizedForm.id > 0 ? "PUT" : "POST"
      const url = "/api/branches"
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...normalizedForm, branch_symbol: symbol, bank_branch: true }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ الفرع")
      }
      await fetchBranches()
      // keep dialog open and switch to new blank form after successful save
      setForm(initialForm)
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setSaveError(error instanceof Error ? error.message : "فشل في حفظ الفرع")
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBranch = async () => {
    if (!form.id) return
    try {
      const response = await fetch("/api/branches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3, bank_branch: true }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف الفرع")
      }
      await fetchBranches()
      setShowDeleteConfirm(false)
      setShowBankValidationError(false)
      setShowBranchCodeValidationError(false)
      setHasBankSelectionBeenTouched(false)

      const nextList = selectedBankId === "all"
        ? visibleBranches.filter((branch) => branch.id !== form.id)
        : visibleBranches.filter((branch) => branch.bank_id === selectedBankId && branch.id !== form.id)

      if (nextList.length > 0) {
        const targetIndex = Math.min(Math.max(0, currentIndex), nextList.length - 1)
        const next = nextList[targetIndex]
        if (next) {
          setForm({
            id: next.id,
            branch_code: next.branch_code,
            branch_name: next.branch_name,
            branch_symbol: next.branch_symbol || "",
            bank_id: next.bank_id,
            status: next.status,
          })
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
    }
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && showDeleteConfirm) {
      return
    }
    setDialogOpen(open)
  }

  const handleNew = () => openNewBranchDialog()
  const handleSave = async () => await saveBranch()
  const handleDelete = () => {
    if (!form.id) return
    setShowDeleteConfirm(true)
  }

  const handleNavigateRecord = (record: Branch) => {
    setForm({
      id: record.id,
      branch_code: record.branch_code,
      branch_name: record.branch_name,
      branch_symbol: record.branch_symbol || "",
      bank_id: normalizeBankId(record.bank_id),
      status: record.status,
    })

    const targetIndex = filteredBranches.findIndex((branch) => branch.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setShowDeleteConfirm(false)
    setIsNewMode(false)
    setDialogOpen(true)
  }

  const openBranchAtIndex = (index: number) => {
    if (!filteredBranches[index]) return
    const b = filteredBranches[index]
    setCurrentIndex(index)
    setForm({ id: b.id, branch_code: b.branch_code, branch_name: b.branch_name, branch_symbol: b.branch_symbol || "", bank_id: b.bank_id, status: b.status })
    setIsNewMode(false)
    setDialogOpen(true)
  }

  // pad to 4 digits and lookup by code
  const handleBranchCodeBlur = (code: string) => {
    const sanitizedCode = sanitizeNumericCode(code)
    const padded = sanitizedCode.padStart(4, "0")

    if (padded !== form.branch_code) {
      setForm((f) => ({ ...f, branch_code: padded }))
    }

    const foundIndex = branches.findIndex((b) => b.branch_code === padded)
    if (foundIndex !== -1) {
      const b = branches[foundIndex]
      setForm({ id: b.id, branch_code: b.branch_code, branch_name: b.branch_name, branch_symbol: b.branch_symbol || "", bank_id: b.bank_id, status: b.status })
      setCurrentIndex(foundIndex)
      setIsNewMode(false)
      setDialogOpen(true)
    } else {
      setForm((f) => ({ ...f, branch_code: padded, id: 0 }))
      setIsNewMode(true)
    }
  }

  const hasDuplicateName = (name: string, id = 0) => {
    if (!name.trim()) return false
    return branches.some((b) => b.branch_name.trim().toLowerCase() === name.trim().toLowerCase() && b.id !== id)
  }


  return (
    <div className="voucher-list-page space-y-5 p-3 sm:p-5" dir="rtl">
      <VoucherListHero
        category="الملفات"
        icon={Building2Icon}
        title="الفروع"
        subtitle="إدارة فروع الشركة وربطها بالبنوك"
        addLabel="إضافة فرع"
        onNew={handleNew}
      />

      <VoucherStats stats={[{ label: <>إجمالي الفروع</>, value: <>{totalBranches}</> }, { label: <>الفروع الفعالة</>, value: <>{activeBranches}</> }, { label: <>الفروع المعطلة</>, value: <>{inactiveBranches}</> }]} />

      <Card>
        <CardHeader>
          <CardTitle>الفروع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-semibold">الفروع</div>
                <p className="text-sm text-muted-foreground">إدارة فروع الشركة وربطها بالبنوك</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="all">الكل</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bank_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* UnifiedBranches toolbar lives in the modal component below */}

            <div className="overflow-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفرع</TableHead>
                    <TableHead className="text-right">اسم الفرع</TableHead>
                    <TableHead className="text-right">رمز الفرع</TableHead>
                    <TableHead className="text-right">البنك</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBranches.map((branch, index) => (
                    <TableRow
                      key={branch.id}
                      className="cursor-pointer"
                      onDoubleClick={() => openEditBranchDialog(branch, index)}
                    >
                      <TableCell className="text-right">{branch.branch_code}</TableCell>
                      <TableCell className="text-right">{branch.branch_name}</TableCell>
                      <TableCell className="text-right">{branch.branch_symbol || "-"}</TableCell>
                      <TableCell className="text-right">{banks.find((bank) => bank.id === branch.bank_id)?.bank_name || "-"}</TableCell>
                      <TableCell className="text-right">{branch.status === 1 ? "نشط" : "متوقف"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditBranchDialog(branch, index)
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

      <UnifiedBranches
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredBranches.length}
        form={form}
        isSaving={isSaving}
        loading={loading}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleDialogOpenChange}
        onNew={handleNew}
        onSave={handleSave}
        onDelete={handleDelete}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => {
          if (field === "branch_code") {
            const numericValue = sanitizeNumericCode(value).slice(0, 4)
            setForm((f) => ({ ...f, branch_code: numericValue }))
            setShowBranchCodeValidationError(numericValue.length === 0)
            return
          }

          if (field === "branch_symbol") {
            setForm((f) => ({ ...f, branch_symbol: String(value ?? "").toUpperCase().slice(0, 1) }))
            setShowSymbolValidationError(false)
            return
          }

          const normalizedValue = field === "bank_id" ? normalizeBankId(value) : value
          setForm((f) => ({ ...f, [field]: normalizedValue }))
          if (field === "bank_id") {
            if (normalizedValue !== null) {
              setShowBankValidationError(false)
              setHasBankSelectionBeenTouched(true)
            }
          }
        }}
        onConfirmDelete={deleteBranch}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        onCodeBlur={handleBranchCodeBlur}
        banks={banks}
        showBankValidationError={showBankValidationError && hasBankSelectionBeenTouched}
        showBranchCodeValidationError={showBranchCodeValidationError}
        canSave={
          /^\d{1,4}$/.test(form.branch_code) &&
          !!form.branch_name.trim() &&
          !!form.branch_symbol &&
          !branches.some((b) => (b.branch_symbol || "").toUpperCase() === form.branch_symbol.toUpperCase() && b.id !== form.id) &&
          !!form.bank_id &&
          Number(form.bank_id) > 0 &&
          !branches.some((b) => b.branch_code === form.branch_code && b.id !== form.id) &&
          !hasDuplicateName(form.branch_name, form.id)
        }
        hasDuplicateCode={branches.some((b) => b.branch_code === form.branch_code && b.id !== form.id)}
        hasDuplicateName={hasDuplicateName(form.branch_name, form.id)}
        usedSymbols={branches.filter((b) => b.id !== form.id && b.branch_symbol).map((b) => String(b.branch_symbol).toUpperCase())}
        showSymbolValidationError={showSymbolValidationError}
        saveError={saveError}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredBranches.length === 0 ? true : currentIndex >= filteredBranches.length - 1}
        isNewMode={isNewMode}
      />

      {/* delete confirm handled inside UnifiedBranches via props */}
    </div>
  )
}
