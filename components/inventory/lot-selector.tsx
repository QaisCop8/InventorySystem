"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Package, AlertTriangle, CheckCircle, Clock, Calendar } from "lucide-react"

interface ProductLot {
  lot_id: number
  batch_number: string
  manufacturing_date?: string
  expiry_date?: string
  current_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number
  status: string
  supplier_name?: string
  days_until_expiry?: number
  expiry_status: string
}

interface LotAllocation {
  lot_id: number
  batch_number: string
  expiry_date?: string
  manufacturing_date?: string
  unit_cost: number
  quantity: number
  available_quantity: number
  expiry_status: string
  days_until_expiry?: number
  supplier_name?: string
}

interface LotSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: number
  productName: string
  requestedQuantity: number
  onLotsSelected: (selectedLots: LotAllocation[]) => void
}

export function LotSelector({
  open,
  onOpenChange,
  productId,
  productName,
  requestedQuantity,
  onLotsSelected,
}: LotSelectorProps) {
  const [lots, setLots] = useState<ProductLot[]>([])
  const [selectedLots, setSelectedLots] = useState<LotAllocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fifoAllocation, setFifoAllocation] = useState<any>(null)

  useEffect(() => {
    if (open && productId) {
      fetchAvailableLots()
    }
  }, [open, productId, requestedQuantity])

  const fetchAvailableLots = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/inventory/batches?product_id=${productId}&quantity=${requestedQuantity}`)
      if (!response.ok) {
        throw new Error(tr("فشل في تحميل الدفعات المتاحة"))
      }

      const data = await response.json()

      const lotsData =
        data.batches?.map((batch: any) => ({
          lot_id: batch.lotId,
          batch_number: batch.batchNumber,
          manufacturing_date: batch.manufacturingDate,
          expiry_date: batch.expiryDate,
          current_quantity: batch.currentQuantity,
          reserved_quantity: batch.reservedQuantity,
          available_quantity: batch.availableQuantity,
          unit_cost: batch.unitCost,
          status: batch.status,
          supplier_name: batch.supplierName,
          days_until_expiry: batch.daysUntilExpiry,
          expiry_status: batch.expiryStatus,
        })) || []

      setLots(lotsData)
      setFifoAllocation(data.allocation || null)

      if (data.allocation && data.allocation.allocations) {
        const allocations = data.allocation.allocations.map((alloc: any) => ({
          lot_id: alloc.lotId,
          batch_number: alloc.batchNumber,
          expiry_date: alloc.expiryDate,
          manufacturing_date: alloc.manufacturingDate,
          unit_cost: alloc.unitCost,
          quantity: alloc.allocatedQuantity,
          available_quantity: alloc.availableQuantity,
          expiry_status: alloc.expiryStatus,
          days_until_expiry: alloc.daysUntilExpiry,
          supplier_name: alloc.supplierName,
        }))
        setSelectedLots(allocations)
      }
    } catch (err) {
      console.error("[v0] Error fetching lots:", err)
      setError(err instanceof Error ? err.message : tr("حدث خطأ غير متوقع"))
    } finally {
      setLoading(false)
    }
  }

  const updateLotQuantity = (lotId: number, quantity: number) => {
    setSelectedLots((prev) => {
      const existing = prev.find((s) => s.lot_id === lotId)
      const lot = lots.find((l) => l.lot_id === lotId)

      if (!lot) return prev

      if (existing) {
        if (quantity <= 0) {
          return prev.filter((s) => s.lot_id !== lotId)
        }
        return prev.map((s) =>
          s.lot_id === lotId ? { ...s, quantity: Math.min(quantity, lot.available_quantity) } : s,
        )
      } else if (quantity > 0) {
        const newAllocation: LotAllocation = {
          lot_id: lotId,
          batch_number: lot.batch_number,
          expiry_date: lot.expiry_date,
          manufacturing_date: lot.manufacturing_date,
          unit_cost: lot.unit_cost,
          quantity: Math.min(quantity, lot.available_quantity),
          available_quantity: lot.available_quantity,
          expiry_status: lot.expiry_status,
          days_until_expiry: lot.days_until_expiry,
          supplier_name: lot.supplier_name,
        }
        return [...prev, newAllocation]
      }
      return prev
    })
  }

  const getTotalSelectedQuantity = () => {
    return selectedLots.reduce((sum, lot) => sum + lot.quantity, 0)
  }

  const getExpiryStatusDisplay = (expiryStatus: string, daysUntilExpiry?: number) => {
    switch (expiryStatus) {
      case "expired":
        return { label: tr("منتهي الصلاحية"), color: "bg-red-100 text-red-800", icon: AlertTriangle }
      case "near_expiry":
        return {
          label: daysUntilExpiry ? tr("{0} يوم متبقي", daysUntilExpiry) : tr("قريب الانتهاء"),
          color: "bg-yellow-100 text-yellow-800",
          icon: Clock,
        }
      case "good":
        return { label: tr("صالح"), color: "bg-green-100 text-green-800", icon: CheckCircle }
      case "no_expiry":
        return { label: tr("بدون انتهاء"), color: "bg-gray-100 text-gray-800", icon: Calendar }
      default:
        return { label: tr("غير محدد"), color: "bg-gray-100 text-gray-800", icon: Calendar }
    }
  }

  const handleConfirm = () => {
    const totalSelected = getTotalSelectedQuantity()
    if (totalSelected === 0) {
      setError(tr("يجب اختيار كمية من الدفعات المتاحة"))
      return
    }

    if (totalSelected > requestedQuantity) {
      setError(tr("الكمية المحددة ({0}) أكبر من الكمية المطلوبة ({1})", totalSelected, requestedQuantity))
      return
    }

    onLotsSelected(selectedLots)
    onOpenChange(false)
  }

  const handleCancel = () => {
    setSelectedLots([])
    setError(null)
    onOpenChange(false)
  }

  const resetToFIFO = () => {
    if (fifoAllocation && fifoAllocation.allocations) {
      const allocations = fifoAllocation.allocations.map((alloc: any) => ({
        lot_id: alloc.lotId,
        batch_number: alloc.batchNumber,
        expiry_date: alloc.expiryDate,
        manufacturing_date: alloc.manufacturingDate,
        unit_cost: alloc.unitCost,
        quantity: alloc.allocatedQuantity,
        available_quantity: alloc.availableQuantity,
        expiry_status: alloc.expiryStatus,
        days_until_expiry: alloc.daysUntilExpiry,
        supplier_name: alloc.supplierName,
      }))
      setSelectedLots(allocations)
      setError(null)
    }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl" dir={appDir()}>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>{tr("جاري تحميل الدفعات المتاحة...")}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden" dir={appDir()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {tr("اختيار الدفعات (FIFO) - ")}{productName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">{tr("الكمية المطلوبة:")}</span>
                <span className="ms-2 text-blue-600 font-bold">{requestedQuantity}</span>
              </div>
              <div>
                <span className="font-medium">{tr("الكمية المحددة:")}</span>
                <span className="ms-2 text-green-600 font-bold">{getTotalSelectedQuantity()}</span>
              </div>
              <div>
                <span className="font-medium">{tr("المتبقي:")}</span>
                <span className="ms-2 text-orange-600 font-bold">{requestedQuantity - getTotalSelectedQuantity()}</span>
              </div>
              <div>
                <span className="font-medium">{tr("إجمالي متاح:")}</span>
                <span className="ms-2 text-purple-600 font-bold">
                  {lots.reduce((sum, lot) => sum + lot.available_quantity, 0)}
                </span>
              </div>
            </div>

            {fifoAllocation && !fifoAllocation.canFulfill && (
              <div className="mt-2 p-2 bg-yellow-100 rounded text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4 inline ms-2" />
                {tr("تحذير: الكمية المتاحة غير كافية لتلبية الطلب بالكامل")}
              </div>
            )}
          </div>

          {fifoAllocation && fifoAllocation.allocations && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">{tr("تم اختيار الدفعات تلقائياً حسب نظام FIFO (الأقدم أولاً)")}</div>
              <Button variant="outline" size="sm" onClick={resetToFIFO}>
                {tr("إعادة تعيين FIFO")}
              </Button>
            </div>
          )}

          <div className="overflow-y-auto max-h-96">
            {lots.length === 0 ? (
              <div className="text-center py-8">
                <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">{tr("لا توجد دفعات متاحة")}</h3>
                <p className="text-muted-foreground">{tr("لا توجد دفعات متاحة لهذا المنتج")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lots.map((lot) => {
                  const expiryDisplay = getExpiryStatusDisplay(lot.expiry_status, lot.days_until_expiry)
                  const selectedLot = selectedLots.find((s) => s.lot_id === lot.lot_id)
                  const selectedQuantity = selectedLot?.quantity || 0
                  const IconComponent = expiryDisplay.icon

                  return (
                    <div key={lot.lot_id} className="border rounded-lg p-4 space-y-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="font-medium text-lg">{tr("دفعة: ")}{lot.batch_number}</div>
                          <Badge className={expiryDisplay.color}>
                            <IconComponent className="h-3 w-3 ms-1" />
                            {expiryDisplay.label}
                          </Badge>
                          {lot.status !== "active" && <Badge variant="secondary">{tr("غير نشط")}</Badge>}
                          {selectedQuantity > 0 && (
                            <Badge variant="default" className="bg-blue-100 text-blue-800">
                              {tr("محدد: ")}{selectedQuantity}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {tr("متاح: ")}{lot.available_quantity}{tr(" | محجوز: ")}{lot.reserved_quantity}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        {lot.manufacturing_date && (
                          <div>
                            <span className="font-medium">{tr("تاريخ الإنتاج:")}</span>
                            <div className="text-muted-foreground">{lot.manufacturing_date}</div>
                          </div>
                        )}
                        {lot.expiry_date && (
                          <div>
                            <span className="font-medium">{tr("تاريخ الانتهاء:")}</span>
                            <div className="text-muted-foreground">{lot.expiry_date}</div>
                          </div>
                        )}
                        <div>
                          <span className="font-medium">{tr("تكلفة الوحدة:")}</span>
                          <div className="text-muted-foreground">{lot.unit_cost.toFixed(2)}{tr(" ريال")}</div>
                        </div>
                        <div>
                          <span className="font-medium">{tr("الكمية الحالية:")}</span>
                          <div className="text-muted-foreground">{lot.current_quantity}</div>
                        </div>
                        {lot.supplier_name && (
                          <div>
                            <span className="font-medium">{tr("المورد:")}</span>
                            <div className="text-muted-foreground">{lot.supplier_name}</div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Label htmlFor={`quantity-${lot.lot_id}`} className="text-sm font-medium">
                            {tr("الكمية المطلوبة من هذه الدفعة")}
                          </Label>
                          <Input
                            id={`quantity-${lot.lot_id}`}
                            type="number"
                            min="0"
                            max={lot.available_quantity}
                            value={selectedQuantity}
                            onChange={(e) => updateLotQuantity(lot.lot_id, Number(e.target.value) || 0)}
                            className="text-start mt-1"
                            placeholder="0"
                          />
                        </div>
                        <div className="text-sm text-muted-foreground pt-6">{tr("الحد الأقصى: ")}{lot.available_quantity}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-4 justify-end border-t pt-4">
            <Button variant="outline" onClick={handleCancel}>
              {tr("إلغاء")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={getTotalSelectedQuantity() === 0}
              className="bg-primary hover:bg-primary/90"
            >
              <CheckCircle className="h-4 w-4 ms-2" />
              {tr("تأكيد الاختيار (")}{getTotalSelectedQuantity()})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
