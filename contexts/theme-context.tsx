"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/auth-context"

export interface ThemeSettings {
  id?: number
  organization_id?: number
  user_id?: string
  theme_name: string
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  text_color: string
  font_family: string
  font_size: number
  font_weight: number
  line_height: number
  letter_spacing: number
  border_radius: number
  sidebar_width: number
  header_height: number
  dark_mode: boolean
  rtl_support: boolean
  card_style: "flat" | "elevated" | "outlined"
  button_style: "rounded" | "square" | "pill"
  toolbar_style: "modern" | "gradient" | "compact" | "classic"
  animation_speed: "slow" | "normal" | "fast"
  compact_mode: boolean
  high_contrast: boolean
  created_at?: string
  updated_at?: string
}

export interface ThemeContextType {
  settings: ThemeSettings
  updateSettings: (newSettings: Partial<ThemeSettings>) => void
  saveSettings: () => Promise<void>
  resetToDefaults: () => void
  applyTheme: () => void
  loading: boolean
  previewMode: boolean
  setPreviewMode: (enabled: boolean) => void
}

const defaultSettings: ThemeSettings = {
  theme_name: "default",
  primary_color: "#059669",
  secondary_color: "#64748b",
  accent_color: "#10b981",
  background_color: "#ffffff",
  text_color: "#1f2937",
  font_family: "var(--font-geist-sans)",
  font_size: 14,
  font_weight: 400,
  line_height: 1.5,
  letter_spacing: 0.0,
  border_radius: 8,
  sidebar_width: 256,
  header_height: 64,
  dark_mode: false,
  rtl_support: true,
  card_style: "elevated",
  button_style: "rounded",
  toolbar_style: "modern",
  animation_speed: "normal",
  compact_mode: false,
  high_contrast: false,
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useThemeSettings() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useThemeSettings must be used within a ThemeSettingsProvider")
  }
  return context
}

interface ThemeSettingsProviderProps {
  children: ReactNode
}

