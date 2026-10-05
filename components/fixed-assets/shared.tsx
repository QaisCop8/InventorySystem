"use client"

import { useMemo, type ReactNode } from "react"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ASSET_STATUSES, TRANSACTION_TYPES } from "@/lib/fixed-assets/constants"
import { Download, Inbox } from "lucide-react"

export type Row = Record<string, any>
export type Option = { label: string; value: any }

export type Lookups = {
  categories: Row[]
  locations: Row[]
  accounts: Row[]
  branches: Row[]
  costCenters: Row[]
  departments: Row[]
  currencies: Row[]
  employees: Row[]
}

export const emptyLookups: Lookups = { categories: [], locations: [], accounts: [], branches: [], costCenters: [], departments: [], currencies: [], employees: [] }

export const today = () => new Date().toISOString().slice(0, 10)
export const thisPeriod = () => today().slice(0, 7)
export const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
export const money = (value: unknown) => n(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const day = (value: unknown) => String(value ?? "").slice(0, 10)

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const response = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || "تعذر تنفيذ الطلب")
  return data as T
}

export const toOptions = (rows: Row[], label = (row: Row) => (row.code ? `${row.code} — ${row.name}` : row.name)): Option[] =>
  rows.map(row => ({ label: label(row), value: Number(row.id) }))

export const recordOptions = (record: Record<string, string>): Option[] => Object.entries(record).map(([value, label]) => ({ value, label }))

export function Select({ id, value, options, onChange, placeholder = "—", clearable, disabled, filter }: {
  id: string; value: any; options: Option[]; onChange: (value: any) => void; placeholder?: string; clearable?: boolean; disabled?: boolean; filter?: boolean
}) {
  const large = options.length > 60
  return <PrimeDropdown
    inputId={id}
    value={value ?? null}
    options={options}
    optionLabel="label"
    optionValue="value"
    placeholder={placeholder}
    filter={filter ?? options.length > 8}
    filterInputAutoFocus
    showClear={clearable}
    disabled={disabled}
    virtualScrollerOptions={large ? { itemSize: 36 } : undefined}
    className="invoice-currency-dropdown w-full"
    panelClassName="invoice-currency-dropdown-panel customer-popup-dropdown-panel"
    appendTo="self"
    onChange={(event: any) => onChange(event.value ?? null)}
  />
}

export function Field({ label, htmlFor, children, hint, className, required }: { label: string; htmlFor?: string; children: ReactNode; hint?: string; className?: string; required?: boolean }) {
  return <div className={cn("grid min-w-0 gap-1.5", className)}>
    <Label htmlFor={htmlFor} className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}{required && <span className="text-rose-500"> *</span>}</Label>
    {children}
    {hint && <p className="text-[11px] leading-5 text-slate-500">{hint}</p>}
  </div>
}

export function NumberField({ id, value, onChange, min, step = "any", disabled }: { id: string; value: any; onChange: (value: string) => void; min?: number; step?: string; disabled?: boolean }) {
  return <Input id={id} type="number" dir="ltr" className="text-right" min={min} step={step} value={value ?? ""} disabled={disabled} onChange={event => onChange(event.target.value)} />
}

const STATUS_TONES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  UNDER_CONSTRUCTION: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  FULLY_DEPRECIATED: "bg-sky-100 text-sky-700",
  DISPOSED: "bg-rose-100 text-rose-700",
  POSTED: "bg-emerald-100 text-emerald-700",
  PLANNED: "bg-slate-100 text-slate-600",
  REVERSED: "bg-rose-100 text-rose-700",
}

export function StatusBadge({ status }: { status: string }) {
  const label = (ASSET_STATUSES as Record<string, string>)[status] ?? ({ POSTED: "مرحّل", PLANNED: "مخطط", REVERSED: "معكوس" } as Record<string, string>)[status] ?? status
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold", STATUS_TONES[status] ?? "bg-slate-100 text-slate-600")}>{label}</span>
}

export const transactionLabel = (type: string) => (TRANSACTION_TYPES as Record<string, string>)[type] ?? type

