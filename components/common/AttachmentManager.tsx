"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Paperclip, Download, Trash2, Loader2, UploadCloud, FileText } from "lucide-react"

// نظام مرفقات عام (على نمط Odoo): يُستخدَم بنفس الشكل لأي شاشة — سند (أي نوع)، عميل، أو صنف —
// فقط بتمرير modelName/recordId مختلفين؛ لا حاجة لأي مكوّن مخصَّص جديد لكل شاشة.
export type AttachmentModel = "voucher" | "customer" | "product" | "task_order_item"

export interface AttachmentItem {
  id: number
  model_name: string
  record_id: number
  original_name: string
  mime_type: string | null
  file_size: number | null
  description: string | null
  uploaded_by: number | null
  created_at: string
}

interface AttachmentManagerProps {
  modelName: AttachmentModel
  // null قبل حفظ السجل لأول مرة — لا يمكن ربط مرفق بسجل لا معرّف حقيقي له بعد.
  recordId: number | null
  disabled?: boolean
  uploadedBy?: number | null
}

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentManager({ modelName, recordId, disabled = false, uploadedBy = null }: AttachmentManagerProps) {
  const { toast } = useToast()
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchAttachments = useCallback(async () => {
    if (!recordId) {
      setAttachments([])
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/attachments?model_name=${modelName}&record_id=${recordId}`)
      const data = await response.json()
      setAttachments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch attachments", error)
    } finally {
      setLoading(false)
    }
  }, [modelName, recordId])

  useEffect(() => {
    void fetchAttachments()
  }, [fetchAttachments])

  const uploadFiles = async (files: FileList | File[]) => {
    if (!recordId) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        try {
          const formData = new FormData()
          formData.append("model_name", modelName)
          formData.append("record_id", String(recordId))
          formData.append("file", file)
          if (uploadedBy) formData.append("uploaded_by", String(uploadedBy))
          const response = await fetch("/api/attachments", { method: "POST", body: formData })
          if (!response.ok) {
            const error = await response.json().catch(() => null)
            toast({ title: "خطأ", description: error?.error || `فشل رفع الملف: ${file.name}`, variant: "destructive" })
          }
        } catch (error) {
          // خطأ شبكة/استثناء غير متوقَّع أثناء هذا الملف تحديداً — يُعرَض فوراً ويُكمَل رفع بقية
          // الملفات بدل توقف الحلقة بالكامل بصمت (وعد مرفوض غير مُعالَج) دون أي إشعار للمستخدم.
          console.error("Failed to upload attachment", file.name, error)
          const message = error instanceof Error ? error.message : String(error)
          toast({ title: "خطأ", description: `فشل رفع الملف: ${file.name} — ${message}`, variant: "destructive" })
        }
      }
      await fetchAttachments()
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (attachment: AttachmentItem) => {
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        toast({ title: "خطأ", description: error?.error || "فشل حذف المرفق", variant: "destructive" })
        return
      }
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
    } catch (error) {
      console.error("Failed to delete attachment", error)
    }
  }

  if (!recordId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
        <Paperclip className="h-6 w-6" />
        <p className="text-sm">احفظ السجل أولاً لإضافة مرفقات</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!disabled && (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragActive ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-slate-50"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
          }}
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-emerald-600" /> : <UploadCloud className="h-6 w-6 text-slate-400" />}
          <p className="text-sm text-slate-500">اسحب الملفات هنا أو</p>
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            اختر ملفات
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">جارٍ التحميل...</p>
      ) : attachments.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">لا توجد مرفقات</p>
      ) : (
        // ارتفاع أقصى + تمرير عمودي خاص بالقائمة نفسها — بلا هذا كانت المرفقات الإضافية (بعد عدد
        // معيّن) تُقطَع بصمت عند حدود النافذة المنبثقة (compact-product-form.tsx) دون أي شريط
        // تمرير، إذ لا يمكن الاعتماد على أن الحاوية الخارجية تمرّر دوماً بارتفاع كافٍ لعرضها كاملة.
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{attachment.original_name}</p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(attachment.file_size)} · {new Date(attachment.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => window.open(`/api/attachments/${attachment.id}?download=1`, "_blank")}
                  title="تنزيل"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => handleDelete(attachment)}
                    title="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
