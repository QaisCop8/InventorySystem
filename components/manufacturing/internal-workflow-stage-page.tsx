"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Edit, FileText, RefreshCw, Save, Trash2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

type WorkflowRequest = { id: number; vch_code: string; vch_date: string; branch_id: number; manufacturing_branch_id: number; to_store_id: number | null; destination_warehouse_id: number | null; requester_name?: string; items?: any[] }
type WorkflowStage = { title: string; status: number; action: string; preparation?: boolean }

export default function InternalWorkflowStagePage({ stage }: { stage: WorkflowStage }) {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<WorkflowRequest[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selected, setSelected] = useState<WorkflowRequest | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || String(id)
  const warehouseName = (id: number | null) => warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.warehouse_name || "-"
  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests?status=${stage.status}`, { headers: { "x-branch-id": String(activeBranchId || "") } })
      const data = await response.json()
      setRequests(response.ok && Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { void load(); Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchResponse, warehouseResponse]) => { const [branchData, warehouseData] = await Promise.all([branchResponse.json(), warehouseResponse.json()]); setBranches(Array.isArray(branchData) ? branchData.sort((a, b) => Number(a.id) - Number(b.id)) : []); setWarehouses(Array.isArray(warehouseData) ? warehouseData.sort((a, b) => Number(a.id) - Number(b.id)) : []) }) }, [activeBranchId, stage.status])
  const openRequest = (request: WorkflowRequest) => { setSelected(request); setItems((request.items || []).map((item) => ({ ...item, editableQuantity: stage.preparation ? Number(item.prepared_quantity || 0) : Number(item.qnty) }))); setMessage("") }
  const savePreparation = async () => {
    if (!selected) return
    if (items.some((item) => !Number.isFinite(Number(item.editableQuantity)) || Number(item.editableQuantity) < 0 || Number(item.editableQuantity) > Number(item.qnty))) { setMessage("يجب أن تكون الكمية المجهزة بين صفر والكمية المطلوبة"); return }
    setSaving(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", prepared_items: items.map((item) => ({ id: item.id, prepared_quantity: Number(item.editableQuantity) })) }) })
      const data = await response.json()
      if (!response.ok) { setMessage(data.error || "تعذر حفظ الكمية المجهزة"); return }
      setMessage("تم حفظ الكمية المجهزة")
      setSelected(null)
      await load()
    } finally { setSaving(false) }
  }
  const complete = async () => {
    if (!selected) return
    const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: stage.action }) })
    const data = await response.json()
    if (!response.ok) { setMessage(data.error || "تعذر اعتماد الطلب"); return }
    setSelected(null)
    setMessage("تم اعتماد الطلب بنجاح")
    await load()
  }

  return <div dir="rtl" className="space-y-5 p-3 md:p-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">{stage.title}</h1><p className="mt-1 text-sm text-muted-foreground">راجع بيانات الطلب قبل اعتماد المرحلة.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button></div>{message && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{requests.map((request) => <Card key={request.id} className="cursor-pointer" onClick={() => openRequest(request)}><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><Badge>{stage.title}</Badge></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div>التاريخ: <b>{String(request.vch_date).slice(0, 10)}</b></div><div>مقدم الطلب: <b>{request.requester_name || "-"}</b></div><div>فرع مقدم الطلب: <b>{branchName(request.branch_id)}</b></div><div>فرع البضاعة: <b>{branchName(request.manufacturing_branch_id)}</b></div><Button className="w-full" variant="outline" onClick={(event) => { event.stopPropagation(); openRequest(request) }}><Edit className="ml-2 h-4 w-4" />فتح الطلب</Button></CardContent></Card>)}</div>{!loading && requests.length === 0 && <div className="rounded-xl border-2 border-dashed py-16 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-emerald-600" />لا توجد طلبات في هذه المرحلة</div>}<Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}><DialogHeader><DialogTitle>{stage.title}: {selected?.vch_code}</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>فرع مقدم الطلب: <b>{branchName(selected.branch_id)}</b></div><div>فرع البضاعة: <b>{branchName(selected.manufacturing_branch_id)}</b></div><div>مستودع مقدم الطلب: <b>{warehouseName(selected.to_store_id)}</b></div><div>مستودع المطلوب من البضاعة: <b>{warehouseName(selected.destination_warehouse_id)}</b></div><div>مقدم الطلب: <b>{selected.requester_name || "-"}</b></div></div><div className="rounded border p-4"><h3 className="mb-3 font-bold">الأصناف</h3>{items.map((item, index) => <div key={`${item.id}-${index}`} className="mb-2 grid grid-cols-[1fr_140px_40px] items-center gap-2"><Input value={item.item_name || ""} disabled /><Input type="number" min="0" max={item.qnty} value={item.editableQuantity} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, editableQuantity: Number(event.target.value) } : entry))} /><span className="text-xs text-muted-foreground">{stage.preparation ? "الكمية المجهزة" : "الكمية المطلوبة"}</span></div>)}</div><div className="flex gap-2">{stage.preparation && <Button className="flex-1" onClick={() => void savePreparation()} disabled={saving}><Save className="ml-2 h-4 w-4" />حفظ الكمية المجهزة</Button>}<Button className="flex-1" variant="default" onClick={() => void complete()} disabled={saving}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد المرحلة</Button></div></div>}</DialogContent></Dialog></div>
}