export function Stat({ label, value, hint, tone = "slate", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "slate" | "teal" | "amber" | "rose" | "sky" | "violet"; icon?: ReactNode }) {
  const tones = {
    slate: "from-slate-50 to-white text-slate-700",
    teal: "from-teal-50 to-white text-teal-700",
    amber: "from-amber-50 to-white text-amber-700",
    rose: "from-rose-50 to-white text-rose-700",
    sky: "from-sky-50 to-white text-sky-700",
    violet: "from-violet-50 to-white text-violet-700",
  }
  return <div className={cn("rounded-2xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900", tones[tone])}>
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-500">{label}</span>{icon}</div>
    <div className="mt-2 text-2xl font-black tabular-nums" dir="ltr">{value}</div>
    {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
  </div>
}

export type Column = { key: string; label: string; numeric?: boolean; render?: (row: Row) => ReactNode; total?: boolean; csv?: (row: Row) => unknown }

export function DataTable({ columns, rows, onRowClick, empty = "لا توجد بيانات", maxHeight = "calc(100dvh - 320px)", footer = true, selectedId }: {
  columns: Column[]; rows: Row[]; onRowClick?: (row: Row) => void; empty?: string; maxHeight?: string; footer?: boolean; selectedId?: unknown
}) {
  const totals = useMemo(() => Object.fromEntries(columns.filter(column => column.total).map(column => [column.key, rows.reduce((sum, row) => sum + n(column.csv ? column.csv(row) : row[column.key]), 0)])), [columns, rows])
  const hasTotals = footer && columns.some(column => column.total) && rows.length > 0
  return <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800" style={{ maxHeight }}>
    <table className="w-full min-w-max text-sm">
      <thead className="sticky top-0 z-10 bg-slate-800 text-white dark:bg-slate-950">
        <tr>{columns.map(column => <th key={column.key} className={cn("whitespace-nowrap px-3 py-2.5 text-xs font-bold", column.numeric ? "text-left" : "text-right")}>{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => <tr key={row.id ?? index} onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn("border-b border-slate-100 transition dark:border-slate-800", index % 2 && "bg-slate-50/60 dark:bg-slate-900/40", onRowClick && "cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/30", selectedId != null && row.id === selectedId && "!bg-teal-100 dark:!bg-teal-900/40")}>
          {columns.map(column => <td key={column.key} className={cn("whitespace-nowrap px-3 py-2", column.numeric && "text-left font-mono tabular-nums")} dir={column.numeric ? "ltr" : undefined}>
            {column.render ? column.render(row) : column.numeric ? money(row[column.key]) : row[column.key] ?? ""}
          </td>)}
        </tr>)}
        {!rows.length && <tr><td colSpan={columns.length} className="py-14 text-center text-slate-400"><Inbox className="mx-auto mb-2 h-8 w-8" />{empty}</td></tr>}
      </tbody>
      {hasTotals && <tfoot className="sticky bottom-0 bg-slate-100 font-black dark:bg-slate-800">
        <tr>{columns.map((column, index) => <td key={column.key} className={cn("whitespace-nowrap px-3 py-2", column.numeric && "text-left font-mono tabular-nums")} dir={column.numeric ? "ltr" : undefined}>
          {column.total ? money(totals[column.key]) : index === 0 ? `الإجمالي (${rows.length})` : ""}
        </td>)}</tr>
      </tfoot>}
    </table>
  </div>
}

export function exportCsv(fileName: string, columns: Column[], rows: Row[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
  const lines = [columns.map(column => escape(column.label)).join(","), ...rows.map(row => columns.map(column => escape(column.csv ? column.csv(row) : row[column.key])).join(","))]
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${fileName}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function CsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
    <Download className="h-4 w-4" />تصدير
  </button>
}

export function SectionCard({ title, icon, actions, children, className }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-black">{icon && <span className="rounded-lg bg-teal-50 p-1.5 text-teal-700 dark:bg-teal-950 dark:text-teal-300">{icon}</span>}{title}</h3>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
}
