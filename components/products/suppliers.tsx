"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Search, Upload, X, Save, CheckCircle, AlertCircle, Edit, Trash2 } from "lucide-react"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { ExcelImport } from "@/components/ui/excel-import"

interface Classification {
  id: number
  group_number: string
  group_name: string
  description?: string
  is_active: boolean
}

interface Salesman {
  id: number
  name: string
  department?: string
  is_active: boolean
}

interface Supplier {
  id: number
  supplier_code: string
  name: string
  mobile1: string
  mobile2?: string
  whatsapp1?: string
  whatsapp2?: string
  city: string
  address?: string
  email?: string
  status: string
  business_nature?: string
  salesman?: string
  classification?: string
  registration_date?: string
  web_username?: string
  web_password?: string
  transaction_notes?: string
  general_notes?: string
  account_opening_date?: string
  movement_notes?: string
  classifications?: string
  account_id?: number | null
  father_id?: string | null
  currency_id?: string | null
  allow_trans_with_diff_curr?: string | null
  iscalc_curr_diff_rates?: boolean | null
  level_no?: number | null
}

interface SupplierFormData {
  supplier_code: string
  name: string
  mobile1: string
  mobile2: string
  whatsapp1: string
  whatsapp2: string
  city: string
  address: string
  email: string
  status: string
  business_nature: string
  salesman: string
  classification: string
  registration_date: string
  web_username: string
  web_password: string
  transaction_notes: string
  general_notes: string
  account_id?: number | null
  father_id?: string
  currency_id?: string
  allow_trans_with_diff_curr?: string
  iscalc_curr_diff_rates?: boolean
  level_no?: number
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSupplierDialog, setShowSupplierDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)

  const [classifications, setClassifications] = useState<Classification[]>([])
  const [salesmen, setSalesmen] = useState<Salesman[]>([])

  const [formData, setFormData] = useState<SupplierFormData>({
    supplier_code: "",
    name: "",
    mobile1: "",
    mobile2: "",
    whatsapp1: "",
    whatsapp2: "",
    city: "",
    address: "",
    email: "",
    status: "نشط",
    business_nature: "",
    salesman: "",
    classification: "",
    registration_date: new Date().toISOString().split("T")[0],
    web_username: "",
    web_password: "",
    transaction_notes: "",
    general_notes: "",
    account_id: null,
    father_id: "",
    currency_id: "",
    allow_trans_with_diff_curr: "0",
    iscalc_curr_diff_rates: false,
    level_no: 1,
  })

  const [searchFilters, setSearchFilters] = useState({
    name: "",
    city: "",
    status: "",
    salesman: "",
  })

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generatingNumber, setGeneratingNumber] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      return (
        (!searchFilters.name || supplier.name?.toLowerCase().includes(searchFilters.name.toLowerCase())) &&
        (!searchFilters.city || supplier.city === searchFilters.city) &&
        (!searchFilters.status || supplier.status === searchFilters.status) &&
        (!searchFilters.salesman || supplier.salesman === searchFilters.salesman)
      )
    })
  }, [suppliers, searchFilters])

  const currentSupplier = useMemo(() => {
    return suppliers[currentIndex] || null
  }, [suppliers, currentIndex])

  const updateFormData = useCallback((supplier: Supplier | null) => {
    if (!supplier) {
      setFormData({
        supplier_code: "",
        name: "",
        mobile1: "",
        mobile2: "",
        whatsapp1: "",
        whatsapp2: "",
        city: "",
        address: "",
        email: "",
        status: "نشط",
        business_nature: "",
        salesman: "",
        classification: "",
        registration_date: new Date().toISOString().split("T")[0],
        web_username: "",
        web_password: "",
        transaction_notes: "",
        general_notes: "",
        account_id: null,
        father_id: "",
        currency_id: "",
        allow_trans_with_diff_curr: "0",
        iscalc_curr_diff_rates: false,
        level_no: 1,
      })
      return
    }

    setFormData({
      supplier_code: supplier.supplier_code || "",
      name: supplier.name || "",
      mobile1: supplier.mobile1 || "",
      mobile2: supplier.mobile2 || "",
      whatsapp1: supplier.whatsapp1 || "",
      whatsapp2: supplier.whatsapp2 || "",
      city: supplier.city || "",
      address: supplier.address || "",
      email: supplier.email || "",
      status:
        supplier.status === "active" ? "نشط" : supplier.status === "inactive" ? "غير نشط" : supplier.status || "نشط",
      business_nature: supplier.business_nature || "",
      salesman: supplier.salesman || "",
      classification: supplier.classifications || supplier.classification || "",
      registration_date:
        supplier.account_opening_date || supplier.registration_date || new Date().toISOString().split("T")[0],
      web_username: supplier.web_username || "",
      web_password: supplier.web_password || "",
      transaction_notes: supplier.movement_notes || supplier.transaction_notes || "",
      general_notes: supplier.general_notes || "",
      account_id: supplier.account_id ?? null,
      father_id: supplier.father_id ? String(supplier.father_id) : "",
      currency_id: supplier.currency_id ? String(supplier.currency_id) : "",
      allow_trans_with_diff_curr: supplier.allow_trans_with_diff_curr != null ? String(supplier.allow_trans_with_diff_curr) : "0",
      iscalc_curr_diff_rates: Boolean(supplier.iscalc_curr_diff_rates),
      level_no: supplier.level_no ? Number(supplier.level_no) : 1,
    })
  }, [])

  const handleFirst = useCallback(() => {
    console.log("[v0] handleFirst called, suppliers length:", suppliers.length)
    if (suppliers.length > 0) {
      console.log("[v0] Setting index to 0")
      setCurrentIndex(0)
    }
  }, [suppliers])

  const handlePrevious = useCallback(() => {
    console.log("[v0] handlePrevious called, currentIndex:", currentIndex)
    if (suppliers.length > 0 && currentIndex > 0) {
      const newIndex = currentIndex - 1
      console.log("[v0] Setting index to:", newIndex)
      setCurrentIndex(newIndex)
    }
  }, [suppliers, currentIndex])

  const handleNext = useCallback(() => {
    console.log("[v0] handleNext called, currentIndex:", currentIndex, "total:", suppliers.length)
    if (suppliers.length > 0 && currentIndex < suppliers.length - 1) {
      const newIndex = currentIndex + 1
      console.log("[v0] Setting index to:", newIndex)
      setCurrentIndex(newIndex)
    }
  }, [suppliers, currentIndex])

  const handleLast = useCallback(() => {
    console.log("[v0] handleLast called, suppliers length:", suppliers.length)
    if (suppliers.length > 0) {
      const lastIndex = suppliers.length - 1
      console.log("[v0] Setting index to:", lastIndex)
      setCurrentIndex(lastIndex)
    }
  }, [suppliers])

  const updateField = useCallback(
    (field: keyof SupplierFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      if (validationErrors[field]) {
        setValidationErrors((prev) => ({ ...prev, [field]: "" }))
      }
    },
    [validationErrors],
  )

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.supplier_name = "اسم المورد مطلوب"
    }

    if (!formData.mobile1.trim()) {
      errors.mobile1 = "رقم الجوال مطلوب"
    } else if (!/^\d{10}$/.test(formData.mobile1.replace(/\s/g, ""))) {
      errors.mobile1 = "رقم الجوال يجب أن يكون 10 أرقام"
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "البريد الإلكتروني غير صحيح"
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [formData])

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/suppliers")

      if (response.ok) {
        const data = await response.json()
        const suppliersList = Array.isArray(data) ? data : data.suppliers || []
        setSuppliers(suppliersList)

        if (suppliersList.length > 0 && currentIndex >= suppliersList.length) {
          setCurrentIndex(0)
        }
      } else {
        setError("فشل في تحميل بيانات الموردين")
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
      setError("حدث خطأ في تحميل البيانات")
    } finally {
      setLoading(false)
    }
  }, [currentIndex])

  const fetchClassifications = useCallback(async () => {
    try {
      const response = await fetch("/api/item-groups")
      if (response.ok) {
        const data = await response.json()
        setClassifications(data.filter((item: Classification) => item.is_active))
      }
    } catch (error) {
      console.error("Error fetching classifications:", error)
    }
  }, [])

  const fetchSalesmen = useCallback(async () => {
    try {
      // For now, we'll use hardcoded salesmen until we have a proper API
      const hardcodedSalesmen = [
        { id: 1, name: "أحمد محمد", department: "المبيعات", is_active: true },
        { id: 2, name: "محمد علي", department: "المبيعات", is_active: true },
        { id: 3, name: "علي أحمد", department: "المبيعات", is_active: true },
        { id: 4, name: "فاطمة سالم", department: "المبيعات", is_active: true },
        { id: 5, name: "خديجة يوسف", department: "المبيعات", is_active: true },
      ]
      setSalesmen(hardcodedSalesmen)
    } catch (error) {
      console.error("Error fetching salesmen:", error)
    }
  }, [])

  const generateSupplierNumber = useCallback(async () => {
    try {
      setGeneratingNumber(true)
      console.log("[v0] Generating supplier number...")

      const response = await fetch("/api/suppliers/generate-number")
      console.log("[v0] Generate number response status:", response.status)

      if (response.ok) {
        const contentType = response.headers.get("content-type")
        console.log("[v0] Response content type:", contentType)

        if (contentType && contentType.includes("application/json")) {
          const data = await response.json()
          console.log("[v0] Generated supplier number:", data.supplierNumber || data.number)
          updateField("supplier_code", data.supplierNumber || data.number)
        } else {
          const text = await response.text()
          console.error("[v0] Non-JSON response received:", text.substring(0, 200))
          setError("خطأ في الخادم - الرجاء إعادة تحميل الصفحة والمحاولة مرة أخرى")
        }
      } else {
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json()
          console.error("[v0] API error:", errorData)
          setError(errorData.error || "فشل في توليد رقم المورد")
        } else {
          const text = await response.text()
          console.error("[v0] Non-JSON error response:", text.substring(0, 200))
          setError("خطأ في الخادم - الرجاء التحقق من اتصال قاعدة البيانات")
        }
      }
    } catch (error) {
      console.error("Error generating supplier number:", error)
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        setError("خطأ في تحليل استجابة الخادم - الرجاء إعادة تحميل الصفحة")
      } else {
        setError("خطأ في الاتصال بالخادم")
      }
    } finally {
      setGeneratingNumber(false)
    }
  }, [updateField])

  const handleSaveSupplier = useCallback(
    async (supplierData: SupplierFormData) => {
      if (!validateForm()) return

      try {
        setSaving(true)
        setError(null)

        const url = editingSupplier && currentSupplier ? `/api/suppliers/${currentSupplier.id}` : "/api/suppliers"
        const method = editingSupplier && currentSupplier ? "PUT" : "POST"

        const dataToSend = {
          supplier_code: supplierData.supplier_code,
          name: supplierData.name,
          mobile1: supplierData.mobile1,
          mobile2: supplierData.mobile2,
          whatsapp1: supplierData.whatsapp1,
          whatsapp2: supplierData.whatsapp2,
          city: supplierData.city,
          address: supplierData.address,
          email: supplierData.email,
          status: supplierData.status,
          business_nature: supplierData.business_nature,
          salesman: supplierData.salesman,
          classification: supplierData.classification, // Note: API expects 'classifications'
          account_opening_date: supplierData.registration_date,
          movement_notes: supplierData.transaction_notes,
          general_notes: supplierData.general_notes,
          account_id: supplierData.account_id,
          currency_id: supplierData.currency_id,
          allow_trans_with_diff_curr: supplierData.allow_trans_with_diff_curr,
          iscalc_curr_diff_rates: supplierData.iscalc_curr_diff_rates,
          father_id: supplierData.father_id,
          level_no: supplierData.father_id ? undefined : 1,
        }

        console.log("[v0] Sending supplier data:", dataToSend)

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSend),
        })

        if (response.ok) {
          const savedSupplier = await response.json()
          console.log("[v0] Supplier saved successfully:", savedSupplier)

          setShowSuccessMessage(true)
          setTimeout(() => setShowSuccessMessage(false), 3000)

          await fetchSuppliers()

          // If editing, find and set the updated supplier as current
          if (editingSupplier && savedSupplier) {
            const updatedIndex = suppliers.findIndex((s) => s.id === savedSupplier.id)
            if (updatedIndex !== -1) {
              setCurrentIndex(updatedIndex)
            }
          }

          setShowSupplierDialog(false)
          setEditingSupplier(false)
        } else {
          const errorData = await response.json()
          console.error("[v0] Save error:", errorData)
          setError(errorData.error || errorData.message || "فشل في حفظ البيانات")
        }
      } catch (error) {
        console.error("[v0] Error saving supplier:", error)
        setError("حدث خطأ في حفظ البيانات")
      } finally {
        setSaving(false)
      }
    },
    [validateForm, editingSupplier, currentSupplier, fetchSuppliers, suppliers],
  )

  const handleDeleteSupplier = useCallback(
    async (supplierId: number) => {
      if (!confirm("هل أنت متأكد من حذف هذا المورد؟")) return

      try {
        const response = await fetch(`/api/suppliers/${supplierId}`, {
          method: "DELETE",
        })

        if (response.ok) {
          await fetchSuppliers()
          if (currentIndex >= suppliers.length - 1 && currentIndex > 0) {
            setCurrentIndex(currentIndex - 1)
          }
        } else {
          setError("فشل في حذف المورد")
        }
      } catch (error) {
        console.error("Error deleting supplier:", error)
        setError("حدث خطأ في حذف المورد")
      }
    },
    [currentIndex, suppliers.length, fetchSuppliers],
  )

  const handleNewSupplier = useCallback(() => {
    updateFormData(null)
    setEditingSupplier(false)
    setValidationErrors({})
    setShowSupplierDialog(true)
    generateSupplierNumber()
  }, [updateFormData, generateSupplierNumber])

  const handleEditSupplier = useCallback(
    (supplier: Supplier) => {
      updateFormData(supplier)
      setEditingSupplier(true)
      setValidationErrors({})
      setShowSupplierDialog(true)
    },
    [updateFormData],
  )

  const statistics = useMemo(() => {
    const totalSuppliers = suppliers.length
    const activeSuppliers = suppliers.filter((s) => s.status === "نشط" || s.status === "active").length
    const inactiveSuppliers = suppliers.filter((s) => s.status === "غير نشط" || s.status === "inactive").length
    const newThisMonth = suppliers.filter((s) => {
      const accountDate = new Date(
        s.account_opening_date ?? s.registration_date ?? new Date().toISOString()
      );
      const now = new Date()
      return accountDate.getMonth() === now.getMonth() && accountDate.getFullYear() === now.getFullYear()
    }).length

    return {
      total: totalSuppliers,
      active: activeSuppliers,
      inactive: inactiveSuppliers,
      newThisMonth: newThisMonth,
    }
  }, [suppliers])

  useEffect(() => {
    fetchSuppliers()
    fetchClassifications()
    fetchSalesmen()
  }, [fetchSuppliers, fetchClassifications, fetchSalesmen])

  useEffect(() => {
    console.log("[v0] Current supplier changed:", currentSupplier)
    if (currentSupplier) {
      updateFormData(currentSupplier)
    }
  }, [currentSupplier, updateFormData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4" />
          تم حفظ البيانات بنجاح
        </div>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">إدارة الموردين</h1>
        <div className="flex gap-2">
          <Button onClick={handleNewSupplier} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            مورد جديد
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 bg-transparent"
          >
            <Upload className="h-4 w-4" />
            استيراد من Excel
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">إجمالي الموردين</p>
                <p className="text-3xl font-bold text-blue-900">{statistics.total}</p>
              </div>
              <div className="h-10 w-10 bg-blue-200 rounded-full flex items-center justify-center">
                <span className="text-blue-700 text-lg font-bold">{statistics.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">الموردين النشطين</p>
                <p className="text-3xl font-bold text-green-900">{statistics.active}</p>
              </div>
              <div className="h-10 w-10 bg-green-200 rounded-full flex items-center justify-center">
                <span className="text-green-700 text-lg font-bold">{statistics.active}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">الموردين غير النشطين</p>
                <p className="text-3xl font-bold text-red-900">{statistics.inactive}</p>
              </div>
              <div className="h-10 w-10 bg-red-200 rounded-full flex items-center justify-center">
                <span className="text-red-700 text-lg font-bold">{statistics.inactive}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700">جدد هذا الشهر</p>
                <p className="text-3xl font-bold text-purple-900">{statistics.newThisMonth}</p>
              </div>
              <div className="h-10 w-10 bg-purple-200 rounded-full flex items-center justify-center">
                <span className="text-purple-700 text-lg font-bold">₪</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث المتقدم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search-name">اسم المورد</Label>
              <Input
                id="search-name"
                value={searchFilters.name}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, name: e.target.value }))}
                className="text-right"
                placeholder="ابحث بالاسم..."
              />
            </div>
            <div>
              <Label htmlFor="search-city">المدينة</Label>
              <Select
                value={searchFilters.city}
                onValueChange={(value) => setSearchFilters((prev) => ({ ...prev, city: value === "all" ? "" : value }))}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر المدينة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المدن</SelectItem>
                  <SelectItem value="الرياض">الرياض</SelectItem>
                  <SelectItem value="جدة">جدة</SelectItem>
                  <SelectItem value="الدمام">الدمام</SelectItem>
                  <SelectItem value="مكة المكرمة">مكة المكرمة</SelectItem>
                  <SelectItem value="المدينة المنورة">المدينة المنورة</SelectItem>
                  <SelectItem value="الطائف">الطائف</SelectItem>
                  <SelectItem value="تبوك">تبوك</SelectItem>
                  <SelectItem value="بريدة">بريدة</SelectItem>
                  <SelectItem value="خميس مشيط">خميس مشيط</SelectItem>
                  <SelectItem value="حائل">حائل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="search-status">الحالة</Label>
              <Select
                value={searchFilters.status}
                onValueChange={(value) =>
                  setSearchFilters((prev) => ({ ...prev, status: value === "all" ? "" : value }))
                }
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="نشط">نشط</SelectItem>
                  <SelectItem value="غير نشط">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="search-salesman">المندوب</Label>
              <Select
                value={searchFilters.salesman}
                onValueChange={(value) =>
                  setSearchFilters((prev) => ({ ...prev, salesman: value === "all" ? "" : value }))
                }
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر المندوب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المندوبين</SelectItem>
                  {salesmen.map((salesman) => (
                    <SelectItem key={salesman.id} value={salesman.name}>
                      {salesman.name}
                    </SelectItem>
                  ))}
                  {/* Fallback options if no salesmen loaded */}
                  {salesmen.length === 0 && (
                    <>
                      <SelectItem value="أحمد">أحمد</SelectItem>
                      <SelectItem value="محمد">محمد</SelectItem>
                      <SelectItem value="علي">علي</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الموردين ({filteredSuppliers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-right">رقم المورد</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">اسم المورد</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">الجوال</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">المدينة</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">الحالة</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">{supplier.supplier_code}</td>
                    <td className="border border-gray-300 px-4 py-2">{supplier.name}</td>
                    <td className="border border-gray-300 px-4 py-2">{supplier.mobile1}</td>
                    <td className="border border-gray-300 px-4 py-2">{supplier.city}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <Badge
                        variant={supplier.status === "نشط" || supplier.status === "active" ? "default" : "secondary"}
                      >
                        {supplier.status === "active"
                          ? "نشط"
                          : supplier.status === "inactive"
                            ? "غير نشط"
                            : supplier.status}
                      </Badge>
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      <div className="flex justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditSupplier(supplier)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteSupplier(supplier.id)}>
                          <Trash2 className="h-4 w-4" />
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

      {/* Supplier Form Dialog */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden p-0" dir="rtl">
          <div className="h-screen flex flex-col bg-background">
            {/* Universal Toolbar - Fixed at top */}
            <div className="flex-shrink-0">
              <UniversalToolbar
                onFirst={handleFirst}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onLast={handleLast}
                onNew={handleNewSupplier}
                onSave={() => handleSaveSupplier(formData)}
                onDelete={currentSupplier ? () => handleDeleteSupplier(currentSupplier.id) : undefined}
                currentRecord={currentIndex + 1}
                totalRecords={suppliers.length}
                isFirstRecord={currentIndex === 0}
                isLastRecord={currentIndex === suppliers.length - 1}
                isSaving={saving}
                onReport={() => console.log("Generate supplier report")}
                onExportExcel={() => console.log("Export to Excel")}
                onPrint={() => console.log("Print supplier")}
                canSave={true}
                canDelete={!!currentSupplier}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                      <Plus className="h-7 w-7 text-primary" />
                      {editingSupplier ? "تعديل المورد" : "مورد جديد"}
                    </h1>
                    <p className="text-muted-foreground mt-1">جميع بيانات المورد في شاشة واحدة مضغوطة</p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveSupplier(formData)
                  }}
                  className="space-y-6"
                >
                  {/* المعلومات الأساسية والتعريف */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="h-5 w-5 text-primary" />
                        المعلومات الأساسية والتعريف
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* الصف الأول: الأكواد والتعريف */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <Label htmlFor="supplier_code" className="text-sm font-medium">
                            رقم المورد *
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="supplier_code"
                              value={formData.supplier_code}
                              onChange={(e) => updateField("supplier_code", e.target.value)}
                              className="text-right"
                              placeholder="رقم المورد"
                              readOnly
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={generateSupplierNumber}
                              disabled={generatingNumber}
                              size="sm"
                            >
                              {generatingNumber ? "..." : "توليد"}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="status" className="text-sm font-medium">
                            حالة المورد
                          </Label>
                          <Select value={formData.status} onValueChange={(value) => updateField("status", value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="نشط">نشط</SelectItem>
                              <SelectItem value="غير نشط">غير نشط</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="classification" className="text-sm font-medium">
                            التصنيف
                          </Label>
                          <Select
                            value={formData.classification}
                            onValueChange={(value) => updateField("classification", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر التصنيف" />
                            </SelectTrigger>
                            <SelectContent>
                              {classifications.map((classification) => (
                                <SelectItem key={classification.id} value={classification.group_name}>
                                  {classification.group_name}
                                </SelectItem>
                              ))}
                              {/* Fallback options if no classifications loaded */}
                              {classifications.length === 0 && (
                                <>
                                  <SelectItem value="مورد رئيسي">مورد رئيسي</SelectItem>
                                  <SelectItem value="مورد ثانوي">مورد ثانوي</SelectItem>
                                  <SelectItem value="مورد محلي">مورد محلي</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="registration_date" className="text-sm font-medium">
                            تاريخ التسجيل
                          </Label>
                          <Input
                            id="registration_date"
                            type="date"
                            value={formData.registration_date}
                            onChange={(e) => updateField("registration_date", e.target.value)}
                            className="text-right"
                          />
                        </div>
                      </div>

                      {/* الصف الثاني: الاسم */}
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <Label htmlFor="supplier_name" className="text-sm font-medium">
                            اسم المورد *
                          </Label>
                          <Input
                            id="supplier_name"
                            value={formData.name}
                            onChange={(e) => updateField("name", e.target.value)}
                            className={`text-right ${validationErrors.supplier_name ? "border-red-500" : ""}`}
                            placeholder="أدخل اسم المورد"
                            required
                          />
                          {validationErrors.supplier_name && (
                            <p className="text-red-500 text-xs mt-1">{validationErrors.supplier_name}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* معلومات الاتصال */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="h-5 w-5 text-primary" />
                        معلومات الاتصال
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <Label htmlFor="mobile1" className="text-sm font-medium">
                            الجوال الأول *
                          </Label>
                          <Input
                            id="mobile1"
                            value={formData.mobile1}
                            onChange={(e) => updateField("mobile1", e.target.value)}
                            className={`text-right ${validationErrors.mobile1 ? "border-red-500" : ""}`}
                            placeholder="رقم الجوال الأول"
                            required
                          />
                          {validationErrors.mobile1 && (
                            <p className="text-red-500 text-xs mt-1">{validationErrors.mobile1}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="mobile2" className="text-sm font-medium">
                            الجوال الثاني
                          </Label>
                          <Input
                            id="mobile2"
                            value={formData.mobile2}
                            onChange={(e) => updateField("mobile2", e.target.value)}
                            className="text-right"
                            placeholder="رقم الجوال الثاني"
                          />
                        </div>
                        <div>
                          <Label htmlFor="whatsapp1" className="text-sm font-medium">
                            واتساب الأول
                          </Label>
                          <Input
                            id="whatsapp1"
                            value={formData.whatsapp1}
                            onChange={(e) => updateField("whatsapp1", e.target.value)}
                            className="text-right"
                            placeholder="رقم واتساب الأول"
                          />
                        </div>
                        <div>
                          <Label htmlFor="whatsapp2" className="text-sm font-medium">
                            واتساب الثاني
                          </Label>
                          <Input
                            id="whatsapp2"
                            value={formData.whatsapp2}
                            onChange={(e) => updateField("whatsapp2", e.target.value)}
                            className="text-right"
                            placeholder="رقم واتساب الثاني"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 mt-4">
                        <div>
                          <Label htmlFor="email" className="text-sm font-medium">
                            البريد الإلكتروني
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => updateField("email", e.target.value)}
                            className={`text-right ${validationErrors.email ? "border-red-500" : ""}`}
                            placeholder="البريد الإلكتروني"
                          />
                          {validationErrors.email && (
                            <p className="text-red-500 text-xs mt-1">{validationErrors.email}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* العنوان والموقع */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="h-5 w-5 text-primary" />
                        العنوان والموقع
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="city" className="text-sm font-medium">
                            المدينة
                          </Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => updateField("city", e.target.value)}
                            className="text-right"
                            placeholder="المدينة"
                          />
                        </div>
                        <div>
                          <Label htmlFor="address" className="text-sm font-medium">
                            العنوان التفصيلي
                          </Label>
                          <Input
                            id="address"
                            value={formData.address}
                            onChange={(e) => updateField("address", e.target.value)}
                            className="text-right"
                            placeholder="العنوان التفصيلي"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* معلومات العمل والمبيعات */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="h-5 w-5 text-primary" />
                        معلومات العمل والمبيعات
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="business_nature" className="text-sm font-medium">
                            طبيعة العمل
                          </Label>
                          <Input
                            id="business_nature"
                            value={formData.business_nature}
                            onChange={(e) => updateField("business_nature", e.target.value)}
                            className="text-right"
                            placeholder="طبيعة العمل"
                          />
                        </div>
                        <div>
                          <Label htmlFor="salesman" className="text-sm font-medium">
                            المندوب
                          </Label>
                          <Select value={formData.salesman} onValueChange={(value) => updateField("salesman", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="اختر المندوب" />
                            </SelectTrigger>
                            <SelectContent>
                              {salesmen.map((salesman) => (
                                <SelectItem key={salesman.id} value={salesman.name}>
                                  {salesman.name}
                                </SelectItem>
                              ))}
                              {/* Fallback options if no salesmen loaded */}
                              {salesmen.length === 0 && (
                                <>
                                  <SelectItem value="أحمد">أحمد</SelectItem>
                                  <SelectItem value="محمد">محمد</SelectItem>
                                  <SelectItem value="علي">علي</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* بيانات الموقع الإلكتروني */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="h-5 w-5 text-primary" />
                        بيانات الموقع الإلكتروني
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="web_username" className="text-sm font-medium">
                            اسم المستخدم للموقع
                          </Label>
                          <Input
                            id="web_username"
                            value={formData.web_username}
                            onChange={(e) => updateField("web_username", e.target.value)}
                            className="text-right"
                            placeholder="اسم المستخدم"
                          />
                        </div>
                        <div>
                          <Label htmlFor="web_password" className="text-sm font-medium">
                            كلمة المرور للموقع
                          </Label>
                          <Input
                            id="web_password"
                            type="password"
                            value={formData.web_password}
                            onChange={(e) => updateField("web_password", e.target.value)}
                            className="text-right"
                            placeholder="كلمة المرور"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ملاحظات وتفاصيل إضافية */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">ملاحظات وتفاصيل إضافية</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="transaction_notes" className="text-sm font-medium">
                          ملاحظات الحركة
                        </Label>
                        <Textarea
                          id="transaction_notes"
                          value={formData.transaction_notes}
                          onChange={(e) => updateField("transaction_notes", e.target.value)}
                          className="text-right"
                          placeholder="ملاحظات خاصة بالحركة المالية"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="general_notes" className="text-sm font-medium">
                          الملاحظات العامة
                        </Label>
                        <Textarea
                          id="general_notes"
                          value={formData.general_notes}
                          onChange={(e) => updateField("general_notes", e.target.value)}
                          className="text-right"
                          placeholder="ملاحظات عامة"
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* أزرار الحفظ والإلغاء */}
                  <div className="flex gap-4 justify-end border-t pt-6 pb-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSupplierDialog(false)}
                      disabled={saving}
                      className="min-w-[120px] bg-transparent"
                    >
                      <X className="h-4 w-4 mr-2" />
                      إلغاء
                    </Button>
                    <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 min-w-[120px]">
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "جاري الحفظ..." : "حفظ المورد"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <ExcelImport
        entityType="suppliers"
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          fetchSuppliers()
          setShowImportDialog(false)
        }}
      />
    </div>
  )
}
