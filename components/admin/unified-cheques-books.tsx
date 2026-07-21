"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import DataGridView from "@/components/common/DataGridView"
import BankAccountsSearch from "@/components/admin/bank-accounts-search"
import type { BankAccountRecord } from "@/components/admin/unified-bank-accounts"
import { useAuth } from "@/components/auth/auth-context"

// حالات توفّر الورقة داخل الدفتر (منفصلة تماماً عن حالة الشيك ضمن سند فعلي).
const CHEQUE_BOOK_STATUS = { AVAILABLE: 1, DAMAGED: 2, UNAVAILABLE: 3 } as const
const CHEQUE_BOOK_STATUS_NAME: Record<number, string> = { 1: "متوفر", 2: "تالف", 3: "غير متوفر" }

export interface ChequeBookRow {
  id?: number
  cheque_code: string
  notes: string
  status: number
  status_name?: string
  operation_user_id: number | null
  operation_user_name?: string
}

export interface ChequeBookRecord {
  id: number
  code: string
  bank_account_id: number | null
  bank_account_code: string
  bank_account_name: string
  currency_id: number | null
  currency_name?: string
  currency_code?: string
  insert_date: string
  notes: string
  status: number
  cheques: ChequeBookRow[]
}

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface UnifiedChequesBooksProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  form: ChequeBookRecord
  isSaving: boolean
  isLoading?: boolean
  showDeleteConfirm: boolean
  bankAccounts: BankAccountRecord[]
  currencies: CurrencyOption[]
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: ChequeBookRecord) => void
  onFormChange: (field: string, value: string | number | null) => void
  onChequesChange: (cheques: ChequeBookRow[]) => void
  onCodeBlur: (code: string) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  canSave?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
  errorMessages?: string[]
}

// أرقام فقط، بنفس أسلوب التحقق من الحقول الرقمية في نماذج السندات.
const blockNonNumericKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const controlKeys = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
  if (e.ctrlKey || e.metaKey || e.altKey || controlKeys.includes(e.key)) return
  if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
    e.preventDefault()
  }
}

const MAX_AUTO_GENERATE = 5000

