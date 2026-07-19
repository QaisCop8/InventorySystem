"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "@/components/common/DataGridView"
import type { BankAccountRecord } from "./unified-bank-accounts"

interface BankAccountsSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccounts: BankAccountRecord[]
  onSelect: (record: BankAccountRecord) => void
}

export default function BankAccountsSearch({ open, onOpenChange, bankAccounts, onSelect }: BankAccountsSearchProps) {
  const [codeFilter, setCodeFilter] = useState("")
  const [nameFilter, setNameFilter] = useState("")
  const [selected, setSelected] = useState<BankAccountRecord | null>(null)

  useEffect(() => {
    if (!open) {
      setCodeFilter("")
      setNameFilter("")
      setSelected(null)
    }
  }, [open])

  const filteredAccounts = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase()
    return bankAccounts.filter((account) => {
      if (account.status === 3) return false
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
  }, [bankAccounts, codeFilter, nameFilter])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="w-[94vw] max-w-4xl h-auto max-h-[76vh] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4"
        dir="rtl"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 text-center sm:text-right">
              بحث حسابات البنوك
            </h2>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="mx-auto h-8 w-8 rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-sm hover:bg-slate-100 sm:mx-0"
              aria-label="إغلاق"
              title="إغلاق"
            >
              ✕
            </Button>
          </div>

          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 border-b border-slate-200 pb-3 sm:pb-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الحساب</Label>
              <Input
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                placeholder="ابحث برقم الحساب"
                className="h-10 rounded-xl border border-slate-200 bg-white text-right shadow-sm focus:border-blue-300 focus:bg-white"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">الاسم</Label>
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="ابحث باسم الحساب"
                className="h-10 rounded-xl border border-slate-200 bg-white text-right shadow-sm focus:border-blue-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{ height: "420px" }}>
            {filteredAccounts.length > 0 ? (
              <DataGridView
                containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                defaultRowHeight={42}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={filteredAccounts}
                scheme={scheme}
                onRowClick={(record: BankAccountRecord) => setSelected(record)}
                onRowDoubleClick={handleRowDoubleClick}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-500 text-sm">
                لا توجد نتائج
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 border-t border-slate-200 pt-4">
            <Button onClick={handleConfirm} disabled={!selected} className="search-button shadow-sm">
              موافق
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button shadow-sm">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
