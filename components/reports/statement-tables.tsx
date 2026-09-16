"use client"

type Row = {
  id: number
  account_code?: string
  account_name?: string
  statement_item?: string
  statement_side?: string
  balance?: number | string
}

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const value = (row: Row) => Number(row.balance || 0)
const formatted = (amount: number) => Math.abs(amount) < 0.00001 ? "" : money.format(amount)

function groups(rows: Row[]) {
  const result = new Map<string, Row[]>()
  for (const row of rows) {
    const name = row.statement_item || "غير مصنف"
    if (!result.has(name)) result.set(name, [])
    result.get(name)!.push(row)
  }
  return [...result]
}

function Amount({ amount, className = "" }: { amount: number; className?: string }) {
  return <td dir="ltr" className={`border border-slate-300 px-3 py-2 text-right tabular-nums dark:border-slate-700 ${className}`}>{formatted(amount)}</td>
}

export function IncomeStatementTable({ rows }: { rows: Row[] }) {
  const sections = groups(rows)
  const total = rows.reduce((sum, row) => sum + value(row), 0)
  const debits = rows.reduce((sum, row) => sum + Math.max(value(row), 0), 0)
  const credits = rows.reduce((sum, row) => sum + Math.max(-value(row), 0), 0)
  return <table dir="rtl" className="w-full min-w-[700px] border-collapse text-sm">
    <thead className="sticky top-0 z-10 bg-white dark:bg-slate-950 print:static"><tr>{["#", "رقم الحساب", "اسم الحساب", "مدين", "دائن"].map(label => <th key={label} className="border border-slate-300 px-3 py-2 text-right dark:border-slate-700">{label}</th>)}</tr></thead>
    <tbody>{sections.map(([name, accounts], sectionIndex) => {
      const subtotal = accounts.reduce((sum, row) => sum + value(row), 0)
      return <FragmentSection key={name} name={name} sectionIndex={sectionIndex} accounts={accounts} subtotal={subtotal} income />
    })}
      <tr className="bg-slate-100 font-bold dark:bg-slate-900"><td colSpan={3} className="border border-slate-300 px-3 py-2 dark:border-slate-700">صافي {total <= 0 ? "الربح" : "الخسارة"}</td><Amount amount={Math.max(-total, 0)} /><Amount amount={Math.max(total, 0)} /></tr>
    </tbody>
    <tfoot className="sticky bottom-0 bg-slate-100 font-bold dark:bg-slate-900 print:static"><tr><td colSpan={3} className="border border-slate-300 px-3 py-2 dark:border-slate-700">الإجمالي</td><Amount amount={debits + Math.max(-total, 0)} /><Amount amount={credits + Math.max(total, 0)} /></tr></tfoot>
  </table>
}

function FragmentSection({ name, sectionIndex, accounts, subtotal, income = false }: { name: string; sectionIndex: number; accounts: Row[]; subtotal: number; income?: boolean }) {
  return <>
    <tr className="bg-sky-700 font-bold text-white"><td className="border border-sky-800 px-3 py-2">{sectionIndex + 1}</td><td className="border border-sky-800"/><td className="border border-sky-800 px-3 py-2">{name}</td><td className="border border-sky-800"/><td className="border border-sky-800"/></tr>
    {accounts.map((row, index) => <tr key={row.id} className="even:bg-slate-50 dark:even:bg-slate-900/40"><td className="border border-slate-300 px-3 py-2 dark:border-slate-700">{index + 1}</td><td className="border border-slate-300 px-3 py-2 font-mono dark:border-slate-700">{row.account_code}</td><td className="border border-slate-300 px-3 py-2 dark:border-slate-700">{row.account_name}</td><Amount amount={income ? Math.max(value(row), 0) : value(row)} /><Amount amount={income ? Math.max(-value(row), 0) : 0} /></tr>)}
    <tr className="bg-slate-50 font-semibold dark:bg-slate-900"><td colSpan={3} className="border border-slate-300 px-3 py-2 dark:border-slate-700">مجموع {name}</td><Amount amount={Math.max(subtotal, 0)} /><Amount amount={Math.max(-subtotal, 0)} /></tr>
  </>
}

function BalanceSide({ title, rows, number }: { title: string; rows: Row[]; number: number }) {
  const total = rows.reduce((sum, row) => sum + value(row), 0)
  return <div className="min-w-0 flex-1"><table dir="rtl" className="w-full min-w-[420px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-white dark:bg-slate-950 print:static"><tr><th className="w-12 border border-slate-300 px-2 py-2 dark:border-slate-700">#</th><th className="border border-slate-300 px-3 py-2 text-right dark:border-slate-700">{title}</th><th className="w-36 border border-slate-300 px-3 py-2 text-right dark:border-slate-700">المبلغ</th></tr></thead><tbody>
    {groups(rows).map(([name, accounts], sectionIndex) => <Group key={name} name={name} accounts={accounts} number={number + sectionIndex} />)}
  </tbody><tfoot className="sticky bottom-0 bg-slate-100 font-bold dark:bg-slate-900 print:static"><tr><td className="border border-slate-300 dark:border-slate-700"/><td className="border border-slate-300 px-3 py-2 dark:border-slate-700">مجموع {title}</td><Amount amount={total} /></tr></tfoot></table></div>
}

function Group({ name, accounts, number }: { name: string; accounts: Row[]; number: number }) {
  return <><tr className="bg-sky-700 font-bold text-white"><td className="border border-sky-800 px-2 py-2">{number}</td><td className="border border-sky-800 px-3 py-2">{name}</td><td className="border border-sky-800"/></tr>
    {accounts.map(row => <tr key={row.id} className="even:bg-slate-50 dark:even:bg-slate-900/40"><td className="border border-slate-300 dark:border-slate-700"/><td className="border border-slate-300 px-3 py-2 dark:border-slate-700"><span className="font-mono text-xs text-muted-foreground">{row.account_code} </span>{row.account_name}</td><Amount amount={value(row)} /></tr>)}
    <tr className="bg-slate-50 font-semibold dark:bg-slate-900"><td className="border border-slate-300 dark:border-slate-700"/><td className="border border-slate-300 px-3 py-2 dark:border-slate-700">مجموع {name}</td><Amount amount={accounts.reduce((sum, row) => sum + value(row), 0)} /></tr></>
}

export function BalanceSheetTable({ rows }: { rows: Row[] }) {
  const assets = rows.filter(row => row.statement_side === "assets")
  const liabilities = rows.filter(row => row.statement_side !== "assets")
  return <div className="flex min-w-[900px] items-start gap-2"><BalanceSide title="أصول الميزانية" rows={assets} number={1} /><BalanceSide title="خصوم الميزانية وحقوق الملكية" rows={liabilities} number={assets.length + 1} /></div>
}
