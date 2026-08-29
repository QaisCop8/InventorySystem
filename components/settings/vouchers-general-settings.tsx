"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useToast } from "@/hooks/use-toast"
import { SPECIAL_PRICE_CATEGORIES } from "@/components/inventory/unified-stock-voucher"
import { syncSystemSettingsToLocalStorage } from "@/lib/system-settings-sync"

const CHEQUE_CHECK_MODES = [
  { value: "no_check", label: "عدم التشييك" },
  { value: "check_on_entry", label: "التشييك عند ادخال الشيك" },
  { value: "check_on_save", label: "التشييك عند الحفظ" },
]

const NEGATIVE_BALANCE_SIGN_OPTIONS = [
  { value: "credit", label: "الرصيد الدائن" },
  { value: "debit", label: "الرصيد المدين" },
]

const ITEM_QUANTITY_UNIT_OPTIONS = [
  { value: "decimal", label: "عشري" },
  { value: "integer", label: "عدد صحيح" },
]

const HAZARDOUS_MATERIALS_WARNING_OPTIONS = [
  { value: "disabled", label: "تعطيل تنبيهات الحركات على المواد الخطرة" },
  { value: "warn", label: "تحذير المستخدم في الحركات عند تحريك مواد خطرة" },
  { value: "block", label: "منع المستخدم من تحريك مواد خطرة (يتم التجاوز بصلاحية رقم 808)" },
]

const GENERAL_ITEM_COST_METHOD_OPTIONS = [
  { value: "last_purchase_price", label: "اخر سعر شراء" },
  { value: "average_price", label: "متوسط الأسعار" },
  { value: "fifo", label: "الداخل أول خارج أول" },
]

const DEFAULT_BARCODE_COLUMN_VALUE_OPTIONS = [
  { value: "none", label: "بلا تحديد" },
  { value: "item_code", label: "رقم الصنف" },
  { value: "main_barcode", label: "الباركود الرئيسي" },
]

const PRICE_SOURCE_OPTIONS = [
  { value: "main_relation", label: "من العلاقة بالرئيسية" },
  { value: "unit", label: "من الوحدة" },
]

interface VouchersGeneralSettingsState {
  fetchChequeNoOnBankAccount: boolean
  chequeStatusCheckMode: string
  allowPaymentExceedingCashBalance: boolean
  disallowManualChequeEntryInPayment: boolean
  returnedChequeStatusAlwaysRaje: boolean
  decimalPlacesCount: number
  showThousandsSeparator: boolean
  negativeBalanceSign: string
  defaultItemQuantityUnit: string
  hazardousMaterialsWarningMode: string
  itemGroupMandatory: boolean
  stockVoucherItemCostMethod: number | null
  generalItemCostMethod: string
  includePurchaseReturnsInCost: boolean
  allowNegativeItemBalances: boolean
  allowOrderConfirmationWithoutProductionMaterials: boolean
  defaultBarcodeColumnValue: string
  showZeroQuantityItemsInSearch: boolean
  serialNumberLength: number
  serialWarrantyStartsAfterSaleDays: number
  preventSellingNewerSerialBeforeOlder: boolean
  autoAssignNextSerialOnPurchase: boolean
  serialReportDefaultDaysFilter: number
  priceSource: string
}

const defaultSettings: VouchersGeneralSettingsState = {
  fetchChequeNoOnBankAccount: false,
  chequeStatusCheckMode: "no_check",
  allowPaymentExceedingCashBalance: false,
  disallowManualChequeEntryInPayment: false,
  returnedChequeStatusAlwaysRaje: false,
  decimalPlacesCount: 3,
  showThousandsSeparator: false,
  negativeBalanceSign: "credit",
  defaultItemQuantityUnit: "decimal",
  hazardousMaterialsWarningMode: "disabled",
  itemGroupMandatory: false,
  stockVoucherItemCostMethod: null,
  generalItemCostMethod: "last_purchase_price",
  includePurchaseReturnsInCost: false,
  allowNegativeItemBalances: true,
  allowOrderConfirmationWithoutProductionMaterials: false,
  defaultBarcodeColumnValue: "none",
  showZeroQuantityItemsInSearch: true,
  serialNumberLength: 15,
  serialWarrantyStartsAfterSaleDays: 0,
  preventSellingNewerSerialBeforeOlder: false,
  autoAssignNextSerialOnPurchase: false,
  serialReportDefaultDaysFilter: 30,
  priceSource: "main_relation",
}

