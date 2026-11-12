"use client"
import { tr } from "@/lib/i18n"
import { printReportFrom } from "@/lib/voucher-print/report-print"

import { useEffect, useRef, useState } from "react"
import UnifiedSalesmen, { type SalesmanRecord } from "./unified-salesmen"
import { FilterBar, Grid, HrPage, ListActions, type Column } from "@/components/hr/hr-shared"
import { Button } from "@/components/ui/button"
import { VoucherStats } from "@/components/common/voucher-list-shell"
import { Pencil, Users } from "lucide-react"

const blank = (parent: Pick<SalesmanRecord, "parent_account_id" | "parent_account_code" | "parent_account_name"> = { parent_account_id: null, parent_account_code: "", parent_account_name: "" }): SalesmanRecord => ({ code: "", name: "", other_name: "", job_title: "", classification: "", region: "", address: "", mobile: "", email: "", ...parent, is_supervisor: false, supervisor_id: null, sales_commission_percent: 0, collection_commission_percent: 0, portal_active: false, login_code: "", portal_password: "", notes: "", is_active: true })

export default function SalesmenPages() {
  const [rows, setRows] = useState<SalesmanRecord[]>([])
  const [form, setForm] = useState<SalesmanRecord>(blank())
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<SalesmanRecord | null>(null)
  const [status, setStatus] = useState("active")
  const [defaultParent, setDefaultParent] = useState<Pick<SalesmanRecord, "parent_account_id" | "parent_account_code" | "parent_account_name">>({ parent_account_id: null, parent_account_code: "", parent_account_name: "" })
  const messagesRef = useRef<any>(null)

  const load = async () => { const response = await fetch("/api/salesmen"); const data = await response.json(); setRows(data.success && Array.isArray(data.data) ? data.data : []) }
  const loadDefaultParent = async () => {
    const response = await fetch("/api/settings/system")
    const data = await response.json()
    const settings = data?.settings ?? data
    const value = Number(settings?.default_salesman_parent_account ?? settings?.salesmanParentAccount ?? 0)
    if (value <= 0) return defaultParent
    const accountResponse = await fetch(`/api/accounts/${value}`)
    const account = accountResponse.ok ? await accountResponse.json() : null
    const next = { parent_account_id: value, parent_account_code: account?.code || "", parent_account_name: account?.name || "" }
    setDefaultParent(next)
    return next
  }
  useEffect(() => { void load(); void loadDefaultParent().catch(() => undefined) }, [])
  const generateCode = async () => { const response = await fetch("/api/salesmen?generate=1"); const data = await response.json(); return response.ok ? String(data.code || "") : "" }
  const show = async (row?: SalesmanRecord) => { const parent = row ? undefined : await loadDefaultParent().catch(() => defaultParent); setForm(row ? { ...row } : { ...blank(parent), code: await generateCode() }); setOpen(true) }
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
    if (!form.code.trim() || !form.name.trim()) return messagesRef.current?.show?.([{ severity: "error", summary: "", detail: tr("رقم واسم المندوب مطلوبان"), life: 5000 }])
    setSaving(true)
    const response = await fetch("/api/salesmen", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    const data = await response.json()
    if (!response.ok) messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || tr("تعذر الحفظ"), life: 5000 }])
    else { await load(); setOpen(false); messagesRef.current?.show?.([{ severity: "success", summary: "", detail: tr("تم حفظ المندوب بنجاح"), life: 4000 }]) }
    setSaving(false)
  }
  const remove = async () => { if (!form.id) return; const response = await fetch(`/api/salesmen?id=${form.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) return messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || tr("تعذر حذف المندوب"), life: 5000 }]); await load(); setOpen(false); messagesRef.current?.show?.([{ severity: "success", summary: "", detail: tr("تم حذف المندوب بنجاح"), life: 4000 }]) }
  const filtered = rows.filter((row) => (status === "all" || row.is_active === (status === "active")) && `${row.code} ${row.name} ${row.job_title || ""} ${row.classification || ""} ${row.region || ""}`.toLowerCase().includes(query.toLowerCase()))
  const columns: Column[] = [{ key: "code", label: tr("الرقم"), width: 130 }, { key: "name", label: tr("اسم المندوب") }, { key: "other_name", label: tr("الاسم بالإنجليزي") }, { key: "job_title", label: tr("الوظيفة") }, { key: "classification", label: tr("التصنيف") }, { key: "region", label: tr("المنطقة") }, { key: "sales_commission_percent", label: tr("عمولة البيع %"), type: "number" }, { key: "collection_commission_percent", label: tr("عمولة التحصيل %"), type: "number" }, { key: "is_active", label: tr("فعال"), width: 80, type: "boolean" }, { key: "edit", label: tr("تعديل"), width: 80, render: (row) => <Button size="icon" variant="outline" className="h-8 w-8 border-indigo-200 text-indigo-600" onClick={(event) => { event.stopPropagation(); void show(row) }}><Pencil className="h-4 w-4" /></Button> }]

  return <HrPage title={tr("المندوبين")} subtitle={tr("ملفات المندوبين والعمولات والإشراف")} category="الملفات" icon={Users} onNew={() => void show()} addLabel={tr("إضافة مندوب جديد")}>
    <VoucherStats stats={[{ label: tr("إجمالي المندوبين"), value: rows.length }, { label: tr("المندوبون الفعالون"), value: rows.filter(row => row.is_active).length }, { label: tr("المندوبون غير الفعالين"), value: rows.filter(row => !row.is_active).length }]} />
    <ListActions onEdit={() => selected && void show(selected)} onRefresh={load} onPrint={() => void printReportFrom(document.activeElement as HTMLElement | null)} />
    <FilterBar search={query} onSearch={setQuery} status={status} onStatus={setStatus} count={filtered.length} />
    <Grid rows={filtered} columns={columns} onSelect={setSelected} onDoubleClick={(row) => void show(row)} />
    <UnifiedSalesmen open={open} form={form} rows={rows} saving={saving} messagesRef={messagesRef} onOpenChange={setOpen} onFormChange={setForm} onCodeBlur={() => void handleCodeBlur()} onNew={() => void show()} onSave={save} onDelete={() => void remove()} onNavigate={navigate} />
  </HrPage>
}
