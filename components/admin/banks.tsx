"use client"

import { tr, appDir } from "@/lib/i18n"
import { notifyDefinitionsChanged } from "@/lib/definitions-changed"
import { useEffect, useMemo, useState } from "react"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { Landmark as LandmarkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Edit } from "lucide-react"
import UnifiedBanks from "@/components/admin/unified-banks"
import { BanksImportDialog } from "@/components/import/banks-import"
import { FileSpreadsheet } from "lucide-react"

interface Bank {
  id: number
  bank_code: string
  bank_name: string
  bank_name_en?: string
  swift_code?: string | null
  status: number
}

const initialForm = {
  id: 0,
  bank_code: "",
  bank_name: "",
  bank_name_en: "",
  swift_code: "",
  status: 1,
}

export default function Banks() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [importOpen, setImportOpen] = useState(false)

  const visibleBanks = useMemo(() => banks.filter((bank) => bank.status !== 3), [banks])

  const filteredBanks = useMemo(
    () =>
      visibleBanks
        .map((bank, index) => ({ bank, index }))
        .filter(({ bank }) => {
          const lower = searchText.trim().toLowerCase()
          if (!lower) return true
          return (
            bank.bank_code.toLowerCase().includes(lower) ||
            bank.bank_name.toLowerCase().includes(lower) ||
            bank.bank_name_en?.toLowerCase().includes(lower)
          )
        }),
    [visibleBanks, searchText],
  )

  const activeBanks = visibleBanks.filter((bank) => bank.status === 1).length
  const totalBanks = visibleBanks.length
  const inactiveBanks = totalBanks - activeBanks

  useEffect(() => {
    fetchBanks()
  }, [])

  const fetchBanks = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/banks")
      const data = await response.json()
      const updatedBanks = Array.isArray(data) ? data : []
      setBanks(updatedBanks)
      return updatedBanks
    } catch (error) {
      console.error("Failed to fetch banks", error)
      setBanks([])
      return []
    } finally {
      setLoading(false)
    }
  }

  const openNewBankDialog = () => {
    setDeleteError("")
    setForm(initialForm)
    setIsNewMode(true)
    setDialogOpen(true)
  }

  const openEditBankDialog = (bank: Bank, index: number) => {
    setDeleteError("")
    setForm({
      id: bank.id,
      bank_code: bank.bank_code,
      bank_name: bank.bank_name,
      bank_name_en: bank.bank_name_en || "",
      swift_code: bank.swift_code || "",
      status: bank.status,
    })
    setIsNewMode(false)
    setCurrentIndex(index)
    setDialogOpen(true)
  }

  const handleBankCodeBlur = (bank_code: string) => {
    const trimmedCode = bank_code.trim()
    if (!trimmedCode) return

    const paddedCode = trimmedCode.padStart(4, "0")
    setForm((prev) => ({ ...prev, bank_code: paddedCode }))

    const matchedIndex = banks.findIndex(
      (bank) => bank.bank_code.trim().toLowerCase() === paddedCode.toLowerCase(),
    )

    if (matchedIndex !== -1) {
      const matchedBank = banks[matchedIndex]
      setForm({
        id: matchedBank.id,
        bank_code: matchedBank.bank_code,
        bank_name: matchedBank.bank_name,
        bank_name_en: matchedBank.bank_name_en || "",
        swift_code: matchedBank.swift_code || "",
        status: matchedBank.status,
      })
      setIsNewMode(false)
      setCurrentIndex(matchedIndex)
    } else {
      // رقم غير موجود ⇐ سجل جديد بهذا الرقم: حقول البنك السابق (عند التعديل) تُفرَّغ، وما كُتب في سجل جديد يبقى
      setForm((prev) => (prev.id > 0 ? { ...initialForm, bank_code: paddedCode } : { ...prev, bank_code: paddedCode }))
      setIsNewMode(true)
    }
  }

  useEffect(() => {
    if (!dialogOpen || isNewMode) return
    const bank = banks[currentIndex]
    if (bank) {
      setForm({
        id: bank.id,
        bank_code: bank.bank_code,
        bank_name: bank.bank_name,
        bank_name_en: bank.bank_name_en || "",
        swift_code: bank.swift_code || "",
        status: bank.status,
      })
    }
  }, [currentIndex, dialogOpen, banks, isNewMode])

  const hasDuplicateCode = banks.some(
    (bank) => bank.id !== form.id && bank.bank_code.trim().toLowerCase() === form.bank_code.trim().toLowerCase() && form.bank_code.trim() !== "",
  )
  const hasDuplicateName = banks.some(
    (bank) => bank.id !== form.id && bank.bank_name.trim().toLowerCase() === form.bank_name.trim().toLowerCase() && form.bank_name.trim() !== "",
  )

  const canSaveForm =
    !!form.bank_code.trim() &&
    !!form.bank_name.trim() &&
    !hasDuplicateCode &&
    !hasDuplicateName

  const saveBank = async () => {
    // سبب منع الحفظ يظهر في النافذة (كان الحفظ يُتجاهل بصمت)
    if (!canSaveForm) {
      setDeleteError(!form.bank_code.trim() ? tr("رقم البنك مطلوب") : !form.bank_name.trim() ? tr("اسم البنك مطلوب") : hasDuplicateCode ? tr("رقم البنك مستخدم لبنك آخر") : tr("اسم البنك مستخدم لبنك آخر"))
      return
    }

    setDeleteError("")
    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/banks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || tr("فشل في حفظ البنك"))
      }
      const updated = await fetchBanks()
      notifyDefinitionsChanged("banks")
      // After saving, keep the dialog open and switch to 'new' mode with a blank form
      setForm(initialForm)
      setIsNewMode(true)
      // set current index to last known record (optional)
      setCurrentIndex(Math.max(0, (updated?.length || 0) - 1))
    } catch (error) {
      console.error(error)
      setDeleteError(error instanceof Error ? error.message : tr("فشل في حفظ البنك"))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBank = async () => {
    if (!form.id) return

    try {
      const branchesResponse = await fetch(`/api/branches?bank_id=${form.id}`)
      const branchesData = await branchesResponse.json()
      const linkedBranches = Array.isArray(branchesData)
        ? branchesData.filter((branch: { status?: number }) => Number(branch.status ?? 1) !== 3)
        : []

      if (linkedBranches.length > 0) {
        setDeleteError(tr("يوجد فروع مرتبطة مع البنك لا يمكن حذفه"))
        setShowDeleteConfirm(false)
        return
      }

      const response = await fetch("/api/banks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3 }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || tr("فشل في حذف البنك"))
      }
      const updatedBanks = await fetchBanks()
      notifyDefinitionsChanged("banks")
      const visibleUpdatedBanks = updatedBanks.filter((bank) => bank.status !== 3)
      const nextIndex = Math.min(currentIndex, Math.max(0, visibleUpdatedBanks.length - 1))
      if (visibleUpdatedBanks.length > 0) {
        const nextBank = visibleUpdatedBanks[nextIndex]
        setForm({
          id: nextBank.id,
          bank_code: nextBank.bank_code,
          bank_name: nextBank.bank_name,
          bank_name_en: nextBank.bank_name_en || "",
          swift_code: nextBank.swift_code || "",
          status: nextBank.status,
        })
        setCurrentIndex(nextIndex)
        setIsNewMode(false)
      } else {
        setForm(initialForm)
        setIsNewMode(true)
      }
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error(error)
    }
  }

  const handleNew = () => openNewBankDialog()
  const handleSave = async () => await saveBank()
  const handleDelete = () => setShowDeleteConfirm(true)
  const handleNavigateRecord = (record: Bank) => {
    setForm({
      id: record.id,
      bank_code: record.bank_code,
      bank_name: record.bank_name,
      bank_name_en: record.bank_name_en || "",
      swift_code: record.swift_code || "",
      status: record.status,
    })

    const targetIndex = filteredBanks.findIndex(({ bank }) => bank.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setIsNewMode(false)
    setDialogOpen(true)
  }
  const handleSearchTextChange = (value: string) => setSearchText(value)
  const handleOpenChange = (open: boolean) => {
    if (!open && showDeleteConfirm) {
      return
    }
    setDialogOpen(open)
  }

  return (
    <div className="voucher-list-page space-y-5 p-3 sm:p-5" dir={appDir()}>
      <VoucherListHero
        category={tr("الملفات")}
        icon={LandmarkIcon}
        title={tr("البنوك")}
        subtitle={tr("إدارة بنوك الشركة ورموزها الأساسية")}
        addLabel={tr("إضافة بنك جديد")}
        onNew={handleNew}
        addDisabled={loading}
      />

      <VoucherStats stats={[{ label: <>{tr("إجمالي البنوك")}</>, value: <>{totalBanks}</> }, { label: <>{tr("البنوك الفعالة")}</>, value: <>{activeBanks}</> }, { label: <>{tr("البنوك المعطلة")}</>, value: <>{inactiveBanks}</> }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xl font-semibold">{tr("البنوك")}</div>
          <div className="text-sm text-muted-foreground">{tr("إدارة بنوك الشركة ورموزها الأساسية")}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder={tr("بحث برقم أو اسم البنك")}
              value={searchText}
              onChange={(e) => handleSearchTextChange(e.target.value)}
              className="min-w-[260px]"
              disabled={loading}
            />
            <Button variant="outline" size="sm" disabled={loading} onClick={() => handleSearchTextChange(searchText)}>
              <Search className="h-4 w-4" />
              {tr("بحث")}
            </Button>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              {tr("استيراد البنوك والفروع من Excel")}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{tr("رقم البنك")}</TableHead>
              <TableHead className="text-start">{tr("اسم البنك")}</TableHead>
              <TableHead className="text-start">{tr("اسم البنك انجليزي")}</TableHead>
              <TableHead className="text-start">{tr("رمز السويفت")}</TableHead>
              <TableHead className="text-start">{tr("الحالة")}</TableHead>
              <TableHead className="text-start">{tr("إجراءات")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBanks.map(({ bank, index }) => (
              <TableRow
                key={bank.id}
                className="cursor-pointer transition hover:bg-slate-50"
                onClick={() => openEditBankDialog(bank, index)}
              >
                <TableCell className="text-start">{bank.bank_code}</TableCell>
                <TableCell className="text-start">{bank.bank_name}</TableCell>
                <TableCell className="text-start">{bank.bank_name_en}</TableCell>
                <TableCell className="text-start font-mono">{bank.swift_code || "-"}</TableCell>
                <TableCell className="text-start">{bank.status === 1 ? tr("نشط") : tr("متوقف")}</TableCell>
                <TableCell className="text-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditBankDialog(bank, index)
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

      <UnifiedBanks
        dialogOpen={dialogOpen}
        // سجل جديد: موضعه بعد آخر سجل، وأزرار التنقل مفعّلة للانتقال للسجلات المحفوظة
        currentIndex={form.id > 0 ? currentIndex : filteredBanks.length}
        totalRecords={filteredBanks.length}
        form={form}
        isSaving={isSaving}
        loading={loading}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleOpenChange}
        onNew={handleNew}
        onSave={handleSave}
        onDelete={handleDelete}
        onNavigateRecord={handleNavigateRecord}
        isNewMode={isNewMode}
        onFormChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
        onCodeBlur={handleBankCodeBlur}
        canSave={canSaveForm}
        hasDuplicateCode={hasDuplicateCode}
        hasDuplicateName={hasDuplicateName}
        onConfirmDelete={deleteBank}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        isFirstRecord={form.id > 0 ? currentIndex <= 0 : filteredBanks.length === 0}
        isLastRecord={form.id > 0 ? (filteredBanks.length === 0 ? true : currentIndex >= filteredBanks.length - 1) : filteredBanks.length === 0}
        deleteError={deleteError}
      />
      <BanksImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { void fetchBanks(); notifyDefinitionsChanged("banks"); notifyDefinitionsChanged("bank-branches") }} />
    </div>
  )
}
