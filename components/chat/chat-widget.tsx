"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, EyeOff, MessagesSquare, X } from "lucide-react"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-context"
import { ChatAvatar, presenceLabel } from "./chat-ui"
import { ChatContacts } from "./chat-contacts"
import { ChatThread } from "./chat-thread"
import { useChat, type LatestUnread } from "./use-chat"

// الدردشة الداخلية: فقاعة عائمة تفتح لوحة الزملاء/المحادثة (تُركَّب مرة واحدة في erp-layout).
// 2026-11-18: الفقاعة تُسحب لأي مكان (يُحفظ موضعها على الجهاز)، وتُخفى (زر عند المرور أو من رأس اللوحة) فيبقى
// لسان صغير على حافة الشاشة يعيدها — ويحمل نقطة الرسائل غير المقروءة.
const BUBBLE = 56
const MARGIN = 8
const PREFS_KEY = "chat-bubble-prefs"
type Prefs = { x: number | null; y: number | null; hidden: boolean }
const readPrefs = (): Prefs => {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "null")
    if (value) return { x: typeof value.x === "number" ? value.x : null, y: typeof value.y === "number" ? value.y : null, hidden: Boolean(value.hidden) }
  } catch { /* بلا تخزين */ }
  return { x: null, y: null, hidden: false }
}
const savePrefs = (prefs: Prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* بلا تخزين */ } }
const clamp = (value: number, max: number) => Math.min(Math.max(MARGIN, value), Math.max(MARGIN, max - BUBBLE - MARGIN))
// الموضع الافتراضي: أسفل الزاوية الطرفية (end) كما كان
const defaultSpot = (width: number, height: number) => {
  const rtl = typeof document === "undefined" || document.documentElement.dir !== "ltr"
  return { x: rtl ? 16 : width - 16 - BUBBLE, y: height - 96 - BUBBLE }
}

