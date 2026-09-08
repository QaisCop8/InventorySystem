"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Palette, Type, Sparkles, RotateCcw, Download, Upload, Save, Check, PanelsTopLeft } from "lucide-react"
import { useThemeSettings } from "@/contexts/theme-context"

const colorSchemes = [
  { id: "emerald", name: "الزمرد", primary: "#059669", accent: "#10b981" },
  { id: "blue", name: "الأزرق", primary: "#0891b2", accent: "#06b6d4" },
  { id: "purple", name: "البنفسجي", primary: "#7c3aed", accent: "#a855f7" },
  { id: "orange", name: "البرتقالي", primary: "#ea580c", accent: "#f97316" },
  { id: "rose", name: "الوردي", primary: "#e11d48", accent: "#f43f5e" },
  { id: "slate", name: "الرمادي", primary: "#475569", accent: "#64748b" },
]

const toolbarTemplates = [
  {
    id: "modern",
    name: "عصري",
    description: "سطح أبيض وأزرار واضحة بحواف ناعمة",
    surface: "rounded-xl border-slate-200 bg-white shadow-sm",
    primary: "rounded-lg bg-slate-900",
    save: "rounded-lg bg-indigo-600",
    navigation: "rounded-lg bg-slate-100",
  },
  {
    id: "gradient",
    name: "متدرج",
    description: "ألوان داكنة متدرجة ومظهر حيوي",
    surface: "rounded-xl border-indigo-400/30 bg-gradient-to-l from-slate-900 via-indigo-900 to-teal-800 shadow-lg",
    primary: "rounded-lg bg-white",
    save: "rounded-lg bg-gradient-to-l from-cyan-400 to-indigo-500",
    navigation: "rounded-lg bg-white/15",
  },
  {
    id: "compact",
    name: "مدمج",
    description: "مساحة أقل وأزرار أيقونات سريعة",
    surface: "rounded-lg border-slate-300 bg-white",
    primary: "h-5 w-5 rounded bg-slate-900",
    save: "h-5 w-5 rounded bg-indigo-600",
    navigation: "h-5 rounded bg-slate-100",
  },
  {
    id: "classic",
    name: "كلاسيكي",
    description: "شريط عملي بإطار واضح وأزرار تقليدية",
    surface: "rounded border-slate-400 bg-gradient-to-b from-slate-50 to-slate-200 shadow-sm",
    primary: "rounded-sm bg-slate-700",
    save: "rounded-sm bg-blue-600",
    navigation: "rounded-sm border border-slate-400 bg-slate-300",
  },
] as const

const fontFamilies = [
  { id: "geist", name: "Geist (افتراضي)", value: "var(--font-geist-sans)" },
  { id: "cairo", name: "Cairo", value: "Cairo, sans-serif" },
  { id: "amiri", name: "Amiri", value: "Amiri, serif" },
  { id: "noto", name: "Noto Sans Arabic", value: "Noto Sans Arabic, sans-serif" },
  { id: "tajawal", name: "Tajawal", value: "Tajawal, sans-serif" },
]

