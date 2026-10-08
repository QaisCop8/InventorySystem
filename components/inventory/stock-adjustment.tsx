"use client"

import type React from "react"
import { SearchButton } from "@/components/search/search-button"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Settings, AlertTriangle, CheckCircle } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"

interface Product {
  id: number
  product_code: string
  product_name: string
  main_unit: string
  current_stock: number
  reorder_level: number
  stock_status: "low" | "out" | "available"
}

export function StockAdjustment() {
  const workspaceTabActive = useWorkspaceTabActive()
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [adjustmentData, setAdjustmentData] = useState({
    newQuantity: 0,
    reason: "",
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdjustStock = (product: Product) => {
    setSelectedProduct(product)
    setAdjustmentData({
      newQuantity: product.current_stock,
      reason: "",
    })
    setShowDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProduct || !adjustmentData.reason.trim()) {
      alert("يرجى ملء جميع الحقول المطلوبة")
      return
    }

    try {
      const response = await fetch("/api/inventory/stock-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          newQuantity: adjustmentData.newQuantity,
          reason: adjustmentData.reason,
          userId: user?.id || "unknown",
        }),
      })

      if (response.ok) {
        setShowDialog(false)
        setSelectedProduct(null)
        setAdjustmentData({ newQuantity: 0, reason: "" })
        fetchProducts()
        alert("تم تعديل المخزون بنجاح")
      } else {
        throw new Error("فشل في تعديل المخزون")
      }
    } catch (error) {
      console.error("Error adjusting stock:", error)
      alert("حدث خطأ في تعديل المخزون")
    }
  }

  const getStockStatusBadge = (status: string, currentStock: number, reorderLevel: number) => {
    if (currentStock === 0) {
      return <Badge className="bg-red-100 text-red-800">نفد المخزون</Badge>
    } else if (currentStock <= reorderLevel) {
      return <Badge className="bg-yellow-100 text-yellow-800">مخزون منخفض</Badge>
    } else {
      return <Badge className="bg-green-100 text-green-800">متوفر</Badge>
    }
  }

  const getStockIcon = (status: string, currentStock: number, reorderLevel: number) => {
    if (currentStock === 0) {
      return <AlertTriangle className="h-4 w-4 text-red-600" />
    } else if (currentStock <= reorderLevel) {
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    } else {
      return <CheckCircle className="h-4 w-4 text-green-600" />
    }
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

  const handleProductSelect = (product: any) => {
    const foundProduct = products.find((p) => p.id === product.id || p.product_code === product.product_code)
    if (foundProduct) {
      handleAdjustStock(foundProduct)
    }
  }

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
          <h2 className="text-2xl font-bold">تعديل المخزون</h2>
          <Badge variant="outline" className="text-xs mt-1">
            F2: بحث سريع عن صنف
          </Badge>
        </div>
        <SearchButton type="products" onSelect={handleProductSelect} variant="outline" data-search-type="products" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المنتجات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right p-4 font-semibold">كود المنتج</th>
                  <th className="text-right p-4 font-semibold">اسم المنتج</th>
                  <th className="text-right p-4 font-semibold">الوحدة</th>
                  <th className="text-right p-4 font-semibold">المخزون الحالي</th>
                  <th className="text-right p-4 font-semibold">الحد الأدنى</th>
                  <th className="text-right p-4 font-semibold">حالة المخزون</th>
                  <th className="text-right p-4 font-semibold">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-medium">{product.product_code}</td>
                    <td className="p-4">{product.product_name}</td>
                    <td className="p-4">{product.main_unit}</td>
                    <td className="p-4 font-medium">{product.current_stock?.toLocaleString() || 0}</td>
                    <td className="p-4">{product.reorder_level?.toLocaleString() || 0}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getStockIcon(product.stock_status, product.current_stock || 0, product.reorder_level || 0)}
                        {getStockStatusBadge(
                          product.stock_status,
                          product.current_stock || 0,
                          product.reorder_level || 0,
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Button size="sm" variant="outline" onClick={() => handleAdjustStock(product)}>
                        <Settings className="ml-2 h-4 w-4" />
                        تعديل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل مخزون المنتج</DialogTitle>
          </DialogHeader>

          {selectedProduct && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium">{selectedProduct.product_name}</h4>
                <p className="text-sm text-gray-600">كود المنتج: {selectedProduct.product_code}</p>
                <p className="text-sm text-gray-600">
                  المخزون الحالي: {selectedProduct.current_stock?.toLocaleString() || 0} {selectedProduct.main_unit}
                </p>
              </div>

              <div>
                <Label htmlFor="newQuantity">الكمية الجديدة *</Label>
                <Input
                  id="newQuantity"
                  type="number"
                  step="0.01"
                  value={adjustmentData.newQuantity}
                  onChange={(e) =>
                    setAdjustmentData((prev) => ({
                      ...prev,
                      newQuantity: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  التغيير: {(adjustmentData.newQuantity - (selectedProduct.current_stock || 0)).toLocaleString()}
                </p>
              </div>

              <div>
                <Label htmlFor="reason">سبب التعديل *</Label>
                <Textarea
                  id="reason"
                  value={adjustmentData.reason}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  placeholder="أدخل سبب تعديل المخزون..."
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                  إلغاء
                </Button>
                <Button type="submit">تأكيد التعديل</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
