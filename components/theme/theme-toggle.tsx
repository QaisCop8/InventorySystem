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
    updateSettings({ dark_mode: !settings.dark_mode })
    await saveSettings()
  }

  const changeColorScheme = async (primary: string, accent: string, name: string) => {
    updateSettings({
      primary_color: primary,
      accent_color: accent,
      theme_name: name,
    })
    await saveSettings()
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

// يُبدِّل الوضع الداكن للقائمة الجانبية فقط (Sidebar) — لا لكامل النظام كما يفعل toggleDarkMode
// في ThemeToggle أعلاه (ذاك يُبدِّل صنف "dark" على <html> فيغيّر كل الواجهة). هذا مستقل تماماً
// (انظر contexts/menu-theme-context.tsx) ويُطبَّق فقط داخل جذر القائمة الجانبية.
export function QuickThemeToggle() {
  const { menuDarkMode, toggleMenuDarkMode } = useMenuTheme()

  return (
    <Button variant="ghost" size="icon" onClick={toggleMenuDarkMode} title="تبديل الوضع الداكن للقائمة الجانبية">
      {menuDarkMode ? <Moon className="h-[1.2rem] w-[1.2rem]" /> : <Sun className="h-[1.2rem] w-[1.2rem]" />}
      <span className="sr-only">تبديل الوضع الداكن للقائمة الجانبية</span>
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
    updateSettings({
      primary_color: nextScheme.primary,
      accent_color: nextScheme.accent,
      theme_name: nextScheme.id,
    })
    await saveSettings()
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
