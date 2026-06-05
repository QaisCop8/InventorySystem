"use client"

import type React from "react"
import { useWindowManager } from "@/contexts/window-manager-context"
import { ModalWindow } from "./modal-window"
import dynamic from "next/dynamic"
const Dashboard = dynamic(() => import("@/components/dashboard").then((mod) => mod.Dashboard), { ssr: false })

// Dynamically import heavy client-only components to prevent server-side
// evaluation of browser-only libs (e.g. @grapecity/wijmo).
import {SalesOrders} from "@/components/orders/sales-orders"
const PurchaseOrders = dynamic(() => import("@/components/orders/purchase-orders").then((m) => m.PurchaseOrders), { ssr: false })
const Products = dynamic(() => import("@/components/products/products").then((m) => m.Products), { ssr: false })
const Customers = dynamic(() => import("@/components/products/customers").then((m) => m.default), { ssr: false })
import { OrderReports } from "@/components/reports/order-reports"
import { ProductReports } from "@/components/reports/product-reports"
import DocumentSettings from "@/components/settings/document-settings"
import GeneralSettings from "@/components/settings/general-settings"
import PervasiveSettings from "@/app/settings/pervasive/page"
import UnifiedAccounts from "@/components/customer/unified-accounts-refactored"

const componentMap: Record<string, React.ComponentType<any>> = {
  dashboard: Dashboard,
  "sales-orders": SalesOrders,
  "purchase-orders": PurchaseOrders,
  products: Products,
  customers: Customers,
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
