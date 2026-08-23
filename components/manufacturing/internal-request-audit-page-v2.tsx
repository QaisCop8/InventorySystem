"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Edit, FileText, GripVertical, RefreshCw, Save, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

type AuditRequest = {
  id: number
  vch_code: string
  vch_date: string
  branch_id: number
  manufacturing_branch_id: number
  to_store_id: number | null
  destination_warehouse_id: number | null
  requester_name?: string
  items?: any[]
}

export default function InternalRequestAuditPageV2() {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<AuditRequest[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selected, setSelected] = useState<AuditRequest | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [popupMessage, setPopupMessage] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests?status=2&_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(activeBranchId || "") } })
      const data = await response.json()
      setRequests(response.ok && Array.isArray(data) ? data : [])
    } catch (error: any) {
      setMessage(error.message || "تعذر تحميل الطلبات")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchResponse, warehouseResponse]) => {
      const [branchData, warehouseData] = await Promise.all([branchResponse.json(), warehouseResponse.json()])
      setBranches(Array.isArray(branchData) ? branchData : [])
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : [])
    })
  }, [activeBranchId])

  useEffect(() => {
    if (!selected) return
    requestAnimationFrame(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]')
      const itemNames = Array.from(dialog?.querySelectorAll("span.rounded.border.p-2") || [])
      items.forEach((item, index) => {
        const name = itemNames[index] as HTMLElement | undefined
        if (!name) return
        name.classList.add("text-lg")
        const product = name.querySelector("[data-internal-product]") || name
        product.classList.add("font-bold", "text-blue-600")
        if (item.unit_name && !name.querySelector("[data-internal-unit]")) {
          const unit = document.createElement("span")
          unit.dataset.internalUnit = "true"
          unit.className = "mr-2 font-normal text-red-600"
          unit.textContent = `- ${item.unit_name}`
          name.appendChild(unit)
        }
      })
    })
  }, [selected, items])

  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || String(id)
  const warehouseName = (id: number | null) => warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.warehouse_name || "-"

  const openRequest = (request: AuditRequest) => {
    setSelected(request)
    setItems((request.items || []).map((item) => ({ ...item, quantity: Number(item.qnty) })))
    setPopupMessage("")
  }

  const openDraggedRequest = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const requestId = Number(event.dataTransfer.getData("internal-request-id"))
    const request = requests.find((item) => item.id === requestId)
    if (request) openRequest(request)
  }

  const saveItems = async () => {
    if (!selected) return
    if (!items.length) { setPopupMessage("يجب اضافة صنف واحد على الأقل"); return }
    if (items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      setPopupMessage("يجب أن تكون كمية كل صنف أكبر من صفر")
      return
    }
    setSaving(true)
    try {
      if (!Number(selected.to_store_id) || !Number(selected.destination_warehouse_id)) {
        setPopupMessage("بيانات المستودعات غير مكتملة في الطلب")
        return
      }
      const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: selected.branch_id, manufacturing_branch_id: selected.manufacturing_branch_id, source_warehouse_id: selected.to_store_id, destination_warehouse_id: selected.destination_warehouse_id, vch_date: selected.vch_date, items: items.map((item) => ({ product_id: item.item_id, product_name: item.item_name, unit_id: item.unit_id, quantity: Number(item.quantity), barcode: item.barcode })) }),
      })
      const data = await response.json()
      if (!response.ok) { setPopupMessage(data.error || "تعذر حفظ التعديلات"); return }
      setPopupMessage("تم حفظ تعديلات الطلب")
      await load()
    } catch (error: any) {
      setPopupMessage(error.message || "تعذر حفظ التعديلات")
    } finally {
      setSaving(false)
    }
  }

  const approve = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "requestAudit", branch_id: selected.branch_id }),
      })
      const data = await response.json()
      if (!response.ok) { setPopupMessage(data.error || "تعذر اعتماد الطلب"); return }
      setSelected(null)
      setMessage("تم اعتماد الطلب بنجاح")
      await load()
    } catch (error: any) {
      setPopupMessage(error.message || "تعذر اعتماد الطلب")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">تدقيق طلب البضاعة</h1><p className="mt-1 text-sm text-muted-foreground">راجع بيانات الطلب وعدّل الأصناف قبل الاعتماد.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button>
      </div>
      {message && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(560px,720px)]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {requests.map((request) => <Card key={request.id} draggable onDragStart={(event) => event.dataTransfer.setData("internal-request-id", String(request.id))} className="cursor-grab" onClick={() => openRequest(request)}><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><GripVertical className="h-4 w-4 text-muted-foreground" /></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div>التاريخ: <b>{String(request.vch_date).slice(0, 10)}</b></div><div>مقدم الطلب: <b>{request.requester_name || "-"}</b></div><div>الأصناف: <b>{request.items?.length || 0}</b></div><Button className="w-full" variant="outline" onClick={(event) => { event.stopPropagation(); openRequest(request) }}><Edit className="ml-2 h-4 w-4" />فتح الطلب</Button></CardContent></Card>)}
          {!loading && requests.length === 0 && <div className="col-span-full rounded-xl border-2 border-dashed py-16 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-emerald-600" />لا توجد طلبات قيد التدقيق</div>}
        </div>
        <div onDragOver={(event) => event.preventDefault()} onDrop={openDraggedRequest} className="flex min-h-[700px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 p-12 text-center lg:min-h-[820px]"><div><CheckCircle2 className="mx-auto mb-6 h-24 w-24 text-emerald-600" /><h2 className="text-3xl font-bold">اسحب الطلب هنا</h2><p className="mt-4 text-xl text-muted-foreground">لفتحه ومراجعته</p></div></div>
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>تدقيق طلب {selected?.vch_code}</DialogTitle></DialogHeader>
          {popupMessage && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{popupMessage}</div>}
          {selected && <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>فرع مقدم الطلب: <b>{branchName(selected.branch_id)}</b></div><div>فرع البضاعة: <b>{branchName(selected.manufacturing_branch_id)}</b></div><div>مستودع مقدم الطلب: <b>{warehouseName(selected.to_store_id)}</b></div><div>مستودع المطلوب منه البضاعة: <b>{warehouseName(selected.destination_warehouse_id)}</b></div><div>مقدم الطلب: <b>{selected.requester_name || "-"}</b></div><div>التاريخ: <b>{selected.vch_date}</b></div></div><div className="space-y-2 rounded border p-4"><h2 className="text-lg font-bold">الأصناف</h2>{items.map((item, index) => <div key={item.id || index} className="flex items-center gap-2"><span className="flex-1 rounded border p-2">{item.item_name || "صنف جديد"}</span><input className="w-28 rounded border p-2" type="number" min="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /></div>)}</div><div className="flex gap-2"><Button className="flex-1" onClick={() => void approve()} disabled={saving}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد الطلب</Button><Button className="flex-1" onClick={() => void saveItems()} disabled={saving}><Save className="ml-2 h-4 w-4" />حفظ التعديلات</Button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
