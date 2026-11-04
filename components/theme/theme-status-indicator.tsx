"use client"

import { tr } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { useThemeSettings } from "@/contexts/theme-context"

export function ThemeStatusIndicator() {
  const { settings, loading } = useThemeSettings()

  if (loading) {
    return (
      <Badge variant="secondary" className="animate-pulse">
        {tr("جاري تحميل الأصناف...")}
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.primary_color }} />
        {settings.theme_name === "emerald" && tr("الزمرد")}
        {settings.theme_name === "blue" && tr("الأزرق")}
        {settings.theme_name === "purple" && tr("البنفسجي")}
        {settings.theme_name === "orange" && tr("البرتقالي")}
        {settings.theme_name === "rose" && tr("الوردي")}
        {settings.theme_name === "slate" && tr("الرمادي")}
        {!["emerald", "blue", "purple", "orange", "rose", "slate"].includes(settings.theme_name) && tr("مخصص")}
      </Badge>
      {settings.dark_mode && <Badge variant="secondary">{tr("داكن")}</Badge>}
      {settings.compact_mode && <Badge variant="secondary">{tr("مضغوط")}</Badge>}
    </div>
  )
}
