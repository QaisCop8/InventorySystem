"use client"
import "@/components/accounting/cheque-theme.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftRight, CheckCheck, CreditCard, FileCheck2, Loader2, Repeat2, Scale, Search, ShieldCheck, SquareStack, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Messages from "@/components/common/Messages"
import { cn } from "@/lib/utils"

// شاشات القيود الآلية — الواجهة الخلفية في app/api/auto-journals/* والمنطق المشترك في lib/auto-journals.ts.

type Currency = { id: number; currency_code: string; currency_name: string; rate: number | null }
type Account = { id: number; code: string; name: string; type?: number; currency_id?: number | null; finanical_list_id?: number; iscalc_curr_diff_rates?: boolean }
type CardType = { id: number; name: string; main_type?: number }
type Meta = { base_currency_id: number | null; currencies: Currency[]; accounts: Account[]; card_types: CardType[] }
type Journal = { id: number; code: string }

const emptyMeta: Meta = { base_currency_id: null, currencies: [], accounts: [], card_types: [] }
const today = () => new Date().toISOString().slice(0, 10)
const money = new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (value: unknown) => money.format(Number(value || 0))

function useMeta(date: string) {
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch(`/api/auto-journals/meta?date=${date}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل البيانات")
        if (active) { setMeta(data); setError("") }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "تعذر تحميل البيانات"))
    return () => { active = false }
  }, [date])
  return { meta, error }
}

function useMessages() {
  const ref = useRef<any>(null)
  const show = useCallback((severity: "success" | "error" | "info", detail: string) => {
    ref.current?.clear?.()
    ref.current?.show?.([{ severity, summary: "", detail, sticky: true }])
  }, [])
  const clear = useCallback(() => ref.current?.clear?.(), [])
  return { ref, show, clear }
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية")
  return data
}

const accountLabel = (account?: Account) => (account ? `${account.code} — ${account.name}` : "")

function AccountPicker({ label, accounts, value, onChange, dark, filter }: {
  label: string; accounts: Account[]; value: number | null; onChange: (id: number | null) => void; dark?: boolean; filter?: (account: Account) => boolean
}) {
  const selected = accounts.find((account) => account.id === value)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  useEffect(() => { setQuery(accountLabel(selected)) }, [selected])
  const options = useMemo(() => {
    const term = query.trim().toLowerCase()
    const source = filter ? accounts.filter(filter) : accounts
    return (term && term !== accountLabel(selected).toLowerCase()
      ? source.filter((account) => `${account.code} ${account.name}`.toLowerCase().includes(term))
      : source
    ).slice(0, 40)
  }, [accounts, filter, query, selected])
  return (
    <div className="relative space-y-1" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <Label>{label}</Label>
      <Input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); onChange(null); setOpen(true) }}
        placeholder="ابحث برقم أو اسم الحساب..."
        className={dark ? "border-white/10 bg-white/10 text-white placeholder:text-slate-500" : ""}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-white p-1 text-slate-900 shadow-2xl">
          {options.map((account) => (
            <button
              key={account.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(account.id); setQuery(accountLabel(account)); setOpen(false) }}
              className="block w-full rounded-lg p-2 text-right text-sm hover:bg-emerald-50"
            >
              <b className="font-mono">{account.code}</b> {account.name}
            </button>
          ))}
          {!options.length && <p className="p-3 text-center text-sm text-slate-400">لا توجد نتائج</p>}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>
}

function CurrencySelect({ currencies, value, onChange, className, allowAll, exclude }: {
  currencies: Currency[]; value: number | null; onChange: (id: number | null) => void; className?: string; allowAll?: boolean; exclude?: number | null
}) {
  return (
    <select value={value ?? ""} onChange={(event) => onChange(Number(event.target.value) || null)} className={cn("h-10 w-full rounded-md border bg-white px-3 text-slate-900", className)}>
      {allowAll ? <option value="">جميع العملات</option> : <option value="">اختر العملة</option>}
      {currencies.filter((currency) => currency.id !== exclude).map((currency) => (
        <option key={currency.id} value={currency.id}>{currency.currency_code} — {currency.currency_name}</option>
      ))}
    </select>
  )
}

function PageShell({ title, description, icon: Icon, gradient, stat, children, messagesRef }: {
  title: string; description: string; icon: any; gradient: string; stat?: React.ReactNode; children: React.ReactNode; messagesRef: any
}) {
  return (
    <main dir="rtl" className="h-full min-h-0 w-full overflow-auto bg-slate-50/80 p-3 sm:p-5">
      <div className="flex min-h-full w-full flex-col gap-4">
        <header className={cn("cheque-page-header relative overflow-hidden rounded-[30px] bg-gradient-to-l p-5 text-white shadow-xl sm:p-7", gradient)}>
          <div className="absolute -left-16 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Icon className="h-7 w-7" /></span>
              <div>
                <p className="text-xs font-bold text-white/70">القيود الآلية</p>
                <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-white/75">{description}</p>
              </div>
            </div>
            {stat}
          </div>
        </header>
        <Messages innerRef={messagesRef} />
        {children}
      </div>
    </main>
  )
}

function JournalLinks({ journals }: { journals: Journal[] }) {
  if (!journals.length) return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">القيود المنشأة</p>
      <div className="flex flex-wrap gap-1">
        {journals.map((journal) => (
          <a key={journal.id} href={`/?section=journal-vouchers&voucher_id=${journal.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-400/15 px-2 py-1 font-mono text-xs font-bold text-emerald-300">{journal.code}</a>
        ))}
      </div>
    </div>
  )
}

