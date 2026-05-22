"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Messages from "../common/Messages"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { Search, RefreshCw, Users, UserPlus } from "lucide-react"
import PermissionSection from "./PermissionSection";
import { Toast } from 'primereact/toast';
import React from "react"
import Util from "../common/Util"
interface User {
  id: string
  user_id: string
  username: string
  email: string
  full_name: string
  role: string
  department: string
  phone?: string
  last_login?: string
  is_active: boolean
  permissions?: any
  created_at: string
}

interface ActivityLog {
  id: number
  datetime: string
  user: string
  action: string
  module: string
  details: string
  ip: string
  status: string
}

const activityLogs: ActivityLog[] = [
  {
    id: 1,
    datetime: "2024/01/15 14:30:25",
    user: "محمد أحمد",
    action: "إضافة",
    module: "الزبائن",
    details: "إضافة زبون جديد: أحمد محمد علي",
    ip: "192.168.1.100",
    status: "نجح",
  },
  {
    id: 2,
    datetime: "2024/01/15 14:25:12",
    user: "علي حسن",
    action: "تعديل",
    module: "طلبيات المبيعات",
    details: "تعديل طلبية رقم SO-2024-001",
    ip: "192.168.1.105",
    status: "نجح",
  },
  {
    id: 3,
    datetime: "2024/01/15 14:20:45",
    user: "محمد أحمد",
    action: "محاولة حذف",
    module: "الأصناف",
    details: "محاولة حذف صنف: لابتوب ديل",
    ip: "192.168.1.100",
    status: "فشل - لا توجد صلاحية",
  },
]

