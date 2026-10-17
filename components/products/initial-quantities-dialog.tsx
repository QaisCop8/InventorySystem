"use client"

import { showAlert } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Save, X, Warehouse, Package, Hash } from "lucide-react"

interface InitialQuantity {
  id: string
  warehouse_id: string
  warehouse_name: string
  quantity: number
  lot_number?: string
  expiry_date?: string
  manufacturing_date?: string
  cost_per_unit?: number
}

interface InitialQuantitiesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId?: number
  productName: string
  hasExpiryTracking: boolean
  hasBatchTracking: boolean
  onSave: (quantities: InitialQuantity[]) => void
}

export function InitialQuantitiesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  hasExpiryTracking,
  hasBatchTracking,
  onSave,
}: InitialQuantitiesDialogProps) {
  const [quantities, setQuantities] = useState<InitialQuantity[]>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      fetchWarehouses()
      if (quantities.length === 0) {
        addNewQuantity()
      }
    }
  }, [open])

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses")
      if (response.ok) {
        const data = await response.json()
        setWarehouses(data)
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error)
    }
  }

  const addNewQuantity = () => {
    const newQuantity: InitialQuantity = {
      id: Date.now().toString(),
      warehouse_id: "",
      warehouse_name: "",
      quantity: 0,
      lot_number: hasBatchTracking ? "" : undefined,
      expiry_date: hasExpiryTracking ? "" : undefined,
      manufacturing_date: hasExpiryTracking ? "" : undefined,
      cost_per_unit: 0,
    }
    setQuantities((prev) => [...prev, newQuantity])
  }

  const removeQuantity = (id: string) => {
    setQuantities((prev) => prev.filter((q) => q.id !== id))
  }

  const updateQuantity = (id: string, field: keyof InitialQuantity, value: any) => {
    setQuantities((prev) =>
      prev.map((q) => {
        if (q.id === id) {
          const updated = { ...q, [field]: value }

          // Update warehouse name when warehouse_id changes
          if (field === "warehouse_id") {
            const warehouse = warehouses.find((w) => w.id.toString() === value)
            updated.warehouse_name = warehouse?.name || ""
          }

          return updated
        }
        return q
      }),
    )
  }

  const validateQuantities = (): string[] => {
    const errors: string[] = []
    const usedWarehouses = new Set<string>()

    quantities.forEach((qty, index) => {
      const rowNum = index + 1

      if (!qty.warehouse_id) {
        errors.push(`الصف ${rowNum}: يجب اختيار المستودع`)
      } else if (usedWarehouses.has(qty.warehouse_id)) {
        errors.push(`الصف ${rowNum}: المستودع مستخدم مسبقاً`)
      } else {
        usedWarehouses.add(qty.warehouse_id)
      }

      if (qty.quantity <= 0) {
        errors.push(`الصف ${rowNum}: الكمية يجب أن تكون أكبر من صفر`)
      }

      if (hasBatchTracking && !qty.lot_number?.trim()) {
        errors.push(`الصف ${rowNum}: رقم الدفعة مطلوب`)
      }

      if (hasExpiryTracking && !qty.expiry_date) {
        errors.push(`الصف ${rowNum}: تاريخ الانتهاء مطلوب`)
      }

      if (qty.cost_per_unit && qty.cost_per_unit <= 0) {
        errors.push(`الصف ${rowNum}: تكلفة الوحدة يجب أن تكون أكبر من صفر`)
      }
    })

    return errors
  }

  const handleSave = async () => {
    const errors = validateQuantities()
    if (errors.length > 0) {
      showAlert("يرجى تصحيح الأخطاء التالية:\n" + errors.join("\n"))
      return
    }

    setIsSaving(true)
    try {
      // Save initial quantities and create lots if needed
      for (const qty of quantities) {
        // Create warehouse stock entry
        await fetch("/api/inventory/warehouse-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            warehouse_id: qty.warehouse_id,
            warehouse_name: qty.warehouse_name,
            available_quantity: qty.quantity,
            actual_balance: qty.quantity,
            inventory_value: (qty.cost_per_unit || 0) * qty.quantity,
            stock_status: "متوفر",
          }),
        })

        // Create lot if batch tracking is enabled
        if (hasBatchTracking && qty.lot_number) {
          await fetch("/api/inventory/lots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: productId,
              lot_number: qty.lot_number,
              purchase_quantity: qty.quantity,
              current_quantity: qty.quantity,
              expiry_date: qty.expiry_date || null,
              manufacturing_date: qty.manufacturing_date || null,
              warehouse_name: qty.warehouse_name,
              cost_per_unit: qty.cost_per_unit || 0,
              status: "جديد",
            }),
          })
        }
      }

      onSave(quantities)
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving initial quantities:", error)
      showAlert("حدث خطأ في حفظ الكميات الابتدائية")
    } finally {
      setIsSaving(false)
    }
  }

  const totalQuantity = quantities.reduce((sum, qty) => sum + qty.quantity, 0)
  const totalValue = quantities.reduce((sum, qty) => sum + qty.quantity * (qty.cost_per_unit || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            إدخال الكميات الابتدائية - {productName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">إجمالي الكمية</p>
                    <p className="text-2xl font-bold">{totalQuantity}</p>
                  </div>
                  <Package className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">عدد المستودعات</p>
                    <p className="text-2xl font-bold">{quantities.length}</p>
                  </div>
                  <Warehouse className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">إجمالي القيمة</p>
                    <p className="text-2xl font-bold">{totalValue.toFixed(2)}</p>
                  </div>
                  <Hash className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tracking Info */}
          <div className="flex gap-2">
            {hasBatchTracking && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                تتبع الدفعات مفعل
              </Badge>
            )}
            {hasExpiryTracking && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                تتبع الصلاحية مفعل
              </Badge>
            )}
          </div>

          {/* Quantities Table */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">الكميات حسب المستودع</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addNewQuantity}
                  className="flex items-center gap-2 bg-transparent"
                >
                  <Plus className="h-4 w-4" />
                  إضافة مستودع
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المستودع</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">تكلفة الوحدة</TableHead>
                      {hasBatchTracking && <TableHead className="text-right">رقم الدفعة</TableHead>}
                      {hasExpiryTracking && <TableHead className="text-right">تاريخ الإنتاج</TableHead>}
                      {hasExpiryTracking && <TableHead className="text-right">تاريخ الانتهاء</TableHead>}
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quantities.map((qty) => (
                      <TableRow key={qty.id}>
                        <TableCell>
                          <Select
                            value={qty.warehouse_id}
                            onValueChange={(value) => updateQuantity(qty.id, "warehouse_id", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر المستودع" />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses.map((warehouse) => (
                                <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                  {warehouse.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={qty.quantity}
                            onChange={(e) => updateQuantity(qty.id, "quantity", Number(e.target.value) || 0)}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={qty.cost_per_unit || ""}
                            onChange={(e) => updateQuantity(qty.id, "cost_per_unit", Number(e.target.value) || 0)}
                            className="text-right"
                            placeholder="0.00"
                          />
                        </TableCell>
                        {hasBatchTracking && (
                          <TableCell>
                            <Input
                              value={qty.lot_number || ""}
                              onChange={(e) => updateQuantity(qty.id, "lot_number", e.target.value)}
                              className="text-right"
                              placeholder="رقم الدفعة"
                            />
                          </TableCell>
                        )}
                        {hasExpiryTracking && (
                          <TableCell>
                            <Input
                              type="date"
                              value={qty.manufacturing_date || ""}
                              onChange={(e) => updateQuantity(qty.id, "manufacturing_date", e.target.value)}
                              className="text-right"
                            />
                          </TableCell>
                        )}
                        {hasExpiryTracking && (
                          <TableCell>
                            <Input
                              type="date"
                              value={qty.expiry_date || ""}
                              onChange={(e) => updateQuantity(qty.id, "expiry_date", e.target.value)}
                              className="text-right"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeQuantity(qty.id)}
                            disabled={quantities.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Alert>
            <Package className="h-4 w-4" />
            <AlertDescription>
              <strong>تعليمات:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>أدخل الكميات الابتدائية لكل مستودع</li>
                <li>يمكن إدخال تكلفة الوحدة لحساب قيمة المخزون</li>
                {hasBatchTracking && <li>رقم الدفعة مطلوب لأن تتبع الدفعات مفعل</li>}
                {hasExpiryTracking && <li>تواريخ الإنتاج والانتهاء مطلوبة لأن تتبع الصلاحية مفعل</li>}
                <li>سيتم إنشاء دفعات تلقائياً للمنتجات التي تحتوي على تتبع دفعات</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              <X className="h-4 w-4 mr-2" />
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || quantities.length === 0}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "جاري الحفظ..." : "حفظ الكميات"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
