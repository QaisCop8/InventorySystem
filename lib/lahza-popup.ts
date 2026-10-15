"use client"

// نافذة الدفع المنبثقة من لحظة (https://js.lahza.io/inline.min.js) — تُفتح بالمفتاح العام وبالمرجع والمبلغ المسجّلين
// بالخادم؛ onSuccess يستدعي التحقق بالخادم (لا يُعتمد على المتصفح وحده).
type LahzaPopupInstance = { newTransaction: (options: Record<string, unknown>) => void }
declare global {
  interface Window { LahzaPopup?: new () => LahzaPopupInstance }
}

const SCRIPT = "https://js.lahza.io/inline.min.js"

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.LahzaPopup) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
    const script = existing || Object.assign(document.createElement("script"), { src: SCRIPT, async: true })
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("تعذّر تحميل نافذة الدفع")), { once: true })
    if (!existing) document.body.appendChild(script)
  })
}

export async function openLahzaPopup(options: {
  publicKey: string
  email: string
  amountMinor: number
  currency: string
  reference: string
  firstName?: string
  metadata?: Record<string, unknown>
  onSuccess: () => void
  onCancel: () => void
}) {
  await loadScript()
  if (!window.LahzaPopup) throw new Error("تعذّر فتح نافذة الدفع")
  new window.LahzaPopup().newTransaction({
    key: options.publicKey,
    email: options.email,
    firstName: options.firstName,
    amount: options.amountMinor,
    currency: options.currency,
    ref: options.reference,
    metadata: options.metadata,
    onSuccess: options.onSuccess,
    onCancel: options.onCancel,
  })
}
