"use client"

import { tr, appDir } from "@/lib/i18n"
import type React from "react"
import { createContext, useContext, useState, useEffect, useRef } from "react"
import { applyUserFont, readUserFont, USER_FONT_STORAGE_KEY } from "@/lib/user-font"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Type, Palette, RotateCcw } from "@/components/ui/icons"
import { Check, PanelsTopLeft } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import Messages from "@/components/common/Messages"
import { useThemeSettings } from "@/contexts/theme-context"

// Font Settings Context
interface FontSettings {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
  gridHeaderHeight: number
  gridHeaderColor: string
  gridHeaderFontFamily: string
  gridRowHeight: number
  gridSelectedRowColor: string
}

interface FontContextType {
  settings: FontSettings
  updateSettings: (newSettings: Partial<FontSettings>) => void
  resetSettings: () => void
  applySettings: () => void
}

const defaultSettings: FontSettings = {
  fontFamily: "Cairo",
  fontSize: 14,
  fontWeight: "400",
  lineHeight: 1.5,
  letterSpacing: 0,
  gridHeaderHeight: 40,
  gridHeaderColor: "#2c3e50",
  gridHeaderFontFamily: "Cairo",
  gridRowHeight: 50,
  gridSelectedRowColor: "#6fe27b",
}

const toolbarTemplates = [
  { id: "modern", name: "عصري", description: tr("سطح أبيض وأزرار واضحة بحواف ناعمة"), surface: "rounded-xl border-slate-200 bg-white shadow-sm", primary: "rounded-lg bg-slate-900", save: "rounded-lg bg-indigo-600", navigation: "rounded-lg bg-slate-100" },
  { id: "gradient", name: "متدرج", description: tr("ألوان داكنة متدرجة ومظهر حيوي"), surface: "rounded-xl border-indigo-400/30 bg-gradient-to-l from-slate-900 via-indigo-900 to-teal-800 shadow-lg", primary: "rounded-lg bg-white", save: "rounded-lg bg-gradient-to-l from-cyan-400 to-indigo-500", navigation: "rounded-lg bg-white/15" },
  { id: "compact", name: "مدمج", description: tr("شريط عائم بأزرار أيقونات دائرية خفيفة"), surface: "rounded-full border-slate-200 bg-white shadow-sm", primary: "h-5 w-5 rounded-full bg-slate-900", save: "h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500", navigation: "h-5 rounded-full bg-slate-100" },
  { id: "classic", name: "كلاسيكي", description: tr("شريط Ribbon: تنقل علوي وأزرار أيقونة فوق النص"), surface: "rounded-xl border-slate-200 border-t-4 border-t-indigo-500 bg-white shadow-sm", primary: "rounded-lg bg-emerald-100 ring-1 ring-emerald-300", save: "rounded-lg bg-indigo-600", navigation: "rounded-md bg-slate-100" },
] as const

const FontContext = createContext<FontContextType | undefined>(undefined)

export const FontProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // البداية من الإعدادات المحفوظة مباشرة — كانت تبدأ بالافتراضية فيُطبَّق الخط الافتراضي ويُحفظ فوق المحفوظ
  // لحظة التحميل قبل قراءة المحفوظ (سبب آخر لظهور الخط/الحجم خطأ أحياناً)
  // (لا قراءة localStorage أثناء العرض الأول — المزوّد يُعرض على الخادم أيضاً؛ التطبيق ينتظر القراءة بدل ذلك)
  const [settings, setSettings] = useState<FontSettings>(defaultSettings)
  // حالة (لا ref): الإعدادات المحفوظة وعلَم التحميل يُحدَّثان في نفس العرض، فلا يُطبَّق الافتراضي ولو لحظة
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const saved = readUserFont()
    if (saved) setSettings({ ...defaultSettings, ...(saved as Partial<FontSettings>) })
    setLoaded(true)
  }, [])

  // Apply settings to CSS variables (lib/user-font.ts — نفس التطبيق في كل مكان)
  const applySettings = () => {
    // قبل قراءة المحفوظ: لا تطبيق ولا حفظ للافتراضي فوقه
    if (typeof document === "undefined" || !loaded) return
    applyUserFont(settings)

    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(USER_FONT_STORAGE_KEY, JSON.stringify(settings))
      window.dispatchEvent(new CustomEvent("datagrid-settings-updated", { detail: settings }))
    }
  }

  const updateSettings = (newSettings: Partial<FontSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
    if (typeof window !== "undefined") {
      localStorage.removeItem(USER_FONT_STORAGE_KEY)
    }
  }

  // Apply settings whenever they change
  useEffect(() => {
    applySettings()
  }, [settings, loaded])

  return (
    <FontContext.Provider value={{ settings, updateSettings, resetSettings, applySettings }}>
      {children}
    </FontContext.Provider>
  )
}

