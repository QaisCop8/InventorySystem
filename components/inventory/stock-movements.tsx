"use client"

import type React from "react"
import { SearchButton } from "@/components/search/search-button"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, ArrowUpCircle, ArrowDownCircle, RotateCcw, ArrowRightLeft, Package } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { formatDateToBritish } from "@/lib/utils"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"

interface StockMovement {
  id: number
  product_id: number
  product_name: string
  product_code: string
  transaction_type: "in" | "out" | "adjustment" | "transfer"
  quantity: number
  unit_cost?: number
  reference_type?: string
  reference_id?: number
  notes?: string
  created_by: string
  created_at: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
  main_unit: string
  current_stock: number
}

export function StockMovements() {
  const workspaceTabActive = useWorkspaceTabActive()
  const { user } = useAuth()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [formData, setFormData] = useState({
    product_id: "",
    transaction_type: "in" as "in" | "out" | "adjustment" | "transfer",
    quantity: 0,
    unit_cost: 0,
    reference_type: "",
    reference_id: "",
    notes: "",
  })

  useEffect(() => {
    fetchMovements()
    fetchProducts()
  }, [])

  const fetchMovements = async () => {
    try {
      const response = await fetch("/api/inventory/stock-movements")
      if (response.ok) {
        const data = await response.json()
        setMovements(data)
      }
    } catch (error) {
      console.error("Error fetching movements:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.product_id || !formData.quantity) {
      alert("يرجى ملء جميع الحقول المطلوبة")
      return
    }

    try {
      const selectedProduct = products.find((p) => p.id === Number.parseInt(formData.product_id))

      const movementData = {
        ...formData,
        product_id: Number.parseInt(formData.product_id),
        product_name: selectedProduct?.product_name || "",
        product_code: selectedProduct?.product_code || "",
        created_by: user?.fullName || "مستخدم",
      }

      const response = await fetch("/api/inventory/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movementData),
      })

      if (response.ok) {
        setShowDialog(false)
        setFormData({
          product_id: "",
          transaction_type: "in",
          quantity: 0,
          unit_cost: 0,
          reference_type: "",
          reference_id: "",
          notes: "",
        })
        fetchMovements()
        alert("تم إضافة حركة المخزون بنجاح")
      } else {
        throw new Error("فشل في إضافة حركة المخزون")
      }
    } catch (error) {
      console.error("Error creating movement:", error)
      alert("حدث خطأ في إضافة حركة المخزون")
    }
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "in":
        return <ArrowUpCircle className="h-4 w-4 text-green-600" />
      case "out":
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />
      case "adjustment":
        return <RotateCcw className="h-4 w-4 text-blue-600" />
      case "transfer":
        return <ArrowRightLeft className="h-4 w-4 text-purple-600" />
      default:
        return null
    }
  }

  const getMovementBadge = (type: string) => {
    const config = {
      in: { color: "bg-green-100 text-green-800", text: "وارد" },
      out: { color: "bg-red-100 text-red-800", text: "صادر" },
      adjustment: { color: "bg-blue-100 text-blue-800", text: "تعديل" },
      transfer: { color: "bg-purple-100 text-purple-800", text: "تحويل" },
    }

    const { color, text } = config[type as keyof typeof config] || config.in
    return <Badge className={color}>{text}</Badge>
  }

  const handleProductSelect = (product: any) => {
    setFormData((prev) => ({
      ...prev,
      product_id: product.id?.toString() || "",
    }))
  }

  const handleMovementSelect = (movement: StockMovement) => {
    // عرض تفاصيل الحركة أو فتح نافذة التعديل
    alert(`تم اختيار الحركة: ${movement.product_name} - ${movement.transaction_type}`)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (!workspaceTabActive.current) return;
      if (e.key === "F2") {
        e.preventDefault()
        const productSearchTrigger = document.querySelector('[data-search-type="products"]') as HTMLElement
        productSearchTrigger?.click()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">حركات المخزون</h2>
          <Badge variant="outline" className="text-xs mt-1">
            F2: بحث سريع عن صنف
          </Badge>
        </div>
        <div className="flex gap-2">
          <SearchButton type="movements" onSelectMovement={handleMovementSelect} variant="outline" />
          <SearchButton type="products" onSelect={handleProductSelect} variant="outline" data-search-type="products" />
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة حركة جديدة
          </Button>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-white to-blue-50/30 border-blue-200/50 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            سجل حركات المخزون
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-blue-50/50">
                <tr>
                  <th className="text-right p-4 font-semibold text-gray-700">التاريخ</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المنتج</th>
                  <th className="text-right p-4 font-semibold text-gray-700">نوع الحركة</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الكمية</th>
                  <th className="text-right p-4 font-semibold text-gray-700">التكلفة</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المرجع</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المستخدم</th>
                  <th className="text-right p-4 font-semibold text-gray-700">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-blue-100/50 hover:bg-blue-50/30 transition-colors">
                    {/* استخدام formatDateToBritish للتنسيق البريطاني */}
                    <td className="p-4">{formatDateToBritish(movement.created_at)}</td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium text-gray-900">{movement.product_name}</div>
                        <div className="text-sm text-blue-600">{movement.product_code}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getMovementIcon(movement.transaction_type)}
                        {getMovementBadge(movement.transaction_type)}
                      </div>
                    </td>
                    <td className="p-4 font-medium text-gray-900">{movement.quantity.toLocaleString()}</td>
                    <td className="p-4 text-green-600 font-medium">{movement.unit_cost?.toLocaleString() || "-"}</td>
                    <td className="p-4">
                      {movement.reference_type && movement.reference_id
                        ? `${movement.reference_type} #${movement.reference_id}`
                        : "-"}
                    </td>
                    <td className="p-4 text-blue-700 font-medium">{movement.created_by}</td>
                    <td className="p-4 max-w-xs truncate text-gray-600">{movement.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-white to-blue-50/20 border-blue-200">
          <DialogHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 -m-6 mb-6 rounded-t-lg">
            <DialogTitle className="flex items-center justify-between text-white">
              <span className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                إضافة حركة مخزون جديدة
              </span>
              <SearchButton
                type="products"
                onSelect={handleProductSelect}
                variant="outline"
                size="sm"
                data-search-type="products"
                className="bg-white/20 border-white/30 text-white hover:bg-white/30"
              />
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product">المنتج *</Label>
                <Select
                  value={formData.product_id}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, product_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المنتج" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.product_name} ({product.product_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="transaction_type">نوع الحركة *</Label>
                <Select
                  value={formData.transaction_type}
                  onValueChange={(value: "in" | "out" | "adjustment" | "transfer") =>
                    setFormData((prev) => ({ ...prev, transaction_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">وارد</SelectItem>
                    <SelectItem value="out">صادر</SelectItem>
                    <SelectItem value="adjustment">تعديل</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">الكمية *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="unit_cost">التكلفة الوحدة</Label>
                <Input
                  id="unit_cost"
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      unit_cost: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reference_type">نوع المرجع</Label>
                <Select
                  value={formData.reference_type}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, reference_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر نوع المرجع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase_order">أمر شراء</SelectItem>
                    <SelectItem value="sales_order">أمر بيع</SelectItem>
                    <SelectItem value="adjustment">تعديل</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                    <SelectItem value="manual">يدوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reference_id">رقم المرجع</Label>
                <Input
                  id="reference_id"
                  value={formData.reference_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, reference_id: e.target.value }))}
                  placeholder="رقم الأمر أو المرجع"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="أدخل أي ملاحظات إضافية..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                إلغاء
              </Button>
              <Button type="submit">حفظ الحركة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
