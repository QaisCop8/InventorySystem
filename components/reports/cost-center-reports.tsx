"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { voucherHref } from "@/lib/voucher-links"
import { COST_CENTER_REPORTS, type CostCenterReportKind } from "@/lib/cost-center-reports"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, FileBarChart, Loader2, Network, Printer, RefreshCcw, Search } from "lucide-react"

// تقارير مراكز التكلفة العشرة بواجهة واحدة — الفلاتر والعرض حسب نوع التقرير (الحساب في
// app/api/reports/cost-centers/route.ts).

type Meta = { accounts: ReportOption[]; currencies: ReportOption[]; branches: ReportOption[]; cost_types: { id: number; name: string }[]; cost_centers: { id: number; name: string; cost_type_id: number; level: number }[] }
type StatementGroup = { title: string; opening: number; closing: number; debit: number; credit: number; rows: any[] }
type TrialRow = { id: number; code: string; name: string; level: number; opening: number; debit: number; credit: number; balance: number; details: TrialRow[] }
type PivotRow = { id: number; account_code: string; account_name: string; side: string | null; values: Record<number, number>; total: number }
type Result =
  | { shape: "statement"; groups: StatementGroup[] }
  | { shape: "lines"; rows: any[] }
  | { shape: "trial"; rows: TrialRow[] }
  | { shape: "pivot"; columns: { id: number; name: string }[]; rows: PivotRow[] }

const emptyMeta: Meta = { accounts: [], currencies: [], branches: [], cost_types: [], cost_centers: [] }
const today = () => new Date().toISOString().slice(0, 10)
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (value: number) => money.format(Number(value || 0))
const th = "whitespace-nowrap px-3 py-3 text-right text-xs"
const num = "px-3 py-2.5 tabular-nums"

