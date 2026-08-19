"use client"

import type React from "react"
import { useWindowManager } from "@/contexts/window-manager-context"
import { ModalWindow } from "./modal-window"
import dynamic from "next/dynamic"
const Dashboard = dynamic(() => import("@/components/dashboard").then((mod) => mod.Dashboard), { ssr: false })

// Dynamically import heavy client-only components to prevent server-side
// evaluation of browser-only libs (e.g. @grapecity/wijmo).
const SalesOrders = dynamic(() => import("@/components/orders/sales-orders").then((m) => m.SalesOrders), { ssr: false })
const PurchaseOrders = dynamic(() => import("@/components/orders/purchase-orders").then((m) => m.PurchaseOrders), { ssr: false })
const Products = dynamic(() => import("@/components/products/products").then((m) => m.Products), { ssr: false })
const Customers = dynamic(() => import("@/components/products/customers").then((m) => m.default), { ssr: false })
const UnifiedCustomers = dynamic(() => import("@/components/products/unified-customers").then((m) => m.default), { ssr: false })
const OrderReports = dynamic(() => import("@/components/reports/order-reports").then((m) => m.OrderReports), { ssr: false })
const ProductReports = dynamic(() => import("@/components/reports/product-reports").then((m) => m.ProductReports), { ssr: false })
const DocumentSettings = dynamic(() => import("@/components/settings/document-settings"), { ssr: false })
const GeneralSettings = dynamic(() => import("@/components/settings/general-settings"), { ssr: false })
const PervasiveSettings = dynamic(() => import("@/app/settings/pervasive/page"), { ssr: false })
const UnifiedAccounts = dynamic(() => import("@/components/customer/unified-accounts-refactored"), { ssr: false })

const componentMap: Record<string, React.ComponentType<any>> = {
  dashboard: Dashboard,
  "sales-orders": SalesOrders,
  "purchase-orders": PurchaseOrders,
  products: Products,
  customers: Customers,
  "unified-customers": UnifiedCustomers,
  "order-reports": OrderReports,
  "product-reports": ProductReports,
  "document-settings": DocumentSettings,
  "general-settings": GeneralSettings,
  "pervasive-settings": PervasiveSettings,
  "unified-accounts": UnifiedAccounts,
}

export function WindowRenderer() {
  const { windows, closeWindow } = useWindowManager()


  return (
    <>
      {windows.map((window) => {
        const Component = componentMap[window.component]
        if (!Component) {
          console.warn("[v0] Component not found for:", window.component)
          return null
        }

        // Sanity check: ensure the mapped value is a valid component (function or React component)
        if (typeof Component !== 'function') {
          console.error('[v0] Invalid component type in WindowRenderer for', window.component, Component)
        }

        if (window.type === "modal") {
          return (
            <ModalWindow key={window.id} window={window}>
              <Component {...(window.data || {})} inWindowManager closeWindow={() => closeWindow(window.id)} />
            </ModalWindow>
          )
        }

        return null // Tab windows are rendered in the main content area
      })}
    </>
  )
}
