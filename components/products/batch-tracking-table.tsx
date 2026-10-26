"use client"

import { showAlert } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Edit, Package2, Calendar } from "lucide-react"

interface BatchData {
  id?: number
  lot_number: string
  manufacturing_date: string
  expiry_date: string
  supplier_id: number
  supplier_name: string
  initial_quantity: number
  current_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number
  warehouse_id: number
  warehouse_name: string
  floor: string
  area: string
  shelf: string
  status: string
  notes: string
}

interface BatchTrackingTableProps {
  productId?: number
  onDataChange?: (data: BatchData[]) => void
  readOnly?: boolean
}

export function BatchTrackingTable({ productId, onDataChange, readOnly = false }: BatchTrackingTableProps) {
  const [batchData, setBatchData] = useState<BatchData[]>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const statuses = ["نشط", "منتهي الصلاحية", "مسترد", "نفد المخزون", "محجوز"]

  useEffect(() => {
    fetchSuppliers()
    fetchWarehouses()
    if (productId) {
      fetchProductBatches()
    }
  }, [productId])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch("/api/suppliers")
      if (response.ok) {
        const data = await response.json()
        setSuppliers(data)
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    }
  }

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

  const fetchProductBatches = async () => {
    if (!productId) return

    try {
      setLoading(true)
      const response = await fetch(`/api/inventory/products/${productId}/lots`)
      if (response.ok) {
        const data = await response.json()
        setBatchData(data)
        onDataChange?.(data)
      }
    } catch (error) {
      console.error("Error fetching product batches:", error)
    } finally {
      setLoading(false)
    }
  }

  const addNewRow = () => {
    const newRow: BatchData = {
      lot_number: "",
      manufacturing_date: "",
      expiry_date: "",
      supplier_id: 0,
      supplier_name: "",
      initial_quantity: 0,
      current_quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      unit_cost: 0,
      warehouse_id: 0,
      warehouse_name: "",
      floor: "",
      area: "",
      shelf: "",
      status: "نشط",
      notes: "",
    }

    const newData = [...batchData, newRow]
    setBatchData(newData)
    setEditingIndex(newData.length - 1)
    onDataChange?.(newData)
  }

  const updateRow = (index: number, field: keyof BatchData, value: any) => {
    const newData = [...batchData]
    newData[index] = { ...newData[index], [field]: value }

    // Auto-calculate available quantity
    if (field === "current_quantity" || field === "reserved_quantity") {
      newData[index].available_quantity = newData[index].current_quantity - newData[index].reserved_quantity
    }

    // Update supplier name when supplier_id changes
    if (field === "supplier_id") {
      const supplier = suppliers.find((s) => s.id === Number.parseInt(value))
      newData[index].supplier_name = supplier?.name || ""
    }

    // Update warehouse name when warehouse_id changes
    if (field === "warehouse_id") {
      const warehouse = warehouses.find((w) => w.id === Number.parseInt(value))
      newData[index].warehouse_name = warehouse?.name || ""
    }

    setBatchData(newData)
    onDataChange?.(newData)
  }

  const deleteRow = (index: number) => {
    const newData = batchData.filter((_, i) => i !== index)
    setBatchData(newData)
    onDataChange?.(newData)
    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  const saveRow = async (index: number) => {
    if (!productId) {
      setEditingIndex(null)
      return
    }

    try {
      const rowData = batchData[index]
      console.log("[v0] Saving batch data:", rowData)

      const apiData = {
        id: rowData.id,
        product_id: productId,
        lot_number: rowData.lot_number,
        manufacturing_date: rowData.manufacturing_date,
        expiry_date: rowData.expiry_date,
        supplier_id: rowData.supplier_id || null,
        initial_quantity: rowData.initial_quantity,
        current_quantity: rowData.current_quantity,
        reserved_quantity: rowData.reserved_quantity,
        unit_cost: rowData.unit_cost,
        notes: rowData.notes,
        status: rowData.status,
      }

      const response = await fetch("/api/inventory/lots", {
        method: rowData.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      })

      if (response.ok) {
        const savedData = await response.json()
        console.log("[v0] Batch data saved successfully:", savedData)

        const newData = [...batchData]
        newData[index] = {
          ...savedData,
          supplier_name: savedData.supplier_name || "",
          warehouse_name: savedData.warehouse_name || "",
          available_quantity: savedData.available_quantity || savedData.current_quantity - savedData.reserved_quantity,
        }
        setBatchData(newData)
        onDataChange?.(newData)

        // Refresh the data to get latest from database
        fetchProductBatches()
      } else {
        const errorData = await response.json()
        console.error("[v0] Error saving batch data:", errorData)
        showAlert("خطأ في حفظ بيانات الدفعة: " + (errorData.error || "خطأ غير معروف"))
      }
    } catch (error) {
      console.error("[v0] Error saving batch data:", error)
      showAlert("حدث خطأ في حفظ بيانات الدفعة")
    }

    setEditingIndex(null)
  }

  const getExpiryStatus = (expiryDate: string) => {
    if (!expiryDate) return null

    const expiry = new Date(expiryDate)
    const today = new Date()
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">منتهي الصلاحية</Badge>
    } else if (daysUntilExpiry <= 30) {
      return <Badge className="bg-orange-100 text-orange-800">قريب الانتهاء ({daysUntilExpiry} يوم)</Badge>
    } else {
      return <Badge className="bg-green-100 text-green-800">صالح</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    const statusColors = {
      نشط: "bg-green-100 text-green-800",
      "منتهي الصلاحية": "bg-red-100 text-red-800",
      مسترد: "bg-yellow-100 text-yellow-800",
      "نفد المخزون": "bg-gray-100 text-gray-800",
      محجوز: "bg-blue-100 text-blue-800",
    }

    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"}>
        {status}
      </Badge>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            تفاصيل الدفعات والتتبع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            تفاصيل الدفعات والتتبع
          </CardTitle>
          {!readOnly && (
            <Button onClick={addNewRow} size="sm" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              إضافة دفعة
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {batchData.length === 0 ? (
          <div className="text-center py-8">
            <Package2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد دفعات مسجلة لهذا المنتج</p>
            {!readOnly && (
              <Button onClick={addNewRow} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                إضافة دفعة جديدة
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الدفعة</TableHead>
                  <TableHead className="text-right">تاريخ الإنتاج</TableHead>
                  <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                  <TableHead className="text-right">حالة الصلاحية</TableHead>
                  <TableHead className="text-right">المورد</TableHead>
                  <TableHead className="text-right">الكمية الأولية</TableHead>
                  <TableHead className="text-right">الكمية الحالية</TableHead>
                  <TableHead className="text-right">محجوز</TableHead>
                  <TableHead className="text-right">متاح</TableHead>
                  <TableHead className="text-right">تكلفة الوحدة</TableHead>
                  <TableHead className="text-right">المستودع</TableHead>
                  <TableHead className="text-right">الموقع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  {!readOnly && <TableHead className="text-right">الإجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          value={row.lot_number}
                          onChange={(e) => updateRow(index, "lot_number", e.target.value)}
                          className="w-32"
                          placeholder="رقم الدفعة"
                        />
                      ) : (
                        <span className="font-medium">{row.lot_number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="date"
                          value={row.manufacturing_date}
                          onChange={(e) => updateRow(index, "manufacturing_date", e.target.value)}
                          className="w-36"
                        />
                      ) : (
                        row.manufacturing_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(row.manufacturing_date).toLocaleDateString("en-GB")}
                          </div>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="date"
                          value={row.expiry_date}
                          onChange={(e) => updateRow(index, "expiry_date", e.target.value)}
                          className="w-36"
                        />
                      ) : (
                        row.expiry_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(row.expiry_date).toLocaleDateString("en-GB")}
                          </div>
                        )
                      )}
                    </TableCell>
                    <TableCell>{getExpiryStatus(row.expiry_date)}</TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Select
                          value={row.supplier_id.toString()}
                          onValueChange={(value) => updateRow(index, "supplier_id", Number.parseInt(value))}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="اختر المورد" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        row.supplier_name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="number"
                          value={row.initial_quantity}
                          onChange={(e) => updateRow(index, "initial_quantity", Number.parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      ) : (
                        row.initial_quantity
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="number"
                          value={row.current_quantity}
                          onChange={(e) => updateRow(index, "current_quantity", Number.parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      ) : (
                        <span className="font-medium">{row.current_quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="number"
                          value={row.reserved_quantity}
                          onChange={(e) => updateRow(index, "reserved_quantity", Number.parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      ) : (
                        row.reserved_quantity
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">{row.available_quantity}</TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={row.unit_cost}
                          onChange={(e) => updateRow(index, "unit_cost", Number.parseFloat(e.target.value) || 0)}
                          className="w-24"
                        />
                      ) : (
                        `${row.unit_cost.toFixed(2)}`
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Select
                          value={row.warehouse_id.toString()}
                          onValueChange={(value) => updateRow(index, "warehouse_id", Number.parseInt(value))}
                        >
                          <SelectTrigger className="w-32">
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
                      ) : (
                        row.warehouse_name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <div className="flex gap-1">
                          <Input
                            value={row.floor}
                            onChange={(e) => updateRow(index, "floor", e.target.value)}
                            className="w-12"
                            placeholder="طابق"
                          />
                          <Input
                            value={row.area}
                            onChange={(e) => updateRow(index, "area", e.target.value)}
                            className="w-12"
                            placeholder="منطقة"
                          />
                          <Input
                            value={row.shelf}
                            onChange={(e) => updateRow(index, "shelf", e.target.value)}
                            className="w-12"
                            placeholder="رف"
                          />
                        </div>
                      ) : (
                        <span className="text-sm">{[row.floor, row.area, row.shelf].filter(Boolean).join("-")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIndex === index ? (
                        <Select value={row.status} onValueChange={(value) => updateRow(index, "status", value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        getStatusBadge(row.status)
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex gap-2">
                          {editingIndex === index ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => saveRow(index)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                حفظ
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setEditingIndex(index)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteRow(index)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
