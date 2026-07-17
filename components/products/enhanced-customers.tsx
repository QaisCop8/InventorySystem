"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MoreHorizontal,
  Users,
  TrendingUp,
  Phone,
  Mail,
  MapPin,
  Star,
  Activity,
  DollarSign,
  ShoppingBag,
} from "lucide-react"

interface Customer {
  id: number
  customer_code: string
  customer_name: string
  email: string
  mobile1: string
  mobile2: string
  whatsapp1: string
  whatsapp2: string
  city: string
  address: string
  status: string
  business_nature: string
  salesman: string
  classifications: string
  account_opening_date: string
  api_number: string
  general_notes: string
  movement_notes: string
  attachments: string
  created_at: string
}

interface CustomerAnalytics {
  totalCustomers: number
  activeCustomers: number
  newThisMonth: number
  topSpenders: number
  avgOrderValue: number
  totalRevenue: number
}

export function EnhancedCustomers() {
  const [state, setState] = useState({
    customers: [] as Customer[],
    loading: true,
    error: null,
    selectedCustomer: null,
    currentView: "cards", // cards, list, analytics
    filters: {
      search: "",
      classification: "all",
      status: "all",
      city: "all",
      salesman: "all",
    },
    sortBy: "customer_name",
    sortOrder: "asc" as "asc" | "desc",
  })

  const filteredCustomers = useMemo(() => {
    const filtered = state.customers.filter((customer) => {
      if (
        state.filters.search &&
        !customer.customer_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !customer.mobile1?.includes(state.filters.search) &&
        !customer.email?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (state.filters.classification !== "all" && customer.classifications !== state.filters.classification) {
        return false
      }
      if (state.filters.status !== "all" && customer.status !== state.filters.status) {
        return false
      }
      if (state.filters.city !== "all" && customer.city !== state.filters.city) {
        return false
      }
      if (state.filters.salesman !== "all" && customer.salesman !== state.filters.salesman) {
        return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const aValue = a[state.sortBy as keyof Customer]
      const bValue = b[state.sortBy as keyof Customer]

      if (state.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [state.customers, state.filters, state.sortBy, state.sortOrder])

  const analytics = useMemo((): CustomerAnalytics => {
    const totalCustomers = state.customers.length
    const activeCustomers = state.customers.filter((c) => c.status === "نشط" || c.status === "active").length

    const today = new Date()
    const thisMonth = today.getMonth()
    const thisYear = today.getFullYear()

    const newThisMonth = state.customers.filter((c) => {
      const accountDate = new Date(c.account_opening_date || c.created_at)
      return accountDate.getMonth() === thisMonth && accountDate.getFullYear() === thisYear
    }).length

    // Mock data for demonstration
    const topSpenders = Math.floor(totalCustomers * 0.2)
    const avgOrderValue = 2500
    const totalRevenue = totalCustomers * avgOrderValue * 3.5

    return {
      totalCustomers,
      activeCustomers,
      newThisMonth,
      topSpenders,
      avgOrderValue,
      totalRevenue,
    }
  }, [state.customers])

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/customers")
      if (!response.ok) {
        throw new Error("فشل في تحميل العملاء")
      }
      const data = await response.json()
      setState((prev) => ({ ...prev, customers: Array.isArray(data) ? data : [] }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        customers: [],
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  const getStatusBadge = (status: string) => {
    const isActive = status === "نشط" || status === "active"
    return (
      <Badge
        variant="secondary"
        className={
          isActive ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-red-100 text-red-800 border-red-200"
        }
      >
        {isActive ? "نشط" : "غير نشط"}
      </Badge>
    )
  }

  const getCustomerRating = (customer: Customer) => {
    // Mock rating based on customer data completeness and activity
    const hasEmail = !!customer.email
    const hasSecondPhone = !!customer.mobile2
    const hasAddress = !!customer.address
    const hasNotes = !!customer.general_notes

    let rating = 3
    if (hasEmail) rating += 0.5
    if (hasSecondPhone) rating += 0.3
    if (hasAddress) rating += 0.2
    if (hasNotes) rating += 0.2

    return Math.min(5, rating)
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل العملاء...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-50 to-indigo-50 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            إدارة العملاء
          </h1>
          <p className="text-slate-600 mt-2 text-lg">إدارة شاملة لقاعدة بيانات العملاء وعلاقاتهم التجارية</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="bg-white shadow-sm">
            <Activity className="ml-2 h-4 w-4" />
            تقرير النشاط
          </Button>
          <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg">
            <Plus className="ml-2 h-4 w-4" />
            عميل جديد
          </Button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-xl xl:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">إجمالي العملاء</p>
                <p className="text-3xl font-bold">{analytics.totalCustomers}</p>
                <div className="flex items-center mt-2">
                  <Users className="h-4 w-4 text-blue-200 ml-1" />
                  <span className="text-blue-200 text-sm">قاعدة بيانات شاملة</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-blue-400 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-500 text-white border-0 shadow-xl xl:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">العملاء النشطين</p>
                <p className="text-3xl font-bold">{analytics.activeCustomers}</p>
                <div className="flex items-center mt-2">
                  <Activity className="h-4 w-4 text-emerald-200 ml-1" />
                  <span className="text-emerald-200 text-sm">
                    معدل النشاط {Math.round((analytics.activeCustomers / analytics.totalCustomers) * 100)}%
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-emerald-400 rounded-full flex items-center justify-center">
                <Activity className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white border-0 shadow-xl xl:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">إجمالي الإيرادات</p>
                <p className="text-3xl font-bold">{analytics.totalRevenue.toLocaleString()}</p>
                <div className="flex items-center mt-2">
                  <DollarSign className="h-4 w-4 text-purple-200 ml-1" />
                  <span className="text-purple-200 text-sm">متوسط {analytics.avgOrderValue.toLocaleString()} ريال</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-purple-400 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-slate-600" />
              <span className="font-semibold text-slate-800">البحث والتصفية المتقدمة</span>
            </div>
            <Tabs
              value={state.currentView}
              onValueChange={(value) => setState((prev) => ({ ...prev, currentView: value }))}
            >
              <TabsList className="bg-slate-100">
                <TabsTrigger value="cards">بطاقات</TabsTrigger>
                <TabsTrigger value="list">قائمة</TabsTrigger>
                <TabsTrigger value="analytics">تحليلات</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Label className="text-slate-700 font-medium">البحث الذكي</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="اسم العميل، الجوال، أو البريد الإلكتروني..."
                  value={state.filters.search}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                    }))
                  }
                  className="pr-10 bg-white border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">التصنيف</Label>
              <Select
                value={state.filters.classification}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, classification: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التصنيفات</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="عادي">عادي</SelectItem>
                  <SelectItem value="جملة">جملة</SelectItem>
                  <SelectItem value="تجزئة">تجزئة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">المدينة</Label>
              <Select
                value={state.filters.city}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, city: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المدن</SelectItem>
                  <SelectItem value="الرياض">الرياض</SelectItem>
                  <SelectItem value="جدة">جدة</SelectItem>
                  <SelectItem value="الدمام">الدمام</SelectItem>
                  <SelectItem value="مكة">مكة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">الحالة</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, status: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="نشط">نشط</SelectItem>
                  <SelectItem value="غير نشط">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Display */}
      <Tabs value={state.currentView} className="space-y-6">
        <TabsContent value="cards" className="space-y-6">
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">بطاقات العملاء</h3>
                  <p className="text-slate-600">
                    عرض {filteredCustomers.length} من أصل {state.customers.length} عميل
                  </p>
                </div>
                <Select
                  value={`${state.sortBy}-${state.sortOrder}`}
                  onValueChange={(value) => {
                    const [sortBy, sortOrder] = value.split("-")
                    setState((prev) => ({ ...prev, sortBy, sortOrder: sortOrder as "asc" | "desc" }))
                  }}
                >
                  <SelectTrigger className="w-48 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_name-asc">الاسم أ-ي</SelectItem>
                    <SelectItem value="customer_name-desc">الاسم ي-أ</SelectItem>
                    <SelectItem value="account_opening_date-desc">الأحدث تسجيلاً</SelectItem>
                    <SelectItem value="account_opening_date-asc">الأقدم تسجيلاً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto h-24 w-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-12 w-12 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">لا يوجد العملاء</h3>
                  <p className="text-slate-600 mb-6">لم يتم العثور على أي العملاء تطابق معايير البحث</p>
                  <Button className="bg-gradient-to-r from-indigo-600 to-purple-600">
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة عميل جديد
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredCustomers.map((customer) => (
                    <Card
                      key={customer.id}
                      className="bg-white border border-slate-200 hover:shadow-xl transition-all duration-300 hover:border-indigo-300 group"
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 bg-gradient-to-br from-indigo-500 to-purple-500">
                              <AvatarFallback className="text-white font-bold">
                                {customer.customer_name?.charAt(0) || "ز"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                {customer.customer_name}
                              </h3>
                              <p className="text-sm text-slate-500">{customer.customer_code}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {getStatusBadge(customer.status)}
                            <div className="flex">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${i < getCustomerRating(customer) ? "text-yellow-400 fill-current" : "text-slate-300"}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          {customer.mobile1 && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-4 w-4 text-slate-500" />
                              <span className="text-slate-700">{customer.mobile1}</span>
                            </div>
                          )}

                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-4 w-4 text-slate-500" />
                              <span className="text-slate-700">{customer.email}</span>
                            </div>
                          )}

                          {customer.city && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-slate-500" />
                              <span className="text-slate-700">{customer.city}</span>
                            </div>
                          )}

                          {customer.business_nature && (
                            <div className="flex items-center gap-2 text-sm">
                              <ShoppingBag className="h-4 w-4 text-slate-500" />
                              <span className="text-slate-700">{customer.business_nature}</span>
                            </div>
                          )}
                        </div>

                        {customer.classifications && (
                          <Badge variant="outline" className="mb-4 bg-indigo-50 text-indigo-700 border-indigo-200">
                            {customer.classifications}
                          </Badge>
                        )}

                        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="bg-white hover:bg-indigo-50">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" className="bg-white hover:bg-indigo-50">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="space-y-6">
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <h3 className="text-xl font-bold text-slate-800">قائمة العملاء التفصيلية</h3>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-right p-4 font-semibold text-slate-700">العميل</th>
                      <th className="text-right p-4 font-semibold text-slate-700">رقم العميل</th>
                      <th className="text-right p-4 font-semibold text-slate-700">الجوال</th>
                      <th className="text-right p-4 font-semibold text-slate-700">البريد الإلكتروني</th>
                      <th className="text-right p-4 font-semibold text-slate-700">المدينة</th>
                      <th className="text-right p-4 font-semibold text-slate-700">التصنيف</th>
                      <th className="text-right p-4 font-semibold text-slate-700">الحالة</th>
                      <th className="text-center p-4 font-semibold text-slate-700">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 bg-gradient-to-br from-indigo-500 to-purple-500">
                              <AvatarFallback className="text-white text-sm font-bold">
                                {customer.customer_name?.charAt(0) || "ز"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-slate-800">{customer.customer_name}</p>
                              {customer.salesman && (
                                <p className="text-sm text-slate-500">مندوب: {customer.salesman}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-600">{customer.customer_code}</td>
                        <td className="p-4 text-slate-600">{customer.mobile1}</td>
                        <td className="p-4 text-slate-600">{customer.email}</td>
                        <td className="p-4 text-slate-600">{customer.city}</td>
                        <td className="p-4">
                          {customer.classifications && (
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                              {customer.classifications}
                            </Badge>
                          )}
                        </td>
                        <td className="p-4">{getStatusBadge(customer.status)}</td>
                        <td className="p-4">
                          <div className="flex justify-center gap-2">
                            <Button variant="outline" size="sm" className="bg-white">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" className="bg-white">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
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

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-slate-800">توزيع العملاء حسب المدينة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {["الرياض", "جدة", "الدمام", "مكة"].map((city) => {
                    const count = state.customers.filter((c) => c.city === city).length
                    const percentage = state.customers.length > 0 ? (count / state.customers.length) * 100 : 0

                    return (
                      <div key={city} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-700 font-medium">{city}</span>
                          <span className="text-slate-600">
                            {count} عميل ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-slate-800">إحصائيات العملاء</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-600">معدل النمو الشهري</p>
                      <p className="text-2xl font-bold text-blue-600">+15.3%</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-blue-500" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-600">معدل الاحتفاظ</p>
                      <p className="text-2xl font-bold text-emerald-600">87.2%</p>
                    </div>
                    <Users className="h-8 w-8 text-emerald-500" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-600">متوسط قيمة الطلبية</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {analytics.avgOrderValue.toLocaleString()} ريال
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}



