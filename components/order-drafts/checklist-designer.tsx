"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ClipboardCheck, GripVertical, ListChecks, Plus, Save, Trash2 } from "lucide-react"

type Field = { label: string; field_type: string; max_length: string; is_required: boolean }
const FIELD_TYPES = [["text", "نص قصير"], ["textarea", "نص طويل"], ["integer", "عدد صحيح"], ["decimal", "عدد عشري"], ["date", "تاريخ"], ["boolean", "نعم / لا"]]

export function ChecklistDesigner() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [fields, setFields] = useState<Field[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const load = () => fetch("/api/order-checklists").then((response) => response.json()).then(setTemplates)
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!message || messageType !== "success") return
    const timeoutId = window.setTimeout(() => {
      setMessage("")
      setMessageType(null)
    }, 3000)
    return () => window.clearTimeout(timeoutId)
  }, [message, messageType])

  const updateField = (index: number, patch: Partial<Field>) => setFields((current) => current.map((field, i) => i === index ? { ...field, ...patch } : field))
  const addField = () => setFields((current) => [...current, { label: "", field_type: "text", max_length: "", is_required: false }])
  const resetDesigner = () => { setSelectedTemplateId(null); setName(""); setDescription(""); setFields([]); setMessage(""); setMessageType(null) }
  const editTemplate = (template: any) => {
    setSelectedTemplateId(Number(template.id))
    setName(String(template.name || ""))
    setDescription(String(template.description || ""))
    setFields((template.fields || []).map((field: any) => ({
      label: String(field.label || ""), field_type: String(field.field_type || "text"),
      max_length: field.max_length == null ? "" : String(field.max_length), is_required: Boolean(field.is_required),
    })))
    setMessage("")
    setMessageType(null)
  }
  const moveField = (target: number) => {
    if (dragIndex === null || dragIndex === target) return
    setFields((current) => { const next = [...current]; const [field] = next.splice(dragIndex, 1); next.splice(target, 0, field); return next })
    setDragIndex(null)
  }
  const save = async () => {
    setMessage("")
    setMessageType(null)
    if (!name.trim()) {
      setMessage("يرجى إدخال اسم قائمة التحقق")
      setMessageType("error")
      return
    }
    if (!fields.some((field) => field.label.trim())) {
      setMessage("يرجى إضافة حقل واحد على الأقل وكتابة عنوانه")
      setMessageType("error")
      return
    }
    const normalizedName = name.trim().toLocaleLowerCase()
    const duplicateName = templates.some((template) =>
      Number(template.id) !== Number(selectedTemplateId) &&
      String(template.name || "").trim().toLocaleLowerCase() === normalizedName
    )
    if (duplicateName) {
      setMessage("اسم قائمة التحقق مستخدم مسبقاً")
      setMessageType("error")
      return
    }

    setIsSaving(true)
    try {
      const validFields = fields.filter((field) => field.label.trim())
      const response = await fetch("/api/order-checklists", { method: selectedTemplateId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedTemplateId, name: name.trim(), description, fields: validFields }) })
      const result = await response.json()
      setMessage(response.ok ? (selectedTemplateId ? "تم تحديث قائمة التحقق بنجاح" : "تم حفظ القائمة بنجاح") : result.error || "تعذر حفظ قائمة التحقق")
      setMessageType(response.ok ? "success" : "error")
      if (response.ok) { setSelectedTemplateId(null); setName(""); setDescription(""); setFields([]); void load() }
    } catch {
      setMessage("تعذر الاتصال بالخادم أثناء حفظ قائمة التحقق")
      setMessageType("error")
    } finally {
      setIsSaving(false)
    }
  }
  const previewControl = (field: Field) => {
    if (field.field_type === "textarea") return <Textarea disabled placeholder="إجابة المستخدم" />
    if (field.field_type === "boolean") return <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" disabled /> تم التحقق</label>
    return <Input disabled type={field.field_type === "date" ? "date" : ["integer", "decimal"].includes(field.field_type) ? "number" : "text"} placeholder="إجابة المستخدم" />
  }

  return <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-7 w-7 text-emerald-600" />مصمم قوائم التحقق</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ حقول التحقق ورتبها بالسحب، ثم اربط القائمة بمسودة الطلبية.</p></div>
      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">{selectedTemplateId && <Button size="lg" variant="outline" onClick={resetDesigner}><Plus className="ml-2 h-4 w-4" />قائمة جديدة</Button>}<Button size="lg" onClick={save} disabled={isSaving}><Save className="ml-2 h-4 w-4" />{isSaving ? "جاري الحفظ..." : selectedTemplateId ? "حفظ التعديلات" : "حفظ القائمة"}</Button></div>
    </div>
    {message && <div role="alert" className={`rounded-xl border p-3 text-sm font-semibold ${messageType === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}>{message}</div>}
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 2xl:grid-cols-[280px_minmax(0,1fr)_minmax(320px,.75fr)]">
      <Card className="order-2 min-w-0 lg:order-2 2xl:order-1 2xl:sticky 2xl:top-4"><CardHeader><CardTitle className="text-base">القوائم المحفوظة</CardTitle></CardHeader><CardContent className="max-h-[50vh] space-y-2 overflow-y-auto 2xl:max-h-[70vh]">
        {!templates.length && <p className="py-6 text-center text-sm text-muted-foreground">لا توجد قوائم محفوظة</p>}
        {templates.map((template) => <button type="button" onClick={() => editTemplate(template)} key={template.id} className={`w-full rounded-xl border p-3 text-right transition hover:border-emerald-300 hover:bg-emerald-50/40 ${selectedTemplateId === Number(template.id) ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/30" : ""}`}><div className="flex items-start justify-between gap-2"><b className="text-sm">{template.name}</b><Badge variant="secondary">{template.fields.length}</Badge></div>{template.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>}</button>)}
      </CardContent></Card>

      <div className="order-1 min-w-0 space-y-5 lg:col-span-2 2xl:order-2 2xl:col-span-1">
        <Card><CardHeader><CardTitle className="text-base">بيانات القائمة</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>اسم قائمة التحقق *</Label><Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: مراجعة طلبية مبيعات" /></div><div><Label>الوصف والتعليمات</Label><Textarea className="mt-1" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="تعليمات مختصرة للمستخدم الذي سيؤكد الطلبية" /></div></CardContent></Card>
        <Card className="min-w-0"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-5 w-5" />الحقول ({fields.length})</CardTitle><Button className="w-full sm:w-auto" variant="outline" onClick={addField}><Plus className="ml-2 h-4 w-4" />إضافة حقل</Button></div></CardHeader><CardContent className="space-y-3">
          {!fields.length && <button onClick={addField} className="flex w-full flex-col items-center rounded-xl border-2 border-dashed p-10 text-muted-foreground transition hover:border-emerald-400 hover:text-emerald-700"><Plus className="mb-2 h-7 w-7" />ابدأ بإضافة أول حقل</button>}
          {fields.map((field, index) => <div key={index} draggable onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveField(index)} className={`rounded-xl border bg-card p-4 shadow-sm transition ${dragIndex === index ? "opacity-50 ring-2 ring-emerald-400" : "hover:border-emerald-300"}`}>
            <div className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)_40px] items-end gap-3 md:grid-cols-[28px_minmax(0,1fr)_minmax(130px,.65fr)_40px]"><button type="button" className="row-span-2 self-center cursor-grab text-muted-foreground"><GripVertical className="h-5 w-5" /></button><div className="min-w-0"><Label>عنوان الحقل *</Label><Input className="mt-1" value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} placeholder={`الحقل ${index + 1}`} /></div><div className="col-start-2 min-w-0 md:col-start-3 md:row-start-1"><Label>نوع الإجابة</Label><select className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-2" value={field.field_type} onChange={(event) => updateField(index, { field_type: event.target.value })}>{FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="col-start-2 min-w-0 md:row-start-2"><Label>أقصى طول</Label><Input className="mt-1" type="number" min="1" value={field.max_length} disabled={!['text', 'textarea'].includes(field.field_type)} onChange={(event) => updateField(index, { max_length: event.target.value })} /></div><label className="col-start-2 flex items-center gap-2 pb-2 text-sm md:col-start-3 md:row-start-2"><input type="checkbox" checked={field.is_required} onChange={(event) => updateField(index, { is_required: event.target.checked })} />إلزامي</label><Button size="icon" variant="ghost" className="col-start-3 row-start-1 text-red-600 hover:bg-red-50 md:col-start-4" onClick={() => setFields((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>
          </div>)}
        </CardContent></Card>
      </div>

      <Card className="order-3 min-w-0 lg:order-3 2xl:sticky 2xl:top-4"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">معاينة النموذج</CardTitle><Badge variant="outline">مباشرة</Badge></div></CardHeader><CardContent><div className="rounded-xl border bg-muted/20 p-4 sm:p-5"><h2 className="break-words font-bold">{name || "اسم قائمة التحقق"}</h2><p className="mb-5 mt-1 break-words text-sm text-muted-foreground">{description || "سيظهر وصف القائمة هنا."}</p><div className="space-y-4">{fields.filter((field) => field.label.trim()).map((field, index) => <div key={index} className="min-w-0"><Label className="break-words">{field.label}{field.is_required && <span className="text-red-600"> *</span>}</Label><div className="mt-1">{previewControl(field)}</div>{field.max_length && ['text', 'textarea'].includes(field.field_type) && <p className="mt-1 text-xs text-muted-foreground">الحد الأقصى {field.max_length} حرفاً</p>}</div>)}</div>{fields.every((field) => !field.label.trim()) && <div className="rounded-lg border-2 border-dashed px-3 py-10 text-center text-sm text-muted-foreground">أضف حقولاً لمعاينة النموذج</div>}</div></CardContent></Card>
    </div>
  </div>
}
