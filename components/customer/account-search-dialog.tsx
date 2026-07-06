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
  classification_type_id?: number | null
  classification_type_name?: string
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
  cost_centers?: any[]
  created_at?: string
  updated_at?: string
}

interface AccountSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: AccountItem[]
  onSelect: (account: AccountItem) => void
  allowedTypeValues?: number[]
  defaultTypeValue?: string
  showFinancialListFilter?: boolean
  showTypeFilter?: boolean
}

const API_URL = "/api/accounts"

const ACCOUNT_TYPE_OPTIONS = [
  { label: "حساب محاسبي", value: "1" },
  { label: "زبون", value: "2" },
  { label: "مورد", value: "3" },
]

const getAccountTypeId = (account: Pick<AccountItem, "type" | "classification_type_id">) =>
  Number(account.type ?? account.classification_type_id ?? 0)

const getFinancialListId = (account: Pick<AccountItem, "finanical_list_id"> & Record<string, any>) =>
  Number(account.finanical_list_id ?? account.financial_list_id ?? 1)

const getAccountTypeLabel = (
  account: Pick<AccountItem, "type" | "type_name" | "classification_type_id" | "classification_type_name">,
) => {
  const typeId = getAccountTypeId(account)

  if (typeId === 1) return "حساب محاسبي"
  if (typeId === 2) return "زبون"
  if (typeId === 3) return "مورد"
  return "أخرى"
}

