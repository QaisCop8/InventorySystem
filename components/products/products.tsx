"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit,
  Eye,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Barcode,
  DollarSign,
  X,
  AlertCircle,
  FileSpreadsheet,
  Warehouse,
} from "lucide-react"
import { CompactProductForm } from "./compact-product-form"
import { ExcelImportDialog } from "./excel-import-dialog"
import { InitialQuantitiesDialog } from "./initial-quantities-dialog"
import { BatchPrintDialog } from "@/components/inventory/batch-print-dialog"
import { useAuth } from "../auth/auth-context"
import { Toast } from "primereact/toast"
import Definitions from "../settings/definitions"
import Util from "../common/Util"

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
  default_store?: number | null
  default_store_name?: string | null
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

interface ProductsProps {
  entityType?: "products" | "services"
}

export function Products({ entityType = "products" }: ProductsProps) {
  const isService = entityType === "services"
  const [state, setState] = useState({
    products: [] as Product[],
    categories: [] as Array<{ id: number; name: string }>,
    units: [] as Array<{ id: number; unit_name: string; unit_code: string }>, // Added units from API
    warehouses: [] as Array<{ id: number; warehouse_name: string }>,
    suppliers: [] as Array<{ id: number; name: string }>,
    loading: true,
    error: null as string | null,
    showDialog: false,
    editingProduct: null as Product | null,
    isSubmitting: false,
    currentRecord: 1,
    selectedProductIndex: 0,
    currentPage: 1,
    itemsPerPage: 10,
    filters: {
      search: "",
      category: "all",
      status: "all",
      stockLevel: "all",
    },
    formData: initialFormData,
    successMessage: null as string | null,
    showExcelImport: false,
    showInitialQuantities: false,
    selectedProductForQuantities: null as Product | null,
  })
  const toast = useRef<Toast>(null);
  const currencies = ["ريال سعودي", "دولار أمريكي", "يورو", "شيكل إسرائيلي"]

  const countries = [
    "السعودية",
    "الإمارات",
    "الكويت",
    "قطر",
    "البحرين",
    "عمان",
    "الأردن",
    "لبنان",
    "سوريا",
    "العراق",
    "مصر",
    "المغرب",
    "تونس",
    "الجزائر",
    "أخرى",
  ]

  const filteredProducts = useMemo(() => {
    return state.products.filter((product) => {
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
      if (state.filters.status !== "all" && product.status !== state.filters.status) {
        return false
      }
      if (state.filters.stockLevel !== "all") {
        if (state.filters.stockLevel === "low" && product.current_stock > (product.min_stock_level || 0)) {
          return false
        }
        if (state.filters.stockLevel === "out" && product.current_stock > 0) {
          return false
        }
      }
      return true
    })
  }, [state.products, state.filters])

  const paginatedProducts = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.itemsPerPage
    return filteredProducts.slice(startIndex, startIndex + state.itemsPerPage)
  }, [filteredProducts, state.currentPage, state.itemsPerPage])

  const totalPages = Math.ceil(filteredProducts.length / state.itemsPerPage)

  const statistics = useMemo(() => {
    const totalProducts = state.products.length
    const activeProducts = state.products.filter((p) => p.status === "نشط").length
    const lowStockProducts = state.products.filter((p) => p.current_stock <= (p.min_stock_level || 0)).length
    const outOfStockProducts = state.products.filter((p) => p.current_stock === 0).length
    const totalValue = state.products.reduce((sum, p) => sum + p.current_stock * p.last_purchase_price, 0)

    return { totalProducts, activeProducts, lowStockProducts, outOfStockProducts, totalValue }
  }, [state.products])

  useEffect(() => {
    fetchProducts()
    fetchDefinitions()
  }, [])

  const fetchProducts = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/inventory/products")
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const errorMessage = data?.error || "فشل في تحميل المنتجات"
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

  const fetchDefinitions = async () => {
    try {
      const categoriesResponse = await fetch("/api/item-groups")
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        setState((prev) => ({ ...prev, categories: categoriesData }))
      }

      const suppliersResponse = await fetch("/api/suppliers")
      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        setState((prev) => ({ ...prev, suppliers: suppliersData }))
      }

      const unitsResponse = await fetch("/api/units")
      if (unitsResponse.ok) {
        const unitsData = await unitsResponse.json()
        setState((prev) => ({ ...prev, units: unitsData }))
      }

      const warehousesResponse = await fetch("/api/warehouses")
      if (warehousesResponse.ok) {
        const warehousesData = await warehousesResponse.json()
        setState((prev) => ({ ...prev, warehouses: warehousesData }))
      }
    } catch (error) {
      console.error("[v0] Error fetching definitions:", error)
    }
  }

  const handleSaveProduct = async (formData: any) => {
    try {
      setState((prev) => ({ ...prev, isSubmitting: true, error: null, successMessage: null }))

      const method = state.editingProduct ? "PUT" : "POST"
      const url = "/api/inventory/products"

      const requestData = state.editingProduct ? { id: state.editingProduct.id, ...formData } : formData

      console.log("[v0] Saving product with data:", requestData)

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      })

      const responseData = await response.json()
      console.log("[v0] API response:", responseData)

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(responseData.error || "رقم الصنف موجود مسبقاً")
        }
        throw new Error(responseData.error || "فشل في حفظ المنتج")
      }

      await fetchProducts()

      const successMsg = responseData.isUpdate ? "تم تحديث المنتج بنجاح" : "تم إنشاء المنتج بنجاح"

      setState((prev) => ({
        ...prev,
        showDialog: true,
        editingProduct: null,
        formData: initialFormData,
        successMessage: successMsg,
      }))

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 3000)
    } catch (err) {
      console.error("[v0] Error saving product:", err)
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ",
      }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleDelete = async (id: number) => {
    const product = filteredProducts.find((p) => p.id === id)
    if (!product) return

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف المنتج "${product.product_name}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`,
    )

    if (!confirmed) return

    try {
      console.log("[v0] Attempting to delete product with ID:", id)
      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      const response = await fetch(`/api/inventory/products?id=${id}`, {
        method: "DELETE",
      })

      console.log("[v0] Delete response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[v0] Delete error response:", errorData)
        throw new Error(errorData.error || "فشل في حذف المنتج")
      }

      const responseData = await response.json()
      console.log("[v0] Delete success response:", responseData)

      await fetchProducts()
      setState((prev) => ({
        ...prev,
        selectedProductIndex: Math.max(0, prev.selectedProductIndex - 1),
        successMessage: "تم حذف المنتج بنجاح",
      }))

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 3000)
    } catch (err) {
      console.error("[v0] Delete error:", err)
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ أثناء الحذف",
      }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
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
        expiry_tracking: product.expiry_tracking || (product as any).has_expiry || false,
        batch_tracking: product.batch_tracking || (product as any).has_batch || false,
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

  const handleAddInitialQuantities = (product: Product) => {
    setState((prev) => ({
      ...prev,
      selectedProductForQuantities: product,
      showInitialQuantities: true,
    }))
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "نشط":
        return <Badge className="bg-green-100 text-green-800">نشط</Badge>
      case "غير نشط":
        return <Badge className="bg-gray-100 text-gray-800">غير نشط</Badge>
      case "متوقف":
        return <Badge className="bg-red-100 text-red-800">متوقف</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getStockBadge = (current: number, min: number) => {
    if (current === 0) {
      return <Badge className="bg-red-100 text-red-800">نفد المخزون</Badge>
    }
    if (current <= min) {
      return <Badge className="bg-orange-100 text-orange-800">مخزون منخفض</Badge>
    }
    return <Badge className="bg-green-100 text-green-800">متوفر</Badge>
  }

  const handleSubmit = () => {
    if (state.editingProduct) {
      handleSaveProduct(state.formData)
    } else {
      handleSaveProduct(state.formData)
    }
  }

  if (!Util.checkUserAccess(10)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-red-600">لا يوجد صلاحية</h2>
          <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى الأصناف</p>
        </div>
      </div>
    )
  }
  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الأصناف...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 lg:p-6 bg-background min-h-screen" dir="rtl">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={() => setState((prev) => ({ ...prev, error: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}
      <Toast ref={toast} position="top-left" className="custom-toast" />
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{state.successMessage}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={() => setState((prev) => ({ ...prev, successMessage: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}



      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">إدارة الأصناف</h1>
          <p className="text-muted-foreground mt-1">إدارة وتتبع جميع الأصناف والمخزون</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setState((prev) => ({ ...prev, showExcelImport: true }))}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            استيراد من Excel
          </Button>
          <BatchPrintDialog />
          <Button
            onClick={() => {
              if (!Util.checkUserAccess(1)) {
                toast.current?.show({
                  severity: 'error',
                  summary: '',
                  detail: 'لا يوجد لديك صلاحية اضافة صنف ',
                  life: 3000
                });
                return
              }
              setState((prev) => ({
                ...prev,
                showDialog: true,
                editingProduct: null,
                formData: initialFormData,
                error: null,
              }))
            }
            }
            className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto"
          >
            <Plus className="ml-2 h-4 w-4" />
            صنف جديد
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">إجمالي الأصناف</p>
                <p className="text-2xl lg:text-3xl font-bold text-blue-900">{statistics.totalProducts}</p>
              </div>
              <Package className="h-8 w-8 lg:h-10 lg:w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">المنتجات النشطة</p>
                <p className="text-2xl lg:text-3xl font-bold text-green-900">{statistics.activeProducts}</p>
              </div>
              <CheckCircle className="h-8 w-8 lg:h-10 lg:w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-700">مخزون منخفض</p>
                <p className="text-2xl lg:text-3xl font-bold text-orange-900">{statistics.lowStockProducts}</p>
              </div>
              <AlertTriangle className="h-8 w-8 lg:h-10 lg:w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">نفد المخزون</p>
                <p className="text-2xl lg:text-3xl font-bold text-red-900">{statistics.outOfStockProducts}</p>
              </div>
              <X className="h-8 w-8 lg:h-10 lg:w-10 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700">قيمة المخزون</p>
                <p className="text-xl lg:text-2xl font-bold text-purple-900">
                  {statistics.totalValue.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 lg:h-10 lg:w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            البحث والتصفية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div>
              <Label>البحث</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="اسم الصنف، رقم الصنف، أو الباركود"
                  value={state.filters.search}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                      currentPage: 1,
                    }))
                  }
                  className="pr-10"
                />
              </div>
            </div>
            <div>
              <Label>الفئة</Label>
              <Select
                value={state.filters.category}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, category: value },
                    currentPage: 1,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفئات</SelectItem>
                  {state.categories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحالة</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, status: value },
                    currentPage: 1,
                  }))
                }
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
            <div>
              <Label>مستوى المخزون</Label>
              <Select
                value={state.filters.stockLevel}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, stockLevel: value },
                    currentPage: 1,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المستويات</SelectItem>
                  <SelectItem value="low">مخزون منخفض</SelectItem>
                  <SelectItem value="out">نفد المخزون</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    filters: { search: "", category: "all", status: "all", stockLevel: "all" },
                    currentPage: 1,
                  }))
                }
                className="w-full"
              >
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الاصناف</CardTitle>
          <CardDescription>
            عرض {paginatedProducts.length} من أصل {filteredProducts.length} صنف
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paginatedProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد اصناف</h3>
              <p className="text-muted-foreground mb-4">لم يتم العثور على أي اصناف تطابق معايير البحث</p>
              <Button
                onClick={() => {
                  if (!Util.checkUserAccess(10)) {
                    toast.current?.show({
                      severity: 'error',
                      summary: '',
                      detail: 'لا يوجد لديك صلاحية اضافة صنف جديد',
                      life: 3000
                    });
                    return
                  }
                  setState((prev) => ({
                    ...prev,
                    showDialog: true,
                    editingProduct: null,
                    formData: initialFormData,
                    error: null,
                  }))
                }
                }
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة صنف جديد
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الصنف</TableHead>
                      <TableHead className="text-right">اسم الصنف</TableHead>
                      <TableHead className="text-right">التصنيف</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">المستودع الافتراضي</TableHead>
                      <TableHead className="text-right">المخزون الحالي</TableHead>
                      <TableHead className="text-right">نقطة إعادة الطلب</TableHead>
                      <TableHead className="text-right">آخر سعر شراء</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">حالة المخزون</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.product_code}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{product.product_name}</div>
                            {product.barcode && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Barcode className="h-3 w-3" />
                                {product.barcode}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>{product.main_unit}</TableCell>
                        <TableCell>{product.default_store_name || "بلا تحديد"}</TableCell>
                        <TableCell className="font-medium">{product.current_stock}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.reorder_point || product.min_stock_level || 0}</span>
                            {product.current_stock <= (product.reorder_point || product.min_stock_level || 0) && (
                              <AlertTriangle className="h-4 w-4 text-orange-600" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {product.last_purchase_price.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(product.status)}</TableCell>
                        <TableCell>{getStockBadge(product.current_stock, product.min_stock_level || 0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => {
                              if (!Util.checkUserAccess(2)) {
                                toast.current?.show({
                                  severity: 'error',
                                  summary: '',
                                  detail: 'لا يوجد لديك صلاحية تعديل صنف',
                                  life: 3000
                                });
                                return
                              }
                              handleEditProduct(product)


                            }
                            }>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddInitialQuantities(product)}
                              title="إدخال كميات ابتدائية"
                            >
                              <Warehouse className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    صفحة {state.currentPage} من {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setState((prev) => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                      disabled={state.currentPage === 1}
                    >
                      السابق
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setState((prev) => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                      disabled={state.currentPage === totalPages}
                    >
                      التالي
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={state.showDialog} onOpenChange={(open) => setState((prev) => ({ ...prev, showDialog: open }))} >
        <DialogContent className="max-w-[75vw] sm:max-w-[70vw] md:max-w-[62vw] lg:max-w-[110vh] max-h-[95vh] overflow-hidden p-0" dir="rtl" 
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <CompactProductForm
            visible={true}

            editingProduct={state.editingProduct}
            onHideDialog={(close) => { if (close) { setState((prev) => ({ ...prev, showDialog: false, error: null })) } }}
            onSuccess={() => {
              fetchProducts()
            }}
            isSubmitting={state.isSubmitting}

          />

        </DialogContent>
      </Dialog>

      <ExcelImportDialog
        open={state.showExcelImport}
        onOpenChange={(open) => setState((prev) => ({ ...prev, showExcelImport: open }))}
        onImportComplete={fetchProducts}
        
      />

      <InitialQuantitiesDialog
        open={state.showInitialQuantities}
        onOpenChange={(open) => setState((prev) => ({ ...prev, showInitialQuantities: open }))}
        productId={state.selectedProductForQuantities?.id}
        productName={state.selectedProductForQuantities?.product_name || ""}
        hasExpiryTracking={state.selectedProductForQuantities?.expiry_tracking || false}
        hasBatchTracking={state.selectedProductForQuantities?.batch_tracking || false}
        onSave={() => {
          fetchProducts()
          setState((prev) => ({
            ...prev,
            showInitialQuantities: false,
            selectedProductForQuantities: null,
          }))
        }}
      />
    </div>
  )
}

export default Products
