"use client"

import { tr } from "@/lib/i18n"
import { useMemo, useState } from "react"
import { Loader2, RefreshCw, Search, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChatAvatar, shortWhen } from "./chat-ui"
import type { ChatContact } from "./use-chat"

// قائمة الزملاء: بحث بالاسم/الفرع، "المحادثات" (من لهم رسائل) ثم "الزملاء" (المتصلون أولاً).
export function ChatContacts({ contacts, state, onRetry, onOpen }: { contacts: ChatContact[]; state: "loading" | "ready" | "error"; onRetry: () => void; onOpen: (contact: ChatContact) => void }) {
  const [query, setQuery] = useState("")

  const { recent, others } = useMemo(() => {
    const term = query.trim().toLowerCase()
    const matches = term
      ? contacts.filter((c) => [c.full_name, c.username, c.branch_name].some((value) => String(value || "").toLowerCase().includes(term)))
      : contacts
    return {
      recent: matches.filter((c) => c.last_message_at),
      others: matches.filter((c) => !c.last_message_at).sort((a, b) => Number(b.online) - Number(a.online) || a.full_name.localeCompare(b.full_name, "ar")),
    }
  }, [contacts, query])

  if (state === "loading" && !contacts.length) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
  }
  if (state === "error" && !contacts.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{tr("تعذّر تحميل الزملاء")}</p>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
          <RefreshCw className="h-3.5 w-3.5" />{tr(" إعادة المحاولة")}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 ring-emerald-500/40 focus-within:ring-2 dark:bg-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("ابحث عن زميل أو فرع...")} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {!contacts.length ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Users className="h-6 w-6" /></span>
            <p className="text-sm font-semibold">{tr("لا يوجد مستخدمون آخرون في الشركة")}</p>
            <p className="text-xs text-muted-foreground">{tr("أضف مستخدمين من شاشة المستخدمين ليظهروا هنا.")}</p>
          </div>
        ) : !recent.length && !others.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{tr("لا نتائج لـ «")}{query}»</p>
        ) : (
          <>
            {recent.length > 0 && <Section title={tr("المحادثات")}>{recent.map((c) => <Row key={c.user_id} contact={c} onOpen={onOpen} />)}</Section>}
            {others.length > 0 && <Section title={recent.length ? tr("زملاء آخرون") : tr("الزملاء")}>{others.map((c) => <Row key={c.user_id} contact={c} onOpen={onOpen} />)}</Section>}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  )
}

function Row({ contact: c, onOpen }: { contact: ChatContact; onOpen: (contact: ChatContact) => void }) {
  const unread = c.unread_count > 0
  return (
    <button type="button" onClick={() => onOpen(c)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
      <ChatAvatar name={c.full_name} online={c.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{c.full_name}</span>
          {c.last_message_at && <span className={cn("shrink-0 text-[11px]", unread ? "font-semibold text-emerald-600" : "text-slate-400")}>{shortWhen(c.last_message_at)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-xs", unread ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-500")}>
            {c.last_message ? tr("{0}{1}", c.last_message_from_me ? "أنت: " : "", c.last_message) : c.branch_name || (c.online ? tr("متصل الآن") : tr("ابدأ محادثة"))}
          </p>
          {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread_count > 99 ? "99+" : c.unread_count}</span>}
        </div>
      </div>
    </button>
  )
}