export function ThemeSettingsProvider({ children }: ThemeSettingsProviderProps) {
  const [settings, setSettings] = useState<ThemeSettings>(defaultSettings)
  const [loading, setLoading] = useState(false) // Start with false to prevent blocking
  const [previewMode, setPreviewMode] = useState(false)
  const { setTheme } = useTheme()
  const { user } = useAuth()

  const fetchSettings = async () => {
    try {

      const url = new URL("/api/settings/theme", window.location.origin)
      if (user?.id) {
        url.searchParams.set("user_id", user.id)
      }
      url.searchParams.set("organization_id", "1")

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()

        const loadedSettings: ThemeSettings = {
          ...defaultSettings,
          ...data,
          theme_name: data.theme_name || defaultSettings.theme_name,
          primary_color: data.primary_color || defaultSettings.primary_color,
          font_family: data.font_family || defaultSettings.font_family,
          toolbar_style: ["modern", "gradient", "compact", "classic"].includes(data.toolbar_style)
            ? data.toolbar_style
            : defaultSettings.toolbar_style,
          rtl_support: data.rtl_support !== undefined ? data.rtl_support : defaultSettings.rtl_support,
        }
        setSettings(loadedSettings)
      } else {
        setSettings(defaultSettings)
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
      } else {
      }
      setSettings(defaultSettings)
    }
  }

  const updateSettings = (newSettings: Partial<ThemeSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }

  const saveSettings = async () => {
    try {
      console.log("[v0] Saving theme settings for user:", user?.id)
      console.log("[v0] Settings to save:", settings)

      const settingsToSave = {
        ...settings,
        user_id: user?.id,
        organization_id: settings.organization_id || 1,
      }

      console.log("[v0] Final settings payload:", settingsToSave)

      const method = settings.id ? "PUT" : "POST"
      console.log("[v0] Using HTTP method:", method)

      const response = await fetch("/api/settings/theme", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settingsToSave),
      })

      console.log("[v0] Response status:", response.status)
      console.log("[v0] Response ok:", response.ok)

      if (response.ok) {
        const savedData = await response.json()
        console.log("[v0] Theme settings saved successfully:", savedData)

        setSettings((prev) => ({
          ...prev,
          id: savedData.id,
          organization_id: savedData.organization_id,
          user_id: savedData.user_id,
          updated_at: savedData.updated_at,
        }))

        if (!previewMode) {
          applyTheme()
        }

        return Promise.resolve()
      } else {
        const errorText = await response.text()
        console.error("[v0] API response error:", errorText)
        console.error("[v0] Response status:", response.status)
        throw new Error(`Failed to save settings: ${response.status} - ${errorText}`)
      }
    } catch (error) {
      console.error("[v0] Error saving theme settings:", error)
      if (error instanceof Error) {
        console.error("[v0] Error message:", error.message)
        console.error("[v0] Error stack:", error.stack)
      }
      return Promise.reject(error)
    }
  }

  const resetToDefaults = () => {
    console.log("[v0] Resetting theme to defaults")
    setSettings(defaultSettings)
  }

  const applyTheme = () => {
    const root = document.documentElement

    // Apply color variables
    root.style.setProperty("--primary", settings.primary_color)
    root.style.setProperty("--primary-foreground", "#ffffff")
    root.style.setProperty("--secondary", settings.secondary_color)
    root.style.setProperty("--secondary-foreground", "#ffffff")
    root.style.setProperty("--accent", settings.accent_color)
    root.style.setProperty("--accent-foreground", "#ffffff")
    root.style.setProperty("--background", settings.background_color)
    root.style.setProperty("--foreground", settings.text_color)

    // Apply muted colors based on primary
    const primaryRgb = hexToRgb(settings.primary_color)
    if (primaryRgb) {
      root.style.setProperty("--muted", `rgb(${primaryRgb.r} ${primaryRgb.g} ${primaryRgb.b} / 0.1)`)
      root.style.setProperty("--muted-foreground", settings.text_color)
    }

    // Apply border and card colors
    root.style.setProperty("--border", settings.dark_mode ? "#374151" : "#e5e7eb")
    root.style.setProperty("--input", settings.dark_mode ? "#374151" : "#e5e7eb")
    root.style.setProperty("--ring", settings.primary_color)

    // Card styling based on card_style
    switch (settings.card_style) {
      case "flat":
        root.style.setProperty("--card", settings.background_color)
        root.style.setProperty("--card-foreground", settings.text_color)
        root.style.setProperty("--card-shadow", "none")
        break
      case "elevated":
        root.style.setProperty("--card", settings.dark_mode ? "#1f2937" : "#ffffff")
        root.style.setProperty("--card-foreground", settings.text_color)
        root.style.setProperty("--card-shadow", "0 4px 6px -1px rgb(0 0 0 / 0.1)")
        break
      case "outlined":
        root.style.setProperty("--card", settings.background_color)
        root.style.setProperty("--card-foreground", settings.text_color)
        root.style.setProperty("--card-shadow", "none")
        break
    }

    // Apply typography
    root.style.setProperty("--font-family-custom", settings.font_family)
    root.style.setProperty("--font-size-custom", `${settings.font_size}px`)
    root.style.setProperty("--font-weight-custom", settings.font_weight.toString())
    root.style.setProperty("--line-height-custom", settings.line_height.toString())
    root.style.setProperty("--letter-spacing-custom", `${settings.letter_spacing}em`)

    // Apply dimensions
    root.style.setProperty("--border-radius-custom", `${settings.border_radius}px`)
    root.style.setProperty("--sidebar-width-custom", `${settings.sidebar_width}px`)
    root.style.setProperty("--header-height-custom", `${settings.header_height}px`)
    root.dataset.toolbarStyle = settings.toolbar_style

    // Apply animation speed
    const animationDuration = {
      slow: "0.5s",
      normal: "0.3s",
      fast: "0.15s",
    }[settings.animation_speed]
    root.style.setProperty("--animation-duration", animationDuration)

    // Apply spacing for compact mode
    const spacing = settings.compact_mode ? "0.75rem" : "1rem"
    root.style.setProperty("--spacing-default", spacing)

    // Apply high contrast adjustments
    if (settings.high_contrast) {
      root.style.setProperty("--contrast-multiplier", "1.2")
    } else {
      root.style.setProperty("--contrast-multiplier", "1")
    }

    // Apply dark mode
    if (settings.dark_mode) {
      setTheme("dark")
      root.classList.add("dark")
    } else {
      setTheme("light")
      root.classList.remove("dark")
    }

    // Apply RTL support
    if (settings.rtl_support) {
      root.setAttribute("dir", "rtl")
    } else {
      root.setAttribute("dir", "ltr")
    }

    // Apply to body
    document.body.style.fontSize = `${settings.font_size}px`
    document.body.style.fontFamily = settings.font_family
    document.body.style.lineHeight = settings.line_height.toString()
    document.body.style.letterSpacing = `${settings.letter_spacing}em`
  }

  // Helper function to convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: Number.parseInt(result[1], 16),
          g: Number.parseInt(result[2], 16),
          b: Number.parseInt(result[3], 16),
        }
      : null
  }

  useEffect(() => {
    // Apply default theme immediately
    applyTheme()

    // Then try to fetch user settings in the background
    if (user?.id) {
      fetchSettings()
    }
  }, [user])

  useEffect(() => {
    applyTheme()
  }, [settings])

  const contextValue: ThemeContextType = {
    settings,
    updateSettings,
    saveSettings,
    resetToDefaults,
    applyTheme,
    loading,
    previewMode,
    setPreviewMode,
  }

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}
