"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Shield, Key, User, Users, UserCheck, UserX, Clock, Eye, EyeOff } from "lucide-react"

const roles = ["مدير النظام", "مدير المبيعات", "مدير المشتريات", "محاسب", "مندوب مبيعات", "موظف مخازن"]
const departments = ["الإدارة", "المبيعات", "المشتريات", "المحاسبة", "المخازن", "تقنية المعلومات"]
interface User {
  id: number
  user_id: string
  username: string
  full_name: string
  email: string
  phone?: string
  role: string
  department: string
  is_active: boolean
  last_login?: string
  dashboard_layout?: { default_screen: string }
  notifications_enabled?: boolean
  email_notifications?: boolean
}
const defaultScreens = [
  { value: "dashboard", label: "لوحة التحكم الرئيسية", roles: ["all"] },
  { value: "sales-orders", label: "طلبيات المبيعات", roles: ["مدير النظام", "مدير المبيعات", "مندوب مبيعات"] },
  { value: "purchase-orders", label: "طلبيات المشتريات", roles: ["مدير النظام", "مدير المشتريات"] },
  {
    value: "batch-movements",
    label: "حركات الرقم التشغيلي",
    roles: ["مدير النظام", "مدير المبيعات", "مدير المشتريات", "مندوب مبيعات"],
  },
  { value: "customers", label: "إدارة العملاء", roles: ["مدير النظام", "مدير المبيعات", "مندوب مبيعات"] },
  { value: "suppliers", label: "إدارة الموردين", roles: ["مدير النظام", "مدير المشتريات"] },
  { value: "products", label: "إدارة الأصناف", roles: ["مدير النظام", "موظف مخازن"] },
  { value: "orders-migration", label: "ترحيل الطلبيات", roles: ["مدير النظام", "موظف مخازن"] },
  { value: "order-management", label: "معالجة حالة الطلبيات", roles: ["مدير النظام", "موظف مخازن"] },
]

