"use client"

import { tr, appDir } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShoppingCart,
  TrendingDown,
  Package,
  Bell,
  Save,
  X,
  Eye,
  Play,
  Pause,
} from "lucide-react"

interface Product {
  id: number
  product_code: string
  product_name: string
  current_stock: number
  reorder_point: number
  min_stock_level: number
  max_stock_level: number
  last_purchase_price: number
  supplier_id?: number
  supplier_name?: string
  main_unit: string
  status: string
}

interface ReorderRule {
  id: number
  product_id: number
  product_name: string
  product_code: string
  reorder_point: number
  reorder_quantity: number
  supplier_id?: number
  supplier_name?: string
  is_active: boolean
  auto_create_po: boolean
  notification_enabled: boolean
  last_triggered?: string
  created_at: string
}

interface AutoReorderSettings {
  enabled: boolean
  check_frequency_hours: number
  auto_create_purchase_orders: boolean
  notification_email: string
  notification_sms: boolean
  minimum_order_value: number
  default_reorder_multiplier: number
}

export function AutomatedReorderSystem() {
  const [state, setState] = useState({
    products: [] as Product[],
    reorderRules: [] as ReorderRule[],
    lowStockProducts: [] as Product[],
    pendingReorders: [] as any[],
    settings: {
      enabled: false,
      check_frequency_hours: 24,
      auto_create_purchase_orders: false,
      notification_email: "",
      notification_sms: false,
      minimum_order_value: 1000,
      default_reorder_multiplier: 2,
    } as AutoReorderSettings,
    loading: true,
    error: null as string | null,
    successMessage: null as string | null,
    showSettingsDialog: false,
    showRuleDialog: false,
    editingRule: null as ReorderRule | null,
    isSubmitting: false,
    filters: {
      search: "",
      status: "all",
      supplier: "all",
    },
  })

  const filteredProducts = useMemo(() => {
    return state.lowStockProducts.filter((product) => {
      if (
        state.filters.search &&
        !product.product_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !product.product_code?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (state.filters.status !== "all") {
        if (state.filters.status === "critical" && product.current_stock > 0) {
          return false
        }
        if (state.filters.status === "low" && product.current_stock === 0) {
          return false
        }
      }
      return true
    })
  }, [state.lowStockProducts, state.filters])

  const statistics = useMemo(() => {
    const totalRules = state.reorderRules.length
    const activeRules = state.reorderRules.filter((r) => r.is_active).length
    const criticalStock = state.lowStockProducts.filter((p) => p.current_stock === 0).length
    const lowStock = state.lowStockProducts.filter(
      (p) => p.current_stock > 0 && p.current_stock <= p.reorder_point,
    ).length
    const pendingOrders = state.pendingReorders.length

    return { totalRules, activeRules, criticalStock, lowStock, pendingOrders }
  }, [state.reorderRules, state.lowStockProducts, state.pendingReorders])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      // Fetch low stock products
      const lowStockResponse = await fetch("/api/inventory/low-stock")
      if (lowStockResponse.ok) {
        const lowStockData = await lowStockResponse.json()
        setState((prev) => ({ ...prev, lowStockProducts: lowStockData }))
      }

      // Fetch reorder rules
      const rulesResponse = await fetch("/api/inventory/reorder-rules")
      if (rulesResponse.ok) {
        const rulesData = await rulesResponse.json()
        setState((prev) => ({ ...prev, reorderRules: rulesData }))
      }

      // Fetch settings
      const settingsResponse = await fetch("/api/inventory/reorder-settings")
      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json()
        setState((prev) => ({ ...prev, settings: { ...prev.settings, ...settingsData } }))
      }

      // Fetch pending reorders
      const pendingResponse = await fetch("/api/inventory/pending-reorders")
      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json()
        setState((prev) => ({ ...prev, pendingReorders: pendingData }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: tr("فشل في تحميل بيانات النظام التلقائي"),
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  const handleRunReorderCheck = async () => {
    try {
      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      const response = await fetch("/api/inventory/run-reorder-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        throw new Error(tr("فشل في تشغيل فحص إعادة الطلب"))
      }

      const result = await response.json()
      setState((prev) => ({
        ...prev,
        successMessage: tr("تم فحص {0} منتج، تم إنشاء {1} طلبية جديدة", result.checked, result.created),
      }))

      await fetchData()

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 5000)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : tr("حدث خطأ أثناء تشغيل الفحص"),
      }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleSaveSettings = async () => {
    try {
      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      const response = await fetch("/api/inventory/reorder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.settings),
      })

      if (!response.ok) {
        throw new Error(tr("فشل في حفظ الإعدادات"))
      }

      setState((prev) => ({
        ...prev,
        showSettingsDialog: false,
        successMessage: tr("تم حفظ الإعدادات بنجاح"),
      }))

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 3000)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : tr("حدث خطأ أثناء حفظ الإعدادات"),
      }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleCreateReorderRule = async (productId: number) => {
    const product = state.lowStockProducts.find((p) => p.id === productId)
    if (!product) return

    const newRule = {
      product_id: productId,
      reorder_point: product.reorder_point || product.min_stock_level || 10,
      reorder_quantity: (product.max_stock_level || 100) - (product.current_stock || 0),
      supplier_id: product.supplier_id,
      is_active: true,
      auto_create_po: false,
      notification_enabled: true,
    }

    try {
      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      const response = await fetch("/api/inventory/reorder-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      })

      if (!response.ok) {
        throw new Error(tr("فشل في إنشاء قاعدة إعادة الطلب"))
      }

      setState((prev) => ({
        ...prev,
        successMessage: tr("تم إنشاء قاعدة إعادة الطلب بنجاح"),
      }))

      await fetchData()

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 3000)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : tr("حدث خطأ أثناء إنشاء القاعدة"),
      }))
    } finally {
      setState((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const toggleRuleStatus = async (ruleId: number, isActive: boolean) => {
    try {
      const response = await fetch(`/api/inventory/reorder-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      })

      if (!response.ok) {
        throw new Error(tr("فشل في تحديث حالة القاعدة"))
      }

      setState((prev) => ({
        ...prev,
        reorderRules: prev.reorderRules.map((rule) => (rule.id === ruleId ? { ...rule, is_active: isActive } : rule)),
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : tr("حدث خطأ أثناء تحديث القاعدة"),
      }))
    }
  }

  const getStockStatusBadge = (product: Product) => {
    if (product.current_stock === 0) {
      return <Badge className="bg-red-100 text-red-800">{tr("نفد المخزون")}</Badge>
    }
    if (product.current_stock <= product.reorder_point) {
      return <Badge className="bg-orange-100 text-orange-800">{tr("مخزون منخفض")}</Badge>
    }
    return <Badge className="bg-green-100 text-green-800">{tr("متوفر")}</Badge>
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir={appDir()}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{tr("جاري تحميل نظام إعادة الطلب التلقائي...")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir={appDir()}>
      {/* Success Message */}
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{state.successMessage}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto"
            onClick={() => setState((prev) => ({ ...prev, successMessage: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Error Message */}
      {state.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto"
            onClick={() => setState((prev) => ({ ...prev, error: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Header */}
<VoucherListHero title={tr("نظام إعادة الطلب التلقائي")} subtitle={tr("مراقبة المخزون وإنشاء طلبات الشراء تلقائياً")} icon={RefreshCw} category={tr("المخزون")} actions={<><Button variant="outline" onClick={() => setState((prev) => ({ ...prev, showSettingsDialog: true }))}>
            <Settings className="h-4 w-4 me-2" />
            {tr("الإعدادات")}
          </Button>
          <Button
            onClick={handleRunReorderCheck}
            disabled={state.isSubmitting}
            className="bg-primary hover:bg-primary/90"
          >
            <RefreshCw className={`h-4 w-4 me-2 ${state.isSubmitting ? "animate-spin" : ""}`} />
            {state.isSubmitting ? tr("جاري الفحص...") : tr("تشغيل الفحص")}
          </Button></>} />

      {/* System Status */}
      <Card
        className={`border-2 ${state.settings.enabled ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {state.settings.enabled ? (
                <Play className="h-6 w-6 text-green-600" />
              ) : (
                <Pause className="h-6 w-6 text-orange-600" />
              )}
              <div>
                <h3 className="font-semibold text-lg">{state.settings.enabled ? tr("النظام مفعل") : tr("النظام متوقف")}</h3>
                <p className="text-sm text-muted-foreground">
                  {state.settings.enabled
                    ? tr("يتم فحص المخزون كل {0} ساعة", state.settings.check_frequency_hours)
                    : tr("النظام التلقائي غير مفعل حالياً")}
                </p>
              </div>
            </div>
            <Switch
              checked={state.settings.enabled}
              onCheckedChange={(checked) =>
                setState((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, enabled: checked },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">{tr("قواعد إعادة الطلب")}</p>
                <p className="text-3xl font-bold text-blue-900">{statistics.totalRules}</p>
                <p className="text-xs text-blue-600">{tr("نشط: ")}{statistics.activeRules}</p>
              </div>
              <Settings className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-50 to-red-100 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">{tr("نفد المخزون")}</p>
                <p className="text-3xl font-bold text-red-900">{statistics.criticalStock}</p>
                <p className="text-xs text-red-600">{tr("يحتاج طلب فوري")}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">{tr("مخزون منخفض")}</p>
                <p className="text-3xl font-bold text-orange-900">{statistics.lowStock}</p>
                <p className="text-xs text-orange-600">{tr("تحت نقطة إعادة الطلب")}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">{tr("طلبات معلقة")}</p>
                <p className="text-3xl font-bold text-purple-900">{statistics.pendingOrders}</p>
                <p className="text-xs text-purple-600">{tr("في انتظار الاعتماد")}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">{tr("طلبات تلقائية")}</p>
                <p className="text-3xl font-bold text-green-900">
                  {state.settings.auto_create_purchase_orders ? tr("مفعل") : tr("معطل")}
                </p>
                <p className="text-xs text-green-600">{tr("إنشاء تلقائي")}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {tr("المنتجات التي تحتاج إعادة طلب")}
          </CardTitle>
          <CardDescription>{tr("المنتجات التي وصلت لنقطة إعادة الطلب أو نفد مخزونها")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <Label>{tr("البحث")}</Label>
              <Input
                placeholder={tr("اسم المنتج أو الكود")}
                value={state.filters.search}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, search: e.target.value },
                  }))
                }
              />
            </div>
            <div>
              <Label>{tr("حالة المخزون")}</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, status: value },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("جميع الحالات")}</SelectItem>
                  <SelectItem value="critical">{tr("نفد المخزون")}</SelectItem>
                  <SelectItem value="low">{tr("مخزون منخفض")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    filters: { search: "", status: "all", supplier: "all" },
                  }))
                }
              >
                {tr("إعادة تعيين")}
              </Button>
            </div>
          </div>

          {/* Products Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{tr("كود المنتج")}</TableHead>
                  <TableHead className="text-start">{tr("اسم المنتج")}</TableHead>
                  <TableHead className="text-start">{tr("المخزون الحالي")}</TableHead>
                  <TableHead className="text-start">{tr("نقطة إعادة الطلب")}</TableHead>
                  <TableHead className="text-start">{tr("المورد")}</TableHead>
                  <TableHead className="text-start">{tr("الحالة")}</TableHead>
                  <TableHead className="text-start">{tr("الإجراءات")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.product_code}</TableCell>
                    <TableCell>{product.product_name}</TableCell>
                    <TableCell className="font-medium">{product.current_stock}</TableCell>
                    <TableCell>{product.reorder_point || product.min_stock_level || "-"}</TableCell>
                    <TableCell>{product.supplier_name || tr("غير محدد")}</TableCell>
                    <TableCell>{getStockStatusBadge(product)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateReorderRule(product.id)}
                          disabled={state.reorderRules.some((r) => r.product_id === product.id)}
                        >
                          <Bell className="h-4 w-4" />
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

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{tr("لا توجد منتجات")}</h3>
              <p className="text-muted-foreground">{tr("جميع المنتجات في مستويات مخزون جيدة")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog
        open={state.showSettingsDialog}
        onOpenChange={(open) => setState((prev) => ({ ...prev, showSettingsDialog: open }))}
      >
        <DialogContent className="max-w-2xl" dir={appDir()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {tr("إعدادات نظام إعادة الطلب التلقائي")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{tr("تكرار الفحص (بالساعات)")}</Label>
                <Input
                  type="number"
                  min="1"
                  max="168"
                  value={state.settings.check_frequency_hours}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        check_frequency_hours: Number.parseInt(e.target.value) || 24,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label>{tr("الحد الأدنى لقيمة الطلبية")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={state.settings.minimum_order_value}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        minimum_order_value: Number.parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>{tr("البريد الإلكتروني للإشعارات")}</Label>
              <Input
                type="email"
                value={state.settings.notification_email}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, notification_email: e.target.value },
                  }))
                }
                placeholder="admin@company.com"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{tr("إنشاء طلبات الشراء تلقائياً")}</Label>
                <Switch
                  checked={state.settings.auto_create_purchase_orders}
                  onCheckedChange={(checked) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, auto_create_purchase_orders: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{tr("إرسال إشعارات SMS")}</Label>
                <Switch
                  checked={state.settings.notification_sms}
                  onCheckedChange={(checked) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, notification_sms: checked },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-4 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setState((prev) => ({ ...prev, showSettingsDialog: false }))}>
                {tr("إلغاء")}
              </Button>
              <Button onClick={handleSaveSettings} disabled={state.isSubmitting}>
                <Save className="h-4 w-4 me-2" />
                {state.isSubmitting ? tr("جاري الحفظ...") : tr("حفظ الإعدادات")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
