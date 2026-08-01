"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import { useWorkspace, type PaneId } from "@/contexts/workspace-context"
import { SECTION_TITLES } from "@/components/sidebar"
import { TabStrip } from "./tab-strip"
import { PaneMenu } from "./pane-menu"

interface WorkspacePaneProps {
  paneId: PaneId
  showTabStrip: boolean
  showFocusRing: boolean
  renderSection: (section: string | null) => React.ReactNode
}

export function WorkspacePane({ paneId, showTabStrip, showFocusRing, renderSection }: WorkspacePaneProps) {
  const { panes, focusedPaneId, currentSection, activateTab, closeTab, setFocusedPane, openSection } = useWorkspace()
  const pane = panes.find((p) => p.id === paneId)
  if (!pane) return null

  const section = currentSection(paneId)
  const isFocused = focusedPaneId === paneId
  // شريط الجزء العلوي (تبويبات + زر "فتح صفحة") يظهر متى وُجد أي داعٍ لاستهداف هذا الجزء تحديداً —
  // إما تبويبات فعلية بداخله أو وجود جزء آخر مجاور (شاشة مقسمة). بلا هذا الأخير تحديداً، الجزء
  // الثاني بالشاشة المقسمة يبقى بلا أي طريقة مباشرة لفتح صفحة غيرالرئيسية بداخله تحديداً.
  const showPaneToolbar = showTabStrip || showFocusRing

  return (
    <div
      className={cn(
        "flex-1 min-w-0 flex flex-col h-full overflow-hidden transition-shadow",
        showFocusRing && isFocused && "ring-2 ring-primary/40 rounded-lg",
      )}
      onMouseDownCapture={() => setFocusedPane(paneId)}
    >
      {showPaneToolbar && (
        <div className="flex items-center gap-1 bg-muted/30 border-b border-border px-2 py-1" dir="rtl">
          <TabStrip
            tabs={showTabStrip ? pane.tabs : []}
            activeTabId={pane.activeTabId}
            onActivate={(tabId) => activateTab(paneId, tabId)}
            onClose={(tabId) => closeTab(paneId, tabId)}
          />
          <PaneMenu onOpenSection={(newSection) => openSection(newSection, SECTION_TITLES[newSection] || newSection, paneId)} />
        </div>
      )}
      <div className="flex-1 overflow-auto">{renderSection(section)}</div>
    </div>
  )
}
