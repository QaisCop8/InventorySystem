"use client"

import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// عناصر عرض مشتركة للدردشة: صورة رمزية ملوّنة بالاسم مع نقطة الاتصال، وتنسيقات الوقت.

const AVATAR_COLORS = ["bg-emerald-500", "bg-teal-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-cyan-600"]

export function ChatAvatar({ name, online, size = "md" }: { name: string; online?: boolean; size?: "sm" | "md" }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase()
  const hash = [...(name || "")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return (
    <span className={cn("relative inline-flex shrink-0", size === "sm" ? "h-9 w-9" : "h-11 w-11")}>
      <span className={cn("flex h-full w-full items-center justify-center rounded-full font-bold text-white", AVATAR_COLORS[hash % AVATAR_COLORS.length], size === "sm" ? "text-sm" : "text-base")}>
        {letter}
      </span>
      {online !== undefined && (
        <span className={cn("absolute bottom-0 end-0 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900", online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
      )}
    </span>
  )
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function timeLabel(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** وقت مختصر لقائمة المحادثات: الساعة اليوم، "أمس"، وإلا التاريخ */
export function shortWhen(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  if (sameDay(date, now)) return timeLabel(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return "أمس"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
}

export function dayLabel(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  if (sameDay(date, now)) return tr("اليوم")
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return tr("أمس")
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function presenceLabel(online: boolean, lastSeen: string | null) {
  if (online) return tr("متصل الآن")
  if (!lastSeen) return tr("غير متصل")
  return tr("آخر ظهور {0}", shortWhen(lastSeen))
}