function ExecutePanel({ title, subtitle, children, onExecute, saving, disabled, journals, footer }: {
  title: string; subtitle: string; children: React.ReactNode; onExecute: () => void; saving: boolean; disabled: boolean; journals: Journal[]; footer?: string
}) {
  return (
    <aside className="cheque-operation-panel h-fit space-y-4 rounded-3xl bg-slate-950 p-5 text-white shadow-xl xl:sticky xl:top-3">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300"><FileCheck2 /></span>
        <div><h2 className="font-black">{title}</h2><p className="text-xs text-slate-400">{subtitle}</p></div>
      </div>
      {children}
      <JournalLinks journals={journals} />
      <Button onClick={onExecute} disabled={saving || disabled} className="h-12 w-full bg-emerald-400 text-base font-black text-slate-950 hover:bg-emerald-300">
        {saving ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="ml-2 h-5 w-5" />}تنفيذ القيود
      </Button>
      {footer && <p className="text-center text-[11px] leading-5 text-slate-500">{footer}</p>}
    </aside>
  )
}

function useSelection<T>(rows: T[], keyOf: (row: T) => string) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { setSelected(new Set(rows.map(keyOf))) }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key: string) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(keyOf(row)))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(keyOf)))
  const selectedRows = rows.filter((row) => selected.has(keyOf(row)))
  return { selected, toggle, allSelected, toggleAll, selectedRows }
}

