"use client"

import { useEffect, useMemo, useState } from "react"
import { DraftOrderForm } from "./draft-order-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarDays, Edit, FileText, Paperclip, Plus, RefreshCw, Search, Trash2, WalletCards } from "lucide-react"

export function DraftOrdersPage() {
  const [drafts, setDrafts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [editingDraft, setEditingDraft] = useState<any>(null)
  const [readOnly, setReadOnly] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/order-drafts")
      const data = await response.json()
      setDrafts(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return drafts.filter((draft) => !term || String(draft.draft_number || "").toLowerCase().includes(term) || String(draft.customer_name || "").toLowerCase().includes(term))
  }, [drafts, search])

  const statusLabel = (status: string) => status === "confirmed" ? "تم التأكيد" : status === "cancelled" ? "ملغاة" : "مسودة"
  const createNew = () => { setEditingDraft(null); setReadOnly(false); setOpen(true) }
  const removeDraft = async (draft: any) => {
    if (!confirm(`هل تريد حذف المسودة ${draft.draft_number}؟`)) return
    const response = await fetch(`/api/order-drafts/${draft.id}`, { method: "DELETE" })
    if (!response.ok) { const result = await response.json(); alert(result.error || "تعذر حذف المسودة"); return }
    void load()
  }

  return <div dir="rtl" className="space-y-5 p-3 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="text-2xl font-bold">مسودات طلبيات المبيعات</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ المسودات وراجعها قبل تحويلها إلى طلبيات مبيعات فعلية.</p></div>
      <Button size="lg" onClick={createNew}><Plus className="ml-2 h-5 w-5" />إنشاء مسودة طلبية</Button>
    </div>

    <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
      <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث برقم المسودة أو اسم العميل..." /></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
    </CardContent></Card>

    {loading ? <div className="py-16 text-center text-muted-foreground">جاري تحميل المسودات...</div> : visible.length === 0 ? <div className="rounded-xl border-2 border-dashed py-16 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h2 className="font-bold">لا توجد مسودات</h2><p className="mb-4 mt-1 text-sm text-muted-foreground">ابدأ بإنشاء أول مسودة طلبية.</p><Button onClick={() => setOpen(true)}><Plus className="ml-2 h-4 w-4" />إنشاء مسودة طلبية</Button></div> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((draft) => <Card key={draft.id} className="transition hover:border-emerald-300 hover:shadow-md"><CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3"><div><div className="font-bold">{draft.draft_number}</div><div className="mt-1 text-sm text-muted-foreground">{draft.customer_name}</div></div><Badge variant={draft.status === "confirmed" ? "default" : "secondary"}>{statusLabel(draft.status)}</Badge></div>
        <div className="grid grid-cols-2 gap-3 text-sm"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-600" /><span>التسليم<br /><b>{draft.requested_delivery_date}</b></span></div><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-amber-600" /><span>العربون<br /><b>{Number(draft.deposit_amount || 0).toFixed(2)}</b></span></div></div>
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{draft.items?.length || 0} أصناف</span><span className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{draft.attachments?.length || 0} مرفقات</span></div>
        {draft.status === "draft" && <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => { setEditingDraft(draft); setReadOnly(false); setOpen(true) }}><Edit className="ml-2 h-4 w-4" />تعديل</Button><Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeDraft(draft)}><Trash2 className="ml-2 h-4 w-4" />حذف</Button></div>}
        {draft.status !== "draft" && <Button variant="outline" className="w-full" onClick={() => { setEditingDraft(draft); setReadOnly(true); setOpen(true) }}><Search className="ml-2 h-4 w-4" />مشاهدة</Button>}
      </CardContent></Card>)}</div>}

    <Dialog modal={false} open={open} onOpenChange={setOpen}><DialogContent className="min-w-0 max-h-[94vh] w-[calc(100%-1rem)] max-w-[1400px] overflow-x-hidden overflow-y-auto p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4"><DialogTitle>{readOnly ? "مشاهدة مسودة طلبية" : editingDraft ? "تعديل مسودة طلبية" : "إنشاء مسودة طلبية"}</DialogTitle></DialogHeader>
      <DraftOrderForm key={`${editingDraft?.id || "new"}-${readOnly}`} initialDraft={editingDraft} readOnly={readOnly} onSaved={() => { setOpen(false); setEditingDraft(null); void load() }} />
    </DialogContent></Dialog>
  </div>
}
