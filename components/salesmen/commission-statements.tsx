"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type Row = Record<string, any>
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sourceLabels: Record<string, string> = { invoice: "فاتورة", return: "مرتجع", collection: "تحصيل", payment: "دفعة" }

export function CommissionStatements({ statements, audit }: { statements: Row[]; audit: Row[] }) {
  const [view, setView] = useState("statement")
  const exportCsv = () => {
    const rows = [["المندوب", "العملة", "الرصيد السابق", "المكتسب", "التسويات", "المدفوع", "الرصيد", "المستحق المعتمد"],
      ...statements.map(row => [row.salesman_name, row.currency_code, row.opening, row.earned, row.adjustments, row.paid, row.balance, row.payable])]
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? "")
      return `"${(/^[=+@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`
    }).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = "commission-statements.csv"; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="space-y-4" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">{[["statement", "كشف حساب العمولة"], ["payable", "العمولات المستحقة"], ["audit", "سجل الإجراءات"]].map(([key, label]) =>
        <Button key={key} variant={view === key ? "default" : "outline"} onClick={() => setView(key)}>{label}</Button>)}</div>
      <Button variant="outline" onClick={exportCsv}>تصدير الكشف CSV</Button>
    </div>
    {view === "audit" ? <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["التاريخ", "المندوب", "الحركة", "الإجراء", "المستخدم"].map(label => <th key={label} className="p-3 text-right">{label}</th>)}</tr></thead><tbody>
      {audit.map(row => <tr key={row.id} className="border-t"><td className="p-3" dir="ltr">{String(row.created_at).replace("T", " ").slice(0, 19)}</td><td className="p-3">{row.salesman_name}</td><td className="p-3">{row.transaction_id}</td><td className="p-3">{({ approve: "اعتماد", post: "ترحيل", pay: "صرف", cancel: "إلغاء", calculate: "احتساب" } as Record<string,string>)[row.action] || row.action}</td><td className="p-3">{row.user_id}</td></tr>)}
      {!audit.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">لا توجد إجراءات في الفترة المحددة</td></tr>}
    </tbody></table></div> : <>
      {!statements.length && <p className="rounded-xl border p-8 text-center text-slate-500">لا توجد عمولات مسجلة ضمن النطاق المحدد</p>}
      {statements.filter(row => view !== "payable" || Math.abs(Number(row.payable)) > .009).map(row => <article key={row.key} className="overflow-hidden rounded-xl border bg-white">
        <header className="flex items-center justify-between border-b bg-slate-50 p-4"><h3 className="font-bold">{row.salesman_name}</h3><span className="rounded-md border bg-white px-3 py-1 text-sm">{row.currency_code}</span></header>
        <dl className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">{[["الرصيد السابق", row.opening], ["عمولة الفترة", row.earned], ["المرتجعات والتسويات", row.adjustments], ["المدفوع", row.paid], ["الرصيد", row.balance], ["المستحق المعتمد", row.payable], ["غير المعتمد", row.balance - row.payable]].map(([label, amount]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums" dir="ltr">{money(amount)}</dd></div>)}</dl>
        {view === "statement" && <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-100"><tr>{["التاريخ", "الحركة", "المصدر", "العميل", "العمولة", "الدفعة", "الرصيد"].map(label => <th key={label} className="px-3 py-2 text-right">{label}</th>)}</tr></thead><tbody>{row.entries.map((entry: Row, index: number) => <tr key={index} className="border-t"><td className="p-3">{entry.date}</td><td className="p-3">{sourceLabels[entry.type] || entry.type}</td><td className="p-3">{entry.source}</td><td className="p-3">{entry.customer || "—"}</td><td className="p-3 tabular-nums">{money(entry.debit)}</td><td className="p-3 tabular-nums">{money(entry.credit)}</td><td className="p-3 font-semibold tabular-nums">{money(entry.balance)}</td></tr>)}</tbody></table></div>}
      </article>)}
    </>}
  </section>
}
