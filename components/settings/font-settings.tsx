"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Type, Palette, RotateCcw } from "@/components/ui/icons"
import { useAuth } from "@/components/auth/auth-context"

// Font Settings Context
interface FontSettings {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
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
}

const FontContext = createContext<FontContextType | undefined>(undefined)

export const FontProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<FontSettings>(defaultSettings)

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return

    const savedSettings = localStorage.getItem("erp-font-settings")
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings({ ...defaultSettings, ...parsed })
      } catch (error) {
        console.error("Error loading font settings:", error)
      }
    }
  }, [])

  // Apply settings to CSS variables
  const applySettings = () => {
    if (typeof document === "undefined") return

    const root = document.documentElement
    root.style.setProperty("--font-family-custom", settings.fontFamily)
    root.style.setProperty("--font-size-custom", `${settings.fontSize}px`)
    root.style.setProperty("--font-weight-custom", settings.fontWeight)
    root.style.setProperty("--line-height-custom", settings.lineHeight.toString())
    root.style.setProperty("--letter-spacing-custom", `${settings.letterSpacing}px`)

    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("erp-font-settings", JSON.stringify(settings))
    }
  }

  const updateSettings = (newSettings: Partial<FontSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
    if (typeof window !== "undefined") {
      localStorage.removeItem("erp-font-settings")
    }
  }

  // Apply settings whenever they change
  useEffect(() => {
    applySettings()
  }, [settings])

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
  const { user } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/settings/user?user_id=${encodeURIComponent(user.id)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return
        updateSettings({
          fontFamily: data.font_family || defaultSettings.fontFamily,
          fontSize: Number(data.font_size || defaultSettings.fontSize),
        })
      })
      .catch((error) => console.error("Failed to load user font settings", error))
  }, [user?.id])

  const saveUserFontSettings = async () => {
    if (!user?.id) return
    setIsSaving(true)
    setSaveMessage("")
    try {
      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, font_family: settings.fontFamily, font_size: settings.fontSize }),
      })
      if (!response.ok) throw new Error("Failed to save font settings")
      setSaveMessage("تم حفظ إعدادات الخط للمستخدم")
    } catch (error) {
      console.error(error)
      setSaveMessage("تعذر حفظ إعدادات الخط")
    } finally {
      setIsSaving(false)
    }
  }

  const fontFamilies = [
    { value: "Cairo", label: "Cairo (عربي)" },
    { value: "Inter", label: "Inter (إنجليزي)" },
    { value: "Tajawal", label: "Tajawal (عربي)" },
    { value: "Amiri", label: "Amiri (عربي)" },
    { value: "Noto Sans Arabic", label: "Noto Sans Arabic" },
    { value: "system-ui", label: "خط النظام" },
  ]

  const fontWeights = [
    { value: "200", label: "رفيع جداً" },
    { value: "300", label: "رفيع" },
    { value: "400", label: "عادي" },
    { value: "500", label: "متوسط" },
    { value: "600", label: "سميك" },
    { value: "700", label: "سميك جداً" },
    { value: "800", label: "سميك للغاية" },
    { value: "900", label: "أسود" },
  ]

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Type className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-right">إعدادات الخطوط</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Font Family Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-right flex items-center gap-2">
              <Type className="h-5 w-5" />
              نوع الخط
            </CardTitle>
            <CardDescription className="text-right">اختر نوع الخط المناسب للنظام</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-right block">عائلة الخط</Label>
              <Select value={settings.fontFamily} onValueChange={(value) => updateSettings({ fontFamily: value })}>
                <SelectTrigger className="text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontFamilies.map((font) => (
                    <SelectItem key={font.value} value={font.value} className="text-right">
                      <span style={{ fontFamily: font.value }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-right block">وزن الخط</Label>
              <Select value={settings.fontWeight} onValueChange={(value) => updateSettings({ fontWeight: value })}>
                <SelectTrigger className="text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontWeights.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value} className="text-right">
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
            <CardTitle className="text-right flex items-center gap-2">
              <Palette className="h-5 w-5" />
              حجم الخط والمسافات
            </CardTitle>
            <CardDescription className="text-right">تحكم في حجم الخط والمسافات بين الأحرف والأسطر</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{settings.fontSize}px</span>
                <Label className="text-right">حجم الخط</Label>
              </div>
              <Slider
                value={[settings.fontSize]}
                onValueChange={([value]) => updateSettings({ fontSize: value })}
                min={10}
                max={24}
                step={1}
                className="w-full"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{settings.lineHeight}</span>
                <Label className="text-right">ارتفاع السطر</Label>
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
                <Label className="text-right">المسافة بين الأحرف</Label>
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

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-right">معاينة الخط</CardTitle>
          <CardDescription className="text-right">شاهد كيف ستبدو النصوص بالإعدادات الحالية</CardDescription>
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
            <h3 className="text-xl font-bold text-right">عنوان رئيسي</h3>
            <h4 className="text-lg font-semibold text-right">عنوان فرعي</h4>
            <p className="text-right">
              هذا نص تجريبي لمعاينة الخط المحدد. يمكنك رؤية كيف ستبدو النصوص في النظام بالإعدادات الحالية. النص العربي
              يحتاج إلى خطوط مناسبة لضمان الوضوح والقراءة السهلة.
            </p>
            <div className="flex gap-4 text-sm text-right">
              <span className="font-bold">نص سميك</span>
              <span className="font-normal">نص عادي</span>
              <span className="font-light">نص رفيع</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-end">
        <Button variant="outline" onClick={resetSettings} className="flex items-center gap-2 bg-transparent">
          <RotateCcw className="h-4 w-4" />
          إعادة تعيين
        </Button>
        <Button className="flex items-center gap-2" onClick={saveUserFontSettings} disabled={isSaving || !user?.id}>
          <Type className="h-4 w-4" />
          حفظ الإعدادات
        </Button>
      </div>
      {saveMessage && <p className="text-right text-sm text-muted-foreground">{saveMessage}</p>}
    </div>
  )
}

export default FontSettings
