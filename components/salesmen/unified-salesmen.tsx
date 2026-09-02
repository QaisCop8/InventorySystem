"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Card, CardContent } from "@/components/ui/card"
import { useWorkspace } from "@/contexts/workspace-context"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"

export interface SalesmanRecord {
  id?: number
  code: string
  name: string
  other_name?: string
  job_title?: string
  classification?: string
  region?: string
  address?: string
  mobile?: string
  email?: string
  is_supervisor: boolean
  supervisor_id: number | null
  sales_commission_percent: number | string
  collection_commission_percent: number | string
  portal_active: boolean
  login_code?: string
  portal_password?: string
  notes?: string
  is_active: boolean
}

interface UnifiedSalesmenProps {
  open: boolean
  form: SalesmanRecord
  rows: SalesmanRecord[]
  saving: boolean
  messagesRef: React.RefObject<any>
  onOpenChange: (open: boolean) => void
  onFormChange: (form: SalesmanRecord) => void
  onCodeBlur: () => void
  onNew: () => void
  onSave: () => void
  onDelete: () => void
  onNavigate: (index: number) => void
}

export default function UnifiedSalesmen({ open, form, rows, saving, messagesRef, onOpenChange, onFormChange, onCodeBlur, onNew, onSave, onDelete, onNavigate }: UnifiedSalesmenProps) {
  const { fullscreenEnabled } = useWorkspace()
  const index = rows.findIndex((row) => row.id === form.id)
  const nameRef = useRef<HTMLInputElement>(null)
  const initialHashRef = useRef("")
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const set = (key: keyof SalesmanRecord, value: any) => onFormChange({ ...form, [key]: value })
  const field = (label: string, key: keyof SalesmanRecord, type = "text", span = "") => <label className={`space-y-2 text-sm ${span}`}><span className="font-medium text-slate-600">{label}</span><Input ref={key === "name" ? nameRef : undefined} className="h-10 rounded-xl border-slate-200 bg-white shadow-sm" type={type} maxLength={key === "code" ? 10 : undefined} value={(form[key] as string | number) ?? ""} onChange={(event) => set(key, key === "code" ? event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : event.target.value)} onBlur={key === "code" ? onCodeBlur : key === "name" && !form.other_name?.trim() ? () => set("other_name", form.name) : undefined} /></label>
  const formHash = JSON.stringify(form)
  useEffect(() => { if (!open) return; initialHashRef.current = JSON.stringify(form); window.requestAnimationFrame(() => nameRef.current?.focus()) }, [open, form.id])
  const guarded = (action: () => void) => formHash !== initialHashRef.current ? setPendingAction(() => action) : action()
  useEffect(() => { if (!open) return; const handler = (event: KeyboardEvent) => { if (event.key === "F3") { event.preventDefault(); onSave() } else if (event.key === "F9" && form.id) { event.preventDefault(); setDeleteConfirm(true) } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler) }, [open, form.id, onSave])
  const enterAsTab = (event: React.KeyboardEvent) => { if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).tagName === "TEXTAREA") return; event.preventDefault(); const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])')).filter(control => control.tabIndex !== -1); controls[controls.indexOf(event.target as HTMLElement) + 1]?.focus() }

  return <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : guarded(() => onOpenChange(false))}>
    <DialogContent inline={fullscreenEnabled && open} className="flex max-h-[94vh] w-[98vw] max-w-6xl flex-col overflow-hidden p-0" dir="rtl">
      <UniversalToolbar currentRecord={index >= 0 ? index + 1 : 0} totalRecords={rows.length} onNew={() => guarded(onNew)} onSave={onSave} onDelete={form.id ? () => setDeleteConfirm(true) : undefined} onFirst={() => guarded(() => onNavigate(0))} onPrevious={() => guarded(() => onNavigate(Math.max(0, index - 1)))} onNext={() => guarded(() => onNavigate(Math.min(rows.length - 1, index + 1)))} onLast={() => guarded(() => onNavigate(rows.length - 1))} isSaving={saving} canSave canDelete={!!form.id} isFirstRecord={rows.length === 0 || index === 0} isLastRecord={rows.length === 0 || index === rows.length - 1} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4" onKeyDown={enterAsTab}><Messages innerRef={messagesRef} /><DialogHeader className="mb-4 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-3 shadow"><DialogTitle className="text-right text-white">المندوبين {!form.id && <span className="text-emerald-50">(إضافة)</span>}</DialogTitle></DialogHeader><Card className="border-slate-200 shadow-sm"><CardContent className="space-y-5 p-5"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{field("رقم المندوب *", "code")}{field("اسم المندوب *", "name")}{field("الاسم بالإنجليزي", "other_name")}{field("الوظيفة", "job_title")}{field("التصنيف", "classification")}{field("المنطقة", "region")}{field("الجوال", "mobile")}{field("البريد الإلكتروني", "email")}{field("عمولة المبيعات %", "sales_commission_percent", "number")}{field("عمولة التحصيل %", "collection_commission_percent", "number")}</div><div className="grid gap-4 md:grid-cols-2">{field("العنوان", "address")}<label className="space-y-2 text-sm"><span className="font-medium text-slate-600">ملاحظات</span><textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm" value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></label></div></CardContent></Card></div>
      <ConfirmDialogYesNo visible={!!pendingAction} message="تم تعديل البيانات، هل تريد الحفظ؟" showBack onConfirm={() => { const action = pendingAction; setPendingAction(null); onSave(); action?.() }} onCancel={() => { const action = pendingAction; setPendingAction(null); action?.() }} onBack={() => setPendingAction(null)} />
      <ConfirmDialogYesNo visible={deleteConfirm} message="هل أنت متأكد من حذف المندوب؟" onConfirm={() => { setDeleteConfirm(false); onDelete() }} onCancel={() => setDeleteConfirm(false)} />
    </DialogContent>
  </Dialog>
}