export function UserSettings() {
  const [users, setUsers] = useState<User[]>([])

  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [showNewUserDialog, setShowNewUserDialog] = useState(false)
  const [filters, setFilters] = useState({ search: "", role: "all", department: "all" })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/user")

      if (!response.ok) {
        throw new Error("فشل في جلب بيانات المستخدمين")
      }

      const userData = await response.json()
      console.log("[v0] Loaded users from database:", userData)
      setUsers(userData)
    } catch (error) {
      console.error("[v0] Error loading users:", error)
      // Fallback to mock data if database fails
      const mockUsers = [
        {
          id: 1,
          user_id: "U0001",
          username: "admin",
          full_name: "مدير النظام",
          email: "admin@company.com",
          phone: "0501234567",
          role: "مدير النظام",
          department: "الإدارة",
          is_active: true,
          last_login: new Date().toISOString(),
          dashboard_layout: { default_screen: "dashboard" },
        },
        {
          id: 2,
          user_id: "U0002",
          username: "sales_manager",
          full_name: "أحمد محمد",
          email: "ahmed@company.com",
          phone: "0507654321",
          role: "مدير المبيعات",
          department: "المبيعات",
          is_active: true,
          last_login: new Date(Date.now() - 86400000).toISOString(),
          dashboard_layout: { default_screen: "sales-orders" },
        },
      ]
      setUsers(mockUsers)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.username.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.email.toLowerCase().includes(filters.search.toLowerCase())
    const matchesRole = filters.role === "all" || user.role === filters.role
    const matchesDepartment = filters.department === "all" || user.department === filters.department
    return matchesSearch && matchesRole && matchesDepartment
  })

  const userSummary = [
    { title: "إجمالي المستخدمين", value: users.length, icon: Users, color: "text-blue-600" },
    {
      title: "المستخدمون النشطون",
      value: users.filter((u) => u.is_active).length,
      icon: UserCheck,
      color: "text-green-600",
    },
    {
      title: "المستخدمون غير النشطين",
      value: users.filter((u) => !u.is_active).length,
      icon: UserX,
      color: "text-red-600",
    },
    {
      title: "آخر تسجيل دخول اليوم",
      value: users.filter((u) => u.last_login && new Date(u.last_login).toDateString() === new Date().toDateString())
        .length,
      icon: Clock,
      color: "text-orange-600",
    },
  ]

  const getStatusBadge = (isActive) => {
    return isActive ? (
      <Badge variant="default" className="bg-green-100 text-green-800">
        نشط
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-red-100 text-red-800">
        غير نشط
      </Badge>
    )
  }

  const getAvailableScreens = (userRole) => {
    return defaultScreens.filter((screen) => screen.roles.includes("all") || screen.roles.includes(userRole))
  }

  const handleViewUser = (user) => {
    setSelectedUser(user)
    setShowUserDialog(true)
  }

  const handleEditPermissions = (user) => {
    setSelectedUser(user)
    // Navigate to permissions tab - we'll need to communicate with parent component
    // For now, we'll show an alert with user info
    alert(`سيتم فتح شاشة تعديل الصلاحيات للمستخدم: ${user.full_name}`)
  }

  const handlePasswordReset = (user) => {
    setSelectedUser(user)
    setShowPasswordReset(true)
  }

  const saveUser = async (userData, isNew = false) => {
    console.log("[v0] Saving user:", userData, "isNew:", isNew)

    try {
      if (isNew) {
        const response = await fetch("/api/settings/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: userData.username,
            email: userData.email,
            full_name: userData.full_name,
            role: userData.role,
            department: userData.department,
            phone: userData.phone,
            language: userData.language || "ar",
            theme_preference: userData.theme || "light",
            notifications_enabled: userData.notifications_enabled,
            email_notifications: userData.email_notifications,
            is_active: userData.is_active,
            dashboard_layout: userData.dashboard_layout,
            password: userData.password,
          }),
        })
        
        const data = await response.json();
        console.log("result result result ", data)
        if (!response.ok || !data.success) {
          const message = data.error || "فشل في حفظ المستخدم";
          console.error("[v0] User creation failed:", message);
          alert("حدث خطأ في حفظ المستخدم: " + message);
          return;
        }

        // Add to local state with database ID
        const newUser = {
          ...userData,
          id: data.user.id,
          user_id: data.user.user_id || `U${String(users.length + 1).padStart(4, "0")}`,
          last_login: null,
        }
        setUsers([...users, newUser])
        setShowNewUserDialog(false)
      } else {
        // Update existing user
        const response = await fetch("/api/settings/user", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: selectedUser.user_id,
            username: userData.username,
            email: userData.email,
            full_name: userData.full_name,
            role: userData.role,
            department: userData.department,
            phone: userData.phone,
            language: userData.language || "ar",
            theme_preference: userData.theme || "light",
            notifications_enabled: userData.notifications_enabled,
            email_notifications: userData.email_notifications,
            is_active: userData.is_active,
            dashboard_layout: userData.dashboard_layout,
            ...(userData.password && { password_hash: userData.password }),
          }),
        })
        console.log("responseresponseresponseresponseresponse ", response)
         const data = await response.json();
        console.log("result result result ", data)
        if (!response.ok || !data.success) {
          const message = data.error || "فشل في حفظ المستخدم";
          console.error("[v0] User creation failed:", message);
          alert("حدث خطأ في حفظ المستخدم: " + message);
          return;
        }

        setUsers(users.map((u) => (u.id === selectedUser.id ? { ...u, ...userData } : u)))
        setShowUserDialog(false)
      }
    } catch (error: any) {
      console.log("errorerrorerrorerror ", error)
      if (error instanceof Error) {
        console.error("[v0] Error saving user:", error.message)
        alert("حدث خطأ في حفظ المستخدم: " + error.message)
      } else {
        console.error("[v0] Unknown error:", error)
        alert("حدث خطأ غير معروف أثناء حفظ المستخدم")
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>جاري تحميل إعدادات المستخدمين...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {userSummary.map((item, index) => (
          <Card key={index} className="erp-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="erp-card">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setShowNewUserDialog(true)} className="erp-btn-primary">
                <Plus className="h-4 w-4 ml-2" />
                مستخدم جديد
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="البحث في المستخدمين..."
                  className="w-64 pr-10"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <Select value={filters.role} onValueChange={(value) => setFilters({ ...filters, role: value })}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأدوار</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.department}
                onValueChange={(value) => setFilters({ ...filters, department: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأقسام</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="erp-card">
        <CardHeader>
          <CardTitle>المستخدمون والصلاحيات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>رقم المستخدم</th>
                  <th>اسم المستخدم</th>
                  <th>الاسم الكامل</th>
                  <th>البريد الإلكتروني</th>
                  <th>الدور</th>
                  <th>القسم</th>
                  <th>آخر تسجيل دخول</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.user_id}</td>
                    <td className="font-mono">{user.username}</td>
                    <td>{user.full_name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.department}</td>
                    <td className="text-sm text-muted-foreground">
                      {user.last_login ? new Date(user.last_login).toLocaleString("ar-US") : "-"}
                    </td>
                    <td>{getStatusBadge(user.is_active)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleViewUser(user)} title="تعديل المستخدم">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPermissions(user)}
                          title="تعديل الصلاحيات"
                        >
                          <Shield className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePasswordReset(user)}
                          title="إعادة تعيين كلمة المرور"
                        >
                          <Key className="h-3 w-3" />
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

      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المستخدم {selectedUser?.full_name}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)

                const password = formData.get("password") as string
                const confirmPassword = formData.get("confirmPassword") as string

                if (showEditPassword && password) {
                  if (password !== confirmPassword) {
                    alert("كلمة المرور وتأكيد كلمة المرور غير متطابقتان")
                    return
                  }
                  if (password.length < 6) {
                    alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
                    return
                  }
                }

                const dashboardLayout = {
                  ...selectedUser.dashboard_layout,
                  default_screen: formData.get("defaultScreen") as string,
                }
                const userData = {
                  user_id: selectedUser.user_id,
                  username: formData.get("username") as string,
                  full_name: formData.get("fullName") as string,
                  email: formData.get("email") as string,
                  phone: formData.get("phone") as string,
                  role: formData.get("role") as string,
                  department: formData.get("department") as string,
                  language: (formData.get("language") as string) || "ar",
                  theme: (formData.get("theme") as string) || "light",
                  notifications_enabled: formData.get("notifications") === "on",
                  email_notifications: formData.get("emailNotifications") === "on",
                  is_active: formData.get("active") === "on",
                  dashboard_layout: dashboardLayout,
                  ...(showEditPassword && password && { password: password }),
                }
                saveUser(userData)
              }}
            >
              <div className="space-y-6" dir="rtl">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    معلومات الدخول
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="userIdDisplay">رقم المستخدم</Label>
                      <Input
                        id="userIdDisplay"
                        value={selectedUser.user_id}
                        disabled
                        className="bg-gray-100 text-gray-600 text-right"
                        dir="rtl"
                      />
                      <p className="text-sm text-muted-foreground mt-1 text-right">
                        يتم توليد رقم المستخدم تلقائياً بشكل تسلسلي
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="username">اسم المستخدم *</Label>
                      <Input
                        id="username"
                        name="username"
                        defaultValue={selectedUser.username}
                        required
                        className="text-right"
                        dir="rtl"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-3">
                        <Label>تغيير كلمة المرور</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEditPassword(!showEditPassword)}
                        >
                          {showEditPassword ? "إلغاء تغيير كلمة المرور" : "تغيير كلمة المرور"}
                        </Button>
                      </div>

                      {showEditPassword && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <div>
                            <Label htmlFor="editPassword">كلمة المرور الجديدة *</Label>
                            <div className="relative">
                              <Input
                                id="editPassword"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="أدخل كلمة المرور الجديدة"
                                minLength={6}
                                className="text-right pr-10"
                                dir="rtl"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 text-right">
                              كلمة المرور يجب أن تكون 6 أحرف على الأقل
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="editConfirmPassword">تأكيد كلمة المرور الجديدة *</Label>
                            <div className="relative">
                              <Input
                                id="editConfirmPassword"
                                name="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="أعد إدخال كلمة المرور الجديدة"
                                minLength={6}
                                className="text-right pr-10"
                                dir="rtl"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <Label htmlFor="defaultScreen">الشاشة الافتراضية عند الدخول</Label>
                      <Select
                        name="defaultScreen"
                        defaultValue={selectedUser.dashboard_layout?.default_screen || "dashboard"}
                        dir="rtl"
                      >
                        <SelectTrigger className="text-right" dir="rtl">
                          <SelectValue placeholder="اختر الشاشة الافتراضية" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {getAvailableScreens(selectedUser.role).map((screen) => (
                            <SelectItem key={screen.value} value={screen.value} className="text-right">
                              {screen.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground mt-1 text-right">
                        سيتم توجيه المستخدم إلى هذه الشاشة مباشرة بعد تسجيل الدخول حسب صلاحياته
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                    <User className="h-5 w-5" />
                    المعلومات الشخصية
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">الاسم الكامل *</Label>
                      <Input
                        id="fullName"
                        name="fullName"
                        defaultValue={selectedUser.full_name}
                        required
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">البريد الإلكتروني *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={selectedUser.email}
                        required
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">رقم الهاتف</Label>
                      <Input
                        id="phone"
                        name="phone"
                        defaultValue={selectedUser.phone || ""}
                        className="text-right"
                        dir="rtl"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">الدور *</Label>
                      <Select name="role" defaultValue={selectedUser.role} dir="rtl">
                        <SelectTrigger className="text-right" dir="rtl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {roles.map((role) => (
                            <SelectItem key={role} value={role} className="text-right">
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="department">القسم *</Label>
                      <Select name="department" defaultValue={selectedUser.department} dir="rtl">
                        <SelectTrigger className="text-right" dir="rtl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept} className="text-right">
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    تفضيلات النظام
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="active">مستخدم نشط</Label>
                      <Switch id="active" name="active" defaultChecked={selectedUser.is_active} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notifications">تفعيل الإشعارات</Label>
                      <Switch
                        id="notifications"
                        name="notifications"
                        defaultChecked={selectedUser.notifications_enabled}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="emailNotifications">إشعارات البريد الإلكتروني</Label>
                      <Switch
                        id="emailNotifications"
                        name="emailNotifications"
                        defaultChecked={selectedUser.email_notifications}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowUserDialog(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit">حفظ التغييرات</Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const password = formData.get("password") as string
              const confirmPassword = formData.get("confirmPassword") as string

              if (password !== confirmPassword) {
                alert("كلمة المرور وتأكيد كلمة المرور غير متطابقتان")
                return
              }

              if (password.length < 6) {
                alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
                return
              }

              const dashboardLayout = {
                default_screen: (formData.get("defaultScreen") as string) || "dashboard",
              }
              const userData = {
                username: formData.get("username") as string,
                password: formData.get("password") as string,
                full_name: formData.get("fullName") as string,
                email: formData.get("email") as string,
                phone: formData.get("phone") as string,
                role: formData.get("role") as string,
                department: formData.get("department") as string,
                language: "ar",
                theme: "light",
                notifications_enabled: true,
                email_notifications: true,
                is_active: true,
                dashboard_layout: dashboardLayout,
              }
              console.log("userDatauserDatauserData ", userData)
              saveUser(userData, true)
            }}
          >
            <div className="space-y-6" dir="rtl">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  معلومات الدخول
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>رقم المستخدم</Label>
                    <Input
                      value="سيتم توليده تلقائياً"
                      disabled
                      className="bg-gray-100 text-gray-600 text-right"
                      dir="rtl"
                    />
                    <p className="text-sm text-muted-foreground mt-1 text-right">
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="newUsername">اسم المستخدم *</Label>
                    <Input
                      id="newUsername"
                      name="username"
                      placeholder="أدخل اسم المستخدم"
                      required
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">كلمة المرور *</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="أدخل كلمة المرور"
                        required
                        minLength={6}
                        className="text-right pr-10"
                        dir="rtl"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 text-right">
                      كلمة المرور يجب أن تكون 6 أحرف على الأقل
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="newConfirmPassword">تأكيد كلمة المرور *</Label>
                    <div className="relative">
                      <Input
                        id="newConfirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="أعد إدخال كلمة المرور"
                        required
                        minLength={6}
                        className="text-right pr-10"
                        dir="rtl"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="newDefaultScreen">الشاشة الافتراضية عند الدخول</Label>
                    <Select name="defaultScreen" defaultValue="dashboard" dir="rtl">
                      <SelectTrigger className="text-right" dir="rtl">
                        <SelectValue placeholder="اختر الشاشة الافتراضية" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {defaultScreens.map((screen) => (
                          <SelectItem key={screen.value} value={screen.value} className="text-right">
                            {screen.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1 text-right">
                      سيتم توجيه المستخدم إلى هذه الشاشة مباشرة بعد تسجيل الدخول حسب صلاحياته
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  المعلومات الشخصية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="newFullName">الاسم الكامل *</Label>
                    <Input
                      id="newFullName"
                      name="fullName"
                      placeholder="أدخل الاسم الكامل"
                      required
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newEmail">البريد الإلكتروني *</Label>
                    <Input
                      id="newEmail"
                      name="email"
                      type="email"
                      placeholder="user@company.com"
                      required
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPhone">رقم الهاتف</Label>
                    <Input id="newPhone" name="phone" placeholder="05xxxxxxxx" className="text-right" dir="rtl" />
                  </div>
                  <div>
                    <Label htmlFor="newRole">الدور *</Label>
                    <Select name="role" required dir="rtl">
                      <SelectTrigger className="text-right" dir="rtl">
                        <SelectValue placeholder="اختر الدور" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {roles.map((role) => (
                          <SelectItem key={role} value={role} className="text-right">
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="newDepartment">القسم *</Label>
                    <Select name="department" required dir="rtl">
                      <SelectTrigger className="text-right" dir="rtl">
                        <SelectValue placeholder="اختر القسم" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept} className="text-right">
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowNewUserDialog(false)}>
                  إلغاء
                </Button>
                <Button type="submit">إضافة المستخدم</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordReset} onOpenChange={setShowPasswordReset}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4" dir="rtl">
              <div className="text-center">
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
                  <p className="text-sm text-yellow-800 text-right">
                    سيتم إرسال رابط إعادة تعيين كلمة المرور إلى البريد الإلكتروني للمستخدم:
                  </p>
                  <p className="font-semibold text-yellow-900 mt-2 text-right">{selectedUser.full_name}</p>
                  <p className="text-sm text-yellow-700 text-right">{selectedUser.email}</p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowPasswordReset(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={() => {
                    // Here you would typically call an API to send password reset email
                    alert(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${selectedUser.email}`)
                    setShowPasswordReset(false)
                  }}
                >
                  إرسال رابط الإعادة
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
