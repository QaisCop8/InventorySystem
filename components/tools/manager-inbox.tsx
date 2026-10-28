"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bot, Download, Eye, FileText, Image as ImageIcon, Inbox, Loader2, RefreshCw, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Messages from "@/components/common/Messages"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { openSectionWith } from "@/lib/section-intents"
import { MANAGER_ATTACHMENT_TYPES, type ManagerAttachmentType } from "@/lib/manager-attachments-shared"

// أدوات ⇐ بريد الرسائل: المرفقات المرسلة للمدير (فاتورة مشتريات / سند قبض). تحديد متعدد لتنزيلها كملف مضغوط،
// ولكل سطر: تنزيل، حذف (من قاعدة البيانات نهائياً لتقليل حجمها)، معالجة (المساعد الذكي يقرأ المرفق وينشئ السند).

type Row = {
  id: number; doc_type: ManagerAttachmentType; supplier_id: number; supplier_code: string | null; supplier_name: string | null; note: string | null
  file_name: string; mime_type: string; file_size: number; branch_name: string | null; sender_name: string | null
  read_at: string | null; processed_at: string | null; processed_by_name: string | null; created_at: string
}

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const dateText = (value: string | null) => (value ? String(value).replace("T", " ").slice(0, 16) : "")
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` }

async function fetchFile(row: Row) {
  const response = await fetch(`/api/manager-attachments/${row.id}`, { cache: "no-store" })
  if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || `تعذر تحميل ${row.file_name}`)
  return response.blob()
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export default function ManagerInbox() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [zipping, setZipping] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState("")
  const [docType, setDocType] = useState("")
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const messagesRef = useRef<any>(null)

  const show = (severity: "success" | "error" | "info", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000, sticky: severity === "error" }])
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ from, to, doc_type: docType, status })
      const response = await fetch(`/api/manager-attachments?${query}`, { cache: "no-store" })
      const data = await response.json().catch(() => [])
      if (!response.ok) throw new Error(data?.error || "تعذر تحميل الرسائل")
      setRows(Array.isArray(data) ? data : [])
      setSelected(new Set())
    } catch (error) {
      setRows([])
      show("error", error instanceof Error ? error.message : "تعذر تحميل الرسائل")
    } finally {
      setLoading(false)
    }
  }, [from, to, docType, status])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.supplier_name, row.supplier_code, row.file_name, row.note, row.sender_name, row.branch_name]
      .some((value) => String(value || "").toLowerCase().includes(term)))
  }, [rows, search])

  const allChecked = visible.length > 0 && visible.every((row) => selected.has(row.id))
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(visible.map((row) => row.id)) : new Set())
  const toggle = (id: number, checked: boolean) => setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next })
  const markRead = (id: number) => setRows((current) => current.map((row) => row.id === id && !row.read_at ? { ...row, read_at: new Date().toISOString() } : row))

  const download = async (row: Row) => {
    setBusyId(row.id)
    try {
      saveBlob(await fetchFile(row), row.file_name)
      markRead(row.id)
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر تنزيل المرفق")
    } finally {
      setBusyId(null)
    }
  }

  const preview = async (row: Row) => {
    setBusyId(row.id)
    try {
      const url = URL.createObjectURL(await fetchFile(row))
      window.open(url, "_blank", "noopener,noreferrer")
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      markRead(row.id)
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر عرض المرفق")
    } finally {
      setBusyId(null)
    }
  }

  // تنزيل المحدد: ملف واحد مباشرة، وأكثر من ملف في ملف مضغوط واحد (أسماء مكررة تُرقَّم)
  const downloadSelected = async () => {
    const chosen = visible.filter((row) => selected.has(row.id))
    if (!chosen.length) return show("info", "حدد مرفقاً واحداً على الأقل")
    if (chosen.length === 1) return download(chosen[0])
    setZipping(true)
    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const used = new Map<string, number>()
      for (const row of chosen) {
        const base = `${MANAGER_ATTACHMENT_TYPES[row.doc_type] || row.doc_type} - ${row.supplier_name || ""} - ${row.file_name}`.replace(/[\\/:*?"<>|]/g, "_")
        const count = used.get(base) || 0
        used.set(base, count + 1)
        zip.file(count ? base.replace(/(\.[^.]+)?$/, ` (${count})$1`) : base, await fetchFile(row))
      }
      saveBlob(await zip.generateAsync({ type: "blob" }), `بريد الرسائل ${new Date().toISOString().slice(0, 10)}.zip`)
      setRows((current) => current.map((row) => selected.has(row.id) && !row.read_at ? { ...row, read_at: new Date().toISOString() } : row))
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر تنزيل المرفقات")
    } finally {
      setZipping(false)
    }
  }

  const remove = async (row: Row) => {
    if (!(await confirmYesNo(`حذف المرفق "${row.file_name}" نهائياً من قاعدة البيانات؟`))) return
    setBusyId(row.id)
    try {
      const response = await fetch(`/api/manager-attachments/${row.id}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر حذف المرفق")
      setRows((current) => current.filter((item) => item.id !== row.id))
      setSelected((current) => { const next = new Set(current); next.delete(row.id); return next })
      show("success", "تمت العملية بنجاح — حُذف المرفق من قاعدة البيانات")
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر حذف المرفق")
    } finally {
      setBusyId(null)
    }
  }

  // معالجة: يُسلَّم المرفق للمساعد الذكي (ai-chat) مع نوعه والمورد، فيقرأه وينشئ السند للمراجعة
  const processRow = async (row: Row) => {
    setBusyId(row.id)
    try {
      const blob = await fetchFile(row)
      const file = new File([blob], row.file_name, { type: row.mime_type || blob.type })
      const hint = [MANAGER_ATTACHMENT_TYPES[row.doc_type], row.supplier_name ? `المورد: ${row.supplier_name}${row.supplier_code ? ` (${row.supplier_code})` : ""}` : "", row.note || ""].filter(Boolean).join(" — ")
      openSectionWith("ai-assistant", { file, hint })
      await fetch(`/api/manager-attachments/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "processed" }) })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, processed_at: new Date().toISOString(), read_at: item.read_at || new Date().toISOString() } : item))
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذرت معالجة المرفق")
    } finally {
      setBusyId(null)
    }
  }

  const selectedSize = visible.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + Number(row.file_size || 0), 0)
  const totalSize = rows.reduce((sum, row) => sum + Number(row.file_size || 0), 0)

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-violet-700 via-indigo-600 to-blue-600 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/25"><Inbox /></div>
            <div>
              <p className="text-xs font-bold text-indigo-100">أدوات</p>
              <h1 className="text-2xl font-black">بريد الرسائل</h1>
              <p className="mt-1 text-sm text-indigo-50/85">مرفقات فواتير المشتريات وسندات القبض المرسلة للمدير — نزّلها أو عالجها بالمساعد الذكي أو احذفها</p>
            </div>
          </div>
          <div className="flex gap-3 text-center text-xs">
            <div className="rounded-xl bg-white/15 px-3 py-2"><div className="text-lg font-black">{rows.filter((row) => !row.processed_at).length}</div>بانتظار المعالجة</div>
            <div className="rounded-xl bg-white/15 px-3 py-2"><div className="text-lg font-black">{sizeText(totalSize)}</div>حجم المرفقات</div>
          </div>
        </div>
      </header>

      <Messages innerRef={messagesRef} />

      <section className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="grid gap-1.5"><Label>من تاريخ</Label><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div className="grid gap-1.5"><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <div className="grid gap-1.5">
          <Label>نوع المستند</Label>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={docType} onChange={(event) => setDocType(event.target.value)}>
            <option value="">الكل</option>
            {Object.entries(MANAGER_ATTACHMENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>الحالة</Label>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">الكل</option>
            <option value="new">بانتظار المعالجة</option>
            <option value="processed">تمت المعالجة</option>
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>بحث</Label>
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="المورد، الملف، المرسل، الملاحظة..." /></div>
            <Button variant="outline" onClick={() => void load()} disabled={loading} data-report-apply><RefreshCw className={`ml-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="text-sm">{selected.size ? <>محدد <b>{selected.size}</b> ({sizeText(selectedSize)})</> : <>{visible.length} مرفق</>}</span>
          <Button size="sm" onClick={() => void downloadSelected()} disabled={!selected.size || zipping}>
            {zipping ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Download className="ml-1 h-4 w-4" />}تنزيل المحدد
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-2 text-center"><Checkbox checked={allChecked} onCheckedChange={(value) => toggleAll(value === true)} aria-label="تحديد الكل" /></th>
                <th className="p-2 text-right">المستند</th>
                <th className="p-2 text-right">المورد</th>
                <th className="p-2 text-right">المرفق</th>
                <th className="p-2 text-right">ملاحظة</th>
                <th className="p-2 text-right">المرسل / الفرع</th>
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="w-64 p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const busy = busyId === row.id
                const isImage = row.mime_type?.startsWith("image/")
                return (
                  <tr key={row.id} className={`border-t align-middle ${selected.has(row.id) ? "bg-blue-50/60 dark:bg-blue-950/20" : !row.read_at ? "font-semibold" : ""}`}>
                    <td className="p-2 text-center"><Checkbox checked={selected.has(row.id)} onCheckedChange={(value) => toggle(row.id, value === true)} aria-label={`تحديد ${row.file_name}`} /></td>
                    <td className="p-2">{MANAGER_ATTACHMENT_TYPES[row.doc_type] || row.doc_type}</td>
                    <td className="p-2">{row.supplier_name || "—"}{row.supplier_code && <div className="font-mono text-[11px] font-normal text-muted-foreground">{row.supplier_code}</div>}</td>
                    <td className="p-2">
                      <button type="button" onClick={() => void preview(row)} className="flex max-w-[14rem] items-center gap-1.5 text-right text-blue-700 hover:underline dark:text-blue-400" title="عرض">
                        {isImage ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{row.file_name}</span>
                      </button>
                      <div className="text-[11px] font-normal text-muted-foreground">{sizeText(Number(row.file_size || 0))}</div>
                    </td>
                    <td className="max-w-[12rem] truncate p-2 font-normal text-muted-foreground" title={row.note || ""}>{row.note || "—"}</td>
                    <td className="p-2 font-normal">{row.sender_name || "—"}<div className="text-[11px] text-muted-foreground">{row.branch_name || ""}</div></td>
                    <td className="whitespace-nowrap p-2 font-normal" dir="ltr">{dateText(row.created_at)}</td>
                    <td className="p-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.processed_at ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`} title={row.processed_at ? `${row.processed_by_name || ""} ${dateText(row.processed_at)}` : ""}>
                        {row.processed_at ? "تمت المعالجة" : "بانتظار المعالجة"}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => void preview(row)} disabled={busy} title="عرض"><Eye className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => void download(row)} disabled={busy}><Download className="ml-1 h-4 w-4" />تنزيل</Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-red-600 hover:text-red-700" onClick={() => void remove(row)} disabled={busy}><Trash2 className="ml-1 h-4 w-4" />حذف</Button>
                        <Button size="sm" className="h-8 px-2.5" onClick={() => void processRow(row)} disabled={busy}>{busy ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Bot className="ml-1 h-4 w-4" />}معالجة</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!loading && visible.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-2 h-10 w-10 text-indigo-400" />لا توجد رسائل</div>}
        {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      </section>
    </div>
  )
}
