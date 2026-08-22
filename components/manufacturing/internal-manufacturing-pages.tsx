"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Messages from "@/components/common/Messages"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarDays, CheckCircle2, ClipboardCheck, FileText, GripVertical, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import InternalRequestAuditPage from "./internal-request-audit-page-v2"
import InternalWorkflowStagePage from "./internal-workflow-stage-page-v2"

type PageKind = "settings" | "request" | "requestAudit" | "preparation" | "readyAudit" | "send" | "receive" | "receivedAudit" | "receiveManufacturing"
type Stage = { key: Exclude<PageKind, "settings" | "request">; title: string; status: number; action: string }
const stages: Stage[] = [
  { key: "requestAudit", title: "تدقيق طلب البضاعة", status: 2, action: "requestAudit" },
  { key: "preparation", title: "تجهيز طلبات البضاعة الداخلية", status: 3, action: "prepare" },
  { key: "readyAudit", title: "تدقيق الطلبات الجاهزة", status: 4, action: "readyAudit" },
  { key: "send", title: "إرسال طلبات البضاعة", status: 5, action: "send" },
  { key: "receive", title: "استلام طلبات البضاعة", status: 6, action: "receive" },
  { key: "receivedAudit", title: "تدقيق البضاعة المستلمة", status: 7, action: "receivedAudit" },
]

function RequestCard({ request, onOpen }: { request: any; onOpen: () => void }) {
  return <Card draggable onDragStart={(event) => event.dataTransfer.setData("request", String(request.id))} onClick={onOpen} className="cursor-grab transition hover:border-emerald-400 hover:shadow-md"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><GripVertical className="h-4 w-4 text-muted-foreground" /></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="font-medium">طلب بضاعة داخلي</div><div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" />{request.vch_date}</div><div className="flex items-center justify-between"><span>{request.items?.length || 0} أصناف</span><Badge variant="secondary">قيد المعالجة</Badge></div></CardContent></Card>
}

