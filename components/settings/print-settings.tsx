"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { FileText, Save, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/* ======================================================
   Types
====================================================== */
interface PrintSectionSettings {
  voucher_id?: number
  paper_size: string
  orientation: string
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  font_family: string
  font_size: number
  show_header: boolean
  show_footer: boolean
  header_text: string
  footer_text: string
  template: string
  custom_width?: number
  custom_height?: number
}

interface PrintSettings {
  [x: string]: any
  default_printer: string
  print_copies: number
  auto_print: boolean
  vouchers: Record<number, PrintSectionSettings> // keyed by voucher_id
  reports: PrintSectionSettings
}

/* ======================================================
   Defaults
====================================================== */
const defaultSection: PrintSectionSettings = {
  voucher_id: 1,
  paper_size: "A4",
  orientation: "portrait",
  margin_top: 20,
  margin_bottom: 20,
  margin_left: 20,
  margin_right: 20,
  font_family: "Arial",
  font_size: 12,
  show_header: true,
  show_footer: true,
  header_text: "",
  footer_text: "",
  template: "standard",
}

/* ======================================================
   Component
====================================================== */
export default function PrintSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<"vouchers" | "reports">("vouchers")
  const [settings, setSettings] = useState<PrintSettings>({
    default_printer: "",
    print_copies: 1,
    auto_print: false,
    vouchers: {},
    reports: { ...defaultSection, voucher_id: 0 },
  })
  const [currentVoucherId, setCurrentVoucherId] = useState<number>(1)

  /* ======================================================
     API Calls
  ====================================================== */
  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/settings/print")
      if (!res.ok) throw new Error()
      const data: PrintSectionSettings[] = await res.json()
      console.log("Fetched data:", data)

      // get the first voucher with voucher_id = 1
      const selectedVoucher = data.find((v) => v.voucher_id === 1) ?? { ...defaultSection, voucher_id: 1 }

      const selectedVoucherReports = data.find((v) => v.voucher_id === 0) ?? { ...defaultSection, voucher_id: 0 }

      setSettings({
        default_printer: "",   // or from API if exists
        print_copies: 1,       // or from API
        auto_print: false,     // or from API
        vouchers: {
          [selectedVoucher.voucher_id!]: selectedVoucher 
        },
        reports: selectedVoucherReports ,
      })

      setCurrentVoucherId(1)
    } catch {
      toast({
        title: "خطأ",
        description: "فشل تحميل إعدادات الطباعة",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      const voucherId = activeTab === "reports" ? 0 : currentVoucherId

      const currentData = settings.vouchers[voucherId] ?? { ...defaultSection, voucher_id: voucherId }

      const res = await fetch("/api/settings/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucher_id: voucherId, ...currentData }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      setSettings((prev) => ({
        ...prev,
        vouchers: { ...prev.vouchers, [voucherId]: data },
      }))

      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات الطباعة بنجاح",
      })
    } catch {
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الأصناف...</p>
        </div>
      </div>
    )
  }

  const marginKeys: (keyof Pick<PrintSectionSettings, 'margin_top' | 'margin_bottom' | 'margin_left' | 'margin_right'>)[] = [
    'margin_top',
    'margin_bottom',
    'margin_right',
    'margin_left'
  ]

  /* ======================================================
     Section Component
  ====================================================== */
  const SectionSettings = ({
    title,
    data,
    onChange,
  }: {
    title: string
    data: PrintSectionSettings
    onChange: (v: PrintSectionSettings) => void
  }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          {title === "إعدادات طباعة السندات" && (
            <div>
              <Label>نوع السند</Label>
              <Select value={String(currentVoucherId)} onValueChange={(v) => setCurrentVoucherId(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">طلبية مشتريات</SelectItem>
                  <SelectItem value="2">طلبية مبيعات</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>حجم الورق</Label>
            <Select value={data.paper_size} onValueChange={(v) => onChange({ ...data, paper_size: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="Custom">مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data.paper_size === "Custom" && (
            <>
              <div>
                <Label>الطول (مم)</Label>
                <Input type="number" value={data.custom_height || ""} onChange={(e) => onChange({ ...data, custom_height: Number(e.target.value) })} />
              </div>
              <div>
                <Label>العرض (مم)</Label>
                <Input type="number" value={data.custom_width || ""} onChange={(e) => onChange({ ...data, custom_width: Number(e.target.value) })} />
              </div>
            </>
          )}

          <div>
            <Label>اتجاه الطباعة</Label>
            <Select value={data.orientation} onValueChange={(v) => onChange({ ...data, orientation: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">عمودي</SelectItem>
                <SelectItem value="landscape">أفقي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {marginKeys.map((key) => (
            <div key={key}>
              <Label>الهامش {key.split("_")[1]}</Label>
              <Input type="number" value={data[key]} onChange={(e) => onChange({ ...data, [key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label>إظهار الترويسة</Label>
            <Switch checked={data.show_header} onCheckedChange={(v) => onChange({ ...data, show_header: v })} />
          </div>
          <Textarea placeholder="نص الترويسة" value={data.header_text} onChange={(e) => onChange({ ...data, header_text: e.target.value })} />

          <div className="flex justify-between">
            <Label>إظهار التذييل</Label>
            <Switch checked={data.show_footer} onCheckedChange={(v) => onChange({ ...data, show_footer: v })} />
          </div>
          <Textarea placeholder="نص التذييل" value={data.footer_text} onChange={(e) => onChange({ ...data, footer_text: e.target.value })} />
        </div>
      </CardContent>
    </Card>
  )

  const currentVoucherSettings = settings.vouchers[currentVoucherId] ?? { ...defaultSection, voucher_id: currentVoucherId }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">إعدادات الطباعة</h1>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="animate-spin ml-2" /> : <Save className="ml-2" />}
          حفظ
        </Button>
      </div>

      <Tabs defaultValue="vouchers" value={activeTab} onValueChange={(v) => setActiveTab(v as "vouchers" | "reports")}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="vouchers">السندات</TabsTrigger>
          <TabsTrigger value="reports">التقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="vouchers">
          <SectionSettings
            title="إعدادات طباعة السندات"
            data={currentVoucherSettings}
            onChange={(v) =>
              setSettings((prev) => ({
                ...prev,
                vouchers: { ...prev.vouchers, [currentVoucherId]: v },
              }))
            }
          />
        </TabsContent>

        <TabsContent value="reports">
          <SectionSettings
            title="إعدادات طباعة التقارير"
            data={settings.reports}
            onChange={(v) => setSettings((prev) => ({ ...prev, reports: v }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
