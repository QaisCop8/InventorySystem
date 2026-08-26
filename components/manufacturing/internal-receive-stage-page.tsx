"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, FileText, GripVertical, RefreshCw } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

type Stage = { title: string; status: number; action: "receive" | "receivedAudit" }
type Request = { id: number; vch_code: string; vch_date: string; branch_id: number; manufacturing_branch_id: number; to_store_id: number | null; destination_warehouse_id: number | null; requester_name?: string; items?: any[] }

export default function InternalReceiveStagePage({ stage }: { stage: Stage }) {
  const { activeBranchId } = useAuth()
  const [requests, setRequests] = useState<Request[]>([])
  const [selected, setSelected] = useState<Request | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [message, setMessage] = useState("")
  const [popupMessage, setPopupMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const receivedRef = useRef<HTMLInputElement | null>(null)
  const load = async () => { const response = await fetch(`/api/internal-manufacturing-requests?status=${stage.status}&_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(activeBranchId || "") } }); const data = await response.json(); setRequests(response.ok && Array.isArray(data) ? data : []) }
  useEffect(() => { void load() }, [activeBranchId, stage.status])
  useEffect(() => {
    if (!selected) return
    requestAnimationFrame(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]')
      const itemNames = Array.from(dialog?.querySelectorAll("span.rounded.border.p-2") || [])
      items.forEach((item, index) => {
        const name = itemNames[index] as HTMLElement | undefined
        if (!name) return
        name.classList.add("text-lg", "font-bold", "text-blue-600")
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
  const openRequest = (request: Request) => { setSelected(request); setPopupMessage(""); setItems((request.items || []).map((item) => ({ ...item, receivedInput: Number(item.received_quantity) > 0 ? Number(item.received_quantity) : Number(item.prepared_quantity || item.qnty) }))) }
  useEffect(() => { if (!selected) return; requestAnimationFrame(() => receivedRef.current?.focus()) }, [selected])
  useEffect(() => {
    if (!selected) return
    const frame = requestAnimationFrame(() => {
      const label = stage.action === "receive" ? "استلام الطلب" : "تدقيق البضاعة المستلمة"
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"][data-state="open"] button')).find((item) => item.textContent?.includes("اعتماد الطلب"))
      if (button) button.replaceChildren(document.createTextNode(label))
    })
    return () => cancelAnimationFrame(frame)
  }, [selected, stage.action])
  const dropRequest = () => { const request = requests.find((item) => item.id === draggedId); if (request) openRequest(request); setDraggedId(null) }
  const approve = async () => { if (!selected) return; if (items.some((item) => !Number.isFinite(Number(item.receivedInput)) || Number(item.receivedInput) < 0 || Number(item.receivedInput) > 100000)) { setPopupMessage("الكمية المستلمة يجب أن تكون بين 0 و100000"); return }; setSaving(true); try { const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: stage.action, branch_id: selected.branch_id, received_items: items.map((item) => ({ id: item.id, received_quantity: Number(item.receivedInput) })) }) }); const data = await response.json(); if (!response.ok) { setPopupMessage(data.error || "تعذر اعتماد الطلب"); return }; setSelected(null); setMessage("تم اعتماد الطلب بنجاح"); await load() } finally { setSaving(false) } }
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("div.cursor-grab"))
    cards.slice(0, requests.length).forEach((card, index) => {
      card.classList.add("border-2", "border-slate-200")
    })
    if (!selected) return
    const dialog = document.querySelector('[role="dialog"][data-state="open"]')
    Array.from(dialog?.querySelectorAll('div.grid[class*="grid-cols-"] > span.rounded.border.p-2') || []).forEach((element, index) => {
      const item = items[index] as any
      if (!item?.product_image || element.querySelector("[data-internal-item-image]")) return
      const image = document.createElement("img")
      image.dataset.internalItemImage = "true"
      image.src = item.product_image
      image.alt = item.item_name || ""
      image.className = "mb-2 h-16 w-16 rounded border object-cover"
      element.prepend(image)
    })
    cards.slice(0, requests.length).forEach((card, index) => {
      if (card.querySelector("[data-internal-open-button]")) return
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.internalOpenButton = "true"
      button.className = "mt-2 w-full rounded border px-3 py-2 text-sm"
      button.textContent = stage.action === "receive" ? "استلام الطلب" : "تدقيق البضاعة المستلمة"
      button.onclick = () => openRequest(requests[index])
      card.querySelector("div.space-y-2")?.appendChild(button)
    })
  }, [requests, selected, items, stage.title])
  const name = (id: number | null) => String(id || "-")
  return <div dir="rtl" className="space-y-5 p-3 md:p-6"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{stage.title}</h1><Button variant="outline" onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button></div>{message && !selected && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">{message}</div>}<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(560px,720px)]"><div className="grid gap-4 sm:grid-cols-2">{requests.map((request) => <Card key={request.id} draggable onDragStart={() => setDraggedId(request.id)} onClick={() => openRequest(request)} className="cursor-grab"><CardHeader><CardTitle className="flex items-center justify-between text-base">{request.vch_code}<GripVertical className="h-4 w-4" /></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div>مقدم الطلب: <b>{request.requester_name || "-"}</b></div><div>فرع مقدم الطلب: <b>{name(request.branch_id)}</b></div><div>فرع البضاعة: <b>{name(request.manufacturing_branch_id)}</b></div></CardContent></Card>)}{!requests.length && <div className="col-span-full py-16 text-center"><FileText className="mx-auto mb-3 h-10 w-10" />لا توجد طلبات في هذه المرحلة</div>}</div><div onDragOver={(event) => event.preventDefault()} onDrop={dropRequest} className="flex min-h-[700px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 p-12 text-center"><div><CheckCircle2 className="mx-auto mb-6 h-24 w-24 text-emerald-600" /><h2 className="text-3xl font-bold">اسحب الطلب هنا</h2><p className="mt-4 text-xl">لفتحه ومراجعته</p></div></div></div><Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-w-5xl"><DialogHeader><DialogTitle>{stage.title}: {selected?.vch_code}</DialogTitle></DialogHeader>{popupMessage && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{popupMessage}</div>}{selected && <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>فرع مقدم الطلب: <b>{name(selected.branch_id)}</b></div><div>فرع البضاعة: <b>{name(selected.manufacturing_branch_id)}</b></div><div>مقدم الطلب: <b>{selected.requester_name || "-"}</b></div></div><div className="rounded border p-4"><h2 className="mb-3 text-lg font-bold">الأصناف</h2><div className="grid grid-cols-[minmax(0,1fr)_140px_140px_140px] gap-2 border-b pb-2 text-sm font-bold"><span>الصنف</span><span>الكمية المطلوبة</span><span>الكمية المجهزة</span><span>الكمية المستلمة</span></div>{items.map((item, index) => <div key={item.id || index} className="grid grid-cols-[minmax(0,1fr)_140px_140px_140px] items-center gap-2 py-2"><span className="rounded border p-2">{item.item_name}</span><input className="rounded border bg-muted/30 p-2" value={item.qnty} readOnly /><input className="rounded border bg-muted/30 p-2" value={item.prepared_quantity || item.qnty} readOnly /><input ref={index === 0 ? receivedRef : undefined} className="rounded border p-2" type="number" min="0" max="100000" value={item.receivedInput} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, receivedInput: Number(event.target.value) } : row))} /></div>)}</div><Button className="w-full" onClick={() => void approve()} disabled={saving}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد الطلب</Button></div>}</DialogContent></Dialog></div>
}
