"use client"

import { tr } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { Webhook } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const apiKeys = [
  {
    id: 1,
    name: "تطبيق الموبايل الرئيسي",
    key: "sk_live_4242...8fK9",
    type: "تطبيق موبايل",
    environment: "إنتاج",
    status: "نشط",
    lastUsed: "قبل 5 دقائق",
    createdAt: "2024/01/10",
  },
  {
    id: 2,
    name: "نظام المحاسبة",
    key: "sk_live_9876...3xY2",
    type: "نظام ERP خارجي",
    environment: "إنتاج",
    status: "نشط",
    lastUsed: "قبل ساعة",
    createdAt: "2024/01/05",
  },
  {
    id: 3,
    name: "بيئة التطوير",
    key: "sk_test_1234...5aB7",
    type: "تطبيق ويب",
    environment: "تطوير",
    status: "نشط",
    lastUsed: "قبل يومين",
    createdAt: "2023/12/20",
  },
]

const endpoints = [
  {
    method: "GET",
    path: "/customers",
    description: tr("الحصول على قائمة العملاء"),
    params: "page, limit, search, status",
    status: "متاح",
  },
  { method: "GET", path: "/customers/{id}", description: tr("الحصول على عميل محدد"), params: "id", status: "متاح" },
  {
    method: "POST",
    path: "/customers",
    description: tr("إضافة عميل جديد"),
    params: "body: customer object",
    status: "متاح",
  },
  {
    method: "PUT",
    path: "/customers/{id}",
    description: tr("تحديث بيانات عميل"),
    params: "id, body: customer object",
    status: "متاح",
  },
  { method: "DELETE", path: "/customers/{id}", description: tr("حذف عميل"), params: "id", status: "محدود" },
]

const webhooks = [
  {
    id: 1,
    name: "تحديث المخزون",
    url: "https://inventory.example.com/webhook",
    events: "product.updated, product.out_of_stock",
    status: "نشط",
    lastRun: "قبل 10 دقائق",
    successRate: "98.5%",
  },
  {
    id: 2,
    name: "تنبيهات الطلبيات",
    url: "https://notifications.example.com/orders",
    events: "order.created, order.completed",
    status: "نشط",
    lastRun: "قبل ساعة",
    successRate: "99.8%",
  },
]

