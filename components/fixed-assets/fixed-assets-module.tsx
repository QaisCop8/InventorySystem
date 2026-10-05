"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  ArrowLeftRight, Boxes, Calculator, FileBarChart, FileInput, FolderTree, Landmark, LayoutDashboard, Loader2, MapPin, Plus, RefreshCw, Search,
} from "lucide-react"
import { ASSET_STATUSES, TRANSACTION_TYPES } from "@/lib/fixed-assets/constants"
import { AssetDialog } from "./asset-dialog"
import { DepreciationRuns } from "./depreciation-runs"
import { InvoiceCapitalizeDialog } from "./invoice-capitalize"
import { FixedAssetReports } from "./reports"
import { CategoriesSetup, LocationsSetup } from "./setup"
import {
  api, CsvButton, DataTable, day, emptyLookups, exportCsv, Field, money, n, recordOptions, SectionCard, Select, Stat, StatusBadge, thisPeriod, today,
  toOptions, transactionLabel, type Column, type Lookups, type Row,
} from "./shared"

type View = "dashboard" | "assets" | "transactions" | "depreciation" | "reports" | "categories" | "locations"

const NAV: { key: View; label: string; icon: JSX.Element; group?: string }[] = [
  { key: "dashboard", label: "لوحة المعلومات", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "assets", label: "سجل الأصول", icon: <Boxes className="h-4 w-4" /> },
  { key: "transactions", label: "الحركات", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { key: "depreciation", label: "الإهلاك", icon: <Calculator className="h-4 w-4" /> },
  { key: "reports", label: "التقارير", icon: <FileBarChart className="h-4 w-4" /> },
  { key: "categories", label: "التصنيفات والحسابات", icon: <FolderTree className="h-4 w-4" />, group: "الإعداد" },
  { key: "locations", label: "المواقع", icon: <MapPin className="h-4 w-4" />, group: "الإعداد" },
]

export default function FixedAssetsModule() {
  const { toast } = useToast()
  const [view, setView] = useState<View>("dashboard")
  const [assets, setAssets] = useState<Row[]>([])
  const [lookups, setLookups] = useState<Lookups>(emptyLookups)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [invoiceOpen, setInvoiceOpen] = useState(false)

  const load = useCallback(async () => {
    setError("")
    try {
      const data = await api<{ assets: Row[]; lookups: Lookups }>("/api/fixed-assets?lookups=1")
      setAssets(data.assets)
      setLookups(data.lookups)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الأصول الثابتة")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const changed = (message?: string) => {
    if (message) toast({ title: message })
    void load()
  }

  const openAsset = (id: number | null) => setDialog({ open: true, id })
  const setupMissing = !loading && lookups.categories.length === 0

  return <div dir="rtl" className="flex min-h-full flex-col gap-4 bg-slate-50 p-3 sm:p-5 dark:bg-slate-950">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-teal-900 px-5 py-4 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Landmark className="h-6 w-6" /></span>
        <div><h1 className="text-xl font-black">الأصول الثابتة</h1><p className="text-xs text-slate-300">دفتر فرعي مرتبط بالأستاذ العام: الاقتناء، الإهلاك، النقل، الاستبعاد</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20" onClick={() => { setLoading(true); void load() }}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button>
        <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20" disabled={setupMissing} onClick={() => setInvoiceOpen(true)}><FileInput className="ml-2 h-4 w-4" />من فاتورة مشتريات</Button>
        <Button className="bg-teal-500 font-bold text-white hover:bg-teal-400" disabled={setupMissing} onClick={() => openAsset(null)}><Plus className="ml-2 h-4 w-4" />أصل جديد</Button>
      </div>
    </header>

    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900" aria-label="أقسام الأصول الثابتة">
      {NAV.map((item, index) => <span key={item.key} className="flex shrink-0 items-center">
        {item.group && NAV[index - 1]?.group !== item.group && <span className="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />}
        <button type="button" onClick={() => setView(item.key)} aria-pressed={view === item.key}
          className={cn("flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition", view === item.key ? "bg-slate-900 text-white shadow dark:bg-teal-700" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>
          {item.icon}{item.label}
        </button>
      </span>)}
    </nav>

    {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
    {setupMissing && view !== "categories" && <Alert className="border-amber-200 bg-amber-50 text-amber-800"><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
      ابدأ بتعريف تصنيفات الأصول وربطها بالحسابات (حساب الأصل، الإهلاك المتراكم، مصروف الإهلاك).
      <Button size="sm" onClick={() => setView("categories")}>تعريف التصنيفات</Button>
    </AlertDescription></Alert>}

    {loading ? <div className="grid h-64 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div> : <>
      {view === "dashboard" && <Dashboard onOpenAsset={openAsset} onNavigate={setView} />}
      {view === "assets" && <AssetList assets={assets} lookups={lookups} onOpen={openAsset} />}
      {view === "transactions" && <TransactionLog lookups={lookups} />}
      {view === "depreciation" && <DepreciationRuns lookups={lookups} onChanged={message => changed(message)} />}
      {view === "reports" && <FixedAssetReports lookups={lookups} />}
      {view === "categories" && <CategoriesSetup lookups={lookups} onChanged={message => changed(message)} />}
      {view === "locations" && <LocationsSetup lookups={lookups} onChanged={message => changed(message)} />}
    </>}

    <AssetDialog open={dialog.open} assetId={dialog.id} assets={assets} lookups={lookups}
      onClose={() => setDialog({ open: false, id: null })} onChanged={message => changed(message)} onNavigate={id => setDialog({ open: true, id })} />
    <InvoiceCapitalizeDialog open={invoiceOpen} lookups={lookups} onClose={() => setInvoiceOpen(false)}
      onDone={message => { setInvoiceOpen(false); changed(message); setView("assets") }} />
  </div>
}

function Dashboard({ onOpenAsset, onNavigate }: { onOpenAsset: (id: number) => void; onNavigate: (view: View) => void }) {
  const [data, setData] = useState<Row | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    api<Row>(`/api/fixed-assets/reports?type=dashboard&period=${thisPeriod()}`).then(setData).catch(reason => setError(reason instanceof Error ? reason.message : "تعذر التحميل"))
  }, [])
  if (error) return <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>
  if (!data) return <div className="grid h-48 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
  const totals = data.totals ?? {}
  const pending = data.pending ?? {}
  const maxCost = Math.max(1, ...(data.byCategory ?? []).map((row: Row) => n(row.cost)))
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="إجمالي التكلفة" value={money(totals.cost)} tone="slate" hint={`${totals.active ?? 0} فعّال · ${totals.fully_depreciated ?? 0} مهلك بالكامل`} />
      <Stat label="الإهلاك المتراكم" value={money(totals.accumulated)} tone="amber" hint={n(totals.cost) ? `${((n(totals.accumulated) / n(totals.cost)) * 100).toFixed(1)}% من التكلفة` : undefined} />
      <Stat label="صافي القيمة الدفترية" value={money(totals.net_book_value)} tone="teal" />
      <Stat label="إهلاك غير مرحّل حتى هذا الشهر" value={money(pending.amount)} tone={n(pending.amount) ? "rose" : "sky"}
        hint={n(pending.lines) ? <button type="button" className="font-bold text-rose-700 underline" onClick={() => onNavigate("depreciation")}>{pending.assets} أصل منذ {pending.first_period} — تشغيل الإهلاك</button> : "لا يوجد إهلاك متأخر"} />
    </div>
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {(["total", "active", "draft", "suspended", "fully_depreciated", "disposed"] as const).map(key => <div key={key} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[11px] text-slate-500">{key === "total" ? "كل الأصول" : key === "draft" ? "مسودات" : (ASSET_STATUSES as Row)[key.toUpperCase()]}</p>
        <b className="text-lg">{totals[key] ?? 0}</b>
      </div>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="القيمة حسب التصنيف">
        <div className="space-y-3">
          {(data.byCategory ?? []).map((row: Row) => <div key={row.name}>
            <div className="mb-1 flex justify-between text-xs"><b>{row.name} <span className="font-normal text-slate-400">({row.count})</span></b><span dir="ltr">{money(row.net_book_value)} / {money(row.cost)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(n(row.cost) / maxCost) * 100}%` }}>
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${n(row.cost) ? (n(row.net_book_value) / n(row.cost)) * 100 : 0}%` }} />
              </div>
            </div>
          </div>)}
          {!(data.byCategory ?? []).length && <p className="py-8 text-center text-sm text-slate-400">لا توجد أصول مفعّلة بعد</p>}
        </div>
      </SectionCard>
      <SectionCard title="آخر الحركات">
        <DataTable rows={data.recent ?? []} footer={false} maxHeight="320px" columns={[
          { key: "transaction_date", label: "التاريخ", render: row => day(row.transaction_date) },
          { key: "asset_no", label: "الأصل", render: row => <span>{row.asset_no} <small className="text-slate-400">{row.asset_name}</small></span> },
          { key: "transaction_type", label: "النوع", render: row => transactionLabel(row.transaction_type) },
          { key: "amount", label: "المبلغ", numeric: true },
        ]} empty="لا توجد حركات" />
      </SectionCard>
    </div>
  </div>
}

function AssetList({ assets, lookups, onOpen }: { assets: Row[]; lookups: Lookups; onOpen: (id: number) => void }) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [location, setLocation] = useState<number | null>(null)
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return assets.filter(row => (!term || `${row.asset_no} ${row.name} ${row.serial_number ?? ""} ${row.barcode ?? ""}`.toLowerCase().includes(term))
      && (!category || Number(row.category_id) === category) && (!status || row.status === status) && (!location || Number(row.location_id) === location))
  }, [assets, search, category, status, location])
  const columns: Column[] = [
    { key: "asset_no", label: "رقم الأصل", render: row => <b className="font-mono">{row.asset_no}</b>, csv: row => row.asset_no },
    { key: "name", label: "الأصل", render: row => <span>{row.parent_asset_no && <small className="ml-1 rounded bg-violet-100 px-1.5 text-violet-700">مكوّن {row.parent_asset_no}</small>}{row.name}</span>, csv: row => row.name },
    { key: "category_name", label: "التصنيف" },
    { key: "acquisition_date", label: "الاقتناء", render: row => day(row.acquisition_date), csv: row => day(row.acquisition_date) },
    { key: "location_name", label: "الموقع" },
    { key: "cost_center_name", label: "مركز التكلفة" },
    { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} />, csv: row => (ASSET_STATUSES as Row)[row.status] },
    { key: "book_cost", label: "التكلفة", numeric: true, total: true },
    { key: "accumulated_depreciation", label: "المتراكم", numeric: true, total: true },
    { key: "net_book_value", label: "القيمة الدفترية", numeric: true, total: true },
  ]
  return <SectionCard title={`سجل الأصول (${filtered.length})`} actions={<CsvButton onClick={() => exportCsv("fixed-assets", columns, filtered)} disabled={!filtered.length} />}>
    <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="relative"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pr-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="رقم، اسم، رقم تسلسلي، باركود…" /></div>
      <Select id="fa-list-cat" value={category} clearable placeholder="كل التصنيفات" options={toOptions(lookups.categories)} onChange={value => setCategory(value)} />
      <Select id="fa-list-status" value={status} clearable placeholder="كل الحالات" options={recordOptions(ASSET_STATUSES)} onChange={value => setStatus(value)} />
      <Select id="fa-list-loc" value={location} clearable placeholder="كل المواقع" options={toOptions(lookups.locations)} onChange={value => setLocation(value)} />
    </div>
    <DataTable rows={filtered} columns={columns} onRowClick={row => onOpen(Number(row.id))} empty="لا توجد أصول — أضف أصلاً جديداً أو رسمل من فاتورة مشتريات" />
  </SectionCard>
}

function TransactionLog({ lookups }: { lookups: Lookups }) {
  const [filters, setFilters] = useState<Row>({ from: `${today().slice(0, 4)}-01-01`, to: today(), types: null, category_id: null })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const run = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ type: "transactions", from: filters.from, to: filters.to })
      if (filters.types) params.set("types", filters.types)
      if (filters.category_id) params.set("category_id", String(filters.category_id))
      setRows((await api<{ rows: Row[] }>(`/api/fixed-assets/reports?${params}`)).rows)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر التحميل")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void run() }, [])
  const columns: Column[] = [
    { key: "transaction_no", label: "رقم الحركة" },
    { key: "transaction_date", label: "التاريخ", render: row => day(row.transaction_date), csv: row => day(row.transaction_date) },
    { key: "transaction_type", label: "النوع", render: row => transactionLabel(row.transaction_type), csv: row => transactionLabel(row.transaction_type) },
    { key: "asset_no", label: "رقم الأصل" }, { key: "asset_name", label: "الأصل" }, { key: "category_name", label: "التصنيف" },
    { key: "amount", label: "المبلغ", numeric: true, total: true },
    { key: "cost_delta", label: "أثر التكلفة", numeric: true, total: true },
    { key: "accumulated_delta", label: "أثر المتراكم", numeric: true, total: true },
    { key: "journal_code", label: "القيد" }, { key: "notes", label: "ملاحظات" },
  ]
  return <SectionCard title="سجل حركات الأصول" actions={rows ? <CsvButton onClick={() => exportCsv("fixed-asset-transactions", columns, rows)} disabled={!rows.length} /> : null}>
    <div className="mb-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="من" htmlFor="fa-tx-from"><Input id="fa-tx-from" type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></Field>
      <Field label="إلى" htmlFor="fa-tx-to"><Input id="fa-tx-to" type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></Field>
      <Field label="نوع الحركة" htmlFor="fa-tx-type"><Select id="fa-tx-type" value={filters.types} clearable placeholder="كل الأنواع" options={recordOptions(TRANSACTION_TYPES)} onChange={value => setFilters({ ...filters, types: value })} /></Field>
      <Field label="التصنيف" htmlFor="fa-tx-cat"><Select id="fa-tx-cat" value={filters.category_id} clearable placeholder="كل التصنيفات" options={toOptions(lookups.categories)} onChange={value => setFilters({ ...filters, category_id: value })} /></Field>
      <Button onClick={() => void run()} disabled={loading}>{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض</Button>
    </div>
    {error && <Alert variant="destructive" className="mb-3 border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
    <DataTable rows={rows ?? []} columns={columns} empty={loading ? "جاري التحميل…" : "لا توجد حركات"} />
  </SectionCard>
}
