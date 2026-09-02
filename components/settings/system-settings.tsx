"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import Messages from "@/components/common/Messages"
import { Save, Settings, Building2, Globe, Shield, Printer, FileText, Loader2, AlertCircle } from "lucide-react"
import { buildVoucherCode } from "@/lib/voucher-code"

const defaultAccountFields = [
  { key: "customerParentAccount", label: "حساب اب العملاء في ملف تعريف العملاء" },
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

const productAccountFields = [
  { key: "sellingAccount", label: "حساب المبيعات الافتراضي" },
  { key: "purchaseAccount", label: "حساب المشتريات الافتراضي" },
  { key: "sellingReturnsAccount", label: "حساب مرتجعات المبيعات الافتراضي" },
  { key: "purchaseReturnsAccount", label: "حساب مرتجعات المشتريات الافتراضي" },
  { key: "stockEndAccount", label: "حساب تقييم بضاعة آخر المدة الافتراضي" },
  { key: "stockStartAccount", label: "حساب تقييم بضاعة أول المدة الافتراضي" },
  { key: "productionAccount", label: "حساب الإنتاج الافتراضي" },
  { key: "municipalityServiceAccount", label: "حساب المصاريف البلدية الافتراضي" },
  { key: "lsti3malAccount", label: "حساب المصروف في سند الاستعمال الافتراضي" },
] as const

type ProductAccountFieldKey = (typeof productAccountFields)[number]["key"]

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

const emptyProductAccountValues = productAccountFields.reduce(
  (accumulator, field) => {
    accumulator[field.key] = ""
    return accumulator
  },
  {} as Record<ProductAccountFieldKey, string>,
)

export function SystemSettings() {
  const [settings, setSettings] = useState({
    // Company Settings
    companyName: "",
    companyNameEn: "",
    companyLogo: "",
    licensedWorkerNumber: "",
    taxNumber: "",
    commercialRegister: "",
    address: "",
    phone: "",
    email: "",
    website: "",

    // System Settings
    defaultCurrency: "ILS",
    dateFormat: "dd/mm/yyyy",
    timeFormat: "24h",
    language: "ar",
    timezone: "Asia/Jerusalem",
    taxRate: 16,
    taxRateClearing: 18,

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
    orderPrefix: "SO",
    purchasePrefix: "PO",
    receiptPrefix: "R",
    paymentPrefix: "P",
    creditNotePrefix: "C",
    debitNotePrefix: "D",
    stockInPrefix: "I",
    stockOutPrefix: "O",
    internalDeliveryPrefix: "T",
    useVoucherPrefix: "U",
    salesInvoicePrefix: "INV",
    deliverySellPrefix: "DSL",
    deliveryConsignmentSalePrefix: "INV",
    returnDeliveryConsignmentSalePrefix: "INV",
    returnSellPrefix: "INV",
    purchaseInvoicePrefix: "INV",
    deliveryPayPrefix: "DPY",
    returnPurchasePrefix: "RPU",
    journalPrefix: "J",
    customerPrefix: "C",
    salesmanPrefix: "M",
    employeePrefix: "E",
    supplierPrefix: "S",
    itemGroupPrefix: "G",
    accountPrefix: "A",
    autoNumbering: true,

    invoiceStart: 1,
    orderStart: 1,
    purchaseStart: 1,
    receiptStart: 1,
    paymentStart: 1,
    creditNoteStart: 1,
    debitNoteStart: 1,
    stockInStart: 1,
    stockOutStart: 1,
    internalDeliveryStart: 1,
    useVoucherStart: 1,
    salesInvoiceStart: 1,
    deliverySellStart: 1,
    deliveryConsignmentSaleStart: 1,
    returnDeliveryConsignmentSaleStart: 1,
    returnSellStart: 1,
    purchaseInvoiceStart: 1,
    deliveryPayStart: 1,
    returnPurchaseStart: 1,
    journalStart: 1,
    customerStart: 1,
    salesmanStart: 1,
    employeeStart: 1,
    supplierStart: 1,
    itemGroupStart: 1,
    itemStart: 1,
    accountStart: 1,

    // Default Accounts
    ...emptyDefaultAccountValues,
    ...emptyProductAccountValues,

    // Print Settings
    defaultPrinter: "HP LaserJet",
    paperSize: "A4",
    printLogo: true,
    printFooter: true,
  })

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const message = useRef<any>(null)
  const savingRef = useRef(false)
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
        const settingsPayload = data?.settings ?? data
        if (settingsPayload && Object.keys(settingsPayload).length > 0) {
          setSettings((prev) => ({
            ...prev,
            companyName: String(settingsPayload.company_name ?? ""),
            companyNameEn: String(settingsPayload.company_name_en ?? ""),
            companyLogo: String(settingsPayload.company_logo ?? ""),
            licensedWorkerNumber: String(settingsPayload.licensed_worker_number ?? ""),
            address: String(settingsPayload.company_address ?? ""),
            phone: String(settingsPayload.company_phone ?? ""),
            email: String(settingsPayload.company_email ?? ""),
            website: String(settingsPayload.company_website ?? ""),
            taxNumber: String(settingsPayload.tax_number ?? ""),
            commercialRegister: String(settingsPayload.commercial_register ?? ""),
            defaultCurrency: settingsPayload.default_currency || prev.defaultCurrency,
            orderPrefix: settingsPayload.order_prefix || prev.orderPrefix,
            purchasePrefix: settingsPayload.purchase_prefix || prev.purchasePrefix,
            receiptPrefix: settingsPayload.receipt_prefix || prev.receiptPrefix,
            paymentPrefix: settingsPayload.payment_prefix || prev.paymentPrefix,
            creditNotePrefix: settingsPayload.credit_note_prefix || prev.creditNotePrefix,
            debitNotePrefix: settingsPayload.debit_note_prefix || prev.debitNotePrefix,
            stockInPrefix: settingsPayload.stock_in_prefix || prev.stockInPrefix,
            stockOutPrefix: settingsPayload.stock_out_prefix || prev.stockOutPrefix,
            internalDeliveryPrefix: settingsPayload.internal_delivery_prefix || prev.internalDeliveryPrefix,
            useVoucherPrefix: settingsPayload.use_voucher_prefix || prev.useVoucherPrefix,
            salesInvoicePrefix: settingsPayload.sales_invoice_prefix || prev.salesInvoicePrefix,
            deliverySellPrefix: settingsPayload.delivery_sell_prefix || prev.deliverySellPrefix,
            deliveryConsignmentSalePrefix: settingsPayload.delivery_consignment_sale_prefix || prev.deliveryConsignmentSalePrefix,
            returnDeliveryConsignmentSalePrefix: settingsPayload.return_delivery_consignment_sale_prefix || prev.returnDeliveryConsignmentSalePrefix,
            returnSellPrefix: settingsPayload.return_sell_prefix || prev.returnSellPrefix,
            purchaseInvoicePrefix: settingsPayload.purchase_invoice_prefix || prev.purchaseInvoicePrefix,
            deliveryPayPrefix: settingsPayload.delivery_pay_prefix || prev.deliveryPayPrefix,
            returnPurchasePrefix: settingsPayload.return_purchase_prefix || prev.returnPurchasePrefix,
            journalPrefix: settingsPayload.journal_prefix || prev.journalPrefix,
            customerPrefix: settingsPayload.customer_prefix || prev.customerPrefix,
            salesmanPrefix: settingsPayload.salesman_prefix || prev.salesmanPrefix,
            employeePrefix: settingsPayload.employee_prefix || prev.employeePrefix,
            supplierPrefix: settingsPayload.supplier_prefix || prev.supplierPrefix,
            itemGroupPrefix: settingsPayload.item_group_prefix || prev.itemGroupPrefix,
            accountPrefix: settingsPayload.account_prefix || prev.accountPrefix,
            invoiceStart: settingsPayload.invoice_start ?? prev.invoiceStart,
            orderStart: settingsPayload.order_start ?? prev.orderStart,
            purchaseStart: settingsPayload.purchase_start ?? prev.purchaseStart,
            receiptStart: settingsPayload.receipt_start ?? prev.receiptStart,
            paymentStart: settingsPayload.payment_start ?? prev.paymentStart,
            creditNoteStart: settingsPayload.credit_note_start ?? prev.creditNoteStart,
            debitNoteStart: settingsPayload.debit_note_start ?? prev.debitNoteStart,
            stockInStart: settingsPayload.stock_in_start ?? prev.stockInStart,
            stockOutStart: settingsPayload.stock_out_start ?? prev.stockOutStart,
            internalDeliveryStart: settingsPayload.internal_delivery_start ?? prev.internalDeliveryStart,
            useVoucherStart: settingsPayload.use_voucher_start ?? prev.useVoucherStart,
            salesInvoiceStart: settingsPayload.sales_invoice_start ?? prev.salesInvoiceStart,
            deliverySellStart: settingsPayload.delivery_sell_start ?? prev.deliverySellStart,
            deliveryConsignmentSaleStart: settingsPayload.delivery_consignment_sale_start ?? prev.deliveryConsignmentSaleStart,
            returnDeliveryConsignmentSaleStart: settingsPayload.return_delivery_consignment_sale_start ?? prev.returnDeliveryConsignmentSaleStart,
            returnSellStart: settingsPayload.return_sell_start ?? prev.returnSellStart,
            purchaseInvoiceStart: settingsPayload.purchase_invoice_start ?? prev.purchaseInvoiceStart,
            deliveryPayStart: settingsPayload.delivery_pay_start ?? prev.deliveryPayStart,
            returnPurchaseStart: settingsPayload.return_purchase_start ?? prev.returnPurchaseStart,
            journalStart: settingsPayload.journal_start ?? prev.journalStart,
            customerStart: settingsPayload.customer_start ?? prev.customerStart,
            salesmanStart: settingsPayload.salesman_start ?? prev.salesmanStart,
            employeeStart: settingsPayload.employee_start ?? prev.employeeStart,
            supplierStart: settingsPayload.supplier_start ?? prev.supplierStart,
            itemGroupStart: settingsPayload.item_group_start ?? prev.itemGroupStart,
            itemStart: settingsPayload.item_start ?? prev.itemStart,
            accountStart: settingsPayload.account_start ?? prev.accountStart,
            fiscalYearStart: settingsPayload.fiscal_year_start || prev.fiscalYearStart,
            language: settingsPayload.language || prev.language,
            timezone: settingsPayload.timezone || prev.timezone,
            dateFormat: settingsPayload.date_format || prev.dateFormat,
            timeFormat: settingsPayload.time_format || prev.timeFormat,
            taxRate: settingsPayload.tax_rate != null && settingsPayload.tax_rate !== "" ? Number(settingsPayload.tax_rate) : prev.taxRate,
            taxRateClearing:
              settingsPayload.tax_rate_clearing != null && settingsPayload.tax_rate_clearing !== ""
                ? Number(settingsPayload.tax_rate_clearing)
                : prev.taxRateClearing,
            workingDays: settingsPayload.working_days
              ? (() => {
                  try {
                    if (Array.isArray(settingsPayload.working_days)) {
                      return settingsPayload.working_days
                    }
                    if (typeof settingsPayload.working_days === "string") {
                      return JSON.parse(settingsPayload.working_days)
                    }
                    return prev.workingDays
                  } catch (e) {
                    console.warn("Failed to parse working_days:", settingsPayload.working_days)
                    return prev.workingDays
                  }
                })()
              : prev.workingDays,
            workingHours: settingsPayload.working_hours || prev.workingHours,
            sessionTimeout: settingsPayload.session_timeout ?? prev.sessionTimeout,
            passwordPolicy: settingsPayload.password_policy === "strong",
            twoFactorAuth: settingsPayload.two_factor_auth || prev.twoFactorAuth,
            auditLog: settingsPayload.audit_log !== false,
            defaultPrinter: settingsPayload.default_printer || prev.defaultPrinter,
            paperSize: settingsPayload.paper_size || prev.paperSize,
            printLogo: settingsPayload.print_logo !== false,
            printFooter: settingsPayload.print_footer !== false,
            autoNumbering: settingsPayload.auto_numbering !== false,
            customerParentAccount: toAccountIdString(settingsPayload.default_customer_parent_account ?? prev.customerParentAccount),
            customerCreditAccount: toAccountIdString(settingsPayload.default_customer_credit_account ?? prev.customerCreditAccount),
            salesTaxAccount: toAccountIdString(settingsPayload.default_sales_tax_account ?? prev.salesTaxAccount),
            currencyTransferAccount: toAccountIdString(settingsPayload.default_currency_transfer_account ?? prev.currencyTransferAccount),
            earnedDiscountAccount: toAccountIdString(settingsPayload.default_earned_discount_account ?? prev.earnedDiscountAccount),
            exchangeGainLossAccount: toAccountIdString(settingsPayload.default_exchange_gain_loss_account ?? prev.exchangeGainLossAccount),
            salesmanParentAccount: toAccountIdString(settingsPayload.default_salesman_parent_account ?? prev.salesmanParentAccount),
            supplierParentAccount: toAccountIdString(settingsPayload.default_supplier_parent_account ?? prev.supplierParentAccount),
            customerSubscriptionAccount: toAccountIdString(settingsPayload.default_customer_subscription_account ?? prev.customerSubscriptionAccount),
            purchaseTaxAccount: toAccountIdString(settingsPayload.default_purchase_tax_account ?? prev.purchaseTaxAccount),
            newEmployeeAccount: toAccountIdString(settingsPayload.default_new_employee_account ?? prev.newEmployeeAccount),
            allowedDiscountAccount: toAccountIdString(settingsPayload.default_allowed_discount_account ?? prev.allowedDiscountAccount),
            sellingAccount: toAccountIdString(settingsPayload.default_selling_account_id ?? prev.sellingAccount),
            purchaseAccount: toAccountIdString(settingsPayload.default_purchase_account_id ?? prev.purchaseAccount),
            sellingReturnsAccount: toAccountIdString(settingsPayload.default_selling_returns_account_id ?? prev.sellingReturnsAccount),
            purchaseReturnsAccount: toAccountIdString(settingsPayload.default_purchase_returns_account_id ?? prev.purchaseReturnsAccount),
            stockEndAccount: toAccountIdString(settingsPayload.default_stock_end_account_id ?? prev.stockEndAccount),
            stockStartAccount: toAccountIdString(settingsPayload.default_stock_start_account_id ?? prev.stockStartAccount),
            productionAccount: toAccountIdString(settingsPayload.default_production_account_id ?? prev.productionAccount),
            municipalityServiceAccount: toAccountIdString(settingsPayload.default_municipality_service_account_id ?? prev.municipalityServiceAccount),
            lsti3malAccount: toAccountIdString(settingsPayload.default_lsti3mal_account_id ?? prev.lsti3malAccount),
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
    if (savingRef.current) return
    savingRef.current = true

    const showMessage = (detail: string, severity: "success" | "error") => {
      message.current?.clear?.()
      message.current?.show?.([
        {
          severity,
          summary: "",
          detail,
          sticky: severity === "error",
          life: severity === "success" ? 4000 : undefined,
        },
      ])
    }
    const validationError = (detail: string) => {
      setError(detail)
      showMessage(detail, "error")
    }

    try {
      setLoading(true)
      setError(null)

      const isValidPrefix = (value: string) => /^[A-Z]{1,3}$/.test(value.trim())
      const isValidStart = (value: number) => Number.isInteger(value) && value > 0 && value < 1000

      // Validation
      if (!settings.companyName.trim()) {
        validationError("اسم الشركة مطلوب")
        return
      }

      const prefixes = [
        { label: "بادئة طلبات المبيعات", value: settings.orderPrefix },
        { label: "بادئة طلبات الشراء", value: settings.purchasePrefix },
        { label: "بادئة سندات القبض", value: settings.receiptPrefix },
        { label: "بادئة سندات الصرف", value: settings.paymentPrefix },
        { label: "بادئة الاشعار الدائن", value: settings.creditNotePrefix },
        { label: "بادئة الاشعار المدين", value: settings.debitNotePrefix },
        { label: "بادئة سند ادخال بضاعة", value: settings.stockInPrefix },
        { label: "بادئة سند اخراج بضاعة", value: settings.stockOutPrefix },
        { label: "بادئة ارسالية داخلية", value: settings.internalDeliveryPrefix },
        { label: "بادئة سند استعمال", value: settings.useVoucherPrefix },
        { label: "بادئة فاتورة مبيعات", value: settings.salesInvoicePrefix },
        { label: "بادئة إرسالية مبيعات", value: settings.deliverySellPrefix },
        { label: "بادئة إرسالية برسم البيع", value: settings.deliveryConsignmentSalePrefix },
        { label: "بادئة مرتجع إرسالية برسم البيع", value: settings.returnDeliveryConsignmentSalePrefix },
        { label: "بادئة مرتجع مبيعات", value: settings.returnSellPrefix },
        { label: "بادئة فاتورة مشتريات", value: settings.purchaseInvoicePrefix },
        { label: "بادئة إرسالية مشتريات", value: settings.deliveryPayPrefix },
        { label: "بادئة مرتجع مشتريات", value: settings.returnPurchasePrefix },
        { label: "بادئة سندات القيد", value: settings.journalPrefix },
        { label: "بادئة العملاء", value: settings.customerPrefix },
        { label: "بادئة الموظفين", value: settings.employeePrefix },
        { label: "بادئة الموردين", value: settings.supplierPrefix },
        { label: "بادئة مجموعات الأصناف", value: settings.itemGroupPrefix },
      ]

      for (const prefix of prefixes) {
        if (!isValidPrefix(prefix.value)) {
          validationError(`${prefix.label}: مسموح فقط بحروف إنجليزية كبيرة A-Z وبحد أقصى 3 أحرف، بدون أرقام أو رموز خاصة`)
          return
        }
      }

      const isValidVoucherStart = (value: number) => Number.isInteger(value) && value > 0 && value <= 10000
      const voucherStarts = [
        { label: "الترقيم يبدأ من (سندات القبض)", value: settings.receiptStart },
        { label: "الترقيم يبدأ من (سندات الصرف)", value: settings.paymentStart },
        { label: "الترقيم يبدأ من (الاشعار الدائن)", value: settings.creditNoteStart },
        { label: "الترقيم يبدأ من (الاشعار المدين)", value: settings.debitNoteStart },
        { label: "الترقيم يبدأ من (سند ادخال بضاعة)", value: settings.stockInStart },
        { label: "الترقيم يبدأ من (سند اخراج بضاعة)", value: settings.stockOutStart },
        { label: "الترقيم يبدأ من (ارسالية داخلية)", value: settings.internalDeliveryStart },
        { label: "الترقيم يبدأ من (سند استعمال)", value: settings.useVoucherStart },
        { label: "الترقيم يبدأ من (فاتورة مبيعات)", value: settings.salesInvoiceStart },
        { label: "الترقيم يبدأ من (إرسالية مبيعات)", value: settings.deliverySellStart },
        { label: "الترقيم يبدأ من (إرسالية برسم البيع)", value: settings.deliveryConsignmentSaleStart },
        { label: "الترقيم يبدأ من (مرتجع إرسالية برسم البيع)", value: settings.returnDeliveryConsignmentSaleStart },
        { label: "الترقيم يبدأ من (مرتجع مبيعات)", value: settings.returnSellStart },
        { label: "الترقيم يبدأ من (فاتورة مشتريات)", value: settings.purchaseInvoiceStart },
        { label: "الترقيم يبدأ من (إرسالية مشتريات)", value: settings.deliveryPayStart },
        { label: "الترقيم يبدأ من (مرتجع مشتريات)", value: settings.returnPurchaseStart },
        { label: "الترقيم يبدأ من (سندات القيد)", value: settings.journalStart },
      ]
      for (const start of voucherStarts) {
        if (!isValidVoucherStart(start.value)) {
          validationError(`${start.label}: يجب أن يكون رقمًا صحيحًا من 1 إلى 10000`)
          return
        }
      }

      const starts = [
        { label: "بداية ترقيم طلبات المبيعات", value: settings.orderStart },
        { label: "بداية ترقيم طلبات الشراء", value: settings.purchaseStart },
        { label: "بداية ترقيم العملاء", value: settings.customerStart },
        { label: "الرقم يبدأ من (الموظفين)", value: settings.employeeStart },
        { label: "بداية ترقيم الموردين", value: settings.supplierStart },
        { label: "بداية ترقيم مجموعات الأصناف", value: settings.itemGroupStart },
        { label: "بداية ترقيم الأصناف", value: settings.itemStart },
      ]

      for (const start of starts) {
        if (!isValidStart(start.value)) {
          validationError(`${start.label}: يجب أن تكون رقمًا صحيحًا من 1 إلى 999`)
          return
        }
      }

      if (!settings.orderStart || settings.orderStart < 1) {
        validationError("بداية ترقيم طلبات المبيعات مطلوبة ويجب أن تكون أكبر من صفر")
        return
      }
      if (!settings.purchaseStart || settings.purchaseStart < 1) {
        validationError("بداية ترقيم طلبات الشراء مطلوبة ويجب أن تكون أكبر من صفر")
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
          company_logo: settings.companyLogo,
          licensed_worker_number: settings.licensedWorkerNumber,
          company_address: settings.address,
          company_phone: settings.phone,
          company_email: settings.email,
          company_website: settings.website,
          tax_number: settings.taxNumber,
          commercial_register: settings.commercialRegister,
          default_currency: settings.defaultCurrency,
          order_prefix: settings.orderPrefix.trim().toUpperCase(),
          purchase_prefix: settings.purchasePrefix.trim().toUpperCase(),
          receipt_prefix: settings.receiptPrefix.trim().toUpperCase(),
          payment_prefix: settings.paymentPrefix.trim().toUpperCase(),
          credit_note_prefix: settings.creditNotePrefix.trim().toUpperCase(),
          debit_note_prefix: settings.debitNotePrefix.trim().toUpperCase(),
          stock_in_prefix: settings.stockInPrefix.trim().toUpperCase(),
          stock_out_prefix: settings.stockOutPrefix.trim().toUpperCase(),
          internal_delivery_prefix: settings.internalDeliveryPrefix.trim().toUpperCase(),
          use_voucher_prefix: settings.useVoucherPrefix.trim().toUpperCase(),
          sales_invoice_prefix: settings.salesInvoicePrefix.trim().toUpperCase(),
          delivery_sell_prefix: settings.deliverySellPrefix.trim().toUpperCase(),
          delivery_consignment_sale_prefix: settings.deliveryConsignmentSalePrefix.trim().toUpperCase(),
          return_delivery_consignment_sale_prefix: settings.returnDeliveryConsignmentSalePrefix.trim().toUpperCase(),
          return_sell_prefix: settings.returnSellPrefix.trim().toUpperCase(),
          purchase_invoice_prefix: settings.purchaseInvoicePrefix.trim().toUpperCase(),
          delivery_pay_prefix: settings.deliveryPayPrefix.trim().toUpperCase(),
          return_purchase_prefix: settings.returnPurchasePrefix.trim().toUpperCase(),
          journal_prefix: settings.journalPrefix.trim().toUpperCase(),
          customer_prefix: settings.customerPrefix.trim().toUpperCase(),
          salesman_prefix: settings.salesmanPrefix.trim().toUpperCase(),
          employee_prefix: settings.employeePrefix.trim().toUpperCase(),
          supplier_prefix: settings.supplierPrefix.trim().toUpperCase(),
          item_group_prefix: settings.itemGroupPrefix.trim().toUpperCase(),
          account_prefix: settings.accountPrefix.trim().toUpperCase(),
          invoice_start: settings.invoiceStart,
          order_start: settings.orderStart,
          purchase_start: settings.purchaseStart,
          receipt_start: settings.receiptStart,
          payment_start: settings.paymentStart,
          credit_note_start: settings.creditNoteStart,
          debit_note_start: settings.debitNoteStart,
          stock_in_start: settings.stockInStart,
          stock_out_start: settings.stockOutStart,
          internal_delivery_start: settings.internalDeliveryStart,
          use_voucher_start: settings.useVoucherStart,
          sales_invoice_start: settings.salesInvoiceStart,
          delivery_sell_start: settings.deliverySellStart,
          delivery_consignment_sale_start: settings.deliveryConsignmentSaleStart,
          return_delivery_consignment_sale_start: settings.returnDeliveryConsignmentSaleStart,
          return_sell_start: settings.returnSellStart,
          purchase_invoice_start: settings.purchaseInvoiceStart,
          delivery_pay_start: settings.deliveryPayStart,
          return_purchase_start: settings.returnPurchaseStart,
          journal_start: settings.journalStart,
          customer_start: settings.customerStart || null,
          salesman_start: settings.salesmanStart || null,
          employee_start: settings.employeeStart || null,
          supplier_start: settings.supplierStart || null,
          item_group_start: settings.itemGroupStart || null,
          item_start: settings.itemStart || null,
          account_start: settings.accountStart || null,
          fiscal_year_start: settings.fiscalYearStart,
          numbering_system: settings.autoNumbering ? "auto" : "manual",
          language: settings.language,
          timezone: settings.timezone,
          date_format: settings.dateFormat,
          time_format: settings.timeFormat,
          tax_rate: Number(settings.taxRate) || 0,
          tax_rate_clearing: Number(settings.taxRateClearing) || 0,
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
          default_selling_account_id: settings.sellingAccount ? Number(settings.sellingAccount) : null,
          default_purchase_account_id: settings.purchaseAccount ? Number(settings.purchaseAccount) : null,
          default_selling_returns_account_id: settings.sellingReturnsAccount ? Number(settings.sellingReturnsAccount) : null,
          default_purchase_returns_account_id: settings.purchaseReturnsAccount ? Number(settings.purchaseReturnsAccount) : null,
          default_stock_end_account_id: settings.stockEndAccount ? Number(settings.stockEndAccount) : null,
          default_stock_start_account_id: settings.stockStartAccount ? Number(settings.stockStartAccount) : null,
          default_production_account_id: settings.productionAccount ? Number(settings.productionAccount) : null,
          default_municipality_service_account_id: settings.municipalityServiceAccount ? Number(settings.municipalityServiceAccount) : null,
          default_lsti3mal_account_id: settings.lsti3malAccount ? Number(settings.lsti3malAccount) : null,
        }),
      })

      if (!response.ok) {
        const failure = await response.json().catch(() => null)
        throw new Error(failure?.details || failure?.error || "فشل في حفظ الإعدادات")
      }

      const result = await response.json()
      console.log("تم حفظ الإعدادات بنجاح:", result)
      window.dispatchEvent(new CustomEvent("system-settings-updated", { detail: result }))
      showMessage("تم حفظ الاعدادات بنجاح", "success")
    } catch (err) {
      console.error("Error saving settings:", err)
      const errorMessage = err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الإعدادات"
      setError(errorMessage)
      showMessage(errorMessage, "error")
    } finally {
      savingRef.current = false
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm("هل أنت متأكد من إعادة تعيين جميع الإعدادات؟")) {
      setSettings({
        companyName: "",
        companyNameEn: "",
        companyLogo: "",
            licensedWorkerNumber: "",
            taxNumber: "",
        commercialRegister: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        defaultCurrency: "ILS",
        dateFormat: "dd/mm/yyyy",
        timeFormat: "24h",
        language: "ar",
        timezone: "Asia/Jerusalem",
        taxRate: 16,
        taxRateClearing: 18,
        fiscalYearStart: "01/01",
        workingDays: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
        workingHours: "08:00-17:00",
        sessionTimeout: 30,
        passwordPolicy: true,
        twoFactorAuth: false,
        auditLog: true,
        orderPrefix: "SO",
        purchasePrefix: "PO",
        receiptPrefix: "R",
        paymentPrefix: "P",
        creditNotePrefix: "C",
        debitNotePrefix: "D",
        stockInPrefix: "I",
        stockOutPrefix: "O",
        internalDeliveryPrefix: "T",
        useVoucherPrefix: "U",
        salesInvoicePrefix: "INV",
        deliverySellPrefix: "DSL",
        deliveryConsignmentSalePrefix: "INV",
        returnDeliveryConsignmentSalePrefix: "INV",
        returnSellPrefix: "INV",
        purchaseInvoicePrefix: "INV",
        deliveryPayPrefix: "INV",
        returnPurchasePrefix: "INV",
        journalPrefix: "J",
        customerPrefix: "C",
        employeePrefix: "E",
        supplierPrefix: "S",
        itemGroupPrefix: "G",
        accountPrefix: "A",
        autoNumbering: true,
        invoiceStart: 1,
        orderStart: 1,
        purchaseStart: 1,
        receiptStart: 1,
        paymentStart: 1,
        creditNoteStart: 1,
        debitNoteStart: 1,
        stockInStart: 1,
        stockOutStart: 1,
        internalDeliveryStart: 1,
        useVoucherStart: 1,
        salesInvoiceStart: 1,
        deliverySellStart: 1,
        deliveryConsignmentSaleStart: 1,
        returnDeliveryConsignmentSaleStart: 1,
        returnSellStart: 1,
        purchaseInvoiceStart: 1,
        deliveryPayStart: 1,
        returnPurchaseStart: 1,
        journalStart: 1,
        customerStart: 1,
        employeeStart: 1,
        supplierStart: 1,
        itemGroupStart: 1,
        itemStart: 1,
        accountStart: 1,
        ...emptyDefaultAccountValues,
        ...emptyProductAccountValues,
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
    <div className="system-settings-form space-y-6" dir="rtl">
      <Messages innerRef={message} />
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
        </CardHeader>
      </Card>

      {/* Settings Accordion */}
      <Accordion type="single" collapsible defaultValue="company" className="space-y-4">
        <AccordionItem value="company">
          <AccordionTrigger className="text-lg font-semibold text-foreground">معلومات الشركة</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
                <div className="md:col-span-2">
                  <Label htmlFor="companyLogo" className="mb-2 block text-right">شعار الشركة</Label>
                  <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
                      {settings.companyLogo ? (
                        <img src={settings.companyLogo} alt="شعار الشركة" className="h-full w-full object-contain" />
                      ) : (
                        <Building2 className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-[220px] flex-1 space-y-2">
                      <Input
                        id="companyLogo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setSettings((current) => ({ ...current, companyLogo: String(reader.result || "") }))
                          reader.readAsDataURL(file)
                        }}
                      />
                      <p className="text-xs text-muted-foreground">PNG أو JPG أو WEBP أو SVG. سيظهر الشعار أعلى القائمة الجانبية.</p>
                      {settings.companyLogo && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setSettings((current) => ({ ...current, companyLogo: "" }))}>
                          إزالة الشعار
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="licensedWorkerNumber" className="text-right block">
                    رقم المشتغل المرخص
                  </Label>
                  <Input
                    id="licensedWorkerNumber"
                    value={settings.licensedWorkerNumber}
                    onChange={(e) => setSettings({ ...settings, licensedWorkerNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 30) })}
                    maxLength={30}
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
                    onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) })}
                    maxLength={20}
                    className="text-left"
                    dir="ltr"
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
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="system">
          <AccordionTrigger className="text-lg font-semibold text-foreground">إعدادات النظام</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
                <div>
                  <Label htmlFor="taxRate" className="text-right block">
                    نسبة الضريبة
                  </Label>
                  <Input
                    id="taxRate"
                    type="number"
                    step="0.01"
                    value={settings.taxRate}
                    onChange={(e) => setSettings({ ...settings, taxRate: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="taxRateClearing" className="text-right block">
                    نسبة الضريبة-مقاصة
                  </Label>
                  <Input
                    id="taxRateClearing"
                    type="number"
                    step="0.01"
                    value={settings.taxRateClearing}
                    onChange={(e) => setSettings({ ...settings, taxRateClearing: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="business">
          <AccordionTrigger className="text-lg font-semibold text-foreground">إعدادات العمل</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="accounts">
          <AccordionTrigger className="text-lg font-semibold text-foreground">الحسابات الافتراضية</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
                      label=""
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
                      requiredTypeValues={[1]}
                      leafOnly
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="product_accounts">
          <AccordionTrigger className="text-lg font-semibold text-foreground">الحسابات الافتراضية للاصناف</AccordionTrigger>
        <AccordionContent className="space-y-4">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-right">
                <Building2 className="h-5 w-5" />
                الحسابات الافتراضية للاصناف
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {productAccountFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-right block">{field.label}</Label>
                    <AutoCompleteAccount
                      label=""
                      value={settings[field.key as ProductAccountFieldKey]}
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
                      placeholder=""
                      className="w-full"
                      showCostCenterButton={false}
                      requiredTypeValues={[1]}
                      leafOnly
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="security">
          <AccordionTrigger className="text-lg font-semibold text-foreground">الأمان</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="documents">
          <AccordionTrigger className="text-lg font-semibold text-foreground">السندات</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          مثال: {buildVoucherCode(settings.orderPrefix, "A", settings.orderStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          مثال: {buildVoucherCode(settings.purchasePrefix, "A", settings.purchaseStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="receiptPrefix" className="text-right block">
                          بادئة سندات القبض *
                        </Label>
                        <Input
                          id="receiptPrefix"
                          value={settings.receiptPrefix}
                          onChange={(e) => setSettings({ ...settings, receiptPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="receiptStart" className="text-right block">
                          الترقيم يبدأ من (سندات القبض) *
                        </Label>
                        <Input
                          id="receiptStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.receiptStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, receiptStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.receiptPrefix, "A", settings.receiptStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="paymentPrefix" className="text-right block">
                          بادئة سندات الصرف *
                        </Label>
                        <Input
                          id="paymentPrefix"
                          value={settings.paymentPrefix}
                          onChange={(e) => setSettings({ ...settings, paymentPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="paymentStart" className="text-right block">
                          الترقيم يبدأ من (سندات الصرف) *
                        </Label>
                        <Input
                          id="paymentStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.paymentStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, paymentStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.paymentPrefix, "A", settings.paymentStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="creditNotePrefix" className="text-right block">
                          بادئة الاشعار الدائن *
                        </Label>
                        <Input
                          id="creditNotePrefix"
                          value={settings.creditNotePrefix}
                          onChange={(e) => setSettings({ ...settings, creditNotePrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="creditNoteStart" className="text-right block">
                          الترقيم يبدأ من (الاشعار الدائن) *
                        </Label>
                        <Input
                          id="creditNoteStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.creditNoteStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, creditNoteStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.creditNotePrefix, "A", settings.creditNoteStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="debitNotePrefix" className="text-right block">
                          بادئة الاشعار المدين *
                        </Label>
                        <Input
                          id="debitNotePrefix"
                          value={settings.debitNotePrefix}
                          onChange={(e) => setSettings({ ...settings, debitNotePrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="debitNoteStart" className="text-right block">
                          الترقيم يبدأ من (الاشعار المدين) *
                        </Label>
                        <Input
                          id="debitNoteStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.debitNoteStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, debitNoteStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.debitNotePrefix, "A", settings.debitNoteStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="stockInPrefix" className="text-right block">
                          بادئة سند ادخال بضاعة *
                        </Label>
                        <Input
                          id="stockInPrefix"
                          value={settings.stockInPrefix}
                          onChange={(e) => setSettings({ ...settings, stockInPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="stockInStart" className="text-right block">
                          الترقيم يبدأ من (سند ادخال بضاعة) *
                        </Label>
                        <Input
                          id="stockInStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.stockInStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, stockInStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.stockInPrefix, "A", settings.stockInStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="stockOutPrefix" className="text-right block">
                          بادئة سند اخراج بضاعة *
                        </Label>
                        <Input
                          id="stockOutPrefix"
                          value={settings.stockOutPrefix}
                          onChange={(e) => setSettings({ ...settings, stockOutPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="stockOutStart" className="text-right block">
                          الترقيم يبدأ من (سند اخراج بضاعة) *
                        </Label>
                        <Input
                          id="stockOutStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.stockOutStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, stockOutStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.stockOutPrefix, "A", settings.stockOutStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="internalDeliveryPrefix" className="text-right block">
                          بادئة ارسالية داخلية *
                        </Label>
                        <Input
                          id="internalDeliveryPrefix"
                          value={settings.internalDeliveryPrefix}
                          onChange={(e) => setSettings({ ...settings, internalDeliveryPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="internalDeliveryStart" className="text-right block">
                          الترقيم يبدأ من (ارسالية داخلية) *
                        </Label>
                        <Input
                          id="internalDeliveryStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.internalDeliveryStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, internalDeliveryStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.internalDeliveryPrefix, "A", settings.internalDeliveryStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="useVoucherPrefix" className="text-right block">
                          بادئة سند استعمال *
                        </Label>
                        <Input
                          id="useVoucherPrefix"
                          value={settings.useVoucherPrefix}
                          onChange={(e) => setSettings({ ...settings, useVoucherPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="useVoucherStart" className="text-right block">
                          الترقيم يبدأ من (سند استعمال) *
                        </Label>
                        <Input
                          id="useVoucherStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.useVoucherStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, useVoucherStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.useVoucherPrefix, "A", settings.useVoucherStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
                    </div>
                  </div>

                  {([
                    { key: "salesInvoice", label: "فاتورة مبيعات" },
                    { key: "deliverySell", label: "إرسالية مبيعات" },
                    { key: "deliveryConsignmentSale", label: "إرسالية برسم البيع" },
                    { key: "returnDeliveryConsignmentSale", label: "مرتجع إرسالية برسم البيع" },
                    { key: "returnSell", label: "مرتجع مبيعات" },
                    { key: "purchaseInvoice", label: "فاتورة مشتريات" },
                    { key: "deliveryPay", label: "إرسالية مشتريات" },
                    { key: "returnPurchase", label: "مرتجع مشتريات" },
                  ] as const).map(({ key, label }) => {
                    const prefixKey = `${key}Prefix` as keyof typeof settings
                    const startKey = `${key}Start` as keyof typeof settings
                    const prefixValue = settings[prefixKey] as string
                    const startValue = settings[startKey] as number
                    return (
                      <div key={key} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor={`${key}Prefix`} className="text-right block">
                              بادئة {label} *
                            </Label>
                            <Input
                              id={`${key}Prefix`}
                              value={prefixValue}
                              onChange={(e) => setSettings({ ...settings, [prefixKey]: e.target.value })}
                              className="text-right"
                              dir="rtl"
                              maxLength={3}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor={`${key}Start`} className="text-right block">
                              الترقيم يبدأ من ({label}) *
                            </Label>
                            <Input
                              id={`${key}Start`}
                              type="number"
                              min="1"
                              max="10000"
                              value={startValue}
                              onChange={(e) => {
                                const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                                setSettings({ ...settings, [startKey]: value })
                              }}
                              className="text-right"
                              dir="rtl"
                              required
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="text-sm text-muted-foreground">
                              مثال: {buildVoucherCode(prefixValue, "A", startValue)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="journalPrefix" className="text-right block">
                          بادئة سندات القيد *
                        </Label>
                        <Input
                          id="journalPrefix"
                          value={settings.journalPrefix}
                          onChange={(e) => setSettings({ ...settings, journalPrefix: e.target.value })}
                          className="text-right"
                          dir="rtl"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="journalStart" className="text-right block">
                          الترقيم يبدأ من (سندات القيد) *
                        </Label>
                        <Input
                          id="journalStart"
                          type="number"
                          min="1"
                          max="10000"
                          value={settings.journalStart}
                          onChange={(e) => {
                            const value = e.target.value === "" ? 1 : Number.parseInt(e.target.value)
                            setSettings({ ...settings, journalStart: value })
                          }}
                          className="text-right"
                          dir="rtl"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          مثال: {buildVoucherCode(settings.journalPrefix, "A", settings.journalStart)} (A = دفتر السندات، والكود الكلي لا يتجاوز 10 خانات)
                        </div>
                      </div>
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
                      بادئة العملاء
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
                      بداية ترقيم العملاء
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
                    <Label htmlFor="salesmanPrefix" className="text-right block">بادئة المندوبين</Label>
                    <Input id="salesmanPrefix" value={settings.salesmanPrefix} onChange={(e) => setSettings({ ...settings, salesmanPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9) })} className="text-right" dir="rtl" placeholder="M" />
                  </div>
                  <div>
                    <Label htmlFor="salesmanStart" className="text-right block">الترقيم يبدأ من</Label>
                    <Input id="salesmanStart" type="number" min="1" value={settings.salesmanStart} onChange={(e) => setSettings({ ...settings, salesmanStart: e.target.value === "" ? 1 : Number.parseInt(e.target.value) })} className="text-right" dir="rtl" placeholder="1" />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">مثال: {settings.salesmanPrefix}{String(settings.salesmanStart).padStart(Math.max(1, 10 - settings.salesmanPrefix.length), "0")}</div>
                  </div>

                  <div>
                    <Label htmlFor="employeePrefix" className="text-right block">بادئة الموظفين</Label>
                    <Input id="employeePrefix" value={settings.employeePrefix} onChange={(e) => setSettings({ ...settings, employeePrefix: e.target.value })} className="text-right" dir="rtl" placeholder="E" />
                  </div>
                  <div>
                    <Label htmlFor="employeeStart" className="text-right block">الرقم يبدأ من</Label>
                    <Input id="employeeStart" type="number" min="1" value={settings.employeeStart} onChange={(e) => setSettings({ ...settings, employeeStart: e.target.value === "" ? 1 : Number.parseInt(e.target.value) })} className="text-right" dir="rtl" placeholder="1" />
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-muted-foreground">مثال: {settings.employeePrefix}{String(settings.employeeStart).padStart(Math.max(1, 10 - settings.employeePrefix.length), "0")}</div>
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
        </AccordionContent>
        </AccordionItem>
        <AccordionItem value="printing">
          <AccordionTrigger className="text-lg font-semibold text-foreground">الطباعة</AccordionTrigger>
        <AccordionContent className="space-y-4">
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
        </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}