export default function AccountSearchDialog({
  open,
  onOpenChange,
  accounts,
  onSelect,
  allowedTypeValues,
  defaultTypeValue = "__all__",
  showFinancialListFilter = true,
  showTypeFilter = true,
}: AccountSearchDialogProps) {
  const [searchResults, setSearchResults] = useState<AccountItem[]>([])
  const [allAccounts, setAllAccounts] = useState<AccountItem[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchFilters, setSearchFilters] = useState({
    accountNumber: "",
    accountName: "",
    financialList: "__all__",
    type: defaultTypeValue,
  })
  const gridRef = useRef<any>(null)

  const visibleAccounts = useMemo(() => {
    if (!allowedTypeValues || allowedTypeValues.length === 0) {
      return allAccounts
    }

    return allAccounts.filter((account) => allowedTypeValues.includes(getAccountTypeId(account)))
  }, [allAccounts, allowedTypeValues])

  const typeOptions = useMemo(() => {
    const filteredTypes = allowedTypeValues && allowedTypeValues.length > 0
      ? ACCOUNT_TYPE_OPTIONS.filter((option) => allowedTypeValues.includes(Number(option.value)))
      : ACCOUNT_TYPE_OPTIONS

    return [{ label: "الكل", value: "__all__" }, ...filteredTypes]
  }, [allowedTypeValues])

  const financialListOptions = useMemo(
    () => [
      { label: "الكل", value: "__all__" },
      { label: "الميزانية العمومية", value: "1" },
      { label: "قائمة الدخل", value: "2" },
      { label: "تقييم بضاعة", value: "3" },
    ],
    [],
  )

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
        type: getAccountTypeId(account),
        type_name: getAccountTypeLabel(account),
        finanical_list_id:
          getFinancialListId(account) === 1
            ? "الميزانية العمومية"
            : getFinancialListId(account) === 2
              ? "قائمة الدخل"
              : getFinancialListId(account) === 3
                ? "تقييم بضاعة"
                : "",
      })),
    [searchResults],
  )

  const allowedTypeValuesKey = allowedTypeValues ? allowedTypeValues.join(",") : ""

  useEffect(() => {
    if (!open) {
      setSearchResults([])
      setAllAccounts([])
      setSelectedAccount(null)
      setSearchFilters({
        accountNumber: "",
        accountName: "",
        financialList: "__all__",
        type: defaultTypeValue,
      })
      return
    }

    const nextFilters = {
      accountNumber: "",
      accountName: "",
      financialList: "__all__",
      type: defaultTypeValue,
    }

    const loadFreshAccounts = async () => {
      setLoading(true)
      try {
        const response = await fetch(API_URL)
        if (!response.ok) return

        const data = await response.json()
        const nextAccounts = (Array.isArray(data) ? data : []).map((account: AccountItem) => ({
          ...account,
          id: Number(account.id),
          code: String((account as any).code || (account as any).account_code || ""),
          name: String((account as any).name || (account as any).account_name || ""),
          father_id:
            (account as any).father_id != null
              ? Number((account as any).father_id)
              : (account as any).parent_account_id != null
                ? Number((account as any).parent_account_id)
                : null,
          type:
            account.type != null
              ? Number(account.type)
              : (account as any).classification_type_id != null
                ? Number((account as any).classification_type_id)
                : null,
          type_name: account.type_name || (account as any).classification_type_name || undefined,
          finanical_list_id: Number(account.finanical_list_id ?? (account as any).financial_list_id ?? 1),
        }))

        setAllAccounts(nextAccounts)
        setSearchFilters(nextFilters)
        applySearchFilters(nextFilters, nextAccounts)
      } finally {
        setLoading(false)
      }
    }

    void loadFreshAccounts()
  }, [open, defaultTypeValue, allowedTypeValuesKey])

  const matchesTypeFilter = (account: AccountItem, filterValue: string) => {
    if (filterValue === "__all__") {
      if (allowedTypeValues && allowedTypeValues.length > 0) {
        return allowedTypeValues.includes(getAccountTypeId(account))
      }
      return true
    }

    const typeFilter = Number(filterValue)
    return getAccountTypeId(account) === typeFilter
  }

  const handleSearchAccounts = () => {
    const results = visibleAccounts.filter((account) => {
      if (searchFilters.accountNumber && !account.code.includes(searchFilters.accountNumber)) {
        return false
      }
      if (searchFilters.accountName && !account.name.toLowerCase().includes(searchFilters.accountName.toLowerCase())) {
        return false
      }
      if (searchFilters.financialList !== "__all__" && String(getFinancialListId(account)) !== searchFilters.financialList) {
        return false
      }
      if (!matchesTypeFilter(account, searchFilters.type)) {
        return false
      }
      return true
    })
    setSearchResults(results)
    setSelectedAccount(null)
  }

  const applySearchFilters = (nextFilters?: typeof searchFilters, sourceAccounts?: AccountItem[]) => {
    const filters = nextFilters || searchFilters
    const list = sourceAccounts || visibleAccounts
    const results = list.filter((account) => {
      if (filters.accountNumber && !account.code.includes(filters.accountNumber)) {
        return false
      }
      if (filters.accountName && !account.name.toLowerCase().includes(filters.accountName.toLowerCase())) {
        return false
      }
      if (filters.financialList !== "__all__" && String(getFinancialListId(account)) !== filters.financialList) {
        return false
      }
      if (!matchesTypeFilter(account, filters.type)) {
        return false
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

  const filterGridClassName = showFinancialListFilter
    ? "grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 border-b border-slate-200 pb-3 sm:pb-4"
    : "grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border-b border-slate-200 pb-3 sm:pb-4"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="w-[94vw] max-w-6xl h-auto max-h-[76vh] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4" dir="rtl">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 text-center sm:text-right">بحث الحسابات</h2>
            </div>
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

          <div className={filterGridClassName}>
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الحساب</Label>
              <Input
                value={searchFilters.accountNumber}
                onChange={(e) => setSearchFilters({ ...searchFilters, accountNumber: e.target.value })}
                placeholder="ابحث برقم الحساب"
                className="h-10 rounded-xl border border-slate-200 bg-white text-right shadow-sm focus:border-blue-300 focus:bg-white"
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
                className="h-10 rounded-xl border border-slate-200 bg-white text-right shadow-sm focus:border-blue-300 focus:bg-white"
                onKeyDown={handleCodeOrNameKeyDown}
                onBlur={handleCodeOrNameBlur}
              />
            </div>
            {showFinancialListFilter ? (
              <div>
                <Label className="mb-2 block text-sm font-medium">القائمة المالية</Label>
                <PrimeDropdown
                  value={searchFilters.financialList}
                  options={financialListOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="اختر القائمة المالية"
                  className="invoice-currency-dropdown w-full"
                  valueTemplate={(option) => (
                    <div className="text-right w-full">{option?.label ?? "اختر القائمة المالية"}</div>
                  )}
                  style={{ minHeight: "40px", borderRadius: "14px", backgroundColor: "#fff" }}
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => {
                    const nextFilters = { ...searchFilters, financialList: e.value }
                    setSearchFilters(nextFilters)
                    applySearchFilters(nextFilters)
                  }}
                />
              </div>
            ) : null}
            {showTypeFilter ? (
              <div>
                <Label className="mb-2 block text-sm font-medium">النوع</Label>
                <PrimeDropdown
                  value={searchFilters.type}
                  options={typeOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="اختر النوع"
                  className="invoice-currency-dropdown w-full"
                  valueTemplate={(option) => (
                    <div className="text-right w-full">{option?.label ?? "اختر النوع"}</div>
                  )}
                  style={{ height: "40px", borderRadius: "14px", backgroundColor: "#fff" }}
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => {
                    const nextFilters = { ...searchFilters, type: e.value }
                    setSearchFilters(nextFilters)
                    applySearchFilters(nextFilters)
                  }}
                />
              </div>
            ) : null}
            <div className="flex items-end">
              <Button onClick={handleSearchAccounts} size="sm" className="w-full rounded-xl border-0 bg-emerald-600 px-4 text-white shadow-md hover:bg-emerald-700">
                بحث
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{ height: '460px' }}>
            {searchResults.length > 0 ? (
              <DataGridView
                innerRef={gridRef}
                containerStyle={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                style={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                defaultRowHeight={42}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={gridDataSource}
                scheme={accountScheme}
                onRowClick={(account: AccountItem) => setSelectedAccount(account)}
                onRowDoubleClick={handleRowDoubleClick}
              />
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-500 text-sm">
                {loading ? "جاري تحميل البيانات ..." : "لا توجد نتائج. قم بالبحث لعرض النتائج"}
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 border-t border-slate-200 pt-4">
            <Button onClick={handleConfirm} disabled={!selectedAccount} className="search-button shadow-sm">
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
