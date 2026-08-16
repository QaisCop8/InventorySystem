"use client"

import type React from "react"
import { Suspense, useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ERPLayout } from "@/components/erp-layout"
import { activateCompany } from "@/lib/tenant-client"
import { SECTION_TITLES } from "@/components/sidebar"
import { useWorkspace } from "@/contexts/workspace-context"
import { WorkspacePane } from "@/components/workspace/workspace-pane"


// Import all components
const Dashboard = dynamic(() => import("@/components/dashboard").then((mod) => mod.Dashboard), { ssr: false })
import dynamic from "next/dynamic"

// Dynamically import heavy client-only components to avoid pulling browser-only
// libraries (e.g. @grapecity/wijmo) into the server prerender bundle.
const SalesOrders = dynamic(() => import("@/components/orders/sales-orders").then(mod => mod.SalesOrders), { ssr: false })
const SaleInvoices = dynamic(() => import("@/components/orders/sale-invoices").then(mod => mod.SaleInvoices), { ssr: false })
const Products = dynamic(() => import("@/components/products/products").then(mod => mod.Products), { ssr: false })
const Services = dynamic(() => import("@/components/products/services").then(mod => mod.Services), { ssr: false })
const lazyNamed = (loader: () => Promise<any>, name: string) => dynamic(() => loader().then((mod) => mod[name]), { ssr: false })
const lazyDefault = (loader: () => Promise<any>) => dynamic(loader, { ssr: false })
const OrderReports = lazyNamed(() => import("@/components/reports/order-reports"), "OrderReports")
const ProductReports = lazyNamed(() => import("@/components/reports/product-reports"), "ProductReports")
const Customers = lazyDefault(() => import("@/components/products/customers"))
const ProductGroups = lazyDefault(() => import("@/components/products/product-groups"))
const BrandTypes = lazyDefault(() => import("@/components/products/brand-types"))
const Brands = lazyDefault(() => import("@/components/products/brands"))
const Cars = lazyDefault(() => import("@/components/products/cars"))
const Drivers = lazyDefault(() => import("@/components/products/drivers"))
const ExchangeRates = lazyNamed(() => import("@/components/data/exchange-rates"), "ExchangeRates")
const BatchMovements = lazyNamed(() => import("@/components/inventory/batch-movements"), "BatchMovements")
const BatchReports = lazyNamed(() => import("@/components/reports/batch-reports"), "BatchReports")
const BatchLogReport = lazyNamed(() => import("@/components/reports/batch-log-report"), "BatchLogReport")
const InventoryAnalytics = lazyNamed(() => import("@/components/inventory/inventory-analytics"), "InventoryAnalytics")
const AutomatedReorderSystem = lazyNamed(() => import("@/components/inventory/automated-reorder-system"), "AutomatedReorderSystem")
const BarcodeManagement = lazyNamed(() => import("@/components/barcode/barcode-management"), "BarcodeManagement")
const OrderTrackingDashboard = lazyNamed(() => import("@/components/workflow/order-tracking-dashboard"), "OrderTrackingDashboard")
const LotOpener = lazyNamed(() => import("@/components/inventory/lot-opener"), "LotOpener")
const LotStatusManager = lazyNamed(() => import("@/components/inventory/lot-status-manager"), "LotStatusManager")
const CustomerPortalAdmin = lazyNamed(() => import("@/components/customer-portal/customer-portal-admin"), "CustomerPortalAdmin")
const WhatsAppNotificationSettings = lazyNamed(() => import("@/components/inventory/whatsapp-notification-settings"), "WhatsAppNotificationSettings")
const Accounts = lazyDefault(() => import("@/components/accounts"))
const UnifiedAccounts = lazyDefault(() => import("@/components/customer/unified-accounts-refactored"))
const Banks = lazyDefault(() => import("@/components/admin/banks"))
const Branches = lazyDefault(() => import("@/components/admin/branches"))
const BankAccounts = lazyDefault(() => import("@/components/admin/bank-accounts"))
const Receipts = lazyDefault(() => import("@/components/accounting/receipts"))
const Journal = lazyDefault(() => import("@/components/accounting/journal"))
const CreditNote = lazyDefault(() => import("@/components/accounting/credit-note"))
const CreditCards = lazyDefault(() => import("@/components/admin/credit-cards"))
const ChequesBooks = lazyDefault(() => import("@/components/admin/cheques-books"))
const VoucherBookPermissions = lazyDefault(() => import("@/components/settings/voucher-book-permissions"))
const Warehouses = lazyDefault(() => import("@/components/admin/warehouses"))
const StockVouchers = dynamic(() => import("@/components/inventory/stock-vouchers"), { ssr: false })
const SalesDelivery = dynamic(() => import("@/components/sales/sales-delivery"), { ssr: false })