function SelectableTable<T>({ title, hint, rows, keyOf, columns, selection, loading, empty }: {
  title: string; hint: string; rows: T[]; keyOf: (row: T) => string
  columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[]
  selection: ReturnType<typeof useSelection<T>>; loading: boolean; empty: string
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div><h2 className="font-black">{title}</h2><p className="text-xs text-slate-500">{hint}</p></div>
        <Button variant="outline" onClick={selection.toggleAll} disabled={!rows.length || loading}>
          {selection.allSelected ? <X className="ml-2 h-4 w-4" /> : <CheckCheck className="ml-2 h-4 w-4" />}
          {selection.allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
        </Button>
      </div>
      <div className="min-h-[320px] flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="cheque-table-header sticky top-0 z-10 bg-slate-900 text-white">
            <tr><th className="w-14 p-3">تحديد</th>{columns.map((column) => <th key={column.header} className="p-3 text-right text-xs">{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = keyOf(row)
              const checked = selection.selected.has(key)
              return (
                <tr key={key} onClick={() => selection.toggle(key)} className={cn("cursor-pointer border-b transition hover:bg-cyan-50", checked ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : index % 2 ? "bg-slate-50/60" : "")}>
                  <td className="p-3 text-center"><input type="checkbox" checked={checked} onClick={(event) => event.stopPropagation()} onChange={() => selection.toggle(key)} className="h-5 w-5 cursor-pointer accent-emerald-600" /></td>
                  {columns.map((column) => <td key={column.header} className={cn("p-3", column.className)}>{column.cell(row)}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && !loading && (
          <div className="grid h-52 place-items-center text-center text-slate-400"><div><SquareStack className="mx-auto mb-2 h-10 w-10" /><p>{empty}</p></div></div>
        )}
        {loading && <div className="grid h-52 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}
      </div>
    </div>
  )
}

// ───────────────────────── قيود عمولة الفيزا ─────────────────────────

type CardRow = {
  id: number; vch_code: string; vch_date: string; customer_name: string; card_type_name: string; card_no: string
  amount: number; currency_code: string; commission: number; commission_percent: number
  financial_account_name?: string; card_account_name?: string; commission_account_name?: string
}

export function VisaCommissionJournalsPage() {
  const messages = useMessages()
  const [date, setDate] = useState(today())
  const { meta, error } = useMeta(date)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState(today())
  const [currencyId, setCurrencyId] = useState<number | null>(null)
  const [cardTypeId, setCardTypeId] = useState("")
  const [note, setNote] = useState("")
  const [rows, setRows] = useState<CardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [journals, setJournals] = useState<Journal[]>([])
  const selection = useSelection(rows, (row) => String(row.id))
  useEffect(() => { if (error) messages.show("error", error) }, [error, messages])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set("from_date", fromDate)
      if (toDate) params.set("to_date", toDate)
      if (currencyId) params.set("currency_id", String(currencyId))
      if (cardTypeId) params.set("card_type_ids", cardTypeId)
      const response = await fetch(`/api/auto-journals/visa-commission?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الحركات")
      setRows(data.rows || [])
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر تحميل الحركات")
    } finally {
      setLoading(false)
    }
  }, [cardTypeId, currencyId, fromDate, messages, toDate])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = selection.selectedRows.reduce((sum, row) => sum + row.amount, 0)
  const commission = selection.selectedRows.reduce((sum, row) => sum + row.commission, 0)
  const execute = async () => {
    messages.clear()
    if (!selection.selectedRows.length) return messages.show("error", "اختر حركة واحدة على الأقل")
    setSaving(true)
    try {
      const data = await postJson("/api/auto-journals/visa-commission", { ids: selection.selectedRows.map((row) => row.id), vch_date: date, note })
      messages.show("success", data.message)
      setJournals(data.journal_vouchers || [])
      await load()
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر تنفيذ القيود")
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title="قيود عمولة الفيزا"
      description="حركات بطاقات الائتمان في سندات القبض المرحّلة التي لم يُنشأ لها قيد عمولة: قيد لكل حركة ينقل المبلغ من حساب البطاقات إلى حساب البنك ويُثبت عمولة البنك."
      icon={CreditCard}
      gradient="from-sky-700 via-indigo-700 to-violet-800"
      messagesRef={messages.ref}
      stat={<div className="rounded-2xl bg-black/15 px-5 py-3 text-center backdrop-blur"><small className="text-white/70">العمولة المحددة</small><p className="text-2xl font-black">{fmt(commission)}</p></div>}
    >
      <section className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="من تاريخ"><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
          <Field label="إلى تاريخ"><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
          <Field label="العملة"><CurrencySelect currencies={meta.currencies} value={currencyId} onChange={setCurrencyId} allowAll /></Field>
          <Field label="البطاقة">
            <select value={cardTypeId} onChange={(e) => setCardTypeId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
              <option value="">جميع البطاقات</option>
              {meta.card_types.filter((card) => Number(card.main_type || 1) === 1).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><Button onClick={() => void load()} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض الحركات</Button></div>
        </div>
      </section>
      <section className="grid min-h-[460px] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SelectableTable
          title="حركات البطاقات" hint="تظهر حركات بطاقات الائتمان التي لم يُنشأ لها قيد عمولة فقط."
          rows={rows} keyOf={(row) => String(row.id)} selection={selection} loading={loading} empty="لا توجد حركات بطاقات بانتظار قيد عمولة"
          columns={[
            { header: "سند القبض", cell: (row) => <span className="font-mono font-black text-cyan-700">{row.vch_code}</span> },
            { header: "التاريخ", cell: (row) => <span dir="ltr">{row.vch_date}</span> },
            { header: "العميل", cell: (row) => <b>{row.customer_name || "—"}</b> },
            { header: "البطاقة", cell: (row) => <>{row.card_type_name}<small className="block font-mono text-slate-400">{row.card_no}</small></> },
            { header: "المبلغ", cell: (row) => <span className="font-black text-emerald-700" dir="ltr">{fmt(row.amount)} {row.currency_code}</span> },
            { header: "العمولة", cell: (row) => <span className="font-black text-rose-700" dir="ltr">{fmt(row.commission)} <small className="text-slate-400">({row.commission_percent}%)</small></span> },
            { header: "حساب البنك", cell: (row) => row.financial_account_name || <span className="text-rose-600">غير معرّف</span> },
            { header: "حساب البطاقات", cell: (row) => row.card_account_name || "—" },
          ]}
        />
        <ExecutePanel
          title="تنفيذ قيود العمولة" subtitle="قيد مستقل لكل حركة بطاقة" saving={saving} disabled={!selection.selectedRows.length}
          onExecute={() => void execute()} journals={journals}
          footer="تُحسب العمولة من إعدادات نوع البطاقة (نسبة أو مبلغ مقطوع بحد أقصى). عند فشل أي حركة لا يُنشأ أي قيد."
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/[.07] p-3"><small className="text-slate-400">عدد الحركات</small><p className="text-xl font-black">{selection.selectedRows.length}</p></div>
            <div className="rounded-2xl bg-white/[.07] p-3"><small className="text-slate-400">الإجمالي</small><p className="text-xl font-black text-emerald-300">{fmt(total)}</p></div>
          </div>
          <Field label="تاريخ القيد"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-white/10 bg-white/10 text-white" /></Field>
          <Field label="ملاحظة"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="قيد عمولة فيزا" className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-sm outline-none focus:border-emerald-400" /></Field>
        </ExecutePanel>
      </section>
    </PageShell>
  )
}

// ───────────────────────── قيد تحويل عملة ─────────────────────────

export function CurrencyTransferJournalPage() {
  const messages = useMessages()
  const [date, setDate] = useState(today())
  const { meta, error } = useMeta(date)
  const [fromAccountId, setFromAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [convertAccountId, setConvertAccountId] = useState<number | null>(null)
  const [fromCurrencyId, setFromCurrencyId] = useState<number | null>(null)
  const [toCurrencyId, setToCurrencyId] = useState<number | null>(null)
  const [fromRate, setFromRate] = useState("")
  const [toRate, setToRate] = useState("")
  const [fromAmount, setFromAmount] = useState("")
  const [toAmount, setToAmount] = useState("")
  const [toAmountEdited, setToAmountEdited] = useState(false)
  const [firstNote, setFirstNote] = useState("")
  const [secondNote, setSecondNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [journals, setJournals] = useState<Journal[]>([])
  useEffect(() => { if (error) messages.show("error", error) }, [error, messages])

  const accountById = useCallback((id: number | null) => meta.accounts.find((account) => account.id === id), [meta.accounts])
  const rateOf = useCallback((id: number | null) => meta.currencies.find((currency) => currency.id === id)?.rate ?? null, [meta.currencies])
  // عملة الطرف تتبع عملة حسابه افتراضياً، وسعرها يتبع سعر التاريخ — والاثنان قابلان للتعديل.
  useEffect(() => { const currency = accountById(fromAccountId)?.currency_id; if (currency) setFromCurrencyId(Number(currency)) }, [accountById, fromAccountId])
  useEffect(() => { const currency = accountById(toAccountId)?.currency_id; if (currency) setToCurrencyId(Number(currency)) }, [accountById, toAccountId])
  // عملة الأساس سعرها 1 ثابت وغير قابل للتعديل.
  const isBase = useCallback((id: number | null) => id != null && meta.base_currency_id != null && id === Number(meta.base_currency_id), [meta.base_currency_id])
  useEffect(() => { const rate = isBase(fromCurrencyId) ? 1 : rateOf(fromCurrencyId); setFromRate(rate ? String(rate) : "") }, [fromCurrencyId, rateOf, isBase])
  useEffect(() => { const rate = isBase(toCurrencyId) ? 1 : rateOf(toCurrencyId); setToRate(rate ? String(rate) : "") }, [toCurrencyId, rateOf, isBase])
  useEffect(() => {
    if (toAmountEdited) return
    const amount = Number(fromAmount), source = Number(fromRate), target = Number(toRate)
    setToAmount(amount > 0 && source > 0 && target > 0 ? String(Math.round(((amount * source) / target) * 100) / 100) : "")
  }, [fromAmount, fromRate, toAmountEdited, toRate])

  const fromCode = meta.currencies.find((currency) => currency.id === fromCurrencyId)?.currency_code || ""
  const toCode = meta.currencies.find((currency) => currency.id === toCurrencyId)?.currency_code || ""
  const execute = async () => {
    messages.clear()
    setSaving(true)
    try {
      const data = await postJson("/api/auto-journals/currency-transfer", {
        vch_date: date, from_account_id: fromAccountId, to_account_id: toAccountId, convert_account_id: convertAccountId,
        from_currency_id: fromCurrencyId, to_currency_id: toCurrencyId, from_rate: Number(fromRate), to_rate: Number(toRate),
        from_amount: Number(fromAmount), to_amount: Number(toAmount), first_note: firstNote, second_note: secondNote,
      })
      messages.show("success", data.message)
      setJournals(data.journal_vouchers || [])
      setFromAmount(""); setToAmount(""); setToAmountEdited(false); setFirstNote(""); setSecondNote("")
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر تنفيذ القيد")
    } finally {
      setSaving(false)
    }
  }

  const side = (title: string, tone: string, children: React.ReactNode) => (
    <div className={cn("space-y-3 rounded-3xl border bg-white p-4 shadow-sm", tone)}><h2 className="font-black">{title}</h2>{children}</div>
  )
  return (
    <PageShell
      title="قيد تحويل عملة"
      description="تحويل مبلغ من حساب بعملة إلى حساب بعملة أخرى عبر حساب تحويل العملة، بقيدين مترابطين كلٌّ بعملة واحدة."
      icon={ArrowLeftRight}
      gradient="from-emerald-700 via-teal-700 to-cyan-800"
      messagesRef={messages.ref}
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {side("التحويل من", "border-rose-200", <>
            <AccountPicker label="الحساب المحوَّل منه" accounts={meta.accounts} value={fromAccountId} onChange={setFromAccountId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="العملة"><CurrencySelect currencies={meta.currencies} value={fromCurrencyId} onChange={setFromCurrencyId} /></Field>
              <Field label="سعر الصرف"><Input type="number" step="0.0001" value={fromRate} onChange={(e) => setFromRate(e.target.value)} disabled={isBase(fromCurrencyId)} title={isBase(fromCurrencyId) ? "عملة الأساس — سعر الصرف 1" : undefined} dir="ltr" /></Field>
            </div>
            <Field label={`المبلغ المحوَّل ${fromCode}`}><Input type="number" step="0.01" value={fromAmount} onChange={(e) => setFromAmount(e.target.value)} dir="ltr" className="text-lg font-black" /></Field>
            <Field label="ملاحظة القيد الأول"><Input value={firstNote} onChange={(e) => setFirstNote(e.target.value)} placeholder="قيد تحويل عملة" /></Field>
          </>)}
          {side("التحويل إلى", "border-emerald-200", <>
            <AccountPicker label="الحساب المحوَّل إليه" accounts={meta.accounts} value={toAccountId} onChange={setToAccountId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="العملة"><CurrencySelect currencies={meta.currencies} value={toCurrencyId} onChange={setToCurrencyId} /></Field>
              <Field label="سعر الصرف"><Input type="number" step="0.0001" value={toRate} onChange={(e) => setToRate(e.target.value)} disabled={isBase(toCurrencyId)} title={isBase(toCurrencyId) ? "عملة الأساس — سعر الصرف 1" : undefined} dir="ltr" /></Field>
            </div>
            <Field label={`المبلغ المحوَّل له ${toCode}`}>
              <Input type="number" step="0.01" value={toAmount} onChange={(e) => { setToAmount(e.target.value); setToAmountEdited(true) }} dir="ltr" className="text-lg font-black" />
            </Field>
            {toAmountEdited && <button type="button" className="text-xs text-teal-700" onClick={() => setToAmountEdited(false)}>إعادة الاحتساب حسب أسعار الصرف</button>}
            <Field label="ملاحظة القيد الثاني"><Input value={secondNote} onChange={(e) => setSecondNote(e.target.value)} placeholder="قيد تحويل عملة" /></Field>
          </>)}
        </div>
        <ExecutePanel
          title="تنفيذ التحويل" subtitle="قيدان مترابطان مرحّلان" saving={saving}
          disabled={!fromAccountId || !toAccountId || !convertAccountId || !(Number(fromAmount) > 0) || !(Number(toAmount) > 0)}
          onExecute={() => void execute()} journals={journals}
          footer="أي فرق بين قيمتي الطرفين بعملة الأساس يبقى في حساب تحويل العملة. إلغاء أحد القيدين من شاشة سند القيد يُلغي الآخر."
        >
          <Field label="تاريخ القيد"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-white/10 bg-white/10 text-white" /></Field>
          <AccountPicker label="حساب تحويل العملة" accounts={meta.accounts} value={convertAccountId} onChange={setConvertAccountId} dark />
          <div className="rounded-2xl bg-white/[.07] p-3 text-sm">
            <p className="text-slate-400">بعملة الأساس</p>
            <p className="font-black" dir="ltr">{fmt(Number(fromAmount) * Number(fromRate))} ← {fmt(Number(toAmount) * Number(toRate))}</p>
          </div>
        </ExecutePanel>
      </section>
    </PageShell>
  )
}

// ───────────────────────── قيود تحويل عملة حساب ─────────────────────────

type BalanceRow = {
  account_id: number; account_code: string; account_name: string
  account_currency_id: number; account_currency_code: string; trans_currency_id: number; trans_currency_code: string
  balance: number; trans_rate: number | null; account_rate: number | null; converted_amount: number | null
}

export function AccountCurrencyTransferJournalsPage() {
  const messages = useMessages()
  const [date, setDate] = useState(today())
  const { meta, error } = useMeta(date)
  const [balanceType, setBalanceType] = useState("0")
  const [accountId, setAccountId] = useState<number | null>(null)
  const [convertAccountId, setConvertAccountId] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [rates, setRates] = useState<Record<string, { trans: string; account: string }>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [journals, setJournals] = useState<Journal[]>([])
  const keyOf = (row: BalanceRow) => `${row.account_id}:${row.trans_currency_id}`
  const selection = useSelection(rows, keyOf)
  useEffect(() => { if (error) messages.show("error", error) }, [error, messages])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date, balance_type: balanceType })
      if (accountId) params.set("account_ids", String(accountId))
      const response = await fetch(`/api/auto-journals/account-currency-transfer?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر احتساب الأرصدة")
      const nextRows: BalanceRow[] = data.rows || []
      setRows(nextRows)
      setRates(Object.fromEntries(nextRows.map((row) => [keyOf(row), { trans: row.trans_rate ? String(row.trans_rate) : "", account: row.account_rate ? String(row.account_rate) : "" }])))
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر احتساب الأرصدة")
    } finally {
      setLoading(false)
    }
  }, [accountId, balanceType, date, messages])

  const converted = (row: BalanceRow) => {
    const rate = rates[keyOf(row)]
    const trans = Number(rate?.trans), account = Number(rate?.account)
    return trans > 0 && account > 0 ? Math.round(((Math.abs(row.balance) * trans) / account) * 100) / 100 : null
  }
  const setRate = (row: BalanceRow, field: "trans" | "account", value: string) =>
    setRates((current) => ({ ...current, [keyOf(row)]: { ...current[keyOf(row)], [field]: value } }))

  const execute = async () => {
    messages.clear()
    if (!selection.selectedRows.length) return messages.show("error", "اختر حساباً واحداً على الأقل")
    if (!convertAccountId) return messages.show("error", "اختر حساب تحويل العملة")
    setSaving(true)
    try {
      const data = await postJson("/api/auto-journals/account-currency-transfer", {
        vch_date: date, convert_account_id: convertAccountId, note,
        rows: selection.selectedRows.map((row) => ({ account_id: row.account_id, trans_currency_id: row.trans_currency_id, trans_rate: Number(rates[keyOf(row)]?.trans), account_rate: Number(rates[keyOf(row)]?.account) })),
      })
      messages.show("success", data.message)
      setJournals(data.journal_vouchers || [])
      await load()
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر تنفيذ القيود")
    } finally {
      setSaving(false)
    }
  }

  const rateInput = (row: BalanceRow, field: "trans" | "account") => (
    <Input type="number" step="0.0001" dir="ltr" value={rates[keyOf(row)]?.[field] ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => setRate(row, field, e.target.value)} className="h-8 w-24" />
  )
  return (
    <PageShell
      title="قيود تحويل عملة حساب"
      description="أرصدة الحسابات المتراكمة بعملات غير عملة الحساب: يُقفل كل رصيد أجنبي ويُعاد إثباته بعملة الحساب عبر حساب تحويل العملة."
      icon={Repeat2}
      gradient="from-amber-700 via-orange-700 to-rose-700"
      messagesRef={messages.ref}
    >
      <section className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="الرصيد حتى تاريخ"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="النوع">
            <select value={balanceType} onChange={(e) => setBalanceType(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
              <option value="0">الكل</option><option value="1">أرصدة مدينة</option><option value="2">أرصدة دائنة</option>
            </select>
          </Field>
          <AccountPicker label="الحساب (اختياري)" accounts={meta.accounts} value={accountId} onChange={setAccountId} />
          <div className="flex items-end"><Button onClick={() => void load()} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}تنفيذ أولي</Button></div>
        </div>
      </section>
      <section className="grid min-h-[460px] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SelectableTable
          title="الأرصدة بعملات أخرى" hint="الرصيد: مدين موجب، دائن سالب. أسعار الصرف قابلة للتعديل قبل التنفيذ."
          rows={rows} keyOf={keyOf} selection={selection} loading={loading} empty="اضغط تنفيذ أولي لاحتساب الأرصدة"
          columns={[
            { header: "الحساب", cell: (row) => <><b className="font-mono">{row.account_code}</b> {row.account_name}</> },
            { header: "المبلغ المحوَّل", cell: (row) => <span className={cn("font-black", row.balance > 0 ? "text-emerald-700" : "text-rose-700")} dir="ltr">{fmt(row.balance)} {row.trans_currency_code}</span> },
            { header: "سعر الصرف", cell: (row) => rateInput(row, "trans") },
            { header: "عملة الحساب", cell: (row) => row.account_currency_code },
            { header: "سعر صرف الحساب", cell: (row) => rateInput(row, "account") },
            { header: "المبلغ المحوَّل له", cell: (row) => { const value = converted(row); return value == null ? <span className="text-rose-600">لا يوجد سعر</span> : <span className="font-black" dir="ltr">{fmt(value)} {row.account_currency_code}</span> } },
          ]}
        />
        <ExecutePanel
          title="تنفيذ التحويل" subtitle="قيدان مترابطان لكل رصيد" saving={saving} disabled={!selection.selectedRows.length}
          onExecute={() => void execute()} journals={journals}
          footer="يُعاد احتساب الرصيد عند التنفيذ. عند فشل أي حساب لا يُنشأ أي قيد."
        >
          <div className="rounded-2xl bg-white/[.07] p-3"><small className="text-slate-400">الأرصدة المحددة</small><p className="text-xl font-black">{selection.selectedRows.length}</p></div>
          <AccountPicker label="حساب تحويل العملة" accounts={meta.accounts} value={convertAccountId} onChange={setConvertAccountId} dark />
          <Field label="ملاحظة"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="تحويل عملة حساب" className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-sm outline-none focus:border-emerald-400" /></Field>
        </ExecutePanel>
      </section>
    </PageShell>
  )
}

// ───────────────────────── قيود فرق عملة ─────────────────────────

type DifferenceRow = {
  account_id: number; account_code: string; account_name: string
  balance: number; base_balance: number; previous_differences: number; evaluated_balance: number; difference: number
}

export function CurrencyDifferenceJournalsPage() {
  const messages = useMessages()
  const [date, setDate] = useState(today())
  const { meta, error } = useMeta(date)
  const [currencyId, setCurrencyId] = useState<number | null>(null)
  const [rate, setRate] = useState("")
  const [differenceAccountId, setDifferenceAccountId] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [rows, setRows] = useState<DifferenceRow[]>([])
  const [calculatedFor, setCalculatedFor] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [journals, setJournals] = useState<Journal[]>([])
  const selection = useSelection(rows, (row) => String(row.account_id))
  useEffect(() => { if (error) messages.show("error", error) }, [error, messages])
  useEffect(() => { const value = meta.currencies.find((currency) => currency.id === currencyId)?.rate; setRate(value ? String(value) : "") }, [currencyId, meta.currencies])

  const currencyCode = meta.currencies.find((currency) => currency.id === currencyId)?.currency_code || ""
  const inputsKey = `${date}|${currencyId}|${rate}`
  const load = useCallback(async () => {
    messages.clear()
    if (!currencyId) return messages.show("error", "خطأ. الرجاء اختيار العملة أولا")
    if (!(Number(rate) > 0)) return messages.show("error", "خطأ. الرجاء ادخال سعر الصرف")
    setLoading(true)
    try {
      const params = new URLSearchParams({ date, currency_id: String(currencyId), rate })
      const response = await fetch(`/api/auto-journals/currency-difference?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر احتساب فرق العملة")
      setRows(data.rows || [])
      setCalculatedFor(`${date}|${currencyId}|${rate}`)
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر احتساب فرق العملة")
    } finally {
      setLoading(false)
    }
  }, [currencyId, date, messages, rate])

  const totals = selection.selectedRows.reduce((sum, row) => ({ profit: sum.profit + Math.max(0, row.difference), loss: sum.loss + Math.min(0, row.difference) }), { profit: 0, loss: 0 })
  const stale = rows.length > 0 && calculatedFor !== inputsKey
  const execute = async () => {
    messages.clear()
    if (stale) return messages.show("error", "تغيّر التاريخ أو العملة أو سعر الصرف — أعد الاحتساب قبل التنفيذ")
    if (!differenceAccountId) return messages.show("error", "خطأ. الرجاء اختيار حساب فرق العملة أولا")
    if (!selection.selectedRows.length) return messages.show("error", "اختر حساباً واحداً على الأقل")
    setSaving(true)
    try {
      const data = await postJson("/api/auto-journals/currency-difference", {
        vch_date: date, currency_id: currencyId, rate: Number(rate), difference_account_id: differenceAccountId, note,
        account_ids: selection.selectedRows.map((row) => row.account_id),
      })
      messages.show("success", data.message)
      setJournals(data.journal_vouchers || [])
      await load()
    } catch (e) {
      messages.show("error", e instanceof Error ? e.message : "تعذر تنفيذ القيود")
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title="قيود فرق عملة"
      description="إعادة تقييم أرصدة حسابات الميزانية الخاضعة لفرق العملة بسعر صرف جديد، وإثبات الفرق ربحاً أو خسارة على حساب فرق العملة."
      icon={Scale}
      gradient="from-fuchsia-700 via-purple-700 to-indigo-800"
      messagesRef={messages.ref}
      stat={<div className="rounded-2xl bg-black/15 px-5 py-3 text-center backdrop-blur"><small className="text-white/70">صافي الفرق</small><p className="text-2xl font-black" dir="ltr">{fmt(totals.profit + totals.loss)}</p></div>}
    >
      <section className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="احتساب فرق العملة لغاية"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="العملة"><CurrencySelect currencies={meta.currencies} value={currencyId} onChange={setCurrencyId} exclude={meta.base_currency_id} /></Field>
          <Field label="سعر الصرف"><Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} dir="ltr" /></Field>
          <div className="flex items-end"><Button onClick={() => void load()} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}تنفيذ أولي</Button></div>
        </div>
        {stale && <p className="mt-3 rounded-xl bg-amber-50 p-2 text-sm text-amber-800">تغيّرت المدخلات بعد الاحتساب — أعد الاحتساب قبل التنفيذ.</p>}
      </section>
      <section className="grid min-h-[460px] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SelectableTable
          title={`فرق العملة ${currencyCode}`} hint="حسابات الميزانية الخاضعة لفرق العملة التي لها حركات بهذه العملة. القيم بعملة الأساس عدا الرصيد."
          rows={rows} keyOf={(row) => String(row.account_id)} selection={selection} loading={loading} empty="اختر العملة وسعر الصرف ثم اضغط تنفيذ أولي"
          columns={[
            { header: "الحساب", cell: (row) => <><b className="font-mono">{row.account_code}</b> {row.account_name}</> },
            { header: `الرصيد ${currencyCode}`, cell: (row) => <span dir="ltr">{fmt(row.balance)}</span> },
            { header: "الرصيد بعملة الأساس", cell: (row) => <span dir="ltr">{fmt(row.base_balance)}</span> },
            { header: "فروقات سابقة", cell: (row) => <span dir="ltr">{fmt(row.previous_differences)}</span> },
            { header: "الرصيد مقيّم", cell: (row) => <span dir="ltr">{fmt(row.evaluated_balance)}</span> },
            { header: "ربح", cell: (row) => row.difference > 0 ? <span className="font-black text-emerald-700" dir="ltr">{fmt(row.difference)}</span> : "" },
            { header: "خسارة", cell: (row) => row.difference < 0 ? <span className="font-black text-rose-700" dir="ltr">{fmt(Math.abs(row.difference))}</span> : "" },
          ]}
        />
        <ExecutePanel
          title="تنفيذ قيود فرق العملة" subtitle="قيد بعملة الأساس لكل حساب" saving={saving} disabled={!selection.selectedRows.length || stale}
          onExecute={() => void execute()} journals={journals}
          footer="ربح: مدين الحساب / دائن حساب فرق العملة. خسارة: العكس. القيود السابقة لنفس العملة تُطرح تلقائياً فلا يتكرر الفرق."
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/[.07] p-3"><small className="text-slate-400">ربح</small><p className="text-lg font-black text-emerald-300">{fmt(totals.profit)}</p></div>
            <div className="rounded-2xl bg-white/[.07] p-3"><small className="text-slate-400">خسارة</small><p className="text-lg font-black text-rose-300">{fmt(Math.abs(totals.loss))}</p></div>
          </div>
          <AccountPicker label="حساب فرق العملة" accounts={meta.accounts} value={differenceAccountId} onChange={setDifferenceAccountId} dark />
          <Field label="ملاحظة"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="فرق عملة حساب" className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-sm outline-none focus:border-emerald-400" /></Field>
        </ExecutePanel>
      </section>
    </PageShell>
  )
}
