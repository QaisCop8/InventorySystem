"use client"

import { tr } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save, DollarSign, Calendar, Settings2 } from "lucide-react"

interface FinancialSetting {
  setting_key: string
  setting_value: string
  setting_type: string
  description: string
}

export function FinancialSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings/financial")
      if (response.ok) {
        const data = await response.json()
        const settingsMap: Record<string, string> = {}
        data.forEach((setting: FinancialSetting) => {
          settingsMap[setting.setting_key] = setting.setting_value
        })
        setSettings(settingsMap)
      }
    } catch (error) {
      console.error("Error loading financial settings:", error)
      toast({
        title: tr("خطأ"),
        description: tr("فشل تحميل الإعدادات المالية"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/settings/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        toast({
          title: tr("تم الحفظ"),
          description: tr("تم حفظ الإعدادات المالية بنجاح"),
        })
      } else {
        throw new Error("Failed to save settings")
      }
    } catch (error) {
      console.error("Error saving financial settings:", error)
      toast({
        title: tr("خطأ"),
        description: tr("فشل حفظ الإعدادات المالية"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{tr("الإعدادات المالية")}</h2>
          <p className="text-sm text-muted-foreground">
            {tr("إعدادات النظام المالي والمحاسبي (تحضير للنظام المالي المستقبلي)")}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {tr("جاري الحفظ...")}
            </>
          ) : (
            <>
              <Save className="me-2 h-4 w-4" />
              {tr("حفظ التغييرات")}
            </>
          )}
        </Button>
      </div>

      {/* العملة والضريبة */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {tr("العملة والضريبة")}
          </CardTitle>
          <CardDescription>{tr("إعدادات العملة الأساسية ونسبة الضريبة")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="base_currency">{tr("العملة الأساسية")}</Label>
              <Select
                value={settings.base_currency || "SAR"}
                onValueChange={(value) => updateSetting("base_currency", value)}
              >
                <SelectTrigger id="base_currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR">{tr("ريال سعودي (SAR)")}</SelectItem>
                  <SelectItem value="USD">{tr("دولار أمريكي (USD)")}</SelectItem>
                  <SelectItem value="EUR">{tr("يورو (EUR)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_rate">{tr("نسبة الضريبة (%)")}</Label>
              <Input
                id="tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.tax_rate || "15"}
                onChange={(e) => updateSetting("tax_rate", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>{tr("دعم العملات المتعددة")}</Label>
              <p className="text-sm text-muted-foreground">{tr("تفعيل التعامل بعملات متعددة (ميزة مستقبلية)")}</p>
            </div>
            <Switch
              checked={settings.enable_multi_currency === "true"}
              onCheckedChange={(checked) => updateSetting("enable_multi_currency", checked.toString())}
            />
          </div>
        </CardContent>
      </Card>

      {/* السنة المالية */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {tr("السنة المالية")}
          </CardTitle>
          <CardDescription>{tr("إعدادات الفترات المالية والسنة المالية")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="financial_year_start_month">{tr("شهر بداية السنة المالية")}</Label>
            <Select
              value={settings.financial_year_start_month || "1"}
              onValueChange={(value) => updateSetting("financial_year_start_month", value)}
            >
              <SelectTrigger id="financial_year_start_month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{tr("يناير")}</SelectItem>
                <SelectItem value="2">{tr("فبراير")}</SelectItem>
                <SelectItem value="3">{tr("مارس")}</SelectItem>
                <SelectItem value="4">{tr("أبريل")}</SelectItem>
                <SelectItem value="5">{tr("مايو")}</SelectItem>
                <SelectItem value="6">{tr("يونيو")}</SelectItem>
                <SelectItem value="7">{tr("يوليو")}</SelectItem>
                <SelectItem value="8">{tr("أغسطس")}</SelectItem>
                <SelectItem value="9">{tr("سبتمبر")}</SelectItem>
                <SelectItem value="10">{tr("أكتوبر")}</SelectItem>
                <SelectItem value="11">{tr("نوفمبر")}</SelectItem>
                <SelectItem value="12">{tr("ديسمبر")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* إعدادات الفواتير */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {tr("إعدادات الفواتير")}
          </CardTitle>
          <CardDescription>{tr("إعدادات ترقيم الفواتير والمستندات المالية")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>{tr("توليد رقم الفاتورة تلقائياً")}</Label>
              <p className="text-sm text-muted-foreground">{tr("إنشاء رقم فاتورة تلقائي عند إنشاء فاتورة جديدة")}</p>
            </div>
            <Switch
              checked={settings.auto_generate_invoice_number === "true"}
              onCheckedChange={(checked) => updateSetting("auto_generate_invoice_number", checked.toString())}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice_number_prefix">{tr("بادئة رقم الفاتورة")}</Label>
            <Input
              id="invoice_number_prefix"
              value={settings.invoice_number_prefix || "INV"}
              onChange={(e) => updateSetting("invoice_number_prefix", e.target.value)}
              placeholder="INV"
            />
          </div>
        </CardContent>
      </Card>

      {/* مراكز التكلفة */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("مراكز التكلفة")}</CardTitle>
          <CardDescription>{tr("إعدادات مراكز التكلفة للتحليل المالي (ميزة متقدمة)")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>{tr("تفعيل مراكز التكلفة")}</Label>
              <p className="text-sm text-muted-foreground">{tr("تفعيل نظام مراكز التكلفة للتحليل المالي المتقدم")}</p>
            </div>
            <Switch
              checked={settings.enable_cost_centers === "true"}
              onCheckedChange={(checked) => updateSetting("enable_cost_centers", checked.toString())}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