export default function UnifiedChequesBooks({
  dialogOpen,
  currentIndex,
  totalRecords,
  form,
  isSaving,
  isLoading = false,
  showDeleteConfirm,
  bankAccounts,
  currencies,
  onOpenChange,
  onNew,
  onSave,
  onDelete,
  onNavigateRecord,
  onFormChange,
  onChequesChange,
  onCodeBlur,
  onConfirmDelete,
  onCancelDelete,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
}: UnifiedChequesBooksProps) {
  const { user } = useAuth()
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const [bankSearchOpen, setBankSearchOpen] = useState(false)
  const [navLoading, setNavLoading] = useState(false)

  // إصدار الشيكات آلياً — حقول عابرة، لا تُحفظ مباشرة (تُترجم إلى أسطر في الشبكة عند الضغط).
  const [fromChequeNo, setFromChequeNo] = useState("")
  const [toChequeNo, setToChequeNo] = useState("")
  const [chequeCount, setChequeCount] = useState("")

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show(
        errorMessages.map((detail) => ({ severity: "error", summary: "", detail, sticky: false, life: 5000 })),
      )
    }
  }, [errorMessages])

  useEffect(() => {
    setFromChequeNo("")
    setToChequeNo("")
    setChequeCount("")
  }, [dialogOpen, form.id, isNewMode])

  const initialSnapshotRef = useRef<string>(JSON.stringify(form))
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify(form)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, isNewMode])

  const guardedAction = (action: () => void) => {
    if (showUnsavedConfirm) return
    if (JSON.stringify(form) !== initialSnapshotRef.current) {
      pendingActionRef.current = action
      setShowUnsavedConfirm(true)
    } else {
      action()
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    if (showDeleteConfirm || showUnsavedConfirm) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault()
        onSave()
        return
      }
      if (event.key === "F4") {
        event.preventDefault()
        if (form.id > 0) {
          onDelete?.()
        } else {
          guardedAction(() => onOpenChange(false))
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dialogOpen, form.id, onSave, onDelete, onOpenChange, guardedAction, showDeleteConfirm, showUnsavedConfirm])

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => codeInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [dialogOpen, form.id])

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    setNavLoading(true)
    try {
      const currentId = form.id > 0 ? form.id : 0
      const isNewRecord = form.id <= 0
      const effectiveDirection =
        direction === "previous" && isNewRecord ? "last" : direction === "next" && isNewRecord ? "first" : direction

      const query = new URLSearchParams()
      if (effectiveDirection === "previous" || effectiveDirection === "next") query.set("currentId", String(currentId))

      const response = await fetch(`/api/cheques-books/navigation/${effectiveDirection}?${query.toString()}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) onNavigateRecord?.(record)
    } catch (error) {
      console.error("Failed to navigate cheque book", error)
    } finally {
      setNavLoading(false)
    }
  }

  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    if (target.closest(".wj-flexgrid")) return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null && !el.closest(".wj-flexgrid"))

    const currentIndex = focusable.indexOf(target)
    if (currentIndex === -1) return
    event.preventDefault()
    focusable[currentIndex + 1]?.focus()
  }

  const currencyName = (currencyId: number | null) => {
    const currency = currencies.find((c) => Number(c.currency_id ?? c.id) === currencyId)
    return currency?.currency_name || currency?.currency_code || ""
  }

  const applyBankAccount = (account: BankAccountRecord) => {
    onFormChange("bank_account_id", account.id)
    onFormChange("bank_account_code", account.code)
    onFormChange("bank_account_name", account.name)
    onFormChange("currency_id", account.currency_id)
  }

  const handleBankCodeBlur = () => {
    const code = form.bank_account_code.trim()
    if (!code) {
      onFormChange("bank_account_id", null)
      onFormChange("bank_account_name", "")
      onFormChange("currency_id", null)
      return
    }
    const match = bankAccounts.find((a) => a.code === code)
    if (match) {
      applyBankAccount(match)
    } else {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد حساب بنكي بهذا الرقم: ${code}`, life: 3000 }])
    }
  }

  // رقم الدفتر: يُكمَّل بالأصفار إلى 8 خانات (2 -> 00000002)، ثم يُطلب من المكوّن الأب عرض
  // الدفتر إن كان موجوداً بهذا الرقم، أو تصفير الحقول لإدخال دفتر جديد بهذا الرقم إن لم يوجد.
  const handleCodeBlur = () => {
    const raw = form.code.trim()
    if (!raw) return
    const padded = /^\d+$/.test(raw) ? raw.padStart(8, "0") : raw
    if (padded !== form.code) onFormChange("code", padded)
    onCodeBlur(padded)
  }

  // ---- الشيكات ----
  const cheques = form.cheques || []
  const chequesRef = useRef(cheques)
  chequesRef.current = cheques

  const patchChequeRow = (index: number, patch: Partial<ChequeBookRow>) => {
    const next = chequesRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    chequesRef.current = next
    onChequesChange(next)
  }

  // زر تالف/ارجاع الى متوفر: يعمل فقط بين متوفر(1)⇄تالف(2). شيك غير متوفر(3) (مستخدم فعلياً
  // في سند) لا يتغيّر عند الضغط — لا معنى لتوفيره أو إتلافه بعد استخدامه.
  const toggleChequeStatus = (index: number) => {
    const row = chequesRef.current[index]
    if (!row) return
    if (row.status === CHEQUE_BOOK_STATUS.AVAILABLE) {
      patchChequeRow(index, {
        status: CHEQUE_BOOK_STATUS.DAMAGED,
        status_name: CHEQUE_BOOK_STATUS_NAME[CHEQUE_BOOK_STATUS.DAMAGED],
      })
    } else if (row.status === CHEQUE_BOOK_STATUS.DAMAGED) {
      patchChequeRow(index, {
        status: CHEQUE_BOOK_STATUS.AVAILABLE,
        status_name: CHEQUE_BOOK_STATUS_NAME[CHEQUE_BOOK_STATUS.AVAILABLE],
      })
    }
  }

  // من رقم شيك / الى رقم شيك -> عدد الشيكات تلقائياً عند الخروج من أي منهما.
  const recalcCount = (from: string, to: string) => {
    const fromNum = Number(from)
    const toNum = Number(to)
    if (!from || !to || !Number.isFinite(fromNum) || !Number.isFinite(toNum) || toNum < fromNum) {
      setChequeCount("")
      return
    }
    setChequeCount(String(toNum - fromNum + 1))
  }

  const handleGenerateCheques = () => {
    if (!fromChequeNo.trim() || !toChequeNo.trim() || !chequeCount.trim()) {
      messagesRef.current?.show?.([
        { severity: "error", summary: "", detail: "يجب تحديد من رقم شيك او الى رقم شيك او عدد الشيكات", sticky: false, life: 4000 },
      ])
      return
    }

    if (fromChequeNo.trim().length !== toChequeNo.trim().length) {
      messagesRef.current?.show?.([
        { severity: "error", summary: "", detail: "من رقم شيك يجب ان يكون بنفس طول وعدد خانات الى رقم شيك", sticky: false, life: 4000 },
      ])
      return
    }

    const fromNum = Number(fromChequeNo)
    const toNum = Number(toChequeNo)
    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || toNum < fromNum) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "نطاق أرقام الشيكات غير صحيح", sticky: false, life: 4000 }])
      return
    }

    const count = toNum - fromNum + 1
    if (count > MAX_AUTO_GENERATE) {
      messagesRef.current?.show?.([
        { severity: "error", summary: "", detail: `عدد الشيكات كبير جداً (الحد الأقصى ${MAX_AUTO_GENERATE} دفعة واحدة)`, sticky: false, life: 4000 },
      ])
      return
    }

    const width = fromChequeNo.trim().length
    const generated: ChequeBookRow[] = []
    for (let n = fromNum; n <= toNum; n++) {
      generated.push({
        cheque_code: String(n).padStart(width, "0"),
        notes: "",
        status: CHEQUE_BOOK_STATUS.AVAILABLE,
        status_name: CHEQUE_BOOK_STATUS_NAME[CHEQUE_BOOK_STATUS.AVAILABLE],
        operation_user_id: null,
        operation_user_name: user?.fullName || "",
      })
    }

    const next = [...chequesRef.current, ...generated]
    chequesRef.current = next
    onChequesChange(next)
    setFromChequeNo("")
    setToChequeNo("")
    setChequeCount("")
  }

  const chequeScheme = useMemo(
    () => ({
      name: "ChequeBookChequesScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "رقم الشيك", name: "cheque_code", width: 140, isReadOnly: true },
        { header: "حالة الشيك", name: "status_name", width: 120, isReadOnly: true },
        { header: "ملاحظات", name: "notes", width: "*", minWidth: 200 },
        { header: "المستخدم", name: "operation_user_name", width: 160, isReadOnly: true },
        {
          // بدون عنوان عمود، ونص الزر نفسه يُقرأ من قيمة الخلية المربوطة (damage_toggle_label)
          // بدل نص ثابت، لأنه يتغيّر حسب حالة كل سطر (تالف ⇄ ارجاع الى متوفر).
          name: "damage_toggle_label",
          header: " ",
          width: 130,
          buttonBody: "button",
          align: "center",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => toggleChequeStatus(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cheques],
  )

  const chequeGridData = useMemo(
    () =>
      cheques.map((row, i) => ({
        ...row,
        ser: i + 1,
        damage_toggle_label:
          row.status === CHEQUE_BOOK_STATUS.AVAILABLE
            ? "تالف"
            : row.status === CHEQUE_BOOK_STATUS.DAMAGED
              ? "ارجاع الى متوفر"
              : "",
      })),
    [cheques],
  )

  const handleChequeCellEditEnded = (grid: any, e: any) => {
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    if (colName === "notes") {
      const value = grid.getCellData(row, e.col, false)
      patchChequeRow(row, { notes: String(value ?? "") })
    }
  }

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}
      >
        <DialogContent
          className="voucher-form w-[95vw] max-w-[1200px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || bankSearchOpen) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || bankSearchOpen) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || bankSearchOpen) event.preventDefault()
          }}
        >
          <UniversalToolbar
            currentRecord={currentIndex + 1}
            totalRecords={totalRecords}
            onNew={() => guardedAction(() => onNew?.())}
            onSave={onSave}
            onDelete={onDelete}
            onFirst={() => guardedAction(() => void handleNavigate("first"))}
            onPrevious={() => guardedAction(() => void handleNavigate("previous"))}
            onNext={() => guardedAction(() => void handleNavigate("next"))}
            onLast={() => guardedAction(() => void handleNavigate("last"))}
            isSaving={isSaving}
            canSave={canSave}
            canDelete={form.id > 0}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />

          <div className="relative rounded-b-3xl bg-background px-6 py-6" onKeyDown={handleFormEnterAsTab}>
            <ProgressSpinner loading={isSaving || isLoading || navLoading} />

            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">
                دفاتر الشيكات {form.id > 0 ? "" : "(إضافة)"}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            <div className="grid gap-3 border-b pb-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cb-code">رقم الدفتر *</Label>
                  <Input
                    id="cb-code"
                    ref={codeInputRef}
                    value={form.code}
                    maxLength={8}
                    onKeyDown={blockNonNumericKey}
                    onChange={(e) => onFormChange("code", e.target.value)}
                    onBlur={handleCodeBlur}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>العملة</Label>
                  <Input value={form.currency_name || currencyName(form.currency_id) || form.currency_code || ""} readOnly disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>رقم الحساب البنكي *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.bank_account_code}
                      onChange={(e) => onFormChange("bank_account_code", e.target.value)}
                      onBlur={handleBankCodeBlur}
                      onKeyDown={(e) => {
                        if (e.key === "F10") {
                          e.preventDefault()
                          setBankSearchOpen(true)
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setBankSearchOpen(true)}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>اسم الحساب البنكي</Label>
                  <Input value={form.bank_account_name} readOnly disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cb-date">تاريخ الاصدار</Label>
                  <Input
                    id="cb-date"
                    type="date"
                    value={form.insert_date ? form.insert_date.slice(0, 10) : ""}
                    onChange={(e) => onFormChange("insert_date", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cb-notes">ملاحظات</Label>
                  <Input
                    id="cb-notes"
                    value={form.notes}
                    onChange={(e) => onFormChange("notes", e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <h4 className="text-sm font-bold text-slate-500">الشيكات</h4>
              <div className="grid grid-cols-4 gap-2 items-end">
                <div className="grid gap-1.5">
                  <Label>من رقم شيك *</Label>
                  <Input
                    value={fromChequeNo}
                    maxLength={20}
                    onKeyDown={blockNonNumericKey}
                    onChange={(e) => setFromChequeNo(e.target.value)}
                    onBlur={() => recalcCount(fromChequeNo, toChequeNo)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>الى رقم شيك *</Label>
                  <Input
                    value={toChequeNo}
                    maxLength={20}
                    onKeyDown={blockNonNumericKey}
                    onChange={(e) => setToChequeNo(e.target.value)}
                    onBlur={() => recalcCount(fromChequeNo, toChequeNo)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>عدد الشيكات</Label>
                  <Input value={chequeCount} disabled readOnly />
                </div>
                <Button type="button" onClick={handleGenerateCheques} className="h-9">
                  <Plus className="ml-1 h-4 w-4" />
                  اصدار الشيكات اليا
                </Button>
              </div>

              <DataGridView
                style={{ height: "300px" }}
                scheme={chequeScheme}
                dataSource={chequeGridData}
                idProperty="ser"
                isReport={false}
                showContextMenu={false}
                cellEditEnded={handleChequeCellEditEnded}
                dontConvertToCards={true}
              />
              <div className="text-sm font-semibold text-slate-600">إجمالي الشيكات: {cheques.length.toLocaleString()}</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BankAccountsSearch
        open={bankSearchOpen}
        onOpenChange={setBankSearchOpen}
        bankAccounts={bankAccounts}
        onSelect={applyBankAccount}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف دفتر الشيكات هذا؟"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ConfirmDialogYesNo
        visible={showUnsavedConfirm}
        message="تم تعديل البيانات، هل تريد الحفظ؟"
        showBack
        onConfirm={() => {
          setShowUnsavedConfirm(false)
          pendingActionRef.current = null
          onSave()
        }}
        onCancel={() => {
          setShowUnsavedConfirm(false)
          const action = pendingActionRef.current
          pendingActionRef.current = null
          action?.()
        }}
        onBack={() => setShowUnsavedConfirm(false)}
      />
    </>
  )
}