export default function Permissions() {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState("")
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("users")
  const toast = useRef(null);
    const message = useRef(Messages);
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [usersPerPage] = useState(10)
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        false ||
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        false ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        false ||
        user.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        false

      const matchesRole = roleFilter === "all" || user.role === roleFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active)

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage)
  const startIndex = (currentPage - 1) * usersPerPage
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, roleFilter, statusFilter])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/user")


      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "فشل في جلب بيانات المستخدمين")
      }

      const userData = await response.json()

      setUsers(userData)

      if (userData.length > 0 && !selectedUser) {
        setSelectedUser(userData[0].user_id || userData[0].id)
      }

      setError("")
    } catch (err) {
      console.error("[v0] Error message:", err instanceof Error ? err.message : String(err))
      setError(err instanceof Error ? err.message : "حدث خطأ في جلب بيانات المستخدمين")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRefreshUsers = () => {
    fetchUsers()
  }

  const getUserStatus = (user: User) => {
    if (!user.is_active) return { status: "غير نشط", color: "bg-red-100 text-red-800" }

    const lastLogin = user.last_login
    if (!lastLogin) return { status: "لم يسجل دخول", color: "bg-gray-100 text-gray-800" }

    const loginDate = new Date(lastLogin)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60))

    if (diffMinutes < 30) return { status: "متصل", color: "bg-emerald-100 text-emerald-800" }
    if (diffMinutes < 1440) return { status: `قبل ${diffMinutes} دقيقة`, color: "bg-yellow-100 text-yellow-800" }

    const diffDays = Math.floor(diffMinutes / 1440)
    return { status: `قبل ${diffDays} يوم`, color: "bg-gray-100 text-gray-800" }
  }

  const getUserAvatar = (user: User) => {
    return user.full_name ? user.full_name.charAt(0) : user.username.charAt(0)
  }

  const savePermissions = async () => {
    const payload = {
      userId: selectedUser,
      accesses: Object.entries(userAccess).map(([key, value]) => ({
        access_id: Number(key),
        is_granted: value.view, // or other action if you have multiple
      })),
    }

    const res = await fetch("/api/settings/user/save-user-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      //Util.showErrorToast(toast.current, 'حدث خطأ في حفظ الصلاحيات');
      Util.showErrorMessage(message, 'حدث خطأ في حفظ الصلاحيات ')
    } else {
      //Util.showSuccessToast(toast.current, 'تم تحديث الصلاحيات بنجاح');
      Util.showSuccessMessage(message)
      const savedUserStr = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user")
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : { id: 0 }

      if (selectedUser === savedUser.id) {
        await refreshUserPermissions(selectedUser);
      }

    }
  }

  const savePermissions_old = async () => {
    try {
      console.log("selectedPermissions:", selectedPermissions)

      if (!selectedUser) {
        alert("يرجى اختيار مستخدم أولاً")
        return
      }

      const permissionsData = {
        customers: {
          view:
            (document.querySelector('input[data-module="customers"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="customers"][data-action="add"]') as HTMLInputElement)
              ?.checked || false,
          edit:
            (document.querySelector('input[data-module="customers"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        suppliers: {
          view:
            (document.querySelector('input[data-module="suppliers"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="suppliers"][data-action="add"]') as HTMLInputElement)
              ?.checked || false,
          edit:
            (document.querySelector('input[data-module="suppliers"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        products: {
          view:
            (document.querySelector('input[data-module="products"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="products"][data-action="add"]') as HTMLInputElement)?.checked ||
            false,
          edit:
            (document.querySelector('input[data-module="products"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        sales_orders: {
          view:
            (document.querySelector('input[data-module="sales_orders"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="sales_orders"][data-action="add"]') as HTMLInputElement)
              ?.checked || false,
          edit:
            (document.querySelector('input[data-module="sales_orders"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        purchase_orders: {
          view:
            (document.querySelector('input[data-module="purchase_orders"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="purchase_orders"][data-action="add"]') as HTMLInputElement)
              ?.checked || false,
          edit:
            (document.querySelector('input[data-module="purchase_orders"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        exchange_rates: {
          view:
            (document.querySelector('input[data-module="exchange_rates"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          add:
            (document.querySelector('input[data-module="exchange_rates"][data-action="add"]') as HTMLInputElement)
              ?.checked || false,
          edit:
            (document.querySelector('input[data-module="exchange_rates"][data-action="edit"]') as HTMLInputElement)
              ?.checked || false,
        },
        reports: {
          orders:
            (document.querySelector('input[data-module="reports"][data-action="orders"]') as HTMLInputElement)
              ?.checked || false,
          export:
            (document.querySelector('input[data-module="reports"][data-action="export"]') as HTMLInputElement)
              ?.checked || false,
          print:
            (document.querySelector('input[data-module="reports"][data-action="print"]') as HTMLInputElement)
              ?.checked || false,
        },
        products_reports: {
          view:
            (document.querySelector('input[data-module="products_reports"][data-action="view"]') as HTMLInputElement)
              ?.checked || false,
          export:
            (document.querySelector('input[data-module="products_reports"][data-action="export"]') as HTMLInputElement)
              ?.checked || false,
          print:
            (document.querySelector('input[data-module="products_reports"][data-action="print"]') as HTMLInputElement)
              ?.checked || false,
        },
      }

      console.log("[v0] Permissions data to save:", permissionsData)

      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: selectedUser,
          permissions: selectedPermissions,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "فشل في حفظ الصلاحيات")
      }

      const result = await response.json()
      console.log("[v0] Permissions saved successfully:", result)
      alert("تم حفظ الصلاحيات بنجاح")

      // Refresh users list to show updated data
      await fetchUsers()
    } catch (err) {
      console.error("[v0] Error saving permissions:", err)
      alert(`حدث خطأ في حفظ الصلاحيات: ${err instanceof Error ? err.message : "خطأ غير معروف"}`)
    }
  }

  const handleEditPermissions = (userId: string) => {
    console.log("[v0] Editing permissions for user:", userId)
    setSelectedUser(userId)
    setActiveTab("permissions")
  }

  interface AccessItem {
    access_name: any
    id: number
    name: string
    category_name: string
    is_granted?: boolean,
    access_id: number
  }

  const [accessList, setAccessList] = useState<Record<string, AccessItem[]>>({})
  const [userAccess, setUserAccess] = useState<Record<string, Record<string, boolean>>>({})

  useEffect(() => {
    const fetchAccess = async () => {
      const res = await fetch(`/api/settings/user/user-access?userId=${selectedUser}`)
      const data: AccessItem[] = await res.json()
      // Group by category_name
      const grouped: Record<string, AccessItem[]> = {}
      data.forEach(item => {
        if (!grouped[item.category_name]) grouped[item.category_name] = []
        grouped[item.category_name].push(item)
      })
      setAccessList(grouped)

      // Generate userAccess object
      const ua: Record<string, Record<string, boolean>> = {}
      data.forEach(item => {
        const key = item.access_id
        ua[key] = { view: !!item.is_granted } // extend for more actions if needed
      })
      setUserAccess(ua)
    }

    if (selectedUser) fetchAccess()
  }, [selectedUser])



  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين والصلاحيات</h1>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <p>جاري تحميل بيانات المستخدمين...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين والصلاحيات</h1>
        <div className="flex items-center justify-center p-8">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <Button onClick={fetchUsers} className="mt-4">
              إعادة المحاولة
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col space-y-6" dir="rtl">
      <Toast ref={toast} position={'top-left'} style={{ top: 100, whiteSpace: 'pre-line' }} />
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين والصلاحيات</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleRefreshUsers} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={savePermissions}>
            حفظ الصلاحيات
          </Button>
        </div>
      </div>
      <Messages innerRef={message} />
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="users">المستخدمون والأدوار</TabsTrigger>
            <TabsTrigger value="permissions">الصلاحيات المخصصة</TabsTrigger>
            <TabsTrigger value="logs">سجل العمليات</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    نظام الأدوار المتدرج
                  </CardTitle>
                  <Badge variant="secondary" className="text-sm">
                    {filteredUsers.length} من {users.length} مستخدم
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="space-y-4 mb-6 flex-shrink-0">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="البحث في المستخدمين..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pr-10"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="فلترة بالدور" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الأدوار</SelectItem>
                          <SelectItem value="مدير عام">مدير عام</SelectItem>
                          <SelectItem value="مدير قسم">مدير قسم</SelectItem>
                          <SelectItem value="موظف">موظف</SelectItem>
                          <SelectItem value="عميل">عميل</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="الحالة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الحالات</SelectItem>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="inactive">غير نشط</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
                  <div className="p-4 border rounded-lg text-center cursor-pointer hover:bg-gray-50">
                    <div className="text-2xl mb-2">👑</div>
                    <div className="font-medium">مدير عام</div>
                  </div>
                  <div className="p-4 border rounded-lg text-center cursor-pointer hover:bg-gray-50">
                    <div className="text-2xl mb-2">📊</div>
                    <div className="font-medium">مدير قسم</div>
                  </div>
                  <div className="p-4 border rounded-lg text-center cursor-pointer hover:bg-gray-50">
                    <div className="text-2xl mb-2">👤</div>
                    <div className="font-medium">موظف</div>
                  </div>
                  <div className="p-4 border rounded-lg text-center cursor-pointer hover:bg-gray-50">
                    <div className="text-2xl mb-2">🛍️</div>
                    <div className="font-medium">عميل</div>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">م</th>
                        <th className="text-right p-3">المستخدم</th>
                        <th className="text-right p-3">الدور الحالي</th>
                        <th className="text-right p-3">القسم</th>
                        <th className="text-right p-3">الهاتف</th>
                        <th className="text-right p-3">آخر دخول</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user, index) => {
                        const userStatus = getUserStatus(user)
                        const serialNumber = startIndex + index + 1
                        return (
                          <tr key={user.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">{serialNumber}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                                  {getUserAvatar(user)}
                                </div>
                                <div>
                                  <div className="font-medium">{user.full_name || user.username}</div>
                                  <div className="text-sm text-gray-500">{user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge className="bg-amber-100 text-amber-900">👑 {user.role}</Badge>
                            </td>
                            <td className="p-3">{user.department || "غير محدد"}</td>
                            <td className="p-3">{user.phone || "غير محدد"}</td>
                            <td className="p-3">{userStatus.status}</td>
                            <td className="p-3">
                              <Badge className={userStatus.color}>{user.is_active ? "نشط" : "غير نشط"}</Badge>
                            </td>
                            <td className="p-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditPermissions(user.user_id || user.id)}
                              >
                                تعديل الصلاحيات
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              if (currentPage > 1) setCurrentPage(currentPage - 1)
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                          >
                            السابق
                          </PaginationPrevious>
                        </PaginationItem>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          ) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setCurrentPage(page)
                                  }}
                                  isActive={currentPage === page}
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          } else if (page === currentPage - 2 || page === currentPage + 2) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )
                          }
                          return null
                        })}

                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              if (currentPage < totalPages) setCurrentPage(currentPage + 1)
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                          >
                            التالي
                          </PaginationNext>
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}

                {filteredUsers.length === 0 && !loading && (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm || roleFilter !== "all" || statusFilter !== "all" ? (
                      <div>
                        <p>لا توجد نتائج تطابق البحث</p>
                        <Button
                          variant="outline"
                          className="mt-4 bg-transparent"
                          onClick={() => {
                            setSearchTerm("")
                            setRoleFilter("all")
                            setStatusFilter("all")
                          }}
                        >
                          مسح الفلاتر
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p>لا توجد مستخدمين في النظام</p>
                        <Button className="mt-4" onClick={fetchUsers}>
                          إعادة تحميل
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle>صلاحيات مخصصة</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="space-y-6">

                  {/* اختيار المستخدم */}
                  <div className="space-y-2">
                    <Label>اختر المستخدم</Label>
                    <Select
                      value={selectedUser}
                      onValueChange={(userId) => {
                        setSelectedUser(userId)
                        const user = users.find(u => u.user_id === userId)
                        setSelectedPermissions(user?.permissions || {})
                      }}
                    >
                      <SelectTrigger className="max-w-md">
                        <SelectValue placeholder="اختر مستخدم" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.user_id}>
                            {user.user_id} - {user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* بيانات المستخدم المختار */}
                  {selectedUser && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                          {users.find(u => (u.user_id || u.id) === selectedUser)?.full_name?.charAt(0) || "U"}
                        </div>
                        <div>
                          <div className="font-medium">
                            {users.find(u => (u.user_id || u.id) === selectedUser)?.full_name || "مستخدم غير معروف"}
                          </div>
                          <div className="text-sm text-gray-600">
                            {users.find(u => (u.user_id || u.id) === selectedUser)?.role || "دور غير محدد"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* الأقسام */}
                  {/** الملفات والتعريفات */}
                  <div className="space-y-6">
                    <div className="flex gap-4 mb-6">
                      <button
                        className="px-4 py-1 bg-green-500 text-white rounded"
                        onClick={() => {
                          const updated: Record<number, { view: boolean }> = {}
                          Object.values(accessList).flat().forEach(item => {
                            updated[item.access_id] = { view: true }
                          })
                          setUserAccess(updated)
                        }}
                      >
                        تحديد الكل
                      </button>

                      <button
                        className="px-4 py-1 bg-red-500 text-white rounded"
                        onClick={() => {
                          const updated: Record<number, { view: boolean }> = {}
                          Object.values(accessList).flat().forEach(item => {
                            updated[item.access_id] = { view: false }
                          })
                          setUserAccess(updated)
                        }}
                      >
                        الغاء تحديد الكل
                      </button>

                      <button
                        className="px-4 py-1 bg-blue-500 text-white rounded"
                        onClick={() => {
                          const updated = { ...userAccess }
                          Object.values(accessList).flat().forEach(item => {
                            updated[item.access_id] = { view: !updated[item.access_id]?.view }
                          })
                          setUserAccess(updated)
                        }}
                      >
                        عكس التحديد
                      </button>
                    </div>

                    {Object.entries(accessList).map(([categoryName, items]) => (
                      <div key={categoryName} className="border rounded-lg p-6 mb-4">
                        <h4 className="font-semibold text-lg mb-4">{categoryName}</h4>
                        <div className="grid grid-cols-[1fr_60px] gap-6 items-center">
                          {items.map(item => {
                            const isChecked = !!userAccess[item.access_id]?.view // make sure it's boolean

                            return (
                              <React.Fragment key={item.access_id}>
                                <div className="text-base font-medium">{item.access_name}</div>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  className="rounded w-5 h-5"
                                  onChange={(e) => {
                                    console.log("item.access_id ", item.access_id)
                                    setUserAccess(prev => ({
                                      ...prev,
                                      [item.access_id]: { view: e.target.checked } // replace whole object
                                    }))
                                  }}
                                />
                              </React.Fragment>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                  </div>





                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle>سجل شامل لجميع العمليات</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
                  <div className="space-y-2">
                    <Label>من تاريخ</Label>
                    <Input
                      type="date"
                      defaultValue={new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>إلى تاريخ</Label>
                    <Input type="date" defaultValue={new Date().toISOString().split("T")[0]} />
                  </div>
                  <div className="space-y-2">
                    <Label>المستخدم</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="جميع المستخدمين" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع المستخدمين</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.user_id || user.id}>
                            {user.full_name || user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>نوع العملية</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="جميع العمليات" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع العمليات</SelectItem>
                        <SelectItem value="login">تسجيل دخول</SelectItem>
                        <SelectItem value="add">إضافة</SelectItem>
                        <SelectItem value="edit">تعديل</SelectItem>
                        <SelectItem value="delete">حذف</SelectItem>
                        <SelectItem value="print">طباعة</SelectItem>
                        <SelectItem value="export">تصدير</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">التاريخ والوقت</th>
                        <th className="text-right p-3">المستخدم</th>
                        <th className="text-right p-3">نوع العملية</th>
                        <th className="text-right p-3">الوحدة</th>
                        <th className="text-right p-3">التفاصيل</th>
                        <th className="text-right p-3">عنوان IP</th>
                        <th className="text-right p-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-sm">{log.datetime}</td>
                          <td className="p-3">{log.user}</td>
                          <td className="p-3">{log.action}</td>
                          <td className="p-3">{log.module}</td>
                          <td className="p-3 text-sm">{log.details}</td>
                          <td className="p-3 text-sm">{log.ip}</td>
                          <td className="p-3">
                            <Badge
                              className={
                                log.status.includes("نجح")
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {log.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
interface AccessItem {
    access_name: any
    id: number
    name: string
    category_name: string
    is_granted?: boolean,
    access_id: number
  }
const refreshUserPermissions = async (userId: string) => {
    try {
      localStorage.removeItem('user_Access_List');
       const res = await fetch(`/api/settings/user/user-access?userId=${userId}`)
      const data: AccessItem[] = await res.json()
      console.log("[v0] Fetched user permissions:", data)
      const ua: Record<string, Record<string, boolean>> = {}
      data.forEach(item => {
        const key = item.access_id
        ua[key] = { view: !!item.is_granted } // extend for more actions if needed
      })
      localStorage.setItem('user_Access_List', JSON.stringify(data))
    } catch (error) {
      console.error("[v0] Failed to refresh permissions:", error)
      throw error
    }
  }

