"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { menuItems, type MenuItem } from "@/components/sidebar"
import { useReportAccess } from "@/components/auth/use-report-access"
import { useFileSectionAccess } from "@/components/auth/use-file-access"
import { useTransactionSectionAccess } from "@/components/auth/transaction-access-gate"
import { PAGE_SHORTCUTS_CHANGED, comboFromEvent, sanitizeShortcuts, shortcutRecording, type PageShortcuts } from "@/lib/page-shortcuts"

export type ShortcutPage = { section: string; title: string; path: string[] }

/** صفحات القائمة التي يملك المستخدم صلاحية فتحها — نفس فلترة القائمة الجانبية. */
export function useShortcutPages(): ShortcutPage[] {
  const canOpenReport = useReportAccess()
  const canOpenFile = useFileSectionAccess()
  const canOpenTransaction = useTransactionSectionAccess()
  return useMemo(() => {
    const pages: ShortcutPage[] = []
    const seen = new Set<string>()
    const walk = (items: MenuItem[], path: string[]) => {
      for (const item of items) {
        if (item.submenu) { walk(item.submenu, [...path, item.title]); continue }
        if (!item.section || seen.has(item.section)) continue
        if (!(canOpenReport(item.section) && canOpenFile(item.section) && canOpenTransaction(item.section))) continue
        seen.add(item.section)
        pages.push({ section: item.section, title: item.title, path })
      }
    }
    walk(menuItems, [])
    return pages
  }, [canOpenReport, canOpenFile, canOpenTransaction])
}

/** اختصارات المستخدم الحالي من الخادم، وتُحدَّث فور حفظها من شاشة الاختصارات. */
export function usePageShortcuts() {
  const [shortcuts, setShortcuts] = useState<PageShortcuts>({})
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/page-shortcuts", { cache: "no-store" })
      if (response.ok) setShortcuts(sanitizeShortcuts((await response.json())?.shortcuts))
    } catch { /* بلا اختصارات عند تعذّر التحميل */ }
    finally { setLoaded(true) }
  }, [])
  useEffect(() => {
    void reload()
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<PageShortcuts>).detail
      if (next) setShortcuts(sanitizeShortcuts(next))
      else void reload()
    }
    window.addEventListener(PAGE_SHORTCUTS_CHANGED, onChanged)
    return () => window.removeEventListener(PAGE_SHORTCUTS_CHANGED, onChanged)
  }, [reload])
  return { shortcuts, setShortcuts, loaded, reload }
}

/** يفتح الصفحة المرتبطة بالاختصار عبر نفس مسار القائمة (onOpen = handleSectionChange بحارس التغييرات). */
export function PageShortcutsListener({ onOpen }: { onOpen: (section: string) => void }) {
  const { shortcuts } = usePageShortcuts()
  const pages = useShortcutPages()
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const byCombo = useMemo(() => {
    const allowed = new Set(pages.map((page) => page.section))
    return new Map(Object.entries(shortcuts).filter(([section]) => allowed.has(section)).map(([section, combo]) => [combo, section]))
  }, [shortcuts, pages])

  useEffect(() => {
    if (!byCombo.size) return
    // مرحلة الالتقاط (capture): يسبق مستمعي الشاشات، وpreventDefault يلغي إجراء المتصفح لنفس المفاتيح
    // (Ctrl+F بحث الصفحة، Ctrl+D المفضلة، F7، Ctrl+R...) فيُنفَّذ اختصار المستخدم بدلاً منه.
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutRecording.active || event.isComposing) return
      const combo = comboFromEvent(event)
      const section = combo ? byCombo.get(combo) : undefined
      if (!section) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!event.repeat) onOpenRef.current(section)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [byCombo])

  return null
}
