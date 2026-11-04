"use client"

import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { currentLanguage, setLanguage } from "@/lib/i18n"

// تبديل لغة الواجهة عربي ⇄ English (يعيد تحميل الصفحة — lib/i18n.ts#setLanguage)
export function LanguageToggle({ className = "" }: { className?: string }) {
  const english = currentLanguage() === "en"
  // اسم اللغة الأخرى بلغتها — لا يُترجم
  const label = english ? "العربية" : "English"
  return (
    <Button variant="ghost" size="sm" onClick={() => setLanguage(english ? "ar" : "en")} title={label} lang={english ? "ar" : "en"}
      className={`h-8 gap-1 rounded-full px-2 text-xs font-bold text-slate-500 hover:bg-white hover:text-emerald-600 hover:shadow-sm dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-emerald-300 ${className}`}>
      <Languages className="h-[16px] w-[16px]" />
      <span>{english ? "ع" : "EN"}</span>
      <span className="sr-only">{label}</span>
    </Button>
  )
}
