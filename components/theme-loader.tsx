"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

interface ThemeLoaderProps {
  userId?: string
}

export function ThemeLoader({ userId }: ThemeLoaderProps) {
  const { setTheme } = useTheme()

  useEffect(() => {
    const loadUserTheme = async () => {
      if (!userId) return

      try {
        let userData: any = null

        const userResponse = await fetch(`/api/settings/user?user_id=${userId}`)
        if (userResponse.ok) {
          userData = await userResponse.json()
          if (userData.theme_preference) {
            setTheme(userData.theme_preference)
          }
          if (userData.font_family || userData.font_size) {
            const root = document.documentElement
            root.style.setProperty("--font-family-custom", userData.font_family || "Cairo")
            root.style.setProperty("--font-size-custom", `${userData.font_size || 14}px`)
            const saved = JSON.parse(localStorage.getItem("erp-font-settings") || "{}")
            localStorage.setItem("erp-font-settings", JSON.stringify({
              ...saved,
              fontFamily: userData.font_family || "Cairo",
              fontSize: userData.font_size || 14,
            }))
          }
        }

        const themeResponse = await fetch("/api/settings/theme")
        if (themeResponse.ok) {
          const themeData = await themeResponse.json()
          if (themeData && themeData.id) {
            // Apply theme settings to CSS variables
            const root = document.documentElement
            root.style.setProperty("--primary", themeData.primary_color || "#059669")
            root.style.setProperty("--accent", themeData.accent_color || "#10b981")
            root.style.setProperty("--radius", `${themeData.border_radius || 8}px`)
            root.style.setProperty("--font-sans", themeData.font_family || "var(--font-geist-sans)")

            document.body.style.fontSize = `${themeData.font_size || 14}px`

            // Apply dark mode if enabled
            if (themeData.dark_mode && userData?.theme_preference !== "light") {
              setTheme("dark")
            }
          }
        }
      } catch (error) {
        console.error("[v0] Error loading theme settings:", error)
      }
    }

    loadUserTheme()
  }, [userId, setTheme])

  return null
}