export function ThemeCustomization() {
  const { settings, updateSettings, saveSettings, resetToDefaults, loading, previewMode, setPreviewMode } =
    useThemeSettings()

  const [saving, setSaving] = useState(false)

  const handleColorSchemeChange = (schemeId: string) => {
    const scheme = colorSchemes.find((s) => s.id === schemeId)
    if (scheme) {
      updateSettings({
        theme_name: schemeId,
        primary_color: scheme.primary,
        accent_color: scheme.accent,
      })
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      console.log("[v0] Starting theme save process...")
      console.log("[v0] Current settings:", settings)

      await saveSettings()

      console.log("[v0] Theme settings saved successfully!")
      alert("تم حفظ الإعدادات بنجاح!")
    } catch (error) {
      console.error("[v0] Error saving theme settings:", error)
      console.error("[v0] Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        settings: settings,
      })
      alert("حدث خطأ في حفظ الإعدادات")
    } finally {
      setSaving(false)
    }
  }

  const exportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = "theme-settings.json"
    link.click()
  }

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string)
          updateSettings(imported)
        } catch (error) {
          console.error("خطأ في استيراد الإعدادات:", error)
        }
      }
      reader.readAsText(file)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>جاري تحميل إعدادات التخصيص...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">تخصيص المظهر</h2>
          <p className="text-muted-foreground">قم بتخصيص ألوان وخطوط ومؤثرات النظام</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="w-4 h-4 ml-2" />
            إعادة تعيين
          </Button>
          <Button variant="outline" size="sm" onClick={exportSettings}>
            <Download className="w-4 h-4 ml-2" />
            تصدير
          </Button>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("import-file")?.click()}>
            <Upload className="w-4 h-4 ml-2" />
            استيراد
          </Button>
          <input id="import-file" type="file" accept=".json" onChange={importSettings} className="hidden" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={previewMode} onCheckedChange={setPreviewMode} id="preview-mode" />
        <Label htmlFor="preview-mode">معاينة مباشرة للتغييرات</Label>
        {previewMode && (
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            وضع المعاينة نشط
          </Badge>
        )}
      </div>

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="colors" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            الألوان
          </TabsTrigger>
          <TabsTrigger value="typography" className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            الخطوط
          </TabsTrigger>
          <TabsTrigger value="effects" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            المؤثرات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>نظام الألوان</CardTitle>
              <CardDescription>اختر نظام الألوان المناسب لشركتك</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base font-medium">الأنظمة المحددة مسبقاً</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
                  {colorSchemes.map((scheme) => (
                    <Card
                      key={scheme.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        settings.theme_name === scheme.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => handleColorSchemeChange(scheme.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: scheme.primary }}
                            />
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: scheme.accent }}
                            />
                          </div>
                          <span className="font-medium">{scheme.name}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="primary-color">اللون الأساسي</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => updateSettings({ primary_color: e.target.value })}
                      className="w-12 h-10 rounded border border-input cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">{settings.primary_color}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="accent-color">اللون المساعد</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={settings.accent_color}
                      onChange={(e) => updateSettings({ accent_color: e.target.value })}
                      className="w-12 h-10 rounded border border-input cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">{settings.accent_color}</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PanelsTopLeft className="h-5 w-5 text-primary" />
                <CardTitle>شكل شريط الأزرار</CardTitle>
              </div>
              <CardDescription>اختر قالب شريط الأوامر. ستظهر المعاينة مباشرة في جميع شاشات النظام.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" dir="rtl">
                {toolbarTemplates.map((template) => {
                  const selected = settings.toolbar_style === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateSettings({ toolbar_style: template.id })}
                      className={`group relative overflow-hidden rounded-2xl border-2 p-3 text-right transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        selected ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"
                      }`}
                    >
                      {selected && (
                        <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      <div className={`mb-3 flex h-14 items-center gap-1.5 border p-2 ${template.surface}`}>
                        <span className={`block h-7 w-10 ${template.primary}`} />
                        <span className={`block h-7 w-10 ${template.save}`} />
                        <span className={`mr-auto block h-7 w-20 ${template.navigation}`}>
                          <span className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-slate-500/50" />
                        </span>
                      </div>
                      <div className="font-bold text-foreground">{template.name}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>معاينة الألوان</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button style={{ backgroundColor: settings.primary_color, color: "white" }}>زر أساسي</Button>
                  <Button
                    variant="outline"
                    style={{ borderColor: settings.accent_color, color: settings.accent_color }}
                  >
                    زر ثانوي
                  </Button>
                </div>
                <div className="p-4 rounded-lg border" style={{ borderColor: settings.primary_color }}>
                  <h4 className="font-medium" style={{ color: settings.primary_color }}>
                    عنوان تجريبي
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">هذا نص تجريبي لمعاينة الألوان المختارة في النظام</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="typography" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>إعدادات الخطوط</CardTitle>
              <CardDescription>تخصيص نوع وحجم الخطوط</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="font-family">نوع الخط</Label>
                <Select value={settings.font_family} onValueChange={(value) => updateSettings({ font_family: value })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fontFamilies.map((font) => (
                      <SelectItem key={font.id} value={font.value}>
                        <span style={{ fontFamily: font.value }}>{font.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="font-size">حجم الخط: {settings.font_size}px</Label>
                <Slider
                  value={[settings.font_size]}
                  onValueChange={(value) => updateSettings({ font_size: value[0] })}
                  max={20}
                  min={12}
                  step={1}
                  className="mt-3"
                />
              </div>

              <div
                className="p-4 border rounded-lg space-y-3"
                style={{ fontFamily: settings.font_family, fontSize: `${settings.font_size}px` }}
              >
                <h3 className="text-xl font-bold">عنوان رئيسي</h3>
                <h4 className="text-lg font-semibold">عنوان فرعي</h4>
                <p className="text-base">
                  هذا نص تجريبي لمعاينة الخط المختار. يمكنك رؤية كيف سيظهر النص في النظام بالخط والحجم المحددين.
                </p>
                <p className="text-sm text-muted-foreground">نص صغير للتفاصيل والملاحظات</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="effects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>المؤثرات البصرية</CardTitle>
              <CardDescription>تخصيص الظلال والانتقالات والمساحات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="border-radius">استدارة الحواف: {settings.border_radius}px</Label>
                <Slider
                  value={[settings.border_radius]}
                  onValueChange={(value) => updateSettings({ border_radius: value[0] })}
                  max={20}
                  min={0}
                  step={2}
                  className="mt-3"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="compact-mode">الوضع المضغوط</Label>
                    <p className="text-sm text-muted-foreground">تقليل المساحات بين العناصر</p>
                  </div>
                  <Switch
                    id="compact-mode"
                    checked={settings.compact_mode}
                    onCheckedChange={(checked) => updateSettings({ compact_mode: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dark-mode">الوضع الداكن</Label>
                    <p className="text-sm text-muted-foreground">تفعيل وضع النظام الداكن</p>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={settings.dark_mode}
                    onCheckedChange={(checked) => updateSettings({ dark_mode: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="high-contrast">التباين العالي</Label>
                    <p className="text-sm text-muted-foreground">زيادة التباين للوضوح</p>
                  </div>
                  <Switch
                    id="high-contrast"
                    checked={settings.high_contrast}
                    onCheckedChange={(checked) => updateSettings({ high_contrast: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="rtl-support">دعم العربية</Label>
                    <p className="text-sm text-muted-foreground">تفعيل الكتابة من اليمين لليسار</p>
                  </div>
                  <Switch
                    id="rtl-support"
                    checked={settings.rtl_support}
                    onCheckedChange={(checked) => updateSettings({ rtl_support: checked })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="card-style">نمط البطاقات</Label>
                <Select
                  value={settings.card_style}
                  onValueChange={(value: "flat" | "elevated" | "outlined") => updateSettings({ card_style: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">مسطح</SelectItem>
                    <SelectItem value="elevated">مرتفع</SelectItem>
                    <SelectItem value="outlined">محدد</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="animation-speed">سرعة الحركات</Label>
                <Select
                  value={settings.animation_speed}
                  onValueChange={(value: "slow" | "normal" | "fast") => updateSettings({ animation_speed: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">بطيء</SelectItem>
                    <SelectItem value="normal">عادي</SelectItem>
                    <SelectItem value="fast">سريع</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>معاينة المؤثرات</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card
                    className="transition-all hover:scale-105"
                    style={{
                      borderRadius: `${settings.border_radius}px`,
                      padding: settings.compact_mode ? "0.75rem" : "1rem",
                    }}
                  >
                    <CardContent className="p-0">
                      <h4 className="font-medium">بطاقة تجريبية</h4>
                      <p className="text-sm text-muted-foreground mt-1">معاينة للمؤثرات المطبقة</p>
                    </CardContent>
                  </Card>

                  <Button
                    className="transition-all hover:scale-105"
                    style={{
                      borderRadius: `${settings.border_radius}px`,
                      padding: settings.compact_mode ? "0.5rem 1rem" : "0.75rem 1.5rem",
                    }}
                  >
                    زر تجريبي
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">حفظ الإعدادات</h4>
              <p className="text-sm text-muted-foreground">احفظ إعداداتك المخصصة لتطبيقها على النظام</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
