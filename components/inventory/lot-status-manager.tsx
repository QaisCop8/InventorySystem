"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Package, Edit, AlertTriangle, CheckCircle, Clock } from "lucide-react"

interface ProductLot {
  id: number
  product_id: number
  lot_number: string
  product_name: string
  product_code: string
  manufacturing_date?: string
  expiry_date?: string
  initial_quantity: number
  current_quantity: number
  available_quantity: number
  unit_cost: number
  status: "new" | "in_use" | "finished" | "damaged"
  status_changed_at?: string
  status_changed_by?: string
  status_notes?: string
  created_at: string
}

export function LotStatusManager() {
  const [lots, setLots] = useState<ProductLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLot, setSelectedLot] = useState<ProductLot | null>(null)
  const [newStatus, setNewStatus] = useState<"new" | "in_use" | "finished" | "damaged">("new")
  const [statusNotes, setStatusNotes] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filters, setFilters] = useState({
    status: "",
    search: "",
  })

  useEffect(() => {
    fetchLots()
  }, [filters])

  const fetchLots = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filters.status) params.append("status", filters.status)
      if (filters.search) params.append("search", filters.search)

      const response = await fetch(`/api/inventory/lots?${params}`)
      if (!response.ok) {
        throw new Error("فشل في تحميل الدفعات")
      }

      const data = await response.json()
      setLots(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async () => {
    if (!selectedLot) return

    try {
      const response = await fetch(`/api/inventory/lots/${selectedLot.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes,
          changed_by: "المستخدم الحالي", // يمكن تحديثه لاحقاً مع نظام المصادقة
        }),
      })

      if (!response.ok) {
        throw new Error("فشل في تغيير حالة الدفعة")
      }

      setIsDialogOpen(false)
      setSelectedLot(null)
      setStatusNotes("")
      fetchLots()
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    }
  }

  const getLotStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-100 text-blue-800">جديد</Badge>
      case "in_use":
        return <Badge className="bg-green-100 text-green-800">قيد الاستخدام</Badge>
      case "finished":
        return <Badge className="bg-gray-100 text-gray-800">منتهي</Badge>
      case "damaged":
        return <Badge className="bg-red-100 text-red-800">تالف/مغلق</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new":
        return <Package className="h-4 w-4 text-blue-600" />
      case "in_use":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "finished":
        return <Clock className="h-4 w-4 text-gray-600" />
      case "damaged":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Package className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الدفعات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir="rtl">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">إدارة حالات الدفعات</h1>
          <p className="text-muted-foreground mt-1">تغيير حالة الدفعات يدوياً</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>البحث والتصفية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>البحث</Label>
              <Input
                placeholder="رقم الدفعة أو اسم المنتج"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>

            <div>
              <Label>حالة الدفعة</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="new">جديد</SelectItem>
                  <SelectItem value="in_use">قيد الاستخدام</SelectItem>
                  <SelectItem value="finished">منتهي</SelectItem>
                  <SelectItem value="damaged">تالف/مغلق</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={() => setFilters({ status: "", search: "" })}>
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lots List */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الدفعات</CardTitle>
          <CardDescription>عرض {lots.length} دفعة</CardDescription>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد دفعات</h3>
              <p className="text-muted-foreground">لم يتم العثور على أي دفعات تطابق معايير البحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-3 font-semibold">رقم الدفعة</th>
                    <th className="text-right p-3 font-semibold">المنتج</th>
                    <th className="text-right p-3 font-semibold">الحالة الحالية</th>
                    <th className="text-right p-3 font-semibold">الكمية الحالية</th>
                    <th className="text-right p-3 font-semibold">تاريخ آخر تغيير</th>
                    <th className="text-right p-3 font-semibold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium">{lot.lot_number}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{lot.product_name}</div>
                          <div className="text-sm text-muted-foreground">{lot.product_code}</div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(lot.status)}
                          {getLotStatusBadge(lot.status)}
                        </div>
                      </td>
                      <td className="p-3 font-medium">{lot.current_quantity.toLocaleString("en-US")}</td>
                      <td className="p-3">
                        {lot.status_changed_at
                          ? new Date(lot.status_changed_at).toLocaleDateString("en-GB")
                          : new Date(lot.created_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="p-3">
                        <Dialog open={isDialogOpen && selectedLot?.id === lot.id} onOpenChange={setIsDialogOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedLot(lot)
                                setNewStatus(lot.status)
                                setStatusNotes("")
                              }}
                            >
                              <Edit className="h-4 w-4 ml-1" />
                              تغيير الحالة
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]" dir="rtl">
                            <DialogHeader>
                              <DialogTitle>تغيير حالة الدفعة</DialogTitle>
                              <DialogDescription>تغيير حالة الدفعة رقم {selectedLot?.lot_number}</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div>
                                <Label>الحالة الجديدة</Label>
                                <Select value={newStatus} onValueChange={(value: any) => setNewStatus(value)}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="new">جديد</SelectItem>
                                    <SelectItem value="in_use">قيد الاستخدام</SelectItem>
                                    <SelectItem value="finished">منتهي</SelectItem>
                                    <SelectItem value="damaged">تالف/مغلق</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>ملاحظات</Label>
                                <Textarea
                                  placeholder="سبب تغيير الحالة..."
                                  value={statusNotes}
                                  onChange={(e) => setStatusNotes(e.target.value)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                إلغاء
                              </Button>
                              <Button onClick={handleStatusChange}>تغيير الحالة</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
