"use client"

import type React from "react"
import { SearchButton } from "@/components/search/search-button"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Save } from "lucide-react"

interface QuickOrderItem {
  id: string
  productName: string
  quantity: number
  price: number
  amount: number
}

interface QuickSalesOrderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickSalesOrder({ open, onOpenChange }: QuickSalesOrderProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderForm, setOrderForm] = useState({
    customerName: "",
    orderDate: new Date().toISOString().split("T")[0],
    currency: "شيكل إسرائيلي",
    salesman: "",
  })

  const [orderItems, setOrderItems] = useState<QuickOrderItem[]>([
    {
      id: "1",
      productName: "",
      quantity: 1,
      price: 0,
      amount: 0,
    },
  ])

  const addOrderItem = () => {
    const newItem: QuickOrderItem = {
      id: Date.now().toString(),
      productName: "",
      quantity: 1,
      price: 0,
      amount: 0,
    }
    setOrderItems([...orderItems, newItem])
  }

  const removeOrderItem = (id: string) => {
    setOrderItems(orderItems.filter((item) => item.id !== id))
  }

  const updateOrderItem = (id: string, field: keyof QuickOrderItem, value: any) => {
    setOrderItems(
      orderItems.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }
          if (field === "quantity" || field === "price") {
            updatedItem.amount = updatedItem.quantity * updatedItem.price
          }
          return updatedItem
        }
        return item
      }),
    )
  }

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + item.amount, 0)
  }

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!orderForm.customerName.trim()) {
      alert("اسم العميل مطلوب")
      return
    }

    if (orderItems.length === 0 || orderItems.every((item) => !item.productName)) {
      alert("يجب إضافة صنف واحد على الأقل")
      return
    }

    setIsSubmitting(true)
    try {
      const orderData = {
        orderNumber: "",
        orderDate: orderForm.orderDate,
        financialStatus: "",
        orderStatus: "قيد التنفيذ",
        customerCode: "",
        customerName: orderForm.customerName,
        manualDocument: "",
        currency: orderForm.currency,
        currencyCode: orderForm.currency === "شيكل إسرائيلي" ? "ILS" : "USD",
        exchangeRate: 1.0,
        salesman: orderForm.salesman,
        deliveryDateTime: "",
        notes: "طلبية سريعة",
        items: orderItems.filter((item) => item.productName),
        totalAmount: calculateTotal(),
        totalQuantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
        totalBonus: 0,
      }

      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      })

      if (!response.ok) {
        throw new Error("Failed to save sales order")
      }

      // Reset form
      setOrderForm({
        customerName: "",
        orderDate: new Date().toISOString().split("T")[0],
        currency: "شيكل إسرائيلي",
        salesman: "",
      })

      setOrderItems([
        {
          id: "1",
          productName: "",
          quantity: 1,
          price: 0,
          amount: 0,
        },
      ])

      onOpenChange(false)
      alert("تم حفظ الطلبية بنجاح")
    } catch (err) {
      console.error("Error saving sales order:", err)
      alert("حدث خطأ أثناء حفظ البيانات")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCustomerSelect = (customer: any) => {
    setOrderForm((prev) => ({
      ...prev,
      customerName: customer.customer_name || customer.name || "",
    }))
  }

  const handleProductSelect = (product: any) => {
    const emptyItemIndex = orderItems.findIndex((item) => !item.productName)

    if (emptyItemIndex >= 0) {
      const updatedItems = [...orderItems]
      updatedItems[emptyItemIndex] = {
        ...updatedItems[emptyItemIndex],
        productName: product.product_name || product.name || "",
        price: product.last_purchase_price || product.price || 0,
        amount: (product.last_purchase_price || product.price || 0) * updatedItems[emptyItemIndex].quantity,
      }
      setOrderItems(updatedItems)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-right">طلبية مبيعات سريعة</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                F2: بحث أصناف
              </Badge>
              <Badge variant="outline" className="text-xs">
                F3: بحث العملاء
              </Badge>
              <SearchButton type="products" onSelect={handleProductSelect} variant="outline" size="sm" />
              <SearchButton type="customers" onSelect={handleCustomerSelect} variant="outline" size="sm" />
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSaveOrder} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-right block mb-2">اسم العميل *</Label>
              <Select
                value={orderForm.customerName}
                onValueChange={(value) => setOrderForm({ ...orderForm, customerName: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="-- اختر العميل --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="أحمد محمد علي">أحمد محمد علي</SelectItem>
                  <SelectItem value="شركة النجاح التجارية">شركة النجاح التجارية</SelectItem>
                  <SelectItem value="مؤسسة الأمل">مؤسسة الأمل</SelectItem>
                  <SelectItem value="شركة الإبداع المحدودة">شركة الإبداع المحدودة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-right block mb-2">تاريخ الطلبية</Label>
              <Input
                type="date"
                value={orderForm.orderDate}
                onChange={(e) => setOrderForm({ ...orderForm, orderDate: e.target.value })}
                className="text-right"
              />
            </div>
            <div>
              <Label className="text-right block mb-2">العملة</Label>
              <Select
                value={orderForm.currency}
                onValueChange={(value) => setOrderForm({ ...orderForm, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="شيكل إسرائيلي">شيكل إسرائيلي</SelectItem>
                  <SelectItem value="دولار أمريكي">دولار أمريكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-right block mb-2">المندوب</Label>
              <Select
                value={orderForm.salesman}
                onValueChange={(value) => setOrderForm({ ...orderForm, salesman: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="-- اختر المندوب --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="محمد أحمد">محمد أحمد</SelectItem>
                  <SelectItem value="علي حسن">علي حسن</SelectItem>
                  <SelectItem value="خالد محمد">خالد محمد</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-right">الأصناف</h3>
              <div className="flex gap-2">
                <SearchButton type="products" onSelect={handleProductSelect} variant="ghost" size="sm" />
                <Button type="button" size="sm" onClick={addOrderItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  إضافة صنف
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 border rounded-lg">
                  <div>
                    <Label className="text-right block mb-1 text-sm">اسم الصنف</Label>
                    <Select
                      value={item.productName}
                      onValueChange={(value) => updateOrderItem(item.id, "productName", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الصنف" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="لابتوب ديل">لابتوب ديل</SelectItem>
                        <SelectItem value="طابعة HP">طابعة HP</SelectItem>
                        <SelectItem value="ماوس لاسلكي">ماوس لاسلكي</SelectItem>
                        <SelectItem value="كيبورد">كيبورد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">الكمية</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateOrderItem(item.id, "quantity", Number.parseInt(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">السعر</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateOrderItem(item.id, "price", Number.parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">المبلغ</Label>
                    <Input type="number" step="0.01" value={item.amount} readOnly className="text-right bg-muted" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeOrderItem(item.id)}
                      disabled={orderItems.length === 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">الإجمالي:</span>
                <span className="text-xl font-bold">
                  {calculateTotal().toFixed(2)} {orderForm.currency === "شيكل إسرائيلي" ? "₪" : "$"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? "جاري الحفظ..." : "حفظ الطلبية"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
