"use client"

import { Moon, Sun, Palette, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useThemeSettings } from "@/contexts/theme-context"
import { useMenuTheme } from "@/contexts/menu-theme-context"

export function ThemeToggle() {
  const { settings, updateSettings, saveSettings } = useThemeSettings()

  const toggleDarkMode = async () => {
    const dark_mode = !settings.dark_mode
    updateSettings({ dark_mode })
    await saveSettings({ dark_mode })
  }

  const changeColorScheme = async (primary: string, accent: string, name: string) => {
    const next = { primary_color: primary, accent_color: accent, theme_name: name }
    updateSettings(next)
    await saveSettings(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">تبديل المظهر</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>المظهر</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleDarkMode}>
          {settings.dark_mode ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              <span>الوضع الفاتح</span>
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              <span>الوضع الداكن</span>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>الألوان السريعة</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => changeColorScheme("#059669", "#10b981", "emerald")}>
          <div className="mr-2 h-4 w-4 rounded-full bg-emerald-500" />
          <span>الزمرد</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeColorScheme("#0891b2", "#06b6d4", "blue")}>
          <div className="mr-2 h-4 w-4 rounded-full bg-cyan-500" />
          <span>الأزرق</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeColorScheme("#7c3aed", "#a855f7", "purple")}>
          <div className="mr-2 h-4 w-4 rounded-full bg-purple-500" />
          <span>البنفسجي</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeColorScheme("#ea580c", "#f97316", "orange")}>
          <div className="mr-2 h-4 w-4 rounded-full bg-orange-500" />
          <span>البرتقالي</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// زر شريط العنوان: الوضع الداكن لكامل النظام (صنف "dark" على <html> + حفظه بإعدادات مظهر المستخدم)،
// والقائمة الجانبية تتبعه (وضعها المستقل يُزامَن بنفس القيمة).
export function QuickThemeToggle() {
  const { settings, updateSettings, saveSettings } = useThemeSettings()
  const { menuDarkMode, toggleMenuDarkMode } = useMenuTheme()
  const dark = Boolean(settings.dark_mode)

  const toggle = () => {
    const dark_mode = !dark
    updateSettings({ dark_mode })
    if (menuDarkMode !== dark_mode) toggleMenuDarkMode()
    void saveSettings({ dark_mode })
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={dark ? "الوضع الفاتح" : "الوضع الداكن"}>
      {dark ? <Sun className="h-[1.2rem] w-[1.2rem]" /> : <Moon className="h-[1.2rem] w-[1.2rem]" />}
      <span className="sr-only">{dark ? "الوضع الفاتح" : "الوضع الداكن"}</span>
    </Button>
  )
}

export function ColorSchemeToggle() {
  const { settings, updateSettings, saveSettings } = useThemeSettings()

  const colorSchemes = [
    { name: "الزمرد", primary: "#059669", accent: "#10b981", id: "emerald" },
    { name: "الأزرق", primary: "#0891b2", accent: "#06b6d4", id: "blue" },
    { name: "البنفسجي", primary: "#7c3aed", accent: "#a855f7", id: "purple" },
    { name: "البرتقالي", primary: "#ea580c", accent: "#f97316", id: "orange" },
  ]

  const currentSchemeIndex = colorSchemes.findIndex((scheme) => scheme.primary === settings.primary_color)
  const nextScheme = colorSchemes[(currentSchemeIndex + 1) % colorSchemes.length]

  const toggleColorScheme = async () => {
    const next = { primary_color: nextScheme.primary, accent_color: nextScheme.accent, theme_name: nextScheme.id }
    updateSettings(next)
    await saveSettings(next)
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleColorScheme} title={`تغيير إلى ${nextScheme.name}`}>
      <Palette className="h-[1.2rem] w-[1.2rem]" style={{ color: settings.primary_color }} />
      <span className="sr-only">تبديل نظام الألوان</span>
    </Button>
  )
}

export function ThemeSettingsButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick}>
      <Settings className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">إعدادات المظهر</span>
    </Button>
  )
}
