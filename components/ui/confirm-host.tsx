"use client"

import { useEffect, useState } from "react"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

// بديل window.confirm / window.alert في كل النظام: نفس مكوّن ConfirmDialogYesNo بدل نوافذ المتصفح.
//   if (!(await confirmYesNo("حذف السند؟"))) return
//   showAlert("تم الحفظ")            // أو await showAlert(...) للانتظار حتى يُغلق
// ConfirmHost يُركَّب مرة واحدة (ClientProviders) ويعرض الطلبات بالترتيب.

type Request = {
  kind: "confirm" | "alert"
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  resolve: (value: boolean) => void
}

type Options = { title?: string; confirmLabel?: string; cancelLabel?: string }

const queue: Request[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function enqueue(request: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    // بلا مُضيف مركَّب (خارج التطبيق) ⇐ نافذة المتصفح كاحتياط حتى لا يضيع السؤال
    if (!listeners.size) {
      resolve(request.kind === "confirm" ? window.confirm(request.message) : (window.alert(request.message), true))
      return
    }
    queue.push({ ...request, resolve })
    notify()
  })
}

/** سؤال نعم/لا — يُرجع true عند "تأكيد" */
export const confirmYesNo = (message: string, options: Options = {}) =>
  enqueue({ kind: "confirm", message, title: options.title ?? "تأكيد", confirmLabel: options.confirmLabel, cancelLabel: options.cancelLabel })

/** رسالة تنبيه بزر واحد ("حسناً") */
export const showAlert = (message: string, options: Omit<Options, "cancelLabel"> = {}) =>
  enqueue({ kind: "alert", message, title: options.title ?? "تنبيه", confirmLabel: options.confirmLabel }).then(() => undefined)

export function ConfirmHost() {
  const [current, setCurrent] = useState<Request | null>(null)

  useEffect(() => {
    const listener = () => setCurrent((active) => active ?? queue[0] ?? null)
    listeners.add(listener)
    listener()
    return () => { listeners.delete(listener) }
  }, [])

  const close = (answer: boolean) => {
    if (!current) return
    queue.shift()
    current.resolve(answer)
    setCurrent(queue[0] ?? null)
  }

  return (
    <ConfirmDialogYesNo
      useAppDialog
      visible={Boolean(current)}
      title={current?.title}
      message={current?.message}
      confirmLabel={current?.confirmLabel}
      cancelLabel={current?.cancelLabel}
      hideCancel={current?.kind === "alert"}
      onConfirm={() => close(true)}
      onCancel={() => close(current?.kind === "alert")}
    />
  )
}
