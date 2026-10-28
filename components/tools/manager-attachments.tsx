"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, ImagePlus, Loader2, Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Messages from "@/components/common/Messages"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { MANAGER_ATTACHMENT_TYPES, MAX_MANAGER_ATTACHMENT_FILES, type ManagerAttachmentType } from "@/lib/manager-attachments-shared"

// أدوات ⇐ إرسال مرفقات للمدير: صورة فاتورة مشتريات أو سند قبض + الحساب: مورد/عميل/مشترك (إلزاميان) ⇐ تصل إلى "بريد الرسائل".

type Sent = { id: number; doc_type: string; supplier_name: string | null; file_name: string; created_at: string; processed_at: string | null }

/** الصور الكبيرة تُصغَّر قبل الرفع (أطول ضلع 2000px، JPEG) — يقلل حجم قاعدة البيانات دون فقد وضوح القراءة */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 900 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    return file
  }
}

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export default function ManagerAttachments() {
  const [docType, setDocType] = useState<ManagerAttachmentType>("purchase_invoice")
  const [supplierId, setSupplierId] = useState("")
  const [note, setNote] = useState("")
  const [files, setFiles] = useState<{ file: File; preview: string | null }[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent[]>([])
  const messagesRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const show = (severity: "success" | "error", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000, sticky: severity === "error" }])
  }

  const loadSent = () => fetch("/api/manager-attachments?mine=1", { cache: "no-store" }).then((response) => (response.ok ? response.json() : [])).then((rows) => setSent(Array.isArray(rows) ? rows : [])).catch(() => undefined)
  useEffect(() => { void loadSent() }, [])
  useEffect(() => () => files.forEach((entry) => entry.preview && URL.revokeObjectURL(entry.preview)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (list: FileList | null) => {
    const picked = Array.from(list || []).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf")
    if (!picked.length) return
    const shrunk = await Promise.all(picked.map(shrinkImage))
    setFiles((current) => [...current, ...shrunk.map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }))].slice(0, MAX_MANAGER_ATTACHMENT_FILES))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeFile = (index: number) => setFiles((current) => {
    const entry = current[index]
    if (entry?.preview) URL.revokeObjectURL(entry.preview)
    return current.filter((_, i) => i !== index)
  })

  const send = async () => {
    if (!supplierId) return show("error", "الحساب مطلوب")
    if (!files.length) return show("error", "المرفق مطلوب — أرفق صورة المستند")
    setSending(true)
    try {
      const body = new FormData()
      body.append("doc_type", docType)
      body.append("supplier_id", supplierId)
      body.append("note", note)
      for (const entry of files) body.append("files", entry.file)
      const response = await fetch("/api/manager-attachments", { method: "POST", body })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر إرسال المرفقات")
      files.forEach((entry) => entry.preview && URL.revokeObjectURL(entry.preview))
      setFiles([])
      setNote("")
      setSupplierId("")
      show("success", "تمت العملية بنجاح — أُرسلت المرفقات إلى بريد الرسائل")
      void loadSent()
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر إرسال المرفقات")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Send /></div>
          <div>
            <p className="text-xs font-semibold text-emerald-50/90">أدوات</p>
            <h1 className="truncate text-2xl font-black text-white drop-shadow-sm sm:text-3xl">إرسال مرفقات للمدير</h1>
            <p className="mt-1 text-sm text-emerald-50/85">أرسل صورة فاتورة مشتريات أو سند قبض مع الحساب (مورد، عميل أو مشترك) — تصل إلى بريد الرسائل للمراجعة والمعالجة</p>
          </div>
        </div>
      </header>

      <Messages innerRef={messagesRef} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
          <div className="grid gap-1.5">
            <Label>نوع المستند *</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(MANAGER_ATTACHMENT_TYPES) as [ManagerAttachmentType, string][]).map(([key, label]) => (
                <Button key={key} type="button" variant={docType === key ? "default" : "outline"} onClick={() => setDocType(key)}>{label}</Button>
              ))}
            </div>
          </div>

          <AutoCompleteAccount
            label="الحساب (مورد / عميل / مشترك) *"
            valueMode="id"
            value={supplierId}
            onValueChange={setSupplierId}
            showCostCenterButton={false}
            requiredTypeValues={[3, 2, 5]}
            notFoundMessage="الحساب يجب أن يكون مورداً أو عميلاً أو مشتركاً"
          />

          <div className="grid gap-1.5">
            <Label>المرفقات * <span className="text-xs font-normal text-muted-foreground">(صور أو PDF — حتى {MAX_MANAGER_ATTACHMENT_FILES})</span></Label>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files) }}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-8 text-sm text-blue-800 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300"
            >
              <ImagePlus className="h-8 w-8" />
              اضغط لاختيار صورة أو التقاطها بالكاميرا، أو اسحب الملفات هنا
            </button>
            {files.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {files.map((entry, index) => (
                  <div key={`${entry.file.name}-${index}`} className="group relative overflow-hidden rounded-lg border bg-muted/30">
                    {entry.preview
                      ? <img src={entry.preview} alt={entry.file.name} className="h-28 w-full object-cover" />
                      : <div className="flex h-28 items-center justify-center text-muted-foreground"><FileText className="h-10 w-10" /></div>}
                    <div className="truncate px-2 py-1 text-[11px]" title={entry.file.name}>{entry.file.name} · {sizeText(entry.file.size)}</div>
                    <button type="button" onClick={() => removeFile(index)} className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label="إزالة المرفق"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>ملاحظة</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="اختياري — مثل رقم الفاتورة أو المبلغ" />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void send()} disabled={sending} className="min-w-36">
              {sending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}إرسال
            </Button>
          </div>
        </section>

        <aside className="rounded-2xl border bg-background p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Paperclip className="h-4 w-4" />آخر ما أرسلته</h2>
          {sent.length === 0
            ? <p className="text-sm text-muted-foreground">لا توجد مرفقات مرسلة.</p>
            : <ul className="space-y-2">
                {sent.map((row) => (
                  <li key={row.id} className="rounded-lg border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{MANAGER_ATTACHMENT_TYPES[row.doc_type as ManagerAttachmentType] || row.doc_type}</span>
                      <span className={`rounded-full px-2 py-0.5 ${row.processed_at ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`}>{row.processed_at ? "تمت المعالجة" : "بانتظار المعالجة"}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{row.supplier_name || "—"} · {String(row.created_at).replace("T", " ").slice(0, 16)}</div>
                    <div className="truncate text-muted-foreground" title={row.file_name}>{row.file_name}</div>
                  </li>
                ))}
              </ul>}
        </aside>
      </div>
    </div>
  )
}
