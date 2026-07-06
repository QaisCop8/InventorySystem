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

export default function DashboardLayoutPage() {
  const { activeWindows, openWindow, closeWindow, minimizeWindow, maximizeWindow } = useWindowManager()

  // Default windows to open on load
  useEffect(() => {
    // Open dashboard by default
    if (activeWindows && activeWindows.length === 0) {
      openWindow({
        id: "dashboard",
        title: "لوحة التحكم",
        component: Dashboard,
        icon: "dashboard",
        isMinimized: false,
        isMaximized: false,
      })
    }
  }, [activeWindows?.length, openWindow])

  return (
    <ProtectedRoute>
      <ERPLayout>
        <div className="flex flex-col h-screen bg-gray-50">
          {/* Tab Bar */}
          <TabBar
            windows={activeWindows || []}
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
            onActivate={(id) => {
              // Handle window activation
            }}
          />

          {/* Window Renderer */}
          <div className="flex-1 overflow-hidden">
            <WindowRenderer
              windows={activeWindows || []}
              onClose={closeWindow}
              onMinimize={minimizeWindow}
              onMaximize={maximizeWindow}
            />
          </div>

          {/* Taskbar */}
          <Taskbar
            onOpenWindow={(windowType) => {
              let component: any
              let title = ""
              let icon = ""

              switch (windowType) {
                case "dashboard":
                  component = Dashboard
                  title = "لوحة التحكم"
                  icon = "dashboard"
                  break
                case "sales-orders":
                  component = SalesOrders
                  title = "طلبيات المبيعات"
                  icon = "sales"
                  break
                case "products":
                  component = Products
                  title = "المنتجات"
                  icon = "products"
                  break
                case "customers":
                  component = Customers
                  title = "العملاء"
                  icon = "customers"
                  break
                case "product-groups":
                  component = ProductGroups
                  title = "مجموعات المنتجات"
                  icon = "groups"
                  break
                case "exchange-rates":
                  component = ExchangeRates
                  title = "أسعار الصرف"
                  icon = "exchange"
                  break
                case "batch-movements":
                  component = BatchMovements
                  title = "حركات الدفعات"
                  icon = "batch"
                  break
                case "batch-reports":
                  component = BatchReports
                  title = "تقارير الدفعات"
                  icon = "reports"
                  break
                case "batch-log-report":
                  component = BatchLogReport
                  title = "سجل الدفعات"
                  icon = "log"
                  break
                case "inventory-analytics":
                  component = InventoryAnalytics
                  title = "تحليلات المخزون"
                  icon = "analytics"
                  break
                case "automated-reorder":
                  component = AutomatedReorderSystem
                  title = "نظام إعادة الطلب التلقائي"
                  icon = "reorder"
                  break
                case "barcode-management":
                  component = BarcodeManagement
                  title = "إدارة الباركود"
                  icon = "barcode"
                  break
                case "order-tracking":
                  component = OrderTrackingDashboard
                  title = "تتبع الطلبيات"
                  icon = "tracking"
                  break
                case "lot-opener":
                  component = LotOpener
                  title = "فتح الدفعات"
                  icon = "lot"
                  break
                case "lot-status-manager":
                  component = LotStatusManager
                  title = "إدارة حالة الدفعات"
                  icon = "status"
                  break
                case "customer-portal-admin":
                  component = CustomerPortalAdmin
                  title = "إدارة بوابة العملاء"
                  icon = "portal"
                  break
                case "whatsapp-settings":
                  component = WhatsAppNotificationSettings
                  title = "إعدادات الواتساب"
                  icon = "whatsapp"
                  break
                case "ai-chat":
                  component = AIChat
                  title = "الدردشة الذكية"
                  icon = "ai"
                  break
                case "smart-analytics":
                  component = SmartAnalyticsDashboard
                  title = "التحليلات الذكية"
                  icon = "smart"
                  break
                case "smart-inventory":
                  component = SmartInventoryRecommendations
                  title = "توصيات المخزون الذكية"
                  icon = "inventory"
                  break
                case "order-reports":
                  component = OrderReports
                  title = "تقارير الطلبيات"
                  icon = "reports"
                  break
                case "product-reports":
                  component = ProductReports
                  title = "تقارير المنتجات"
                  icon = "reports"
                  break
                case "print-settings":
                  component = PrintSettings
                  title = "إعدادات الطباعة"
                  icon = "print"
                  break
                case "voucher-settings":
                  component = VoucherSettings
                  title = "إعدادات السندات"
                  icon = "voucher"
                  break
                case "document-settings":
                  component = DocumentSettings
                  title = "إعدادات المستندات"
                  icon = "document"
                  break
                case "permissions":
                  component = Permissions
                  title = "الصلاحيات"
                  icon = "permissions"
                  break
                case "general-settings":
                  component = GeneralSettings
                  title = "الإعدادات العامة"
                  icon = "settings"
                  break
                case "api-settings":
                  component = APISettings
                  title = "إعدادات API"
                  icon = "api"
                  break
                case "system-settings":
                  component = SystemSettings
                  title = "إعدادات النظام"
                  icon = "system"
                  break
                default:
                  return
              }

              openWindow({
                id: `${windowType}-${Date.now()}`,
                title,
                component,
                icon,
                isMinimized: false,
                isMaximized: false,
              })
            }}
          />
        </div>
      </ERPLayout>
    </ProtectedRoute>
  )
}