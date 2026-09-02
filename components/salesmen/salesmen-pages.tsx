"use client"

import { useEffect, useRef, useState } from "react"
import UnifiedSalesmen, { type SalesmanRecord } from "./unified-salesmen"
import { FilterBar, Grid, HrPage, ListActions, type Column } from "@/components/hr/hr-shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Pencil, Plus, UserCheck, Users } from "lucide-react"

const blank = (): SalesmanRecord => ({ code: "", name: "", other_name: "", job_title: "", classification: "", region: "", address: "", mobile: "", email: "", is_supervisor: false, supervisor_id: null, sales_commission_percent: 0, collection_commission_percent: 0, portal_active: false, login_code: "", portal_password: "", notes: "", is_active: true })

export default function SalesmenPages() {
  const [rows, setRows] = useState<SalesmanRecord[]>([])
  const [form, setForm] = useState<SalesmanRecord>(blank())
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<SalesmanRecord | null>(null)
  const [status, setStatus] = useState("active")
  const messagesRef = useRef<any>(null)

  const load = async () => { const response = await fetch("/api/salesmen"); const data = await response.json(); setRows(data.success && Array.isArray(data.data) ? data.data : []) }
  useEffect(() => { void load() }, [])
  const generateCode = async () => { const response = await fetch("/api/salesmen?generate=1"); const data = await response.json(); return response.ok ? String(data.code || "") : "" }
  const show = async (row?: SalesmanRecord) => { setForm(row ? { ...row } : { ...blank(), code: await generateCode() }); setOpen(true) }
  const adjustCode = (value: string) => { const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10); const match = code.match(/^([A-Z]*)(\d*)$/); return match ? `${match[1]}${match[2].padStart(Math.max(0, 10 - match[1].length), "0")}`.slice(0, 10) : code.padEnd(10, "0") }
  const handleCodeBlur = async () => {
    const code = adjustCode(form.code)
    if (!code) {
      const generatedCode = await generateCode()
      setForm((current) => ({ ...current, code: generatedCode }))
      return
    }
    const response = await fetch(`/api/salesmen?code=${encodeURIComponent(code)}`)
    const data = await response.json()
    setForm(data.data ? { ...data.data } : (current) => ({ ...current, code }))
  }
  const navigate = (index: number) => { if (rows[index]) void show(rows[index]) }
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "رقم واسم المندوب مطلوبان", life: 5000 }])
    setSaving(true)
    const response = await fetch("/api/salesmen", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    const data = await response.json()
    if (!response.ok) messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || "تعذر الحفظ", life: 5000 }])
    else { await load(); setOpen(false); messagesRef.current?.show?.([{ severity: "success", summary: "", detail: "تم حفظ المندوب بنجاح", life: 4000 }]) }
    setSaving(false)
  }
  const remove = async () => { if (!form.id) return; const response = await fetch(`/api/salesmen?id=${form.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) return messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || "تعذر حذف المندوب", life: 5000 }]); await load(); setOpen(false); messagesRef.current?.show?.([{ severity: "success", summary: "", detail: "تم حذف المندوب بنجاح", life: 4000 }]) }
  const filtered = rows.filter((row) => (status === "all" || row.is_active === (status === "active")) && `${row.code} ${row.name} ${row.job_title || ""} ${row.classification || ""} ${row.region || ""}`.toLowerCase().includes(query.toLowerCase()))
  const columns: Column[] = [{ key: "code", label: "الرقم", width: 130 }, { key: "name", label: "اسم المندوب" }, { key: "other_name", label: "الاسم بالإنجليزي" }, { key: "job_title", label: "الوظيفة" }, { key: "classification", label: "التصنيف" }, { key: "region", label: "المنطقة" }, { key: "sales_commission_percent", label: "عمولة البيع %", type: "number" }, { key: "collection_commission_percent", label: "عمولة التحصيل %", type: "number" }, { key: "is_active", label: "فعال", width: 80, type: "boolean" }, { key: "edit", label: "تعديل", width: 80, render: (row) => <Button size="icon" variant="outline" className="h-8 w-8 border-indigo-200 text-indigo-600" onClick={(event) => { event.stopPropagation(); void show(row) }}><Pencil className="h-4 w-4" /></Button> }]

  return <HrPage title="المندوبين" subtitle="ملفات المندوبين والعمولات والإشراف">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="grid flex-1 gap-3 sm:grid-cols-2"><Card className="border-0 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-indigo-100">إجمالي المندوبين</p><p className="text-3xl font-bold">{rows.length}</p></div><Users className="h-10 w-10 text-indigo-200" /></CardContent></Card><Card className="border-0 bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-emerald-100">المندوبون الفعالون</p><p className="text-3xl font-bold">{rows.filter(row => row.is_active).length}</p></div><UserCheck className="h-10 w-10 text-emerald-200" /></CardContent></Card></div><Button className="h-11 bg-gradient-to-r from-indigo-600 to-purple-600 px-5 shadow-lg" onClick={() => void show()}><Plus className="ml-2 h-4 w-4" />إضافة مندوب جديد</Button></div>
    <ListActions onEdit={() => selected && void show(selected)} onRefresh={load} onPrint={() => window.print()} />
    <FilterBar search={query} onSearch={setQuery} status={status} onStatus={setStatus} count={filtered.length} />
    <Grid rows={filtered} columns={columns} onSelect={setSelected} onDoubleClick={(row) => void show(row)} />
    <UnifiedSalesmen open={open} form={form} rows={rows} saving={saving} messagesRef={messagesRef} onOpenChange={setOpen} onFormChange={setForm} onCodeBlur={() => void handleCodeBlur()} onNew={() => void show()} onSave={save} onDelete={() => void remove()} onNavigate={navigate} />
  </HrPage>
}
