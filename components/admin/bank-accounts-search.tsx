"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "@/components/common/DataGridView"
import { CellRange } from "@grapecity/wijmo.grid"
import { Check, Hash, Landmark, Search, X } from "lucide-react"
import type { BankAccountRecord } from "./unified-bank-accounts"

interface BankAccountsSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccounts: BankAccountRecord[]
  onSelect: (record: BankAccountRecord) => void
  // عند تمريرها (سند الصرف يمرّر عملة السند) تُقيَّد النتائج على الحسابات البنكية بنفس العملة
  // فقط — لا معنى لاختيار حساب بعملة مختلفة عن عملة السند.
  currencyId?: number | null
}

export default function BankAccountsSearch({ open, onOpenChange, bankAccounts, onSelect, currencyId }: BankAccountsSearchProps) {
  const [codeFilter, setCodeFilter] = useState("")
  const [nameFilter, setNameFilter] = useState("")
  const [selected, setSelected] = useState<BankAccountRecord | null>(null)
  const gridRef = useRef<any>(null)
  const filterContainerRef = useRef<HTMLDivElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const mobileListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      setCodeFilter("")
      setNameFilter("")
      setSelected(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => nameInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  const focusGridFirstRow = () => {
    // على الجوال الجدول مخفي وتظهر بطاقات بدلاً منه — ننقل التركيز لأول بطاقة
    const firstCard = mobileListRef.current?.querySelector<HTMLElement>("button[data-bank-card]")
    if (firstCard && firstCard.offsetParent !== null) {
      firstCard.focus()
      return
    }
    const grid = gridRef.current
    if (!grid || !grid.columns || !grid.rows || grid.rows.length === 0) return
    grid.select(new CellRange(0, 0))
    grid.focus()
  }

  useEffect(() => {
    if (!open) return

    // Enter كـ Tab بين حقول البحث، ومن آخر حقل (أو ↓) إلى أول سطر في النتائج
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const container = filterContainerRef.current
      if (!container || !container.contains(target)) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        event.stopPropagation()
        focusGridFirstRow()
        return
      }

      if (event.key !== "Enter" || event.isComposing) return

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
      const currentIndex = focusable.indexOf(target)
      if (currentIndex === -1) return
      event.preventDefault()
      event.stopPropagation()
      if (currentIndex === focusable.length - 1) {
        focusGridFirstRow()
        return
      }
      focusable[currentIndex + 1]?.focus()
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleGridKeyDown = (grid: any, e: KeyboardEvent) => {
    if (e.key !== "Enter") return
    const row = grid?.selection?.row
    if (row == null || row < 0) return
    const item = grid.rows[row]?.dataItem
    if (!item) return
    e.preventDefault()
    handleRowDoubleClick(item)
  }

  const filteredAccounts = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase()
    return bankAccounts.filter((account) => {
      if (account.status === 3) return false
      if (currencyId != null && Number(account.currency_id) !== Number(currencyId)) return false
      if (codeFilter && !account.code.includes(codeFilter)) return false
      if (
        nameQuery &&
        !account.name.toLowerCase().includes(nameQuery) &&
        !account.name_lang2.toLowerCase().includes(nameQuery)
      ) {
        return false
      }
      return true
    })
  }, [bankAccounts, codeFilter, nameFilter, currencyId])

  const scheme = useMemo(
    () => ({
      name: "BankAccountsSearchScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 160, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: "*", minWidth: 260, isReadOnly: true },
        { header: "رقم الحساب الفعلي", name: "actual_bank_code", width: 180, isReadOnly: true },
      ],
    }),
    [],
  )

  const handleRowDoubleClick = (record: BankAccountRecord) => {
    onSelect(record)
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (selected) handleRowDoubleClick(selected)
  }

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, record: BankAccountRecord) => {
    const cards = Array.from(mobileListRef.current?.querySelectorAll<HTMLElement>("button[data-bank-card]") ?? [])
    const index = cards.indexOf(event.currentTarget)
    if (event.key === "Enter") {
      event.preventDefault()
      handleRowDoubleClick(record)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      cards[index + 1]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (index <= 0) nameInputRef.current?.focus()
      else cards[index - 1]?.focus()
    }
  }

  const inputClass =
    "h-10 rounded-xl border border-slate-200 bg-white pr-9 text-right text-sm shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex h-[min(calc(100%-1.5rem),calc(100dvh-1rem))] max-h-[min(calc(100%-1.5rem),calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:h-[min(calc(100%-1.5rem),640px)] sm:w-[94vw]"
        dir="rtl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">بحث حسابات البنوك</h2>
              <p className="text-[11px] text-emerald-50">
                {filteredAccounts.length} حساب{currencyId != null ? " — بعملة السند فقط" : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/30"
            aria-label="إغلاق"
            title="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={filterContainerRef}
          className="grid shrink-0 grid-cols-1 gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-3 sm:grid-cols-2 sm:px-4"
        >
          <div>
            <Label className="mb-1 block text-xs font-semibold text-slate-600">رقم الحساب</Label>
            <div className="relative">
              <Hash className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                placeholder="ابحث برقم الحساب"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-slate-600">الاسم</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={nameInputRef}
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="ابحث باسم الحساب"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-3 sm:p-4">
          {filteredAccounts.length > 0 ? (
            <>
              <div className="hidden h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block">
                <DataGridView
                  innerRef={gridRef}
                  containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                  style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                  defaultRowHeight={42}
                  autoRowHeights={false}
                  wordWrap={false}
                  dataSource={filteredAccounts}
                  scheme={scheme}
                  onRowClick={(record: BankAccountRecord) => setSelected(record)}
                  onRowDoubleClick={handleRowDoubleClick}
                  onKeyDown={handleGridKeyDown}
                />
              </div>
              {/* الجوال: بطاقات بدل الجدول — نقرة تحدد ونقرة ثانية تختار */}
              <div ref={mobileListRef} className="flex h-full flex-col gap-2 overflow-y-auto sm:hidden">
                {filteredAccounts.map((account) => {
                  const isSelected = selected?.id === account.id
                  return (
                    <button
                      key={account.id}
                      type="button"
                      data-bank-card
                      onClick={() => (isSelected ? handleRowDoubleClick(account) : setSelected(account))}
                      onKeyDown={(event) => handleCardKeyDown(event, account)}
                      className={`flex w-full shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-right shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                        isSelected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        {isSelected ? <Check className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{account.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                          <span dir="ltr">{account.code}</span>
                          {account.actual_bank_code ? (
                            <span>
                              الفعلي: <span dir="ltr">{account.actual_bank_code}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              <Search className="h-6 w-6 text-slate-300" />
              لا توجد نتائج
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
          <div className="hidden min-w-0 truncate text-xs text-slate-500 sm:block">
            {selected ? `المحدد: ${selected.code} — ${selected.name}` : "Enter للانتقال بين الحقول • ↓ للنتائج • Enter على السطر للاختيار"}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={handleConfirm} disabled={!selected} className="h-10 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-w-28">
              <Check className="h-4 w-4" />
              موافق
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 sm:min-w-28">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
