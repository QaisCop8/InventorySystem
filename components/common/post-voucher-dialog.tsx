"use client"

import { useEffect, useRef, type ComponentType } from "react"
import { CheckCircle2, FileCheck2, Loader2, Printer, Save, Send, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"

export type PostVoucherAction = "save" | "save_print" | "post" | "post_print"

interface PostVoucherDialogProps {
  visible: boolean
  isSaving?: boolean
  onSelect: (action: PostVoucherAction) => void
  onCancel: () => void
}

type Option = { action: PostVoucherAction; key: string; title: string; hint: string; icon: ComponentType<{ className?: string }>; tone: string; iconTone: string }

const OPTIONS: Option[] = [
  { action: "save", key: "1", title: "حفظ", hint: "يبقى السند مسودة قابلة للتعديل", icon: Save, tone: "border-slate-200 hover:border-slate-400 focus-visible:ring-slate-400", iconTone: "bg-slate-100 text-slate-600" },
  { action: "save_print", key: "2", title: "حفظ وطباعة", hint: "طباعة نسخة للتدقيق دون ترحيل", icon: Printer, tone: "border-sky-200 hover:border-sky-400 focus-visible:ring-sky-400", iconTone: "bg-sky-100 text-sky-700" },
  { action: "post", key: "3", title: "حفظ وترحيل", hint: "اعتماد السند نهائياً", icon: Send, tone: "border-emerald-200 hover:border-emerald-400 focus-visible:ring-emerald-400", iconTone: "bg-emerald-100 text-emerald-700" },
  { action: "post_print", key: "4", title: "ترحيل وطباعة", hint: "اعتماد السند وطباعة النسخة الأصلية", icon: FileCheck2, tone: "border-amber-200 hover:border-amber-400 focus-visible:ring-amber-400", iconTone: "bg-amber-100 text-amber-700" },
]

// يظهر عند الضغط على "حفظ" (F3) قبل تنفيذ الحفظ فعلياً — حفظ عادي، حفظ وطباعة نسخة للتدقيق، ترحيل،
// أو ترحيل وطباعة النسخة الأصلية. الأرقام 1-4 تختار مباشرة، و5 أو Esc للإلغاء (ممنوع أثناء الحفظ).
// تُعرض خارج حدود تبويب مساحة العمل لتظهر في منتصف الشاشة دائماً مع خلفية معتمة.
const PostVoucherDialog: React.FC<PostVoucherDialogProps> = ({ visible, isSaving = false, onSelect, onCancel }) => {
  const tabActive = useWorkspaceTabActive()
  const firstOptionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible || isSaving) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!tabActive.current) return
      const option = OPTIONS.find((candidate) => candidate.key === event.key)
      if (option) { event.preventDefault(); onSelect(option.action); return }
      if (event.key === "5") { event.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, isSaving, onSelect, onCancel, tabActive])

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={visible} onOpenChange={(open) => { if (!open && !isSaving) onCancel() }}>
        <DialogContent
          hideCloseButton
          className="z-[3001] w-[min(520px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]"
          dir="rtl"
          onOpenAutoFocus={(event) => { event.preventDefault(); firstOptionRef.current?.focus() }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (isSaving) event.preventDefault() }}
        >
          <div className="relative bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-6 pb-5 pt-6 text-white">
            <button type="button" onClick={onCancel} disabled={isSaving} aria-label="إغلاق" className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"><CheckCircle2 className="h-6 w-6" /></span>
              <div className="text-right">
                <DialogTitle className="text-lg font-extrabold">حفظ السند</DialogTitle>
                <DialogDescription className="text-xs text-emerald-50">اختر طريقة الحفظ — أو اضغط رقم الخيار مباشرة</DialogDescription>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {OPTIONS.map((option, index) => (
              <button
                key={option.action}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                disabled={isSaving}
                onClick={() => onSelect(option.action)}
                className={`group relative flex items-center gap-3 rounded-2xl border-2 bg-white p-3 text-right shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ${option.tone}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${option.iconTone}`}><option.icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">{option.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{option.hint}</span>
                </span>
                <kbd className="absolute left-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 font-mono text-xs font-bold text-slate-600 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">{option.key}</kbd>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-5 py-3">
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin text-emerald-600" />جارٍ حفظ السند...</> : <>Enter لتنفيذ الخيار المحدد</>}
            </span>
            <button type="button" onClick={onCancel} disabled={isSaving} className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">
              إلغاء
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[11px]">5</kbd>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[11px]">Esc</kbd>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}

export default PostVoucherDialog
