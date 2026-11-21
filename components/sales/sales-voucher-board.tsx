"use client"

import { useMemo, useState, type KeyboardEvent } from "react"
import { ArrowUpLeft, CalendarRange, ChevronLeft, FileCheck2, Hash, Loader2, Search, Sigma, Sparkles, TrendingUp, X } from "lucide-react"
import { tr, appDir } from "@/lib/i18n"
import "./sales-voucher-board.css"

/**
 * لوحة قائمة سندات المبيعات (فواتير/إرساليات/مردوداتها) — تصميم 2026-11-21: «دفتر يومي» بدل الجدول التقليدي.
 * لوحة مؤشرات بمخطط آخر 14 يوماً، شريط بحث بفترات جاهزة، والسندات مجمّعة حسب اليوم مع مجموع كل يوم.
 * البيانات والبحث كما هي في sales-delivery.tsx (فلترة محلية) — هنا العرض فقط.
 */

export type BoardVoucher = {
  id: number; vch_code: string; vch_date?: string; amount?: number | string; voucher_status?: string
  customer_name?: string; party?: string; has_linked_invoice?: boolean
}
type Draft = { code: string; dateFrom: string; dateTo: string }

const PAGE = 80
const locale = () => (appDir() === "rtl" ? "ar-u-nu-latn" : "en-GB")
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const dayLabel = (day: string) => {
  const date = new Date(`${day}T00:00:00`)
  if (Number.isNaN(date.getTime())) return day || "—"
  const today = iso(new Date())
  const yesterday = iso(new Date(Date.now() - 86_400_000))
  const named = day === today ? tr("اليوم") : day === yesterday ? tr("أمس") : date.toLocaleDateString(locale(), { weekday: "long" })
  return `${named} · ${date.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" })}`
}
const statusTone = (status = "") => /ملغ|cancel/i.test(status) ? "is-cancelled" : /معتمد|approved|مرحل/i.test(status) ? "is-approved" : "is-draft"
const initial = (name = "") => name.replace(/^(ال|شركة|مؤسسة)\s*/, "").trim().charAt(0) || "؟"

