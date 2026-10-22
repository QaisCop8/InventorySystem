"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight, CalendarDays, Coins, Loader2, Save, X } from "lucide-react"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"

interface CurrencyRateRow {
  currency_id: number
  currency_code: string
  currency_name: string
  is_base: boolean
  buy_rate: number
  sell_rate: number
  exchange_rate: number
}

interface DailyExchangeRatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

type RateField = "buy_rate" | "sell_rate" | "exchange_rate"
const FIELDS: { key: RateField; label: string }[] = [
  { key: "buy_rate", label: "سعر الشراء" },
  { key: "sell_rate", label: "سعر البيع" },
  { key: "exchange_rate", label: "سعر الصرف" },
]

const fmt = (value: number, digits = 3) => (Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—")

// نافذة إدخال/تحديث أسعار الصرف اليومية لكل العملات دفعة واحدة — تُفتح يدوياً من زر شريط الأدوات
// العلوي، أو تلقائياً عبر useDailyExchangeRatesCheck عند اكتشاف عملة بلا سعر صرف مسجَّل لليوم.
// العملة الرئيسية (الأصغر معرّفاً في جدول currency) سعرها ثابت دوماً عند 1 ولا تُعرَض قابلة للتعديل،
// بنفس افتراض /api/exchange-rates/lookup. تغيير التاريخ يُعيد التحميل من /api/exchange-rates?date=...
// التي تعرض السعر المسجَّل لذلك التاريخ إن وُجد، أو تنسخ آخر سعر سابق وتحفظه تلقائياً كسعر ذلك اليوم
// إن لم يوجد (انظر lib/database.ts's getOrCreateRatesForDate).
// التصميم: بطاقة لكل عملة بحقول عادية (بدل شبكة Wijmo) — Enter ينتقل للحقل التالي، F3 يحفظ.
export function DailyExchangeRatesDialog({ open, onOpenChange, onSaved }: DailyExchangeRatesDialogProps) {
  const workspaceTabActive = useWorkspaceTabActive()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const [rateDate, setRateDate] = useState(today)
  // المكوّن يبقى مُركَّباً بين مرات الفتح (وقد يبقى النظام مفتوحاً بعد منتصف الليل) — كل فتح يبدأ بتاريخ اليوم الفعلي.
  useEffect(() => {
    if (open) setRateDate(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const [rows, setRows] = useState<CurrencyRateRow[]>([])
  // نص الحقول كما يكتبه المستخدم (يسمح بـ"3." أثناء الكتابة) — المفتاح: currencyId:field
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const savingRef = useRef(false)
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setError("")
    setLoading(true)
    fetch(`/api/exchange-rates?date=${rateDate}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("فشل تحميل أسعار الصرف"))))
      .then((data) => {
        const list = Array.isArray(data?.rates) ? data.rates : []
        const baseId = list.length > 0 ? Math.min(...list.map((r: any) => Number(r.currency_id))) : null
        const mapped: CurrencyRateRow[] = list
          .filter((r: any) => r.is_active !== false)
          .map((r: any) => ({
            currency_id: Number(r.currency_id),
            currency_code: r.currency_code ?? "",
            currency_name: r.currency_name ?? "",
            is_base: Number(r.currency_id) === baseId,
            buy_rate: Number(r.buy_rate) || 0,
            sell_rate: Number(r.sell_rate) || 0,
            exchange_rate: Number(r.exchange_rate) || 0,
          }))
          .sort((a: CurrencyRateRow, b: CurrencyRateRow) => a.currency_id - b.currency_id)
        setRows(mapped)
        setDrafts({})
        // التركيز على أول حقل قابل للتعديل
        requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>("input[data-rate-input]")?.focus())
      })
      .catch((err) => setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل أسعار الصرف"))
      .finally(() => setLoading(false))
  }, [open, rateDate])

  const setField = (currencyId: number, field: RateField, text: string) => {
    const clean = text.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
    setDrafts((current) => ({ ...current, [`${currencyId}:${field}`]: clean }))
    const numeric = clean === "" || clean === "." ? 0 : Number(clean)
    setRows((current) => current.map((row) => (row.currency_id === currencyId ? { ...row, [field]: Number.isFinite(numeric) ? numeric : 0 } : row)))
  }
  const fieldText = (row: CurrencyRateRow, field: RateField) => drafts[`${row.currency_id}:${field}`] ?? String(row[field] ?? "")

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      const invalid = rowsRef.current.find((row) => !row.is_base && !(row.exchange_rate > 0))
      if (invalid) throw new Error(`أدخل سعر صرف صحيحاً لعملة ${invalid.currency_code}`)
      for (const row of rowsRef.current) {
        if (row.is_base) continue
        const res = await fetch("/api/exchange-rates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 0,
            type: 1,
            currency_id: row.currency_id,
            buy_rate: row.buy_rate,
            sell_rate: row.sell_rate,
            exchange_rate: row.exchange_rate,
            is_active: true,
            rate_date: rateDate,
          }),
        })
        if (!res.ok) throw new Error("فشل حفظ سعر صرف بعض العملات")
      }
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (savingRef.current) return
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    const handleShortcut = (event: KeyboardEvent) => {
      if (!workspaceTabActive.current) return
      if (event.key !== "F3") return
      event.preventDefault()
      event.stopPropagation()
      if (!savingRef.current && !loading && rowsRef.current.length > 0) void handleSave()
    }
    document.addEventListener("keydown", handleShortcut, true)
    return () => document.removeEventListener("keydown", handleShortcut, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading])

  // Enter = الانتقال للحقل التالي؛ في آخر حقل ينتقل لزر الحفظ
  const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const inputs = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>("input[data-rate-input]") || [])
    const next = inputs[inputs.indexOf(event.currentTarget) + 1]
    if (next) { next.focus(); next.select() } else document.getElementById("daily-rates-save")?.focus()
  }

  const base = rows.find((row) => row.is_base)
  const others = rows.filter((row) => !row.is_base)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && savingRef.current) return
        if (!nextOpen) handleClose()
        else onOpenChange(true)
      }}
    >
      <DialogContent
        className="flex max-h-[min(88dvh,760px)] w-[min(94vw,760px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl [&>button]:hidden"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {/* الرأس */}
        <div className="relative overflow-hidden bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-700 px-5 py-4 text-white sm:px-6">
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Coins className="h-6 w-6" /></span>
              <div>
                <DialogTitle className="text-lg font-bold text-white">أسعار الصرف اليومية</DialogTitle>
                <DialogDescription className="text-xs text-white/80">حدّث أسعار العملات لهذا اليوم — العملة الرئيسية ثابتة بقيمة 1</DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5 ring-1 ring-white/25 focus-within:bg-white/25">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="sr-only">أسعار الصرف بتاريخ</span>
                <input
                  id="daily-exchange-rate-date"
                  type="date"
                  value={rateDate}
                  max={today}
                  onChange={(e) => setRateDate(e.target.value || today)}
                  className="bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark]"
                />
              </label>
              <button type="button" onClick={handleClose} disabled={saving} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* المحتوى */}
        <div ref={listRef} className="relative min-h-[220px] flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5 dark:bg-slate-900">
          {loading && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-white/70 backdrop-blur-[1px] dark:bg-slate-900/70">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          )}

          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">{error}</div>}

          {base && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
                <span className="rounded-lg bg-emerald-600 px-2 py-0.5 font-mono text-xs font-bold text-white">{base.currency_code}</span>
                {base.currency_name}
              </span>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-slate-900">العملة الرئيسية · 1.000</span>
            </div>
          )}

          {!loading && others.length === 0 && !error && (
            <div className="grid h-32 place-items-center rounded-xl border-2 border-dashed text-sm text-slate-500">لا توجد عملات أخرى مفعّلة</div>
          )}

          {others.map((row) => (
            <div key={row.currency_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition focus-within:border-emerald-300 focus-within:shadow-md dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 font-mono text-xs font-black text-white shadow-sm">{row.currency_code}</span>
                  <div>
                    <b className="block text-sm text-slate-900 dark:text-slate-100">{row.currency_name}</b>
                    <small className="text-xs text-slate-500">{row.currency_code}</small>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="ltr">
                  <span>1 {row.currency_code} = {fmt(row.exchange_rate)} {base?.currency_code}</span>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" />
                  <span>1 {base?.currency_code} = {row.exchange_rate > 0 ? fmt(1 / row.exchange_rate, 4) : "—"} {row.currency_code}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {FIELDS.map((field) => (
                  <label key={field.key} className="grid gap-1">
                    <span className={`text-xs font-semibold ${field.key === "exchange_rate" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>{field.label}{field.key === "exchange_rate" && " *"}</span>
                    <input
                      data-rate-input
                      inputMode="decimal"
                      dir="ltr"
                      value={fieldText(row, field.key)}
                      onChange={(e) => setField(row.currency_id, field.key, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={handleEnter}
                      className={`h-11 w-full rounded-xl border px-3 text-center font-mono text-base font-bold outline-none transition focus:ring-4 dark:bg-slate-900 ${field.key === "exchange_rate"
                        ? "border-emerald-300 bg-emerald-50/60 text-emerald-800 focus:border-emerald-500 focus:ring-emerald-100 dark:text-emerald-200 dark:focus:ring-emerald-900/50"
                        : "border-slate-200 bg-slate-50 text-slate-800 focus:border-sky-400 focus:bg-white focus:ring-sky-100 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-sky-900/50"}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* التذييل */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-between sm:px-6 dark:border-slate-800 dark:bg-slate-950">
          <span className="hidden text-xs text-slate-500 sm:block">Enter للانتقال بين الحقول · F3 للحفظ</span>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button id="daily-rates-save" onClick={handleSave} disabled={saving || loading || rows.length === 0} className="h-11 flex-1 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700 sm:h-10 sm:w-32 sm:flex-none">
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              حفظ
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={saving} className="h-11 flex-1 rounded-xl sm:h-10 sm:w-28 sm:flex-none">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
