"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// وضع داكن مستقل تماماً عن settings.dark_mode العام (contexts/theme-context.tsx) — ذاك يُبدِّل صنف
// "dark" على document.documentElement فيُغيّر النظام كله، بينما هذا يُبقي الصنف محصوراً بجذر
// القائمة الجانبية (Sidebar) فقط عبر useMenuTheme، فتستجيب أصناف dark: الموجودة أصلاً داخل
// sidebar.tsx دون أي أثر خارج القائمة. يُحفَظ في localStorage فقط (تفضيل جهاز محلي بحت، لا حاجة
// لمزامنته عبر الخادم كإعدادات المظهر العامة).
interface MenuThemeContextType {
  menuDarkMode: boolean
  toggleMenuDarkMode: () => void
}

const STORAGE_KEY = "menu_dark_mode"

const MenuThemeContext = createContext<MenuThemeContextType | undefined>(undefined)

export function useMenuTheme() {
  const context = useContext(MenuThemeContext)
  if (context === undefined) {
    throw new Error("useMenuTheme must be used within a MenuThemeProvider")
  }
  return context
}

export function MenuThemeProvider({ children }: { children: ReactNode }) {
  const [menuDarkMode, setMenuDarkMode] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    setMenuDarkMode(window.localStorage.getItem(STORAGE_KEY) === "1")
  }, [])

  const toggleMenuDarkMode = () => {
    setMenuDarkMode((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      }
      return next
    })
  }

  return <MenuThemeContext.Provider value={{ menuDarkMode, toggleMenuDarkMode }}>{children}</MenuThemeContext.Provider>
}