export function SalesVoucherBoard({
  title, rows, totalCount, partyLabel, loading, draft, setDraft, onSearch, onOpen,
}: {
  title: string
  rows: BoardVoucher[]
  /** كل السندات المحمّلة (قبل البحث) */
  totalCount: number
  partyLabel: string
  loading: boolean
  draft: Draft
  setDraft: (update: (prev: Draft) => Draft) => void
  onSearch: (draft?: Draft) => void
  onOpen: (voucher: BoardVoucher) => void
}) {
  const [limit, setLimit] = useState(PAGE)

  const stats = useMemo(() => {
    const amounts = rows.map((row) => Number(row.amount || 0))
    const total = amounts.reduce((sum, value) => sum + value, 0)
    // آخر 14 يوماً حتى آخر يوم في النتائج (أو اليوم)
    const lastDay = rows.reduce((max, row) => { const day = String(row.vch_date || "").slice(0, 10); return day > max ? day : max }, "") || iso(new Date())
    const end = new Date(`${lastDay}T00:00:00`)
    const days = Array.from({ length: 14 }, (_, index) => iso(new Date(end.getTime() - (13 - index) * 86_400_000)))
    const byDay = new Map<string, number>()
    for (const row of rows) { const day = String(row.vch_date || "").slice(0, 10); byDay.set(day, (byDay.get(day) || 0) + Number(row.amount || 0)) }
    const series = days.map((day) => ({ day, value: byDay.get(day) || 0 }))
    const peak = Math.max(1, ...series.map((point) => point.value))
    return { count: rows.length, total, average: rows.length ? total / rows.length : 0, largest: amounts.length ? Math.max(...amounts) : 0, series, peak }
  }, [rows])

  const groups = useMemo(() => {
    const list: { day: string; total: number; rows: BoardVoucher[] }[] = []
    for (const row of rows.slice(0, limit)) {
      const day = String(row.vch_date || "").slice(0, 10)
      const last = list[list.length - 1]
      if (last && last.day === day) { last.rows.push(row); last.total += Number(row.amount || 0) } else list.push({ day, total: Number(row.amount || 0), rows: [row] })
    }
    return list
  }, [rows, limit])

  const preset = (key: "today" | "week" | "month" | "year") => {
    const now = new Date()
    const from = key === "today" ? now : key === "week" ? new Date(now.getTime() - 6 * 86_400_000) : key === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1)
    const next = { ...draft, dateFrom: iso(from), dateTo: iso(now) }
    setDraft(() => next)
    setLimit(PAGE)
    onSearch(next)
  }
  const activePreset = (() => {
    const now = new Date(), today = iso(now)
    if (draft.dateTo !== today) return ""
    if (draft.dateFrom === today) return "today"
    if (draft.dateFrom === iso(new Date(now.getTime() - 6 * 86_400_000))) return "week"
    if (draft.dateFrom === iso(new Date(now.getFullYear(), now.getMonth(), 1))) return "month"
    if (draft.dateFrom === iso(new Date(now.getFullYear(), 0, 1))) return "year"
    return ""
  })()
  const submitOnEnter = (event: KeyboardEvent<HTMLElement>) => { if (event.key === "Enter") { event.preventDefault(); setLimit(PAGE); onSearch() } }

  return (
    <div className="svb" dir={appDir()}>
      {/* ===== لوحة المؤشرات ===== */}
      <section className="svb-insight">
        <div className="svb-kpis">
          <div className="svb-kpi svb-kpi-hero">
            <span className="svb-kpi-label"><Sigma size={14} />{tr("صافي المبالغ للفترة")}</span>
            <strong className="svb-kpi-value" dir="ltr">{money(stats.total)}</strong>
            <span className="svb-kpi-sub">{tr("{0} سند من أصل {1}", stats.count.toLocaleString("en-US"), totalCount.toLocaleString("en-US"))}</span>
          </div>
          <div className="svb-kpi"><span className="svb-kpi-label"><Hash size={14} />{tr("عدد السندات")}</span><strong className="svb-kpi-value" dir="ltr">{stats.count.toLocaleString("en-US")}</strong></div>
          <div className="svb-kpi"><span className="svb-kpi-label"><TrendingUp size={14} />{tr("متوسط السند")}</span><strong className="svb-kpi-value" dir="ltr">{money(Math.round(stats.average * 100) / 100)}</strong></div>
          <div className="svb-kpi"><span className="svb-kpi-label"><Sparkles size={14} />{tr("أكبر سند")}</span><strong className="svb-kpi-value" dir="ltr">{money(stats.largest)}</strong></div>
        </div>
        <div className="svb-chart" aria-label={tr("المبالغ في آخر 14 يوماً")}>
          <div className="svb-chart-head"><span>{tr("آخر 14 يوماً")}</span><span dir="ltr">{money(stats.series.reduce((sum, point) => sum + point.value, 0))}</span></div>
          <div className="svb-bars">
            {stats.series.map((point) => (
              <span key={point.day} className={`svb-bar${point.value ? "" : " is-empty"}`} style={{ height: `${Math.max(6, (point.value / stats.peak) * 100)}%` }}
                title={`${point.day} — ${money(point.value)}`} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== شريط البحث ===== */}
      <section className="svb-command" onKeyDown={submitOnEnter}>
        <label className="svb-search">
          <Search size={17} />
          <input value={draft.code} onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))} placeholder={tr("ابحث برقم السند...")} aria-label={tr("رقم السند")} />
          {draft.code && <button type="button" aria-label={tr("مسح")} onClick={() => { const next = { ...draft, code: "" }; setDraft(() => next); onSearch(next) }}><X size={14} /></button>}
        </label>
        <div className="svb-range">
          <CalendarRange size={16} />
          <input type="date" value={draft.dateFrom} onChange={(event) => setDraft((prev) => ({ ...prev, dateFrom: event.target.value }))} aria-label={tr("من تاريخ")} />
          <ChevronLeft size={14} className="svb-range-sep" />
          <input type="date" value={draft.dateTo} onChange={(event) => setDraft((prev) => ({ ...prev, dateTo: event.target.value }))} aria-label={tr("إلى تاريخ")} />
        </div>
        <div className="svb-presets" role="group" aria-label={tr("فترات جاهزة")}>
          {([["today", "اليوم"], ["week", "7 أيام"], ["month", "هذا الشهر"], ["year", "هذه السنة"]] as const).map(([key, label]) => (
            <button key={key} type="button" className={activePreset === key ? "is-active" : ""} onClick={() => preset(key)}>{tr(label)}</button>
          ))}
        </div>
        <button type="button" className="svb-go" onClick={() => { setLimit(PAGE); onSearch() }} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}{tr("بحث")}
        </button>
      </section>

      {/* ===== الدفتر اليومي ===== */}
      <section className="svb-ledger">
        <header className="svb-ledger-head">
          <h2>{title}</h2>
          <span className="svb-count" dir="ltr">{rows.length.toLocaleString("en-US")}</span>
        </header>
        {loading && !rows.length ? (
          <div className="svb-empty"><Loader2 className="animate-spin" size={28} /></div>
        ) : !rows.length ? (
          <div className="svb-empty"><FileCheck2 size={34} /><p>{tr("لا توجد سندات في هذه الفترة")}</p></div>
        ) : (
          <div className="svb-days">
            {groups.map((group) => (
              <div key={group.day} className="svb-day">
                <div className="svb-day-head">
                  <span className="svb-day-dot" />
                  <span className="svb-day-name">{dayLabel(group.day)}</span>
                  <span className="svb-day-meta">{tr("{0} سند", group.rows.length)}</span>
                  <span className="svb-day-total" dir="ltr">{money(group.total)}</span>
                </div>
                <div className="svb-rows">
                  {group.rows.map((row) => {
                    const party = row.party || row.customer_name || "—"
                    return (
                      <button key={row.id} type="button" className="svb-row" onClick={() => onOpen(row)} title={tr("عرض السند")}>
                        <span className="svb-avatar" aria-hidden>{initial(party)}</span>
                        <span className="svb-party"><b>{party}</b><small>{partyLabel}</small></span>
                        <span className="svb-code" dir="ltr">{row.vch_code}</span>
                        <span className="svb-tags">
                          {row.voucher_status && <span className={`svb-status ${statusTone(row.voucher_status)}`}>{row.voucher_status}</span>}
                          {row.has_linked_invoice && <span className="svb-status is-linked">{tr("تم إصدار فاتورة")}</span>}
                        </span>
                        <span className="svb-amount" dir="ltr">{money(Number(row.amount || 0))}</span>
                        <span className="svb-open" aria-hidden><ArrowUpLeft size={16} /></span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {rows.length > limit && (
              <button type="button" className="svb-more" onClick={() => setLimit((value) => value + PAGE * 2)}>
                {tr("عرض المزيد ({0} متبقي)", (rows.length - limit).toLocaleString("en-US"))}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