const AIChat = lazyNamed(() => import("@/components/ai-assistant/ai-chat"), "AIChat")
const SmartAnalyticsDashboard = lazyNamed(() => import("@/components/ai-analytics/smart-analytics-dashboard"), "SmartAnalyticsDashboard")
const SmartInventoryRecommendations = lazyNamed(() => import("@/components/ai-recommendations/smart-inventory-recommendations"), "SmartInventoryRecommendations")
const PrintSettings = lazyDefault(() => import("@/components/settings/print-settings"))
const VoucherSettings = lazyDefault(() => import("@/components/settings/voucher-settings"))
const DocumentSettings = lazyDefault(() => import("@/components/settings/document-settings"))
const Permissions = lazyDefault(() => import("@/components/settings/permissions"))
const JobRoles = lazyDefault(() => import("@/components/settings/job-roles"))
const RolePermissions = lazyDefault(() => import("@/components/settings/role-permissions"))
const UserBranchAccessMatrix = lazyDefault(() => import("@/components/settings/user-branch-access-matrix"))
const GeneralSettings = lazyDefault(() => import("@/components/settings/general-settings"))
const VouchersGeneralSettings = lazyDefault(() => import("@/components/settings/vouchers-general-settings"))
const APISettings = lazyDefault(() => import("@/components/settings/api-settings"))
const SystemSettings = lazyNamed(() => import("@/components/settings/system-settings"), "SystemSettings")
const UserSettings = lazyNamed(() => import("@/components/settings/user-settings"), "UserSettings")
const ThemeCustomization = lazyNamed(() => import("@/components/settings/theme-customization"), "ThemeCustomization")
const Definitions = lazyNamed(() => import("@/components/settings/definitions"), "Definitions")
const FontSettings = lazyDefault(() => import("@/components/settings/font-settings"))
const QADashboard = lazyDefault(() => import("@/components/qa-dashboard"))
const WelcomeDashboard = lazyDefault(() => import("@/components/dashboard/welcome-dashboard"))
const PervasiveSettings = lazyDefault(() => import("@/app/settings/pervasive/page"))
const OrderMigrate = lazyNamed(() => import("@/components/Migration/orders-migration"), "OrderMigrate")
const OrderManagement = lazyNamed(() => import("@/components/orders/order-management"), "OrderManagement")
const TaskOrdersAdminPage = lazyDefault(() => import("@/components/task-orders/task-orders-admin-page"))
const TaskOrdersBoardPage = lazyDefault(() => import("@/components/task-orders/task-orders-board-page"))
const TaskOrdersReportPage = lazyDefault(() => import("@/components/task-orders/task-orders-report-page"))
const TaskOrdersApprovalPage = lazyDefault(() => import("@/components/task-orders/order-approval-page"))
const DraftOrdersPage = lazyNamed(() => import("@/components/order-drafts/draft-orders-page"), "DraftOrdersPage")
const OrderConfirmationBoard = lazyNamed(() => import("@/components/order-drafts/order-confirmation-board"), "OrderConfirmationBoard")
const ChecklistDesigner = lazyNamed(() => import("@/components/order-drafts/checklist-designer"), "ChecklistDesigner")
const componentMap: Record<string, React.ComponentType<any>> = {
  dashboard: Dashboard,
  "inventory-analytics": InventoryAnalytics,
  "automated-reorder": AutomatedReorderSystem,
  "whatsapp-notifications": WhatsAppNotificationSettings,
  "barcode-management": BarcodeManagement,
  "order-tracking": OrderTrackingDashboard,
  "lot-opener": LotOpener,
  "lot-status-manager": LotStatusManager,
  "theme-customization": ThemeCustomization,
  "order-reports": OrderReports,
  "product-reports": ProductReports,
  "batch-log-report": BatchLogReport,
  "batch-reports": BatchReports,
  "sales-orders": SalesOrders,
  "sale-invoices": SaleInvoices,
  "purchase-orders": (props: any) => <SalesOrders {...props} isPurchase={true} />,
  "batch-movements": BatchMovements,
  products: Products,
  services: Services,
  customers: Customers,
  suppliers: (props: any) => <Customers {...props} isSupplier={true} />,
  subscribers: (props: any) => <Customers {...props} isSubscriber={true} />,
  salesmen: (props: any) => <Customers {...props} isSalesman={true} />,
  cars: Cars,
  drivers: Drivers,
  banks: Banks,
  branches: Branches,
  "bank-accounts": BankAccounts,
  // أرقام أنواع السندات هنا مطابقة لـvoucher_types_tbl بعد إعادة ترقيمها (حذف المكرَّرات 3-6 في
  // 2026-07-30) — لا يمكن استيراد الثوابت الفعلية من app/api/**/_lib.ts مباشرة هنا (هذا ملف "use
  // client"، وتلك الملفات تستورد sql من lib/database.ts وهو خادمي فقط)، فتُبقى كأرقام حرفية لكن
  // مطابقة تماماً لما بعد إعادة الترقيم.
  "receipt-vouchers": (props: any) => <Receipts {...props} voucherType={4} />,
  "payment-vouchers": (props: any) => <Receipts {...props} voucherType={5} />,
  "journal-vouchers": Journal,
  "credit-notes": (props: any) => <CreditNote {...props} voucherType={6} />,
  "debit-notes": (props: any) => <CreditNote {...props} voucherType={7} />,
  "credit-cards": CreditCards,
  "cheques-books": ChequesBooks,
  "voucher-book-permissions": VoucherBookPermissions,
  warehouses: Warehouses,
  "stock-in-vouchers": (props: any) => <StockVouchers {...props} voucherType={8} />,
  "stock-out-vouchers": (props: any) => <StockVouchers {...props} voucherType={9} />,
  "internal-delivery-vouchers": (props: any) => <StockVouchers {...props} voucherType={10} />,
  "use-vouchers": (props: any) => <StockVouchers {...props} voucherType={11} />,
  "sales-invoices": (props: any) => <SalesDelivery {...props} voucherType={12} />,
  "sales-delivery": (props: any) => <SalesDelivery {...props} voucherType={13} />,
  "delivery-consignment-sale": (props: any) => <SalesDelivery {...props} voucherType={14} />,
  "return-delivery-consignment-sale": (props: any) => <SalesDelivery {...props} voucherType={15} />,
  "return-sell": (props: any) => <SalesDelivery {...props} voucherType={16} />,
  "purchase-invoices": (props: any) => <SalesDelivery {...props} voucherType={17} />,
  "delivery-pay": (props: any) => <SalesDelivery {...props} voucherType={18} />,
  "return-purchase": (props: any) => <SalesDelivery {...props} voucherType={19} />,
  "product-groups": ProductGroups,
  "brand-types": BrandTypes,
  brands: Brands,
  definitions: Definitions,
  accounts: Accounts,
  "unified-accounts": UnifiedAccounts,
  "print-settings": PrintSettings,
  "voucher-settings": VoucherSettings,
  "document-settings": DocumentSettings,
  permissions: Permissions,
  "job-roles": JobRoles,
  "role-permissions": RolePermissions,
  "user-branch-access-matrix": UserBranchAccessMatrix,
  "general-settings": GeneralSettings,
  "vouchers-general-settings": VouchersGeneralSettings,
  "api-settings": APISettings,
  "exchange-rates": ExchangeRates,
  "system-settings": SystemSettings,
  "user-settings": UserSettings,
  "user-default-accounts": (props: any) => {
    const Component = require('@/components/settings/virtual-accounts').default
    return <Component {...props} />
  },
  "font-settings": FontSettings,
  "qa-dashboard": QADashboard,
  "home-dashboard": WelcomeDashboard,
  "pervasive-settings": PervasiveSettings,
  "customer-portal-admin": CustomerPortalAdmin,
  "ai-assistant": AIChat,
  "smart-analytics": SmartAnalyticsDashboard,
  "smart-inventory": SmartInventoryRecommendations,
  "orders-migration": OrderMigrate,
  "order-management": OrderManagement,
  "task-orders-admin": TaskOrdersAdminPage,
  "task-orders-board": TaskOrdersBoardPage,
  "task-orders-report": TaskOrdersReportPage,
  "task-orders-approval": TaskOrdersApprovalPage,
  "draft-sales-order": DraftOrdersPage,
  "order-confirmation": OrderConfirmationBoard,
  "order-checklists": ChecklistDesigner,
}

