"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Users, Key, ExternalLink, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Customer {
  id: number
  customer_name: string
  customer_code: string
  email?: string
  mobile1?: string
  status: string
  portal_enabled?: boolean
  user_count?: number
}

export function CustomerPortalAdmin() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      console.log("[v0] CustomerPortalAdmin - Fetching customers...")
      setLoading(true)

      const response = await fetch("/api/customers")
      console.log("[v0] API response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Customers data received:", {
          count: data.customers?.length || 0,
          sample: data.customers?.[0],
        })

        setCustomers(data.customers || [])
      } else {
        console.error("[v0] Failed to fetch customers:", response.statusText)
      }
    } catch (error) {
      console.error("[v0] Error fetching customers:", error)
    } finally {
      setLoading(false)
      console.log("[v0] Fetch customers complete")
    }
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.customer_code?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  console.log("[v0] CustomerPortalAdmin render:", {
    totalCustomers: customers.length,
    filteredCustomers: filteredCustomers.length,
    loading,
    searchQuery,
  })

  const handleOpenPortal = (customerId: number) => {
    console.log("[v0] Opening portal management for customer:", customerId)
    router.push(`/customers/${customerId}/portal`)
  }

  const handleViewPortal = (customerId: number) => {
    console.log("[v0] Opening customer portal preview for:", customerId)
    window.open(`/customer/login?customer=${customerId}`, "_blank")
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة بوابات العملاء</h1>
          <p className="text-muted-foreground mt-1">إدارة حسابات الوصول والصلاحيات لبوابات العملاء</p>
        </div>
        <Button onClick={() => router.push("/customer/login")} variant="outline">
          <ExternalLink className="ml-2 h-4 w-4" />
          معاينة صفحة تسجيل الدخول
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customers.length}</div>
            <p className="text-xs text-muted-foreground">عميل مسجل في النظام</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">البوابات النشطة</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customers.filter((c) => c.portal_enabled).length}</div>
            <p className="text-xs text-muted-foreground">بوابة مفعلة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المستخدمين</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.reduce((sum, c) => sum + (Number(c.user_count) || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">حساب مستخدم</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة العملاء</CardTitle>
          <CardDescription>اختر عميلاً لإدارة بوابته</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث عن عميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">جاري تحميل الأصناف...</p>
              </div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "لا توجد نتائج للبحث" : "لا يوجد عملاء"}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">اسم العميل</TableHead>
                    <TableHead className="text-right">البريد الإلكتروني</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">البوابة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.customer_code}</TableCell>
                      <TableCell>{customer.customer_name}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.email || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.mobile1 || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                          {customer.status === "active" ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {customer.portal_enabled ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <Key className="ml-1 h-3 w-3" />
                            مفعلة ({customer.user_count || 0})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            غير مفعلة
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleOpenPortal(customer.id)}>
                            <Settings className="ml-1 h-3 w-3" />
                            إدارة البوابة
                          </Button>
                          {customer.portal_enabled && (
                            <Button size="sm" variant="ghost" onClick={() => handleViewPortal(customer.id)}>
                              <ExternalLink className="ml-1 h-3 w-3" />
                              معاينة
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">معلومات مهمة</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>• لإنشاء حساب جديد لعميل، اذهب إلى صفحة إدارة البوابة الخاصة بالعميل</p>
          <p>• يمكن لكل عميل أن يكون لديه عدة مستخدمين بصلاحيات مختلفة</p>
          <p>• الصلاحيات المتاحة: عرض الطلبيات، إنشاء طلبيات، عرض الرصيد، عرض الأصناف، عرض الأسعار، عرض المخزون</p>
          <p>• يتم تسجيل جميع عمليات الدخول والخروج لأغراض الأمان</p>
        </CardContent>
      </Card>
    </div>
  )
}