export const useFontSettings = () => {
  const context = useContext(FontContext)
  if (!context) {
    throw new Error("useFontSettings must be used within FontProvider")
  }
  return context
}

// Font Settings Component
export const FontSettings: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useFontSettings()
  const { settings: themeSettings, updateSettings: updateThemeSettings, saveSettings } = useThemeSettings()
  const { user } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const messagesRef = useRef<any>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/settings/user?user_id=${encodeURIComponent(user.id)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return
        updateSettings({
          fontFamily: data.font_family || defaultSettings.fontFamily,
          fontSize: Number(data.font_size || defaultSettings.fontSize),
          gridHeaderHeight: Number(data.datagrid_settings?.headerHeight || defaultSettings.gridHeaderHeight),
          gridHeaderColor: data.datagrid_settings?.headerColor || defaultSettings.gridHeaderColor,
          gridHeaderFontFamily: data.datagrid_settings?.headerFontFamily || defaultSettings.gridHeaderFontFamily,
          gridRowHeight: Number(data.datagrid_settings?.rowHeight || defaultSettings.gridRowHeight),
          gridSelectedRowColor: data.datagrid_settings?.selectedRowColor || defaultSettings.gridSelectedRowColor,
        })
      })
      .catch((error) => console.error("Failed to load user font settings", error))
  }, [user?.id])

  const saveUserFontSettings = async () => {
    if (!user?.id) return
    setIsSaving(true)
    messagesRef.current?.clear?.()
    try {
      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          font_family: settings.fontFamily,
          font_size: settings.fontSize,
          datagrid_settings: {
            headerHeight: settings.gridHeaderHeight,
            headerColor: settings.gridHeaderColor,
            headerFontFamily: settings.gridHeaderFontFamily,
            rowHeight: settings.gridRowHeight,
            selectedRowColor: settings.gridSelectedRowColor,
          },
        }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.details || result?.error || tr("تعذر حفظ إعدادات الخط"))
      }
      await saveSettings()
      messagesRef.current?.show?.([{ severity: "success", summary: "", detail: tr("تم حفظ إعدادات الخط للمستخدم"), life: 4000 }])
    } catch (error) {
      console.error(error)
      const reason = error instanceof Error ? error.message : "تعذر حفظ إعدادات الخط"
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: tr("{0} - لم يتم الحفظ", reason), life: 5000 }])
    } finally {
      setIsSaving(false)
    }
  }

  const fontFamilies = [
    { value: "Arabic Transparent", label: tr("Arabic Transparent (عربي شفاف)") },
    { value: "Simplified Arabic", label: tr("Simplified Arabic (العربية المبسطة)") },
    { value: "Traditional Arabic", label: tr("Traditional Arabic (العربية التقليدية)") },
    { value: "Cairo", label: tr("Cairo (عربي)") },
    { value: "Inter", label: tr("Inter (إنجليزي)") },
    { value: "Tajawal", label: tr("Tajawal (عربي)") },
    { value: "Amiri", label: tr("Amiri (عربي)") },
    { value: "Noto Sans Arabic", label: "Noto Sans Arabic" },
    { value: "system-ui", label: tr("خط النظام") },
  ]

  const fontWeights = [
    { value: "200", label: tr("رفيع جداً") },
    { value: "300", label: tr("رفيع") },
    { value: "400", label: tr("عادي") },
    { value: "500", label: tr("متوسط") },
    { value: "600", label: tr("سميك") },
    { value: "700", label: tr("سميك جداً") },
    { value: "800", label: tr("سميك للغاية") },
    { value: "900", label: tr("أسود") },
  ]

  return (
    <div className="space-y-6" dir={appDir()}>
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <Button variant="outline" onClick={resetSettings} className="flex items-center gap-2 bg-transparent">
          <RotateCcw className="h-4 w-4" />
          {tr("إعادة تعيين")}
        </Button>
        <Button className="flex items-center gap-2" onClick={saveUserFontSettings} disabled={isSaving || !user?.id}>
          <Type className="h-4 w-4" />
          {isSaving ? tr("جاري الحفظ...") : tr("حفظ الإعدادات")}
        </Button>
      </div>
      <Messages innerRef={messagesRef} />
      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <Type className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-start">{tr("إعدادات الخطوط")}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Font Family Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-start flex items-center gap-2">
              <Type className="h-5 w-5" />
              {tr("نوع الخط")}
            </CardTitle>
            <CardDescription className="text-start">{tr("اختر نوع الخط المناسب للنظام")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-start block">{tr("عائلة الخط")}</Label>
              <Select value={settings.fontFamily} onValueChange={(value) => updateSettings({ fontFamily: value })}>
                <SelectTrigger className="text-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontFamilies.map((font) => (
                    <SelectItem key={font.value} value={font.value} className="text-start">
                      <span style={{ fontFamily: font.value }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-start block">{tr("وزن الخط")}</Label>
              <Select value={settings.fontWeight} onValueChange={(value) => updateSettings({ fontWeight: value })}>
                <SelectTrigger className="text-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontWeights.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value} className="text-start">
                      <span style={{ fontWeight: weight.value }}>{weight.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Font Size and Spacing Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-start flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {tr("حجم الخط والمسافات")}
            </CardTitle>
            <CardDescription className="text-start">{tr("تحكم في حجم الخط والمسافات بين الأحرف والأسطر")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{settings.fontSize}px</span>
                <Label className="text-start">{tr("حجم الخط")}</Label>
              </div>
              <Slider
                value={[settings.fontSize]}
                onValueChange={([value]) => updateSettings({ fontSize: value })}
                min={10}
                max={24}
                step={1}
                className="w-full"
              />
              <div className="flex items-center gap-2" dir="ltr">
                <Input
                  id="user-font-size"
                  type="number"
                  value={settings.fontSize}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value)) {
                      updateSettings({ fontSize: Math.min(24, Math.max(10, Math.round(value))) })
                    }
                  }}
                  aria-label={tr("حجم الخط بالبكسل")}
                  min={10}
                  max={24}
                  step={1}
                  className="w-28 text-center"
                />
                <span className="text-sm font-medium text-muted-foreground">px</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{settings.lineHeight}</span>
                <Label className="text-start">{tr("ارتفاع السطر")}</Label>
              </div>
              <Slider
                value={[settings.lineHeight]}
                onValueChange={([value]) => updateSettings({ lineHeight: value })}
                min={1.0}
                max={2.5}
                step={0.1}
                className="w-full"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{settings.letterSpacing}px</span>
                <Label className="text-start">{tr("المسافة بين الأحرف")}</Label>
              </div>
              <Slider
                value={[settings.letterSpacing]}
                onValueChange={([value]) => updateSettings({ letterSpacing: value })}
                min={-2}
                max={4}
                step={0.1}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DataGridView Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-start">{tr("إعدادات جداول البيانات")}</CardTitle>
          <CardDescription className="text-start">{tr("تخصيص رأس الجدول والصفوف والصف المحدد في جميع شاشات النظام")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="grid-header-height" className="block text-start">{tr("ارتفاع رأس الجدول (px)")}</Label>
            <Input
              id="grid-header-height"
              type="number"
              min={28}
              max={80}
              value={settings.gridHeaderHeight}
              onChange={(event) => updateSettings({ gridHeaderHeight: Math.min(80, Math.max(28, Number(event.target.value) || 40)) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grid-header-color" className="block text-start">{tr("لون خلفية رأس الجدول")}</Label>
            <div className="flex items-center gap-2" dir="ltr">
              <Input
                id="grid-header-color"
                type="color"
                value={settings.gridHeaderColor}
                onChange={(event) => updateSettings({ gridHeaderColor: event.target.value })}
                className="h-10 w-16 cursor-pointer p-1"
              />
              <Input value={settings.gridHeaderColor} onChange={(event) => updateSettings({ gridHeaderColor: event.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-start">{tr("نوع خط رأس الجدول")}</Label>
            <Select value={settings.gridHeaderFontFamily} onValueChange={(value) => updateSettings({ gridHeaderFontFamily: value })}>
              <SelectTrigger className="text-start"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fontFamilies.map((font) => (
                  <SelectItem key={`grid-${font.value}`} value={font.value} className="text-start">
                    <span style={{ fontFamily: font.value }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grid-row-height" className="block text-start">{tr("ارتفاع الصف (px)")}</Label>
            <Input
              id="grid-row-height"
              type="number"
              min={24}
              max={100}
              value={settings.gridRowHeight}
              onChange={(event) => updateSettings({ gridRowHeight: Math.min(100, Math.max(24, Number(event.target.value) || 50)) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grid-selected-color" className="block text-start">{tr("لون خلفية الصف المحدد")}</Label>
            <div className="flex items-center gap-2" dir="ltr">
              <Input
                id="grid-selected-color"
                type="color"
                value={settings.gridSelectedRowColor}
                onChange={(event) => updateSettings({ gridSelectedRowColor: event.target.value })}
                className="h-10 w-16 cursor-pointer p-1"
              />
              <Input value={settings.gridSelectedRowColor} onChange={(event) => updateSettings({ gridSelectedRowColor: event.target.value })} />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border">
            <div
              className="flex items-center px-3 font-semibold text-white"
              style={{ height: settings.gridHeaderHeight, backgroundColor: settings.gridHeaderColor, fontFamily: settings.gridHeaderFontFamily }}
            >
              {tr("معاينة رأس الجدول")}
            </div>
            <div className="flex items-center px-3" style={{ height: settings.gridRowHeight, backgroundColor: settings.gridSelectedRowColor }}>
              {tr("معاينة الصف المحدد")}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-start">
            <PanelsTopLeft className="h-5 w-5" />
            {tr("قوالب شريط الأوامر")}
          </CardTitle>
          <CardDescription className="text-start">{tr("اختر شكل شريط الأوامر الموحد في شاشات النظام")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {toolbarTemplates.map((template) => {
            const selected = themeSettings.toolbar_style === template.id
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={selected}
                onClick={() => updateThemeSettings({ toolbar_style: template.id })}
                className={`group relative overflow-hidden rounded-2xl border-2 p-3 text-start transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${selected ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"}`}
              >
                {selected && <span className="absolute end-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"><Check className="h-4 w-4" /></span>}
                <div className={`mb-3 items-center gap-1.5 border p-2 ${template.id === "gradient" || template.id === "classic" ? "grid h-24 grid-cols-2" : "flex h-14"} ${template.surface}`}>
                  <span className={`block ${template.id === "gradient" ? "h-10 w-12" : template.id === "compact" ? "h-5 w-5" : "h-7 w-10"} ${template.primary}`} />
                  <span className={`block ${template.id === "gradient" ? "h-10 w-12" : template.id === "compact" ? "h-5 w-5" : "h-7 w-10"} ${template.save}`} />
                  <span className={`block h-7 ${template.id === "gradient" ? "col-span-2 w-full" : template.id === "classic" ? "order-first col-span-2 w-full" : "ms-auto w-20"} ${template.navigation}`}><span className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-slate-500/50" /></span>
                </div>
                <div className="font-bold text-foreground">{template.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</div>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-start">{tr("معاينة الخط")}</CardTitle>
          <CardDescription className="text-start">{tr("شاهد كيف ستبدو النصوص بالإعدادات الحالية")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="p-6 bg-muted rounded-lg space-y-4"
            style={{
              fontFamily: settings.fontFamily,
              fontSize: `${settings.fontSize}px`,
              fontWeight: settings.fontWeight,
              lineHeight: settings.lineHeight,
              letterSpacing: `${settings.letterSpacing}px`,
            }}
          >
            <h3 className="text-xl font-bold text-start">{tr("عنوان رئيسي")}</h3>
            <h4 className="text-lg font-semibold text-start">{tr("عنوان فرعي")}</h4>
            <p className="text-start">
              {tr("هذا نص تجريبي لمعاينة الخط المحدد. يمكنك رؤية كيف ستبدو النصوص في النظام بالإعدادات الحالية. النص العربي يحتاج إلى خطوط مناسبة لضمان الوضوح والقراءة السهلة.")}
            </p>
            <div className="flex gap-4 text-sm text-start">
              <span className="font-bold">{tr("نص سميك")}</span>
              <span className="font-normal">{tr("نص عادي")}</span>
              <span className="font-light">{tr("نص رفيع")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

export default FontSettings
