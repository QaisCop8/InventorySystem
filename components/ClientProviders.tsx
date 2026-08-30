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

  // Browsers heavily throttle close-animation timers while a tab is sleeping. If a Radix modal
  // closes or unmounts during that time, its global `body { pointer-events: none }` lock can survive
  // after the modal itself is gone, making every button and page look frozen until a full refresh.
  // Recover only when no modal is genuinely open, then notify grids/layouts that the page is visible
  // again so controls suspended in the background can recalculate their bounds.
  useEffect(() => {
    let frameId: number | null = null

    const recoverInteraction = () => {
      if (document.visibilityState === "hidden") return
      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"]')
      const hasOpenOverlay = document.querySelector('[data-radix-dialog-overlay][data-state="open"]')

      if (!hasOpenDialog && !hasOpenOverlay && document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }

      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        window.dispatchEvent(new Event("resize"))
      })
    }

    const handleVisibilityChange = () => recoverInteraction()
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", recoverInteraction)
    window.addEventListener("pageshow", recoverInteraction)
    window.addEventListener("online", recoverInteraction)
    recoverInteraction()

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", recoverInteraction)
      window.removeEventListener("pageshow", recoverInteraction)
      window.removeEventListener("online", recoverInteraction)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
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
