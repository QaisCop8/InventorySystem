"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ERPLayout } from "@/components/erp-layout"
import { useWindowManager } from "@/contexts/window-manager-context"
import { TabBar } from "@/components/window-manager/tab-bar"
import { WindowRenderer } from "@/components/window-manager/window-renderer"
import { Taskbar } from "@/components/window-manager/taskbar"


// Import all components
const Dashboard = dynamic(() => import("@/components/dashboard").then((mod) => mod.Dashboard), { ssr: false })
import { OrderReports } from "@/components/reports/order-reports"
import { ProductReports } from "@/components/reports/product-reports"

import dynamic from "next/dynamic"

// Dynamically import heavy client-only components to avoid pulling browser-only
// libraries (e.g. @grapecity/wijmo) into the server prerender bundle.
const SalesOrders = dynamic(() => import("@/components/orders/sales-orders").then(mod => mod.SalesOrders), { ssr: false })
const Products = dynamic(() => import("@/components/products/products").then(mod => mod.Products), { ssr: false })
const Customers = dynamic(() => import("@/components/products/customers"), { ssr: false })
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

import { AIChat } from "@/components/ai-assistant/ai-chat"
import { SmartAnalyticsDashboard } from "@/components/ai-analytics/smart-analytics-dashboard"
import { SmartInventoryRecommendations } from "@/components/ai-recommendations/smart-inventory-recommendations"

// Settings components
import PrintSettings from "@/components/settings/print-settings"
import VoucherSettings from "@/components/settings/voucher-settings"
import DocumentSettings from "@/components/settings/document-settings"
import Permissions from "@/components/settings/permissions"
import GeneralSettings from "@/components/settings/general-settings"
import APISettings from "@/components/settings/api-settings"
import { SystemSettings } from "@/components/settings/system-settings"
import { UserSettings } from "@/components/settings/user-settings"
import { ThemeCustomization } from "@/components/settings/theme-customization"
import { Definitions } from "@/components/settings/definitions"
import FontSettings from "@/components/settings/font-settings"
import QADashboard from "@/components/qa-dashboard"
import PervasiveSettings from "@/app/settings/pervasive/page"
import { OrderMigrate } from "@/components/Migration/orders-migration"
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
  "purchase-orders": (props: any) => <SalesOrders {...props} isPurchase={true} />,
  "batch-movements": BatchMovements,
  products: Products,
  customers: Customers,
  suppliers: (props: any) => <Customers {...props} isSupplier={true} />,
  "product-groups": ProductGroups,
  definitions: Definitions,
  "print-settings": PrintSettings,
  "voucher-settings": VoucherSettings,
  "document-settings": DocumentSettings,
  permissions: Permissions,
  "general-settings": GeneralSettings,
  "api-settings": APISettings,
  "exchange-rates": ExchangeRates,
  "system-settings": SystemSettings,
  "user-settings": UserSettings,
  "font-settings": FontSettings,
  "qa-dashboard": QADashboard,
  "pervasive-settings": PervasiveSettings,
  "customer-portal-admin": CustomerPortalAdmin,
  "ai-assistant": AIChat,
  "smart-analytics": SmartAnalyticsDashboard,
  "smart-inventory": SmartInventoryRecommendations,
  "orders-migration": OrderMigrate,
}

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const { windows, activeWindowId, openWindow } = useWindowManager()

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
    const activeTabWindow = windows.find((w) => w.id === activeWindowId && w.type === "tab")
    if (activeTabWindow) {
      const Component = componentMap[activeTabWindow.component]
      if (Component) {
        // Runtime sanity check: ensure we're rendering a component, not a module object
        if (typeof Component !== 'function') {
          console.error('[v0] Invalid component type detected for', activeTabWindow.component, Component)
        }
        return <Component {...(activeTabWindow.data || {})} />
      }
    }

    if (!activeSection && windows.filter((w) => w.type === "tab").length === 0) {
      return (
        <div className="flex items-center justify-center h-full" dir="rtl">
          <div className="text-center space-y-4 max-w-md">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl font-bold text-primary">ERP</span>
            </div>
            <h2 className="text-3xl font-bold text-foreground">مرحباً بك في نظام إدارة الموارد</h2>
            <p className="text-muted-foreground text-lg">اختر قسماً من القائمة الجانبية للبدء في العمل</p>
            <div className="pt-4 space-y-2 text-sm text-muted-foreground">

            </div>
          </div>
        </div>
      )
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

    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">قريباً</h2>
          <p className="text-muted-foreground">هذا القسم قيد التطوير</p>
        </div>
      </div>
    )
  }

  const handleSectionChange = (section: string) => {
    console.log("[v0] Section change requested:", section)

    const shouldOpenInTab = [
      "sales-orders",
      "purchase-orders",
      "products",
      "customers",
      "suppliers",
      "order-reports",
      "product-reports",
      "whatsapp-notifications",
      "ai-assistant",
      "smart-analytics",
      "smart-inventory",
    ].includes(section)

    if (shouldOpenInTab) {
      const sectionTitles: Record<string, string> = {
        "sales-orders": "طلبيات المبيعات",
        "purchase-orders": "طلبيات المشتريات",
        products: "المنتجات",
        customers: "العملاء",
        suppliers: "الموردين",
        "order-reports": "تقارير الطلبيات",
        "product-reports": "تقارير المنتجات",
        "whatsapp-notifications": "إعدادات إشعارات WhatsApp",
        "ai-assistant": "المساعد الذكي",
        "smart-analytics": "التحليلات الذكية",
        "smart-inventory": "توصيات المخزون الذكية",
      }

      openWindow({
        title: sectionTitles[section] || section,
        component: section,
        type: "tab",
      })
    } else {
      setActiveSection(section)
    }
  }

  return (
    <ProtectedRoute>
      <ERPLayout activeSection={activeSection || ""} onSectionChange={handleSectionChange}>
        <TabBar />
        <div className="flex-1 overflow-auto">{renderContent()}</div>
        <WindowRenderer />
        <Taskbar />
      </ERPLayout>
    </ProtectedRoute>
  )
}
