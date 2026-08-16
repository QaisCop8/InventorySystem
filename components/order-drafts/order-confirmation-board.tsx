"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar, CheckCircle2, GripVertical, Paperclip } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"

export function OrderConfirmationBoard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [values, setValues] = useState<Record<string, any>>({})
  const [message, setMessage] = useState("")
  const [confirming, setConfirming] = useState(false)

  const load = () => Promise.all([fetch("/api/order-drafts").then((r) => r.json()), fetch("/api/order-checklists").then((r) => r.json())]).then(([d, t]) => { setDrafts(Array.isArray(d) ? d : []); setTemplates(Array.isArray(t) ? t : []) })
  useEffect(() => { void load() }, [])

  const openDraft = (draft: any) => { setSelected(draft); setValues(draft.checklist_values || {}); setMessage("") }
  const template = templates.find((item) => Number(item.id) === Number(selected?.checklist_template_id))

  const confirm = async () => {
    if (confirming || !selected) return
    const missing = template?.fields?.find((field: any) => {
      if (!field.is_required) return false
      const value = values[field.id]
      return value === undefined || value === null || value === "" || (field.field_type === "boolean" && value !== true)
    })
    if (missing) {
      const error = `يجب إدخال الحقل: ${missing.label}`
      setMessage(error)
      toast({ title: "بيانات مطلوبة", description: error, variant: "destructive" })
      return
    }

    setConfirming(true)
    try {
      const response = await fetch(`/api/order-drafts/${selected.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist_values: values, user_id: user?.id }) })
      const result = await response.json()
      if (!response.ok) {
        const error = result.error || "تعذر تأكيد الطلبية"
        setMessage(error)
        toast({ title: "تعذر تأكيد الطلبية", description: error, variant: "destructive" })
        return
      }
      if (result.workflow_created === false) {
        toast({
          title: "تم إنشاء الطلبية مع تنبيه",
          description: result.workflow_message || "تعذر إنشاء سير العمل لبعض الأصناف",
          variant: "destructive",
        })
      } else {
        toast({ title: "تم تأكيد الطلبية", description: `تم إنشاء طلبية المبيعات ${result.order_number} وبدء سير العمل` })
      }
      setSelected(null)
      await load()
    } catch {
      const error = "تعذر الاتصال بالخادم أثناء تأكيد الطلبية"
      setMessage(error)
      toast({ title: "خطأ في الاتصال", description: error, variant: "destructive" })
    } finally { setConfirming(false) }
  }

  return <div dir="rtl" className="p-4">
    <h1 className="text-2xl font-bold">تأكيد الطلبيات</h1>
    <p className="mb-5 text-muted-foreground">اسحب بطاقة المسودة إلى منطقة التأكيد، أكمل قائمة التحقق، ثم أنشئ الطلبية.</p>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-h-[500px] rounded-xl border bg-muted/30 p-4"><h2 className="mb-4 font-bold">المسودات بانتظار المراجعة ({drafts.filter((d) => d.status === "draft").length})</h2><div className="grid gap-3 sm:grid-cols-2">{drafts.filter((d) => d.status === "draft").map((draft) => <Card key={draft.id} draggable onDragStart={(event) => event.dataTransfer.setData("draft", String(draft.id))} className="cursor-grab"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>{draft.draft_number}</span><GripVertical className="h-4 w-4" /></CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><b>{draft.customer_name}</b><div className="flex gap-2"><Calendar className="h-4 w-4" />التسليم: {draft.requested_delivery_date}</div><div>{draft.items.length} أصناف · عربون {Number(draft.deposit_amount).toFixed(2)}</div>{draft.attachments?.length > 0 && <div className="flex gap-1"><Paperclip className="h-4 w-4" />{draft.attachments.length} مرفقات</div>}<Badge>{draft.priority === "urgent" ? "عاجلة" : draft.priority === "high" ? "عالية" : "عادية"}</Badge></CardContent></Card>)}</div></section>
      <section onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const draft = drafts.find((item) => item.id === Number(event.dataTransfer.getData("draft"))); if (draft) openDraft(draft) }} className="flex min-h-[500px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-6 text-center"><div><CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-600" /><h2 className="text-xl font-bold">اسحب الطلبية هنا للتأكيد</h2><p className="text-muted-foreground">سيتم فحص الكميات وجميع الحقول الإلزامية قبل إنشاء الطلبية.</p></div></section>
    </div>

    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>مراجعة {selected?.draft_number}</DialogTitle></DialogHeader>{selected && <div className="space-y-5">
      <div className="grid gap-2 rounded border p-3 sm:grid-cols-2"><div>العميل: <b>{selected.customer_name}</b></div><div>التسليم: <b>{selected.requested_delivery_date}</b></div>{selected.items.map((item: any) => <div key={item.id} className="sm:col-span-2">{item.product_name}: {Number(item.quantity)} × {Number(item.price).toFixed(2)}</div>)}</div>
      {template ? <div><h3 className="mb-3 font-bold">قائمة التحقق: {template.name}</h3>{template.fields.map((field: any) => <div key={field.id} className="mb-3"><label className="mb-1 block text-sm">{field.label}{field.is_required && <span className="text-red-600"> *</span>}</label>{field.field_type === "textarea" ? <Textarea maxLength={field.max_length || undefined} value={values[field.id] || ""} onChange={(event) => setValues({ ...values, [field.id]: event.target.value })} /> : field.field_type === "boolean" ? <label className="flex gap-2"><input type="checkbox" checked={values[field.id] === true} onChange={(event) => setValues({ ...values, [field.id]: event.target.checked })} />تم التحقق</label> : <Input type={field.field_type === "date" ? "date" : ["integer", "decimal"].includes(field.field_type) ? "number" : "text"} step={field.field_type === "decimal" ? "any" : undefined} maxLength={field.max_length || undefined} value={values[field.id] ?? ""} onChange={(event) => setValues({ ...values, [field.id]: event.target.value })} />}</div>)}</div> : <div className="rounded bg-muted p-3">لا توجد قائمة تحقق مرتبطة بهذه المسودة.</div>}
      {message && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>}
      <Button onClick={confirm} disabled={confirming} className="w-full"><CheckCircle2 className="ml-2 h-4 w-4" />{confirming ? "جاري إنشاء الطلبية..." : "تأكيد وإنشاء طلبية المبيعات"}</Button>
    </div>}</DialogContent></Dialog>
  </div>
}
