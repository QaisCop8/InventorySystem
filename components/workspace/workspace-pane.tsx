"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useWorkspace, type PaneId, type WorkspaceTab } from "@/contexts/workspace-context"
import { SECTION_TITLES } from "@/components/sidebar"
import { TabStrip } from "./tab-strip"
import { PaneMenu } from "./pane-menu"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

interface WorkspacePaneProps {
  paneId: PaneId
  showTabStrip: boolean
  showFocusRing: boolean
  renderSection: (section: string | null) => ReactNode
}

export function WorkspacePane({ paneId, showTabStrip, showFocusRing, renderSection }: WorkspacePaneProps) {
  const { panes, focusedPaneId, activateTab, closeTab, setFocusedPane, openSection } = useWorkspace()
  const pane = panes.find((p) => p.id === paneId)
  if (!pane) return null

  const isFocused = focusedPaneId === paneId
  // شريط الجزء العلوي (تبويبات + زر "فتح صفحة") يظهر متى وُجد أي داعٍ لاستهداف هذا الجزء تحديداً —
  // إما تبويبات فعلية بداخله أو وجود جزء آخر مجاور (شاشة مقسمة). بلا هذا الأخير تحديداً، الجزء
  // الثاني بالشاشة المقسمة يبقى بلا أي طريقة مباشرة لفتح صفحة غيرالرئيسية بداخله تحديداً.
  const showPaneToolbar = showTabStrip || showFocusRing

  return (
    <div
      className={cn(
        "relative flex-1 min-w-0 flex flex-col h-full overflow-hidden transition-shadow",
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
      <div className="relative flex-1 overflow-hidden">
        {pane.tabs.map((tab) => (
          <MountedWorkspaceTab
            key={tab.id}
            tab={tab}
            active={tab.id === pane.activeTabId}
            renderSection={renderSection}
          />
        ))}
      </div>
    </div>
  )
}

function MountedWorkspaceTab({
  tab,
  active,
  renderSection,
}: {
  tab: WorkspaceTab
  active: boolean
  renderSection: (section: string | null) => ReactNode
}) {
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null)

  return (
    <div
      className={cn(
        "absolute inset-0",
        active ? "visible z-10" : "invisible z-0 pointer-events-none",
      )}
      aria-hidden={!active}
    >
      <WorkspaceDialogProvider container={dialogContainer} confined>
        <div className="h-full overflow-auto">{renderSection(tab.section)}</div>
        <div ref={setDialogContainer} className="pointer-events-none absolute inset-0 z-[100] isolate overflow-visible" />
      </WorkspaceDialogProvider>
    </div>
  )
}
