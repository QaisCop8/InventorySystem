"use client"

import { tr } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Plus, Save, List, Download } from "lucide-react"

interface Customer {
  id: number
  customer_name: string
}

interface OrderItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  total: number
}

export default function MobileOrderEntry() {
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    const total = orderItems.reduce((sum, item) => sum + item.total, 0)
    setOrderForm((prev) => ({ ...prev, totalAmount: total }))
  }, [orderItems])

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }

    const handleAppInstalled = () => {
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
      toast({
        title: tr("تم التثبيت"),
        description: tr("تم تثبيت التطبيق بنجاح على جهازك"),
      })
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [toast])

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers")
      if (response.ok) {
        const data = await response.json()
        setCustomers(data.customers || [])
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
      setCustomers([])
    }
  }

  const addOrderItem = () => {
    if (!newItem.product_name || newItem.quantity <= 0 || newItem.unit_price <= 0) {
      toast({
        title: tr("خطأ"),
        description: tr("يرجى ملء جميع بيانات الصنف"),
        variant: "destructive",
      })
      return
    }

    const item: OrderItem = {
      id: Date.now().toString(),
      product_name: newItem.product_name,
      quantity: newItem.quantity,
      unit_price: newItem.unit_price,
      total: newItem.quantity * newItem.unit_price,
    }

    setOrderItems((prev) => [...prev, item])
    setNewItem({ product_name: "", quantity: 1, unit_price: 0 })
  }

  const removeOrderItem = (id: string) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSaveOrder = async () => {
    if (!orderForm.customerName || orderItems.length === 0) {
      toast({
        title: tr("خطأ"),
        description: tr("يرجى اختيار العميل وإضافة أصناف للطلبية"),
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const orderData = {
        customer_name: orderForm.customerName,
        customer_id: orderForm.customerId,
        salesman: orderForm.salesman,
        notes: orderForm.notes,
        total_amount: orderForm.totalAmount,
        order_date: new Date().toISOString().split("T")[0],
        financial_status: "pending",
        order_status: "pending",
        currency_name: "ريال سعودي",
        currency_code: "SAR",
        exchange_rate: 1,
        delivery_datetime: new Date().toISOString(),
      }

      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      })

      if (response.ok) {
        toast({
          title: tr("تم الحفظ"),
          description: tr("تم حفظ الطلبية بنجاح"),
        })

        setOrderForm({
          customerName: "",
          customerId: "",
          salesman: "",
          notes: "",
          totalAmount: 0,
        })
        setOrderItems([])
      } else {
        throw new Error("Failed to save order")
      }
    } catch (error) {
      console.error("Error saving order:", error)
      toast({
        title: tr("خطأ"),
        description: tr("حدث خطأ أثناء حفظ الطلبية"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInstallApp = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === "accepted") {
      setShowInstallPrompt(false)
    }

    setDeferredPrompt(null)
  }

  const [orderForm, setOrderForm] = useState({
    customerName: "",
    customerId: "",
    salesman: "",
    notes: "",
    totalAmount: 0,
  })

  const [newItem, setNewItem] = useState({
    product_name: "",
    quantity: 1,
    unit_price: 0,
  })

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {showInstallPrompt && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">{tr("تثبيت التطبيق")}</h3>
                <p className="text-sm text-blue-700">{tr("ثبت التطبيق على جهازك للوصول السريع")}</p>
              </div>
              <Button onClick={handleInstallApp} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Download className="w-4 h-4 me-2" />
                {tr("تثبيت")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">{tr("إدخال طلبية جديدة")}</h1>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm">
            <List className="w-4 h-4 me-2" />
            {tr("عرض الطلبيات")}
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{tr("بيانات العميل")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="customer">{tr("العميل *")}</Label>
            <Select
              value={orderForm.customerId}
              onValueChange={(value) => {
                const customer = customers.find((c) => c.id.toString() === value)
                setOrderForm((prev) => ({
                  ...prev,
                  customerId: value,
                  customerName: customer?.customer_name || "",
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={tr("اختر العميل")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id.toString()}>
                    {customer.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="salesman">{tr("المندوب")}</Label>
            <Input
              id="salesman"
              value={orderForm.salesman}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, salesman: e.target.value }))}
              placeholder={tr("اسم المندوب")}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{tr("إضافة صنف")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="product">{tr("اسم الصنف *")}</Label>
            <Input
              id="product"
              value={newItem.product_name}
              onChange={(e) => setNewItem((prev) => ({ ...prev, product_name: e.target.value }))}
              placeholder={tr("اسم الصنف")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">{tr("الكمية *")}</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={newItem.quantity}
                onChange={(e) => setNewItem((prev) => ({ ...prev, quantity: Number.parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <Label htmlFor="price">{tr("السعر *")}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={newItem.unit_price}
                onChange={(e) =>
                  setNewItem((prev) => ({ ...prev, unit_price: Number.parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          <Button onClick={addOrderItem} className="w-full">
            <Plus className="w-4 h-4 me-2" />
            {tr("إضافة الصنف")}
          </Button>
        </CardContent>
      </Card>

      {orderItems.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{tr("أصناف الطلبية")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.product_name}</div>
                    <div className="text-xs text-gray-600">
                      {item.quantity} × {item.unit_price.toFixed(2)} = {item.total.toFixed(2)}{tr(" ريال")}
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => removeOrderItem(item.id)}>
                    {tr("حذف")}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t">
              <div className="flex justify-between items-center font-bold text-lg">
                <span>{tr("الإجمالي:")}</span>
                <span>{orderForm.totalAmount.toFixed(2)}{tr(" ريال")}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{tr("ملاحظات")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={orderForm.notes}
            onChange={(e) => setOrderForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder={tr("ملاحظات إضافية...")}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="fixed bottom-4 end-4 start-4">
        <Button
          onClick={handleSaveOrder}
          disabled={loading || !orderForm.customerName || orderItems.length === 0}
          className="w-full h-12 text-lg"
        >
          {loading ? (
            tr("جاري الحفظ...")
          ) : (
            <>
              <Save className="w-5 h-5 me-2" />
              {tr("حفظ الطلبية")}
            </>
          )}
        </Button>
      </div>

      <div className="h-20"></div>
    </div>
  )
}