export default function VouchersGeneralSettings() {
  const [receiptPaymentOpen, setReceiptPaymentOpen] = useState(true)
  const [accountsOpen, setAccountsOpen] = useState(true)
  const [itemsOpen, setItemsOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<VouchersGeneralSettingsState>(defaultSettings)
  const [priceCategories, setPriceCategories] = useState<{ id: number; name: string }[]>([])
  const { toast } = useToast()

  // نفس مصدر "فئة السعر" المستخدم فعلياً في سندات المخزون (unified-stock-voucher.tsx) — القيمة
  // المختارة هنا هي التي تُطبَّق تلقائياً كفئة سعر افتراضية عند فتح سند ادخال/ اخراج/ استعمال جديد.
  const combinedPriceCategories = useMemo(
    () => [...SPECIAL_PRICE_CATEGORIES, ...priceCategories.map((c) => ({ ...c, disabled: false }))],
    [priceCategories],
  )

  useEffect(() => {
    void loadSettings()
    void loadPriceCategories()
  }, [])

  const loadPriceCategories = async () => {
    try {
      const response = await fetch("/api/pricecategory")
      if (!response.ok) return
      const data = await response.json()
      setPriceCategories(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : [])
    } catch (error) {
      console.error("Failed to load price categories", error)
    }
  }

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
        decimalPlacesCount: Number(payload.decimal_places_count ?? prev.decimalPlacesCount),
        showThousandsSeparator: Boolean(payload.show_thousands_separator ?? prev.showThousandsSeparator),
        negativeBalanceSign: payload.negative_balance_sign || prev.negativeBalanceSign,
        defaultItemQuantityUnit: payload.default_item_quantity_unit || prev.defaultItemQuantityUnit,
        hazardousMaterialsWarningMode:
          payload.hazardous_materials_warning_mode || prev.hazardousMaterialsWarningMode,
        itemGroupMandatory: Boolean(payload.item_group_mandatory ?? prev.itemGroupMandatory),
        stockVoucherItemCostMethod:
          payload.stock_voucher_item_cost_method !== undefined && payload.stock_voucher_item_cost_method !== null && payload.stock_voucher_item_cost_method !== ""
            ? Number(payload.stock_voucher_item_cost_method)
            : prev.stockVoucherItemCostMethod,
        generalItemCostMethod: payload.general_item_cost_method || prev.generalItemCostMethod,
        includePurchaseReturnsInCost: Boolean(
          payload.include_purchase_returns_in_cost ?? prev.includePurchaseReturnsInCost,
        ),
        allowNegativeItemBalances: Boolean(
          payload.allow_negative_item_balances ?? prev.allowNegativeItemBalances,
        ),
        allowOrderConfirmationWithoutProductionMaterials: Boolean(
          payload.allow_order_confirmation_without_production_materials ??
            prev.allowOrderConfirmationWithoutProductionMaterials,
        ),
        defaultBarcodeColumnValue: payload.default_barcode_column_value || prev.defaultBarcodeColumnValue,
        showZeroQuantityItemsInSearch: Boolean(
          payload.show_zero_quantity_items_in_search ?? prev.showZeroQuantityItemsInSearch,
        ),
        serialNumberLength: Number(payload.serial_number_length ?? prev.serialNumberLength),
        serialWarrantyStartsAfterSaleDays: Number(
          payload.serial_warranty_starts_after_sale_days ?? prev.serialWarrantyStartsAfterSaleDays,
        ),
        preventSellingNewerSerialBeforeOlder: Boolean(
          payload.prevent_selling_newer_serial_before_older ?? prev.preventSellingNewerSerialBeforeOlder,
        ),
        autoAssignNextSerialOnPurchase: Boolean(
          payload.auto_assign_next_serial_on_purchase ?? prev.autoAssignNextSerialOnPurchase,
        ),
        serialReportDefaultDaysFilter: Number(
          payload.serial_report_default_days_filter ?? prev.serialReportDefaultDaysFilter,
        ),
        priceSource: payload.price_source || prev.priceSource,
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
          decimal_places_count: settings.decimalPlacesCount,
          show_thousands_separator: settings.showThousandsSeparator,
          negative_balance_sign: settings.negativeBalanceSign,
          default_item_quantity_unit: settings.defaultItemQuantityUnit,
          hazardous_materials_warning_mode: settings.hazardousMaterialsWarningMode,
          item_group_mandatory: settings.itemGroupMandatory,
          stock_voucher_item_cost_method: settings.stockVoucherItemCostMethod,
          general_item_cost_method: settings.generalItemCostMethod,
          include_purchase_returns_in_cost: settings.includePurchaseReturnsInCost,
          allow_negative_item_balances: settings.allowNegativeItemBalances,
          allow_order_confirmation_without_production_materials:
            settings.allowOrderConfirmationWithoutProductionMaterials,
          default_barcode_column_value: settings.defaultBarcodeColumnValue,
          show_zero_quantity_items_in_search: settings.showZeroQuantityItemsInSearch,
          serial_number_length: settings.serialNumberLength,
          serial_warranty_starts_after_sale_days: settings.serialWarrantyStartsAfterSaleDays,
          prevent_selling_newer_serial_before_older: settings.preventSellingNewerSerialBeforeOlder,
          auto_assign_next_serial_on_purchase: settings.autoAssignNextSerialOnPurchase,
          serial_report_default_days_filter: settings.serialReportDefaultDaysFilter,
          price_source: settings.priceSource,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      // يُعيد تعبئة عدد الخانات العشرية بـlocalStorage فوراً (بدل انتظار إعادة تحميل الصفحة) —
      // يُطلِق أيضاً حدثاً تلتقطه كل شبكة DataGridView مفتوحة حالياً لإعادة تنسيق خلاياها المعروضة.
      void syncSystemSettingsToLocalStorage()
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

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <Collapsible open={accountsOpen} onOpenChange={setAccountsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-base font-semibold">
              <span>الحسابات</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${accountsOpen ? "-rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4">
              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">عدد الخانات العشرية في الكميات والاسعار والمبالغ</span>
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={settings.decimalPlacesCount}
                  onChange={(e) => setSettings((s) => ({ ...s, decimalPlacesCount: Number(e.target.value) }))}
                />
              </div>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">الاشارة السالبة للرصيد</span>
                <PrimeDropdown
                  value={settings.negativeBalanceSign}
                  options={NEGATIVE_BALANCE_SIGN_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, negativeBalanceSign: e.value }))}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.showThousandsSeparator}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, showThousandsSeparator: Boolean(checked) }))
                  }
                />
                <span>اظهار فواصل الالاف في الكميات والاسعار والمبالغ</span>
              </label>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <Collapsible open={itemsOpen} onOpenChange={setItemsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-base font-semibold">
              <span>الاصناف</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${itemsOpen ? "-rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4">
              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">وحدة عد كميات الصنف</span>
                <PrimeDropdown
                  value={settings.defaultItemQuantityUnit}
                  options={ITEM_QUANTITY_UNIT_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, defaultItemQuantityUnit: e.value }))}
                />
              </div>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">تفعيل محاذير المواد الخطرة</span>
                <PrimeDropdown
                  value={settings.hazardousMaterialsWarningMode}
                  options={HAZARDOUS_MATERIALS_WARNING_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, hazardousMaterialsWarningMode: e.value }))}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.itemGroupMandatory}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, itemGroupMandatory: Boolean(checked) }))
                  }
                />
                <span>مجموعة الصنف اجباري في ملف تعريف الصنف</span>
              </label>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">طريقة احتساب تكلفة الصنف في سندات ادخال/ اخراج/ استعمال</span>
                <PrimeDropdown
                  value={settings.stockVoucherItemCostMethod}
                  options={combinedPriceCategories}
                  optionLabel="name"
                  optionValue="id"
                  optionDisabled="disabled"
                  filter
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) =>
                    setSettings((s) => ({ ...s, stockVoucherItemCostMethod: e.value ?? null }))
                  }
                />
              </div>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">طريقة احتساب تكلفة الصنف العامة /الانتاج</span>
                <PrimeDropdown
                  value={settings.generalItemCostMethod}
                  options={GENERAL_ITEM_COST_METHOD_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, generalItemCostMethod: e.value }))}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.includePurchaseReturnsInCost}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, includePurchaseReturnsInCost: Boolean(checked) }))
                  }
                />
                <span>احتساب حركات مردودات المشتريات في حسابات تكلفة الاصناف</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.allowNegativeItemBalances}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, allowNegativeItemBalances: Boolean(checked) }))
                  }
                />
                <span>السماح بكميات سالبة في ارصدة الاصناف</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.allowOrderConfirmationWithoutProductionMaterials}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      allowOrderConfirmationWithoutProductionMaterials: Boolean(checked),
                    }))
                  }
                />
                <span>الاستمرار في تأكيد الطلبيات في حال عدم توفر مواد الانتاج</span>
              </label>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">القيمة الافتراضية لبيانات عمود الباركود</span>
                <PrimeDropdown
                  value={settings.defaultBarcodeColumnValue}
                  options={DEFAULT_BARCODE_COLUMN_VALUE_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, defaultBarcodeColumnValue: e.value }))}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.showZeroQuantityItemsInSearch}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, showZeroQuantityItemsInSearch: Boolean(checked) }))
                  }
                />
                <span>اظهار الاصناف التي كميتها = 0 في بحث الاصناف</span>
              </label>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">طول السيريال</span>
                <Input
                  type="number"
                  min={0}
                  value={settings.serialNumberLength}
                  onChange={(e) => setSettings((s) => ({ ...s, serialNumberLength: Number(e.target.value) }))}
                />
              </div>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">كفالات السيريال تبدأ بعد البيع بـ</span>
                <Input
                  type="number"
                  min={0}
                  value={settings.serialWarrantyStartsAfterSaleDays}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, serialWarrantyStartsAfterSaleDays: Number(e.target.value) }))
                  }
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.preventSellingNewerSerialBeforeOlder}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, preventSellingNewerSerialBeforeOlder: Boolean(checked) }))
                  }
                />
                <span>منع بيع سيريال مع وجود سيريال اقدم غير مباع بعد</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={settings.autoAssignNextSerialOnPurchase}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, autoAssignNextSerialOnPurchase: Boolean(checked) }))
                  }
                />
                <span>اعطاء اخر رقم سيريال متسلسل جديد للصنف عند الشراء</span>
              </label>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">
                  تقرير الارقام المتسلسلة/ القيمة الافتراضية لفلتر "عدد الايام قبل"
                </span>
                <Input
                  type="number"
                  min={0}
                  value={settings.serialReportDefaultDaysFilter}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, serialReportDefaultDaysFilter: Number(e.target.value) }))
                  }
                />
              </div>

              <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                <span className="text-sm">اعتماد السعر من</span>
                <PrimeDropdown
                  value={settings.priceSource}
                  options={PRICE_SOURCE_OPTIONS}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  panelStyle={{ zIndex: 10000 }}
                  onChange={(e: any) => setSettings((s) => ({ ...s, priceSource: e.value }))}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  )
}
