"use client"

import { Badge } from "@/components/ui/badge"
import { useThemeSettings } from "@/contexts/theme-context"

export function ThemeStatusIndicator() {
  const { settings, loading } = useThemeSettings()

  if (loading) {
    return (
      <Badge variant="secondary" className="animate-pulse">
        جاري تحميل الأصناف...
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.primary_color }} />
        {settings.theme_name === "emerald" && "الزمرد"}
        {settings.theme_name === "blue" && "الأزرق"}
        {settings.theme_name === "purple" && "البنفسجي"}
        {settings.theme_name === "orange" && "البرتقالي"}
        {settings.theme_name === "rose" && "الوردي"}
        {settings.theme_name === "slate" && "الرمادي"}
        {!["emerald", "blue", "purple", "orange", "rose", "slate"].includes(settings.theme_name) && "مخصص"}
      </Badge>
      {settings.dark_mode && <Badge variant="secondary">داكن</Badge>}
      {settings.compact_mode && <Badge variant="secondary">مضغوط</Badge>}
    </div>
  )
}
