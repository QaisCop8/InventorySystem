"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { Save, Settings, Building2, Globe, Shield, Printer, FileText, Loader2, AlertCircle } from "lucide-react"

const defaultAccountFields = [
  { key: "customerParentAccount", label: "حساب اب الزبائن في ملف تعريف الزبائن" },
  { key: "customerCreditAccount", label: "حساب اب عملاء الاعتمادات في ملف تعريف عملاء الاعتمادات" },
  { key: "salesTaxAccount", label: "حساب الضريبة على المبيعات" },
  { key: "currencyTransferAccount", label: "حساب تحويلات عملة" },
  { key: "earnedDiscountAccount", label: "حساب الخصم المكتسب" },
  { key: "exchangeGainLossAccount", label: "حساب ارباح وخسائر فروقات العملة" },
  { key: "salesmanParentAccount", label: "حساب اب المندوبين في ملف تعريف المندوبين" },
  { key: "supplierParentAccount", label: "حساب اب الموردين في ملف تعريف الموردين" },
  { key: "customerSubscriptionAccount", label: "حساب اب المشتركين في ملف تعريف المشتركين" },
  { key: "purchaseTaxAccount", label: "حساب الضريبة على المشتريات" },
  { key: "newEmployeeAccount", label: "حساب الاب الافتراضي عند تعريف موظف جديد" },
  { key: "allowedDiscountAccount", label: "حساب خصم مسموح به" },
] as const

type DefaultAccountFieldKey = (typeof defaultAccountFields)[number]["key"]

const defaultAccountFieldKeys = defaultAccountFields.map((field) => field.key)

const toAccountIdString = (value: unknown) => {
  if (value === null || value === undefined || value === "") return ""
  const numericValue = Number(value)
  return Number.isInteger(numericValue) && numericValue > 0 ? String(numericValue) : String(value)
}

const emptyDefaultAccountValues = defaultAccountFields.reduce(
  (accumulator, field) => {
    accumulator[field.key] = ""
    return accumulator
  },
  {} as Record<DefaultAccountFieldKey, string>,
)

