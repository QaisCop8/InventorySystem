"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import { useToast } from "@/hooks/use-toast"

const CHEQUE_CHECK_MODES = [
  { value: "no_check", label: "عدم التشييك" },
  { value: "check_on_entry", label: "التشييك عند ادخال الشيك" },
  { value: "check_on_save", label: "التشييك عند الحفظ" },
]

interface VouchersGeneralSettingsState {
  fetchChequeNoOnBankAccount: boolean
  chequeStatusCheckMode: string
  allowPaymentExceedingCashBalance: boolean
  disallowManualChequeEntryInPayment: boolean
  returnedChequeStatusAlwaysRaje: boolean
}

const defaultSettings: VouchersGeneralSettingsState = {
  fetchChequeNoOnBankAccount: false,
  chequeStatusCheckMode: "no_check",
  allowPaymentExceedingCashBalance: false,
  disallowManualChequeEntryInPayment: false,
  returnedChequeStatusAlwaysRaje: false,
}

export default function VouchersGeneralSettings() {
  const [receiptPaymentOpen, setReceiptPaymentOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<VouchersGeneralSettingsState>(defaultSettings)
  const { toast } = useToast()

  useEffect(() => {
    void loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/system")
      if (!response.ok) return
      const data = await response.json()
      const payload = data?.settings ?? data
      setSettings((prev) => ({
        fetchChequeNoOnBankAccount: Boolean(
          payload.fetch_cheque_no_on_bank_account_receipt ?? prev.fetchChequeNoOnBankAccount,
        ),
        chequeStatusCheckMode: payload.cheque_status_check_mode || prev.chequeStatusCheckMode,
        allowPaymentExceedingCashBalance: Boolean(
          payload.allow_payment_exceeding_cash_balance ?? prev.allowPaymentExceedingCashBalance,
        ),
        disallowManualChequeEntryInPayment: Boolean(
          payload.disallow_manual_cheque_entry_in_payment ?? prev.disallowManualChequeEntryInPayment,
        ),
        returnedChequeStatusAlwaysRaje: Boolean(
          payload.returned_cheque_status_always_raje ?? prev.returnedChequeStatusAlwaysRaje,
        ),
      }))
    } catch (error) {
      console.error("Failed to load general voucher settings", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fetch_cheque_no_on_bank_account_receipt: settings.fetchChequeNoOnBankAccount,
          cheque_status_check_mode: settings.chequeStatusCheckMode,
          allow_payment_exceeding_cash_balance: settings.allowPaymentExceedingCashBalance,
          disallow_manual_cheque_entry_in_payment: settings.disallowManualChequeEntryInPayment,
          returned_cheque_status_always_raje: settings.returnedChequeStatusAlwaysRaje,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      toast({ title: "تم الحفظ", description: "تم حفظ الإعدادات العامة بنجاح" })
    } catch (error) {
      console.error("Failed to save general voucher settings", error)
      toast({ title: "خطأ", description: "فشل حفظ الإعدادات العامة", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">اعدادات عامة</h2>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <TooltipProvider>
            <Collapsible open={receiptPaymentOpen} onOpenChange={setReceiptPaymentOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-base font-semibold">
                <span>القبض والصرف والقيد</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${receiptPaymentOpen ? "-rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex w-fit items-center gap-3 cursor-pointer">
                      <Checkbox
                        checked={settings.fetchChequeNoOnBankAccount}
                        onCheckedChange={(checked) =>
                          setSettings((s) => ({ ...s, fetchChequeNoOnBankAccount: Boolean(checked) }))
                        }
                      />
                      <span>احضار رقم الشيك بصورة الية في سند الصرف</span>
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-right" dir="rtl">
                    عند التحقق من وجود شيكات حالتها الحالية راجع لهذا الحساب حسب الخيار المحدد هنا
                  </TooltipContent>
                </Tooltip>

                <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                  <span className="text-sm">التحقق من وجود شيكات حالتها الحالية راجع لهذا الحساب</span>
                  <PrimeDropdown
                    value={settings.chequeStatusCheckMode}
                    options={CHEQUE_CHECK_MODES}
                    optionLabel="label"
                    optionValue="value"
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    panelStyle={{ zIndex: 10000 }}
                    onChange={(e: any) => setSettings((s) => ({ ...s, chequeStatusCheckMode: e.value }))}
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={settings.allowPaymentExceedingCashBalance}
                    onCheckedChange={(checked) =>
                      setSettings((s) => ({ ...s, allowPaymentExceedingCashBalance: Boolean(checked) }))
                    }
                  />
                  <span>السماح باصدار سندات صرف بقيم تتجاوز رصيد الصندوق</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={settings.disallowManualChequeEntryInPayment}
                    onCheckedChange={(checked) =>
                      setSettings((s) => ({ ...s, disallowManualChequeEntryInPayment: Boolean(checked) }))
                    }
                  />
                  <span>عدم السماح بادخال شيكات يدويا في سند الصرف</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={settings.returnedChequeStatusAlwaysRaje}
                    onCheckedChange={(checked) =>
                      setSettings((s) => ({ ...s, returnedChequeStatusAlwaysRaje: Boolean(checked) }))
                    }
                  />
                  <span>حالة الشيك المجير الذي يتم ارجاعه هي دائما "راجع"</span>
                </label>
              </CollapsibleContent>
            </Collapsible>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  )
}
