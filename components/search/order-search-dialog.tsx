"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, FileText, ShoppingCart, Package } from "lucide-react"

interface Order {
  id: number
  order_number: string
  order_date: string
  customer_name?: string
  supplier_name?: string
  total_amount: number
  currency_code: string
  order_status?: string
  workflow_status?: string
  type: "sales" | "purchase"
}

interface OrderSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrderSelect: (orderNumber: string) => void
  orderType?: "sales" | "purchase" | "both"
}

export function OrderSearchDialog({ open, onOpenChange, onOrderSelect, orderType = "both" }: OrderSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && searchTerm.length >= 2) {
      searchOrders()
    } else {
      setOrders([])
    }
  }, [searchTerm, open, orderType])

  const searchOrders = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/orders/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchTerm,
          orderType: orderType,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setOrders(data.orders || [])
      }
    } catch (error) {
      console.error("Error searching orders:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleOrderSelect = (order: Order) => {
    onOrderSelect(order.order_number)
    onOpenChange(false)
    setSearchTerm("")
    setOrders([])
  }

  const getStatusBadge = (order: Order) => {
    const status = order.order_status || order.workflow_status || "pending"
    const statusColors = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      shipped: "bg-purple-100 text-purple-800",
      delivered: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
      completed: "bg-green-100 text-green-800",
    }

    const statusLabels = {
      pending: "قيد التنفيذ",
      confirmed: "مؤكدة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغاة",
      completed: "مكتملة",
    }

    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"}>
        {statusLabels[status as keyof typeof statusLabels] || status}
      </Badge>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث عن الطلبيات
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم الطلبية أو اسم العميل/المورد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-right pr-10"
              dir="rtl"
            />
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <p className="mt-2 text-sm text-muted-foreground">جاري البحث...</p>
            </div>
          )}

          {orders.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">رقم الطلبية</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">العميل/المورد</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={`${order.type}-${order.id}`} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {order.type === "sales" ? (
                            <ShoppingCart className="h-4 w-4 text-green-600" />
                          ) : (
                            <Package className="h-4 w-4 text-blue-600" />
                          )}
                          <span className="text-sm">{order.type === "sales" ? "مبيعات" : "مشتريات"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{new Date(order.order_date).toLocaleDateString("ar-SA")}</TableCell>
                      <TableCell>{order.customer_name || order.supplier_name}</TableCell>
                      <TableCell>
                        {order.total_amount.toFixed(2)} {order.currency_code}
                      </TableCell>
                      <TableCell>{getStatusBadge(order)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => handleOrderSelect(order)} className="search-button">
                          اختيار
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {searchTerm.length >= 2 && orders.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد طلبيات تطابق البحث</p>
              <p className="text-sm mt-1">جرب البحث برقم طلبية مختلف أو اسم عميل/مورد</p>
            </div>
          )}

          {searchTerm.length < 2 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>أدخل على الأقل حرفين للبحث</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
