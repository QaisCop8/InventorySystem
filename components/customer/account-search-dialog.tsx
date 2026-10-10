"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Search, Wallet, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import PrimeDropdown from "@/components/common/FocusDropdown"
import {
  SearchDialogHeader,
  SearchFilterField,
  SearchResultsTable,
  searchInputClassName,
  useEnterAsTabFilters,
  type SearchColumn,
  type SearchResultsTableHandle,
} from "@/components/common/search-dialog-kit"
import { useWorkspaceDialog } from "@/contexts/workspace-dialog-context"

// كل كلمة في نص البحث يجب أن تكون موجودة في النص الهدف (بأي ترتيب) — وليس تطابق سلسلة متتالية
// فقط، فيجد "احمد علي" نتيجة عند البحث "علي احمد" أيضاً.
const normalizeSearchText = (value: string): string =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLocaleLowerCase("ar")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const searchWordsMatch = (text: string, searchQuery: string): boolean => {
  const words = normalizeSearchText(searchQuery).split(/\s+/).filter(Boolean)
  const normalizedText = normalizeSearchText(text)
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
  has_deliveries?: boolean
  has_orders?: boolean
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
  showDeliveryOnlyFilter?: boolean
  lockDeliveryOnlyFilter?: boolean
  deliveryVchTypes?: number[]
  showOrderOnlyFilter?: boolean
  lockOrderOnlyFilter?: boolean
  orderType?: number | null
  branchId?: number | null
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
  showDeliveryOnlyFilter = false,
  lockDeliveryOnlyFilter = false,
  deliveryVchTypes = [],
  showOrderOnlyFilter = false,
  lockOrderOnlyFilter = false,
  orderType = null,
  branchId = null,
}: AccountSearchDialogProps) {
  const { confined } = useWorkspaceDialog()
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
    deliveryOnly: Boolean(showDeliveryOnlyFilter),
    orderOnly: Boolean(showOrderOnlyFilter),
  })
  const resultsRef = useRef<SearchResultsTableHandle | null>(null)
  const filterContainerRef = useRef<HTMLDivElement | null>(null)
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
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    if (!open) return
    const refreshAfterReturn = () => setRefreshVersion((value) => value + 1)
    window.addEventListener("focus", refreshAfterReturn)
    return () => window.removeEventListener("focus", refreshAfterReturn)
  }, [open])

  useEffect(() => {
    if (!open) {
      setSearchResults([])
      setAllAccounts([])
      setCurrencies([])
      setSelectedAccount(null)
      setSearchFilters({
        accountNumber: "",
        accountName: "",
        financialList: "__all__",
        type: defaultTypeValue,
        currency: "__all__",
        deliveryOnly: Boolean(showDeliveryOnlyFilter),
        orderOnly: Boolean(showOrderOnlyFilter),
      })
      return
    }

    const loadFreshAccounts = async () => {
      setLoading(true)
      try {
        const url = new URL(API_URL, window.location.origin)
        if (deliveryVchTypes.length > 0) {
          url.searchParams.set("delivery_vch_types", deliveryVchTypes.join(","))
        }
        if (orderType != null) {
          url.searchParams.set("order_type", String(orderType))
        }
        if (Number(branchId) > 0) {
          url.searchParams.set("branch_id", String(branchId))
        }
        const response = await fetch(url.toString())
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
          has_orders: Boolean((account as any).has_orders),
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
        // Closing the dialog already resets filters. While it remains open,
        // refreshes (including window-focus refreshes) must preserve what the
        // user checked or unchecked instead of restoring the default-only flag.
        applySearchFilters(searchFilters, nextAccounts)
      } finally {
        setLoading(false)
      }
    }

    void loadFreshAccounts()
  }, [open, defaultTypeValue, allowedTypeValuesKey, deliveryVchTypes.join(","), orderType, branchId, showOrderOnlyFilter, showDeliveryOnlyFilter, refreshVersion])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    fetch(CURRENCIES_API_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return
        const rates = Array.isArray(data?.rates) ? data.rates : []
        setCurrencies(
          rates.map((currency: any) => ({
            currency_id: Number(currency.currency_id ?? currency.id),
            currency_name: currency.currency_name ?? currency.name,
            currency_code: currency.currency_code ?? currency.code,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setCurrencies([])
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (!window.matchMedia("(max-width: 639px)").matches) accountNameInputRef.current?.focus()
    }, 120)
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

  const matchesDeliveryFilter = (account: AccountItem, deliveryOnly: boolean) => {
    if (!deliveryOnly) return true
    return Boolean(account.has_deliveries)
  }

  const matchesOrderFilter = (account: AccountItem, orderOnly: boolean) => {
    if (!orderOnly) return true
    return Boolean(account.has_orders)
  }

  const handleSearchAccounts = () => {
    const results = visibleAccounts.filter((account) => {
      if (searchFilters.accountNumber && !account.code.includes(searchFilters.accountNumber)) {
        return false
      }
      if (searchFilters.accountName && !searchWordsMatch(`${account.name} ${account.name_lang2 || ""}`, searchFilters.accountName)) {
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
      if (!matchesDeliveryFilter(account, searchFilters.deliveryOnly)) {
        return false
      }
      if (!matchesOrderFilter(account, searchFilters.orderOnly)) {
        return false
      }
      return true
    })
    setSearchResults(results)
    setSelectedAccount(null)
  }


  const applySearchFilters = (nextFilters?: typeof searchFilters, sourceAccounts?: AccountItem[]) => {
    const filters = nextFilters || searchFilters
    // Always start again from the complete API result. Re-filtering a derived
    // list can leave the dialog empty after an "only" checkbox is cleared,
    // because accounts excluded by the previous filter are no longer present.
    const list = sourceAccounts || allAccounts
    const results = list.filter((account) => {
      if (filters.accountNumber && !account.code.includes(filters.accountNumber)) {
        return false
      }
      if (filters.accountName && !searchWordsMatch(`${account.name} ${account.name_lang2 || ""}`, filters.accountName)) {
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
      if (!matchesDeliveryFilter(account, filters.deliveryOnly)) {
        return false
      }
      if (!matchesOrderFilter(account, filters.orderOnly)) {
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

  // آخر فلتر (Enter) أو السهم للأسفل من أي فلتر ⇐ أول سطر في جدول النتائج
  const focusGridFirstRow = () => {
    resultsRef.current?.focusFirstRow()
  }

  useEnterAsTabFilters(open, filterContainerRef, focusGridFirstRow)

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

  const dropdownStyle = { height: "36px", minHeight: "36px", borderRadius: "8px", backgroundColor: "#fff" }

  const MAX_VISIBLE_RESULTS = 500
  const visibleRows = useMemo(
    () => (gridDataSource.length > MAX_VISIBLE_RESULTS ? gridDataSource.slice(0, MAX_VISIBLE_RESULTS) : gridDataSource),
    [gridDataSource],
  )

  const resultColumns: SearchColumn<(typeof gridDataSource)[number]>[] = [
    { key: "code", header: "رقم الحساب", width: "140px", className: "font-mono text-xs text-slate-600" },
    { key: "name", header: "اسم الحساب", className: "max-w-[380px] truncate font-semibold text-slate-800" },
    {
      key: "type_name",
      header: "النوع",
      width: "120px",
      render: (account) => (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{account.type_name}</span>
      ),
    },
    { key: "finanical_list_id", header: "القائمة المالية", width: "140px", className: "text-xs text-slate-500" },
    { key: "currency_label", header: "العملة", width: "80px", align: "center", className: "text-xs font-bold text-slate-600" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={confined
          ? "h-[min(720px,calc(100%-1.5rem))] max-h-[calc(100%-1.5rem)] w-[min(1000px,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-2xl ring-1 ring-slate-900/10"
          : "h-[100dvh] max-h-[100dvh] w-full max-w-full gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0 shadow-2xl sm:h-[min(80dvh,720px)] sm:max-w-[1000px] sm:rounded-2xl sm:ring-1 sm:ring-slate-900/10"}
        dir="rtl"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex h-full min-h-0 flex-col">
          <SearchDialogHeader
            icon={<Wallet className="h-4 w-4" />}
            title="دليل الحسابات"
            subtitle="Enter للتنقل بين الفلاتر ثم للنتائج • ↑↓ للتنقل • Enter للاختيار"
            count={searchResults.length}
            onClose={() => onOpenChange(false)}
            actions={
              <Button
                type="button"
                onClick={() => window.open("/admin/accounts?new=1", "_blank", "noopener,noreferrer")}
                className="h-8 gap-1.5 rounded-lg bg-white px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">إضافة حساب</span>
              </Button>
            }
          />

          {/* الفلاتر */}
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
              <div ref={filterContainerRef} className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1.6fr_1fr_1fr_0.8fr]">
                <SearchFilterField label="رقم الحساب">
                  <Input
                    value={searchFilters.accountNumber}
                    onChange={(e) => {
                      const nextFilters = { ...searchFilters, accountNumber: e.target.value }
                      setSearchFilters(nextFilters)
                      applySearchFilters(nextFilters)
                    }}
                    placeholder="رقم الحساب"
                    className={searchInputClassName}
                    onBlur={handleCodeOrNameBlur}
                  />
                </SearchFilterField>
                <SearchFilterField label="الاسم" className="col-span-2 sm:col-span-1">
                  <Input
                    ref={accountNameInputRef}
                    value={searchFilters.accountName}
                    onChange={(e) => {
                      const nextFilters = { ...searchFilters, accountName: e.target.value }
                      setSearchFilters(nextFilters)
                      applySearchFilters(nextFilters)
                    }}
                    placeholder="يمكن كتابة أكثر من كلمة"
                    className={searchInputClassName}
                    onBlur={handleCodeOrNameBlur}
                  />
                </SearchFilterField>
                {showFinancialListFilter ? (
                  <SearchFilterField label="القائمة المالية" className="invoice-currency-dropdown-wrap">
                    <PrimeDropdown
                      value={searchFilters.financialList}
                      options={financialListOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر القائمة المالية"
                      className="invoice-currency-dropdown w-full"
                      valueTemplate={(option) => <div className="w-full text-right">{option?.label ?? "اختر القائمة المالية"}</div>}
                      style={dropdownStyle}
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => {
                        const nextFilters = { ...searchFilters, financialList: e.value }
                        setSearchFilters(nextFilters)
                        applySearchFilters(nextFilters)
                      }}
                    />
                  </SearchFilterField>
                ) : null}
                {showTypeFilter ? (
                  <SearchFilterField label="النوع" className="invoice-currency-dropdown-wrap">
                    <PrimeDropdown
                      value={searchFilters.type}
                      options={typeOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر النوع"
                      className="invoice-currency-dropdown w-full"
                      valueTemplate={(option) => <div className="w-full text-right">{option?.label ?? "اختر النوع"}</div>}
                      style={dropdownStyle}
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => {
                        const nextFilters = { ...searchFilters, type: e.value }
                        setSearchFilters(nextFilters)
                        applySearchFilters(nextFilters)
                      }}
                    />
                  </SearchFilterField>
                ) : null}
                <SearchFilterField label="العملة" className="invoice-currency-dropdown-wrap" data-filter-field="currency">
                  <PrimeDropdown
                    value={searchFilters.currency}
                    options={currencyOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر العملة"
                    className="invoice-currency-dropdown w-full"
                    valueTemplate={(option) => <div className="w-full text-right">{option?.label ?? "اختر العملة"}</div>}
                    style={dropdownStyle}
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => {
                      const nextFilters = { ...searchFilters, currency: e.value }
                      setSearchFilters(nextFilters)
                      applySearchFilters(nextFilters)
                    }}
                  />
                </SearchFilterField>
              </div>
              <Button
                type="button"
                onClick={() => {
                  handleSearchAccounts()
                  // بعد رسم النتائج الجديدة ⇐ أول سطر
                  window.requestAnimationFrame(() => window.requestAnimationFrame(focusGridFirstRow))
                }}
                className="h-9 shrink-0 gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Search className="h-3.5 w-3.5" />
                بحث
              </Button>
            </div>
            {(showDeliveryOnlyFilter || showOrderOnlyFilter) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {showDeliveryOnlyFilter ? (
                  <label htmlFor="deliveryOnly" className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      id="deliveryOnly"
                      type="checkbox"
                      checked={searchFilters.deliveryOnly}
                      disabled={lockDeliveryOnlyFilter}
                      onChange={(e) => {
                        const nextFilters = {
                          ...searchFilters,
                          deliveryOnly: e.target.checked,
                          // الفلتران بديلان — اشتراطهما معاً قد يُخفي كل العملاء
                          orderOnly: e.target.checked ? false : searchFilters.orderOnly,
                        }
                        setSearchFilters(nextFilters)
                        applySearchFilters(nextFilters)
                        setRefreshVersion((value) => value + 1)
                      }}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    إظهار العملاء الذين لديهم ارساليات فقط
                  </label>
                ) : null}
                {showOrderOnlyFilter ? (
                  <label htmlFor="orderOnly" className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      id="orderOnly"
                      type="checkbox"
                      checked={searchFilters.orderOnly}
                      disabled={lockOrderOnlyFilter}
                      onChange={(e) => {
                        const nextFilters = {
                          ...searchFilters,
                          orderOnly: e.target.checked,
                          deliveryOnly: e.target.checked ? false : searchFilters.deliveryOnly,
                        }
                        setSearchFilters(nextFilters)
                        applySearchFilters(nextFilters)
                        setRefreshVersion((value) => value + 1)
                      }}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    إظهار العملاء الذين لديهم طلبيات فقط
                  </label>
                ) : null}
              </div>
            )}
          </div>

          {/* النتائج */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500">
              <span>نتائج البحث</span>
              <span>
                {searchResults.length > MAX_VISIBLE_RESULTS
                  ? `عرض أول ${MAX_VISIBLE_RESULTS} من ${searchResults.length.toLocaleString()} — ضيّق البحث`
                  : `${searchResults.length.toLocaleString()} حساب`}
              </span>
            </div>
            <SearchResultsTable<(typeof gridDataSource)[number]>
              ref={resultsRef}
              rows={visibleRows}
              columns={resultColumns}
              getRowKey={(account) => account.id}
              // صف العرض يحمل نصوصاً للعرض (القائمة المالية/العملة) — يُعاد دوماً الحساب الأصلي للمستدعي
              onPick={(row) => {
                const account = searchResults.find((item) => item.id === row.id)
                if (account) handleRowDoubleClick(account)
              }}
              onActiveChange={(row) => setSelectedAccount(row ? searchResults.find((item) => item.id === row.id) ?? null : null)}
              emptyText={loading ? "جاري تحميل البيانات ..." : "لا توجد نتائج مطابقة"}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
            <span className="hidden truncate text-[11px] text-slate-400 sm:block">
              {selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : "نقر مزدوج أو Enter للاختيار"}
            </span>
            <div className="flex flex-1 gap-2 sm:flex-none">
              <Button
                onClick={handleConfirm}
                disabled={!selectedAccount}
                className="h-9 flex-1 rounded-lg bg-emerald-600 px-6 font-bold text-white hover:bg-emerald-700 sm:flex-none"
              >
                موافق
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 flex-1 rounded-lg border-slate-200 px-6 text-slate-600 sm:flex-none">
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
