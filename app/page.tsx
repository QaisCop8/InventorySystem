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
import { OrderReports } from "@/components/reports/order-reports"
import { ProductReports } from "@/components/reports/product-reports"

import dynamic from "next/dynamic"

// Dynamically import heavy client-only components to avoid pulling browser-only
// libraries (e.g. @grapecity/wijmo) into the server prerender bundle.
const SalesOrders = dynamic(() => import("@/components/orders/sales-orders").then(mod => mod.SalesOrders), { ssr: false })
const SaleInvoices = dynamic(() => import("@/components/orders/sale-invoices").then(mod => mod.SaleInvoices), { ssr: false })
const Products = dynamic(() => import("@/components/products/products").then(mod => mod.Products), { ssr: false })
const Services = dynamic(() => import("@/components/products/services").then(mod => mod.Services), { ssr: false })
import Customers from "@/components/products/customers"
import ProductGroups from "@/components/products/product-groups"
import BrandTypes from "@/components/products/brand-types"
import Brands from "@/components/products/brands"
import Cars from "@/components/products/cars"
import Drivers from "@/components/products/drivers"
import { ExchangeRates } from "@/components/data/exchange-rates"
import { BatchMovements } from "@/components/inventory/batch-movements"
import { BatchReports } from "@/components/reports/batch-reports"
import { BatchLogReport } from "@/components/reports/batch-log-report"
import { InventoryAnalytics } from "@/components/inventory/inventory-analytics"
import { AutomatedReorderSystem } from "@/components/inventory/automated-reorder-system"
import { BarcodeManagement } from "@/components/barcode/barcode-management"
import { OrderTrackingDashboard } from "@/components/workflow/order-tracking-dashboard"
import { LotOpener } from "@/components/inventory/lot-opener"
import { LotStatusManager } from "@/components/inventory/lot-status-manager"
import { CustomerPortalAdmin } from "@/components/customer-portal/customer-portal-admin"
import { WhatsAppNotificationSettings } from "@/components/inventory/whatsapp-notification-settings"
import Accounts from "@/components/accounts"
import UnifiedAccounts from "@/components/customer/unified-accounts-refactored"
import Banks from "@/components/admin/banks"
import Branches from "@/components/admin/branches"
import BankAccounts from "@/components/admin/bank-accounts"
import Receipts from "@/components/accounting/receipts"
import Journal from "@/components/accounting/journal"
import CreditNote from "@/components/accounting/credit-note"
import CreditCards from "@/components/admin/credit-cards"
import ChequesBooks from "@/components/admin/cheques-books"
import VoucherBookPermissions from "@/components/settings/voucher-book-permissions"
import Warehouses from "@/components/admin/warehouses"
const StockVouchers = dynamic(() => import("@/components/inventory/stock-vouchers"), { ssr: false })
const SalesDelivery = dynamic(() => import("@/components/sales/sales-delivery"), { ssr: false })

import { AIChat } from "@/components/ai-assistant/ai-chat"
import { SmartAnalyticsDashboard } from "@/components/ai-analytics/smart-analytics-dashboard"
import { SmartInventoryRecommendations } from "@/components/ai-recommendations/smart-inventory-recommendations"

// Settings components
import PrintSettings from "@/components/settings/print-settings"
import VoucherSettings from "@/components/settings/voucher-settings"
import DocumentSettings from "@/components/settings/document-settings"
import Permissions from "@/components/settings/permissions"
import JobRoles from "@/components/settings/job-roles"
import RolePermissions from "@/components/settings/role-permissions"
import GeneralSettings from "@/components/settings/general-settings"
import VouchersGeneralSettings from "@/components/settings/vouchers-general-settings"
import APISettings from "@/components/settings/api-settings"
import { SystemSettings } from "@/components/settings/system-settings"
import { UserSettings } from "@/components/settings/user-settings"
import { ThemeCustomization } from "@/components/settings/theme-customization"
import { Definitions } from "@/components/settings/definitions"
import FontSettings from "@/components/settings/font-settings"
import QADashboard from "@/components/qa-dashboard"
import WelcomeDashboard from "@/components/dashboard/welcome-dashboard"
import PervasiveSettings from "@/app/settings/pervasive/page"
import { OrderMigrate } from "@/components/Migration/orders-migration"
import  {OrderManagement} from "@/components/orders/order-management"
import TaskOrdersAdminPage from "@/components/task-orders/task-orders-admin-page"
import TaskOrdersBoardPage from "@/components/task-orders/task-orders-board-page"
import TaskOrdersReportPage from "@/components/task-orders/task-orders-report-page"
import TaskOrdersApprovalPage from "@/components/task-orders/order-approval-page"
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
    const removeWijmoEval = () => {
      document.body.querySelectorAll<HTMLElement>("*").forEach((e) => {
        if (e.innerText?.includes("Wijmo Evaluation")) {
          e.remove()
        }
        if (e.innerText?.includes("Wijmo License")) {
          e.remove()
        }
      });
    };

    removeWijmoEval();

    // Observe DOM changes under body only
    const observer = new MutationObserver(removeWijmoEval);
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
