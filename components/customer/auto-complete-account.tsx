"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, X, CircleDollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { AccountItem } from "@/components/customer/account-search-dialog"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"

const accountApiUrl = "/api/accounts"

interface AutoCompleteAccountProps {
  value: string
  onValueChange: (value: string) => void
  onAccountSelect?: (account: AccountItem | null) => void
  valueMode?: "code" | "id"
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  showCostCenterButton?: boolean
  costCenterButtonDisabled?: boolean
  showCostCenterDialog?: boolean
  costCenters?: JournalCostCenterSelection[]
  onCostCentersChange?: (value: JournalCostCenterSelection[]) => void
  leafOnly?: boolean
  displayNameFirst?: boolean
  showSearchButton?: boolean
  showClearButton?: boolean
  requiredTypeValues?: number[]
  searchAllowedTypeValues?: number[]
  searchDefaultTypeValue?: string
  showFinancialListFilter?: boolean
  showTypeFilter?: boolean
  displayIdOnly?: boolean
}

const normalizeAccountCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)

const formatAccountLabel = (account: AccountItem, displayNameFirst = false, displayIdOnly = false) =>
  displayIdOnly
    ? String(account.id)
    : displayNameFirst
      ? `${account.name} / ${account.code}`
      : `${account.code} - ${account.name}`
const isLeafAccount = (account: AccountItem, allAccounts: AccountItem[]) =>
  !allAccounts.some((candidate) => Number(candidate.father_id ?? 0) === Number(account.id))

const mapAccount = (item: any): AccountItem => ({
  id: Number(item.id),
  code: String(item.code || item.account_code || ""),
  name: String(item.name || item.account_name || ""),
  name_lang2: item.name_lang2 ?? null,
  type: item.type != null ? Number(item.type) : item.classification_type_id != null ? Number(item.classification_type_id) : null,
  type_name: item.type_name || item.classification_type_name || undefined,
  father_id:
    item.father_id != null
      ? Number(item.father_id)
      : item.parent_account_id != null
        ? Number(item.parent_account_id)
        : null,
  father_name: item.father_name || item.parent_account_name || undefined,
  level_no: Number(item.level_no || 1),
  finanical_list_id: Number(item.finanical_list_id || 1),
  finanical_list_assests_id: item.finanical_list_assests_id != null ? Number(item.finanical_list_assests_id) : null,
  finanical_list_liabilities_id: item.finanical_list_liabilities_id != null ? Number(item.finanical_list_liabilities_id) : null,
  finanical_list_income_id: item.finanical_list_income_id != null ? Number(item.finanical_list_income_id) : null,
  currency_id: item.currency_id != null ? Number(item.currency_id) : null,
  currency_code: item.currency_code || undefined,
  allow_trans_with_diff_curr: Number(item.allow_trans_with_diff_curr || 0),
  iscalc_curr_diff_rates: Boolean(item.iscalc_curr_diff_rates),
  transaction_type: Number(item.transaction_type || 0),
  transaction_type_action: Number(item.transaction_type_action || 0),
  max_transaction_amount: Number(item.max_transaction_amount || 0),
  max_transaction_amount_action: Number(item.max_transaction_amount_action || 0),
  max_balance_amount: Number(item.max_balance_amount || 0),
  max_balance_action: item.max_balance_action != null ? Number(item.max_balance_action) : null,
  budget_exceeding_perc: item.budget_exceeding_perc != null ? Number(item.budget_exceeding_perc) : null,
  budget_exceeding_action: item.budget_exceeding_action != null ? Number(item.budget_exceeding_action) : null,
  unified_report_account_no: item.unified_report_account_no || null,
  unified_report_group_code: item.unified_report_group_code || null,
  notes: item.notes || null,
  show_notes_in_transactions_soa: Boolean(item.show_notes_in_transactions_soa),
  status: item.status || "نشط",
  cost_centers: Array.isArray(item.cost_centers) ? item.cost_centers : [],
  created_at: item.created_at || undefined,
  updated_at: item.updated_at || undefined,
})