export function ChatWidget() {
  const { user, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const enabled = Boolean(isAuthenticated && user)
  const [prefs, setPrefs] = useState<Prefs>({ x: null, y: null, hidden: false })
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    setPrefs(readPrefs())
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  const updatePrefs = (next: Partial<Prefs>) => setPrefs((current) => { const merged = { ...current, ...next }; savePrefs(merged); return merged })

  const chatRef = useRef<ReturnType<typeof useChat> | null>(null)
  const onNewMessage = useCallback((latest: LatestUnread) => {
    toast({
      title: latest.sender_name,
      description: latest.body,
      action: (
        <ToastAction altText={tr("فتح المحادثة")} onClick={() => { setOpen(true); updatePrefs({ hidden: false }); chatRef.current?.openById(String(latest.sender_id), latest.sender_name) }}>
          {tr("فتح")}
        </ToastAction>
      ),
    })
  }, [toast])

  const chat = useChat({ enabled, open, onNewMessage })
  chatRef.current = chat
  const { active } = chat
  const onlineCount = chat.contacts.filter((c) => c.online).length

  // Esc: من المحادثة إلى القائمة، ومن القائمة إغلاق
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (active) chat.closeConversation()
      else setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, active, chat.closeConversation])

  if (!enabled || !user || !viewport.w) return null

  const fallback = defaultSpot(viewport.w, viewport.h)
  const x = clamp(prefs.x ?? fallback.x, viewport.w)
  const y = clamp(prefs.y ?? fallback.y, viewport.h)
  const onLeft = x + BUBBLE / 2 < viewport.w / 2
  const below = y + BUBBLE / 2 < viewport.h / 2
  // اللوحة تُفتح نحو المساحة الأكبر: فوق الفقاعة أو تحتها، ومحاذاةً لجهة الفقاعة
  const panelHeight = Math.max(260, Math.min(544, below ? viewport.h - y - BUBBLE - 12 - MARGIN : y - 12 - MARGIN))

  // سحب بالمؤشر/اللمس: حركة أقل من 6px = نقرة (فتح/إغلاق)
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    drag.current = { dx: event.clientX - x, dy: event.clientY - y, startX: event.clientX, startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state) return
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 6) return
    if (!state.moved) { state.moved = true; setDragging(true) }
    setPrefs((current) => ({ ...current, x: clamp(event.clientX - state.dx, viewport.w), y: clamp(event.clientY - state.dy, viewport.h) }))
  }
  const onPointerUp = () => {
    const state = drag.current
    drag.current = null
    if (!state) return
    if (state.moved) { setDragging(false); setPrefs((current) => { savePrefs(current); return current }) }
    else setOpen((value) => !value)
  }

  // مخفية: لسان صغير على حافة الشاشة بارتفاع الفقاعة يعيدها
  if (prefs.hidden) {
    return (
      <button type="button" onClick={() => updatePrefs({ hidden: false })} title={tr("إظهار الدردشة")} aria-label={tr("إظهار الدردشة")}
        style={{ top: y + 6, ...(onLeft ? { left: 0 } : { right: 0 }) }}
        className={cn("fixed z-[9998] flex h-11 w-4 items-center justify-center bg-gradient-to-b from-emerald-500 to-teal-600 text-white opacity-70 shadow-md transition-[width,opacity] hover:w-7 hover:opacity-100 print:hidden", onLeft ? "rounded-e-xl" : "rounded-s-xl")}>
        <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
        {chat.unreadTotal > 0 && <span className="absolute -top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-white" />}
      </button>
    )
  }

  return (
    <div dir={appDir()} className="group/chat fixed z-[9998] print:hidden" style={{ left: x, top: y, width: BUBBLE, height: BUBBLE }}>
      {open && (
        <div style={{ height: panelHeight, ...(below ? { top: BUBBLE + 12 } : { bottom: BUBBLE + 12 }), ...(onLeft ? { left: 0 } : { right: 0 }) }}
          className="absolute flex w-[min(23rem,calc(100vw-2rem))] animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgba(15,60,50,.45)] ring-1 ring-slate-900/10 duration-150 dark:bg-slate-900 dark:ring-white/10">
          <header className="flex shrink-0 items-center gap-3 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-white">
            {active ? (
              <>
                <button type="button" onClick={chat.closeConversation} aria-label={tr("رجوع")} className="-ms-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
                  <ArrowRight className="h-4 w-4" />
                </button>
                <ChatAvatar name={active.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{active.full_name}</div>
                  <div className="truncate text-[11px] text-emerald-50/90">
                    {presenceLabel(active.online, active.last_seen_at)}{active.branch_name ? ` · ${active.branch_name}` : ""}
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"><MessagesSquare className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{tr("الدردشة الداخلية")}</div>
                  <div className="text-[11px] text-emerald-50/90">{onlineCount ? tr("{0} متصل الآن", onlineCount) : tr("تواصل مع زملائك في الشركة")}</div>
                </div>
              </>
            )}
            <button type="button" onClick={() => { setOpen(false); updatePrefs({ hidden: true }) }} title={tr("إخفاء الفقاعة")} aria-label={tr("إخفاء الفقاعة")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
              <EyeOff className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr("إغلاق")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          </header>

          {active ? (
            <ChatThread key={active.user_id} meId={String(user.id)} messages={chat.messages} lastReadId={chat.lastReadId} onSend={chat.send} />
          ) : (
            <ChatContacts contacts={chat.contacts} state={chat.contactsState} onRetry={chat.reloadContacts} onOpen={chat.openContact} />
          )}
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragging(false) }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((value) => !value) } }}
        title={tr("اسحب لتغيير المكان")}
        aria-label={open ? tr("إغلاق الدردشة") : tr("فتح الدردشة")}
        className={cn(
          "relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full text-white shadow-[0_12px_30px_-8px_rgba(5,150,105,.7)] transition-transform",
          dragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105 active:scale-95",
          "bg-gradient-to-br from-emerald-500 to-teal-600",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessagesSquare className="h-6 w-6" />}
        {!open && chat.unreadTotal > 0 && (
          <span className="absolute -start-1 -top-1 flex h-6 min-w-6">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
            <span className="relative flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
              {chat.unreadTotal > 99 ? "99+" : chat.unreadTotal}
            </span>
          </span>
        )}
      </button>
      {!open && !dragging && (
        <button type="button" onClick={() => updatePrefs({ hidden: true })} title={tr("إخفاء الفقاعة")} aria-label={tr("إخفاء الفقاعة")}
          className="absolute -bottom-1 -end-1 hidden h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white shadow ring-2 ring-white group-focus-within/chat:flex group-hover/chat:flex">
          <EyeOff className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
