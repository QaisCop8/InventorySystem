"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback } from "react"

export interface WindowState {
  id: string
  title: string
  component: string
  data?: any
  type: "tab" | "modal"
  isMinimized?: boolean
  isMaximized?: boolean
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  zIndex?: number
}

interface WindowManagerContextType {
  windows: WindowState[]
  activeWindowId: string | null
  openWindow: (window: Omit<WindowState, "id">) => string
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  setActiveWindow: (id: string) => void
  updateWindowData: (id: string, data: any) => void
  updateWindowPosition: (id: string, position: { x: number; y: number }) => void
  getWindow: (id: string) => WindowState | undefined
}

const WindowManagerContext = createContext<WindowManagerContextType | undefined>(undefined)

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null)
  const [nextZIndex, setNextZIndex] = useState(1000)

  const openWindow = useCallback(
    (windowData: Omit<WindowState, "id">) => {
      if (windowData.type === "tab") {
        const existingWindow = windows.find((w) => w.component === windowData.component && w.type === "tab")
        if (existingWindow) {
          // Just activate the existing tab instead of opening a new one
          setActiveWindowId(existingWindow.id)
          return existingWindow.id
        }
      }

      const id = `window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const modalCount = windows.filter((w) => w.type === "modal").length
      const cascadeOffset = modalCount * 30 // 30px offset for each window
      const defaultX = 100 + cascadeOffset
      const defaultY = 100 + cascadeOffset

      const newWindow: WindowState = {
        ...windowData,
        id,
        zIndex: nextZIndex,
        position: windowData.position || { x: defaultX, y: defaultY },
        // كان 800×600 — قُلِّص بناءً على طلب صريح لتصغير نوافذ "unified-accounts-refactored"؛ هذا
        // الافتراضي مُشترَك بين كل أنواع النوافذ (لا آلية تخصيص لكل مكوّن حالياً بالنداءات الفعلية
        // لـopenWindow المُكتشَفة بالكود)، فيُطبَّق على أي نافذة أخرى لا تُمرِّر size صريحاً بنفسها.
        size: windowData.size || { width: 700, height: 520 },
      }

      console.log("[v0] Opening window:", { id, title: newWindow.title, type: newWindow.type, zIndex: nextZIndex })

      setWindows((prev) => [...prev, newWindow])
      setActiveWindowId(id)
      setNextZIndex((prev) => prev + 1)

      return id
    },
    [nextZIndex, windows],
  )

  const closeWindow = useCallback(
    (id: string) => {
      console.log("[v0] Closing window:", id)

      setWindows((prev) => prev.filter((w) => w.id !== id))
      setActiveWindowId((prev) => {
        if (prev === id) {
          const remaining = windows.filter((w) => w.id !== id && !w.isMinimized)
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null
        }
        return prev
      })
    },
    [windows],
  )

  const minimizeWindow = useCallback(
    (id: string) => {
      console.log("[v0] Minimizing window:", id)

      setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMinimized: !w.isMinimized } : w)))
      setActiveWindowId((prev) => {
        if (prev === id) {
          const remaining = windows.filter((w) => w.id !== id && !w.isMinimized)
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null
        }
        return prev
      })
    },
    [windows],
  )

  const maximizeWindow = useCallback((id: string) => {
    console.log("[v0] Maximizing window:", id)

    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w)))
  }, [])

  const setActiveWindow = useCallback(
    (id: string) => {
      console.log("[v0] Setting active window:", id, "new zIndex:", nextZIndex)

      setWindows((prev) =>
        prev.map((w) => {
          if (w.id === id) {
            return { ...w, isMinimized: false, zIndex: nextZIndex }
          }
          return w
        }),
      )
      setActiveWindowId(id)
      setNextZIndex((prev) => prev + 1)
    },
    [nextZIndex],
  )

  const updateWindowData = useCallback((id: string, data: any) => {
    console.log("[v0] Updating window data:", { id, data })

    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, data: { ...w.data, ...data } } : w)))
  }, [])

  const updateWindowPosition = useCallback((id: string, position: { x: number; y: number }) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, position } : w)))
  }, [])

  const getWindow = useCallback(
    (id: string) => {
      return windows.find((w) => w.id === id)
    },
    [windows],
  )

  const value: WindowManagerContextType = {
    windows,
    activeWindowId,
    openWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    setActiveWindow,
    updateWindowData,
    updateWindowPosition,
    getWindow,
  }

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext)
  if (context === undefined) {
    throw new Error("useWindowManager must be used within a WindowManagerProvider")
  }
  return context
}
