"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Edit, Plus } from "lucide-react"

interface Warehouse {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en?: string
  description?: string
  location?: string
  status: number
}

interface WarehouseForm {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en: string
  description: string
  location: string
  status: number
}

const initialForm: WarehouseForm = {
  id: 0,
  warehouse_code: "",
  warehouse_name: "",
  warehouse_name_en: "",
  description: "",
  location: "",
  status: 1,
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<WarehouseForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.status === 1).length, [warehouses])
  const inactiveWarehouses = warehouses.length - activeWarehouses

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/warehouses")
      const data = await response.json()
      setWarehouses(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch warehouses", error)
      setWarehouses([])
    } finally {
      setLoading(false)
    }
  }

  const openNewDialog = () => {
    setForm(initialForm)
    setErrorMessage("")
    setDialogOpen(true)
  }

  const openEditDialog = (warehouse: Warehouse) => {
    setForm({
      id: warehouse.id,
      warehouse_code: warehouse.warehouse_code,
      warehouse_name: warehouse.warehouse_name,
      warehouse_name_en: warehouse.warehouse_name_en || "",
      description: warehouse.description || "",
      location: warehouse.location || "",
      status: warehouse.status,
    })
    setErrorMessage("")
    setDialogOpen(true)
  }

  const saveWarehouse = async () => {
    if (!form.warehouse_code.trim() || !form.warehouse_name.trim()) {
      setErrorMessage("رمز المستودع واسمه مطلوبان")
      return
    }
    setIsSaving(true)
    setErrorMessage("")
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const url = form.id > 0 ? `/api/warehouses/${form.id}` : "/api/warehouses"
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const error = await response.json()
        setErrorMessage(error.error || "فشل في حفظ المستودع")
        return
      }
      await fetchWarehouses()
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      setErrorMessage("فشل في حفظ المستودع")
    } finally {
      setIsSaving(false)
    }
  }

  const deleteWarehouse = async () => {
    if (!form.id) return
    try {
      const response = await fetch(`/api/warehouses/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        setErrorMessage(error.error || "فشل في حذف المستودع")
        return
      }
      await fetchWarehouses()
      setShowDeleteConfirm(false)
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base">إجمالي المستودعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{warehouses.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardHeader>
            <CardTitle className="text-base">المستودعات الفعالة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{activeWarehouses}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-base">المستودعات المعطلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{inactiveWarehouses}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>المستودعات</CardTitle>
            <Button onClick={openNewDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              إضافة مستودع
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رمز المستودع</TableHead>
                  <TableHead className="text-right">اسم المستودع</TableHead>
                  <TableHead className="text-right">الموقع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id} className="cursor-pointer" onDoubleClick={() => openEditDialog(warehouse)}>
                    <TableCell className="text-right">{warehouse.warehouse_code}</TableCell>
                    <TableCell className="text-right">{warehouse.warehouse_name}</TableCell>
                    <TableCell className="text-right">{warehouse.location || "-"}</TableCell>
                    <TableCell className="text-right">{warehouse.status === 1 ? "نشط" : "متوقف"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditDialog(warehouse)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {warehouses.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      لا توجد مستودعات
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id > 0 ? "تعديل مستودع" : "إضافة مستودع"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="warehouse_code">رمز المستودع</Label>
                <Input
                  id="warehouse_code"
                  value={form.warehouse_code}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_code: e.target.value }))}
                  className="text-right"
                />
              </div>
              <div>
                <Label htmlFor="warehouse_status">الحالة</Label>
                <select
                  id="warehouse_status"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value={1}>نشط</option>
                  <option value={2}>متوقف</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="warehouse_name">اسم المستودع</Label>
              <Input
                id="warehouse_name"
                value={form.warehouse_name}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_name: e.target.value }))}
                className="text-right"
              />
            </div>
            <div>
              <Label htmlFor="warehouse_name_en">الاسم بالإنجليزية</Label>
              <Input
                id="warehouse_name_en"
                value={form.warehouse_name_en}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_name_en: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="warehouse_location">الموقع</Label>
              <Input
                id="warehouse_location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="text-right"
              />
            </div>
            <div>
              <Label htmlFor="warehouse_description">الوصف</Label>
              <Input
                id="warehouse_description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="text-right"
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {form.id > 0 ? (
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                حذف
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={saveWarehouse} disabled={isSaving}>
                {isSaving ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل أنت متأكد من حذف هذا المستودع؟"
        onConfirm={deleteWarehouse}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
