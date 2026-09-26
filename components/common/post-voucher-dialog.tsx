"use client"

import { useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
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
// يمكن الخروج عبر "إلغاء" أو مفتاح 5 أو زر الإغلاق (X)، مع منع الإغلاق أثناء تنفيذ الحفظ.
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
      open={visible}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel()
      }}
    >
      <DialogContent
        hideCloseButton
        className="z-[3001] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-0 text-center shadow-[0_18px_45px_-20px_rgba(15,23,42,0.32)]"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isSaving) event.preventDefault()
        }}
      >
        <DialogTitle className="sr-only">اختيار إجراء حفظ السند</DialogTitle>
        <div className="flex flex-col items-center gap-3 px-4 py-4">
          <p className="text-sm font-bold text-slate-700">كيف تريد حفظ السند؟</p>

        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <Button
            disabled={isSaving}
            onClick={() => onSelect("save")}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
          >
            <Save className="h-4 w-4 text-slate-500" />
            حفظ (1)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("save_print")}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-500 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-sky-600 hover:shadow-md"
          >
            <Printer className="h-4 w-4" />
            حفظ وطباعة (2)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("post")}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-500 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-md"
          >
            <CheckCircle2 className="h-4 w-4" />
            حفظ وترحيل (3)
          </Button>

          <Button
            disabled={isSaving}
            onClick={() => onSelect("post_print")}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-500 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md"
          >
            <Printer className="h-4 w-4" />
            ترحيل وطباعة (4)
          </Button>
        </div>

        <Button
          disabled={isSaving}
          variant="outline"
          onClick={onCancel}
          className="mx-auto h-9 w-full max-w-sm rounded-xl border-slate-200 bg-white text-xs text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700"
        >
          <span className="ml-2 text-base">×</span>
          إلغاء (5)
        </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PostVoucherDialog
