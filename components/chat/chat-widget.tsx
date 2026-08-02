"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { MessageCircle, X, ArrowRight, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-context"

interface ChatContact {
  user_id: string
  full_name: string
  username: string
  last_message: string | null
  last_message_at: string | null
  last_message_from_me: boolean
  unread_count: number
}

interface ChatMessage {
  id: number
  sender_id: string
  receiver_id: string
  body: string
  is_read: boolean
  created_at: string
}

interface LatestUnread {
  id: number
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

const UNREAD_POLL_MS = 8000
const CONTACTS_POLL_MS = 10000
const MESSAGES_POLL_MS = 4000

function initials(name: string): string {
  return (name || "?").trim().charAt(0).toUpperCase()
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

export function ChatWidget() {
  const { user, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [activeContact, setActiveContact] = useState<ChatContact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<number | null>(null)
  const openRef = useRef(open)
  const activeContactRef = useRef(activeContact)
  const seenLatestIdRef = useRef<number | null>(null)
  const hasPolledOnceRef = useRef(false)

  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => {
    activeContactRef.current = activeContact
  }, [activeContact])

  const openConversationWith = useCallback((userId: string, fullName: string) => {
    setOpen(true)
    setActiveContact((prev) =>
      prev?.user_id === userId
        ? prev
        : { user_id: userId, full_name: fullName, username: "", last_message: null, last_message_at: null, last_message_from_me: false, unread_count: 0 },
    )
  }, [])

  const fetchUnreadTotal = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-count")
      if (!res.ok) return
      const data = await res.json()
      setUnreadTotal(typeof data.count === "number" ? data.count : 0)

      const latest: LatestUnread | null = data.latest ?? null
      if (latest && latest.id !== seenLatestIdRef.current) {
        const isNewSinceLastPoll = hasPolledOnceRef.current
        seenLatestIdRef.current = latest.id
        const viewingThisConversation = openRef.current && activeContactRef.current?.user_id === latest.sender_id
        if (isNewSinceLastPoll && !viewingThisConversation) {
          toast({
            title: latest.sender_name,
            description: latest.body,
            action: (
              <ToastAction altText="فتح المحادثة" onClick={() => openConversationWith(latest.sender_id, latest.sender_name)}>
                فتح
              </ToastAction>
            ),
          })
        }
      }
      hasPolledOnceRef.current = true
    } catch {
      // تجاهل صامت — الاستطلاع سيحاول مجدداً في الدورة التالية
    }
  }, [toast, openConversationWith])

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/contacts")
      if (!res.ok) return
      const data = await res.json()
      setContacts(Array.isArray(data.contacts) ? data.contacts : [])
    } catch {
      // تجاهل صامت
    }
  }, [])

  const fetchMessages = useCallback(async (withUserId: string, afterId: number | null) => {
    try {
      const params = new URLSearchParams({ with: withUserId })
      if (afterId) params.set("after_id", String(afterId))
      const res = await fetch(`/api/chat/messages?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const fetched: ChatMessage[] = Array.isArray(data.messages) ? data.messages : []
      if (fetched.length === 0) return
      setMessages((prev) => (afterId ? [...prev, ...fetched] : fetched))
      lastMessageIdRef.current = fetched[fetched.length - 1].id
    } catch {
      // تجاهل صامت
    }
  }, [])

  // استطلاع إجمالي غير المقروء دائماً طالما المستخدم مسجّل دخوله (يغذّي شارة الفقاعة العائمة)
  useEffect(() => {
    if (!isAuthenticated) return
    fetchUnreadTotal()
    const interval = setInterval(fetchUnreadTotal, UNREAD_POLL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, fetchUnreadTotal])

  // استطلاع قائمة جهات الاتصال فقط أثناء عرضها (اللوحة مفتوحة وبلا محادثة نشطة)
  useEffect(() => {
    if (!open || activeContact) return
    fetchContacts()
    const interval = setInterval(fetchContacts, CONTACTS_POLL_MS)
    return () => clearInterval(interval)
  }, [open, activeContact, fetchContacts])

  // استطلاع رسائل المحادثة النشطة فقط
  useEffect(() => {
    if (!open || !activeContact) return
    lastMessageIdRef.current = null
    setMessages([])
    fetchMessages(activeContact.user_id, null)
    const interval = setInterval(() => {
      fetchMessages(activeContact.user_id, lastMessageIdRef.current)
    }, MESSAGES_POLL_MS)
    return () => clearInterval(interval)
  }, [open, activeContact, fetchMessages])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const openContact = (contact: ChatContact) => {
    setActiveContact(contact)
    setContacts((prev) => prev.map((c) => (c.user_id === contact.user_id ? { ...c, unread_count: 0 } : c)))
  }

  const backToList = () => {
    setActiveContact(null)
    fetchContacts()
    fetchUnreadTotal()
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !activeContact || sending) return
    setSending(true)
    setInput("")
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: activeContact.user_id, body: text }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.message) {
          setMessages((prev) => [...prev, data.message])
          lastMessageIdRef.current = data.message.id
        }
      }
    } catch {
      // تجاهل صامت — الرسالة تبقى مفقودة، بإمكان المستخدم إعادة المحاولة
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <div dir="rtl" className="fixed bottom-24 left-6 z-[9998]">
      {open && (
        <div className="mb-3 w-80 h-[28rem] bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
            {activeContact ? (
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={backToList}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <span className="font-medium text-sm truncate">{activeContact.full_name}</span>
              </div>
            ) : (
              <span className="font-medium text-sm">المحادثات</span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {activeContact ? (
            <>
              <ScrollArea className="flex-1 p-3">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">لا توجد رسائل بعد</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messages.map((m) => {
                      // مقارنة نصّية صريحة: user_settings.user_id قد يعود كرقم JS من الاستعلامات
                      // (العمود INTEGER في القاعدة رغم استخدامه كمعرّف نصّي في كل مكان آخر بالتطبيق)
                      // بينما sender_id من chat_messages (VARCHAR) دوماً نص — المقارنة الصارمة (===)
                      // بينهما تفشل بصمت وتجعل كل الرسائل تُعرض كأنها من الطرف الآخر.
                      const mine = String(m.sender_id) === String(user.id)
                      return (
                        <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[75%] rounded-lg px-3 py-2 text-sm break-words",
                              mine ? "bg-primary text-primary-foreground" : "bg-muted",
                            )}
                          >
                            <div dir="auto">{m.body}</div>
                            <div className={cn("text-[10px] mt-1 opacity-70", mine ? "text-left" : "text-right")}>
                              {timeLabel(m.created_at)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={scrollEndRef} />
                  </div>
                )}
              </ScrollArea>
              <div className="p-2 border-t border-border flex items-end gap-2 shrink-0">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="اكتب رسالة..."
                  className="min-h-[2.5rem] max-h-24 resize-none text-sm"
                  rows={1}
                />
                <Button size="icon" className="shrink-0" onClick={sendMessage} disabled={!input.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <ScrollArea className="flex-1">
              {contacts.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">لا يوجد زملاء لبدء محادثة</div>
              ) : (
                <div className="divide-y">
                  {contacts.map((c) => (
                    <button
                      key={c.user_id}
                      onClick={() => openContact(c)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-right transition-colors"
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback>{initials(c.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm truncate", c.unread_count > 0 && "font-semibold")}>
                            {c.full_name}
                          </span>
                          {c.last_message_at && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {timeLabel(c.last_message_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.last_message ? `${c.last_message_from_me ? "أنت: " : ""}${c.last_message}` : "لا توجد رسائل"}
                        </p>
                      </div>
                      {c.unread_count > 0 && (
                        <Badge variant="destructive" className="shrink-0 h-5 min-w-5 rounded-full px-1.5 text-xs">
                          {c.unread_count > 99 ? "99+" : c.unread_count}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      )}

      <Button
        size="icon"
        className="h-12 w-12 rounded-full shadow-lg relative"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && unreadTotal > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <Badge
              variant="destructive"
              className="relative h-5 min-w-5 rounded-full px-1 text-xs flex items-center justify-center"
            >
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </Badge>
          </span>
        )}
      </Button>
    </div>
  )
}
