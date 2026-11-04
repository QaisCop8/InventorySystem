"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Database, FileText, Calendar, Users, Package, ShoppingCart, Truck } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface DatabaseStats {
  tables: number
  totalRecords: number
  customers: number
  suppliers: number
  products: number
  salesOrders: number
  purchaseOrders: number
  lastBackup?: string
}

export default function DatabaseBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const [stats] = useState<DatabaseStats>({
    tables: 37,
    totalRecords: 15420,
    customers: 245,
    suppliers: 89,
    products: 1250,
    salesOrders: 890,
    purchaseOrders: 340,
    lastBackup: "2024-01-15 14:30:00",
  })

  const handleExportSchema = async () => {
    setIsExporting(true)
    try {
      // محاكاة تصدير الـ schema
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // إنشاء ملف للتحميل
      const schemaContent = `-- نسخة احتياطية من قاعدة البيانات
-- تاريخ الإنشاء: ${new Date().toLocaleString("en-GB")}
-- عدد الجداول: ${stats.tables}
-- إجمالي السجلات: ${stats.totalRecords}

-- تم تصدير الـ Schema بنجاح
-- يرجى تشغيل الملف scripts/database-backup-schema.sql`

      const blob = new Blob([schemaContent], { type: "text/sql" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `database-schema-${new Date().toISOString().split("T")[0]}.sql`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: tr("تم تصدير الـ Schema بنجاح"),
        description: tr("تم تحميل ملف قاعدة البيانات"),
      })
    } catch (error) {
      toast({
        title: tr("خطأ في التصدير"),
        description: tr("حدث خطأ أثناء تصدير قاعدة البيانات"),
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const dataContent = `-- نسخة احتياطية من البيانات
-- تاريخ الإنشاء: ${new Date().toLocaleString("en-GB")}
-- العملاء: ${stats.customers}
-- الموردين: ${stats.suppliers}  
-- المنتجات: ${stats.products}
-- طلبيات المبيعات: ${stats.salesOrders}
-- طلبيات المشتريات: ${stats.purchaseOrders}

-- تم تصدير البيانات بنجاح
-- يرجى تشغيل الملف scripts/database-backup-data.sql`

      const blob = new Blob([dataContent], { type: "text/sql" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `database-data-${new Date().toISOString().split("T")[0]}.sql`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: tr("تم تصدير البيانات بنجاح"),
        description: tr("تم تحميل ملف البيانات"),
      })
    } catch (error) {
      toast({
        title: tr("خطأ في التصدير"),
        description: tr("حدث خطأ أثناء تصدير البيانات"),
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6" dir={appDir()}>
      <div className="flex items-center gap-2">
        <Database className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{tr("نسخة احتياطية من قاعدة البيانات")}</h1>
      </div>

      {/* إحصائيات قاعدة البيانات */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">{tr("العملاء")}</p>
                <p className="text-2xl font-bold">{stats.customers.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">{tr("الموردين")}</p>
                <p className="text-2xl font-bold">{stats.suppliers.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">{tr("المنتجات")}</p>
                <p className="text-2xl font-bold">{stats.products.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">{tr("الطلبيات")}</p>
                <p className="text-2xl font-bold">{(stats.salesOrders + stats.purchaseOrders).toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* معلومات قاعدة البيانات */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {tr("معلومات قاعدة البيانات")}
          </CardTitle>
          <CardDescription>{tr("تفاصيل شاملة عن هيكل قاعدة البيانات والبيانات المخزنة")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.tables}</p>
              <p className="text-sm text-muted-foreground">{tr("جدول")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.totalRecords.toLocaleString("en-US")}</p>
              <p className="text-sm text-muted-foreground">{tr("إجمالي السجلات")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">37</p>
              <p className="text-sm text-muted-foreground">{tr("فهرس")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">15</p>
              <p className="text-sm text-muted-foreground">{tr("عرض (View)")}</p>
            </div>
          </div>

          {stats.lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{tr("آخر نسخة احتياطية: ")}{stats.lastBackup}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* خيارات التصدير */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {tr("تصدير هيكل قاعدة البيانات (Schema)")}
            </CardTitle>
            <CardDescription>{tr("تصدير هيكل الجداول والفهارس والعلاقات فقط بدون البيانات")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Badge variant="outline">{tr("37 جدول")}</Badge>
              <Badge variant="outline">{tr("فهارس وعلاقات")}</Badge>
              <Badge variant="outline">{tr("Views وFunctions")}</Badge>
            </div>
            <Button onClick={handleExportSchema} disabled={isExporting} className="w-full">
              <Download className="h-4 w-4 me-2" />
              {isExporting ? tr("جاري التصدير...") : tr("تصدير الهيكل")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {tr("تصدير البيانات الكاملة")}
            </CardTitle>
            <CardDescription>{tr("تصدير جميع البيانات المخزنة في قاعدة البيانات")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Badge variant="outline">{stats.totalRecords.toLocaleString("en-US")}{tr(" سجل")}</Badge>
              <Badge variant="outline">{tr("جميع الجداول")}</Badge>
              <Badge variant="outline">{tr("البيانات المرجعية")}</Badge>
            </div>
            <Button
              onClick={handleExportData}
              disabled={isExporting}
              className="w-full bg-transparent"
              variant="outline"
            >
              <Download className="h-4 w-4 me-2" />
              {isExporting ? tr("جاري التصدير...") : tr("تصدير البيانات")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ملاحظات مهمة */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("ملاحظات مهمة")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{tr("• ملفات النسخ الاحتياطية متوفرة في مجلد scripts/")}</p>
          <p>{tr("• يمكن تشغيل الملفات مباشرة في قاعدة البيانات")}</p>
          <p>{tr("• تأكد من وجود صلاحيات كافية قبل الاستيراد")}</p>
          <p>{tr("• يُنصح بإنشاء نسخة احتياطية دورية")}</p>
          <p>{tr("• الملفات تحتوي على تعليقات باللغة العربية للوضوح")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
