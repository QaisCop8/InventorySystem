"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"

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
  const [searchFilters, setSearchFilters] = useState({
    accountNumber: "",
    accountName: "",
    financialList: "__all__",
    type: "__all__",
  })

  useEffect(() => {
    if (!open) {
      setSearchResults([])
      setSearchFilters({
        accountNumber: "",
        accountName: "",
        financialList: "__all__",
        type: "__all__",
      })
    }
  }, [open])

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
        if (searchFilters.type === "1" && account.type !== 2 && account.type !== 3 && account.type !== 4) return false
        if (searchFilters.type === "2" && account.type !== 3) return false
        if (searchFilters.type === "3" && account.type !== 4) return false
      }
      return true
    })
    setSearchResults(results)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" dir="rtl">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">بحث الحسابات</h2>

          <div className="grid gap-4 md:grid-cols-2 border-b pb-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الحساب</Label>
              <Input
                value={searchFilters.accountNumber}
                onChange={(e) => setSearchFilters({ ...searchFilters, accountNumber: e.target.value })}
                placeholder="ابحث برقم الحساب"
                className="text-right"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">الاسم</Label>
              <Input
                value={searchFilters.accountName}
                onChange={(e) => setSearchFilters({ ...searchFilters, accountName: e.target.value })}
                placeholder="ابحث باسم الحساب"
                className="text-right"
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
                onChange={(e: any) => setSearchFilters({ ...searchFilters, financialList: e.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium">النوع</Label>
              <PrimeDropdown
                value={searchFilters.type}
                options={[
                  { label: "الكل", value: "__all__" },
                  { label: "حساب محاسبي", value: "1" },
                  { label: "الزبائن", value: "2" },
                  { label: "الموردين", value: "3" },
                ]}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر النوع"
                className="w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                onChange={(e: any) => setSearchFilters({ ...searchFilters, type: e.value })}
              />
            </div>
          </div>

          <Button onClick={handleSearchAccounts} className="w-full search-button">
            بحث
          </Button>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b">
                  <tr>
                    <th className="px-4 py-2 text-right font-semibold">رقم الحساب</th>
                    <th className="px-4 py-2 text-right font-semibold">اسم الحساب</th>
                    <th className="px-4 py-2 text-right font-semibold">النوع</th>
                    <th className="px-4 py-2 text-right font-semibold">القائمة المالية</th>
                    <th className="px-4 py-2 text-center font-semibold">اختيار</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.length > 0 ? (
                    searchResults.map((account) => (
                      <tr key={account.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 text-right">{account.code}</td>
                        <td className="px-4 py-2 text-right">{account.name}</td>
                        <td className="px-4 py-2 text-right">
                          {account.type_name ||
                            (account.type === 2 ? "حساب محاسبي" :
                              account.type === 3 ? "الزبائن" :
                                account.type === 4 ? "الموردين" : "أخرى")}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {account.finanical_list_id === 1 ? "الميزانية العمومية" :
                            account.finanical_list_id === 2 ? "قائمة الدخل" :
                              account.finanical_list_id === 3 ? "تقييم بضاعة" : ""}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button size="sm" onClick={() => onSelect(account)} className="search-button">
                            اختيار
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        لا توجد نتائج. قم بالبحث لعرض النتائج
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
