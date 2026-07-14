// Server-side shim: some third-party browser libraries expect a global
// `XMLHttpRequest` variable. During prerendering on Node this can cause
// a ReferenceError when those libs are accidentally bundled server-side.
// Define a minimal safe stub only on the server to avoid the crash while we
// continue tracing/removing the offending imports.
if (typeof window === "undefined") {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - intentionally setting a runtime global for server-side build
  if (typeof globalThis.XMLHttpRequest === "undefined") {
    // minimal no-op stub
    // Methods are no-ops so attempts to use XHR during prerender don't throw
    // synchronously; this is a pragmatic mitigation while we remove server
    // side inclusion of browser-only libs.
    // NOTE: keep this minimal and only for build-time safety.
    // @ts-ignore
    globalThis.XMLHttpRequest = class XMLHttpRequestStub {
      open() {}
      send() {}
      abort() {}
      setRequestHeader() {}
      addEventListener() {}
      removeEventListener() {}
      get response() {
        return null
      }
      get status() {
        return 0
      }
    }
    // Also expose an unqualified global variable so modules referencing
    // bare `XMLHttpRequest` identifiers don't throw ReferenceError.
    // @ts-ignore
    // eslint-disable-next-line no-global-assign
    XMLHttpRequest = globalThis.XMLHttpRequest
  }
}

import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Suspense } from "react"
import { AuthProvider } from "@/components/auth/auth-context"
import { FontProvider } from "@/components/settings/font-settings"
import dynamic from "next/dynamic"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeSettingsProvider } from "@/contexts/theme-context"
import { WindowManagerProvider } from "@/contexts/window-manager-context"
import { Toaster } from "@/components/ui/toaster"
// Load client-only providers dynamically to avoid server imports
const ClientProviders = dynamic(() => import("@/components/ClientProviders").then((m) => m.default), { ssr: false })
import "./globals.css"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "نظام إدارة الموارد - ERP System",
  description: "نظام إدارة الموارد المتكامل باللغة العربية",
  generator: "v0.app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "نظام الطلبيات",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`font-sans ${inter.variable} antialiased`}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@200;300;400;500;600;700;800;900&family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Tajawal:wght@200;300;400;500;600;700;800;900&family=Amiri:wght@400;700&family=Noto+Sans+Arabic:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <AuthProvider>
          <FontProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange={false}
            >
              <ThemeSettingsProvider>
                <WindowManagerProvider>
                    <ClientProviders>
                      <Suspense fallback={null}>{children}</Suspense>
                    </ClientProviders>
                </WindowManagerProvider>
              </ThemeSettingsProvider>
            </ThemeProvider>
          </FontProvider>
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
