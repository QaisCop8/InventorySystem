"use client"
import { tr } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"

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
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

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
const money = amountNumberFormat("en-US")
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
        if (!response.ok) throw new Error(data.error || tr("تعذر تحميل خيارات التقرير"))
        const next: Meta = { ...emptyMeta, ...(data.meta || {}) }
        setMeta(next)
        setFilters((current) => ({ ...current, currencyId: Number(next.currencies[0]?.id || 0), costTypeId: Number(next.cost_types[0]?.id || 0) }))
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : tr("تعذر تحميل خيارات التقرير")))
      .finally(() => setLoading(false))
  }, [kind])

  const centersOfType = useMemo(
    () => meta.cost_centers.filter((center) => !filters.costTypeId || Number(center.cost_type_id) === filters.costTypeId).map((center) => ({ id: center.id, name: center.name })),
    [meta.cost_centers, filters.costTypeId],
  )

  const run = async () => {
    if (needsCenters && !filters.costTypeId && !filters.centerIds.length) { setError(tr("اختر نوع مركز التكلفة")); return }
    if (requiresCenterSelection && !filters.centerIds.length) { setError(tr("يجب اختيار مركز تكلفة واحد على الأقل")); return }
    if (isStatement && !filters.accountIds.length) { setError(tr("اختر حساباً واحداً على الأقل")); return }
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
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setResult(data)
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
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
    <ReportGrid
      rows={groups.flatMap((group) => {
        const rows = group.rows.filter((row) => matches(row.vch_code, row.account_name, row.cost_centers, row.note))
        return [{ __kind: "group", account: group.title, balance: group.opening, cost_centers: tr("رصيد افتتاحي") }, ...rows.map((row) => ({ ...row, account: `${row.account_code} - ${row.account_name}` })), { __kind: "total", account: `${tr("إجمالي ")}${group.title}`, debit: group.debit, credit: group.credit, balance: group.closing }]
      })}
      exportFileName={definition.title} onRowDoubleClick={(row: any) => !row.__kind && openVoucher(row)}
      rowClassName={(row: any) => row.__kind === "group" ? "report-row-opening" : row.__kind === "total" ? "report-row-subtotal" : undefined}
      columns={[
        { key: "vch_date", label: tr("التاريخ"), width: 110 }, { key: "vch_code", label: tr("رقم السند"), width: 130 },
        { key: "voucher_type_name", label: tr("نوع السند"), width: 130 }, { key: "account", label: tr("الحساب"), width: "*", minWidth: 220 },
        { key: "debit", label: tr("مدين"), type: "number", width: 130 }, { key: "credit", label: tr("دائن"), type: "number", width: 130 },
        { key: "balance", label: tr("الرصيد"), type: "number", width: 140 },
        { key: "cost_centers", label: tr("مراكز التكلفة"), width: 200 }, { key: "note", label: tr("الملاحظة"), width: 180 },
      ]}/>
  )

  const renderLines = (rows: any[]) => {
    const visible = rows.filter((row) => matches(row.vch_code, row.account_code, row.account_name, row.cost_centers, row.note))
    return (
      <ReportGrid rows={visible} exportFileName={definition.title} onRowDoubleClick={(row: any) => openVoucher(row)} columns={[
          { key: "vch_date", label: tr("التاريخ"), width: 110 }, { key: "vch_code", label: tr("رقم السند"), width: 130 },
          { key: "voucher_type_name", label: tr("نوع السند"), width: 130 }, { key: "account_code", label: tr("رقم الحساب"), width: 120 },
          { key: "account_name", label: tr("اسم الحساب"), width: 200 },
          { key: "debit", label: tr("مدين"), type: "number", width: 130, total: true }, { key: "credit", label: tr("دائن"), type: "number", width: 130, total: true },
          { key: "cost_centers", label: tr("مراكز التكلفة"), width: 200 }, { key: "note", label: tr("الملاحظة"), width: "*", minWidth: 180 },
        ]}/>
    )
  }

  const renderTrial = (rows: TrialRow[]) => {
    const visible = rows.filter((row) => matches(row.code, row.name) || row.details.some((detail) => matches(detail.code, detail.name)))
    const total = (key: "opening" | "debit" | "credit" | "balance") => visible.reduce((s, r) => s + r[key], 0)
    return (
      <ReportGrid
        rows={visible.flatMap((row: any) => [{ ...row, __kind: row.details.length ? "parent" : "row" }, ...row.details.map((detail: any) => ({ ...detail, id: `${row.id}-${detail.id}`, __kind: "detail" }))])}
        exportFileName={definition.title}
        rowClassName={(row: any) => row.__kind === "parent" ? "report-row-subtotal" : row.__kind === "detail" ? "report-row-muted" : undefined}
        columns={[
          { key: "name", label: kind === "trial-balance-cc" ? tr("مركز التكلفة") : tr("الحساب"), width: "*", minWidth: 240, value: (row: any) => `${row.__kind === "detail" ? "    " : ""}${row.code ? `${row.code} ` : ""}${row.name}` },
          { key: "opening", label: tr("رصيد افتتاحي"), type: "number", width: 150, total: total("opening") },
          { key: "debit", label: tr("مدين"), type: "number", width: 150, total: total("debit") },
          { key: "credit", label: tr("دائن"), type: "number", width: 150, total: total("credit") },
          { key: "balance", label: tr("الرصيد"), type: "number", width: 150, total: total("balance") },
        ]}/>
    )
  }

  const renderPivot = (columns: { id: number; name: string }[], rows: PivotRow[]) => {
    const visible = rows.filter((row) => matches(row.account_code, row.account_name))
    const sumOf = (list: PivotRow[], id: number | "total") => list.reduce((s, row) => s + (id === "total" ? row.total : row.values[id] || 0), 0)
    // صفوف الشبكة: عنوان قسم، حسابات (sign = 1 الصافي كما هو، −1 معكوس للإيرادات والخصوم)، وصف مجموع
    const out: any[] = []
    const section = (label: string) => out.push({ __kind: "section", account_name: tr(label) })
    const body = (list: PivotRow[], sign: 1 | -1) => { for (const row of list) out.push({ __kind: "account", account_code: row.account_code, account_name: row.account_name, ...Object.fromEntries(columns.map((column) => [`c_${column.id}`, row.values[column.id] ? sign * row.values[column.id] : null])), total: sign * row.total }) }
    const totalLine = (label: string, list: PivotRow[], sign: 1 | -1, kind = "subtotal") => out.push({ __kind: kind, account_name: label, ...Object.fromEntries(columns.map((column) => [`c_${column.id}`, sign * sumOf(list, column.id)])), total: sign * sumOf(list, "total") })
    if (isIncome) {
      const revenue = visible.filter((row) => row.total < 0), expenses = visible.filter((row) => row.total >= 0)
      section("الإيرادات"); body(revenue, -1); totalLine(tr("إجمالي الإيرادات"), revenue, -1)
      section("المصروفات"); body(expenses, 1); totalLine(tr("إجمالي المصروفات"), expenses, 1)
      totalLine(tr("صافي الربح / (الخسارة)"), visible, -1, "net")
    } else if (isBalanceSheet) {
      const assets = visible.filter((row) => row.side === "assets" || (row.side == null && row.total >= 0))
      const liabilities = visible.filter((row) => !assets.includes(row))
      section("الأصول"); body(assets, 1); totalLine(tr("إجمالي الأصول"), assets, 1)
      section("الخصوم وحقوق الملكية"); body(liabilities, -1); totalLine(tr("إجمالي الخصوم وحقوق الملكية"), liabilities, -1)
      totalLine(tr("الفرق (ربح/خسارة الفترة غير المقفلة)"), visible, 1, "net")
    } else {
      body(visible, 1); if (visible.length) totalLine(tr("الإجمالي (مدين − دائن)"), visible, 1, "net")
    }
    return <ReportGrid rows={out} exportFileName={definition.title}
      rowClassName={(row: any) => row.__kind === "section" ? "report-row-opening" : row.__kind === "subtotal" ? "report-row-subtotal" : row.__kind === "net" ? "report-row-total" : undefined}
      columns={[
        { key: "account_code", label: tr("رقم الحساب"), width: 130 },
        { key: "account_name", label: tr("اسم الحساب"), width: "*", minWidth: 220 },
        ...columns.map((column): ReportGridColumn => ({ key: `c_${column.id}`, label: column.name, type: "number", width: 140 })),
        { key: "total", label: tr("المجموع"), type: "number", width: 150, visible: columns.length > 1 },
      ]}/>
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
        category={tr("تقارير مراكز التكلفة")}
        title={<>{definition.title}</>}
        description={<>{needsCenters ? tr("تحليل الحركات المحمّلة على مراكز التكلفة") : tr("عرض الحركات مع مراكز التكلفة المحمّلة عليها")}</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!resultCount}><Download className="me-2 h-4 w-4" />{tr("تصدير")}</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!resultCount}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {!isBalanceSheet && <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} className="rounded-xl" /></div>}
          <div className="space-y-2"><Label>{isBalanceSheet ? tr("بتاريخ") : tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={filters.toDate} onChange={(event) => set({ toDate: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2">
            <Label>{tr("نوع مركز التكلفة")}{needsCenters ? " *" : ""}</Label>
            <Select value={String(filters.costTypeId || "")} onValueChange={(value) => set({ costTypeId: Number(value), centerIds: [] })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder={meta.cost_types.length ? tr("اختر النوع") : tr("لا توجد أنواع معرفة")} /></SelectTrigger>
              <SelectContent>{meta.cost_types.map((type) => <SelectItem key={type.id} value={String(type.id)}>{type.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ReportMultiChoice label={tr("مراكز التكلفة{0}", requiresCenterSelection ? " *" : "")} options={centersOfType} selected={filters.centerIds} onChange={(centerIds) => set({ centerIds })} placeholder={requiresCenterSelection ? tr("اختر مركزاً أو أكثر") : tr("جميع مراكز النوع")} />
          {showsAccountsFilter && <ReportMultiChoice label={tr("الحسابات{0}", isStatement ? " *" : "")} options={meta.accounts} selected={filters.accountIds} onChange={(accountIds) => set({ accountIds })} placeholder={isStatement ? tr("اختر حساباً أو أكثر") : tr("جميع الحسابات")} />}
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => set({ currencyId })} />
          <ReportMultiChoice label={tr("الفروع")} options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => set({ branchIds })} placeholder={tr("جميع الفروع المتاحة")} />
          <div className="space-y-2">
            <Label>{tr("حالة السندات")}</Label>
            <Select value={filters.status} onValueChange={(status) => set({ status })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{tr("المحفوظ والمرحل")}</SelectItem><SelectItem value="posted">{tr("المعتمد فقط")}</SelectItem></SelectContent>
            </Select>
          </div>
          {showsAccountLevel && <div className="space-y-2"><Label>{tr("مستوى الحساب")}</Label><Input type="number" min={0} dir="ltr" value={filters.level} onChange={(event) => set({ level: event.target.value })} className="rounded-xl text-start" placeholder={tr("0 = بدون تحديد")} /></div>}
          {kind === "trial-balance-cc" && <div className="space-y-2"><Label>{tr("مستوى مركز التكلفة")}</Label><Input type="number" min={0} dir="ltr" value={filters.costLevel} onChange={(event) => set({ costLevel: event.target.value })} className="rounded-xl text-start" /></div>}
          {kind === "accounts-movement-cc" && (
            <div className="space-y-2">
              <Label>{tr("القائمة المالية")}</Label>
              <Select value={filters.financialList} onValueChange={(financialList) => set({ financialList })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">{tr("كل الحسابات")}</SelectItem><SelectItem value="1">{tr("الميزانية العمومية")}</SelectItem><SelectItem value="2">{tr("قائمة الدخل")}</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {isTrial && <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={filters.showDetails} onCheckedChange={(value) => set({ showDetails: value === true })} />{kind === "trial-balance-cc" ? tr("إظهار تفاصيل الحسابات") : tr("إظهار تفاصيل مراكز التكلفة")}</label>}
            {kind === "statement-by-cc" && <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={filters.grouped} onCheckedChange={(value) => set({ grouped: value === true })} />{tr("مجمع حسب مركز التكلفة")}</label>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}><RefreshCcw className="me-2 h-4 w-4" />{tr("مسح الفلاتر")}</Button>
            <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
              {running ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض النتائج")}
            </Button>
          </div>
        </div>
        {!loading && !meta.cost_centers.length && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{tr("لا توجد مراكز تكلفة معرفة بعد — عرّف أنواع ومراكز التكلفة وحمّلها على الحركات لتظهر في هذه التقارير.")}</p>}
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {summary && <section className="grid gap-3 sm:grid-cols-3">{summary.map(([label, value]) => <ReportSummaryCard key={label} label={label}>{typeof value === "number" && !Number.isInteger(value) ? fmt(value) : label.startsWith("عدد") || label === "مراكز التكلفة" ? Number(value).toLocaleString("en-US") : fmt(Number(value))}</ReportSummaryCard>)}</section>}

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">{definition.title}</h2>
            <p className="text-xs text-muted-foreground">{isBalanceSheet ? tr("حتى {0}", filters.toDate) : tr("من {0} إلى {1}", filters.fromDate, filters.toDate)} · {resultCount.toLocaleString("en-US")}{tr(" سجل")}</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("بحث في النتائج...")} className="w-full rounded-xl sm:w-80" />
        </div>
        <div className="report-table-scroll">
          {!result || !resultCount ? (
            <div className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{result ? tr("لا توجد بيانات مطابقة") : tr("اختر الفلاتر ثم اضغط عرض النتائج")}</div>
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
