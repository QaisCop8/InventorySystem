"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileSearch, Loader2, Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import {
  SearchDialogHeader,
  SearchFilterField,
  SearchResultsTable,
  searchInputClassName,
  useEnterAsTabFilters,
  type SearchResultsTableHandle,
} from "@/components/common/search-dialog-kit"
import { cn } from "@/lib/utils"

// بحث السندات — زر البحث بجانب "رقم السند" بكل الحركات. فلاتر: من/إلى تاريخ، الحالة (مسودة/مرحل/ملغي)،
// رقم السند، الحساب/العميل، المستودع (سندات المخزون)، المبلغ والبيان. Enter كـTab بين الفلاتر، ومن آخر
// فلتر يُبحث ويُنتقل لأول نتيجة، وEnter على النتيجة يعرض السند (onSelect).

type VoucherSearchRow = {
  id: number
  vch_code: string
  vch_date: string
  status: number
  amount: number | null
  note: string | null
  manual_voucher: string | null
  currency_code: string | null
  branch_name: string | null
  book_name: string | null
  party_name: string | null
  party_code: string | null
  store_name: string | null
}

const STATUS_OPTIONS = [
  { value: 1, label: "مسودة", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  { value: 2, label: "مرحل", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { value: 3, label: "ملغي", className: "bg-rose-100 text-rose-700 ring-rose-200" },
] as const
const STOCK_TYPES = new Set([8, 9, 10, 11])

const pad = (value: number) => String(value).padStart(2, "0")
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const today = () => localDate(new Date())
const monthStart = () => { const d = new Date(); return localDate(new Date(d.getFullYear(), d.getMonth(), 1)) }
const yearStart = () => `${new Date().getFullYear()}-01-01`
const money = (value: number | null) => (value == null ? "—" : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const emptyFilters = () => ({
  fromDate: monthStart(),
  toDate: today(),
  statuses: [1, 2] as number[],
  code: "",
  accountId: "",
  warehouseId: "",
  amountFrom: "",
  amountTo: "",
  note: "",
})

export function VoucherSearchDialog({ open, onOpenChange, vchType, title, accountLabel = "الحساب / العميل", onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vchType: number
  title: string
  accountLabel?: string
  onSelect: (voucherId: number) => void
}) {
  const [filters, setFilters] = useState(emptyFilters)
  const [rows, setRows] = useState<VoucherSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [active, setActive] = useState<VoucherSearchRow | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: number; warehouse_name: string }[]>([])
  const filterContainerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<SearchResultsTableHandle | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const isStock = STOCK_TYPES.has(Number(vchType))

  const search = useCallback(async (focusResults = false) => {
    const current = filtersRef.current
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams({ vch_type: String(vchType), statuses: current.statuses.join(",") })
      if (current.fromDate) query.set("from_date", current.fromDate)
      if (current.toDate) query.set("to_date", current.toDate)
      if (current.code.trim()) query.set("code", current.code.trim())
      if (current.accountId) query.set("account_id", current.accountId)
      if (current.warehouseId) query.set("warehouse_id", current.warehouseId)
      if (current.amountFrom.trim()) query.set("amount_from", current.amountFrom.trim())
      if (current.amountTo.trim()) query.set("amount_to", current.amountTo.trim())
      if (current.note.trim()) query.set("note", current.note.trim())
      const response = await fetch(`/api/transaction-search?${query}`, { cache: "no-store" })
      const data = await response.json().catch(() => [])
      if (!response.ok) throw new Error(data?.error || "تعذر البحث في السندات")
      setRows(Array.isArray(data) ? data : [])
      setActive(null)
      if (focusResults) window.setTimeout(() => resultsRef.current?.focusFirstRow(), 30)
    } catch (reason) {
      setRows([])
      setError(reason instanceof Error ? reason.message : "تعذر البحث في السندات")
    } finally {
      setLoading(false)
    }
  }, [vchType])

  useEffect(() => {
    if (!open) return
    setFilters(emptyFilters())
    filtersRef.current = emptyFilters()
    void search()
    if (isStock && !warehouses.length) {
      fetch("/api/warehouses").then((r) => (r.ok ? r.json() : [])).then((data) => setWarehouses(Array.isArray(data) ? data : [])).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vchType])

  useEnterAsTabFilters(open, filterContainerRef, () => void search(true))

  const patch = (changes: Partial<ReturnType<typeof emptyFilters>>) => setFilters((current) => ({ ...current, ...changes }))
  const toggleStatus = (value: number) =>
    patch({ statuses: filters.statuses.includes(value) ? filters.statuses.filter((s) => s !== value) : [...filters.statuses, value].sort() })

  const pick = (row: VoucherSearchRow) => {
    onSelect(Number(row.id))
    onOpenChange(false)
  }

  const rangeChip = (label: string, from: string) => (
    <button type="button" tabIndex={-1} onClick={() => patch({ fromDate: from, toDate: today() })}
      className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition", filters.fromDate === from && filters.toDate === today() ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        dir="rtl"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0 shadow-2xl sm:h-[min(88dvh,780px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-2xl sm:ring-1 sm:ring-slate-900/10"
        onOpenAutoFocus={(event) => { event.preventDefault(); codeInputRef.current?.focus() }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{`بحث ${title}`}</DialogTitle>
        <SearchDialogHeader
          icon={<FileSearch className="h-4 w-4" />}
          title={`بحث ${title}`}
          subtitle="Enter للتنقل بين الفلاتر ثم للنتائج • ↑↓ للتنقل • Enter لعرض السند"
          count={rows.length}
          onClose={() => onOpenChange(false)}
        />

        <div ref={filterContainerRef} className="shrink-0 space-y-3 border-b bg-white px-4 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <SearchFilterField label="رقم السند / اليدوي">
              <Input ref={codeInputRef} value={filters.code} onChange={(e) => patch({ code: e.target.value })} className={searchInputClassName} dir="ltr" placeholder="مثال: R0001" />
            </SearchFilterField>
            <SearchFilterField label="من تاريخ">
              <Input type="date" value={filters.fromDate} onChange={(e) => patch({ fromDate: e.target.value })} className={searchInputClassName} />
            </SearchFilterField>
            <SearchFilterField label="إلى تاريخ">
              <Input type="date" value={filters.toDate} onChange={(e) => patch({ toDate: e.target.value })} className={searchInputClassName} />
            </SearchFilterField>
            <SearchFilterField label={accountLabel} className="col-span-2 md:col-span-1 xl:col-span-2">
              <AutoCompleteAccount
                label=""
                value={filters.accountId}
                valueMode="id"
                onValueChange={(value) => patch({ accountId: String(value || "") })}
                onAccountSelect={(account) => patch({ accountId: account ? String(account.id) : "" })}
                showCostCenterButton={false}
                showCostCenterDialog={false}
                leafOnly={false}
                placeholder="رقم الحساب أو البحث"
                inputClassName="h-9"
              />
            </SearchFilterField>
            {isStock && (
              <SearchFilterField label="المستودع">
                <select value={filters.warehouseId} onChange={(e) => patch({ warehouseId: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-sm">
                  <option value="">الكل</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name}</option>)}
                </select>
              </SearchFilterField>
            )}
            <SearchFilterField label="المبلغ من">
              <Input value={filters.amountFrom} onChange={(e) => patch({ amountFrom: e.target.value })} inputMode="decimal" className={searchInputClassName} dir="ltr" />
            </SearchFilterField>
            <SearchFilterField label="المبلغ إلى">
              <Input value={filters.amountTo} onChange={(e) => patch({ amountTo: e.target.value })} inputMode="decimal" className={searchInputClassName} dir="ltr" />
            </SearchFilterField>
            <SearchFilterField label="البيان" className="col-span-2 md:col-span-2">
              <Input value={filters.note} onChange={(e) => patch({ note: e.target.value })} className={searchInputClassName} placeholder="بحث في بيان السند" />
            </SearchFilterField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">الحالة:</span>
              {STATUS_OPTIONS.map((option) => {
                const on = filters.statuses.includes(option.value)
                return (
                  <button key={option.value} type="button" tabIndex={-1} onClick={() => toggleStatus(option.value)}
                    className={cn("rounded-full px-3 py-1 text-xs font-bold ring-1 transition", on ? option.className : "bg-white text-slate-400 ring-slate-200 line-through")}>
                    {option.label}
                  </button>
                )
              })}
              <span className="mx-1 h-4 w-px bg-slate-200" />
              {rangeChip("اليوم", today())}
              {rangeChip("هذا الشهر", monthStart())}
              {rangeChip("هذه السنة", yearStart())}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" tabIndex={-1} className="h-8 rounded-lg" onClick={() => { const next = emptyFilters(); setFilters(next); filtersRef.current = next; void search() }}>
                تفريغ الفلاتر
              </Button>
              <Button type="button" size="sm" className="h-8 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700" onClick={() => void search(true)} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                بحث
              </Button>
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 p-3">
          <SearchResultsTable<VoucherSearchRow>
            ref={resultsRef}
            rows={rows}
            getRowKey={(row) => row.id}
            onPick={(row) => pick(row)}
            onActiveChange={(row) => setActive(row)}
            emptyText={loading ? "جاري البحث..." : "لا توجد سندات مطابقة للفلاتر"}
            className="h-full"
            columns={[
              { key: "vch_code", header: "رقم السند", width: "130px", className: "font-mono text-xs font-bold text-emerald-700", render: (row) => row.vch_code },
              { key: "vch_date", header: "التاريخ", width: "100px", className: "font-mono text-xs", render: (row) => String(row.vch_date || "").slice(0, 10) },
              {
                key: "status", header: "الحالة", width: "80px", align: "center",
                render: (row) => {
                  const option = STATUS_OPTIONS.find((item) => item.value === Number(row.status)) || STATUS_OPTIONS[0]
                  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", option.className)}>{option.label}</span>
                },
              },
              { key: "party_name", header: isStock ? "المستودع" : accountLabel, className: "max-w-[260px] truncate font-semibold text-slate-800", render: (row) => (isStock ? row.store_name : row.party_name) || "—" },
              { key: "amount", header: "المبلغ", width: "120px", align: "end", className: "font-mono text-xs font-bold tabular-nums", render: (row) => money(row.amount) },
              { key: "currency_code", header: "العملة", width: "60px", align: "center", className: "text-xs text-slate-500", render: (row) => row.currency_code || "—" },
              { key: "book_name", header: "الدفتر", width: "70px", align: "center", className: "text-xs text-slate-500", render: (row) => row.book_name || "—" },
              { key: "note", header: "البيان", className: "max-w-[240px] truncate text-xs text-slate-500", render: (row) => row.note || row.manual_voucher || "" },
            ]}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-4 py-2.5">
          <span className="text-[11px] text-slate-500">{rows.length >= 500 ? "تُعرض أول 500 نتيجة — ضيّق الفلاتر" : `${rows.length} سند`}</span>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 rounded-lg" onClick={() => onOpenChange(false)}>إغلاق</Button>
            <Button className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700" disabled={!active} onClick={() => active && pick(active)}>عرض السند</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** زر البحث بجانب حقل "رقم السند" — يفتح VoucherSearchDialog. */
export function VoucherSearchButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="بحث السندات"
      aria-label="بحث السندات"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
    >
      <Search className="h-4 w-4" />
    </button>
  )
}
