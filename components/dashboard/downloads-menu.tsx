"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Download, Monitor, Printer, Smartphone } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// «تنزيل البرامج» في الشاشة الرئيسية (lib/mobile-app.ts listDownloads): كاشير/مطعم ويندوز، CashService، وتطبيقات أندرويد
type Item = { key: string; group: "windows" | "android" | "service"; label: string; hint: string; url: string | null; size: number | null; updatedAt: string | null }
const GROUPS: { key: Item["group"]; label: string; icon: typeof Monitor; tone: string }[] = [
  { key: "windows", label: "ويندوز", icon: Monitor, tone: "bg-sky-50 text-sky-700" },
  { key: "service", label: "خدمة الطباعة وأجهزة الدفع", icon: Printer, tone: "bg-amber-50 text-amber-700" },
  { key: "android", label: "أندرويد", icon: Smartphone, tone: "bg-emerald-50 text-emerald-700" },
]
const sizeText = (bytes: number | null) => bytes == null ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export function DownloadsMenu() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    let active = true
    fetch("/api/mobile-app", { cache: "no-store" }).then((response) => response.json())
      .then((result) => { if (active) setItems(Array.isArray(result?.downloads) ? result.downloads : []) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])
  if (!items.some((item) => item.url)) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-emerald-700 shadow-sm transition hover:-translate-y-0.5" title={tr("تنزيل برامج الكاشير والمطعم وتطبيقات أندرويد وخدمة الطباعة")}>
          <Download className="h-4 w-4" />{tr("تنزيل البرامج")}
        </button>
      </PopoverTrigger>
      <PopoverContent dir={appDir()} align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-2">
        {GROUPS.map((group) => {
          const rows = items.filter((item) => item.group === group.key)
          if (!rows.length) return null
          return (
            <div key={group.key} className="mb-1 last:mb-0">
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-bold text-muted-foreground"><group.icon className="h-3.5 w-3.5" />{tr(group.label)}</div>
              {rows.map((item) => item.url ? (
                <a key={item.key} href={item.url} download className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${group.tone}`}><group.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{tr(item.label)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground" title={tr(item.hint)}>{tr(item.hint)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
                    <Download className="h-4 w-4 text-emerald-600" />{sizeText(item.size)}
                  </span>
                </a>
              ) : (
                <div key={item.key} className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><group.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{tr(item.label)}</span>
                    <span className="block text-[11px] text-muted-foreground">{tr("غير متوفر بعد")}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