const titleFor = (section: string) => SECTION_TITLES[section] || section

// مُستخرَج من renderContent السابقة بلا تغيير بالمنطق — الفرق الوحيد أنها تأخذ section كمعامل
// بدل قراءته من حالة activeSection المُغلَقة عليها، لتُستخدم بكل جزء (pane) من مساحة العمل على
// حدة (انظر WorkspacePane)، بما فيها احتمال وجود قسمين مختلفين مفتوحين بآن واحد بالشاشة المقسمة.
function resolveSectionNode(section: string | null, onOpenSection: (section: string) => void): React.ReactNode {
  if (!section || section === "home-dashboard") {
    return <WelcomeDashboard onOpenSection={onOpenSection} />
  }

  const Component = componentMap[section]
  if (Component) {
    if (typeof Component !== "function") {
      console.error("[v0] Invalid component type detected for section", section, Component)
    }
    return <Component />
  }

  if (section === "user-profile") {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">الملف الشخصي</h1>
          <p className="text-blue-100">إدارة معلوماتك الشخصية وإعدادات الحساب</p>
        </div>
        <UserSettings />
      </div>
    )
  }

  return <WelcomeDashboard onOpenSection={onOpenSection} />
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  )
}

function HomePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openSection, currentSection, focusedPaneId, tabsEnabled, splitEnabled } = useWorkspace()
  const activeSection = currentSection(focusedPaneId)

  // يُعمِّر تبويب البداية بالجزء "a" حسب رابط العنوان — استبدال لما كان سابقاً initializer لـ
  // useState (نفّذ مرة واحدة عند أول عرض فقط)، الآن عبر workspace بدل حالة activeSection مباشرة.
  useEffect(() => {
    const fromUrl = searchParams.get("section")
    if (!fromUrl) return
    const resolved = fromUrl === "home-dashboard" || fromUrl === "dashboard" || componentMap[fromUrl] ? fromUrl : null
    if (resolved) openSection(resolved, titleFor(resolved), "a")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // مزامنة القسم المعروض مع رابط العنوان عند تنقّل "رجوع"/"تقدّم" بالمتصفح — handleSectionChange
  // تستخدم router.push الآن (لا replace) فيتراكم سجلّ حقيقي بتاريخ المتصفح لكل قسم، لكن تنقّل history
  // API (رجوع/تقدّم) يُغيّر searchParams وحده دون إعادة تركيب هذا المكوّن أو إعادة تشغيل الأثر أعلاه
  // (ذو الاعتماديات []) — فيبقى القسم المعروض كما هو ولا يتبع رابط العنوان الجديد بلا هذا الأثر.
  // الحارس (resolved === activeSection) يمنع استدعاءً مكرَّراً زائداً بلا داعٍ عند تنقّل بدأناه نحن
  // أصلاً عبر handleSectionChange (التي تُحدِّث activeSection مباشرة أولاً قبل router.push) — openSection
  // تصنع تبويباً جديداً في كل استدعاء بوضع "بلا تبويبات" (tabsEnabled=false)، فإعادة تنفيذها لنفس
  // القسم فعلياً تُعيد تركيب الشاشة وتفقد أي حالة غير محفوظة بلا داعٍ.
  const didInitialUrlSync = useRef(false)
  useEffect(() => {
    // التشغيل الأول عند التركيب مُتكفَّل به بالفعل بالأثر أعلاه (بادئ الجزء "a")؛ هذا الأثر يتعامل
    // فقط مع تغييرات searchParams اللاحقة (رجوع/تقدّم، أو push ذاتي من handleSectionChange).
    if (!didInitialUrlSync.current) {
      didInitialUrlSync.current = true
      return
    }
    const fromUrl = searchParams.get("section")
    const resolved =
      !fromUrl || fromUrl === "home-dashboard" || fromUrl === "dashboard"
        ? "home-dashboard"
        : componentMap[fromUrl]
          ? fromUrl
          : "home-dashboard"
    if (resolved === activeSection) return
    openSection(resolved, titleFor(resolved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    // تبويب جديد فُتح برابط يحمل ?company=<id> (لصق الرابط يدوياً، أو فتحه من مكان لا يُورث
    // sessionStorage للتبويب الأصلي) — يعيد تنفيذ اختيار الشركة لتعمير sessionStorage لهذا
    // التبويب تحديداً (كوكي tenant_db وحدها لا تكفي لأنها مشتركة بين كل التبويبات). التبويب الذي
    // نفّذ الاختيار أصلاً من شركاتي يصل هنا وقد عمّر sessionStorage مسبقاً فيتخطى هذا مباشرة.
    const companyIdParam = searchParams.get("company")
    if (!companyIdParam) return
    if (sessionStorage.getItem("active_company_id") === companyIdParam) return

    activateCompany(Number(companyIdParam))
      .then((result) => {
        if (result.success) window.location.reload()
      })
      .catch(() => {
        // تجاهل — ستتولى ProtectedRoute التحويل لتسجيل دخول الإدارة كالمعتاد إن تعذّر هذا
      })
  }, [searchParams])

  // عند كل دخول للنظام (تحميل هذا المكوّن مرة واحدة عقب تسجيل الدخول)، إن لم تكن أي عملة معرَّفة
  // بعد لهذه الشركة (شركة حديثة التزويد مثلاً)، نوجّه المستخدم مباشرة لشاشة تعريف العملات بدل ترك
  // الشاشات الأخرى (تسعير، فواتير...) تفشل بصمت لغياب عملة أساس.
  useEffect(() => {
    let cancelled = false
    fetch("/api/exchange-rates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const list = Array.isArray(data?.rates) ? data.rates : []
        if (list.length === 0) handleSectionChange("exchange-rates")
      })
      .catch(() => {
        // تجاهل — ليست فحصاً حرجاً يمنع استخدام النظام
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const removeLicenseNodes = (root: ParentNode) => {
      const elements = root instanceof HTMLElement ? [root, ...root.querySelectorAll<HTMLElement>("*")] : root.querySelectorAll<HTMLElement>("*")
      elements.forEach((element) => {
        const text = element.innerText
        const isLicenseText = text?.includes("Wijmo Evaluation") || text?.includes("Wijmo License")
        const hasMatchingChild = Array.from(element.children).some((child) => {
          const childText = (child as HTMLElement).innerText
          return childText?.includes("Wijmo Evaluation") || childText?.includes("Wijmo License")
        })
        if (isLicenseText && !hasMatchingChild) element.remove()
      })
    }

    // One initial scan, then inspect only nodes added by Wijmo. The previous
    // implementation rescanned the entire document after every DOM mutation.
    removeLicenseNodes(document.body)
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) removeLicenseNodes(node)
      }))
    })
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const storedUser =
      localStorage.getItem("erp_user") ||
      sessionStorage.getItem("erp_user")

    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const storedUser =
        localStorage.getItem("erp_user") ||
        sessionStorage.getItem("erp_user")

      if (!storedUser) return

      const user = JSON.parse(storedUser)
      const defaultScreen = user?.dashboard_layout?.default_screen

      if (!defaultScreen || defaultScreen === "dashboard") return

      const resolved = componentMap[defaultScreen] ? defaultScreen : "home-dashboard"
      openSection(resolved, titleFor(resolved))
    }

    window.addEventListener("OPEN_DEFAULT_SCREEN", handler)

    return () => window.removeEventListener("OPEN_DEFAULT_SCREEN", handler)
  }, [user, openSection])

  // جسر تنقّل عام بين مكوّنات الأقسام الشقيقة (لا قناة props مباشرة بينها — كل قسم يُصيَّر بلا أي
  // props عبر componentMap، انظر `<Component />` أدناه) — نفس فكرة OPEN_DEFAULT_SCREEN أعلاه، لكن
  // بغرض عام. مثال الاستخدام الحالي: زر "تعديل الصلاحيات" بـcomponents/settings/user-settings.tsx
  // يفتح شاشة الصلاحيات مباشرة بدل تنبيه بديل (alert) كان يعرضه فقط.
  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<{ section: string }>).detail?.section
      if (section && componentMap[section]) {
        openSection(section, titleFor(section))
      }
    }
    window.addEventListener("OPEN_SECTION", handler)
    return () => window.removeEventListener("OPEN_SECTION", handler)
  }, [openSection])

  const handleSectionChange = (section: string) => {
    console.log("[v0] Section change requested:", section)

    const resolved =
      section === "home-dashboard" || section === "dashboard"
        ? "home-dashboard"
        : componentMap[section]
          ? section
          : "home-dashboard"

    openSection(resolved, titleFor(resolved))
    // يُبقي رابط العنوان مطابقاً للقسم الحالي — يتيح فتح نفس القسم في تبويب جديد
    // (كليك أوسط/يمين على عنصر القائمة الجانبية) بدل الرجوع دائماً للرئيسية.
    // push لا replace: كل تنقّل قسم يُضيف سجلّاً حقيقياً بتاريخ المتصفح، حتى يعمل زر "رجوع" فعلياً
    // بالتنقّل بين الأقسام المفتوحة سابقاً — replace كانت تستبدل السجلّ الحالي في كل مرة، فيقفز زر
    // "رجوع" مباشرة لما قبل أول تنقّل قسم على الإطلاق (شاشة تسجيل الدخول عادة) بصرف النظر عن عدد
    // الأقسام التي زارها المستخدم بينهما.
    router.push(resolved === "home-dashboard" ? "/" : `/?section=${resolved}`, { scroll: false })
  }

  return (
    <ProtectedRoute>
      <ERPLayout activeSection={activeSection || ""} onSectionChange={handleSectionChange}>
        <div className="flex-1 overflow-hidden flex flex-row gap-2">
          <WorkspacePane
            paneId="a"
            showTabStrip={tabsEnabled}
            showFocusRing={splitEnabled}
            renderSection={(section) => resolveSectionNode(section, handleSectionChange)}
          />
          {splitEnabled && <div className="w-px bg-border shrink-0" />}
          {splitEnabled && (
            <WorkspacePane
              paneId="b"
              showTabStrip={tabsEnabled}
              showFocusRing={splitEnabled}
              renderSection={(section) => resolveSectionNode(section, handleSectionChange)}
            />
          )}
        </div>
      </ERPLayout>
    </ProtectedRoute>
  )
}
