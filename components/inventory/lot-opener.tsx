"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Package, Unlock, AlertTriangle, Search, Filter } from "lucide-react"

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

export function LotOpener() {
  const [lots, setLots] = useState<ProductLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLots, setSelectedLots] = useState<number[]>([])
  const [openingNotes, setOpeningNotes] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filters, setFilters] = useState({
    search: "",
    product_id: "",
  })

  useEffect(() => {
    fetchNewLots()
  }, [filters])

  const fetchNewLots = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.append("status", "new") // فقط الدفعات الجديدة
      if (filters.search) params.append("search", filters.search)
      if (filters.product_id) params.append("product_id", filters.product_id)

      const response = await fetch(`/api/inventory/lots?${params}`)
      if (!response.ok) {
        throw new Error("فشل في تحميل الدفعات الجديدة")
      }

      const data = await response.json()
      setLots(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    } finally {
      setLoading(false)
    }
  }

  const handleLotSelection = (lotId: number, selected: boolean) => {
    if (selected) {
      setSelectedLots((prev) => [...prev, lotId])
    } else {
      setSelectedLots((prev) => prev.filter((id) => id !== lotId))
    }
  }

  const handleSelectAll = () => {
    if (selectedLots.length === lots.length) {
      setSelectedLots([])
    } else {
      setSelectedLots(lots.map((lot) => lot.id))
    }
  }

  const handleOpenLots = async () => {
    if (selectedLots.length === 0) return

    try {
      setError(null)

      // فتح كل دفعة محددة
      const promises = selectedLots.map((lotId) =>
        fetch(`/api/inventory/lots/${lotId}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "in_use",
            notes: `فتح الدفعة للاستخدام. ${openingNotes}`.trim(),
            changed_by: "المستخدم الحالي", // يمكن تحديثه لاحقاً مع نظام المصادقة
          }),
        }),
      )

      const results = await Promise.all(promises)
      const failedRequests = results.filter((response) => !response.ok)

      if (failedRequests.length > 0) {
        throw new Error(`فشل في فتح ${failedRequests.length} من ${selectedLots.length} دفعة`)
      }

      setIsDialogOpen(false)
      setSelectedLots([])
      setOpeningNotes("")
      fetchNewLots()
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "غير محدد"
    return new Date(dateString).toLocaleDateString("en-GB")
  }

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null
    const today = new Date()
    const expiry = new Date(expiryDate)
    const diffTime = expiry.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getExpiryBadge = (expiryDate?: string) => {
    const days = getDaysUntilExpiry(expiryDate)
    if (days === null) return null

    if (days < 0) {
      return <Badge variant="destructive">منتهي الصلاحية</Badge>
    } else if (days <= 30) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          ينتهي خلال {days} يوم
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          صالح ({days} يوم)
        </Badge>
      )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الدفعات الجديدة...</p>
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
          <h1 className="text-3xl font-bold text-foreground">فتح الدفعات</h1>
          <p className="text-muted-foreground mt-1">تغيير حالة الدفعات الجديدة إلى قيد الاستخدام</p>
        </div>

        {selectedLots.length > 0 && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Unlock className="h-4 w-4 ml-2" />
                فتح {selectedLots.length} دفعة
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]" dir="rtl">
              <DialogHeader>
                <DialogTitle>تأكيد فتح الدفعات</DialogTitle>
                <DialogDescription>
                  سيتم تغيير حالة {selectedLots.length} دفعة من "جديد" إلى "قيد الاستخدام"
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea
                    placeholder="سبب فتح الدفعات..."
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleOpenLots} className="bg-green-600 hover:bg-green-700">
                  تأكيد الفتح
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            البحث والتصفية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>البحث</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="رقم الدفعة أو اسم المنتج"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="pr-10"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={() => setFilters({ search: "", product_id: "" })}>
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lots List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>الدفعات الجديدة</CardTitle>
              <CardDescription>عرض {lots.length} دفعة جديدة متاحة للفتح</CardDescription>
            </div>
            {lots.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedLots.length === lots.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد دفعات جديدة</h3>
              <p className="text-muted-foreground">جميع الدفعات إما مفتوحة أو منتهية</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedLots.length === lots.length && lots.length > 0}
                        onChange={handleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="text-right p-3 font-semibold">رقم الدفعة</th>
                    <th className="text-right p-3 font-semibold">المنتج</th>
                    <th className="text-right p-3 font-semibold">الكمية</th>
                    <th className="text-right p-3 font-semibold">تاريخ الإنتاج</th>
                    <th className="text-right p-3 font-semibold">تاريخ الانتهاء</th>
                    <th className="text-right p-3 font-semibold">حالة الصلاحية</th>
                    <th className="text-right p-3 font-semibold">تاريخ الإنشاء</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedLots.includes(lot.id)}
                          onChange={(e) => handleLotSelection(lot.id, e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      <td className="p-3 font-medium">{lot.lot_number}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{lot.product_name}</div>
                          <div className="text-sm text-muted-foreground">{lot.product_code}</div>
                        </div>
                      </td>
                      <td className="p-3 font-medium">{lot.current_quantity.toLocaleString("en-US")}</td>
                      <td className="p-3">{formatDate(lot.manufacturing_date)}</td>
                      <td className="p-3">{formatDate(lot.expiry_date)}</td>
                      <td className="p-3">{getExpiryBadge(lot.expiry_date)}</td>
                      <td className="p-3">{formatDate(lot.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      {lots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ملخص الدفعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{lots.length}</div>
                <p className="text-sm text-muted-foreground">إجمالي الدفعات الجديدة</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{selectedLots.length}</div>
                <p className="text-sm text-muted-foreground">دفعات محددة للفتح</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {
                    lots.filter(
                      (lot) =>
                        getDaysUntilExpiry(lot.expiry_date) !== null && getDaysUntilExpiry(lot.expiry_date)! <= 30,
                    ).length
                  }
                </div>
                <p className="text-sm text-muted-foreground">دفعات قريبة الانتهاء</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {
                    lots.filter(
                      (lot) => getDaysUntilExpiry(lot.expiry_date) !== null && getDaysUntilExpiry(lot.expiry_date)! < 0,
                    ).length
                  }
                </div>
                <p className="text-sm text-muted-foreground">دفعات منتهية الصلاحية</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
