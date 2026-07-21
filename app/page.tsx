"use client"

import type React from "react"
import { Suspense, useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ERPLayout } from "@/components/erp-layout"


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
import CreditCards from "@/components/admin/credit-cards"
import ChequesBooks from "@/components/admin/cheques-books"
import VoucherBookPermissions from "@/components/settings/voucher-book-permissions"

import { AIChat } from "@/components/ai-assistant/ai-chat"
import { SmartAnalyticsDashboard } from "@/components/ai-analytics/smart-analytics-dashboard"
import { SmartInventoryRecommendations } from "@/components/ai-recommendations/smart-inventory-recommendations"

// Settings components
import PrintSettings from "@/components/settings/print-settings"
import VoucherSettings from "@/components/settings/voucher-settings"
import DocumentSettings from "@/components/settings/document-settings"
import Permissions from "@/components/settings/permissions"
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
  banks: Banks,
  branches: Branches,
  "bank-accounts": BankAccounts,
  "receipt-vouchers": (props: any) => <Receipts {...props} voucherType={8} />,
  "payment-vouchers": (props: any) => <Receipts {...props} voucherType={9} />,
  "journal-vouchers": Journal,
  "credit-cards": CreditCards,
  "cheques-books": ChequesBooks,
  "voucher-book-permissions": VoucherBookPermissions,
  "product-groups": ProductGroups,
  definitions: Definitions,
  accounts: Accounts,
  "unified-accounts": UnifiedAccounts,
  "print-settings": PrintSettings,
  "voucher-settings": VoucherSettings,
  "document-settings": DocumentSettings,
  permissions: Permissions,
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
  "order-management": OrderManagement
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
  const [activeSection, setActiveSection] = useState<string | null>(() => {
    const fromUrl = searchParams.get("section")
    if (!fromUrl) return null
    return fromUrl === "home-dashboard" || fromUrl === "dashboard" || componentMap[fromUrl] ? fromUrl : null
  })

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
  const renderContent = () => {
    if (!activeSection) {
      return <WelcomeDashboard onOpenSection={handleSectionChange} />
    }

    if (activeSection === "home-dashboard") {
      return <WelcomeDashboard onOpenSection={handleSectionChange} />
    }

    if (activeSection) {
      const Component = componentMap[activeSection]
      if (Component) {
        console.log("[v0] Rendering traditional component:", activeSection, { type: typeof Component })
        if (typeof Component !== 'function') {
          console.error('[v0] Invalid component type detected for section', activeSection, Component)
        }
        return <Component />
      }
    }

    if (activeSection === "user-profile") {
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

    return <WelcomeDashboard onOpenSection={handleSectionChange} />
  }
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

      setActiveSection(componentMap[defaultScreen] ? defaultScreen : "home-dashboard")
    }

    window.addEventListener("OPEN_DEFAULT_SCREEN", handler)

    return () => window.removeEventListener("OPEN_DEFAULT_SCREEN", handler)
  }, [user])

  const handleSectionChange = (section: string) => {
    console.log("[v0] Section change requested:", section)

    const resolved =
      section === "home-dashboard" || section === "dashboard"
        ? "home-dashboard"
        : componentMap[section]
          ? section
          : "home-dashboard"

    setActiveSection(resolved)
    // يُبقي رابط العنوان مطابقاً للقسم الحالي — يتيح فتح نفس القسم في تبويب جديد
    // (كليك أوسط/يمين على عنصر القائمة الجانبية) بدل الرجوع دائماً للرئيسية.
    router.replace(resolved === "home-dashboard" ? "/" : `/?section=${resolved}`, { scroll: false })
  }

  return (
    <ProtectedRoute>
      <ERPLayout activeSection={activeSection || ""} onSectionChange={handleSectionChange}>
        <div className="flex-1 overflow-auto">{renderContent()}</div>
      </ERPLayout>
    </ProtectedRoute>
  )
}
