"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, CheckCircle, X, Package, AlertTriangle, Warehouse } from "lucide-react"
import { Toast } from "primereact/toast"
import { CompactServiceForm } from "./compact-service-form"
import Util from "@/components/common/Util"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

interface Product {
  id: number
  product_code: string
  product_name: string
  name_en?: string
  barcode?: string
  description?: string
  category: string
  subcategory?: string
  brand?: string
  model?: string
  main_unit: string
  secondary_unit?: string
  conversion_factor?: number
  last_purchase_price: number
  average_cost?: number
  selling_price?: number
  wholesale_price?: number
  retail_price?: number
  currency: string
  tax_rate?: number
  discount_rate?: number
  min_stock_level?: number
  max_stock_level?: number
  reorder_point?: number
  current_stock: number
  reserved_stock?: number
  available_stock?: number
  location?: string
  shelf_life?: number
  expiry_tracking: boolean
  batch_tracking: boolean
  serial_tracking: boolean
  status: string
  supplier_id?: number
  supplier_name?: string
  supplier_code?: string
  manufacturer?: string
  country_of_origin?: string
  weight?: number
  dimensions?: string
  color?: string
  size?: string
  material?: string
  warranty_period?: number
  image_url?: string
  notes?: string
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

interface ProductFormData {
  product_code: string
  product_name: string
  name_en: string
  barcode: string
  description: string
  category: string
  subcategory: string
  brand: string
  model: string
  main_unit: string
  secondary_unit: string
  conversion_factor: number
  last_purchase_price: number
  average_cost: number
  selling_price: number
  wholesale_price: number
  retail_price: number
  currency: string
  tax_rate: number
  discount_rate: number
  min_stock_level: number
  max_stock_level: number
  reorder_point: number
  location: string
  shelf_life: number
  expiry_tracking: boolean
  batch_tracking: boolean
  serial_tracking: boolean
  status: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
  manufacturer: string
  country_of_origin: string
  weight: number
  dimensions: string
  color: string
  size: string
  material: string
  warranty_period: number
  image_url: string
  notes: string
}

const initialFormData: ProductFormData = {
  product_code: "",
  product_name: "",
  name_en: "",
  barcode: "",
  description: "",
  category: "",
  subcategory: "",
  brand: "",
  model: "",
  main_unit: "قطعة",
  secondary_unit: "",
  conversion_factor: 1,
  last_purchase_price: 0,
  average_cost: 0,
  selling_price: 0,
  wholesale_price: 0,
  retail_price: 0,
  currency: "ريال سعودي",
  tax_rate: 15,
  discount_rate: 0,
  min_stock_level: 0,
  max_stock_level: 0,
  reorder_point: 0,
  location: "",
  shelf_life: 0,
  expiry_tracking: false,
  batch_tracking: false,
  serial_tracking: false,
  status: "نشط",
  supplier_id: "",
  supplier_name: "",
  supplier_code: "",
  manufacturer: "",
  country_of_origin: "",
  weight: 0,
  dimensions: "",
  color: "",
  size: "",
  material: "",
  warranty_period: 0,
  image_url: "",
  notes: "",
}

export function Services() {
  const [state, setState] = useState({
    products: [] as Product[],
    categories: [] as string[],
    loading: true,
    error: null as string | null,
    showDialog: false,
    editingProduct: null as Product | null,
    isSubmitting: false,
    currentPage: 1,
    itemsPerPage: 10,
    filters: {
      search: "",
      category: "all",
      status: "all",
    },
    formData: initialFormData,
    successMessage: null as string | null,
    confirmDialogVisible: false,
    pendingFreezeProduct: null as Product | null,
  })
  const toast = useRef<Toast>(null)

  const serviceStats = useMemo(() => {
    const totalServices = state.products.length
    const activeServices = state.products.filter((product) => {
      const status = String(product.status ?? "")
      return status === "نشط" || status === "1" || status === "active" || status === "ACTIVE"
    }).length
    const inactiveServices = totalServices - activeServices

    return { totalServices, activeServices, inactiveServices }
  }, [state.products])

  const normalizedServiceStatus = (status: string | number | undefined) => {
    const normalized = String(status ?? "")
    if (normalized === "1" || normalized === "نشط" || normalized.toLowerCase() === "active") {
      return "نشط"
    }
    if (normalized === "2" || normalized === "غير نشط" || normalized.toLowerCase() === "inactive") {
      return "غير نشط"
    }
    return normalized || "نشط"
  }

  const filteredProducts = useMemo(() => {
    return state.products.filter((product) => {
      const statusLabel = normalizedServiceStatus(product.status)
      if (
        state.filters.search &&
        !product.product_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !product.product_code?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !product.barcode?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (state.filters.category !== "all" && product.category !== state.filters.category) {
        return false
      }
      if (state.filters.status !== "all" && statusLabel !== state.filters.status) {
        return false
      }
      return true
    })
  }, [state.products, state.filters])

  const paginatedProducts = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.itemsPerPage
    return filteredProducts.slice(startIndex, startIndex + state.itemsPerPage)
  }, [filteredProducts, state.currentPage, state.itemsPerPage])

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/inventory/products?type=services")
      const data = await response.json()
      if (!response.ok) {
        const errorMessage = data?.error || "فشل في تحميل الخدمات"
        throw new Error(errorMessage)
      }
      setState((prev) => ({ ...prev, products: Array.isArray(data) ? data : [] }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        products: [],
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  const handleEditProduct = (product: Product) => {
    setState((prev) => ({
      ...prev,
      editingProduct: product,
      showDialog: true,
      formData: {
        product_code: product.product_code || "",
        product_name: product.product_name || "",
        name_en: product.name_en || "",
        barcode: product.barcode || "",
        description: product.description || "",
        category: product.category || "",
        subcategory: product.subcategory || "",
        brand: product.brand || "",
        model: product.model || "",
        main_unit: product.main_unit || "قطعة",
        secondary_unit: product.secondary_unit || "",
        conversion_factor: product.conversion_factor || 1,
        last_purchase_price: product.last_purchase_price || 0,
        average_cost: product.average_cost || 0,
        selling_price: product.selling_price || 0,
        wholesale_price: product.wholesale_price || 0,
        retail_price: product.retail_price || 0,
        currency: product.currency || "ريال سعودي",
        tax_rate: product.tax_rate || 15,
        discount_rate: product.discount_rate || 0,
        min_stock_level: product.min_stock_level || 0,
        max_stock_level: product.max_stock_level || 0,
        reorder_point: product.reorder_point || 0,
        location: product.location || "",
        shelf_life: product.shelf_life || 0,
        expiry_tracking: product.expiry_tracking || false,
        batch_tracking: product.batch_tracking || false,
        serial_tracking: product.serial_tracking || false,
        status: product.status || "نشط",
        supplier_id: product.supplier_id?.toString() || "",
        supplier_name: product.supplier_name || "",
        supplier_code: product.supplier_code || "",
        manufacturer: product.manufacturer || "",
        country_of_origin: product.country_of_origin || "",
        weight: product.weight || 0,
        dimensions: product.dimensions || "",
        color: product.color || "",
        size: product.size || "",
        material: product.material || "",
        warranty_period: product.warranty_period || 0,
        image_url: product.image_url || "",
        notes: product.notes || "",
      },
    }))
  }

  const handleToggleFreeze = (product: Product) => {
    setState((prev) => ({
      ...prev,
      pendingFreezeProduct: product,
      confirmDialogVisible: true,
    }))
  }

  const confirmFreezeToggle = async () => {
    const product = state.pendingFreezeProduct
    if (!product) return

    const currentStatus = product.status
    const isCurrentlyInactive = currentStatus === "غير نشط" || currentStatus === 2 || currentStatus === "2"
    const nextStatus = isCurrentlyInactive ? 1 : 2

    try {
      setState((prev) => ({ ...prev, isSubmitting: true, error: null, confirmDialogVisible: false, pendingFreezeProduct: null }))

      const response = await fetch("/api/inventory/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, status: nextStatus }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "فشل في تغيير حالة الخدمة")
      }

      setState((prev) => ({
        ...prev,
        products: prev.products.map((item) =>
          item.id === product.id ? { ...item, status: nextStatus } : item,
        ),
      }))
      toast.current?.show({
        severity: "success",
        summary: "تم الحفظ",
        detail: isCurrentlyInactive ? "تم إلغاء التجميد" : "تم التجميد",
        life: 3000,
      })
    } catch (err) {
      console.error("[Services] Toggle freeze error:", err)
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : "حدث خطأ أثناء تغيير الحالة" }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const cancelFreezeToggle = () => {
    setState((prev) => ({
      ...prev,
      confirmDialogVisible: false,
      pendingFreezeProduct: null,
    }))
  }

  if (!Util.checkUserAccess(10)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-red-600">لا يوجد صلاحية</h2>
          <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى الخدمات</p>
        </div>
      </div>
    )
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الخدمات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 lg:p-6 bg-background min-h-screen" dir="rtl">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setState((prev) => ({ ...prev, error: null }))}>
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}
      <Toast ref={toast} position="top-left" className="custom-toast" />
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{state.successMessage}</AlertDescription>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setState((prev) => ({ ...prev, successMessage: null }))}>
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">إدارة الخدمات</h1>
          <p className="text-muted-foreground mt-1">إدارة الخدمات المتاحة في النظام</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setState((prev) => ({
              ...prev,
              showDialog: true,
              editingProduct: null,
              formData: initialFormData,
              error: null,
              successMessage: null,
            }))}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="ml-2 h-4 w-4" />
            خدمة جديدة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">إجمالي الخدمات</p>
                <p className="text-2xl font-bold text-blue-900">{serviceStats.totalServices}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">الخدمات النشطة</p>
                <p className="text-2xl font-bold text-green-900">{serviceStats.activeServices}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-700">الخدمات غير النشطة</p>
                <p className="text-2xl font-bold text-orange-900">{serviceStats.inactiveServices}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الخدمات</CardTitle>
          <CardDescription>عرض {paginatedProducts.length} من أصل {filteredProducts.length} خدمة</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div>
              <Label>البحث</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="اسم الخدمة أو رمز الخدمة"
                  value={state.filters.search}
                  onChange={(e) => setState((prev) => ({ ...prev, filters: { ...prev.filters, search: e.target.value }, currentPage: 1 }))}
                  className="pr-10"
                />
              </div>
            </div>
            <div>
              <Label>الحالة</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) => setState((prev) => ({ ...prev, filters: { ...prev.filters, status: value }, currentPage: 1 }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="نشط">نشط</SelectItem>
                  <SelectItem value="غير نشط">غير نشط</SelectItem>
                  <SelectItem value="متوقف">متوقف</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الخدمات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right">
              <thead>
                <tr>
                  <th className="py-3 px-2">رمز الخدمة</th>
                  <th className="py-3 px-2">اسم الخدمة</th>
                  <th className="py-3 px-2">التصنيف</th>
                  <th className="py-3 px-2">أخر سعر شراء</th>
                  <th className="py-3 px-2">الحالة</th>
                  <th className="py-3 px-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product) => (
                  <tr key={product.id} className="border-t border-slate-200">
                    <td className="py-3 px-2">{product.product_code}</td>
                    <td className="py-3 px-2 font-medium">{product.product_name}</td>
                    <td className="py-3 px-2">{product.category}</td>
                    <td className="py-3 px-2">{product.last_purchase_price?.toLocaleString()}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${normalizedServiceStatus(product.status) === "نشط" ? "bg-green-500" : "bg-gray-400"}`} />
                        <Badge className={normalizedServiceStatus(product.status) === "نشط" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {normalizedServiceStatus(product.status)}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditProduct(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleFreeze(product)}
                          title={product.status === "غير نشط" ? "إلغاء التجميد" : "تجميد"}
                        >
                          <Warehouse className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginatedProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">لا توجد خدمات مطابقة لبحثك.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialogYesNo
        visible={state.confirmDialogVisible}
        message={state.pendingFreezeProduct
          ? (state.pendingFreezeProduct.status === "غير نشط" || state.pendingFreezeProduct.status === 2 || state.pendingFreezeProduct.status === "2"
            ? `هل تريد إلغاء التجميد للخدمة "${state.pendingFreezeProduct.product_name}"؟`
            : `هل تريد تجميد الخدمة "${state.pendingFreezeProduct.product_name}"؟`)
          : "هل أنت متأكد؟"}
        onConfirm={confirmFreezeToggle}
        onCancel={cancelFreezeToggle}
        isCompact
      />

      <Dialog open={state.showDialog} onOpenChange={(open) => setState((prev) => ({ ...prev, showDialog: open, error: null, ...(open ? {} : { editingProduct: null, formData: initialFormData }) }))}>
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[95vh] overflow-hidden p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <CompactServiceForm
            visible={state.showDialog}
            editingProduct={state.editingProduct}
            onHideDialog={(close) => { if (close) { setState((prev) => ({ ...prev, showDialog: false, error: null, editingProduct: null, formData: initialFormData })) } }}
            onSuccess={() => {
              fetchProducts()
              setState((prev) => ({ ...prev, error: null, editingProduct: null, formData: initialFormData }))
            }}
            isSubmitting={state.isSubmitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
