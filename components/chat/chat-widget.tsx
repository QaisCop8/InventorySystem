"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, MessagesSquare, X } from "lucide-react"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-context"
import { ChatAvatar, presenceLabel } from "./chat-ui"
import { ChatContacts } from "./chat-contacts"
import { ChatThread } from "./chat-thread"
import { useChat, type LatestUnread } from "./use-chat"

// الدردشة الداخلية: فقاعة عائمة تفتح لوحة الزملاء/المحادثة (تُركَّب مرة واحدة في erp-layout).
export function ChatWidget() {
  const { user, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const enabled = Boolean(isAuthenticated && user)

  const chatRef = useRef<ReturnType<typeof useChat> | null>(null)
  const onNewMessage = useCallback((latest: LatestUnread) => {
    toast({
      title: latest.sender_name,
      description: latest.body,
      action: (
        <ToastAction altText={tr("فتح المحادثة")} onClick={() => { setOpen(true); chatRef.current?.openById(String(latest.sender_id), latest.sender_name) }}>
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

  if (!enabled || !user) return null

  return (
    <div dir={appDir()} className="fixed bottom-24 end-4 z-[9998] sm:end-6">
      {open && (
        <div className="mb-3 flex h-[min(34rem,calc(100dvh-9rem))] w-[min(23rem,calc(100vw-2rem))] origin-bottom-left animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgba(15,60,50,.45)] ring-1 ring-slate-900/10 duration-150 dark:bg-slate-900 dark:ring-white/10">
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
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? tr("إغلاق الدردشة") : tr("فتح الدردشة")}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_12px_30px_-8px_rgba(5,150,105,.7)] transition-transform hover:scale-105 active:scale-95",
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
    </div>
  )
}
