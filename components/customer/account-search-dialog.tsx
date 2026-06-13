"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import DataGridView from "../common/DataGridView"

export interface AccountItem {
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
  allow_trans_with_diff_curr: number
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

interface AccountSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: AccountItem[]
  onSelect: (account: AccountItem) => void
}

export default function AccountSearchDialog({ open, onOpenChange, accounts, onSelect }: AccountSearchDialogProps) {
  const [searchResults, setSearchResults] = useState<AccountItem[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [searchFilters, setSearchFilters] = useState({
    accountNumber: "",
    accountName: "",
    financialList: "__all__",
    type: "__all__",
  })
  const gridRef = useRef<any>(null)

  const accountScheme = useMemo(
    () => ({
      name: "AccountSearchScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 180, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: "*", minWidth: 320, isReadOnly: true },
        { header: "النوع", name: "type_name", width: 220, isReadOnly: true },
        { header: "القائمة المالية", name: "finanical_list_id", width: 240, isReadOnly: true },
      ],
    }),
    [],
  )

  const gridDataSource = useMemo(
    () =>
      searchResults.map((account) => ({
        ...account,
        type_name:
          account.type_name ||
          (account.type === 1 ? "حساب محاسبي" : account.type === 2 ? "زبون" : account.type === 3 ? "مورد" : "أخرى"),
        finanical_list_id:
          account.finanical_list_id === 1
            ? "الميزانية العمومية"
            : account.finanical_list_id === 2
              ? "قائمة الدخل"
              : account.finanical_list_id === 3
                ? "تقييم بضاعة"
                : "",
      })),
    [searchResults],
  )

  useEffect(() => {
    if (!open) {
      setSearchResults([])
      setSelectedAccount(null)
      setSearchFilters({
        accountNumber: "",
        accountName: "",
        financialList: "__all__",
        type: "__all__",
      })
      return
    }

    setSearchResults(accounts)
  }, [open, accounts])

  const handleSearchAccounts = () => {
    const results = accounts.filter((account) => {
      if (searchFilters.accountNumber && !account.code.includes(searchFilters.accountNumber)) {
        return false
      }
      if (searchFilters.accountName && !account.name.toLowerCase().includes(searchFilters.accountName.toLowerCase())) {
        return false
      }
      if (searchFilters.financialList !== "__all__" && String(account.finanical_list_id) !== searchFilters.financialList) {
        return false
      }
      if (searchFilters.type !== "__all__") {
        if (searchFilters.type === "1" && account.type !== 1) return false
        if (searchFilters.type === "2" && account.type !== 2) return false
        if (searchFilters.type === "3" && account.type !== 3) return false
      }
      return true
    })
    setSearchResults(results)
    setSelectedAccount(null)
  }

  const applySearchFilters = (nextFilters?: typeof searchFilters) => {
    const filters = nextFilters || searchFilters
    const results = accounts.filter((account) => {
      if (filters.accountNumber && !account.code.includes(filters.accountNumber)) {
        return false
      }
      if (filters.accountName && !account.name.toLowerCase().includes(filters.accountName.toLowerCase())) {
        return false
      }
      if (filters.financialList !== "__all__" && String(account.finanical_list_id) !== filters.financialList) {
        return false
      }
      if (filters.type !== "__all__") {
        if (filters.type === "1" && account.type !== 1) return false
        if (filters.type === "2" && account.type !== 2) return false
        if (filters.type === "3" && account.type !== 3) return false
      }
      return true
    })
    setSearchResults(results)
    setSelectedAccount(null)
  }

  const handleCodeOrNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      applySearchFilters()
    }
  }

  const handleCodeOrNameBlur = () => {
    applySearchFilters()
  }

  const handleRowDoubleClick = (account: AccountItem) => {
    if (onSelect) {
      onSelect(account)
    }
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (selectedAccount) {
      handleRowDoubleClick(selectedAccount)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="w-[96vw] max-w-6xl h-[90vh] max-h-[90vh] overflow-hidden p-3 sm:p-4" dir="rtl">
        <div className="flex h-full flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-center sm:text-right">بحث الحسابات</h2>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="mx-auto h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 sm:mx-0"
              aria-label="إغلاق"
              title="إغلاق"
            >
              ✕
            </Button>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border-b pb-3 sm:pb-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الحساب</Label>
              <Input
                value={searchFilters.accountNumber}
                onChange={(e) => setSearchFilters({ ...searchFilters, accountNumber: e.target.value })}
                placeholder="ابحث برقم الحساب"
                className="text-right"
                onKeyDown={handleCodeOrNameKeyDown}
                onBlur={handleCodeOrNameBlur}
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">الاسم</Label>
              <Input
                value={searchFilters.accountName}
                onChange={(e) => setSearchFilters({ ...searchFilters, accountName: e.target.value })}
                placeholder="ابحث باسم الحساب"
                className="text-right"
                onKeyDown={handleCodeOrNameKeyDown}
                onBlur={handleCodeOrNameBlur}
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">القائمة المالية</Label>
              <PrimeDropdown
                value={searchFilters.financialList}
                options={[
                  { label: "الكل", value: "__all__" },
                  { label: "الميزانية العمومية", value: "1" },
                  { label: "قائمة الدخل", value: "2" },
                  { label: "تقييم بضاعة", value: "3" },
                ]}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر القائمة المالية"
                className="w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                onChange={(e: any) => {
                  const nextFilters = { ...searchFilters, financialList: e.value }
                  setSearchFilters(nextFilters)
                  applySearchFilters(nextFilters)
                }}
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">النوع</Label>
              <PrimeDropdown
                value={searchFilters.type}
                options={[
                  { label: "الكل", value: "__all__" },
                  { label: "حساب محاسبي", value: "1" },
                  { label: "زبون", value: "2" },
                  { label: "مورد", value: "3" },
                ]}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر النوع"
                className="w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                onChange={(e: any) => {
                  const nextFilters = { ...searchFilters, type: e.value }
                  setSearchFilters(nextFilters)
                  applySearchFilters(nextFilters)
                }}
              />
            </div>
          </div>

          <Button onClick={handleSearchAccounts} size="sm" className="search-button w-full sm:w-fit px-4">
            بحث
          </Button>

          <div className="rounded-lg border overflow-hidden" style={{ height: '760px' }}>
            {searchResults.length > 0 ? (
              <DataGridView
                innerRef={gridRef}
                containerStyle={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                style={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                defaultRowHeight={50}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={gridDataSource}
                scheme={accountScheme}
                onRowClick={(account: AccountItem) => setSelectedAccount(account)}
                onRowDoubleClick={handleRowDoubleClick}
              />
            ) : (
              <div className="flex h-full min-h-[580px] items-center justify-center bg-slate-50 text-slate-500 text-sm">
                لا توجد نتائج. قم بالبحث لعرض النتائج
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 border-t pt-4">
            <Button onClick={handleConfirm} disabled={!selectedAccount} className="search-button">
              موافق
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
