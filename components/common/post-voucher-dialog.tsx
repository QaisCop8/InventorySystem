"use client"

import { useEffect } from "react"
import { Dialog } from "primereact/dialog"
import { Button } from "@/components/ui/button"
import { Save, CheckCircle2, Printer } from "lucide-react"

export type PostVoucherAction = "save" | "save_print" | "post" | "post_print"

interface PostVoucherDialogProps {
  visible: boolean
  isSaving?: boolean
  onSelect: (action: PostVoucherAction) => void
  onCancel: () => void
}

// يظهر عند الضغط على "حفظ" قبل تنفيذ الحفظ فعلياً — يتيح للمستخدم اختيار حفظ عادي (السند يبقى
// قابلاً للتعديل)، أو حفظ وطباعته كـ"نسخة للتدقيق" دون ترحيل، أو ترحيله (status=2) دون طباعة،
// أو ترحيله ثم طباعته كـ"نسخة اصلية". أرقام (1-5) تُنفَّذ أيضاً بلوحة المفاتيح طالما النافذة ظاهرة.
// لا يوجد زر إغلاق (X) عمداً — الخروج فقط عبر "إلغاء" أو مفتاح 5، لمنع إغلاق غير مقصود بالنقر
// خارج النافذة أو على أيقونة الإغلاق أثناء اتخاذ قرار الحفظ.
const PostVoucherDialog: React.FC<PostVoucherDialogProps> = ({ visible, isSaving = false, onSelect, onCancel }) => {
  useEffect(() => {
    if (!visible || isSaving) return
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "1":
          event.preventDefault()
          onSelect("save")
          break
        case "2":
          event.preventDefault()
          onSelect("save_print")
          break
        case "3":
          event.preventDefault()
          onSelect("post")
          break
        case "4":
          event.preventDefault()
          onSelect("post_print")
          break
        case "5":
          event.preventDefault()
          onCancel()
          break
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, isSaving, onSelect, onCancel])

  return (
    <Dialog
      visible={visible}
      onHide={onCancel}
      modal
      closable={false}
      closeOnEscape={!isSaving}
      className="overflow-hidden rounded-[24px] border border-slate-200/80 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.35)]"
      style={{
        width: "440px",
        direction: "rtl",
        textAlign: "center",
        background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.97))",
      }}
    >
      <div className="flex flex-col items-center gap-4 px-3 py-5">
        <p className="text-base font-semibold text-slate-700">كيف تريد حفظ السند؟</p>

        <div className="flex w-full flex-col gap-2.5">
          <Button
            disabled={isSaving}
            onClick={() => onSelect("save")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50"
          >
            <Save className="h-4 w-4" />
            حفظ (1)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("save_print")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-sky-500 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_-12px_rgba(14,165,233,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(14,165,233,0.9)]"
          >
            <Printer className="h-4 w-4" />
            حفظ وطباعة (2)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("post")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_-12px_rgba(16,185,129,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(16,185,129,0.9)]"
          >
            <CheckCircle2 className="h-4 w-4" />
            حفظ وترحيل (3)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("post_print")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_-12px_rgba(245,158,11,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(245,158,11,0.9)]"
          >
            <Printer className="h-4 w-4" />
            ترحيل وطباعة (4)
          </Button>
        </div>

        <Button
          disabled={isSaving}
          variant="outline"
          onClick={onCancel}
          className="w-full rounded-2xl border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700"
        >
          إلغاء (5)
        </Button>
      </div>
    </Dialog>
  )
}

export default PostVoucherDialog
