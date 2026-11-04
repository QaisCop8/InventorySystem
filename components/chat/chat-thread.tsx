"use client"

import { tr } from "@/lib/i18n"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AlertCircle, Check, CheckCheck, Clock3, MessageSquareText, SendHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { dayLabel, timeLabel } from "./chat-ui"
import type { ChatMessage } from "./use-chat"

// محادثة واحدة: فواصل الأيام، فقاعات (رسائلي خضراء)، علامات الإرسال/القراءة، وإعادة إرسال ما فشل.
export function ChatThread({ meId, messages, lastReadId, onSend }: { meId: string; messages: ChatMessage[]; lastReadId: number | null; onSend: (text: string, retryOf?: number) => void }) {
  const [text, setText] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [messages.length])

  // حقل الكتابة يكبر مع النص حتى 5 أسطر تقريباً
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }, [text])

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText("")
    inputRef.current?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f6f8f7] px-3 py-3 dark:bg-slate-950/40">
        {!messages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm dark:bg-slate-800"><MessageSquareText className="h-6 w-6" /></span>
            <p className="text-sm text-muted-foreground">{tr("لا توجد رسائل بعد — ابدأ المحادثة")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {messages.map((m, index) => {
              // user_id رقمي في بعض القواعد ونصّي في chat_messages — مقارنة نصّية دائماً
              const mine = Boolean(m.local) || String(m.sender_id) === String(meId)
              const previous = messages[index - 1]
              const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(m.created_at).toDateString()
              const grouped = !newDay && previous && (Boolean(previous.local) || String(previous.sender_id) === String(meId)) === mine
              const read = mine && !m.local && (m.is_read || (lastReadId != null && m.id <= lastReadId))
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-full bg-white px-3 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-800">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <div className={cn("flex", mine ? "justify-start" : "justify-end", !grouped && "mt-1.5")}>
                    <div
                      className={cn(
                        "max-w-[80%] px-3 py-1.5 text-sm shadow-sm",
                        mine
                          ? "rounded-2xl rounded-ss-md bg-emerald-600 text-white"
                          : "rounded-2xl rounded-se-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100",
                        m.local === "failed" && "bg-rose-50 text-rose-900 ring-1 ring-rose-200",
                      )}
                    >
                      <div dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                      <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine && m.local !== "failed" ? "text-emerald-100" : "text-slate-400")}>
                        <span dir="ltr">{timeLabel(m.created_at)}</span>
                        {mine && (m.local === "sending" ? <Clock3 className="h-3 w-3" /> : m.local === "failed" ? null : read ? <CheckCheck className="h-3.5 w-3.5 text-sky-200" /> : <Check className="h-3.5 w-3.5" />)}
                      </div>
                      {m.local === "failed" && (
                        <button type="button" onClick={() => onSend(m.body, m.id)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline">
                          <AlertCircle className="h-3 w-3" />{tr(" لم تُرسل — إعادة المحاولة")}
                        </button>
                      )}
                    </div>
                  </div>
                </Fragment>
              )
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-slate-200/70 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={tr("اكتب رسالة...")}
          className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none ring-emerald-500/40 placeholder:text-slate-400 focus:ring-2 dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          aria-label={tr("إرسال")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          <SendHorizontal className="h-4 w-4 -scale-x-100" />
        </button>
      </div>
    </div>
  )
}
