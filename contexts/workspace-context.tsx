"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"

export type PaneId = "a" | "b"

export interface WorkspaceTab {
  id: string
  section: string
  title: string
  /** يزيد مع «تحديث التبويب»: مفتاح عرض الصفحة يتغيّر فتُعاد تهيئتها وحدها (المعرّف يبقى لحارس التغييرات) */
  rev?: number
}

export interface WorkspacePaneState {
  id: PaneId
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

interface DisplayModes {
  split: boolean
  tabs: boolean
  fullscreen?: boolean
}

interface WorkspaceContextType {
  splitEnabled: boolean
  tabsEnabled: boolean
  fullscreenEnabled: boolean
  panes: WorkspacePaneState[]
  focusedPaneId: PaneId
  currentSection: (paneId: PaneId) => string | null
  openSection: (section: string, title: string, paneId?: PaneId) => void
  activateTab: (paneId: PaneId, tabId: string) => void
  closeTab: (paneId: PaneId, tabId: string) => void
  refreshTab: (paneId: PaneId, tabId: string) => void
  setFocusedPane: (paneId: PaneId) => void
  setSplitEnabled: (enabled: boolean) => void
  setTabsEnabled: (enabled: boolean) => void
  setFullscreenEnabled: (enabled: boolean) => void
  // يُستخدم مرة واحدة عند الإقلاع لتحميل تفضيل المستخدم من قاعدة البيانات (dashboard_layout.display_mode)
  // بلا تشغيل نفس آثار setSplitEnabled/setTabsEnabled المزدوجة لو استُدعيا منفصلين.
  hydrateModes: (modes: DisplayModes) => void
}

const makeEmptyPane = (id: PaneId): WorkspacePaneState => ({ id, tabs: [], activeTabId: null })

const makeTab = (section: string, title: string): WorkspaceTab => ({
  id: `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  section,
  title,
})

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

/**
 * «فتح الصفحات كتبويبات»: التبويبات المفتوحة تُحفظ في sessionStorage (لكل تبويب متصفح) فتبقى بعد تحديث الصفحة.
 * كانت تُفقد كلها: حالة React فقط، وأول قسم عند الإقلاع (app/page.tsx) يُفتح قبل تحميل تفضيل التبويبات من الخادم
 * (tabsEnabled=false) فيستبدل كل شيء بتبويب واحد. تُمسح عند تسجيل الخروج (auth-context).
 */
export const WORKSPACE_TABS_STORAGE_KEY = "workspace_tabs_v1"
type SavedWorkspace = { tabs: boolean; split: boolean; panes: WorkspacePaneState[]; focusedPaneId: PaneId }

function readSavedWorkspace(): SavedWorkspace | null {
  try {
    const raw = sessionStorage.getItem(WORKSPACE_TABS_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved?.tabs || !Array.isArray(saved.panes)) return null
    const panes = (saved.panes as any[])
      .filter((pane) => pane && (pane.id === "a" || pane.id === "b") && Array.isArray(pane.tabs))
      .map((pane) => {
        const tabs = (pane.tabs as any[]).filter((tab) => tab && typeof tab.id === "string" && typeof tab.section === "string").map((tab) => ({ id: tab.id, section: tab.section, title: String(tab.title || "") }))
        return { id: pane.id as PaneId, tabs, activeTabId: tabs.some((tab) => tab.id === pane.activeTabId) ? pane.activeTabId : tabs[tabs.length - 1]?.id ?? null }
      })
    if (!panes.some((pane) => pane.id === "a")) return null
    return { tabs: true, split: Boolean(saved.split), panes, focusedPaneId: saved.focusedPaneId === "b" && panes.some((pane) => pane.id === "b") ? "b" : "a" }
  } catch {
    return null
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [splitEnabled, setSplitEnabledState] = useState(false)
  const [tabsEnabled, setTabsEnabledState] = useState(false)
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false)
  const [panes, setPanes] = useState<WorkspacePaneState[]>([makeEmptyPane("a")])
  const [focusedPaneId, setFocusedPaneIdState] = useState<PaneId>("a")
  // 2026-11-22: تحديث المتصفح كان يغلق التبويبات «أحياناً»: استدعاءات openSection أثناء الإقلاع (رابط/شاشة افتراضية/
  // مزامنة الرابط) تحمل إغلاقاً قديماً فيه tabsEnabled=false فتستبدل كل التبويبات بواحد ثم يُحفظ ذلك. الحالة الحية في ref،
  // ووجود تبويبات محفوظة لهذا التبويب يعني أن الوضع مفعّل حتى قبل وصول الاستعادة
  const tabsEnabledRef = useRef(false)
  tabsEnabledRef.current = tabsEnabled

  // استعادة التبويبات بعد تحديث الصفحة. أثر المكوّن الأب يعمل بعد آثار الأبناء، أي بعد أن فتح app/page.tsx قسم
  // الرابط في الجزء "a" — فيُدمج: التبويبات المحفوظة + قسم الرابط (يُفعَّل إن كان مفتوحاً وإلا يُضاف).
  useEffect(() => {
    const saved = readSavedWorkspace()
    if (!saved) return
    setTabsEnabledState(true)
    setSplitEnabledState(saved.split)
    setFocusedPaneIdState(saved.focusedPaneId)
    setPanes((current) => {
      const opened = current.find((pane) => pane.id === "a")
      const bootTab = opened?.tabs.find((tab) => tab.id === opened.activeTabId)
      const restored = saved.panes.filter((pane) => saved.split || pane.id === "a")
      return restored.map((pane) => {
        if (pane.id !== "a" || !bootTab) return pane
        const existing = pane.tabs.find((tab) => tab.section === bootTab.section)
        if (existing) return { ...pane, activeTabId: existing.id }
        return { ...pane, tabs: [...pane.tabs, bootTab], activeTabId: bootTab.id }
      })
    })
  }, [])

  // الحفظ: التشغيل الأول (التركيب) يُتخطّى — الحالة فيه ما زالت قبل الاستعادة، وحفظها كان سيمحو المحفوظ
  const persistReady = useRef(false)
  useEffect(() => {
    if (!persistReady.current) { persistReady.current = true; return }
    try {
      if (tabsEnabled) sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify({ tabs: true, split: splitEnabled, panes, focusedPaneId }))
      else sessionStorage.removeItem(WORKSPACE_TABS_STORAGE_KEY)
    } catch { /* تخزين غير متاح */ }
  }, [tabsEnabled, splitEnabled, panes, focusedPaneId])

  const currentSection = useCallback(
    (paneId: PaneId) => {
      const pane = panes.find((p) => p.id === paneId)
      if (!pane || !pane.activeTabId) return null
      return pane.tabs.find((t) => t.id === pane.activeTabId)?.section ?? null
    },
    [panes],
  )

  const openSection = useCallback(
    (section: string, title: string, targetPaneId?: PaneId) => {
      const paneId = targetPaneId ?? focusedPaneId
      const tabsOn = tabsEnabledRef.current || readSavedWorkspace() !== null
      setPanes((prev) =>
        prev.map((pane) => {
          if (pane.id !== paneId) return pane
          if (tabsOn) {
            const existing = pane.tabs.find((t) => t.section === section)
            if (existing) return { ...pane, activeTabId: existing.id }
            const tab = makeTab(section, title)
            return { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id }
          }
          const tab = makeTab(section, title)
          return { ...pane, tabs: [tab], activeTabId: tab.id }
        }),
      )
    },
    [focusedPaneId],
  )

  const activateTab = useCallback((paneId: PaneId, tabId: string) => {
    setPanes((prev) => prev.map((pane) => (pane.id === paneId ? { ...pane, activeTabId: tabId } : pane)))
  }, [])

  const closeTab = useCallback((paneId: PaneId, tabId: string) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id !== paneId) return pane
        const tabs = pane.tabs.filter((t) => t.id !== tabId)
        const activeTabId = pane.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : pane.activeTabId
        return { ...pane, tabs, activeTabId }
      }),
    )
  }, [])

  const refreshTab = useCallback((paneId: PaneId, tabId: string) => {
    setPanes((prev) => prev.map((pane) => pane.id !== paneId ? pane : { ...pane, tabs: pane.tabs.map((tab) => (tab.id === tabId ? { ...tab, rev: (tab.rev || 0) + 1 } : tab)) }))
  }, [])

  const setFocusedPane = useCallback((paneId: PaneId) => {
    setFocusedPaneIdState(paneId)
  }, [])

  const applySplit = useCallback((enabled: boolean) => {
    setPanes((prev) => {
      if (enabled) {
        return prev.some((p) => p.id === "b") ? prev : [...prev, makeEmptyPane("b")]
      }
      return prev.filter((p) => p.id === "a")
    })
    if (!enabled) setFocusedPaneIdState("a")
  }, [])

  const setSplitEnabled = useCallback(
    (enabled: boolean) => {
      setSplitEnabledState(enabled)
      applySplit(enabled)
    },
    [applySplit],
  )

  const setTabsEnabled = useCallback((enabled: boolean) => {
    tabsEnabledRef.current = enabled
    if (!enabled) { try { sessionStorage.removeItem(WORKSPACE_TABS_STORAGE_KEY) } catch { /* */ } }
    setTabsEnabledState(enabled)
    if (!enabled) {
      // يُبقي فقط التبويب النشط بكل جزء عند إيقاف التبويبات — يطابق سلوك "استبدال بمكانه" القديم
      // بدل حذف كل شيء أو إبقاء تبويبات لن تظهر بعد الآن.
      setPanes((prev) =>
        prev.map((pane) => ({
          ...pane,
          tabs: pane.activeTabId ? pane.tabs.filter((t) => t.id === pane.activeTabId) : [],
        })),
      )
    }
  }, [])

  const hydrateModes = useCallback(
    (modes: DisplayModes) => {
      // تبويبات محفوظة لهذا التبويب (تحديث الصفحة): حالته الأخيرة تتقدّم على الإعداد المحمَّل — كان إعداد الخادم
      // (tabs=false إن لم يُحفظ التفضيل فعلاً) يطفئ التبويبات بعد الاستعادة فتُغلق كلها
      const saved = readSavedWorkspace()
      const split = saved ? saved.split : modes.split
      setSplitEnabledState(split)
      setTabsEnabledState(saved ? true : modes.tabs)
      setFullscreenEnabled(!!modes.fullscreen)
      applySplit(split)
    },
    [applySplit],
  )

  const value: WorkspaceContextType = {
    splitEnabled,
    tabsEnabled,
    fullscreenEnabled,
    panes,
    focusedPaneId,
    currentSection,
    openSection,
    activateTab,
    closeTab,
    refreshTab,
    setFocusedPane,
    setSplitEnabled,
    setTabsEnabled,
    setFullscreenEnabled,
    hydrateModes,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return context
}