export function CostCenterReport({ kind }: { kind: CostCenterReportKind }) {
  const definition = COST_CENTER_REPORTS[kind]
  const isStatement = kind === "statement-with-cc" || kind === "statement-by-cc"
  const isIncome = kind === "income-statement-cc" || kind === "income-statement-by-cc"
  const isBalanceSheet = kind === "balance-sheet-cc" || kind === "balance-sheet-by-cc"
  const isTrial = definition.shape === "trial"
  const needsCenters = kind !== "statement-with-cc" && kind !== "transactions-with-cc"
  const requiresCenterSelection = kind === "statement-by-cc" || kind === "income-statement-by-cc" || kind === "balance-sheet-by-cc"
  const showsAccountsFilter = isStatement || kind === "transactions-with-cc" || kind === "accounts-movement-cc" || kind === "trial-balance-accounts" || kind === "trial-balance-cc"
  const showsAccountLevel = definition.shape === "pivot" || kind === "trial-balance-accounts" || kind === "trial-balance-cc"

  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({
    fromDate: `${today().slice(0, 4)}-01-01`, toDate: today(), currencyId: 0, branchIds: [] as number[], status: "all",
    costTypeId: 0, centerIds: [] as number[], accountIds: [] as number[], level: "0", costLevel: "0", financialList: "0",
    showDetails: false, grouped: false,
  })
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/cost-centers?kind=${kind}&meta=1`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
        const next: Meta = { ...emptyMeta, ...(data.meta || {}) }
        setMeta(next)
        setFilters((current) => ({ ...current, currencyId: Number(next.currencies[0]?.id || 0), costTypeId: Number(next.cost_types[0]?.id || 0) }))
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير"))
      .finally(() => setLoading(false))
  }, [kind])

  const centersOfType = useMemo(
    () => meta.cost_centers.filter((center) => !filters.costTypeId || Number(center.cost_type_id) === filters.costTypeId).map((center) => ({ id: center.id, name: center.name })),
    [meta.cost_centers, filters.costTypeId],
  )

  const run = async () => {
    if (needsCenters && !filters.costTypeId && !filters.centerIds.length) { setError("اختر نوع مركز التكلفة"); return }
    if (requiresCenterSelection && !filters.centerIds.length) { setError("يجب اختيار مركز تكلفة واحد على الأقل"); return }
    if (isStatement && !filters.accountIds.length) { setError("اختر حساباً واحداً على الأقل"); return }
    setRunning(true)
    setError("")
    try {
      const params = new URLSearchParams({ kind, from_date: filters.fromDate, to_date: filters.toDate, report_currency_id: String(filters.currencyId), status: filters.status })
      if (filters.costTypeId) params.set("cost_type_id", String(filters.costTypeId))
      if (filters.centerIds.length) params.set("cost_center_ids", filters.centerIds.join(","))
      if (filters.accountIds.length) params.set("account_ids", filters.accountIds.join(","))
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (Number(filters.level) > 0) params.set("level", filters.level)
      if (Number(filters.costLevel) > 0) params.set("cost_level", filters.costLevel)
      if (kind === "accounts-movement-cc") params.set("financial_list", filters.financialList)
      if (filters.showDetails) params.set("show_details", "1")
      if (filters.grouped) params.set("grouped", "1")
      const response = await fetch(`/api/reports/cost-centers?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setResult(data)
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setFilters((current) => ({ ...current, fromDate: `${today().slice(0, 4)}-01-01`, toDate: today(), branchIds: [], status: "all", centerIds: [], accountIds: [], level: "0", costLevel: "0", financialList: "0", showDetails: false, grouped: false }))
    setResult(null)
    setSearch("")
    setError("")
  }

  const term = search.trim().toLowerCase()
  const matches = (...values: unknown[]) => !term || values.some((value) => String(value ?? "").toLowerCase().includes(term))
  const openVoucher = (row: any) => { if (row.voucher_id) window.open(voucherHref(Number(row.voucher_id), Number(row.vch_type || 3), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer") }

  // ── CSV ──
  const exportCsv = () => {
    if (!result) return
    let table: unknown[][] = []
    if (result.shape === "statement") {
      table = [["البيان", "التاريخ", "رقم السند", "نوع السند", "الحساب", "مدين", "دائن", "الرصيد", "مراكز التكلفة", "الملاحظة"]]
      for (const group of result.groups) {
        table.push([group.title, "", "", "رصيد افتتاحي", "", "", "", group.opening, "", ""])
        for (const row of group.rows) table.push(["", row.vch_date, row.vch_code, row.voucher_type_name, `${row.account_code} ${row.account_name}`, row.debit, row.credit, row.balance, row.cost_centers, row.note])
      }
    } else if (result.shape === "lines") {
      table = [["التاريخ", "رقم السند", "نوع السند", "رقم الحساب", "اسم الحساب", "مدين", "دائن", "مراكز التكلفة", "الملاحظة"], ...result.rows.map((row) => [row.vch_date, row.vch_code, row.voucher_type_name, row.account_code, row.account_name, row.debit, row.credit, row.cost_centers, row.note])]
    } else if (result.shape === "trial") {
      table = [["الرقم", "الاسم", "رصيد افتتاحي", "مدين", "دائن", "الرصيد"]]
      for (const row of result.rows) {
        table.push([row.code, row.name, row.opening, row.debit, row.credit, row.balance])
        for (const detail of row.details) table.push([detail.code, `   ${detail.name}`, detail.opening, detail.debit, detail.credit, detail.balance])
      }
    } else {
      table = [["رقم الحساب", "اسم الحساب", ...result.columns.map((column) => column.name), "المجموع"], ...result.rows.map((row) => [row.account_code, row.account_name, ...result.columns.map((column) => row.values[column.id] || 0), row.total])]
    }
    const csv = table.map((values) => values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    link.download = `${definition.title}-${filters.toDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // ── العرض ──
  const renderStatement = (groups: StatementGroup[]) => (
    <table className="w-full min-w-[1000px] text-sm">
      <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
        <tr>{["التاريخ", "رقم السند", "نوع السند", "الحساب", "مدين", "دائن", "الرصيد", "مراكز التكلفة", "الملاحظة"].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const rows = group.rows.filter((row) => matches(row.vch_code, row.account_name, row.cost_centers, row.note))
          return (
            <Fragment key={group.title}>
              <tr className="border-b bg-slate-100/90"><td className="px-3 py-2 font-black" colSpan={6}>{group.title}</td><td className={`${num} font-black`} dir="ltr">{fmt(group.opening)}</td><td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>رصيد افتتاحي</td></tr>
              {rows.map((row) => (
                <tr key={row.line_id} className="cursor-pointer border-b hover:bg-teal-50/60" onDoubleClick={() => openVoucher(row)} title="انقر نقراً مزدوجاً لفتح السند">
                  <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.vch_date}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.vch_code}</td>
                  <td className="px-3 py-2.5 text-xs">{row.voucher_type_name}</td>
                  <td className="px-3 py-2.5 text-xs">{row.account_code} - {row.account_name}</td>
                  <td className={`${num} text-emerald-700`} dir="ltr">{row.debit ? fmt(row.debit) : ""}</td>
                  <td className={`${num} text-rose-700`} dir="ltr">{row.credit ? fmt(row.credit) : ""}</td>
                  <td className={`${num} font-bold`} dir="ltr">{fmt(row.balance)}</td>
                  <td className="px-3 py-2.5 text-xs text-violet-700">{row.cost_centers || "—"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-slate-500">{row.note}</td>
                </tr>
              ))}
              <tr className="border-b-2 border-slate-300 bg-slate-50 font-bold"><td className="px-3 py-2" colSpan={4}>إجمالي {group.title}</td><td className={num} dir="ltr">{fmt(group.debit)}</td><td className={num} dir="ltr">{fmt(group.credit)}</td><td className={num} dir="ltr">{fmt(group.closing)}</td><td colSpan={2} /></tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )

  const renderLines = (rows: any[]) => {
    const visible = rows.filter((row) => matches(row.vch_code, row.account_code, row.account_name, row.cost_centers, row.note))
    return (
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
          <tr>{["التاريخ", "رقم السند", "نوع السند", "رقم الحساب", "اسم الحساب", "مدين", "دائن", "مراكز التكلفة", "الملاحظة"].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.line_id} className="cursor-pointer border-b hover:bg-teal-50/60" onDoubleClick={() => openVoucher(row)} title="انقر نقراً مزدوجاً لفتح السند">
              <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.vch_date}</td>
              <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.vch_code}</td>
              <td className="px-3 py-2.5 text-xs">{row.voucher_type_name}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{row.account_code}</td>
              <td className="px-3 py-2.5 text-xs font-semibold">{row.account_name}</td>
              <td className={`${num} text-emerald-700`} dir="ltr">{row.debit ? fmt(row.debit) : ""}</td>
              <td className={`${num} text-rose-700`} dir="ltr">{row.credit ? fmt(row.credit) : ""}</td>
              <td className="px-3 py-2.5 text-xs text-violet-700">{row.cost_centers || "—"}</td>
              <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-slate-500">{row.note}</td>
            </tr>
          ))}
        </tbody>
        {visible.length > 0 && (
          <tfoot className="sticky bottom-0 bg-slate-100 font-black">
            <tr><td className="px-3 py-3" colSpan={5}>الإجمالي</td><td className={num} dir="ltr">{fmt(visible.reduce((s, r) => s + r.debit, 0))}</td><td className={num} dir="ltr">{fmt(visible.reduce((s, r) => s + r.credit, 0))}</td><td colSpan={2} /></tr>
          </tfoot>
        )}
      </table>
    )
  }

  const renderTrial = (rows: TrialRow[]) => {
    const visible = rows.filter((row) => matches(row.code, row.name) || row.details.some((detail) => matches(detail.code, detail.name)))
    const total = (key: "opening" | "debit" | "credit" | "balance") => visible.reduce((s, r) => s + r[key], 0)
    return (
      <table className="w-full min-w-[820px] text-sm">
        <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
          <tr>{[kind === "trial-balance-cc" ? "مركز التكلفة" : "الحساب", "رصيد افتتاحي", "مدين", "دائن", "الرصيد"].map((label) => <th key={label} className={th}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <Fragment key={row.id}>
              <tr className={`border-b ${row.details.length ? "bg-slate-50 font-bold" : "hover:bg-teal-50/60"}`}>
                <td className="px-3 py-2.5">{row.code && <span className="ml-2 font-mono text-teal-700">{row.code}</span>}{row.name}</td>
                <td className={num} dir="ltr">{fmt(row.opening)}</td>
                <td className={`${num} text-emerald-700`} dir="ltr">{fmt(row.debit)}</td>
                <td className={`${num} text-rose-700`} dir="ltr">{fmt(row.credit)}</td>
                <td className={`${num} font-black`} dir="ltr">{fmt(row.balance)}</td>
              </tr>
              {row.details.map((detail) => (
                <tr key={`${row.id}-${detail.id}`} className="border-b text-xs text-slate-600 hover:bg-teal-50/40">
                  <td className="py-2 pl-3 pr-8">{detail.code && <span className="ml-2 font-mono">{detail.code}</span>}{detail.name}</td>
                  <td className={num} dir="ltr">{fmt(detail.opening)}</td>
                  <td className={num} dir="ltr">{fmt(detail.debit)}</td>
                  <td className={num} dir="ltr">{fmt(detail.credit)}</td>
                  <td className={num} dir="ltr">{fmt(detail.balance)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        {visible.length > 0 && (
          <tfoot className="sticky bottom-0 bg-slate-100 font-black">
            <tr><td className="px-3 py-3">الإجمالي</td><td className={num} dir="ltr">{fmt(total("opening"))}</td><td className={num} dir="ltr">{fmt(total("debit"))}</td><td className={num} dir="ltr">{fmt(total("credit"))}</td><td className={num} dir="ltr">{fmt(total("balance"))}</td></tr>
          </tfoot>
        )}
      </table>
    )
  }

  const renderPivot = (columns: { id: number; name: string }[], rows: PivotRow[]) => {
    const visible = rows.filter((row) => matches(row.account_code, row.account_name))
    const sumOf = (list: PivotRow[], id: number | "total") => list.reduce((s, row) => s + (id === "total" ? row.total : row.values[id] || 0), 0)
    const header = (
      <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
        <tr><th className={th}>رقم الحساب</th><th className={th}>اسم الحساب</th>{columns.map((column) => <th key={column.id} className={th}>{column.name}</th>)}{columns.length > 1 && <th className={th}>المجموع</th>}</tr>
      </thead>
    )
    // sign = 1 يعرض الصافي (مدين − دائن) كما هو، −1 يعكسه (الإيرادات والخصوم تُعرض موجبة)
    const bodyRows = (list: PivotRow[], sign: 1 | -1) => list.map((row) => (
      <tr key={row.id} className="border-b hover:bg-teal-50/60">
        <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.account_code}</td>
        <td className="px-3 py-2.5 font-semibold">{row.account_name}</td>
        {columns.map((column) => <td key={column.id} className={num} dir="ltr">{row.values[column.id] ? fmt(sign * row.values[column.id]) : "—"}</td>)}
        {columns.length > 1 && <td className={`${num} font-black`} dir="ltr">{fmt(sign * row.total)}</td>}
      </tr>
    ))
    const totalRow = (label: string, list: PivotRow[], sign: 1 | -1, tone = "bg-slate-100") => (
      <tr className={`border-b font-black ${tone}`}>
        <td className="px-3 py-2.5" colSpan={2}>{label}</td>
        {columns.map((column) => <td key={column.id} className={num} dir="ltr">{fmt(sign * sumOf(list, column.id))}</td>)}
        {columns.length > 1 && <td className={num} dir="ltr">{fmt(sign * sumOf(list, "total"))}</td>}
      </tr>
    )
    const sectionRow = (label: string) => <tr className="bg-white"><td className="px-3 pb-1 pt-4 text-sm font-black text-teal-800" colSpan={columns.length + 3}>{label}</td></tr>

    if (isIncome) {
      const revenue = visible.filter((row) => row.total < 0)
      const expenses = visible.filter((row) => row.total >= 0)
      return (
        <table className="w-full min-w-[820px] text-sm">{header}<tbody>
          {sectionRow("الإيرادات")}{bodyRows(revenue, -1)}{totalRow("إجمالي الإيرادات", revenue, -1)}
          {sectionRow("المصروفات")}{bodyRows(expenses, 1)}{totalRow("إجمالي المصروفات", expenses, 1)}
          {totalRow("صافي الربح / (الخسارة)", visible, -1, "bg-emerald-100 text-emerald-900")}
        </tbody></table>
      )
    }
    if (isBalanceSheet) {
      const assets = visible.filter((row) => row.side === "assets" || (row.side == null && row.total >= 0))
      const liabilities = visible.filter((row) => !assets.includes(row))
      return (
        <table className="w-full min-w-[820px] text-sm">{header}<tbody>
          {sectionRow("الأصول")}{bodyRows(assets, 1)}{totalRow("إجمالي الأصول", assets, 1)}
          {sectionRow("الخصوم وحقوق الملكية")}{bodyRows(liabilities, -1)}{totalRow("إجمالي الخصوم وحقوق الملكية", liabilities, -1)}
          {totalRow("الفرق (ربح/خسارة الفترة غير المقفلة)", visible, 1, "bg-amber-50 text-amber-900")}
        </tbody></table>
      )
    }
    return (
      <table className="w-full min-w-[820px] text-sm">{header}<tbody>{bodyRows(visible, 1)}</tbody>
        {visible.length > 0 && <tfoot className="sticky bottom-0">{totalRow("الإجمالي (مدين − دائن)", visible, 1)}</tfoot>}
      </table>
    )
  }

  const resultCount = !result ? 0 : result.shape === "statement" ? result.groups.reduce((s, g) => s + g.rows.length, 0) : result.rows.length
  const summary = (() => {
    if (!result) return null
    if (result.shape === "pivot") {
      const total = result.rows.reduce((s, r) => s + r.total, 0)
      if (isIncome) {
        const revenue = -result.rows.filter((r) => r.total < 0).reduce((s, r) => s + r.total, 0)
        const expenses = result.rows.filter((r) => r.total >= 0).reduce((s, r) => s + r.total, 0)
        return [["إجمالي الإيرادات", revenue], ["إجمالي المصروفات", expenses], ["صافي الربح", revenue - expenses]] as const
      }
      return [["عدد الحسابات", result.rows.length], ["مراكز التكلفة", result.columns.length], ["الصافي (مدين − دائن)", total]] as const
    }
    if (result.shape === "trial") return [["إجمالي المدين", result.rows.reduce((s, r) => s + r.debit, 0)], ["إجمالي الدائن", result.rows.reduce((s, r) => s + r.credit, 0)], ["الرصيد", result.rows.reduce((s, r) => s + r.balance, 0)]] as const
    if (result.shape === "statement") return [["إجمالي المدين", result.groups.reduce((s, g) => s + g.debit, 0)], ["إجمالي الدائن", result.groups.reduce((s, g) => s + g.credit, 0)], ["الرصيد الختامي", result.groups.reduce((s, g) => s + g.closing, 0)]] as const
    return [["عدد الحركات", result.rows.length], ["إجمالي المدين", result.rows.reduce((s, r) => s + r.debit, 0)], ["إجمالي الدائن", result.rows.reduce((s, r) => s + r.credit, 0)]] as const
  })()

  return (
    <ReportPage loading={loading || running}>
      <ReportHeader
        icon={Network}
        category="تقارير مراكز التكلفة"
        title={<>{definition.title}</>}
        description={<>{needsCenters ? "تحليل الحركات المحمّلة على مراكز التكلفة" : "عرض الحركات مع مراكز التكلفة المحمّلة عليها"}</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!resultCount}><Download className="ml-2 h-4 w-4" />تصدير</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!resultCount}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {!isBalanceSheet && <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} className="rounded-xl" /></div>}
          <div className="space-y-2"><Label>{isBalanceSheet ? "بتاريخ" : "إلى تاريخ"}</Label><Input type="date" dir="ltr" value={filters.toDate} onChange={(event) => set({ toDate: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2">
            <Label>نوع مركز التكلفة{needsCenters ? " *" : ""}</Label>
            <Select value={String(filters.costTypeId || "")} onValueChange={(value) => set({ costTypeId: Number(value), centerIds: [] })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder={meta.cost_types.length ? "اختر النوع" : "لا توجد أنواع معرفة"} /></SelectTrigger>
              <SelectContent>{meta.cost_types.map((type) => <SelectItem key={type.id} value={String(type.id)}>{type.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ReportMultiChoice label={`مراكز التكلفة${requiresCenterSelection ? " *" : ""}`} options={centersOfType} selected={filters.centerIds} onChange={(centerIds) => set({ centerIds })} placeholder={requiresCenterSelection ? "اختر مركزاً أو أكثر" : "جميع مراكز النوع"} />
          {showsAccountsFilter && <ReportMultiChoice label={`الحسابات${isStatement ? " *" : ""}`} options={meta.accounts} selected={filters.accountIds} onChange={(accountIds) => set({ accountIds })} placeholder={isStatement ? "اختر حساباً أو أكثر" : "جميع الحسابات"} />}
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => set({ currencyId })} />
          <ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => set({ branchIds })} placeholder="جميع الفروع المتاحة" />
          <div className="space-y-2">
            <Label>حالة السندات</Label>
            <Select value={filters.status} onValueChange={(status) => set({ status })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">المحفوظ والمرحل</SelectItem><SelectItem value="posted">المرحل فقط</SelectItem></SelectContent>
            </Select>
          </div>
          {showsAccountLevel && <div className="space-y-2"><Label>مستوى الحساب</Label><Input type="number" min={0} dir="ltr" value={filters.level} onChange={(event) => set({ level: event.target.value })} className="rounded-xl text-right" placeholder="0 = بدون تحديد" /></div>}
          {kind === "trial-balance-cc" && <div className="space-y-2"><Label>مستوى مركز التكلفة</Label><Input type="number" min={0} dir="ltr" value={filters.costLevel} onChange={(event) => set({ costLevel: event.target.value })} className="rounded-xl text-right" /></div>}
          {kind === "accounts-movement-cc" && (
            <div className="space-y-2">
              <Label>القائمة المالية</Label>
              <Select value={filters.financialList} onValueChange={(financialList) => set({ financialList })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">كل الحسابات</SelectItem><SelectItem value="1">الميزانية العمومية</SelectItem><SelectItem value="2">قائمة الدخل</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {isTrial && <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={filters.showDetails} onCheckedChange={(value) => set({ showDetails: value === true })} />{kind === "trial-balance-cc" ? "إظهار تفاصيل الحسابات" : "إظهار تفاصيل مراكز التكلفة"}</label>}
            {kind === "statement-by-cc" && <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={filters.grouped} onCheckedChange={(value) => set({ grouped: value === true })} />مجمع حسب مركز التكلفة</label>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4" />مسح الفلاتر</Button>
            <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
              {running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض النتائج
            </Button>
          </div>
        </div>
        {!loading && !meta.cost_centers.length && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">لا توجد مراكز تكلفة معرفة بعد — عرّف أنواع ومراكز التكلفة وحمّلها على الحركات لتظهر في هذه التقارير.</p>}
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {summary && <section className="grid gap-3 sm:grid-cols-3">{summary.map(([label, value]) => <ReportSummaryCard key={label} label={label}>{typeof value === "number" && !Number.isInteger(value) ? fmt(value) : label.startsWith("عدد") || label === "مراكز التكلفة" ? Number(value).toLocaleString("en-US") : fmt(Number(value))}</ReportSummaryCard>)}</section>}

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">{definition.title}</h2>
            <p className="text-xs text-muted-foreground">{isBalanceSheet ? `حتى ${filters.toDate}` : `من ${filters.fromDate} إلى ${filters.toDate}`} · {resultCount.toLocaleString("en-US")} سجل</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في النتائج..." className="w-full rounded-xl sm:w-80" />
        </div>
        <div className="report-table-scroll">
          {!result || !resultCount ? (
            <div className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{result ? "لا توجد بيانات مطابقة" : "اختر الفلاتر ثم اضغط عرض النتائج"}</div>
          ) : result.shape === "statement" ? renderStatement(result.groups)
            : result.shape === "lines" ? renderLines(result.rows)
            : result.shape === "trial" ? renderTrial(result.rows)
            : renderPivot(result.columns, result.rows)}
        </div>
      </section>
    </ReportPage>
  )
}

export const CostCenterStatementWithReport = () => <CostCenterReport kind="statement-with-cc" />
export const CostCenterStatementByReport = () => <CostCenterReport kind="statement-by-cc" />
export const CostCenterAccountsMovementReport = () => <CostCenterReport kind="accounts-movement-cc" />
export const CostCenterTransactionsReport = () => <CostCenterReport kind="transactions-with-cc" />
export const CostCenterTrialBalanceReport = () => <CostCenterReport kind="trial-balance-cc" />
export const CostCenterTrialBalanceAccountsReport = () => <CostCenterReport kind="trial-balance-accounts" />
export const CostCenterIncomeStatementReport = () => <CostCenterReport kind="income-statement-cc" />
export const CostCenterBalanceSheetReport = () => <CostCenterReport kind="balance-sheet-cc" />
export const CostCenterIncomeStatementByReport = () => <CostCenterReport kind="income-statement-by-cc" />
export const CostCenterBalanceSheetByReport = () => <CostCenterReport kind="balance-sheet-by-cc" />
