"use client"

import React, { useEffect } from "react"
import { PrimeReactProvider } from "primereact/api"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeSettingsProvider } from "@/contexts/theme-context"
import { WindowManagerProvider } from "@/contexts/window-manager-context"
import { WorkspaceProvider } from "@/contexts/workspace-context"
import { GlobalSearchProvider } from "@/components/global-search-provider"
import { GlobalShortcuts } from "@/components/global-shortcuts"
import { Toaster } from "@/components/ui/toaster"
import { syncSystemSettingsToLocalStorage } from "@/lib/system-settings-sync"
import { CompanyStatusGuard } from "@/components/auth/company-status-guard"
import { ProductVariantProvider } from "@/components/products/product-variant-provider"

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  // يُعبِّئ إعداد "عدد الخانات العشرية" (وأي إعداد نظام قديم آخر لاحقاً) بـlocalStorage عند بدء أي
  // صفحة تستخدم DataGridView — انظر lib/system-settings-sync.ts لسبب وجود هذه الآلية.
  useEffect(() => {
    void syncSystemSettingsToLocalStorage()
  }, [])

  return (
    <PrimeReactProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <ThemeSettingsProvider>
          <WindowManagerProvider>
            <WorkspaceProvider>
              <GlobalSearchProvider>
                <GlobalShortcuts />
                <CompanyStatusGuard />
                <ProductVariantProvider />
                {children}
                <Toaster />
              </GlobalSearchProvider>
            </WorkspaceProvider>
          </WindowManagerProvider>
        </ThemeSettingsProvider>
      </ThemeProvider>
    </PrimeReactProvider>
  )
}
