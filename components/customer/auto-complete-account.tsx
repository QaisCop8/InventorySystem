"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { AccountItem } from "@/components/customer/account-search-dialog"

interface AutoCompleteAccountProps {
  value: string
  onValueChange: (value: string) => void
  onAccountSelect?: (account: AccountItem | null) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
}

const normalizeAccountCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)

const formatAccountLabel = (account: AccountItem) => `${account.code} - ${account.name}`

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
  created_at: item.created_at || undefined,
  updated_at: item.updated_at || undefined,
})

export default function AutoCompleteAccount({
  value,
  onValueChange,
  onAccountSelect,
  label = "الحساب",
  placeholder = "أدخل كود الحساب",
  disabled = false,
  className = "",
  inputClassName = "",
}: AutoCompleteAccountProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)

  const normalizedValue = useMemo(() => normalizeAccountCode(value), [value])
  const resolvedDisplayValue = useMemo(() => {
    if (isFocused) return value
    if (selectedAccount) return formatAccountLabel(selectedAccount)
    return value
  }, [isFocused, selectedAccount, value])

  const notifySelection = useCallback(
    (account: AccountItem | null) => {
      setSelectedAccount(account)
      onAccountSelect?.(account)
    },
    [onAccountSelect],
  )

  const loadAccounts = useCallback(async () => {
    if (loadingAccounts || accounts.length > 0) return accounts

    setLoadingAccounts(true)
    try {
      const response = await fetch("/api/accounts")
      if (!response.ok) {
        throw new Error(`Failed to load accounts: ${response.status}`)
      }

      const data = await response.json()
      const mappedAccounts = (Array.isArray(data) ? data : [])
        .map(mapAccount)
        .filter((account: AccountItem) => Number(account.status ?? 1) !== 3)

      setAccounts(mappedAccounts)
      return mappedAccounts
    } finally {
      setLoadingAccounts(false)
    }
  }, [accounts, loadingAccounts])

  const resolveAccountByCode = useCallback(
    async (code: string) => {
      const normalizedCode = normalizeAccountCode(code)
      if (!normalizedCode) return null

      const cachedMatch = accounts.find((account) => normalizeAccountCode(account.code) === normalizedCode)
      if (cachedMatch) return cachedMatch

      const loadedAccounts = await loadAccounts()
      return loadedAccounts.find((account) => normalizeAccountCode(account.code) === normalizedCode) || null
    },
    [accounts, loadAccounts],
  )

  useEffect(() => {
    let cancelled = false

    const syncSelectedAccount = async () => {
      if (!normalizedValue) {
        setSelectedAccount(null)
        return
      }

      const nextSelected = await resolveAccountByCode(normalizedValue)
      if (cancelled) return

      setSelectedAccount(nextSelected)
    }

    void syncSelectedAccount()

    return () => {
      cancelled = true
    }
  }, [normalizedValue, resolveAccountByCode])

  useEffect(() => {
    setDisplayValue(resolvedDisplayValue)
  }, [resolvedDisplayValue])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = normalizeAccountCode(event.target.value)
    setDisplayValue(nextValue)
    onValueChange(nextValue)
    notifySelection(null)
  }

  const handleBlur = async () => {
    setIsFocused(false)
    const normalizedCode = normalizeAccountCode(value)
    if (normalizedCode !== value) {
      onValueChange(normalizedCode)
    }

    if (!normalizedCode) {
      notifySelection(null)
      return
    }

    const account = await resolveAccountByCode(normalizedCode)
    notifySelection(account)

    if (account) {
      onValueChange(account.code)
    }
  }

  const handleOpenSearch = async () => {
    await loadAccounts()
    setSearchDialogOpen(true)
  }

  const handleSelectFromSearch = (account: AccountItem) => {
    onValueChange(normalizeAccountCode(account.code))
    notifySelection(account)
    setDisplayValue(formatAccountLabel(account))
    setSearchDialogOpen(false)
  }

  const handleClear = () => {
    onValueChange("")
    setDisplayValue("")
    notifySelection(null)
  }

  const showActions = Boolean(selectedAccount || normalizedValue)

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
            setDisplayValue(value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void handleBlur()
            }
          }}
          maxLength={8}
          placeholder={placeholder}
          className={`text-right uppercase ${inputClassName}`}
          disabled={disabled}
          autoComplete="off"
          inputMode="text"
        />
        {showActions && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-9 px-3"
              onClick={() => void handleOpenSearch()}
              disabled={disabled}
              title="بحث عن الحساب"
            >
              <Search className="h-4 w-4" />
            </Button>
            {selectedAccount && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-9 px-3"
                onClick={handleClear}
                disabled={disabled}
                title="مسح"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {!showActions && (
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
      />
    </div>
  )
}