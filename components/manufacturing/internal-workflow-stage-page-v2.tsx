"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, Edit, FileText, GripVertical, RefreshCw, Save } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

type Request = { id: number; vch_code: string; vch_date: string; branch_id: number; manufacturing_branch_id: number; to_store_id: number | null; destination_warehouse_id: number | null; requester_name?: string; items?: any[] }
type Stage = { title: string; status: number; action: string; preparation?: boolean }

export default function InternalWorkflowStagePageV2({ stage }: { stage: Stage }) {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<Request[]>([])
  const [selected, setSelected] = useState<Request | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [message, setMessage] = useState("")
  const [popupMessage, setPopupMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [draggedId, setDraggedId] = useState<number | null>(null)

  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || String(id)
  const warehouseName = (id: number | null) => warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.warehouse_name || "-"
  const load = async () => {
    const response = await fetch(`/api/internal-manufacturing-requests?status=${stage.status}`, { headers: { "x-branch-id": String(activeBranchId || "") } })
    const data = await response.json()
    setRequests(response.ok && Array.isArray(data) ? data : [])
  }
  useEffect(() => { void load(); Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchesResponse, warehousesResponse]) => { setBranches(await branchesResponse.json()); setWarehouses(await warehousesResponse.json()) }) }, [activeBranchId, stage.status])
  const openRequest = (request: Request) => { setSelected(request); setPopupMessage(""); setItems((request.items || []).map((item) => ({ ...item, editableQuantity: stage.preparation ? (Number(item.prepared_quantity) > 0 ? Number(item.prepared_quantity) : Number(item.qnty)) : Number(item.qnty) }))) }
  const dropRequest = () => { const request = requests.find((item) => item.id === draggedId); if (request) openRequest(request); setDraggedId(null) }
  const complete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const body = stage.preparation ? { action: "prepare", prepared_items: items.map((item) => ({ id: item.id, prepared_quantity: Number(item.editableQuantity) })) } : { action: stage.action, branch_id: selected.branch_id }
      const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) { setPopupMessage(data.error || "تعذر اعتماد الطلب"); return }
      setSelected(null); setMessage(stage.preparation ? "تم حفظ الكمية المجهزة" : "تم اعتماد الطلب بنجاح"); await load()
    } catch (error: any) { setPopupMessage(error.message || "تعذر اعتماد الطلب") } finally { setSaving(false) }
  }

  return <div dir="rtl" className="space-y-5 p-3 md:p-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">{stage.title}</h1><p className="mt-1 text-sm text-muted-foreground">اسحب الطلب إلى منطقة الاعتماد أو افتحه للمراجعة.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button></div>{message && !selected && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(560px,720px)]"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{requests.map((request) => <Card key={request.id} draggable onDragStart={() => setDraggedId(request.id)} onClick={() => openRequest(request)} className="cursor-grab"><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><GripVertical className="h-4 w-4 text-muted-foreground" /></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div>التاريخ: <b>{String(request.vch_date).slice(0, 10)}</b></div><div>مقدم الطلب: <b>{request.requester_name || "-"}</b></div><div>فرع مقدم الطلب: <b>{branchName(request.branch_id)}</b></div><div>فرع البضاعة: <b>{branchName(request.manufacturing_branch_id)}</b></div><div>مستودع مقدم الطلب: <b>{warehouseName(request.to_store_id)}</b></div><div>مستودع المطلوب منه البضاعة: <b>{warehouseName(request.destination_warehouse_id)}</b></div><Button className="w-full" variant="outline" onClick={(event) => { event.stopPropagation(); openRequest(request) }}><Edit className="ml-2 h-4 w-4" />فتح الطلب</Button></CardContent></Card>)}{!requests.length && <div className="col-span-full rounded-xl border-2 border-dashed py-16 text-center"><FileText className="mx-auto mb-3 h-10 w-10" />لا توجد طلبات في هذه المرحلة</div>}</div><div onDragOver={(event) => event.preventDefault()} onDrop={dropRequest} className="flex min-h-[700px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 p-12 text-center lg:min-h-[820px]"><div><CheckCircle2 className="mx-auto mb-6 h-24 w-24 text-emerald-600" /><h2 className="text-3xl font-bold">اسحب الطلب هنا</h2><p className="mt-4 text-xl text-muted-foreground">لفتحه ومراجعته</p></div></div></div><Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{stage.title}: {selected?.vch_code}</DialogTitle></DialogHeader>{popupMessage && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{popupMessage}</div>}{selected && <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>فرع مقدم الطلب: <b>{branchName(selected.branch_id)}</b></div><div>فرع البضاعة: <b>{branchName(selected.manufacturing_branch_id)}</b></div><div>مستودع مقدم الطلب: <b>{warehouseName(selected.to_store_id)}</b></div><div>مستودع المطلوب منه البضاعة: <b>{warehouseName(selected.destination_warehouse_id)}</b></div><div>مقدم الطلب: <b>{selected.requester_name || "-"}</b></div></div><div className="rounded border p-4"><h2 className="mb-3 text-lg font-bold">الأصناف</h2>{stage.preparation && <div className="mb-2 grid grid-cols-[minmax(0,1fr)_140px_140px] gap-2 text-sm font-medium text-muted-foreground"><span>الصنف</span><span>الكمية المطلوبة</span><span>الكمية المجهزة</span></div>}{items.map((item, index) => <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px] sm:items-center" key={item.id || index}><span className="rounded border p-2">{item.item_name}</span>{stage.preparation ? <><input className="w-full rounded border bg-muted/30 p-2" type="number" value={item.qnty} readOnly aria-label="الكمية المطلوبة" /><input className="w-full rounded border p-2" type="number" min="0" max={item.qnty} value={item.editableQuantity} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, editableQuantity: Number(event.target.value) } : row))} aria-label="الكمية المجهزة" /></> : <span className="rounded border p-2">الكمية المطلوبة: <b>{item.qnty}</b></span>}</div>)}</div><Button className="w-full" onClick={() => void complete()} disabled={saving}>{stage.preparation ? <><Save className="ml-2 h-4 w-4" />حفظ الكمية المجهزة</> : <><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد الطلب</>}</Button></div>}</DialogContent></Dialog></div>
}
