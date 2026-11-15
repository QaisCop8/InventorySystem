"use client"
import { tr } from "@/lib/i18n"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

// قائمة الدخل والميزانية عبر شبكة التقارير (ReportGrid/DataGridView): رأس كل بند، حساباته، ومجموعه كصفوف ملوّنة

type Row = {
  id: number
  account_code?: string
  account_name?: string
  statement_item?: string
  statement_side?: string
  balance?: number | string
}

type GridRow = { __kind: "section" | "account" | "subtotal" | "net"; label: string; account_code?: string; debit?: number | null; credit?: number | null; amount?: number | null }

const value = (row: Row) => Number(row.balance || 0)
const nonZero = (amount: number) => (Math.abs(amount) < 0.00001 ? null : amount)

function groups(rows: Row[]) {
  const result = new Map<string, Row[]>()
  for (const row of rows) {
    const name = row.statement_item || "غير مصنف"
    if (!result.has(name)) result.set(name, [])
    result.get(name)!.push(row)
  }
  return [...result]
}

const rowClass = (row: GridRow) => row.__kind === "section" ? "report-row-opening" : row.__kind === "subtotal" ? "report-row-subtotal" : row.__kind === "net" ? "report-row-total" : undefined

export function IncomeStatementTable({ rows }: { rows: Row[] }) {
  const total = rows.reduce((sum, row) => sum + value(row), 0)
  const debits = rows.reduce((sum, row) => sum + Math.max(value(row), 0), 0)
  const credits = rows.reduce((sum, row) => sum + Math.max(-value(row), 0), 0)
  const gridRows: GridRow[] = []
  groups(rows).forEach(([name, accounts], sectionIndex) => {
    gridRows.push({ __kind: "section", label: `${sectionIndex + 1}. ${name}` })
    for (const row of accounts) gridRows.push({ __kind: "account", label: row.account_name || "", account_code: row.account_code, debit: nonZero(Math.max(value(row), 0)), credit: nonZero(Math.max(-value(row), 0)) })
    const subtotal = accounts.reduce((sum, row) => sum + value(row), 0)
    gridRows.push({ __kind: "subtotal", label: `${tr("مجموع ")}${name}`, debit: nonZero(Math.max(subtotal, 0)), credit: nonZero(Math.max(-subtotal, 0)) })
  })
  gridRows.push({ __kind: "net", label: `${tr("صافي ")}${total <= 0 ? tr("الربح") : tr("الخسارة")}`, debit: nonZero(Math.max(-total, 0)), credit: nonZero(Math.max(total, 0)) })
  const columns: ReportGridColumn<GridRow>[] = [
    { key: "account_code", label: tr("رقم الحساب"), width: 130 },
    { key: "label", label: tr("اسم الحساب"), width: "*", minWidth: 260 },
    { key: "debit", label: tr("مدين"), type: "number", width: 160, total: debits + Math.max(-total, 0) },
    { key: "credit", label: tr("دائن"), type: "number", width: 160, total: credits + Math.max(total, 0) },
  ]
  return <ReportGrid rows={gridRows} columns={columns} rowClassName={rowClass} exportFileName={tr("قائمة الدخل")} />
}

function BalanceSide({ title, rows, number }: { title: string; rows: Row[]; number: number }) {
  const total = rows.reduce((sum, row) => sum + value(row), 0)
  const gridRows: GridRow[] = []
  groups(rows).forEach(([name, accounts], sectionIndex) => {
    gridRows.push({ __kind: "section", label: `${number + sectionIndex}. ${name}` })
    for (const row of accounts) gridRows.push({ __kind: "account", label: row.account_name || "", account_code: row.account_code, amount: nonZero(value(row)) })
    gridRows.push({ __kind: "subtotal", label: `${tr("مجموع ")}${name}`, amount: accounts.reduce((sum, row) => sum + value(row), 0) })
  })
  const columns: ReportGridColumn<GridRow>[] = [
    { key: "account_code", label: tr("رقم الحساب"), width: 110 },
    { key: "label", label: title, width: "*", minWidth: 200 },
    { key: "amount", label: tr("المبلغ"), type: "number", width: 150, total },
  ]
  return <div className="min-w-0 flex-1"><ReportGrid rows={gridRows} columns={columns} rowClassName={rowClass} exportFileName={title} totalLabel={`${tr("مجموع ")}${title}`} /></div>
}

export function BalanceSheetTable({ rows }: { rows: Row[] }) {
  const assets = rows.filter(row => row.statement_side === "assets")
  const liabilities = rows.filter(row => row.statement_side !== "assets")
  return <div className="flex min-w-[900px] items-start gap-2"><BalanceSide title={tr("أصول الميزانية")} rows={assets} number={1} /><BalanceSide title={tr("خصوم الميزانية وحقوق الملكية")} rows={liabilities} number={assets.length + 1} /></div>
}
