"use client"

import type React from "react"
import { createContext, useCallback, useContext, useState } from "react"

export type PaneId = "a" | "b"

export interface WorkspaceTab {
  id: string
  section: string
  title: string
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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [splitEnabled, setSplitEnabledState] = useState(false)
  const [tabsEnabled, setTabsEnabledState] = useState(false)
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false)
  const [panes, setPanes] = useState<WorkspacePaneState[]>([makeEmptyPane("a")])
  const [focusedPaneId, setFocusedPaneIdState] = useState<PaneId>("a")

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
      setPanes((prev) =>
        prev.map((pane) => {
          if (pane.id !== paneId) return pane
          if (tabsEnabled) {
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
    [focusedPaneId, tabsEnabled],
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
      setSplitEnabledState(modes.split)
      setTabsEnabledState(modes.tabs)
      setFullscreenEnabled(!!modes.fullscreen)
      applySplit(modes.split)
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
