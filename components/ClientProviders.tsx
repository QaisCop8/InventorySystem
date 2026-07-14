"use client"

import React from "react"
import { PrimeReactProvider } from "primereact/api"
import { ThemeProvider } from "@/components/theme-provider"
import { FontProvider } from "@/components/settings/font-settings"
import { ThemeSettingsProvider } from "@/contexts/theme-context"
import { WindowManagerProvider } from "@/contexts/window-manager-context"
import { GlobalSearchProvider } from "@/components/global-search-provider"
import { GlobalShortcuts } from "@/components/global-shortcuts"
import { Toaster } from "@/components/ui/toaster"

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrimeReactProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <FontProvider>
          <ThemeSettingsProvider>
            <WindowManagerProvider>
              <GlobalSearchProvider>
                <GlobalShortcuts />
                {children}
                <Toaster />
              </GlobalSearchProvider>
            </WindowManagerProvider>
          </ThemeSettingsProvider>
        </FontProvider>
      </ThemeProvider>
    </PrimeReactProvider>
  )
}
