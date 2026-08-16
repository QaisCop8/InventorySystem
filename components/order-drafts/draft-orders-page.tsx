"use client"

import { useEffect, useMemo, useState } from "react"
import { DraftOrderForm } from "./draft-order-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarDays, FileText, Paperclip, Plus, RefreshCw, Search, WalletCards } from "lucide-react"

export function DraftOrdersPage() {
  const [drafts, setDrafts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

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

  return <div dir="rtl" className="space-y-5 p-3 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="text-2xl font-bold">مسودات طلبيات المبيعات</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ المسودات وراجعها قبل تحويلها إلى طلبيات مبيعات فعلية.</p></div>
      <Button size="lg" onClick={() => setOpen(true)}><Plus className="ml-2 h-5 w-5" />إنشاء مسودة طلبية</Button>
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
      </CardContent></Card>)}</div>}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[94vh] w-[96vw] max-w-[1400px] overflow-y-auto p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4"><DialogTitle>إنشاء مسودة طلبية</DialogTitle></DialogHeader>
      <DraftOrderForm onSaved={() => { setOpen(false); void load() }} />
    </DialogContent></Dialog>
  </div>
}