export function SystemSettings() {
  const [settings, setSettings] = useState({
    // Company Settings
    companyName: "شركة الموارد المتكاملة",
    companyNameEn: "Integrated Resources Company",
    taxNumber: "123456789",
    commercialRegister: "987654321",
    address: "رام الله - البيرة - شارع الإرسال",
    phone: "02-2345678",
    email: "info@company.com",
    website: "www.company.com",

    // System Settings
    defaultCurrency: "ILS",
    dateFormat: "dd/mm/yyyy",
    timeFormat: "24h",
    language: "ar",
    timezone: "Asia/Jerusalem",

    // Business Settings
    fiscalYearStart: "01/01",
    workingDays: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
    workingHours: "08:00-17:00",

    // Security Settings
    sessionTimeout: 30,
    passwordPolicy: true,
    twoFactorAuth: false,
    auditLog: true,

    // Document Settings - Prefixes
    invoicePrefix: "INV",
    orderPrefix: "SO",
    purchasePrefix: "PO",
    customerPrefix: "C",
    supplierPrefix: "S",
    itemGroupPrefix: "G",
    accountPrefix: "A",
    autoNumbering: true,

    invoiceStart: 1,
    orderStart: 1,
    purchaseStart: 1,
    customerStart: 1,
    supplierStart: 1,
    itemGroupStart: 1,
    itemStart: 1,
    accountStart: 1,

    // Default Accounts
    ...emptyDefaultAccountValues,

    // Print Settings
    defaultPrinter: "HP LaserJet",
    paperSize: "A4",
    printLogo: true,
    printFooter: true,
  })

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasTransactions, setHasTransactions] = useState(false)
  const [numberingLocks, setNumberingLocks] = useState({
    invoice: false,
    order: false,
    purchase: false,
  })

  useEffect(() => {
    loadSettings()
    checkTransactions()
  }, [])

  const checkTransactions = async () => {
    try {
      const response = await fetch("/api/settings/check-transactions")
      if (response.ok) {
        const data = await response.json()
        setHasTransactions(data.hasTransactions)
        if (data?.locks) {
          setNumberingLocks({
            invoice: Boolean(data.locks.invoice),
            order: Boolean(data.locks.order),
            purchase: Boolean(data.locks.purchase),
          })
        }
      }
    } catch (err) {
      console.error("Error checking transactions:", err)
    }
  }

  const loadSettings = async () => {
    try {
      setInitialLoading(true)
      const response = await fetch("/api/settings/system")

      if (response.ok) {
        const data = await response.json()
        if (data && Object.keys(data).length > 0) {
          setSettings((prev) => ({
            ...prev,
            companyName: data.company_name || prev.companyName,
            companyNameEn: data.company_name_en || prev.companyNameEn,
            address: data.company_address || prev.address,
            phone: data.company_phone || prev.phone,
            email: data.company_email || prev.email,
            website: data.company_website || prev.website,
            taxNumber: data.tax_number || prev.taxNumber,
            commercialRegister: data.commercial_register || prev.commercialRegister,
            defaultCurrency: data.default_currency || prev.defaultCurrency,
            invoicePrefix: data.invoice_prefix || prev.invoicePrefix,
            orderPrefix: data.order_prefix || prev.orderPrefix,
            purchasePrefix: data.purchase_prefix || prev.purchasePrefix,
            customerPrefix: data.customer_prefix || prev.customerPrefix,
            supplierPrefix: data.supplier_prefix || prev.supplierPrefix,
            itemGroupPrefix: data.item_group_prefix || prev.itemGroupPrefix,
            invoiceStart: data.invoice_start ?? prev.invoiceStart,
            orderStart: data.order_start ?? prev.orderStart,
            purchaseStart: data.purchase_start ?? prev.purchaseStart,
            customerStart: data.customer_start ?? prev.customerStart,
            supplierStart: data.supplier_start ?? prev.supplierStart,
            itemGroupStart: data.item_group_start ?? prev.itemGroupStart,
            itemStart: data.item_start ?? prev.itemStart,
            fiscalYearStart: data.fiscal_year_start || prev.fiscalYearStart,
            language: data.language || prev.language,
            timezone: data.timezone || prev.timezone,
            dateFormat: data.date_format || prev.dateFormat,
            timeFormat: data.time_format || prev.timeFormat,
            workingDays: data.working_days
              ? (() => {
                  try {
                    // If it's already an array, return it
                    if (Array.isArray(data.working_days)) {
                      return data.working_days
                    }
                    // If it's a string, try to parse it as JSON
                    if (typeof data.working_days === "string") {
                      return JSON.parse(data.working_days)
                    }
                    // Fallback to default
                    return prev.workingDays
                  } catch (e) {
                    console.warn("Failed to parse working_days:", data.working_days)
                    return prev.workingDays
                  }
                })()
              : prev.workingDays,
            workingHours: data.working_hours || prev.workingHours,
            sessionTimeout: data.session_timeout ?? prev.sessionTimeout,
            passwordPolicy: data.password_policy === "strong",
            twoFactorAuth: data.two_factor_auth || prev.twoFactorAuth,
            auditLog: data.audit_log !== false,
            defaultPrinter: data.default_printer || prev.defaultPrinter,
            paperSize: data.paper_size || prev.paperSize,
            printLogo: data.print_logo !== false,
            printFooter: data.print_footer !== false,
            autoNumbering: data.auto_numbering !== false,
            customerParentAccount: toAccountIdString(data.default_customer_parent_account ?? prev.customerParentAccount),
            customerCreditAccount: toAccountIdString(data.default_customer_credit_account ?? prev.customerCreditAccount),
            salesTaxAccount: toAccountIdString(data.default_sales_tax_account ?? prev.salesTaxAccount),
            currencyTransferAccount: toAccountIdString(data.default_currency_transfer_account ?? prev.currencyTransferAccount),
            earnedDiscountAccount: toAccountIdString(data.default_earned_discount_account ?? prev.earnedDiscountAccount),
            exchangeGainLossAccount: toAccountIdString(data.default_exchange_gain_loss_account ?? prev.exchangeGainLossAccount),
            salesmanParentAccount: toAccountIdString(data.default_salesman_parent_account ?? prev.salesmanParentAccount),
            supplierParentAccount: toAccountIdString(data.default_supplier_parent_account ?? prev.supplierParentAccount),
            customerSubscriptionAccount: toAccountIdString(data.default_customer_subscription_account ?? prev.customerSubscriptionAccount),
            purchaseTaxAccount: toAccountIdString(data.default_purchase_tax_account ?? prev.purchaseTaxAccount),
            newEmployeeAccount: toAccountIdString(data.default_new_employee_account ?? prev.newEmployeeAccount),
            allowedDiscountAccount: toAccountIdString(data.default_allowed_discount_account ?? prev.allowedDiscountAccount),
          }))
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err)
    } finally {
      setInitialLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setLoading(true)
      setError(null)

      const isValidPrefix = (value: string) => /^[A-Z]{1,3}$/.test(value.trim())
      const isValidStart = (value: number) => Number.isInteger(value) && value > 0 && value < 1000

      // Validation
      if (!settings.companyName.trim()) {
        setError("اسم الشركة مطلوب")
        return
      }

      const prefixes = [
        { label: "بادئة فواتير المبيعات", value: settings.invoicePrefix },
        { label: "بادئة طلبات المبيعات", value: settings.orderPrefix },
        { label: "بادئة طلبات الشراء", value: settings.purchasePrefix },
        { label: "بادئة العملاء", value: settings.customerPrefix },
        { label: "بادئة الموردين", value: settings.supplierPrefix },
        { label: "بادئة مجموعات الأصناف", value: settings.itemGroupPrefix },
      ]

      for (const prefix of prefixes) {
        if (!isValidPrefix(prefix.value)) {
          setError(`${prefix.label}: مسموح فقط بحروف إنجليزية كبيرة A-Z وبحد أقصى 3 أحرف`)
          return
        }
      }

      const starts = [
        { label: "بداية ترقيم فواتير المبيعات", value: settings.invoiceStart },
        { label: "بداية ترقيم طلبات المبيعات", value: settings.orderStart },
        { label: "بداية ترقيم طلبات الشراء", value: settings.purchaseStart },
        { label: "بداية ترقيم العملاء", value: settings.customerStart },
        { label: "بداية ترقيم الموردين", value: settings.supplierStart },
        { label: "بداية ترقيم مجموعات الأصناف", value: settings.itemGroupStart },
        { label: "بداية ترقيم الأصناف", value: settings.itemStart },
      ]

      for (const start of starts) {
        if (!isValidStart(start.value)) {
          setError(`${start.label}: يجب أن تكون رقمًا صحيحًا من 1 إلى 999`)
          return
        }
      }

      if (!settings.invoiceStart || settings.invoiceStart < 1) {
        setError("بداية ترقيم فواتير المبيعات مطلوبة ويجب أن تكون أكبر من صفر")
        return
      }
      if (!settings.orderStart || settings.orderStart < 1) {
        setError("بداية ترقيم طلبات المبيعات مطلوبة ويجب أن تكون أكبر من صفر")
        return
      }
      if (!settings.purchaseStart || settings.purchaseStart < 1) {
        setError("بداية ترقيم طلبات الشراء مطلوبة ويجب أن تكون أكبر من صفر")
        return
      }

      const response = await fetch("/api/settings/system", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: settings.companyName,
          company_name_en: settings.companyNameEn,
          company_address: settings.address,
          company_phone: settings.phone,
          company_email: settings.email,
          company_website: settings.website,
          tax_number: settings.taxNumber,
          commercial_register: settings.commercialRegister,
          default_currency: settings.defaultCurrency,
          invoice_prefix: settings.invoicePrefix.trim().toUpperCase(),
          order_prefix: settings.orderPrefix.trim().toUpperCase(),
          purchase_prefix: settings.purchasePrefix.trim().toUpperCase(),
          customer_prefix: settings.customerPrefix.trim().toUpperCase(),
          supplier_prefix: settings.supplierPrefix.trim().toUpperCase(),
          item_group_prefix: settings.itemGroupPrefix.trim().toUpperCase(),
          invoice_start: settings.invoiceStart,
          order_start: settings.orderStart,
          purchase_start: settings.purchaseStart,
          customer_start: settings.customerStart || null,
          supplier_start: settings.supplierStart || null,
          item_group_start: settings.itemGroupStart || null,
          item_start: settings.itemStart || null,
          fiscal_year_start: settings.fiscalYearStart,
          numbering_system: settings.autoNumbering ? "auto" : "manual",
          language: settings.language,
          timezone: settings.timezone,
          date_format: settings.dateFormat,
          time_format: settings.timeFormat,
          working_days: settings.workingDays,
          working_hours: settings.workingHours,
          sessionTimeout: settings.sessionTimeout,
          passwordPolicy: settings.passwordPolicy ? "strong" : "medium",
          twoFactorAuth: settings.twoFactorAuth,
          auditLog: settings.auditLog,
          defaultPrinter: settings.defaultPrinter,
          paperSize: settings.paperSize,
          printLogo: settings.printLogo,
          printFooter: settings.printFooter,
          autoNumbering: settings.autoNumbering,
          default_customer_parent_account: settings.customerParentAccount ? Number(settings.customerParentAccount) : null,
          default_customer_credit_account: settings.customerCreditAccount ? Number(settings.customerCreditAccount) : null,
          default_sales_tax_account: settings.salesTaxAccount ? Number(settings.salesTaxAccount) : null,
          default_currency_transfer_account: settings.currencyTransferAccount ? Number(settings.currencyTransferAccount) : null,
          default_earned_discount_account: settings.earnedDiscountAccount ? Number(settings.earnedDiscountAccount) : null,
          default_exchange_gain_loss_account: settings.exchangeGainLossAccount ? Number(settings.exchangeGainLossAccount) : null,
          default_salesman_parent_account: settings.salesmanParentAccount ? Number(settings.salesmanParentAccount) : null,
          default_supplier_parent_account: settings.supplierParentAccount ? Number(settings.supplierParentAccount) : null,
          default_customer_subscription_account: settings.customerSubscriptionAccount ? Number(settings.customerSubscriptionAccount) : null,
          default_purchase_tax_account: settings.purchaseTaxAccount ? Number(settings.purchaseTaxAccount) : null,
          default_new_employee_account: settings.newEmployeeAccount ? Number(settings.newEmployeeAccount) : null,
          default_allowed_discount_account: settings.allowedDiscountAccount ? Number(settings.allowedDiscountAccount) : null,
        }),
      })

      if (!response.ok) {
        throw new Error("فشل في حفظ الإعدادات")
      }

      const result = await response.json()
      console.log("تم حفظ الإعدادات بنجاح:", result)
      alert("تم حفظ الإعدادات بنجاح")
    } catch (err) {
      console.error("Error saving settings:", err)
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الإعدادات")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm("هل أنت متأكد من إعادة تعيين جميع الإعدادات؟")) {
      setSettings({
        companyName: "شركة الموارد المتكاملة",
        companyNameEn: "Integrated Resources Company",
        taxNumber: "123456789",
        commercialRegister: "987654321",
        address: "رام الله - البيرة - شارع الإرسال",
        phone: "02-2345678",
        email: "info@company.com",
        website: "www.company.com",
        defaultCurrency: "ILS",
        dateFormat: "dd/mm/yyyy",
        timeFormat: "24h",
        language: "ar",
        timezone: "Asia/Jerusalem",
        fiscalYearStart: "01/01",
        workingDays: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
        workingHours: "08:00-17:00",
        sessionTimeout: 30,
        passwordPolicy: true,
        twoFactorAuth: false,
        auditLog: true,
        invoicePrefix: "INV",
        orderPrefix: "SO",
        purchasePrefix: "PO",
        customerPrefix: "C",
        supplierPrefix: "S",
        itemGroupPrefix: "G",
        accountPrefix: "A",
        autoNumbering: true,
        invoiceStart: 1,
        orderStart: 1,
        purchaseStart: 1,
        customerStart: 1,
        supplierStart: 1,
        itemGroupStart: 1,
        itemStart: 1,
        accountStart: 1,
        ...emptyDefaultAccountValues,
        defaultPrinter: "HP LaserJet",
        paperSize: "A4",
        printLogo: true,
        printFooter: true,
      })
      console.log("تم إعادة تعيين الإعدادات")
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center p-8" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="mr-2">جاري تحميل الإعدادات...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <Card className="erp-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="h-6 w-6 text-primary" />
              <CardTitle className="text-right">إعدادات النظام</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadSettings()} disabled={loading}>
                إعادة تحميل
              </Button>
              <Button onClick={handleSave} className="erp-btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 ml-2" />
                    حفظ الإعدادات
                  </>
                )}
              </Button>
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mt-4 text-right">
              {error}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Settings Tabs */}
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="company">معلومات الشركة</TabsTrigger>
          <TabsTrigger value="system">إعدادات النظام</TabsTrigger>
          <TabsTrigger value="business">إعدادات العمل</TabsTrigger>
          <TabsTrigger value="accounts">الحسابات الافتراضية</TabsTrigger>
          <TabsTrigger value="security">الأمان</TabsTrigger>
          <TabsTrigger value="documents">السندات</TabsTrigger>
          <TabsTrigger value="printing">الطباعة</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Building2 className="h-5 w-5" />
                معلومات الشركة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName" className="text-right block">
                    اسم الشركة (عربي) *
                  </Label>
                  <Input
                    id="companyName"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="companyNameEn" className="text-right block">
                    اسم الشركة (إنجليزي)
                  </Label>
                  <Input
                    id="companyNameEn"
                    value={settings.companyNameEn}
                    onChange={(e) => setSettings({ ...settings, companyNameEn: e.target.value })}
                    className="text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label htmlFor="taxNumber" className="text-right block">
                    الرقم الضريبي
                  </Label>
                  <Input
                    id="taxNumber"
                    value={settings.taxNumber}
                    onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="commercialRegister" className="text-right block">
                    السجل التجاري
                  </Label>
                  <Input
                    id="commercialRegister"
                    value={settings.commercialRegister}
                    onChange={(e) => setSettings({ ...settings, commercialRegister: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address" className="text-right block">
                    العنوان
                  </Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-right block">
                    الهاتف
                  </Label>
                  <Input
                    id="phone"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-right block">
                    البريد الإلكتروني
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label htmlFor="website" className="text-right block">
                    الموقع الإلكتروني
                  </Label>
                  <Input
                    id="website"
                    value={settings.website}
                    onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                    className="text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Globe className="h-5 w-5" />
                إعدادات النظام العامة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultCurrency" className="text-right block">
                    العملة الافتراضية
                  </Label>
                  <Select
                    value={settings.defaultCurrency}
                    onValueChange={(value) => setSettings({ ...settings, defaultCurrency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ILS">شيكل إسرائيلي (ILS)</SelectItem>
                      <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                      <SelectItem value="EUR">يورو (EUR)</SelectItem>
                      <SelectItem value="JOD">دينار أردني (JOD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dateFormat" className="text-right block">
                    تنسيق التاريخ
                  </Label>
                  <Select
                    value={settings.dateFormat}
                    onValueChange={(value) => setSettings({ ...settings, dateFormat: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd/mm/yyyy">يوم/شهر/سنة</SelectItem>
                      <SelectItem value="mm/dd/yyyy">شهر/يوم/سنة</SelectItem>
                      <SelectItem value="yyyy-mm-dd">سنة-شهر-يوم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="timeFormat" className="text-right block">
                    تنسيق الوقت
                  </Label>
                  <Select
                    value={settings.timeFormat}
                    onValueChange={(value) => setSettings({ ...settings, timeFormat: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 ساعة</SelectItem>
                      <SelectItem value="12h">12 ساعة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="language" className="text-right block">
                    اللغة
                  </Label>
                  <Select
                    value={settings.language}
                    onValueChange={(value) => setSettings({ ...settings, language: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">إعدادات العمل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fiscalYearStart" className="text-right block">
                    بداية السنة المالية
                  </Label>
                  <Input
                    id="fiscalYearStart"
                    value={settings.fiscalYearStart}
                    onChange={(e) => setSettings({ ...settings, fiscalYearStart: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="workingDays" className="text-right block">
                    أيام العمل
                  </Label>
                  {/* Working Days Select Component */}
                </div>
                <div>
                  <Label htmlFor="workingHours" className="text-right block">
                    ساعات العمل
                  </Label>
                  <Input
                    id="workingHours"
                    value={settings.workingHours}
                    onChange={(e) => setSettings({ ...settings, workingHours: e.target.value })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Building2 className="h-5 w-5" />
                الحسابات الافتراضية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {defaultAccountFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-right block">{field.label}</Label>
                    <AutoCompleteAccount
                      value={settings[field.key as DefaultAccountFieldKey]}
                      valueMode="id"
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          [field.key]: value,
                        })
                      }
                      onAccountSelect={(account) =>
                        setSettings({
                          ...settings,
                          [field.key]: account ? String(account.id) : "",
                        })
                      }
                      placeholder="اختر الحساب"
                      className="w-full"
                      showCostCenterButton={false}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Shield className="h-5 w-5" />
                إعدادات الأمان
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sessionTimeout" className="text-right block">
                    انتهاء الجلسة (دقيقة)
                  </Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({ ...settings, sessionTimeout: Number.parseInt(e.target.value) })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="passwordPolicy" className="text-right block">
                      سياسة كلمة المرور القوية
                    </Label>
                    <Switch
                      id="passwordPolicy"
                      checked={settings.passwordPolicy}
                      onCheckedChange={(checked) => setSettings({ ...settings, passwordPolicy: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="twoFactorAuth" className="text-right block">
                      المصادقة الثنائية
                    </Label>
                    <Switch
                      id="twoFactorAuth"
                      checked={settings.twoFactorAuth}
                      onCheckedChange={(checked) => setSettings({ ...settings, twoFactorAuth: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auditLog" className="text-right block">
                      سجل العمليات
                    </Label>
                    <Switch
                      id="auditLog"
                      checked={settings.auditLog}
                      onCheckedChange={(checked) => setSettings({ ...settings, auditLog: checked })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <FileText className="h-5 w-5" />
                إعدادات السندات والترقيم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasTransactions && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <strong>تنبيه:</strong> لا يمكن تعديل إعدادات ترقيم السندات التي لديها حركات محفوظة
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold mb-4 text-right">إعدادات السندات (إجبارية)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="invoicePrefix" className="text-right block">
                      بادئة فواتير المبيعات *
                    </Label>
                    <Input
                      id="invoicePrefix"
                      value={settings.invoicePrefix}
                      onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.invoice}
                    />
                  </div>
                  <div>
                    <Label htmlFor="invoiceStart" className="text-right block">
                      بداية ترقيم فواتير المبيعات *
                    </Label>
                    <Input
                      id="invoiceStart"
                      type="number"
                      min="1"
                      value={settings.invoiceStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, invoiceStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.invoice}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.invoicePrefix}
                      {String(settings.invoiceStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="orderPrefix" className="text-right block">
                      بادئة طلبات المبيعات *
                    </Label>
                    <Input
                      id="orderPrefix"
                      value={settings.orderPrefix}
                      onChange={(e) => setSettings({ ...settings, orderPrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.order}
                    />
                  </div>
                  <div>
                    <Label htmlFor="orderStart" className="text-right block">
                      بداية ترقيم طلبات المبيعات *
                    </Label>
                    <Input
                      id="orderStart"
                      type="number"
                      min="1"
                      value={settings.orderStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, orderStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.order}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.orderPrefix}
                      {String(settings.orderStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="purchasePrefix" className="text-right block">
                      بادئة طلبات الشراء *
                    </Label>
                    <Input
                      id="purchasePrefix"
                      value={settings.purchasePrefix}
                      onChange={(e) => setSettings({ ...settings, purchasePrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.purchase}
                    />
                  </div>
                  <div>
                    <Label htmlFor="purchaseStart" className="text-right block">
                      بداية ترقيم طلبات الشراء *
                    </Label>
                    <Input
                      id="purchaseStart"
                      type="number"
                      min="1"
                      value={settings.purchaseStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, purchaseStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      required
                      disabled={numberingLocks.purchase}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.purchasePrefix}
                      {String(settings.purchaseStart).padStart(4, "0")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4 text-right">إعدادات التعريفات (اختيارية)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="accountPrefix" className="text-right block">
                      بادئة الحسابات المحاسبية
                    </Label>
                    <Input
                      id="accountPrefix"
                      value={settings.accountPrefix}
                      onChange={(e) => setSettings({ ...settings, accountPrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      placeholder="A"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountStart" className="text-right block">
                      بداية ترقيم الحسابات المحاسبية
                    </Label>
                    <Input
                      id="accountStart"
                      type="number"
                      min="1"
                      value={settings.accountStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, accountStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.accountPrefix}
                      {String(settings.accountStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="customerPrefix" className="text-right block">
                      بادئة الزبائن
                    </Label>
                    <Input
                      id="customerPrefix"
                      value={settings.customerPrefix}
                      onChange={(e) => setSettings({ ...settings, customerPrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      placeholder="C"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerStart" className="text-right block">
                      بداية ترقيم الزبائن
                    </Label>
                    <Input
                      id="customerStart"
                      type="number"
                      min="1"
                      value={settings.customerStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, customerStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.customerPrefix}
                      {String(settings.customerStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="supplierPrefix" className="text-right block">
                      بادئة الموردين
                    </Label>
                    <Input
                      id="supplierPrefix"
                      value={settings.supplierPrefix}
                      onChange={(e) => setSettings({ ...settings, supplierPrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      placeholder="S"
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplierStart" className="text-right block">
                      بداية ترقيم الموردين
                    </Label>
                    <Input
                      id="supplierStart"
                      type="number"
                      min="1"
                      value={settings.supplierStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, supplierStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.supplierPrefix}
                      {String(settings.supplierStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="itemGroupPrefix" className="text-right block">
                      بادئة مجموعات الأصناف
                    </Label>
                    <Input
                      id="itemGroupPrefix"
                      value={settings.itemGroupPrefix}
                      onChange={(e) => setSettings({ ...settings, itemGroupPrefix: e.target.value })}
                      className="text-right"
                      dir="rtl"
                      placeholder="G"
                    />
                  </div>
                  <div>
                    <Label htmlFor="itemGroupStart" className="text-right block">
                      بداية ترقيم مجموعات الأصناف
                    </Label>
                    <Input
                      id="itemGroupStart"
                      type="number"
                      min="1"
                      value={settings.itemGroupStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, itemGroupStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">
                      مثال: {settings.itemGroupPrefix}
                      {String(settings.itemGroupStart).padStart(4, "0")}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="itemStart" className="text-right block">
                      بداية ترقيم الأصناف
                    </Label>
                    <Input
                      id="itemStart"
                      type="number"
                      min="1"
                      value={settings.itemStart}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                        setSettings({ ...settings, itemStart: value })
                      }}
                      className="text-right"
                      dir="rtl"
                      placeholder="1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="printing" className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Printer className="h-5 w-5" />
                إعدادات الطباعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultPrinter" className="text-right block">
                    الطابعة الافتراضية
                  </Label>
                  <Select
                    value={settings.defaultPrinter}
                    onValueChange={(value) => setSettings({ ...settings, defaultPrinter: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HP LaserJet">HP LaserJet</SelectItem>
                      <SelectItem value="Canon Printer">Canon Printer</SelectItem>
                      <SelectItem value="Epson Printer">Epson Printer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="paperSize" className="text-right block">
                    حجم الورق
                  </Label>
                  <Select
                    value={settings.paperSize}
                    onValueChange={(value) => setSettings({ ...settings, paperSize: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="A5">A5</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="printLogo" className="text-right block">
                    طباعة الشعار
                  </Label>
                  <Switch
                    id="printLogo"
                    checked={settings.printLogo}
                    onCheckedChange={(checked) => setSettings({ ...settings, printLogo: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="printFooter" className="text-right block">
                    طباعة التذييل
                  </Label>
                  <Switch
                    id="printFooter"
                    checked={settings.printFooter}
                    onCheckedChange={(checked) => setSettings({ ...settings, printFooter: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