function StageBoard({ stage }: { stage: Stage }) {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [popupMessage, setPopupMessage] = useState("")
  const load = async () => { setLoading(true); try { const response = await fetch(`/api/internal-manufacturing-requests?status=${stage.status}`, { headers: { "x-branch-id": String(activeBranchId || "") } }); const data = await response.json(); setRequests(Array.isArray(data) ? data : []) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [stage.status, activeBranchId])
  const complete = async (request: any) => { const response = await fetch(`/api/internal-manufacturing-requests/${request.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: stage.action, branch_id: request.branch_id || activeBranchId, received_items: request.received_items }) }); const data = await response.json(); const resultMessage = response.ok ? "تم اعتماد المرحلة بنجاح" : data.error || "تعذر اعتماد المرحلة"; if (!response.ok) setPopupMessage(resultMessage); setMessage(resultMessage); if (response.ok) { setSelected(null); void load() } }
  return <div dir="rtl" className="space-y-5 p-3 md:p-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-bold">{stage.title}</h1><p className="mt-1 text-sm text-muted-foreground">اسحب الطلب إلى منطقة الاعتماد أو افتحه للمراجعة.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button></div>{message && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}<div className="grid gap-6 lg:grid-cols-2"><section className="min-h-[460px] rounded-xl border bg-muted/30 p-4"><h2 className="mb-4 font-bold">الطلبات بانتظار المعالجة ({requests.length})</h2><div className="grid gap-3 sm:grid-cols-2">{!loading && requests.map((request) => <RequestCard key={request.id} request={request} onOpen={() => setSelected(request)} />)}</div>{!loading && requests.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 h-10 w-10" />لا توجد طلبات في هذه المرحلة</div>}</section><section onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const request = requests.find((item) => item.id === Number(event.dataTransfer.getData("request"))); if (request) setSelected(request) }} className="flex min-h-[460px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-6 text-center"><div><CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-600" /><h2 className="text-xl font-bold">اسحب الطلب هنا للاعتماد</h2><p className="text-muted-foreground">ستتم معالجة الطلب بعد مراجعة بياناته.</p></div></section></div>{selected && <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>مراجعة {selected.vch_code}</DialogTitle></DialogHeader><div className="space-y-5"><div className="grid gap-3 rounded border p-4 text-sm md:grid-cols-3"><div>فرع مقدم الطلب: <b>{selected.branch_id}</b></div><div>فرع البضاعة: <b>{selected.manufacturing_branch_id}</b></div><div>التاريخ: <b>{selected.vch_date}</b></div></div><div className="overflow-x-auto rounded border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/60"><tr><th className="p-3 text-right">الصنف</th><th className="p-3 text-right">الكمية الأصلية</th><th className="p-3 text-right">الكمية الحرة</th><th className="p-3 text-right">الكمية المستلمة</th></tr></thead><tbody>{selected.items?.map((item: any) => <tr className="border-t" key={item.id}><td className="p-3">{item.item_name}</td><td className="p-3">{item.qnty}</td><td className="p-3">{item.free_quantity || 0}</td><td className="p-3">{stage.key === "receiveManufacturing" ? <Input type="number" min="0" max={item.qnty} value={item.received_quantity || ""} onChange={(event) => { item.received_quantity = Number(event.target.value); setSelected({ ...selected }) }} placeholder="أدخل الكمية" /> : item.received_quantity || 0}</td></tr>)}</tbody></table></div><Button className="w-full" onClick={() => complete({ ...selected, received_items: selected.items?.map((item: any) => ({ id: item.id, received_quantity: Number(item.received_quantity) })) })}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد المرحلة</Button></div></DialogContent></Dialog>}</div>
}

function LegacyInternalManufacturingOldRequestPage() {
  const { activeBranchId, user, hasPermission } = useAuth()
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [sourceWarehouse, setSourceWarehouse] = useState("")
  const [destinationBranch, setDestinationBranch] = useState("")
  const [destinationWarehouse, setDestinationWarehouse] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<any[]>([])
  const [open, setOpenState] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [permissionMessage, setPermissionMessage] = useState("")

  const setOpen = (nextOpen: boolean) => {
    if (nextOpen && !hasPermission("internal-manufacturing-create")) {
      setPermissionMessage("لا يوجد لديك صلاحية طلب بضاعة داخلي")
      setOpenState(true)
      return
    }
    setPermissionMessage("")
    setOpenState(nextOpen)
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/branches"),
      fetch("/api/warehouses"),
      user?.id ? fetch(`/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}`) : Promise.resolve(null),
    ]).then(async ([branchResponse, warehouseResponse, defaultsResponse]) => {
      const branchData = await branchResponse.json()
      const warehouseData = await warehouseResponse.json()
      setBranches(Array.isArray(branchData) ? branchData.filter((branch: any) => Number(branch.status ?? 1) !== 3) : [])
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : [])
      if (defaultsResponse?.ok) { const defaults = await defaultsResponse.json(); setSourceWarehouse(String(defaults.default_item_warehouse_id || "")) }
    })
  }, [user?.id])

  useEffect(() => {
    if (!sourceWarehouse && warehouses.length > 0) {
      setSourceWarehouse(String(warehouses[0].id))
    }
  }, [sourceWarehouse, warehouses])

  const add = (products: any[]) => { const product = products[0]; if (!product) return; const unit = product.selected_unit || product.units?.[0]; setItems((current) => [...current, { product_id: product.id, product_name: product.product_name, unit_id: unit?.unit_id, unit: unit?.unit_name || product.first_unit, quantity: 1, barcode: unit?.barcode || product.first_barcode }]); setProductOpen(false) }
  const save = async () => { setMessage(""); if (String(sourceWarehouse) === String(destinationWarehouse)) { setMessage("لا يمكن أن يكون نفس المستودع"); return } const response = await fetch("/api/internal-manufacturing-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vch_date: date, branch_id: activeBranchId, source_warehouse_id: sourceWarehouse, manufacturing_branch_id: destinationBranch, destination_warehouse_id: destinationWarehouse, items }) }); const data = await response.json(); if (!response.ok) { setMessage(data.error || "تعذر حفظ مسودة الطلب"); return } setMessage(`تم حفظ مسودة الطلب ${data.vch_code}`); setItems([]); setOpen(false) }
  return <div dir="rtl" className="space-y-5 p-3 md:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-bold">طلب بضاعة داخلي</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ مسودة طلب بضاعة داخلية.</p></div><Button size="lg" onClick={() => setOpen(true)}><Plus className="ml-2 h-5 w-5" />إضافة طلب داخلي</Button></div><Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث برقم الطلب..." /></div><Button variant="outline"><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button></CardContent></Card>{message && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}<div className="rounded-xl border-2 border-dashed py-16 text-center"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" /><h2 className="font-bold">لا توجد مسودات معروضة</h2><p className="mb-4 mt-1 text-sm text-muted-foreground">ابدأ بإضافة طلب بضاعة داخلي.</p><Button onClick={() => setOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة طلب داخلي</Button></div><Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>إضافة طلب داخلي</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div><Label>تاريخ الطلب</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div><Label>فرع مقدم الطلب</Label><Input value={branches.find((branch) => Number(branch.id) === Number(activeBranchId))?.branch_name || ""} disabled /></div><div><Label>مستودع مقدم الطلب</Label><select className="w-full rounded border p-2" value={sourceWarehouse} onChange={(event) => setSourceWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.warehouse_name || item.name}</option>)}</select></div><div><Label>الفرع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationBranch} onChange={(event) => setDestinationBranch(event.target.value)}><option value="">اختر الفرع</option>{branches.filter((branch) => Number(branch.id) !== Number(activeBranchId)).map((item) => <option key={item.id} value={item.id}>{item.branch_name}</option>)}</select></div><div><Label>المستودع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.warehouse_name || item.name}</option>)}</select></div></div><Button onClick={() => setProductOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة صنف</Button>{items.map((item, index) => <div className="grid gap-2 md:grid-cols-[1fr_180px_100px]" key={`${item.product_id}-${index}`}><Input value={item.product_name} readOnly /><Input type="number" min="0.001" value={item.quantity} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /><Button variant="outline" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="ml-2 h-4 w-4" />حذف</Button></div>)}<Button className="w-full" disabled={!items.length || !sourceWarehouse || !destinationBranch || !destinationWarehouse} onClick={save}>حفظ مسودة الطلب</Button><ProductSearchPopup visible={productOpen} onClose={() => setProductOpen(false)} onSelect={add} priceCategoryId={0} ShowSelect={false} title="اختيار الصنف" /></div></DialogContent></Dialog></div>
}

type InternalRequestCard = {
  id: number
  vch_code: string
  vch_date: string
  branch_id: number
  manufacturing_branch_id: number
  to_branch_id?: number
  destination_warehouse_id: number | null
  internal_status: number
  items?: any[]
}

function LegacyInternalManufacturingRequestPage() {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<InternalRequestCard[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedRequest, setSelectedRequest] = useState<InternalRequestCard | null>(null)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [sourceWarehouse, setSourceWarehouse] = useState("")
  const [destinationBranch, setDestinationBranch] = useState("")
  const [destinationWarehouse, setDestinationWarehouse] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [productOpen, setProductOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const requestMessagesRef = useRef<any>(null)

  const showRequestMessage = (detail: string, severity: "success" | "error") => {
    requestMessagesRef.current?.clear?.()
    requestMessagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000 }])
  }

  const loadRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/internal-manufacturing-requests", { headers: { "x-branch-id": String(activeBranchId || "") } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الطلبات")
      setRequests(Array.isArray(data) ? data : [])
    } catch (error: any) {
      setMessage(error.message || "تعذر تحميل الطلبات")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRequests()
    Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchResponse, warehouseResponse]) => {
      const branchData = await branchResponse.json()
      const warehouseData = await warehouseResponse.json()
      setBranches(Array.isArray(branchData) ? branchData : [])
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : [])
    })
  }, [activeBranchId])

  const openNewRequest = () => {
    setSelectedRequest(null)
    setItems([])
    setOpen(true)
  }

  const addProduct = (products: any[]) => {
    const product = products[0]
    if (!product) return
    const unit = product.selected_unit || product.units?.[0]
    setItems((current) => [...current, { product_id: product.id, product_name: product.product_name, unit_id: unit?.unit_id, quantity: 1, barcode: unit?.barcode || product.first_barcode }])
    setProductOpen(false)
  }

  const saveNewRequest = async () => {
    requestMessagesRef.current?.clear?.()
    if (String(sourceWarehouse) === String(destinationWarehouse)) { showRequestMessage("لا يمكن أن يكون نفس المستودع", "error"); return }
    const response = await fetch("/api/internal-manufacturing-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vch_date: date, branch_id: activeBranchId, source_warehouse_id: sourceWarehouse, manufacturing_branch_id: destinationBranch, destination_warehouse_id: destinationWarehouse, items }) })
    const data = await response.json()
    if (!response.ok) { showRequestMessage(data.error || "تعذر حفظ الطلب", "error"); return }
    showRequestMessage(`تم حفظ الطلب ${data.vch_code}`, "success")
    setOpen(false)
    await loadRequests()
  }

  const deleteRequest = async (requestId: number) => {
    if (!window.confirm("هل أنت متأكد من حذف مسودة الطلب؟")) return
    const response = await fetch(`/api/internal-manufacturing-requests/${requestId}`, { method: "DELETE" })
    const data = await response.json()
    if (!response.ok) { setMessage(data.error || "تعذر حذف الطلب"); return }
    setMessage("تم حذف مسودة الطلب")
    await loadRequests()
  }

  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || id
  const warehouseName = (id: number | null) => warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.warehouse_name || id || "-"

  return <div dir="rtl" className="space-y-5 p-3 md:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold">طلب بضاعة داخلي</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ وتابع طلبات البضاعة الداخلية.</p></div>
      <Button onClick={openNewRequest}><Plus className="ml-2 h-4 w-4" />إضافة طلب داخلي</Button>
    </div>
    {message && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {requests.map((request) => {
        const isNew = Number(request.internal_status) === 1
        return <Card key={request.id} className="overflow-hidden">
          <CardHeader className="pb-3"><CardTitle className="flex items-center justify-between gap-3 text-base"><span>{request.vch_code}</span><Badge variant={isNew ? "secondary" : "outline"}>{isNew ? "مسودة" : "قيد المعالجة"}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm"><div className="grid gap-2 text-muted-foreground"><div>التاريخ: <b className="text-foreground">{String(request.vch_date).slice(0, 10)}</b></div><div>فرع البضاعة: <b className="text-foreground">{branchName(request.manufacturing_branch_id)}</b></div><div>المستودع: <b className="text-foreground">{warehouseName(request.destination_warehouse_id)}</b></div><div>الأصناف: <b className="text-foreground">{request.items?.length || 0}</b></div></div>
            <div className="flex gap-2 border-t pt-3">{isNew ? <><Button variant="outline" className="flex-1" onClick={() => { setSelectedRequest(request); setOpen(true) }}>تعديل</Button><Button variant="destructive" className="flex-1" onClick={() => void deleteRequest(request.id)}><Trash2 className="ml-2 h-4 w-4" />حذف</Button></> : <Button variant="outline" className="w-full" onClick={() => { setSelectedRequest(request); setOpen(true) }}><Search className="ml-2 h-4 w-4" />مشاهدة</Button>}</div>
          </CardContent>
        </Card>
      })}
    </div>
    {!loading && requests.length === 0 && <div className="rounded-xl border-2 border-dashed py-16 text-center"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" /><h2 className="font-bold">لا توجد مسودات معروضة</h2><p className="mt-1 text-sm text-muted-foreground">ابدأ بإضافة طلب بضاعة داخلي.</p></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto" onPointerDownOutside={(event) => { if (productOpen) event.preventDefault() }} onInteractOutside={(event) => { if (productOpen) event.preventDefault() }}><DialogHeader><DialogTitle>{selectedRequest ? "مشاهدة طلب البضاعة" : "إضافة طلب داخلي"}</DialogTitle></DialogHeader>{selectedRequest ? <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>رقم الطلب: <b>{selectedRequest.vch_code}</b></div><div>التاريخ: <b>{String(selectedRequest.vch_date).slice(0, 10)}</b></div><div>فرع البضاعة: <b>{branchName(selectedRequest.manufacturing_branch_id)}</b></div><div>المستودع: <b>{warehouseName(selectedRequest.destination_warehouse_id)}</b></div></div><div className="rounded border p-4"><h3 className="mb-3 font-bold">الأصناف</h3>{(selectedRequest.items || []).map((item, index) => <div key={`${item.item_id}-${index}`} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{item.item_name}</span><span>{item.qnty}</span></div>)}</div><Button className="w-full" variant="outline" onClick={() => setOpen(false)}>إغلاق</Button></div> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>تاريخ الطلب</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div><Label>فرع مقدم الطلب</Label><Input value={branchName(Number(activeBranchId))} disabled /></div><div><Label>مستودع مقدم الطلب</Label><select className="w-full rounded border p-2" value={sourceWarehouse} onChange={(event) => setSourceWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div><div><Label>الفرع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationBranch} onChange={(event) => setDestinationBranch(event.target.value)}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div><div><Label>المستودع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div></div><div className="rounded border p-3"><div className="flex items-center justify-between"><h3 className="font-bold">الأصناف</h3><Button type="button" variant="outline" onClick={() => setProductOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة صنف</Button></div>{items.map((item, index) => <div key={`${item.product_id}-${index}`} className="mt-2 flex items-center justify-between rounded bg-muted p-2 text-sm"><span>{item.product_name} - {item.quantity}</span><Button type="button" size="icon" variant="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button className="w-full" disabled={!items.length || !sourceWarehouse || !destinationBranch || !destinationWarehouse} onClick={() => void saveNewRequest()}>حفظ مسودة الطلب</Button></div>}</DialogContent></Dialog><ProductSearchPopup visible={productOpen} onClose={() => setProductOpen(false)} onSelect={addProduct} priceCategoryId={0} ShowSelect={false} productTypes={[1]} title="اختيار الصنف" />
  </div>
}
export function InternalManufacturingSettingsPage() { const [settings, setSettings] = useState({ requestAudit: true, preparation: true, readyAudit: true, send: true, receive: true, receivedAudit: true }); const [saved, setSaved] = useState(false); const { toast } = useToast(); useEffect(() => { fetch("/api/internal-manufacturing-requests/settings").then((response) => response.json()).then((data) => setSettings((current) => ({ ...current, ...data }))) }, []); const saveSettings = async () => { try { const response = await fetch("/api/internal-manufacturing-requests/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }); if (!response.ok) throw new Error("تعذر حفظ الإعدادات"); setSaved(true); toast({ title: "تمت العملية بنجاح", description: "تم حفظ إعدادات طلب بضاعة داخلي" }); } catch (error: any) { toast({ title: "فشل الحفظ", description: error.message || "تعذر حفظ الإعدادات", variant: "destructive", }); } }; const stages = [{ key: "requestAudit", label: "تدقيق طلب البضاعة", mandatory: false }, { key: "preparation", label: "تجهيز الطلبات", mandatory: true }, { key: "readyAudit", label: "تدقيق الطلبات الجاهزة", mandatory: false }, { key: "send", label: "إرسال الطلبات", mandatory: false }, { key: "receive", label: "استلام الطلبات", mandatory: true }, { key: "receivedAudit", label: "تدقيق البضاعة المستلمة", mandatory: false }] as const; return <div dir="rtl" className="space-y-5 p-3 md:p-6"><h1 className="text-2xl font-bold">إعدادات طلب بضاعة داخلي</h1><Card><CardHeader><CardTitle>مراحل سير الطلب</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between rounded border p-3"><span>طلب بضاعة داخلي</span><Badge>إجباري</Badge></div>{stages.map(({ key, label, mandatory }) => <label key={key} className="flex justify-between rounded border p-3"><span>{label}</span>{mandatory ? <Badge>إجباري</Badge> : <input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />}</label>)}<Button onClick={saveSettings}>حفظ الإعدادات</Button>{saved && <span className="mr-3 text-sm text-emerald-700">تم الحفظ</span>}</CardContent></Card></div> }

export { default as InternalManufacturingRequestPage } from "./internal-request-page"
export const InternalManufacturingDraftPage = LegacyInternalManufacturingRequestPage
export const InternalManufacturingConfirmationPage = () => <StageBoard stage={stages[0]} />
export const InternalManufacturingRequestAuditPage = InternalRequestAuditPage
export const InternalManufacturingPreparationPage = () => <InternalWorkflowStagePage stage={{ ...stages[1], preparation: true }} />
export const InternalManufacturingReadyAuditPage = () => <InternalWorkflowStagePage stage={stages[2]} />
export const InternalManufacturingSendPage = () => <InternalWorkflowStagePage stage={stages[3]} />
export const InternalManufacturingReceivePage = () => <InternalWorkflowStagePage stage={stages[4]} />
export const InternalManufacturingReceivedAuditPage = () => <InternalWorkflowStagePage stage={stages[5]} />
// Compatibility aliases for tabs saved before the workflow stage names were changed.
export const InternalManufacturingReceiveRequestPage = InternalManufacturingPreparationPage
export const InternalManufacturingAuditPage = InternalManufacturingReadyAuditPage