export default function AutoCompleteAccount({
  value,
  onValueChange,
  onAccountSelect,
  valueMode = "code",
  label = "الحساب",
  placeholder = "أدخل كود الحساب",
  disabled = false,
  className = "",
  inputClassName = "",
  showCostCenterButton = true,
  costCenterButtonDisabled = false,
  showCostCenterDialog = true,
  costCenters,
  onCostCentersChange,
  leafOnly = false,
  displayNameFirst = false,
  showSearchButton = true,
  showClearButton = true,
  requiredTypeValues,
  searchAllowedTypeValues,
  searchDefaultTypeValue,
  showFinancialListFilter,
  showTypeFilter = true,
  displayIdOnly = false,
}: AutoCompleteAccountProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [costCentersOpen, setCostCentersOpen] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const onValueChangeRef = useRef(onValueChange)

  const normalizedValue = useMemo(() => (valueMode === "id" ? String(value).trim() : normalizeAccountCode(value)), [value, valueMode])
  const resolvedDisplayValue = useMemo(() => {
    if (selectedAccount) return formatAccountLabel(selectedAccount, displayNameFirst, displayIdOnly)
    if (isFocused) return value
    // When using id mode, avoid showing the raw numeric id while async resolving
    if (valueMode === "id") return ""
    return value
  }, [displayIdOnly, displayNameFirst, isFocused, selectedAccount, value])

  const notifySelection = useCallback(
    (account: AccountItem | null) => {
      setSelectedAccount(account)
      onAccountSelect?.(account)
    },
    [onAccountSelect],
  )

  useEffect(() => {
    onValueChangeRef.current = onValueChange
  }, [onValueChange])

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const response = await fetch(accountApiUrl)
      if (!response.ok) {
        throw new Error(`Failed to load accounts: ${response.status}`)
      }

      const data = await response.json()
      const mappedAccounts = (Array.isArray(data) ? data : [])
        .map(mapAccount)
        .filter((account: AccountItem) => Number(account.status ?? 1) !== 3)

      const nextAccounts = leafOnly ? mappedAccounts.filter((account) => isLeafAccount(account, mappedAccounts)) : mappedAccounts

      setAccounts(nextAccounts)
      return nextAccounts
    } finally {
      setLoadingAccounts(false)
    }
  }, [leafOnly])

  const fetchAccountById = useCallback(async (numericId: number) => {
    try {
      const response = await fetch(`${accountApiUrl}/${numericId}`)
      if (!response.ok) return null
      const data = await response.json()
      return mapAccount(data)
    } catch (error) {
      console.error("Failed to fetch account by id:", error)
      return null
    }
  }, [])

  const resolveAccountByCode = useCallback(
    async (code: string) => {
      const normalizedCode = normalizeAccountCode(code)
      if (!normalizedCode) return null

      const loadedAccounts = await loadAccounts()
      return loadedAccounts.find((account) => normalizeAccountCode(account.code) === normalizedCode) || null
    },
    [loadAccounts],
  )

  const resolveAccountById = useCallback(
    async (id: string) => {
      const numericId = Number(id)
      if (!Number.isInteger(numericId) || numericId <= 0) return null

      const fetchedAccount = await fetchAccountById(numericId)
      if (fetchedAccount) return fetchedAccount

      const loadedAccounts = await loadAccounts()
      return loadedAccounts.find((account) => Number(account.id) === numericId) || null
    },
    [fetchAccountById, loadAccounts],
  )

  useEffect(() => {
    let cancelled = false

    const syncSelectedAccount = async () => {
      if (!normalizedValue) {
        setSelectedAccount(null)
        setDisplayValue("")
        return
      }

      const nextSelected =
        valueMode === "id"
          ? (await resolveAccountById(normalizedValue)) || (await resolveAccountByCode(normalizedValue))
          : await resolveAccountByCode(normalizedValue)
      if (cancelled) return

      setSelectedAccount(nextSelected)
      if (nextSelected) {
        setDisplayValue(formatAccountLabel(nextSelected, displayNameFirst, displayIdOnly))
        if (valueMode === "id" && String(nextSelected.id) !== value) {
          onValueChangeRef.current(String(nextSelected.id))
        }
      } else {
        setDisplayValue(value)
      }
    }

    void syncSelectedAccount()

    return () => {
      cancelled = true
    }
  }, [normalizedValue, resolveAccountByCode, resolveAccountById, value, valueMode])

  useEffect(() => {
    setDisplayValue(resolvedDisplayValue)
  }, [resolvedDisplayValue])

  useEffect(() => {
    void loadAccounts()
  }, [])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = valueMode === "id" ? event.target.value : normalizeAccountCode(event.target.value)
    setDisplayValue(nextValue)
    onValueChange(nextValue)
    notifySelection(null)
  }

  const handleBlur = async () => {
    setIsFocused(false)
    const normalizedInput = valueMode === "id" ? String(value).trim() : normalizeAccountCode(value)
    if (normalizedInput !== value) {
      onValueChange(normalizedInput)
    }

    if (!normalizedInput) {
      notifySelection(null)
      return
    }

    const account =
      valueMode === "id"
        ? (await resolveAccountById(normalizedInput)) || (await resolveAccountByCode(normalizedInput))
        : await resolveAccountByCode(normalizedInput)
    notifySelection(account)

    if (account) {
      onValueChange(valueMode === "id" ? String(account.id) : account.code)
      setDisplayValue(formatAccountLabel(account, displayNameFirst, displayIdOnly))
    }
  }

  const handleOpenSearch = async () => {
    await loadAccounts()
    setSearchDialogOpen(true)
  }

  const handleSelectFromSearch = (account: AccountItem) => {
    onValueChange(valueMode === "id" ? String(account.id) : normalizeAccountCode(account.code))
    notifySelection(account)
    setDisplayValue(formatAccountLabel(account, displayNameFirst, displayIdOnly))
    setSearchDialogOpen(false)
  }

  const handleClear = () => {
    onValueChange("")
    setDisplayValue("")
    notifySelection(null)
    setCostCentersOpen(false)
  }

  const handleOpenCostCenters = () => {
    if (disabled || costCenterButtonDisabled || !selectedAccount) return
    setCostCentersOpen(true)
  }

  const showSearchAction = showSearchButton
  const showCostCenterAction = showCostCenterButton && Boolean(selectedAccount || normalizedValue)
  const showClearAction = showClearButton && Boolean(selectedAccount || normalizedValue)
  const showAnyAction = showSearchAction || showCostCenterAction || showClearAction

  return (
    <div className={className} dir="rtl">
      <Label className="mb-2 block text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => {
            setIsFocused(true)
            setDisplayValue(selectedAccount ? formatAccountLabel(selectedAccount, displayNameFirst, displayIdOnly) : value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void handleBlur()
            } else if (event.key === "F10" && showSearchButton && !disabled) {
              event.preventDefault()
              void handleOpenSearch()
            }
          }}
          maxLength={8}
          placeholder={placeholder}
          className={`text-right uppercase ${inputClassName}`}
          disabled={disabled}
          autoComplete="off"
          inputMode="text"
        />
        {showAnyAction && (
          <div className="flex items-center gap-2 shrink-0">
            {showSearchAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => void handleOpenSearch()}
                disabled={disabled}
                title="بحث عن الحساب"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
            {showCostCenterAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 border-slate-200 bg-slate-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                onClick={handleOpenCostCenters}
                disabled={disabled || costCenterButtonDisabled || !selectedAccount}
                title="مراكز الكلفة"
              >
                <CircleDollarSign className="h-4 w-4" />
              </Button>
            )}
            {showClearAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 border-slate-200 bg-slate-50 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={handleClear}
                disabled={disabled}
                title="مسح"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {!showAnyAction && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-9 px-3 shrink-0"
            onClick={() => void handleOpenSearch()}
            disabled={disabled}
            title="بحث عن الحساب"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
      </div>

      <AccountSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        accounts={accounts}
        onSelect={handleSelectFromSearch}
        allowedTypeValues={requiredTypeValues ?? searchAllowedTypeValues}
        defaultTypeValue={searchDefaultTypeValue}
        showFinancialListFilter={showFinancialListFilter}
        showTypeFilter={showTypeFilter}
      />

      {showCostCenterDialog && (
        <AccountCostCenters
          open={costCentersOpen}
          onOpenChange={setCostCentersOpen}
          account={selectedAccount}
          value={costCenters}
          onChange={onCostCentersChange}
        />
      )}
    </div>
  )
}