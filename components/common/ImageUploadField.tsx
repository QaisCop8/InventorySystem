"use client"

import { useRef, useState } from "react"
import { Eye, ImageIcon, Upload, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

interface ImageUploadFieldProps {
  value?: string | null
  onChange: (value: string | null) => void
  label?: string
  size?: number
  disabled?: boolean
  rounded?: "full" | "2xl"
}

// حقل صورة عام قابل لإعادة الاستخدام (عملاء/موردين/مشتركين/أصناف/خدمات) — يخزّن الصورة كـ
// data URL (base64) مباشرة في عمود image_url، بلا حاجة لنقطة رفع/تخزين ملفات منفصلة.
export function ImageUploadField({ value, onChange, label, size = 96, disabled, rounded = "2xl" }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError("")

    if (!file.type.startsWith("image/")) {
      setError("يرجى اختيار ملف صورة صالح")
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("حجم الصورة كبير جداً — الحد الأقصى 2 ميجابايت")
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      onChange(String(reader.result))
    }
    reader.onerror = () => {
      setError("تعذّرت قراءة الصورة")
    }
    reader.readAsDataURL(file)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <span className="text-sm font-medium text-muted-foreground">{label}</span>}
      <div
        className={`group relative flex cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/50 ${
          rounded === "full" ? "rounded-full" : "rounded-2xl"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        style={{ width: size, height: size }}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Upload className="h-5 w-5 text-white" />
        </div>

        {value && (
          <button
            type="button"
            title="عرض الصورة"
            className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1 text-primary-foreground shadow hover:opacity-90"
            onClick={(event) => {
              event.stopPropagation()
              setPreviewOpen(true)
            }}
          >
            <Eye className="h-3 w-3" />
          </button>
        )}

        {value && !disabled && (
          <button
            type="button"
            title="إزالة الصورة"
            className="absolute -top-1 -left-1 rounded-full bg-rose-500 p-1 text-white shadow hover:bg-rose-600"
            onClick={(event) => {
              event.stopPropagation()
              onChange(null)
            }}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={disabled} />
      {error && <span className="text-xs text-rose-600">{error}</span>}

      {value && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogTitle>{label || "معاينة الصورة"}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// عرض مصغّر للصورة في الجداول/القوائم — دائرة صغيرة بأيقونة بديلة عند غياب الصورة.
export function ImageThumbnail({ value, size = 36, alt = "" }: { value?: string | null; size?: number; alt?: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40"
      style={{ width: size, height: size }}
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
      )}
    </div>
  )
}
