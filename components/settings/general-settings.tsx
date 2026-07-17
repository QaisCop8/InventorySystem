"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
  Globe,
  MessageCircle,
  Mail,
  Shield,
  Settings,
  Save,
  RotateCcw,
  TestTube,
  FolderOpen,
  Download,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react"

const systemLabels = [
  { id: "customer", defaultLabel: "عميل", currentLabel: "عميل", module: "العملاء" },
  { id: "supplier", defaultLabel: "مورد", currentLabel: "مورد", module: "الموردين" },
  { id: "product", defaultLabel: "صنف", currentLabel: "منتج", module: "الأصناف" },
  { id: "order", defaultLabel: "طلبية", currentLabel: "أمر شراء", module: "الطلبيات" },
  { id: "invoice", defaultLabel: "فاتورة", currentLabel: "فاتورة", module: "الفواتير" },
]

export default function GeneralSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState({
    selectedCountry: "PS",
    labels: systemLabels,
    whatsappEnabled: false,
    emailEnabled: true,
    autoBackupEnabled: true,
    compressBackups: false,
    emailBackupReport: true,
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    companyWebsite: "",
    defaultLanguage: "ar",
    defaultCurrency: "SAR",
    timezone: "Asia/Riyadh",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24",
    decimalPlaces: 2,
    enableNotifications: true,
    enableEmailAlerts: true,
    backupFrequency: "daily",
    maxLoginAttempts: 5,
    sessionTimeout: 30,
    enableAuditLog: true,
  })

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/general")
      if (response.ok) {
        const settings = await response.json()
        const settingsObj = settings.reduce((acc: any, setting: any) => {
          acc[setting.setting_key] = setting.setting_value
          return acc
        }, {})

        setState((prev) => ({
          ...prev,
          ...settingsObj,
        }))
      }
    } catch (error) {
      console.error("Error loading settings:", error)
      toast({
        title: "خطأ",
        description: "فشل في تحميل الإعدادات",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const saveSettings = useCallback(
    async (category: string, data: any) => {
      try {
        setLoading(true)

        for (const [key, value] of Object.entries(data)) {
          await fetch("/api/settings/general", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              setting_key: key,
              setting_value: value,
              setting_type: typeof value,
              category: category,
              description: `${category} setting: ${key}`,
              is_public: false,
            }),
          })
        }

        toast({
          title: "تم الحفظ",
          description: "تم حفظ الإعدادات بنجاح",
        })
      } catch (error) {
        console.error("Error saving settings:", error)
        toast({
          title: "خطأ",
          description: "فشل في حفظ الإعدادات",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateLabel = useCallback((id: string, newLabel: string) => {
    setState((prev) => ({
      ...prev,
      labels: prev.labels.map((label) => (label.id === id ? { ...label, currentLabel: newLabel } : label)),
    }))
  }, [])

  const resetLabels = useCallback(() => {
    setState((prev) => ({ ...prev, labels: systemLabels }))
  }, [])

  const handleToggle = useCallback((key: string, value: boolean) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleRegionalSave = useCallback(async () => {
    const regionalData = {
      selectedCountry: state.selectedCountry,
      defaultLanguage: state.defaultLanguage,
      defaultCurrency: state.defaultCurrency,
      timezone: state.timezone,
      dateFormat: state.dateFormat,
      timeFormat: state.timeFormat,
      decimalPlaces: state.decimalPlaces,
    }
    await saveSettings("regional", regionalData)
  }, [state, saveSettings])

  const handleCompanyInfoSave = useCallback(async () => {
    const companyData = {
      companyName: state.companyName,
      companyAddress: state.companyAddress,
      companyPhone: state.companyPhone,
      companyEmail: state.companyEmail,
      companyWebsite: state.companyWebsite,
    }
    await saveSettings("company", companyData)
  }, [state, saveSettings])

  const countrySettings = useMemo(
    () => ({
      PS: { code: "+970", currency: "ILS - شيكل إسرائيلي", flag: "🇵🇸" },
      JO: { code: "+962", currency: "JOD - دينار أردني", flag: "🇯🇴" },
      EG: { code: "+20", currency: "EGP - جنيه مصري", flag: "🇪🇬" },
      SA: { code: "+966", currency: "SAR - ريال سعودي", flag: "🇸🇦" },
      AE: { code: "+971", currency: "AED - درهم إماراتي", flag: "🇦🇪" },
      LB: { code: "+961", currency: "LBP - ليرة لبنانية", flag: "🇱🇧" },
      SY: { code: "+963", currency: "SYP - ليرة سورية", flag: "🇸🇾" },
      IQ: { code: "+964", currency: "IQD - دينار عراقي", flag: "🇮🇶" },
      KW: { code: "+965", currency: "KWD - دينار كويتي", flag: "🇰🇼" },
      QA: { code: "+974", currency: "QAR - ريال قطري", flag: "🇶🇦" },
      BH: { code: "+973", currency: "BHD - دينار بحريني", flag: "🇧🇭" },
      OM: { code: "+968", currency: "OMR - ريال عماني", flag: "🇴🇲" },
      YE: { code: "+967", currency: "YER - ريال يمني", flag: "🇾🇪" },
      MA: { code: "+212", currency: "MAD - درهم مغربي", flag: "🇲🇦" },
      TN: { code: "+216", currency: "TND - دينار تونسي", flag: "🇹🇳" },
      DZ: { code: "+213", currency: "DZD - دينار جزائري", flag: "🇩🇿" },
      LY: { code: "+218", currency: "LYD - دينار ليبي", flag: "🇱🇾" },
      SD: { code: "+249", currency: "SDG - جنيه سوداني", flag: "🇸🇩" },
    }),
    [],
  )

  const currentCountrySettings = countrySettings[state.selectedCountry as keyof typeof countrySettings]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">الإعدادات العامة</h1>
            <p className="text-gray-600">إدارة الإعدادات الأساسية للنظام</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="regional" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-100">
          <TabsTrigger
            value="regional"
            className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            <Globe className="h-4 w-4" />
            الإعدادات الإقليمية
          </TabsTrigger>
          <TabsTrigger
            value="communications"
            className="flex items-center gap-2 data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            <MessageCircle className="h-4 w-4" />
            الاتصالات
          </TabsTrigger>
          <TabsTrigger
            value="backup"
            className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            <Shield className="h-4 w-4" />
            النسخ الاحتياطي
          </TabsTrigger>
          <TabsTrigger
            value="labels"
            className="flex items-center gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white"
          >
            <Settings className="h-4 w-4" />
            تخصيص المسميات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regional">
          <Card className="erp-card shadow-sm" dir="rtl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
              <CardTitle className="flex items-center text-blue-800 text-right">
                <Globe className="h-5 w-5 mr-2" />
                الإعدادات الإقليمية
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form className="space-y-6" dir="rtl">
                <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                  <h3 className="font-semibold text-blue-800 text-right">معلومات الشركة</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium text-right">اسم الشركة</Label>
                      <Input
                        value={state.companyName}
                        onChange={(e) => setState((prev) => ({ ...prev, companyName: e.target.value }))}
                        placeholder="نظام أساس للحلول المحاسبية"
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium text-right">البريد الإلكتروني</Label>
                      <Input
                        type="email"
                        value={state.companyEmail}
                        onChange={(e) => setState((prev) => ({ ...prev, companyEmail: e.target.value }))}
                        placeholder="info@company.com"
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium text-right">رقم الهاتف</Label>
                      <Input
                        value={state.companyPhone}
                        onChange={(e) => setState((prev) => ({ ...prev, companyPhone: e.target.value }))}
                        placeholder="+970599123456"
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium text-right">الموقع الإلكتروني</Label>
                      <Input
                        value={state.companyWebsite}
                        onChange={(e) => setState((prev) => ({ ...prev, companyWebsite: e.target.value }))}
                        placeholder="www.company.com"
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium text-right">عنوان الشركة</Label>
                    <Textarea
                      value={state.companyAddress}
                      onChange={(e) => setState((prev) => ({ ...prev, companyAddress: e.target.value }))}
                      placeholder="العنوان الكامل للشركة"
                      className="text-right"
                      dir="rtl"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">الدولة</Label>
                    <Select
                      value={state.selectedCountry}
                      onValueChange={(value) => setState((prev) => ({ ...prev, selectedCountry: value }))}
                    >
                      <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(countrySettings).map(([code, settings]) => (
                          <SelectItem key={code} value={code} className="flex items-center">
                            <span className="flex items-center gap-2">
                              <span>{settings.flag}</span>
                              <span>
                                {code === "PS"
                                  ? "فلسطين"
                                  : code === "JO"
                                    ? "الأردن"
                                    : code === "EG"
                                      ? "مصر"
                                      : code === "SA"
                                        ? "السعودية"
                                        : code === "AE"
                                          ? "الإمارات"
                                          : code === "LB"
                                            ? "لبنان"
                                            : code === "SY"
                                              ? "سوريا"
                                              : code === "IQ"
                                                ? "العراق"
                                                : code === "KW"
                                                  ? "الكويت"
                                                  : code === "QA"
                                                    ? "قطر"
                                                    : code === "BH"
                                                      ? "البحرين"
                                                      : code === "OM"
                                                        ? "عمان"
                                                        : code === "YE"
                                                          ? "اليمن"
                                                          : code === "MA"
                                                            ? "المغرب"
                                                            : code === "TN"
                                                              ? "تونس"
                                                              : code === "DZ"
                                                                ? "الجزائر"
                                                                : code === "LY"
                                                                  ? "ليبيا"
                                                                  : "السودان"}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">رمز الهاتف الدولي</Label>
                    <Input
                      value={currentCountrySettings?.code || "+970"}
                      readOnly
                      className="bg-gray-50 font-mono text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">العملة الافتراضية</Label>
                    <Input
                      value={currentCountrySettings?.currency || "ILS - شيكل إسرائيلي"}
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">معاينة الإعدادات</span>
                  </div>
                  <div className="text-sm text-blue-700">
                    <p>
                      الدولة المختارة: {currentCountrySettings?.flag} {state.selectedCountry}
                    </p>
                    <p>رمز الهاتف: {currentCountrySettings?.code}</p>
                    <p>العملة: {currentCountrySettings?.currency}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleRegionalSave}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    حفظ الإعدادات الإقليمية
                  </Button>
                  <Button
                    onClick={handleCompanyInfoSave}
                    disabled={loading}
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent"
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    حفظ معلومات الشركة
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications">
          <div className="space-y-6">
            <Card className="erp-card shadow-sm">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg">
                <CardTitle className="flex items-center text-green-800">
                  <MessageCircle className="h-5 w-5 ml-2" />
                  إعدادات الواتس آب
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <MessageCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <Label className="font-medium">تفعيل إرسال الرسائل عبر الواتس آب</Label>
                        <p className="text-sm text-gray-600">إرسال تنبيهات الطلبيات والفواتير</p>
                      </div>
                    </div>
                    <Switch
                      checked={state.whatsappEnabled}
                      onCheckedChange={(checked) => handleToggle("whatsappEnabled", checked)}
                    />
                  </div>

                  {state.whatsappEnabled && (
                    <div className="space-y-4 p-4 border border-green-200 rounded-lg bg-green-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">رقم الواتس آب للإرسال</Label>
                          <Input
                            type="tel"
                            placeholder="مثال: +970599123456"
                            className="focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">API Token</Label>
                          <Input
                            type="password"
                            placeholder="أدخل رمز API للواتس آب"
                            className="focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">قالب رسالة الطلبية</Label>
                        <Textarea
                          rows={3}
                          placeholder="مرحباً {اسم_العميل}، تم إنشاء طلبيتك رقم {رقم_الطلبية} بنجاح. إجمالي المبلغ: {المبلغ}"
                          className="focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <Save className="h-4 w-4 ml-2" />
                      حفظ إعدادات الواتس آب
                    </Button>
                    {state.whatsappEnabled && (
                      <Button
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent"
                      >
                        <TestTube className="h-4 w-4 ml-2" />
                        اختبار الإعدادات
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="erp-card shadow-sm">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-t-lg">
                <CardTitle className="flex items-center text-blue-800">
                  <Mail className="h-5 w-5 ml-2" />
                  إعدادات الإيميل
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <Mail className="h-5 w-5 text-blue-600" />
                      <div>
                        <Label className="font-medium">تفعيل إرسال الإيميلات</Label>
                        <p className="text-sm text-gray-600">إرسال الفواتير والتقارير بالإيميل</p>
                      </div>
                    </div>
                    <Switch
                      checked={state.emailEnabled}
                      onCheckedChange={(checked) => handleToggle("emailEnabled", checked)}
                    />
                  </div>

                  {state.emailEnabled && (
                    <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">خادم SMTP</Label>
                          <Input placeholder="مثال: smtp.gmail.com" className="focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">المنفذ (Port)</Label>
                          <Select>
                            <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                              <SelectValue placeholder="اختر المنفذ" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="587">587 (TLS) - موصى به</SelectItem>
                              <SelectItem value="465">465 (SSL)</SelectItem>
                              <SelectItem value="25">25 (غير آمن)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">إيميل المرسل</Label>
                          <Input
                            type="email"
                            placeholder="company@example.com"
                            className="focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">كلمة مرور الإيميل</Label>
                          <Input
                            type="password"
                            placeholder="كلمة مرور الإيميل"
                            className="focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-700 font-medium">اسم المرسل</Label>
                          <Input placeholder="اسم الشركة" className="focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">قالب إيميل الفاتورة</Label>
                        <Textarea
                          rows={4}
                          placeholder="عزيزي {اسم_العميل}، نرفق لك فاتورتك رقم {رقم_الفاتورة}. مع تحيات فريق العمل."
                          className="focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Save className="h-4 w-4 ml-2" />
                      حفظ إعدادات الإيميل
                    </Button>
                    {state.emailEnabled && (
                      <Button
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent"
                      >
                        <TestTube className="h-4 w-4 ml-2" />
                        اختبار الإعدادات
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="backup">
          <Card className="erp-card shadow-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-lg">
              <CardTitle className="flex items-center text-purple-800">
                <Shield className="h-5 w-5 ml-2" />
                إعدادات النسخ الاحتياطي
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <Shield className="h-5 w-5 text-purple-600" />
                    <div>
                      <Label className="font-medium">تفعيل النسخ الاحتياطي التلقائي</Label>
                      <p className="text-sm text-gray-600">حماية البيانات بنسخ احتياطية منتظمة</p>
                    </div>
                  </div>
                  <Switch
                    checked={state.autoBackupEnabled}
                    onCheckedChange={(checked) => handleToggle("autoBackupEnabled", checked)}
                  />
                </div>

                {state.autoBackupEnabled && (
                  <div className="space-y-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">تكرار النسخ الاحتياطي</Label>
                        <Select>
                          <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
                            <SelectValue placeholder="اختر التكرار" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="6hours">كل 6 ساعات - موصى به</SelectItem>
                            <SelectItem value="12hours">كل 12 ساعة</SelectItem>
                            <SelectItem value="daily">يومي</SelectItem>
                            <SelectItem value="weekly">أسبوعي</SelectItem>
                            <SelectItem value="monthly">شهري</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">وقت النسخ الاحتياطي</Label>
                        <Input
                          type="time"
                          defaultValue="02:00"
                          className="focus:ring-2 focus:ring-purple-500 font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">عدد النسخ المحفوظة</Label>
                        <Select>
                          <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
                            <SelectValue placeholder="اختر العدد" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 نسخ - موصى به</SelectItem>
                            <SelectItem value="5">5 نسخ</SelectItem>
                            <SelectItem value="15">15 نسخ</SelectItem>
                            <SelectItem value="30">30 نسخ</SelectItem>
                            <SelectItem value="unlimited">بلا حدود</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">مجلد حفظ النسخ</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="C:\Backups\"
                          readOnly
                          className="bg-gray-100 font-mono"
                          value="C:\ERP_Backups\"
                        />
                        <Button type="button" variant="outline" className="hover:bg-purple-50 bg-transparent">
                          <FolderOpen className="h-4 w-4 ml-2" />
                          تغيير المجلد
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <Download className="h-4 w-4 text-gray-600" />
                          <Label>ضغط النسخ الاحتياطية</Label>
                        </div>
                        <Switch
                          checked={state.compressBackups}
                          onCheckedChange={(checked) => handleToggle("compressBackups", checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <Mail className="h-4 w-4 text-gray-600" />
                          <Label>إرسال تقرير النسخ بالإيميل</Label>
                        </div>
                        <Switch
                          checked={state.emailBackupReport}
                          onCheckedChange={(checked) => handleToggle("emailBackupReport", checked)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Save className="h-4 w-4 ml-2" />
                    حفظ إعدادات النسخ الاحتياطي
                  </Button>
                  <Button
                    variant="outline"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50 bg-transparent"
                  >
                    <Download className="h-4 w-4 ml-2" />
                    إنشاء نسخة احتياطية الآن
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labels">
          <Card className="erp-card shadow-sm">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 rounded-t-lg">
              <CardTitle className="flex items-center text-orange-800">
                <Settings className="h-5 w-5 ml-2" />
                تخصيص مسميات النظام
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-gray-600">قم بتخصيص مسميات النظام لتناسب احتياجات عملك</p>
                  <Button variant="outline" onClick={resetLabels} className="hover:bg-gray-50 bg-transparent">
                    <RotateCcw className="h-4 w-4 ml-2" />
                    استعادة الافتراضي
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right p-4 font-semibold text-gray-700 border-b">الوحدة</th>
                        <th className="text-right p-4 font-semibold text-gray-700 border-b">المسمى الافتراضي</th>
                        <th className="text-right p-4 font-semibold text-gray-700 border-b">المسمى الحالي</th>
                        <th className="text-center p-4 font-semibold text-gray-700 border-b">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.labels.map((label, index) => (
                        <tr key={label.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 border-b">
                            <span className="font-medium text-gray-800">{label.module}</span>
                          </td>
                          <td className="p-4 text-gray-600 border-b">
                            <span className="px-2 py-1 bg-gray-100 rounded text-sm">{label.defaultLabel}</span>
                          </td>
                          <td className="p-4 border-b">
                            <Input
                              value={label.currentLabel}
                              onChange={(e) => updateLabel(label.id, e.target.value)}
                              className="max-w-xs focus:ring-2 focus:ring-orange-500"
                            />
                          </td>
                          <td className="p-4 text-center border-b">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateLabel(label.id, label.defaultLabel)}
                              className="hover:bg-orange-50 hover:text-orange-700"
                            >
                              <RotateCcw className="h-3 w-3 ml-1" />
                              استعادة
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <span className="font-medium text-orange-800">ملاحظة مهمة</span>
                  </div>
                  <p className="text-sm text-orange-700">
                    تغيير المسميات سيؤثر على جميع أجزاء النظام. تأكد من اختيار مسميات واضحة ومفهومة لفريق العمل.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                    <Save className="h-4 w-4 ml-2" />
                    حفظ المسميات
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}



