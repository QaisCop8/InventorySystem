"use client"
import { appDir } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { X, Minus, MoreHorizontal } from "lucide-react"
import { useWindowManager } from "@/contexts/window-manager-context"
import { cn } from "@/lib/utils"

export function TabBar() {
  const { windows, activeWindowId, setActiveWindow, closeWindow, minimizeWindow } = useWindowManager()

  const tabWindows = windows.filter((w) => w.type === "tab" && !w.isMinimized)

  if (tabWindows.length === 0) {
    return null
  }

  console.log("[v0] TabBar rendering:", { tabCount: tabWindows.length, activeWindowId })

  return (
    <div className="flex items-center bg-muted/30 border-b border-border px-2 py-1 gap-1" dir={appDir()}>
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {tabWindows.map((window) => (
          <div
            key={window.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer min-w-0 max-w-48",
              activeWindowId === window.id
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
            onClick={() => setActiveWindow(window.id)}
          >
            <span className="truncate flex-1">{window.title}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation()
                  minimizeWindow(window.id)
                }}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  closeWindow(window.id)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {windows.filter((w) => w.isMinimized).length > 0 && (
        <Button variant="ghost" size="sm" className="px-2">
          <MoreHorizontal className="h-4 w-4" />
          <span className="ms-1 text-xs">{windows.filter((w) => w.isMinimized).length}</span>
        </Button>
      )}
    </div>
  )
}
