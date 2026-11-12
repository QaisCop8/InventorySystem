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
import ClientProviders from "@/components/ClientProviders"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeSettingsProvider } from "@/contexts/theme-context"
import { WindowManagerProvider } from "@/contexts/window-manager-context"
import { Toaster } from "@/components/ui/toaster"
import { USER_FONT_BOOT_SCRIPT } from "@/lib/user-font"
import { APP_MODE_BOOT_SCRIPT } from "@/lib/app-mode"
import { cookies } from "next/headers"
import { LANG_COOKIE, tr } from "@/lib/i18n"
import { I18N_BUILD } from "@/lib/i18n-build"
import { HydrationLanguageGate } from "@/components/i18n/hydration-language-gate"
import { DomTranslationFallback } from "@/components/i18n/dom-translation-fallback"
import "./globals.css"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "NoonERP System",
  description: tr("نون ERP — نظام عربي متكامل لإدارة الأعمال"),
  generator: "v0.app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NoonERP System",
  },
  icons: {
    icon: [{ url: "/brand/noonerp-favicon.png?v=3", type: "image/png", sizes: "64x64" }, { url: "/icon-192.png?v=2", type: "image/png", sizes: "192x192" }],
    apple: "/apple-touch-icon.png",
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
  themeColor: "#059669",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // لغة الواجهة (lib/i18n.ts): من كوكي app_lang — الإنجليزية ⇐ اتجاه LTR وتحميل القاموس قبل تشغيل التطبيق
  const language = (await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : "ar"
  return (
    <html lang={language} dir={language === "en" ? "ltr" : "rtl"} suppressHydrationWarning>
      {/* القاموس بسكربت حاجب في أول <head>: يُنفَّذ قبل وحدات التطبيق، فالتسميات المحسوبة عند تحميل الوحدات (القائمة
          الجانبية، قوائم الحقول) تُترجم. next/script beforeInteractive لا يضمن ذلك في App Router (يُحمَّل غير متزامن). */}
      <head>{language === "en" && <script src={`/locales/en.js?v=${I18N_BUILD}`} />}</head>
      <body className={`font-sans ${inter.variable} antialiased`} suppressHydrationWarning>
        {/* خط المستخدم المحفوظ قبل أول رسم (lib/user-font.ts) — لا وميض للحجم الافتراضي ولا انتظار للشبكة */}
        <script dangerouslySetInnerHTML={{ __html: USER_FONT_BOOT_SCRIPT }} />
        {/* مشغّل الكاشير/المطعم (?app=...) — يُحفظ قبل أي تحويل لصفحة الدخول (lib/app-mode.ts) */}
        <script dangerouslySetInnerHTML={{ __html: APP_MODE_BOOT_SCRIPT }} />
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
                      <HydrationLanguageGate language={language}>
                        <Suspense fallback={null}>{children}</Suspense>
                        {language === "en" && <DomTranslationFallback />}
                      </HydrationLanguageGate>
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
                  navigator.serviceWorker.register('/sw.js').catch(function(error) {
                    console.error('[service-worker] Registration failed:', error);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
