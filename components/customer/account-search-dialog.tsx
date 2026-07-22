"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Search, X, Wallet, ListFilter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import { CellRange } from "@grapecity/wijmo.grid"
import DataGridView from "../common/DataGridView"

// كل كلمة في نص البحث يجب أن تكون موجودة في النص الهدف (بأي ترتيب) — وليس تطابق سلسلة متتالية
// فقط، فيجد "احمد علي" نتيجة عند البحث "علي احمد" أيضاً.
const searchWordsMatch = (text: string, searchQuery: string): boolean => {
  const words = searchQuery.trim().toLowerCase().split(/\s+/)
  const normalizedText = text.toLowerCase()
  return words.every((word) => normalizedText.includes(word))
}

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

interface CurrencyOption {
  currency_id: number
  currency_name?: string
  currency_code?: string
}

const API_URL = "/api/accounts"
const CURRENCIES_API_URL = "/api/exchange-rates"

const ACCOUNT_TYPE_OPTIONS = [
  { label: "حساب محاسبي", value: "1" },
  { label: "عميل", value: "2" },
  { label: "مورد", value: "3" },
  { label: "مندوب", value: "4" },
  { label: "مشترك", value: "5" },
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
  if (typeId === 2) return "عميل"
  if (typeId === 3) return "مورد"
  if (typeId === 4) return "مندوب"
  if (typeId === 5) return "مشترك"
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
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchFilters, setSearchFilters] = useState({
    accountNumber: "",
    accountName: "",
    financialList: "__all__",
    type: defaultTypeValue,
    currency: "__all__",
  })
  const gridRef = useRef<any>(null)
  const accountNameInputRef = useRef<HTMLInputElement | null>(null)

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

  const currencyOptions = useMemo(
    () => [
      { label: "الكل", value: "__all__" },
      ...currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: String(c.currency_id),
      })),
    ],
    [currencies],
  )

  const currencyLabelById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of currencies) {
      map.set(Number(c.currency_id), c.currency_code || c.currency_name || "")
    }
    return map
  }, [currencies])

  const accountScheme = useMemo(
    () => ({
      name: "AccountSearchScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 180, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: "*", minWidth: 320, isReadOnly: true },
        { header: "النوع", name: "type_name", width: 200, isReadOnly: true },
        { header: "القائمة المالية", name: "finanical_list_id", width: 220, isReadOnly: true },
        { header: "العملة", name: "currency_label", width: 140, isReadOnly: true },
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
        currency_label: account.currency_id ? currencyLabelById.get(Number(account.currency_id)) || "" : "",
      })),
    [searchResults, currencyLabelById],
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
        currency: "__all__",
      })
      return
    }

    const nextFilters = {
      accountNumber: "",
      accountName: "",
      financialList: "__all__",
      type: defaultTypeValue,
      currency: "__all__",
    }

    fetch(CURRENCIES_API_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCurrencies(Array.isArray(data?.rates) ? data.rates : []))
      .catch(() => setCurrencies([]))

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

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => accountNameInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

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

  const matchesCurrencyFilter = (account: AccountItem, filterValue: string) => {
    if (filterValue === "__all__") return true
    return Number(account.currency_id ?? 0) === Number(filterValue)
  }

  const handleSearchAccounts = () => {
    const results = visibleAccounts.filter((account) => {
      if (searchFilters.accountNumber && !account.code.includes(searchFilters.accountNumber)) {
        return false
      }
      if (searchFilters.accountName && !searchWordsMatch(account.name, searchFilters.accountName)) {
        return false
      }
      if (searchFilters.financialList !== "__all__" && String(getFinancialListId(account)) !== searchFilters.financialList) {
        return false
      }
      if (!matchesTypeFilter(account, searchFilters.type)) {
        return false
      }
      if (!matchesCurrencyFilter(account, searchFilters.currency)) {
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
      if (filters.accountName && !searchWordsMatch(account.name, filters.accountName)) {
        return false
      }
      if (filters.financialList !== "__all__" && String(getFinancialListId(account)) !== filters.financialList) {
        return false
      }
      if (!matchesTypeFilter(account, filters.type)) {
        return false
      }
      if (!matchesCurrencyFilter(account, filters.currency)) {
        return false
      }
      return true
    })
    setSearchResults(results)
    setSelectedAccount(null)
  }

  const handleCodeOrNameBlur = () => {
    applySearchFilters()
  }

  const focusGridFirstRow = () => {
    const grid = gridRef.current
    if (!grid || !grid.columns || !grid.rows || grid.rows.length === 0) return
    grid.select(new CellRange(0, 0))
    grid.focus()
  }

  // Enter يتصرف كـ Tab عبر كل حقول الفلترة (بدل تشغيل البحث كما كان سابقاً)، وسهم لأسفل من أي
  // حقل فلترة ينتقل مباشرة لأول سطر في الشبكة. عندما تكون قائمة Prime Dropdown مفتوحة فعلياً
  // (تصفّح بالأسهم بين الخيارات) لا نتدخل إطلاقاً ونترك السلوك الافتراضي للمكوّن كما هو.
  const handleFilterKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest(".p-dropdown-panel")) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      event.stopPropagation()
      focusGridFirstRow()
      return
    }

    if (event.key !== "Enter") return

    // العملة هو آخر حقل قبل زر البحث/الشبكة — Enter عليه ينتقل مباشرة لأول سطر في النتائج.
    if (target.closest('[data-filter-field="currency"]')) {
      event.preventDefault()
      event.stopPropagation()
      focusGridFirstRow()
      return
    }

    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null)
    const currentIndex = focusable.indexOf(target)
    if (currentIndex === -1) return
    event.preventDefault()
    event.stopPropagation()
    focusable[currentIndex + 1]?.focus()
  }

  // Enter والتركيز داخل الشبكة يختار السطر الحالي تماماً كما لو ضُغط زر "موافق" (بدل الاضطرار
  // لنقر مزدوج بالماوس).
  const handleGridKeyDown = (grid: any, e: KeyboardEvent) => {
    if (e.key !== "Enter") return
    const row = grid?.selection?.row
    if (row == null || row < 0) return
    const item = grid.rows[row]?.dataItem
    if (!item) return
    e.preventDefault()
    handleRowDoubleClick(item)
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

  // Tailwind's JIT scanner needs each grid-cols-N class to appear literally in the source (a
  // template-literal interpolation like `xl:grid-cols-${n}` would never be generated), hence
  // this fixed lookup instead of computing the class name dynamically.
  const extraFilterCount = (showFinancialListFilter ? 1 : 0) + (showTypeFilter ? 1 : 0)
  const filterGridColsClass =
    { 0: "xl:grid-cols-4", 1: "xl:grid-cols-5", 2: "xl:grid-cols-6" }[extraFilterCount] ?? "xl:grid-cols-6"
  const filterGridClassName = `grid gap-3 grid-cols-1 sm:grid-cols-2 ${filterGridColsClass} border-b border-slate-200/80 pb-4 sm:pb-5`

  const dropdownStyle = { height: "42px", borderRadius: "12px", backgroundColor: "#fff" }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="w-[96vw] max-w-[1500px] h-auto max-h-[80vh] overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl backdrop-blur sm:p-0"
        dir="rtl"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-4 py-4 shadow-lg sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                <Search className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">بحث الحسابات</h2>
            </div>
            <div className="flex items-center gap-2">
              {searchResults.length > 0 && (
                <span className="hidden rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30 sm:inline-block">
                  {searchResults.length} نتيجة
                </span>
              )}
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 w-9 shrink-0 rounded-full bg-white/15 p-0 text-white hover:bg-white/25 hover:text-white"
                aria-label="إغلاق"
                title="إغلاق"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
              <ListFilter className="h-3.5 w-3.5" />
              خيارات البحث
            </div>
            <div className={filterGridClassName} onKeyDown={handleFilterKeyDown}>
              <div>
                <Label className="mb-1.5 block text-sm font-medium text-slate-600">رقم الحساب</Label>
                <Input
                  value={searchFilters.accountNumber}
                  onChange={(e) => setSearchFilters({ ...searchFilters, accountNumber: e.target.value })}
                  placeholder="ابحث برقم الحساب"
                  className="h-[42px] rounded-xl border-slate-200 bg-white text-right shadow-sm transition-colors focus-visible:border-blue-400 focus-visible:ring-blue-100"
                  onBlur={handleCodeOrNameBlur}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm font-medium text-slate-600">الاسم</Label>
                <Input
                  ref={accountNameInputRef}
                  value={searchFilters.accountName}
                  onChange={(e) => setSearchFilters({ ...searchFilters, accountName: e.target.value })}
                  placeholder="ابحث باسم الحساب (يمكن كتابة أكثر من كلمة)"
                  className="h-[42px] rounded-xl border-slate-200 bg-white text-right shadow-sm transition-colors focus-visible:border-blue-400 focus-visible:ring-blue-100"
                  onBlur={handleCodeOrNameBlur}
                />
              </div>
              {showFinancialListFilter ? (
                <div>
                  <Label className="mb-1.5 block text-sm font-medium text-slate-600">القائمة المالية</Label>
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
                    style={dropdownStyle}
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
                  <Label className="mb-1.5 block text-sm font-medium text-slate-600">النوع</Label>
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
                    style={dropdownStyle}
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
              <div data-filter-field="currency">
                <Label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-600">
                  <Wallet className="h-3.5 w-3.5" />
                  العملة
                </Label>
                <PrimeDropdown
                  value={searchFilters.currency}
                  options={currencyOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="اختر العملة"
                  className="invoice-currency-dropdown w-full"
                  valueTemplate={(option) => <div className="text-right w-full">{option?.label ?? "اختر العملة"}</div>}
                  style={dropdownStyle}
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => {
                    const nextFilters = { ...searchFilters, currency: e.value }
                    setSearchFilters(nextFilters)
                    applySearchFilters(nextFilters)
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleSearchAccounts}
                  className="flex h-[42px] w-full items-center gap-2 rounded-xl border-0 bg-gradient-to-l from-emerald-600 to-emerald-500 px-4 text-white shadow-md transition-transform hover:scale-[1.01] hover:from-emerald-700 hover:to-emerald-600"
                >
                  <Search className="h-4 w-4" />
                  بحث
                </Button>
              </div>
            </div>
          </div>

          {/* Results grid */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ height: "440px" }}>
            {searchResults.length > 0 ? (
              <DataGridView
                innerRef={gridRef}
                containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                defaultRowHeight={42}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={gridDataSource}
                scheme={accountScheme}
                onRowClick={(account: AccountItem) => setSelectedAccount(account)}
                onRowDoubleClick={handleRowDoubleClick}
                onKeyDown={handleGridKeyDown}
              />
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-2 bg-gradient-to-b from-slate-50 to-white text-slate-400">
                <Search className="h-8 w-8 text-slate-300" />
                <span className="text-sm text-slate-500">
                  {loading ? "جاري تحميل البيانات ..." : "لا توجد نتائج. قم بالبحث لعرض النتائج"}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-center gap-3 border-t border-slate-200 pt-4">
            <Button
              onClick={handleConfirm}
              disabled={!selectedAccount}
              className="rounded-xl border-0 bg-gradient-to-l from-emerald-600 to-emerald-500 px-8 text-white shadow-md transition-transform hover:scale-[1.01] hover:from-emerald-700 hover:to-emerald-600"
            >
              موافق
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-emerald-200 px-8 text-emerald-700 shadow-sm hover:bg-emerald-50 hover:text-emerald-800"
            >
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
