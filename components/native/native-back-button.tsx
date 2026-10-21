"use client"

import { useEffect } from "react"

// زر الرجوع في تطبيق أندرويد (android-app — Capacitor): السلوك الافتراضي يرجع في سجل الـWebView، وعند تجاوز الصفحة
// الحالية تُغلق الصفحة فيظهر تحذير "Confirm Navigation" (حماية التغييرات غير المحفوظة في الكاشير والسندات)
// وقد يخرج من النظام. هنا: الرجوع يغلق النافذة/المعاينة المفتوحة (كضغط Esc)، وإلا يُرسل التطبيق للخلفية —
// لا يغادر الصفحة أبداً. لا أثر له في المتصفح العادي (لا يوجد window.Capacitor).
type CapacitorApp = {
  addListener: (event: "backButton", handler: () => void) => Promise<{ remove: () => void }> | { remove: () => void }
  minimizeApp?: () => Promise<void>
}

const OPEN_LAYER = [
  '[role="dialog"]:not([aria-hidden="true"])',
  '[role="alertdialog"]',
  ".pos-print-preview",
  ".p-dialog-mask",
  ".p-dropdown-panel",
  ".p-multiselect-panel",
  '[data-radix-popper-content-wrapper]',
].join(",")

export function NativeBackButton() {
  useEffect(() => {
    const app = (window as any).Capacitor?.Plugins?.App as CapacitorApp | undefined
    if (!app?.addListener) return
    let handle: { remove: () => void } | null = null
    let disposed = false
    const onBack = () => {
      if (document.querySelector(OPEN_LAYER)) {
        // يغلق نوافذ Radix/PrimeReact ومعاينة طباعة الكاشير (كلها تستجيب لـ Escape)
        const target = (document.activeElement as HTMLElement | null) || document.body
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }))
        return
      }
      void app.minimizeApp?.()
    }
    Promise.resolve(app.addListener("backButton", onBack)).then((listener) => {
      if (disposed) listener.remove()
      else handle = listener
    }).catch(() => undefined)
    return () => { disposed = true; handle?.remove() }
  }, [])
  return null
}
