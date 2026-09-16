"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { X, Minus, Square, Move } from "lucide-react"
import { useWindowManager, type WindowState } from "@/contexts/window-manager-context"
import { cn } from "@/lib/utils"

interface ModalWindowProps {
  window: WindowState
  children: React.ReactNode
}

export function ModalWindow({ window, children }: ModalWindowProps) {
  const { closeWindow, minimizeWindow, maximizeWindow, setActiveWindow, updateWindowPosition, activeWindowId } =
    useWindowManager()
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })

  console.log("[v0] ModalWindow rendering:", {
    id: window.id,
    title: window.title,
    zIndex: window.zIndex,
    isActive: activeWindowId === window.id,
  })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("window-header")) {
      setIsDragging(true)
      setDragOffset({
        x: e.clientX - (window.position?.x || 0),
        y: e.clientY - (window.position?.y || 0),
      })
      setActiveWindow(window.id)
    }
  }

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !window.isMaximized) {
        const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 200))
        const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 100))

        updateWindowPosition(window.id, { x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset, window.id, window.isMaximized, updateWindowPosition])

  if (window.isMinimized) {
    return null
  }

  const style: React.CSSProperties = {
    position: "fixed",
    left: window.isMaximized ? 0 : window.position?.x || 100,
    top: window.isMaximized ? 0 : window.position?.y || 100,
    width: window.isMaximized ? "100vw" : window.size?.width || 800,
    height: window.isMaximized ? "100vh" : window.size?.height || 600,
    zIndex: window.zIndex || 1000,
  }

  const isActive = activeWindowId === window.id

  return (
    <div
      className={cn(
        "bg-background border shadow-2xl rounded-lg overflow-hidden flex flex-col transition-all",
        window.isMaximized && "rounded-none",
        isActive ? "border-primary shadow-primary/20" : "border-border",
      )}
      style={style}
      onClick={() => {
        console.log("[v0] Window clicked:", window.id)
        setActiveWindow(window.id)
      }}
    >
      {/* Window Header */}
      <div
        className={cn(
          "window-header flex items-center justify-between border-b px-4 py-2",
          !window.isMaximized && "cursor-move",
          isActive ? "bg-primary/10 border-primary/20" : "bg-muted/50 border-border",
        )}
        onMouseDown={handleMouseDown}
        dir="rtl"
      >
        <div className="flex items-center gap-2">
          <Move className="h-4 w-4 text-muted-foreground" />
          <span className={cn("font-medium text-sm", isActive && "text-primary")}>{window.title}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-muted"
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
            className="h-6 w-6 p-0 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              maximizeWindow(window.id)
            }}
          >
            <Square className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => {
              e.stopPropagation()
              closeWindow(window.id)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Window Content */}
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>
  )
}
