"use client"
import { tr, appDir } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { useWindowManager } from "@/contexts/window-manager-context"
import {
  Maximize2,
  Minimize2,
  X,
  Layers,
  Users,
  Package,
  ShoppingCart,
  FileText,
  BarChart3,
  Settings,
  Boxes,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const componentIcons: Record<string, any> = {
  customers: Users,
  suppliers: Users,
  items: Package,
  "item-groups": Boxes,
  orders: ShoppingCart,
  invoices: FileText,
  purchases: ShoppingCart,
  "inventory-analytics": BarChart3,
  settings: Settings,
}

function getIconForComponent(component: string) {
  const Icon = componentIcons[component] || FileText
  return Icon
}

export function Taskbar() {
  const { windows, setActiveWindow, activeWindowId, minimizeWindow, closeWindow } = useWindowManager()

  const modalWindows = windows.filter((w) => w.type === "modal")

  if (modalWindows.length === 0) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 end-4 start-4 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 z-[9999]"
      dir={appDir()}
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-2 whitespace-nowrap border-e border-border pe-3">
          <Layers className="h-4 w-4" />
          <span className="font-medium">{tr("النوافذ المفتوحة (")}{modalWindows.length})</span>
        </div>

        <div className="flex items-center gap-2 flex-1">
          {modalWindows.map((window) => {
            const Icon = getIconForComponent(window.component)
            const isActive = activeWindowId === window.id && !window.isMinimized

            return (
              <TooltipProvider key={window.id}>
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-md border transition-all",
                    isActive
                      ? "bg-primary/10 border-primary shadow-sm"
                      : window.isMinimized
                        ? "bg-muted/50 border-muted opacity-60"
                        : "bg-background border-border hover:bg-muted/50",
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "flex items-center gap-2 min-w-0 max-w-48 h-8 px-3",
                          isActive && "text-primary font-medium",
                        )}
                        onClick={() => {
                          setActiveWindow(window.id)
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate text-sm">{window.title}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{window.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {window.isMinimized ? tr("مصغرة - انقر للاستعادة") : isActive ? tr("نافذة نشطة") : tr("انقر للتفعيل")}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation()
                          minimizeWindow(window.id)
                        }}
                      >
                        {window.isMinimized ? (
                          <Maximize2 className="h-3.5 w-3.5" />
                        ) : (
                          <Minimize2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{window.isMinimized ? tr("استعادة النافذة") : tr("تصغير النافذة")}</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeWindow(window.id)
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{tr("إغلاق النافذة")}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )
          })}
        </div>
      </div>
    </div>
  )
}
