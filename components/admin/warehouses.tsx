"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { Edit, Plus } from "lucide-react"
import CostCenterDefaultsEditor, { type CostCenterDefaultValue } from "@/components/common/cost-center-defaults-editor"

interface Warehouse {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en?: string
  description?: string
  location?: string
  status: number
  default_printer?: string | null
  cost_centers?: CostCenterDefaultValue[]
}

interface WarehouseForm {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en: string
  description: string
  location: string
  status: number
  default_printer: string
  cost_centers: CostCenterDefaultValue[]
}

const initialForm: WarehouseForm = {
  id: 0,
  warehouse_code: "",
  warehouse_name: "",
  warehouse_name_en: "",
  description: "",
  location: "",
  status: 1,
  default_printer: "",
  cost_centers: [],
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
      default_printer: warehouse.default_printer || "",
      cost_centers: warehouse.cost_centers || [],
    })
    setErrorMessage("")
    setDialogOpen(true)
  }

  const saveWarehouse = async () => {
    if (!form.warehouse_name.trim()) {
      setErrorMessage(tr("اسم المستودع مطلوب"))
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
        setErrorMessage(error.error || tr("فشل في حفظ المستودع"))
        return
      }
      await fetchWarehouses()
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      setErrorMessage(tr("فشل في حفظ المستودع"))
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
        setErrorMessage(error.error || tr("فشل في حذف المستودع"))
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
    <div className="space-y-4" dir={appDir()}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base">{tr("إجمالي المستودعات")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{warehouses.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardHeader>
            <CardTitle className="text-base">{tr("المستودعات الفعالة")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{activeWarehouses}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-base">{tr("المستودعات المعطلة")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{inactiveWarehouses}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{tr("المستودعات")}</CardTitle>
            <Button onClick={openNewDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {tr("إضافة مستودع")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{tr("رمز المستودع")}</TableHead>
                  <TableHead className="text-start">{tr("اسم المستودع")}</TableHead>
                  <TableHead className="text-start">{tr("الموقع")}</TableHead>
                  <TableHead className="text-start">{tr("الحالة")}</TableHead>
                  <TableHead className="text-start">{tr("إجراءات")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id} className="cursor-pointer" onDoubleClick={() => openEditDialog(warehouse)}>
                    <TableCell className="text-start">{warehouse.warehouse_code}</TableCell>
                    <TableCell className="text-start">{warehouse.warehouse_name}</TableCell>
                    <TableCell className="text-start">{warehouse.location || "-"}</TableCell>
                    <TableCell className="text-start">{warehouse.status === 1 ? tr("نشط") : tr("متوقف")}</TableCell>
                    <TableCell className="text-start">
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
                      {tr("لا توجد مستودعات")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir={appDir()} className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id > 0 ? tr("تعديل مستودع") : tr("إضافة مستودع")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="warehouse_code">{tr("رمز المستودع")}</Label>
                <Input
                  id="warehouse_code"
                  value={form.warehouse_code}
                  readOnly
                  placeholder={tr("يتم توليده تلقائياً")}
                  className="bg-muted text-start"
                />
              </div>
              <div>
                <Label htmlFor="warehouse_status">{tr("الحالة")}</Label>
                <PrimeDropdown
                  inputId="warehouse_status"
                  value={form.status}
                  options={[
                    { label: tr("نشط"), value: 1 },
                    { label: tr("متوقف"), value: 2 },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  className="w-full"
                  appendTo="self"
                  onChange={(e: any) => setForm((f) => ({ ...f, status: Number(e.value) }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="warehouse_name">{tr("اسم المستودع")}</Label>
              <Input
                id="warehouse_name"
                value={form.warehouse_name}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_name: e.target.value }))}
                className="text-start"
              />
            </div>
            <div>
              <Label htmlFor="warehouse_name_en">{tr("الاسم بالإنجليزية")}</Label>
              <Input
                id="warehouse_name_en"
                value={form.warehouse_name_en}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_name_en: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="warehouse_location">{tr("الموقع")}</Label>
              <Input
                id="warehouse_location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="text-start"
              />
            </div>
            <div>
              <Label htmlFor="warehouse_default_printer">{tr("الطابعة الافتراضية")}</Label>
              <Input
                id="warehouse_default_printer"
                dir="ltr"
                value={form.default_printer}
                onChange={(e) => setForm((f) => ({ ...f, default_printer: e.target.value }))}
                className="text-start"
                placeholder={tr("اسم الطابعة كما يظهر في ويندوز")}
              />
              <p className="mt-1 text-xs text-muted-foreground">{tr("تُطبع عليها أصناف هذا المستودع عند \"طباعة حسب المستودع\" في الطلبية — فارغة: الطابعة الافتراضية في إعدادات الطباعة")}</p>
            </div>
            <div>
              <Label htmlFor="warehouse_description">{tr("الوصف")}</Label>
              <Input
                id="warehouse_description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label>{tr("مراكز التكلفة الافتراضية")}</Label>
              <p className="text-xs text-muted-foreground">{tr("تُطبَّق على أصناف السندات من هذا المستودع إن لم يكن للصنف مراكز تكلفة خاصة به (الصنف ← المستودع ← حساب الصنف).")}</p>
              <CostCenterDefaultsEditor value={form.cost_centers} onChange={(cost_centers) => setForm((f) => ({ ...f, cost_centers }))} />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {form.id > 0 ? (
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                {tr("حذف")}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {tr("إلغاء")}
              </Button>
              <Button onClick={saveWarehouse} disabled={isSaving}>
                {isSaving ? tr("جاري الحفظ...") : tr("حفظ")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo useAppDialog
        visible={showDeleteConfirm}
        message={tr("هل أنت متأكد من حذف هذا المستودع؟")}
        onConfirm={deleteWarehouse}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
