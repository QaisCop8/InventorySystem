"use client"

import { tr } from "@/lib/i18n"
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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useThemeSettings } from "@/contexts/theme-context"
import {
  Palette,
  Type,
  Sparkles,
  RotateCcw,
  Download,
  Upload,
  Eye,
  Save,
  Sun,
  Moon,
  Contrast,
  Layout,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

const colorSchemes = [
  { id: "emerald", name: "الزمرد", primary: "#059669", secondary: "#64748b", accent: "#10b981" },
  { id: "blue", name: "الأزرق", primary: "#0891b2", secondary: "#64748b", accent: "#06b6d4" },
  { id: "purple", name: "البنفسجي", primary: "#7c3aed", secondary: "#64748b", accent: "#a855f7" },
  { id: "orange", name: "البرتقالي", primary: "#ea580c", secondary: "#64748b", accent: "#f97316" },
  { id: "rose", name: "الوردي", primary: "#e11d48", secondary: "#64748b", accent: "#f43f5e" },
  { id: "slate", name: "الرمادي", primary: "#475569", secondary: "#64748b", accent: "#64748b" },
  { id: "indigo", name: "النيلي", primary: "#4f46e5", secondary: "#64748b", accent: "#6366f1" },
  { id: "teal", name: "الأزرق المخضر", primary: "#0d9488", secondary: "#64748b", accent: "#14b8a6" },
]

const fontFamilies = [
  { id: "geist", name: "Geist (افتراضي)", value: "var(--font-geist-sans)" },
  { id: "cairo", name: "Cairo", value: "Cairo, sans-serif" },
  { id: "amiri", name: "Amiri", value: "Amiri, serif" },
  { id: "noto", name: "Noto Sans Arabic", value: "Noto Sans Arabic, sans-serif" },
  { id: "tajawal", name: "Tajawal", value: "Tajawal, sans-serif" },
  { id: "inter", name: "Inter", value: "Inter, sans-serif" },
  { id: "roboto", name: "Roboto", value: "Roboto, sans-serif" },
]

export function AdvancedThemeCustomization() {
  const { settings, updateSettings, saveSettings, resetToDefaults, loading, previewMode, setPreviewMode } =
    useThemeSettings()

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    try {
      setSaving(true)
      await saveSettings()
      toast.success(tr("تم حفظ إعدادات المظهر بنجاح!"))
    } catch (error) {
      toast.error(tr("حدث خطأ في حفظ الإعدادات"))
    } finally {
      setSaving(false)
    }
  }

  const handleColorSchemeChange = (schemeId: string) => {
    const scheme = colorSchemes.find((s) => s.id === schemeId)
    if (scheme) {
      updateSettings({
        theme_name: schemeId,
        primary_color: scheme.primary,
        secondary_color: scheme.secondary,
        accent_color: scheme.accent,
      })
    }
  }

  const exportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `theme-settings-${new Date().toISOString().split("T")[0]}.json`
    link.click()
    toast.success(tr("تم تصدير الإعدادات بنجاح!"))
  }

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string)
          updateSettings(imported)
          toast.success(tr("تم استيراد الإعدادات بنجاح!"))
        } catch (error) {
          toast.error(tr("خطأ في استيراد الإعدادات"))
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
          <p>{tr("جاري تحميل إعدادات المظهر...")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr("تخصيص المظهر المتقدم")}</h2>
          <p className="text-muted-foreground mt-1">{tr("تحكم كامل في مظهر النظام - الألوان، الخطوط، التخطيط، والمؤثرات")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="w-4 h-4 me-2" />
            {tr("إعادة تعيين")}
          </Button>
          <Button variant="outline" size="sm" onClick={exportSettings}>
            <Download className="w-4 h-4 me-2" />
            {tr("تصدير")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("import-file")?.click()}>
            <Upload className="w-4 h-4 me-2" />
            {tr("استيراد")}
          </Button>
          <input id="import-file" type="file" accept=".json" onChange={importSettings} className="hidden" />
        </div>
      </div>

      {/* Preview Mode Toggle */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-primary" />
              <div>
                <Label htmlFor="preview-mode" className="text-base font-medium">
                  {tr("معاينة مباشرة للتغييرات")}
                </Label>
                <p className="text-sm text-muted-foreground">{tr("مشاهدة التغييرات فوراً قبل الحفظ")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {previewMode && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  <Zap className="w-3 h-3 me-1" />
                  {tr("وضع المعاينة نشط")}
                </Badge>
              )}
              <Switch checked={previewMode} onCheckedChange={setPreviewMode} id="preview-mode" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="colors" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            {tr("الألوان")}
          </TabsTrigger>
          <TabsTrigger value="typography" className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            {tr("الخطوط")}
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex items-center gap-2">
            <Layout className="w-4 h-4" />
            {tr("التخطيط")}
          </TabsTrigger>
          <TabsTrigger value="effects" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {tr("المؤثرات")}
          </TabsTrigger>
          <TabsTrigger value="accessibility" className="flex items-center gap-2">
            <Contrast className="w-4 h-4" />
            {tr("إمكانية الوصول")}
          </TabsTrigger>
        </TabsList>

        {/* Colors Tab */}
        <TabsContent value="colors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                {tr("أنظمة الألوان المحددة مسبقاً")}
              </CardTitle>
              <CardDescription>{tr("اختر نظام ألوان جاهز أو قم بتخصيص الألوان يدوياً")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {colorSchemes.map((scheme) => (
                  <Card
                    key={scheme.id}
                    className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${
                      settings.theme_name === scheme.id ? "ring-2 ring-primary shadow-lg" : ""
                    }`}
                    onClick={() => handleColorSchemeChange(scheme.id)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-center gap-1">
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                            style={{ backgroundColor: scheme.primary }}
                          />
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                            style={{ backgroundColor: scheme.accent }}
                          />
                        </div>
                        <div className="text-center">
                          <span className="font-medium text-sm">{scheme.name}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="primary-color" className="text-base font-medium">
                    {tr("اللون الأساسي")}
                  </Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => updateSettings({ primary_color: e.target.value })}
                      className="w-12 h-12 rounded-lg border border-input cursor-pointer"
                    />
                    <div className="flex-1">
                      <Input
                        value={settings.primary_color}
                        onChange={(e) => updateSettings({ primary_color: e.target.value })}
                        placeholder="#059669"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="secondary-color" className="text-base font-medium">
                    {tr("اللون الثانوي")}
                  </Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={settings.secondary_color}
                      onChange={(e) => updateSettings({ secondary_color: e.target.value })}
                      className="w-12 h-12 rounded-lg border border-input cursor-pointer"
                    />
                    <div className="flex-1">
                      <Input
                        value={settings.secondary_color}
                        onChange={(e) => updateSettings({ secondary_color: e.target.value })}
                        placeholder="#64748b"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="accent-color" className="text-base font-medium">
                    {tr("اللون المساعد")}
                  </Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={settings.accent_color}
                      onChange={(e) => updateSettings({ accent_color: e.target.value })}
                      className="w-12 h-12 rounded-lg border border-input cursor-pointer"
                    />
                    <div className="flex-1">
                      <Input
                        value={settings.accent_color}
                        onChange={(e) => updateSettings({ accent_color: e.target.value })}
                        placeholder="#10b981"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Color Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{tr("معاينة الألوان")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Button style={{ backgroundColor: settings.primary_color, color: "white" }}>{tr("زر أساسي")}</Button>
                  <Button
                    variant="outline"
                    style={{ borderColor: settings.accent_color, color: settings.accent_color }}
                  >
                    {tr("زر ثانوي")}
                  </Button>
                  <Button variant="secondary" style={{ backgroundColor: settings.secondary_color, color: "white" }}>
                    {tr("زر مساعد")}
                  </Button>
                </div>
                <div className="p-6 rounded-lg border-2" style={{ borderColor: settings.primary_color }}>
                  <h4 className="font-bold text-lg mb-2" style={{ color: settings.primary_color }}>
                    {tr("عنوان تجريبي")}
                  </h4>
                  <p className="text-muted-foreground mb-3">
                    {tr("هذا نص تجريبي لمعاينة الألوان المختارة في النظام. يمكنك رؤية كيف ستظهر الألوان في التطبيق الفعلي.")}
                  </p>
                  <div className="flex gap-2">
                    <Badge style={{ backgroundColor: settings.accent_color, color: "white" }}>{tr("تسمية ملونة")}</Badge>
                    <Badge
                      variant="outline"
                      style={{ borderColor: settings.secondary_color, color: settings.secondary_color }}
                    >
                      {tr("تسمية محددة")}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Typography Tab */}
        <TabsContent value="typography" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="w-5 h-5" />
                {tr("إعدادات الخطوط")}
              </CardTitle>
              <CardDescription>{tr("تخصيص نوع وحجم ووزن الخطوط")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="font-family" className="text-base font-medium">
                    {tr("نوع الخط")}
                  </Label>
                  <Select
                    value={settings.font_family}
                    onValueChange={(value) => updateSettings({ font_family: value })}
                  >
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
                  <Label htmlFor="font-weight" className="text-base font-medium">
                    {tr("وزن الخط")}
                  </Label>
                  <Select
                    value={settings.font_weight.toString()}
                    onValueChange={(value) => updateSettings({ font_weight: Number.parseInt(value) })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">{tr("خفيف (300)")}</SelectItem>
                      <SelectItem value="400">{tr("عادي (400)")}</SelectItem>
                      <SelectItem value="500">{tr("متوسط (500)")}</SelectItem>
                      <SelectItem value="600">{tr("سميك (600)")}</SelectItem>
                      <SelectItem value="700">{tr("عريض (700)")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="font-size" className="text-base font-medium">
                    {tr("حجم الخط: ")}{settings.font_size}px
                  </Label>
                  <Slider
                    value={[settings.font_size]}
                    onValueChange={(value) => updateSettings({ font_size: value[0] })}
                    max={24}
                    min={10}
                    step={1}
                    className="mt-3"
                  />
                </div>

                <div>
                  <Label htmlFor="line-height" className="text-base font-medium">
                    {tr("ارتفاع السطر: ")}{settings.line_height}
                  </Label>
                  <Slider
                    value={[settings.line_height]}
                    onValueChange={(value) => updateSettings({ line_height: value[0] })}
                    max={2.5}
                    min={1.0}
                    step={0.1}
                    className="mt-3"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="letter-spacing" className="text-base font-medium">
                  {tr("تباعد الأحرف: ")}{settings.letter_spacing}em
                </Label>
                <Slider
                  value={[settings.letter_spacing]}
                  onValueChange={(value) => updateSettings({ letter_spacing: value[0] })}
                  max={0.2}
                  min={-0.1}
                  step={0.01}
                  className="mt-3"
                />
              </div>
            </CardContent>
          </Card>

          {/* Typography Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{tr("معاينة الخطوط")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="space-y-4 p-6 border rounded-lg"
                style={{
                  fontFamily: settings.font_family,
                  fontSize: `${settings.font_size}px`,
                  fontWeight: settings.font_weight,
                  lineHeight: settings.line_height,
                  letterSpacing: `${settings.letter_spacing}em`,
                }}
              >
                <h1 className="text-3xl font-bold">{tr("عنوان رئيسي كبير")}</h1>
                <h2 className="text-2xl font-semibold">{tr("عنوان رئيسي متوسط")}</h2>
                <h3 className="text-xl font-medium">{tr("عنوان فرعي")}</h3>
                <p className="text-base">
                  {tr("هذا نص تجريبي لمعاينة الخط المختار. يمكنك رؤية كيف سيظهر النص في النظام بالخط والحجم والوزن المحددين. النص العربي يحتاج إلى خطوط مناسبة لضمان الوضوح والقراءة السهلة.")}
                </p>
                <p className="text-sm text-muted-foreground">{tr("نص صغير للتفاصيل والملاحظات والمعلومات الإضافية")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Layout Tab */}
        <TabsContent value="layout" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="w-5 h-5" />
                {tr("إعدادات التخطيط")}
              </CardTitle>
              <CardDescription>{tr("تخصيص أبعاد ومساحات عناصر الواجهة")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="border-radius" className="text-base font-medium">
                    {tr("استدارة الحواف: ")}{settings.border_radius}px
                  </Label>
                  <Slider
                    value={[settings.border_radius]}
                    onValueChange={(value) => updateSettings({ border_radius: value[0] })}
                    max={24}
                    min={0}
                    step={2}
                    className="mt-3"
                  />
                </div>

                <div>
                  <Label htmlFor="sidebar-width" className="text-base font-medium">
                    {tr("عرض الشريط الجانبي: ")}{settings.sidebar_width}px
                  </Label>
                  <Slider
                    value={[settings.sidebar_width]}
                    onValueChange={(value) => updateSettings({ sidebar_width: value[0] })}
                    max={400}
                    min={200}
                    step={8}
                    className="mt-3"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="header-height" className="text-base font-medium">
                  {tr("ارتفاع الرأس: ")}{settings.header_height}px
                </Label>
                <Slider
                  value={[settings.header_height]}
                  onValueChange={(value) => updateSettings({ header_height: value[0] })}
                  max={100}
                  min={48}
                  step={4}
                  className="mt-3"
                />
              </div>

              <div>
                <Label htmlFor="card-style" className="text-base font-medium">
                  {tr("نمط البطاقات")}
                </Label>
                <Select
                  value={settings.card_style}
                  onValueChange={(value: "flat" | "elevated" | "outlined") => updateSettings({ card_style: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">{tr("مسطح")}</SelectItem>
                    <SelectItem value="elevated">{tr("مرتفع (بظلال)")}</SelectItem>
                    <SelectItem value="outlined">{tr("محدد")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="button-style" className="text-base font-medium">
                  {tr("نمط الأزرار")}
                </Label>
                <Select
                  value={settings.button_style}
                  onValueChange={(value: "rounded" | "square" | "pill") => updateSettings({ button_style: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">{tr("مستدير")}</SelectItem>
                    <SelectItem value="square">{tr("مربع")}</SelectItem>
                    <SelectItem value="pill">{tr("بيضاوي")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Effects Tab */}
        <TabsContent value="effects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {tr("المؤثرات البصرية")}
              </CardTitle>
              <CardDescription>{tr("تخصيص الحركات والانتقالات والمؤثرات")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="animation-speed" className="text-base font-medium">
                  {tr("سرعة الحركات")}
                </Label>
                <Select
                  value={settings.animation_speed}
                  onValueChange={(value: "slow" | "normal" | "fast") => updateSettings({ animation_speed: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">{tr("بطيء (0.5s)")}</SelectItem>
                    <SelectItem value="normal">{tr("عادي (0.3s)")}</SelectItem>
                    <SelectItem value="fast">{tr("سريع (0.15s)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="compact-mode" className="text-base font-medium">
                      {tr("الوضع المضغوط")}
                    </Label>
                    <p className="text-sm text-muted-foreground">{tr("تقليل المساحات بين العناصر")}</p>
                  </div>
                  <Switch
                    id="compact-mode"
                    checked={settings.compact_mode}
                    onCheckedChange={(checked) => updateSettings({ compact_mode: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="dark-mode" className="text-base font-medium">
                      {tr("الوضع الداكن")}
                    </Label>
                    <p className="text-sm text-muted-foreground">{tr("تفعيل وضع النظام الداكن")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4" />
                    <Switch
                      id="dark-mode"
                      checked={settings.dark_mode}
                      onCheckedChange={(checked) => updateSettings({ dark_mode: checked })}
                    />
                    <Moon className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accessibility Tab */}
        <TabsContent value="accessibility" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Contrast className="w-5 h-5" />
                {tr("إمكانية الوصول")}
              </CardTitle>
              <CardDescription>{tr("إعدادات لتحسين إمكانية الوصول للمستخدمين")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="high-contrast" className="text-base font-medium">
                      {tr("التباين العالي")}
                    </Label>
                    <p className="text-sm text-muted-foreground">{tr("زيادة التباين لسهولة القراءة")}</p>
                  </div>
                  <Switch
                    id="high-contrast"
                    checked={settings.high_contrast}
                    onCheckedChange={(checked) => updateSettings({ high_contrast: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="rtl-support" className="text-base font-medium">
                      {tr("دعم RTL")}
                    </Label>
                    <p className="text-sm text-muted-foreground">{tr("دعم الكتابة من اليمين لليسار")}</p>
                  </div>
                  <Switch
                    id="rtl-support"
                    checked={settings.rtl_support}
                    onCheckedChange={(checked) => updateSettings({ rtl_support: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-lg">{tr("حفظ إعدادات المظهر")}</h4>
              <p className="text-sm text-muted-foreground">{tr("احفظ جميع التخصيصات لتطبيقها على النظام بالكامل")}</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white me-2"></div>
                  {tr("جاري الحفظ...")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 me-2" />
                  {tr("حفظ الإعدادات")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
