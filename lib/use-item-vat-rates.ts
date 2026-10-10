"use client"

import { useEffect, useState } from "react"

// نسب ضريبة الأصناف بالواجهة (مع ذاكرة مشتركة بين الشاشات) + حالة إعداد "الضريبة على مستوى الصنف".
// المصدر: /api/products/vat-rates (نفس قاعدة الخادم lib/item-vat-server.ts).
// الذاكرة مؤقتة (TTL) وتُمسح عند حفظ الإعدادات (system-settings-updated) — كانت حالة الإعداد تُحفظ مرة
// واحدة لكل تحميل صفحة، فتفعيله والتطبيق مفتوح لم يكن يظهر أثره في الفواتير حتى إعادة تحميل الصفحة.

const TTL_MS = 30_000
let rateCache = new Map<number, { rate: number | null; at: number }>()
let enabledCache: { value: boolean; at: number } | null = null
let enabledPromise: Promise<boolean> | null = null
const listeners = new Set<() => void>()

if (typeof window !== "undefined" && !(window as any).__itemVatCacheListener) {
  ;(window as any).__itemVatCacheListener = true
  window.addEventListener("system-settings-updated", () => {
    enabledCache = null
    rateCache = new Map()
    listeners.forEach((listener) => listener())
  })
}

const fresh = (at: number) => Date.now() - at < TTL_MS

async function fetchRates(ids: number[]): Promise<boolean> {
  const response = await fetch(`/api/products/vat-rates?ids=${ids.join(",")}`, { cache: "no-store" })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) return enabledCache?.value ?? false
  const now = Date.now()
  enabledCache = { value: Boolean(data.enabled), at: now }
  for (const id of ids) {
    const value = data.rates?.[String(id)]
    rateCache.set(id, { rate: value == null ? null : Number(value), at: now })
  }
  return enabledCache.value
}

/** حالة الإعداد (مع إعادة الفحص بعد انتهاء المهلة). */
export function loadItemLevelVatEnabled(): Promise<boolean> {
  if (enabledCache && fresh(enabledCache.at)) return Promise.resolve(enabledCache.value)
  if (!enabledPromise) enabledPromise = fetchRates([]).finally(() => { enabledPromise = null })
  return enabledPromise
}

const cachedRate = (id: number) => {
  const entry = rateCache.get(id)
  return entry && fresh(entry.at) ? entry : undefined
}

/** نسبة ضريبة صنف واحد من تصنيفه الضريبي (تُجلب عند الحاجة) — undefined إن لم يكن الإعداد مفعّلاً. */
export async function itemVatRateFor(productId: number | null | undefined): Promise<number | null | undefined> {
  const id = Number(productId) || 0
  if (!(await loadItemLevelVatEnabled()) || !id) return undefined
  if (!cachedRate(id)) await fetchRates([id])
  return rateCache.get(id)?.rate ?? null
}

/** نسب ضريبة أصناف السند الحالي — تُعيد التصيير عند وصول نسب جديدة أو تغيّر الإعداد. */
export function useItemVatRates(productIds: Array<number | null | undefined>) {
  const [enabled, setEnabled] = useState<boolean>(enabledCache?.value ?? false)
  const [version, setVersion] = useState(0)
  const [reload, setReload] = useState(0)
  const key = [...new Set(productIds.map(Number).filter((id) => id > 0))].sort((a, b) => a - b).join(",")

  useEffect(() => {
    const listener = () => setReload((value) => value + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadItemLevelVatEnabled().then(async (isEnabled) => {
      if (cancelled) return
      setEnabled(isEnabled)
      if (!isEnabled) return
      const missing = key ? key.split(",").map(Number).filter((id) => !cachedRate(id)) : []
      if (missing.length) await fetchRates(missing)
      if (!cancelled) setVersion((value) => value + 1)
    })
    return () => { cancelled = true }
  }, [key, reload])

  return {
    enabled,
    version,
    /** نسبة الصنف من تصنيفه الضريبي (null = بلا تصنيف ⇐ 0؛ undefined = لم تُحمَّل بعد) */
    rateOf: (productId: number | null | undefined) => (enabled ? rateCache.get(Number(productId) || 0)?.rate : undefined),
  }
}