export default function APISettings() {
  const [isKeyFormOpen, setIsKeyFormOpen] = useState(false)
  const [isWebhookFormOpen, setIsWebhookFormOpen] = useState(false)

  return (
    <div className="space-y-6">
<VoucherListHero title={tr("إعدادات API والتكامل")} icon={Webhook} category={tr("الإعدادات")} />

      {/* API Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{tr("المفاتيح النشطة")}</p>
                <p className="text-2xl font-bold">5</p>
                <p className="text-xs text-emerald-600">{tr("↑ 2 مفتاح جديد هذا الشهر")}</p>
              </div>
              <div className="text-2xl">🔑</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{tr("طلبات API اليوم")}</p>
                <p className="text-2xl font-bold">12,847</p>
                <p className="text-xs text-emerald-600">{tr("↑ معدل نجاح 99.8%")}</p>
              </div>
              <div className="text-2xl">📊</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{tr("التطبيقات المتصلة")}</p>
                <p className="text-2xl font-bold">8</p>
                <p className="text-xs text-gray-600">{tr("→ آخر اتصال: قبل 5 دقائق")}</p>
              </div>
              <div className="text-2xl">🔗</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{tr("استخدام النطاق الترددي")}</p>
                <p className="text-2xl font-bold">2.3 GB</p>
                <p className="text-xs text-gray-600">{tr("→ من 10 GB المتاحة")}</p>
              </div>
              <div className="text-2xl">📡</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="keys" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="keys">{tr("🔑 مفاتيح API")}</TabsTrigger>
          <TabsTrigger value="endpoints">{tr("📡 نقاط النهاية")}</TabsTrigger>
          <TabsTrigger value="webhooks">🔔 Webhooks</TabsTrigger>
          <TabsTrigger value="security">{tr("🛡️ الأمان")}</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{tr("مفاتيح API")}</CardTitle>
                <Dialog open={isKeyFormOpen} onOpenChange={setIsKeyFormOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">{tr("+ إنشاء مفتاح جديد")}</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{tr("إنشاء مفتاح API جديد")}</DialogTitle>
                    </DialogHeader>

                    <form className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{tr("اسم المفتاح *")}</Label>
                          <Input placeholder={tr("مثال: تطبيق الموبايل")} required />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("نوع التطبيق *")}</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder={tr("اختر النوع")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="web">{tr("تطبيق ويب")}</SelectItem>
                              <SelectItem value="mobile">{tr("تطبيق موبايل")}</SelectItem>
                              <SelectItem value="desktop">{tr("تطبيق سطح المكتب")}</SelectItem>
                              <SelectItem value="service">{tr("خدمة خارجية")}</SelectItem>
                              <SelectItem value="erp">{tr("نظام ERP خارجي")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("البيئة *")}</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder={tr("اختر البيئة")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="production">{tr("بيئة الإنتاج (Production)")}</SelectItem>
                              <SelectItem value="development">{tr("بيئة التطوير (Development)")}</SelectItem>
                              <SelectItem value="testing">{tr("بيئة الاختبار (Testing)")}</SelectItem>
                              <SelectItem value="staging">{tr("بيئة التدريب (Staging)")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("تاريخ الانتهاء")}</Label>
                          <Input type="date" />
                          <p className="text-xs text-gray-500">{tr("اتركه فارغاً للمفتاح الدائم")}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">{tr("صلاحيات API")}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("قراءة البيانات (GET)")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("إضافة البيانات (POST)")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">{tr("تحديث البيانات (PUT)")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">{tr("حذف البيانات (DELETE)")}</span>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">{tr("الوصول إلى الموارد")}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("العملاء")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("الموردين")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("الأصناف")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span className="text-sm">{tr("الطلبيات")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">{tr("التقارير")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">{tr("الإعدادات")}</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{tr("حد الطلبات لكل دقيقة")}</Label>
                          <Input type="number" defaultValue="60" min="1" max="1000" />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("حد الطلبات اليومي")}</Label>
                          <Input type="number" defaultValue="10000" min="1" max="1000000" />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsKeyFormOpen(false)}>
                          {tr("إلغاء")}
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                          {tr("إنشاء المفتاح")}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start p-3">{tr("اسم المفتاح")}</th>
                      <th className="text-start p-3">{tr("المفتاح")}</th>
                      <th className="text-start p-3">{tr("النوع")}</th>
                      <th className="text-start p-3">{tr("البيئة")}</th>
                      <th className="text-start p-3">{tr("الحالة")}</th>
                      <th className="text-start p-3">{tr("آخر استخدام")}</th>
                      <th className="text-start p-3">{tr("تاريخ الإنشاء")}</th>
                      <th className="text-start p-3">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{key.name}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <code className="bg-gray-100 px-2 py-1 rounded text-xs">{key.key}</code>
                            <Button variant="outline" size="sm">
                              📋
                            </Button>
                          </div>
                        </td>
                        <td className="p-3">{key.type}</td>
                        <td className="p-3">
                          <Badge
                            className={
                              key.environment === "إنتاج"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            }
                          >
                            {key.environment}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className="bg-emerald-100 text-emerald-800">{key.status}</Badge>
                        </td>
                        <td className="p-3 text-sm">{key.lastUsed}</td>
                        <td className="p-3 text-sm">{key.createdAt}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm">
                              {tr("إعدادات")}
                            </Button>
                            <Button variant="outline" size="sm" className="text-orange-600 bg-transparent">
                              {tr("تعليق")}
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 bg-transparent">
                              {tr("إلغاء")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{tr("نقاط النهاية المتاحة")}</CardTitle>
                <div className="flex gap-2">
                  <Select>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={tr("جميع الإصدارات")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("جميع الإصدارات")}</SelectItem>
                      <SelectItem value="v1">{tr("v1 (مستقر)")}</SelectItem>
                      <SelectItem value="v2">{tr("v2 (بيتا)")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline">{tr("🔄 تحديث")}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="flex items-center gap-2">
                  <strong>{tr("عنوان API الأساسي:")}</strong>
                  <code className="bg-white px-2 py-1 rounded">https://api.yourdomain.com/v1</code>
                  <Button variant="outline" size="sm">
                    📋
                  </Button>
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">{tr("🔷 إدارة العملاء")}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-start p-3">{tr("الطريقة")}</th>
                          <th className="text-start p-3">{tr("المسار")}</th>
                          <th className="text-start p-3">{tr("الوصف")}</th>
                          <th className="text-start p-3">{tr("المعاملات")}</th>
                          <th className="text-start p-3">{tr("الحالة")}</th>
                          <th className="text-start p-3">{tr("الإجراءات")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoints.map((endpoint, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <Badge
                                className={
                                  endpoint.method === "GET"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : endpoint.method === "POST"
                                      ? "bg-blue-100 text-blue-800"
                                      : endpoint.method === "PUT"
                                        ? "bg-orange-100 text-orange-800"
                                        : "bg-red-100 text-red-800"
                                }
                              >
                                {endpoint.method}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <code className="text-sm">{endpoint.path}</code>
                            </td>
                            <td className="p-3">{endpoint.description}</td>
                            <td className="p-3 text-sm">{endpoint.params}</td>
                            <td className="p-3">
                              <Badge
                                className={
                                  endpoint.status === "متاح"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-900"
                                }
                              >
                                {endpoint.status}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Button variant="outline" size="sm">
                                {tr("اختبار")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Webhooks</CardTitle>
                <Dialog open={isWebhookFormOpen} onOpenChange={setIsWebhookFormOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">{tr("+ إضافة Webhook")}</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{tr("إعداد Webhook جديد")}</DialogTitle>
                    </DialogHeader>

                    <form className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{tr("اسم Webhook *")}</Label>
                          <Input placeholder={tr("مثال: تحديث المخزون")} required />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("عنوان URL *")}</Label>
                          <Input type="url" placeholder="https://example.com/webhook" required />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("السر (Secret)")}</Label>
                          <Input placeholder={tr("سيتم توليده تلقائياً")} />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("رأس المصادقة")}</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder={tr("اختر نوع المصادقة")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="webhook-signature">X-Webhook-Signature</SelectItem>
                              <SelectItem value="bearer">Authorization Bearer</SelectItem>
                              <SelectItem value="custom">Custom Header</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">{tr("الأحداث المراقبة")}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">customer.created</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">customer.updated</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">order.created</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">order.completed</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">product.updated</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="rounded" />
                            <span className="text-sm">product.out_of_stock</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{tr("عدد المحاولات القصوى")}</Label>
                          <Input type="number" defaultValue="3" min="1" max="10" />
                        </div>
                        <div className="space-y-2">
                          <Label>{tr("مهلة الانتظار (ثانية)")}</Label>
                          <Input type="number" defaultValue="30" min="5" max="300" />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsWebhookFormOpen(false)}>
                          {tr("إلغاء")}
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                          {tr("إنشاء Webhook")}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start p-3">{tr("الاسم")}</th>
                      <th className="text-start p-3">URL</th>
                      <th className="text-start p-3">{tr("الأحداث")}</th>
                      <th className="text-start p-3">{tr("الحالة")}</th>
                      <th className="text-start p-3">{tr("آخر تشغيل")}</th>
                      <th className="text-start p-3">{tr("معدل النجاح")}</th>
                      <th className="text-start p-3">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhooks.map((webhook) => (
                      <tr key={webhook.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{webhook.name}</td>
                        <td className="p-3">
                          <code className="text-xs">{webhook.url}</code>
                        </td>
                        <td className="p-3 text-sm">{webhook.events}</td>
                        <td className="p-3">
                          <Badge className="bg-emerald-100 text-emerald-800">{webhook.status}</Badge>
                        </td>
                        <td className="p-3 text-sm">{webhook.lastRun}</td>
                        <td className="p-3 text-sm">{webhook.successRate}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm">
                              {tr("اختبار")}
                            </Button>
                            <Button variant="outline" size="sm">
                              {tr("السجلات")}
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 bg-transparent">
                              {tr("حذف")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{tr("إعدادات الأمان")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">{tr("🛡️ إعدادات الحماية")}</h3>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>{tr("تفعيل HTTPS فقط")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>{tr("التحقق من توقيع الطلبات")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>{tr("تفعيل Rate Limiting")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span>{tr("تفعيل IP Whitelisting")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>{tr("تسجيل محاولات الفشل")}</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">{tr("🔒 التشفير")}</h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>{tr("خوارزمية التشفير")}</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder={tr("اختر الخوارزمية")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aes-256-gcm">AES-256-GCM</SelectItem>
                            <SelectItem value="aes-128-gcm">AES-128-GCM</SelectItem>
                            <SelectItem value="rsa-2048">RSA-2048</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Hash Algorithm</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder={tr("اختر الخوارزمية")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sha-256">SHA-256</SelectItem>
                            <SelectItem value="sha-512">SHA-512</SelectItem>
                            <SelectItem value="hmac-sha256">HMAC-SHA256</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{tr("Token Expiry (ساعات)")}</Label>
                        <Input type="number" defaultValue="24" min="1" max="720" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">{tr("🚫 عناوين IP المحظورة")}</h3>
                  <div className="flex gap-2 mb-4">
                    <Input placeholder={tr("أدخل عنوان IP أو نطاق (مثال: 192.168.1.0/24)")} className="flex-1" />
                    <Input placeholder={tr("السبب")} className="w-80" />
                    <Button className="bg-red-600 hover:bg-red-700">{tr("+ حظر")}</Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-start p-3">{tr("عنوان IP")}</th>
                          <th className="text-start p-3">{tr("السبب")}</th>
                          <th className="text-start p-3">{tr("تاريخ الحظر")}</th>
                          <th className="text-start p-3">{tr("بواسطة")}</th>
                          <th className="text-start p-3">{tr("الإجراءات")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b hover:bg-gray-50">
                          <td className="p-3">192.168.100.50</td>
                          <td className="p-3">{tr("محاولات اختراق متكررة")}</td>
                          <td className="p-3">2024/01/10</td>
                          <td className="p-3">{tr("النظام التلقائي")}</td>
                          <td className="p-3">
                            <Button variant="outline" size="sm" className="text-emerald-600 bg-transparent">
                              {tr("إلغاء الحظر")}
                            </Button>
                          </td>
                        </tr>
                        <tr className="border-b hover:bg-gray-50">
                          <td className="p-3">10.0.0.0/8</td>
                          <td className="p-3">{tr("نطاق مشبوه")}</td>
                          <td className="p-3">2024/01/05</td>
                          <td className="p-3">{tr("المدير")}</td>
                          <td className="p-3">
                            <Button variant="outline" size="sm" className="text-emerald-600 bg-transparent">
                              {tr("إلغاء الحظر")}
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">{tr("⚠️ التنبيهات الأمنية الأخيرة")}</h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span>
                        <strong className="text-red-600">{tr("🚨 تنبيه:")}</strong>{tr(" تم رصد 5 محاولات فاشلة للمصادقة من IP: 192.168.50.100")}
                      </span>
                      <span className="text-gray-500 text-sm">{tr("قبل 10 دقائق")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        <strong className="text-orange-600">{tr("⚠️ تحذير:")}</strong>{tr(" استخدام مفتاح API منتهي الصلاحية: sk_test_expired_123")}
                      </span>
                      <span className="text-gray-500 text-sm">{tr("قبل ساعة")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        <strong className="text-blue-600">{tr("ℹ️ معلومة:")}</strong>{tr(" تم تحديث شهادة SSL بنجاح")}
                      </span>
                      <span className="text-gray-500 text-sm">{tr("قبل 3 أيام")}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="bg-emerald-600 hover:bg-emerald-700">{tr("حفظ إعدادات الأمان")}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}



