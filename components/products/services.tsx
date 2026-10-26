"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { Wrench as WrenchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useWorkspace } from "@/contexts/workspace-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, CheckCircle, X, Package, AlertTriangle, Warehouse } from "lucide-react"
import { Toast } from "primereact/toast"
import { CompactServiceForm } from "./compact-service-form"
import { ImageThumbnail } from "@/components/common/ImageUploadField"
import { useFileAccess } from "@/components/auth/use-file-access"
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
  const { fullscreenEnabled } = useWorkspace()
  const can = useFileAccess("services")
  const canView = can("view"), canCreate = can("create"), canUpdate = can("update")
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
    if (!canView) return []
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
  }, [canView, state.products, state.filters])

  const paginatedProducts = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.itemsPerPage
    return filteredProducts.slice(startIndex, startIndex + state.itemsPerPage)
  }, [filteredProducts, state.currentPage, state.itemsPerPage])
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / state.itemsPerPage))

  useEffect(() => {
    fetchProducts()
  }, [canView])

  const fetchProducts = async () => {
    if (!canView) { setState((prev) => ({ ...prev, products: [], loading: false })); return }
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
    if (!canView) return
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
    if (!canUpdate) return
    setState((prev) => ({
      ...prev,
      pendingFreezeProduct: product,
      confirmDialogVisible: true,
    }))
  }

  const confirmFreezeToggle = async () => {
    if (!canUpdate) return
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

  if (!can("access")) {
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
    <div className="voucher-list-page min-h-screen space-y-4 bg-background p-3 sm:space-y-5 sm:p-5" dir="rtl">
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

      <VoucherListHero
        category="الملفات"
        icon={WrenchIcon}
        title="إدارة الخدمات"
        subtitle="إدارة الخدمات المتاحة في النظام"
        addLabel="خدمة جديدة"
        onNew={() => canCreate && setState((prev) => ({
              ...prev,
              showDialog: true,
              editingProduct: null,
              formData: initialFormData,
              error: null,
              successMessage: null,
            }))}
        addDisabled={!canCreate}
      />

      <VoucherStats stats={[{ label: <>إجمالي الخدمات</>, value: <>{serviceStats.totalServices}</> }, { label: <>الخدمات النشطة</>, value: <>{serviceStats.activeServices}</> }, { label: <>الخدمات غير النشطة</>, value: <>{serviceStats.inactiveServices}</> }]} />

      <Card>
        <CardHeader>
          <CardTitle>قائمة الخدمات</CardTitle>
          <CardDescription>عرض {paginatedProducts.length} من أصل {filteredProducts.length} خدمة</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="min-w-0 space-y-1.5">
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
            <div className="min-w-0 space-y-1.5">
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>الخدمات</CardTitle>
          <Badge variant="secondary">{filteredProducts.length.toLocaleString("ar-u-nu-latn")} خدمة</Badge>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {paginatedProducts.map((product) => {
              const status = normalizedServiceStatus(product.status)
              const active = status === "نشط"
              return (
                <article key={product.id} className="min-w-0 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <ImageThumbnail value={(product as any).product_image || product.image_url} size={44} alt={product.product_name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 break-words text-sm font-bold leading-6">{product.product_name}</h3>
                        <Badge className={active ? "shrink-0 bg-green-100 text-green-800" : "shrink-0 bg-slate-100 text-slate-700"}>
                          {status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-muted-foreground" dir="ltr">{product.product_code}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
                    <div className="min-w-0"><dt className="text-muted-foreground">التصنيف</dt><dd className="mt-0.5 truncate font-semibold">{product.category || "—"}</dd></div>
                    <div className="min-w-0"><dt className="text-muted-foreground">آخر سعر شراء</dt><dd className="mt-0.5 font-semibold" dir="ltr">{Number(product.last_purchase_price || 0).toLocaleString("en-US")}</dd></div>
                  </dl>
                  {canUpdate && (
                    <div className="mt-3 flex justify-end gap-2 border-t pt-3">
                      {canUpdate && <Button variant="outline" size="sm" className="min-h-9 gap-2" onClick={() => handleEditProduct(product)}><Edit className="h-4 w-4" />تعديل</Button>}
                      {canUpdate && <Button variant="outline" size="sm" className="min-h-9 gap-2" onClick={() => handleToggleFreeze(product)} aria-label={active ? "تجميد الخدمة" : "إلغاء تجميد الخدمة"}><Warehouse className="h-4 w-4" />{active ? "تجميد" : "تفعيل"}</Button>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead>
                <tr>
                  <th className="py-3 px-2 w-12"></th>
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
                    <td className="py-3 px-2">
                      <ImageThumbnail value={(product as any).product_image || product.image_url} size={32} alt={product.product_name} />
                    </td>
                    <td className="py-3 px-2">{product.product_code}</td>
                    <td className="py-3 px-2 font-medium">{product.product_name}</td>
                    <td className="py-3 px-2">{product.category}</td>
                    <td className="py-3 px-2">{product.last_purchase_price?.toLocaleString("en-US")}</td>
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
                        {canUpdate && <Button variant="outline" size="sm" onClick={() => handleEditProduct(product)} aria-label={`تعديل ${product.product_name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>}
                        {canUpdate && <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleFreeze(product)}
                          title={product.status === "غير نشط" ? "إلغاء التجميد" : "تجميد"}
                          aria-label={`${product.status === "غير نشط" ? "إلغاء تجميد" : "تجميد"} ${product.product_name}`}
                        >
                          <Warehouse className="h-4 w-4" />
                        </Button>}
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

          {filteredProducts.length > 0 && (
            <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-muted-foreground sm:text-right">
                عرض {((state.currentPage - 1) * state.itemsPerPage + 1).toLocaleString("ar-u-nu-latn")}–{Math.min(state.currentPage * state.itemsPerPage, filteredProducts.length).toLocaleString("ar-u-nu-latn")} من {filteredProducts.length.toLocaleString("ar-u-nu-latn")} خدمة
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" className="min-h-9" disabled={state.currentPage <= 1} onClick={() => setState((prev) => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) }))}>السابق</Button>
                <span className="min-w-16 text-center text-xs font-semibold tabular-nums">{state.currentPage.toLocaleString("ar-u-nu-latn")} / {totalPages.toLocaleString("ar-u-nu-latn")}</span>
                <Button variant="outline" size="sm" className="min-h-9" disabled={state.currentPage >= totalPages} onClick={() => setState((prev) => ({ ...prev, currentPage: Math.min(totalPages, prev.currentPage + 1) }))}>التالي</Button>
              </div>
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
        <DialogContent inline={fullscreenEnabled && state.showDialog} className="h-[92vh] max-h-[760px] w-[96vw] max-w-[1100px] overflow-hidden p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()} hideCloseButton>
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
