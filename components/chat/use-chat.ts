"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// حالة الدردشة الداخلية واستطلاعاتها: الفقاعة (غير المقروء + نبضة الحضور) دائماً، الزملاء أثناء عرض القائمة،
// والرسائل أثناء فتح محادثة. استطلاع لا WebSocket — نفس نمط الجرس.

export interface ChatContact {
  user_id: string
  full_name: string
  username: string
  branch_name: string | null
  online: boolean
  last_seen_at: string | null
  last_message: string | null
  last_message_at: string | null
  last_message_from_me: boolean
  unread_count: number
}

export interface ChatMessage {
  id: number
  sender_id: string
  receiver_id: string
  body: string
  is_read: boolean
  created_at: string
  /** رسالة محلية لم تُؤكَّد بعد (sending) أو فشل إرسالها (failed) */
  local?: "sending" | "failed"
}

export interface LatestUnread {
  id: number
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

const UNREAD_POLL_MS = 8000
const CONTACTS_POLL_MS = 10000
const MESSAGES_POLL_MS = 4000

export function useChat({ enabled, open, onNewMessage }: { enabled: boolean; open: boolean; onNewMessage: (message: LatestUnread) => void }) {
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [contactsState, setContactsState] = useState<"loading" | "ready" | "error">("loading")
  const [active, setActive] = useState<ChatContact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadId, setLastReadId] = useState<number | null>(null)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const lastIdRef = useRef<number | null>(null)
  const seenLatestRef = useRef<number | null>(null)
  const polledOnceRef = useRef(false)
  const rejectedRef = useRef(false)
  const viewRef = useRef({ open, activeId: null as string | null })
  viewRef.current = { open, activeId: active?.user_id ?? null }
  const onNewMessageRef = useRef(onNewMessage)
  onNewMessageRef.current = onNewMessage

  const pollUnread = useCallback(async () => {
    if (rejectedRef.current) return
    try {
      const res = await fetch("/api/chat/unread-count", { cache: "no-store" })
      // الجلسة على الخادم انتهت بينما الواجهة ما زالت مسجّلة: يتوقف الاستطلاع حتى تغيّر المستخدم/الجلسة
      if (res.status === 401) { rejectedRef.current = true; setUnreadTotal(0); return }
      if (!res.ok) return
      const data = await res.json()
      setUnreadTotal(Number(data.count) || 0)
      const latest: LatestUnread | null = data.latest ?? null
      if (latest && latest.id !== seenLatestRef.current) {
        seenLatestRef.current = latest.id
        const viewing = viewRef.current.open && viewRef.current.activeId === String(latest.sender_id)
        if (polledOnceRef.current && !viewing) onNewMessageRef.current(latest)
      }
      polledOnceRef.current = true
    } catch {}
  }, [])

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/contacts", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setContacts(Array.isArray(data.contacts) ? data.contacts : [])
      setContactsState("ready")
    } catch {
      setContactsState((current) => (current === "ready" ? current : "error"))
    }
  }, [])

  const loadMessages = useCallback(async (withId: string, afterId: number | null) => {
    try {
      const params = new URLSearchParams({ with: withId })
      if (afterId) params.set("after_id", String(afterId))
      const res = await fetch(`/api/chat/messages?${params}`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      if (viewRef.current.activeId !== withId) return
      setLastReadId(data.lastReadId ?? null)
      const fetched: ChatMessage[] = Array.isArray(data.messages) ? data.messages : []
      if (!fetched.length) return
      setMessages((prev) => {
        if (!afterId) return fetched
        const known = new Set(prev.map((m) => m.id))
        return [...prev, ...fetched.filter((m) => !known.has(m.id))]
      })
      lastIdRef.current = fetched[fetched.length - 1].id
    } catch {}
  }, [])

  useEffect(() => {
    if (!enabled) return
    rejectedRef.current = false
    pollUnread()
    const timer = setInterval(pollUnread, UNREAD_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, pollUnread])

  useEffect(() => {
    if (!enabled || !open || active) return
    loadContacts()
    const timer = setInterval(loadContacts, CONTACTS_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, open, active, loadContacts])

  const activeId = active?.user_id ?? null
  useEffect(() => {
    if (!enabled || !open || !activeId) return
    lastIdRef.current = null
    setMessages([])
    setLastReadId(null)
    loadMessages(activeId, null)
    const timer = setInterval(() => loadMessages(activeId, lastIdRef.current), MESSAGES_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, open, activeId, loadMessages])

  const openContact = useCallback((contact: ChatContact) => {
    setActive(contact)
    setContacts((prev) => prev.map((c) => (c.user_id === contact.user_id ? { ...c, unread_count: 0 } : c)))
    setUnreadTotal((total) => Math.max(0, total - contact.unread_count))
  }, [])

  /** فتح محادثة من إشعار منبثق (قد لا تكون قائمة الزملاء محمّلة بعد) */
  const openById = useCallback((userId: string, fullName: string) => {
    setActive((prev) => prev?.user_id === userId ? prev : contacts.find((c) => c.user_id === userId) ?? {
      user_id: userId, full_name: fullName, username: "", branch_name: null, online: false, last_seen_at: null,
      last_message: null, last_message_at: null, last_message_from_me: false, unread_count: 0,
    })
  }, [contacts])

  const closeConversation = useCallback(() => {
    setActive(null)
    pollUnread()
  }, [pollUnread])

  // إرسال متفائل: تظهر الرسالة فوراً، وتُستبدل بالمؤكَّدة أو تُعلَّم "لم تُرسل" لإعادة المحاولة
  const send = useCallback(async (text: string, retryOf?: number) => {
    if (!active) return
    const to = active.user_id
    const tempId = retryOf ?? -Date.now()
    const optimistic: ChatMessage = { id: tempId, sender_id: "", receiver_id: to, body: text, is_read: false, created_at: new Date().toISOString(), local: "sending" }
    setMessages((prev) => (retryOf ? prev.map((m) => (m.id === retryOf ? optimistic : m)) : [...prev, optimistic]))
    try {
      const res = await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, body: text }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.message) throw new Error()
      setMessages((prev) => prev.some((m) => m.id === data.message.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? data.message : m)))
      lastIdRef.current = Math.max(lastIdRef.current ?? 0, data.message.id)
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, local: "failed" } : m)))
    }
  }, [active])

  return { contacts, contactsState, reloadContacts: loadContacts, active, openContact, openById, closeConversation, messages, lastReadId, send, unreadTotal }
}
