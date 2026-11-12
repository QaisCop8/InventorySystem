"use client"

import { tr, appDir } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight, Banknote, CheckCircle2, FileSpreadsheet, Link2, Lock, LockOpen, Plus, RefreshCw, Search, Sparkles, Trash2, Unlink, Upload, Wand2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { ExcelImportWizard, type ImportConfig, type ImportIssue } from "@/components/import/excel-import-wizard"

// التسوية البنكية: استيراد كشف البنك من Excel ومطابقته (تلقائياً ويدوياً) مع قيود حساب البنك،
// وتسجيل قيود لعمولات/فوائد البنك غير المسجّلة، ثم إقفال التسوية عند تساوي الرصيدين المعدّلين.

type Reconciliation = {
  id: number; account_id: number; account_code: string; account_name: string; currency_code?: string
  statement_from: string; statement_to: string; opening_balance: number; closing_balance: number
  status: number; note?: string; line_count: number; matched_count: number
}
type BankAccount = { id: number; code: string; name: string; account_id: number; account_code: string; account_name: string; currency_code?: string }
type StatementLine = {
  id: number; line_no: number; txn_date: string; description: string; reference: string; amount: number; balance: number | null
  journal_voucher_id: number | null; matched: boolean; match_type: string | null; score: number | null
  journal_detail_ids: number[]; vouchers: { voucher_id: number; vch_code: string; vch_type_name: string; amount: number }[]
}
type BookLine = {
  id: number; voucher_id: number; vch_type_name: string; vch_code: string; vch_date: string; voucher_status: number; amount: number
  note: string; voucher_note: string; manual_voucher: string; cheque_numbers: string; branch_name: string
  statement_line_id: number | null; reconciliation_id: number | null; in_period: boolean; matched_here: boolean; matched_elsewhere: boolean
}
type Summary = Record<string, number>
type Detail = { header: any; statementLines: StatementLine[]; bookLines: BookLine[]; summary: Summary }
type Filter = "unmatched" | "matched" | "all"

const fmt = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => `${today().slice(0, 8)}01`
const same = (a: number, b: number) => Math.abs(Math.round((a - b) * 1000)) <= 5

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

const MATCH_LABEL: Record<string, string> = { auto: tr("تلقائي"), manual: tr("يدوي"), journal: tr("قيد تسوية") }

export default function BankReconciliation() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Reconciliation[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ rows: Reconciliation[]; bankAccounts: BankAccount[] }>("/api/bank-reconciliations")
      setRows(data.rows || [])
      setBankAccounts(data.bankAccounts || [])
    } catch (error) {
      toast({ title: tr("خطأ"), description: error instanceof Error ? error.message : tr("تعذر التحميل"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void loadList() }, [loadList])

  if (openId) {
    return <ReconciliationDetail id={openId} onBack={() => { setOpenId(null); void loadList() }} />
  }

  return (
    <div dir={appDir()} className="space-y-5 p-3 md:p-6">
<VoucherListHero title={tr("التسوية البنكية")} subtitle={tr("استورد كشف البنك من Excel وطابقه مع سندات حساب البنك تلقائياً، ثم عالج الفروقات وأقفل التسوية.")} icon={Banknote} category={tr("المحاسبة")} onNew={() => setCreating(true)} addLabel={tr("تسوية جديدة")} actions={<><Button variant="outline" onClick={() => void loadList()} disabled={loading}><RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}</Button></>} />

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">{tr("جاري التحميل...")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center">
          <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-bold">{tr("لا توجد تسويات بنكية")}</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">{tr("ابدأ بتسوية جديدة واستورد كشف البنك من ملف Excel.")}</p>
          <Button onClick={() => setCreating(true)}><Plus className="me-2 h-4 w-4" />{tr("تسوية جديدة")}</Button>
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3 text-start">{tr("حساب البنك")}</th>
                  <th className="p-3 text-start">{tr("فترة الكشف")}</th>
                  <th className="p-3 text-end">{tr("الرصيد الختامي")}</th>
                  <th className="p-3 text-center">{tr("المطابقة")}</th>
                  <th className="p-3 text-center">{tr("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-t hover:bg-emerald-50/50" onClick={() => setOpenId(row.id)}>
                    <td className="p-3"><div className="font-semibold">{row.account_name}</div><div className="font-mono text-xs text-slate-500">{row.account_code}</div></td>
                    <td className="p-3 font-mono text-xs">{row.statement_from} ← {row.statement_to}</td>
                    <td className="p-3 text-end font-mono">{fmt(row.closing_balance)} <span className="text-xs text-slate-400">{row.currency_code}</span></td>
                    <td className="p-3 text-center">
                      <span className="font-mono text-xs">{row.matched_count} / {row.line_count}</span>
                      <div className="mx-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${row.line_count ? Math.round((row.matched_count / row.line_count) * 100) : 0}%` }} />
                      </div>
                    </td>
                    <td className="p-3 text-center">{Number(row.status) === 2 ? <Badge className="bg-slate-700">{tr("مُقفلة")}</Badge> : <Badge className="bg-amber-500">{tr("مفتوحة")}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <NewReconciliationDialog
        open={creating}
        bankAccounts={bankAccounts}
        onOpenChange={setCreating}
        onCreated={(id) => { setCreating(false); setOpenId(id) }}
      />
    </div>
  )
}

function NewReconciliationDialog({ open, onOpenChange, bankAccounts, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; bankAccounts: BankAccount[]; onCreated: (id: number) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ account_id: "", statement_from: firstOfMonth(), statement_to: today(), opening_balance: "", closing_balance: "", note: "" })
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setForm({ account_id: "", statement_from: firstOfMonth(), statement_to: today(), opening_balance: "", closing_balance: "", note: "" }) }, [open])

  const save = async () => {
    setSaving(true)
    try {
      const created = await api<{ id: number }>("/api/bank-reconciliations", { method: "POST", body: JSON.stringify({ ...form, account_id: Number(form.account_id), opening_balance: Number(form.opening_balance) || 0, closing_balance: Number(form.closing_balance) || 0, lines: [] }) })
      toast({ title: tr("تم إنشاء التسوية"), description: tr("استورد الآن كشف البنك من Excel") })
      onCreated(created.id)
    } catch (error) {
      toast({ title: tr("تعذر الإنشاء"), description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="max-w-xl">
        <DialogHeader><DialogTitle>{tr("تسوية بنكية جديدة")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {bankAccounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>{tr("حسابات البنوك المعرّفة")}</Label>
              <div className="flex flex-wrap gap-2">
                {bankAccounts.map((bank) => (
                  <button key={bank.id} type="button" onClick={() => setForm((current) => ({ ...current, account_id: String(bank.account_id) }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${String(bank.account_id) === form.account_id ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 hover:bg-slate-50"}`}>
                    {bank.name} <span className="font-mono text-slate-400">{bank.account_code}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <AutoCompleteAccount label={tr("حساب البنك (في دليل الحسابات) *")} value={form.account_id} valueMode="id" showCostCenterButton={false}
            onValueChange={(value) => setForm((current) => ({ ...current, account_id: value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{tr("من تاريخ *")}</Label><Input type="date" value={form.statement_from} onChange={(event) => setForm({ ...form, statement_from: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>{tr("إلى تاريخ *")}</Label><Input type="date" value={form.statement_to} onChange={(event) => setForm({ ...form, statement_to: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>{tr("الرصيد الافتتاحي في الكشف")}</Label><Input inputMode="decimal" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} placeholder="0.00" /></div>
            <div className="space-y-1.5"><Label>{tr("الرصيد الختامي في الكشف *")}</Label><Input inputMode="decimal" value={form.closing_balance} onChange={(event) => setForm({ ...form, closing_balance: event.target.value })} placeholder="0.00" /></div>
          </div>
          <div className="space-y-1.5"><Label>{tr("ملاحظات")}</Label><Input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tr("إلغاء")}</Button>
            <Button onClick={() => void save()} disabled={saving || !form.account_id}>{saving ? tr("جاري الإنشاء...") : tr("إنشاء ومتابعة")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReconciliationDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [statementFilter, setStatementFilter] = useState<Filter>("unmatched")
  const [bookFilter, setBookFilter] = useState<Filter>("unmatched")
  const [statementSearch, setStatementSearch] = useState("")
  const [bookSearch, setBookSearch] = useState("")
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [selectedBook, setSelectedBook] = useState<Set<number>>(new Set())
  const [tolerance, setTolerance] = useState("5")
  const [journalFor, setJournalFor] = useState<StatementLine | null>(null)
  const [balances, setBalances] = useState({ opening_balance: "", closing_balance: "", note: "" })

  const load = useCallback(async () => {
    try {
      const data = await api<Detail>(`/api/bank-reconciliations/${id}`)
      setDetail(data)
      setBalances({ opening_balance: String(data.header.opening_balance ?? ""), closing_balance: String(data.header.closing_balance ?? ""), note: data.header.note || "" })
    } catch (error) {
      toast({ title: tr("خطأ"), description: error instanceof Error ? error.message : tr("تعذر التحميل"), variant: "destructive" })
    }
  }, [id, toast])

  useEffect(() => { void load() }, [load])

  const locked = Number(detail?.header?.status) === 2

  const run = async (body: Record<string, unknown>, options: { quiet?: boolean } = {}) => {
    setBusy(true)
    try {
      const result = await api<{ message?: string; warnings?: string[] }>(`/api/bank-reconciliations/${id}`, { method: "PATCH", body: JSON.stringify(body) })
      if (!options.quiet && result.message) toast({ title: result.message, description: result.warnings?.join(" — ") })
      setSelectedLine(null)
      setSelectedBook(new Set())
      await load()
      return true
    } catch (error) {
      toast({ title: tr("تعذر التنفيذ"), description: error instanceof Error ? error.message : "", variant: "destructive" })
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirmYesNo(tr("حذف التسوية وكل أسطر الكشف ومطابقاتها؟ (قيود التسوية المنشأة تبقى)")))) return
    setBusy(true)
    try {
      await api(`/api/bank-reconciliations/${id}`, { method: "DELETE" })
      toast({ title: tr("حُذفت التسوية") })
      onBack()
    } catch (error) {
      toast({ title: tr("تعذر الحذف"), description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const statementLines = detail?.statementLines || []
  const bookLines = detail?.bookLines || []
  const currentLine = statementLines.find((line) => line.id === selectedLine) || null
  const selectedBookLines = bookLines.filter((line) => selectedBook.has(line.id))
  const selectedTotal = Math.round(selectedBookLines.reduce((sum, line) => sum + line.amount, 0) * 1000) / 1000
  const matchDifference = currentLine ? Math.round((selectedTotal - currentLine.amount) * 1000) / 1000 : 0

  const visibleStatement = useMemo(() => {
    const query = statementSearch.trim().toLowerCase()
    return statementLines.filter((line) =>
      (statementFilter === "all" || (statementFilter === "matched") === line.matched) &&
      (!query || `${line.description} ${line.reference} ${line.amount} ${line.vouchers.map((v) => v.vch_code).join(" ")}`.toLowerCase().includes(query)))
  }, [statementLines, statementFilter, statementSearch])

  const visibleBook = useMemo(() => {
    const query = bookSearch.trim().toLowerCase()
    const list = bookLines.filter((line) => {
      const matched = line.reconciliation_id != null
      if (bookFilter === "unmatched" && matched) return false
      if (bookFilter === "matched" && !line.matched_here) return false
      if (bookFilter !== "matched" && !line.in_period && !matched && !currentLine) return false
      return !query || `${line.vch_code} ${line.vch_type_name} ${line.note} ${line.voucher_note} ${line.manual_voucher} ${line.cheque_numbers} ${line.amount}`.toLowerCase().includes(query)
    })
    // عند اختيار سطر كشف: المرشّحون بنفس المبلغ أولاً ثم الأقرب تاريخاً
    if (currentLine) {
      const score = (line: BookLine) => (same(line.amount, currentLine.amount) ? 0 : Math.sign(line.amount) === Math.sign(currentLine.amount) ? 1 : 2)
      const distance = (line: BookLine) => Math.abs(Date.parse(line.vch_date) - Date.parse(currentLine.txn_date))
      return [...list].sort((a, b) => score(a) - score(b) || distance(a) - distance(b))
    }
    return list
  }, [bookLines, bookFilter, bookSearch, currentLine])

  const importConfig = useMemo<ImportConfig>(() => ({
    title: tr("استيراد كشف البنك من Excel"),
    description: tr("عمود التاريخ مطلوب، والمبلغ إما بعمودَي إيداع وسحب أو بعمود مبلغ واحد (موجب = إيداع، سالب = سحب). الأسطر بمبلغ صفر تُتجاهل."),
    templateFileName: "نموذج-كشف-بنك",
    importButtonLabel: tr("إضافة إلى التسوية"),
    closeOnSuccess: true,
    sampleRows: [
      { txn_date: "2026-10-01", description: tr("إيداع نقدي"), reference: "DEP-1001", deposit: 1500, withdrawal: "", amount: "", balance: 1500 },
      { txn_date: "2026-10-03", description: tr("شيك رقم 000123"), reference: "123", deposit: "", withdrawal: 420.5, amount: "", balance: 1079.5 },
    ],
    fields: [
      { key: "txn_date", label: tr("التاريخ"), required: true, type: "date", aliases: ["date", "value date", "txn date", "posting date", "تاريخ الحركة", "تاريخ القيد", "تاريخ الاستحقاق"], example: "2026-10-01" },
      { key: "description", label: tr("البيان"), aliases: ["description", "details", "narration", "particulars", "الوصف", "التفاصيل", "شرح"], example: "إيداع نقدي" },
      { key: "reference", label: tr("المرجع"), aliases: ["reference", "ref", "cheque no", "check no", "رقم الشيك", "رقم المرجع", "المرجع"], example: "DEP-1001" },
      { key: "deposit", label: tr("إيداع (دائن/له)"), type: "number", min: 0, aliases: ["deposit", "credit", "cr", "دائن", "له", "ايداع", "إيداعات", "وارد"], example: 1500 },
      { key: "withdrawal", label: tr("سحب (مدين/عليه)"), type: "number", min: 0, aliases: ["withdrawal", "debit", "dr", "مدين", "عليه", "سحب", "سحوبات", "صادر"], example: "" },
      { key: "amount", label: tr("المبلغ بإشارة"), type: "number", aliases: ["amount", "المبلغ", "قيمة"], description: tr("بديل عن عمودَي الإيداع والسحب") },
      { key: "balance", label: tr("الرصيد"), type: "number", aliases: ["balance", "running balance", "الرصيد"], description: tr("للمراجعة فقط") },
    ],
    validate: (parsedRows) => {
      const issues = new Map<number, ImportIssue[]>()
      for (const row of parsedRows) {
        const hasAmount = [row.data.deposit, row.data.withdrawal, row.data.amount].some((value) => value !== null && value !== "" && value !== undefined)
        if (!hasAmount) issues.set(row.id, [{ field: "deposit", message: tr("لا يوجد مبلغ (إيداع أو سحب أو مبلغ)") }])
        else if (row.data.deposit && row.data.withdrawal) issues.set(row.id, [{ field: "withdrawal", message: tr("السطر فيه إيداع وسحب معاً") }])
      }
      return issues
    },
    importRows: async (parsedRows, _ctx, report) => {
      try {
        await api(`/api/bank-reconciliations/${id}`, { method: "PATCH", body: JSON.stringify({ action: "add_lines", lines: parsedRows.map((row) => row.data) }) })
        for (const row of parsedRows) report(row.id, { ok: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : tr("تعذر الإضافة")
        for (const row of parsedRows) report(row.id, { ok: false, message })
      }
    },
  }), [id])

  const exportExcel = async () => {
    if (!detail) return
    const XLSX = await import("xlsx")
    const book = XLSX.utils.book_new()
    const s = detail.summary
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["التسوية البنكية", `${detail.header.account_code} - ${detail.header.account_name}`],
      ["الفترة", `${detail.header.statement_from} — ${detail.header.statement_to}`],
      [],
      ["الرصيد الختامي حسب كشف البنك", s.closing_balance],
      ["+ إيداعات بالدفاتر لم تظهر في الكشف", s.deposits_in_transit],
      ["− مدفوعات/شيكات بالدفاتر لم تظهر في الكشف", s.outstanding_payments],
      ["= رصيد البنك المعدّل", s.adjusted_bank_balance],
      [],
      ["رصيد الحساب في الدفاتر", s.book_balance],
      ["+ إيداعات/فوائد بالكشف غير مسجّلة", s.bank_credits_not_in_books],
      ["− عمولات/سحوبات بالكشف غير مسجّلة", s.bank_debits_not_in_books],
      ["= رصيد الدفاتر المعدّل", s.adjusted_book_balance],
      [],
      ["الفرق", s.difference],
    ]), tr("الملخص"))
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(detail.statementLines.map((line) => ({
      التاريخ: line.txn_date, البيان: line.description, المرجع: line.reference, المبلغ: line.amount,
      الحالة: line.matched ? `مطابق (${MATCH_LABEL[line.match_type || ""] || ""})` : "غير مطابق", السندات: line.vouchers.map((v) => v.vch_code).join("، "),
    }))), tr("كشف البنك"))
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(detail.bookLines.filter((line) => line.in_period || line.matched_here).map((line) => ({
      التاريخ: line.vch_date, السند: line.vch_code, النوع: line.vch_type_name, البيان: line.note || line.voucher_note, المبلغ: line.amount,
      الحالة: line.reconciliation_id != null ? "مطابق" : "غير مطابق",
    }))), tr("الدفاتر"))
    XLSX.writeFile(book, `تسوية-بنكية-${detail.header.account_code}-${detail.header.statement_to}.xlsx`)
  }

  if (!detail) return <div dir={appDir()} className="p-10 text-center text-muted-foreground">{tr("جاري تحميل التسوية...")}</div>
  const s = detail.summary
  const balanced = Math.abs(s.difference) < 0.005

  return (
    <div dir={appDir()} className="space-y-4 p-3 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack} aria-label={tr("رجوع")}><ArrowRight className="h-4 w-4" /></Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
              {detail.header.account_name} <span className="font-mono text-sm text-slate-500">{detail.header.account_code}</span>
              {locked ? <Badge className="bg-slate-700"><Lock className="me-1 h-3 w-3" />{tr("مُقفلة")}</Badge> : <Badge className="bg-amber-500">{tr("مفتوحة")}</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">{tr("كشف من ")}{detail.header.statement_from}{tr(" إلى ")}{detail.header.statement_to} {detail.header.currency_code ? `• ${detail.header.currency_code}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked && <Button variant="outline" onClick={() => setImportOpen(true)} disabled={busy}><Upload className="me-2 h-4 w-4" />{tr("استيراد كشف")}</Button>}
          <Button variant="outline" onClick={() => void exportExcel()}><FileSpreadsheet className="me-2 h-4 w-4" />{tr("تصدير Excel")}</Button>
          {locked
            ? <Button variant="outline" onClick={() => void run({ action: "reopen" })} disabled={busy}><LockOpen className="me-2 h-4 w-4" />{tr("إعادة فتح")}</Button>
            : <Button onClick={async () => {
                if (!balanced && !(await confirmYesNo(tr("يوجد فرق {0} — إقفال التسوية رغم الفرق؟", fmt(s.difference))))) return
                void run({ action: "finalize", force: !balanced })
              }} disabled={busy} className={balanced ? "bg-emerald-600 hover:bg-emerald-700" : ""}><Lock className="me-2 h-4 w-4" />{tr("إقفال التسوية")}</Button>}
          {!locked && <Button variant="outline" className="text-rose-600" onClick={() => void remove()} disabled={busy}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      {/* الملخص */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card><CardContent className="space-y-1.5 pt-5 text-sm">
          <div className="mb-2 font-bold text-slate-700">{tr("حسب كشف البنك")}</div>
          <Row label={tr("الرصيد الختامي في الكشف")} value={s.closing_balance} strong />
          <Row label={tr("+ إيداعات بالدفاتر لم تظهر بالكشف")} value={s.deposits_in_transit} />
          <Row label={tr("− شيكات/دفعات معلّقة لم تظهر بالكشف")} value={-s.outstanding_payments} />
          <Row label={tr("= رصيد البنك المعدّل")} value={s.adjusted_bank_balance} strong border />
        </CardContent></Card>
        <Card><CardContent className="space-y-1.5 pt-5 text-sm">
          <div className="mb-2 font-bold text-slate-700">{tr("حسب الدفاتر")}</div>
          <Row label={tr("رصيد الحساب حتى نهاية الكشف")} value={s.book_balance} strong />
          <Row label={tr("+ إيداعات/فوائد بالكشف غير مسجّلة")} value={s.bank_credits_not_in_books} />
          <Row label={tr("− عمولات/سحوبات بالكشف غير مسجّلة")} value={-s.bank_debits_not_in_books} />
          <Row label={tr("= رصيد الدفاتر المعدّل")} value={s.adjusted_book_balance} strong border />
        </CardContent></Card>
        <Card className={balanced ? "border-emerald-300 bg-emerald-50/60" : "border-rose-200 bg-rose-50/50"}>
          <CardContent className="space-y-2 pt-5 text-sm">
            <div className="flex items-center justify-between font-bold">
              <span>{tr("الفرق")}</span>
              <span className={`font-mono text-2xl ${balanced ? "text-emerald-600" : "text-rose-600"}`}>{fmt(s.difference)}</span>
            </div>
            {balanced && <div className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" />{tr("التسوية متوازنة")}</div>}
            <div className="text-xs text-slate-500">{tr("أسطر الكشف المطابقة: ")}<b>{s.matched_statement_lines} / {s.statement_lines}</b>{tr(" • أسطر الدفاتر المطابقة: ")}<b>{s.matched_book_lines} / {s.book_lines}</b></div>
            {Math.abs(s.statement_check_difference) > 0.005 && (
              <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                {tr("الرصيد الافتتاحي (")}{fmt(s.opening_balance)}{tr(") + حركات الكشف (")}{fmt(s.statement_movement)}{tr(") لا يساوي الرصيد الختامي — الفرق ")}{fmt(s.statement_check_difference)}{tr(". تأكد من استيراد كل أسطر الكشف أو من الأرصدة.")}
              </div>
            )}
            {!locked && (
              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                <div><Label className="text-[11px]">{tr("الافتتاحي بالكشف")}</Label><Input className="h-8" inputMode="decimal" value={balances.opening_balance} onChange={(event) => setBalances({ ...balances, opening_balance: event.target.value })} /></div>
                <div><Label className="text-[11px]">{tr("الختامي بالكشف")}</Label><Input className="h-8" inputMode="decimal" value={balances.closing_balance} onChange={(event) => setBalances({ ...balances, closing_balance: event.target.value })} /></div>
                <Button size="sm" variant="outline" className="col-span-2" disabled={busy}
                  onClick={() => void run({ action: "update_header", opening_balance: Number(balances.opening_balance) || 0, closing_balance: Number(balances.closing_balance) || 0, note: balances.note })}>{tr("حفظ الأرصدة")}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* المطابقة التلقائية */}
      {!locked && (
        <Card><CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Wand2 className="h-5 w-5 text-violet-600" />
          <span className="text-sm font-semibold">{tr("المطابقة التلقائية")}</span>
          <span className="text-xs text-slate-500">{tr("بالمبلغ ورقم السند/الشيك، ثم المبلغ وأقرب تاريخ، ثم الإيداعات المجمّعة")}</span>
          <div className="flex items-center gap-1.5 text-xs">{tr("فرق تاريخ حتى")}<Input className="h-8 w-16 text-center" value={tolerance} onChange={(event) => setTolerance(event.target.value.replace(/\D/g, ""))} />{tr("يوم")}</div>
          <Button size="sm" onClick={() => void run({ action: "auto_match", date_tolerance_days: Number(tolerance) || 0 })} disabled={busy || !statementLines.length}>
            <Sparkles className="me-1.5 h-4 w-4" />{tr("طابق الآن")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void run({ action: "unmatch_auto" })} disabled={busy}>{tr("إلغاء المطابقات التلقائية")}</Button>
        </CardContent></Card>
      )}

      {/* شريط المطابقة اليدوية */}
      {!locked && currentLine && !currentLine.matched && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm shadow-sm">
          <Link2 className="h-4 w-4 text-violet-700" />
          <span>{tr("سطر الكشف: ")}<b className="font-mono">{fmt(currentLine.amount)}</b></span>
          <span>{tr("المختار من الدفاتر: ")}<b className="font-mono">{fmt(selectedTotal)}</b> ({selectedBook.size})</span>
          <span className={same(matchDifference, 0) ? "text-emerald-700" : "text-rose-600"}>{tr("الفرق: ")}<b className="font-mono">{fmt(matchDifference)}</b></span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" disabled={busy || !selectedBook.size} onClick={async () => {
              const force = !same(matchDifference, 0)
              if (force && !(await confirmYesNo(tr("المبلغان غير متساويين (الفرق {0}). المطابقة رغم الفرق؟", fmt(matchDifference))))) return
              void run({ action: "match", statement_line_id: currentLine.id, journal_detail_ids: [...selectedBook], force })
            }}>{tr("مطابقة")}</Button>
            <Button size="sm" variant="outline" onClick={() => setJournalFor(currentLine)} disabled={busy}>{tr("تسجيل قيد")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelectedLine(null); setSelectedBook(new Set()) }}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* كشف البنك */}
        <Card className="overflow-hidden">
          <PanelHeader title={tr("كشف البنك")} count={visibleStatement.length} filter={statementFilter} onFilter={setStatementFilter} search={statementSearch} onSearch={setStatementSearch} />
          <div className="max-h-[60vh] overflow-auto">
            {visibleStatement.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{statementLines.length ? tr("لا توجد أسطر بهذا الفلتر") : tr("لم يُستورد كشف بعد — اضغط «استيراد كشف»")}</div>
            ) : visibleStatement.map((line) => (
              <div key={line.id}
                onClick={() => { if (locked || line.matched) return; setSelectedLine(line.id === selectedLine ? null : line.id); setSelectedBook(new Set()) }}
                className={`flex items-start gap-3 border-b px-3 py-2 text-sm ${line.matched ? "bg-emerald-50/40" : "cursor-pointer hover:bg-slate-50"} ${line.id === selectedLine ? "ring-2 ring-inset ring-violet-400" : ""}`}>
                <div className="w-20 shrink-0 font-mono text-xs text-slate-500">{line.txn_date}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{line.description || "—"}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {line.reference && <span className="font-mono">#{line.reference}</span>}
                    {line.matched && (
                      <>
                        <Badge variant="outline" className="border-emerald-300 px-1.5 py-0 text-[10px] text-emerald-700">{MATCH_LABEL[line.match_type || ""] || tr("مطابق")}{line.score ? ` ${line.score}%` : ""}</Badge>
                        {line.vouchers.map((voucher) => <span key={voucher.vch_code} className="font-mono text-emerald-700">{voucher.vch_code}</span>)}
                      </>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 font-mono font-semibold ${line.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmt(line.amount)}</div>
                {!locked && line.matched && (
                  <button type="button" title={tr("فك المطابقة")} className="shrink-0 text-slate-400 hover:text-rose-600" onClick={(event) => { event.stopPropagation(); void run({ action: "unmatch", statement_line_id: line.id }) }}><Unlink className="h-4 w-4" /></button>
                )}
                {!locked && !line.matched && (
                  <button type="button" title={tr("حذف السطر")} className="shrink-0 text-slate-300 hover:text-rose-600" onClick={async (event) => { event.stopPropagation(); if ((await confirmYesNo(tr("حذف سطر الكشف؟")))) void run({ action: "delete_line", statement_line_id: line.id }, { quiet: true }) }}><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* الدفاتر */}
        <Card className="overflow-hidden">
          <PanelHeader title={tr("قيود حساب البنك في الدفاتر")} count={visibleBook.length} filter={bookFilter} onFilter={setBookFilter} search={bookSearch} onSearch={setBookSearch} />
          {currentLine && !currentLine.matched && <div className="border-b bg-violet-50/60 px-3 py-1.5 text-[11px] text-violet-700">{tr("اختر سطر/أسطر القيد المقابلة — المرشّحون بنفس المبلغ في الأعلى")}</div>}
          <div className="max-h-[60vh] overflow-auto">
            {visibleBook.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{tr("لا توجد قيود بهذا الفلتر")}</div>
            ) : visibleBook.map((line) => {
              const matched = line.reconciliation_id != null
              const selectable = !locked && !matched && Boolean(currentLine && !currentLine.matched)
              const suggested = Boolean(currentLine && same(line.amount, currentLine.amount) && !matched)
              return (
                <label key={line.id} className={`flex items-start gap-3 border-b px-3 py-2 text-sm ${matched ? "bg-emerald-50/40" : suggested ? "bg-violet-50/50" : ""} ${selectable ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" disabled={!selectable} checked={selectedBook.has(line.id)}
                    onChange={(event) => setSelectedBook((current) => { const next = new Set(current); if (event.target.checked) next.add(line.id); else next.delete(line.id); return next })} />
                  <div className="w-20 shrink-0 font-mono text-xs text-slate-500">{line.vch_date}{!line.in_period && <div className="text-[10px] text-amber-600">{tr("خارج الفترة")}</div>}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold">{line.vch_code}</span>
                      <span className="text-xs text-slate-500">{line.vch_type_name}</span>
                      {Number(line.voucher_status) === 1 && <Badge variant="outline" className="px-1 py-0 text-[10px] text-amber-700">{tr("غير معتمد")}</Badge>}
                      {line.matched_elsewhere && <Badge variant="outline" className="px-1 py-0 text-[10px]">{tr("مسوّى في تسوية أخرى")}</Badge>}
                    </div>
                    <div className="truncate text-xs text-slate-500">{[line.note || line.voucher_note, line.cheque_numbers && `شيك ${line.cheque_numbers}`, line.manual_voucher].filter(Boolean).join(" • ") || "—"}</div>
                  </div>
                  <div className={`shrink-0 font-mono font-semibold ${line.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmt(line.amount)}</div>
                </label>
              )
            })}
          </div>
        </Card>
      </div>

      <ExcelImportWizard open={importOpen} onOpenChange={setImportOpen} config={importConfig} onImported={() => void load()} />
      <CreateJournalDialog line={journalFor} busy={busy} onClose={() => setJournalFor(null)}
        onSubmit={async (counterAccountId, note) => {
          if (!journalFor) return
          const ok = await run({ action: "create_journal", statement_line_id: journalFor.id, counter_account_id: counterAccountId, note })
          if (ok) setJournalFor(null)
        }} />
    </div>
  )
}

function Row({ label, value, strong, border }: { label: string; value: number; strong?: boolean; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${border ? "border-t pt-1.5" : ""} ${strong ? "font-bold" : "text-slate-600"}`}>
      <span>{label}</span><span className="font-mono">{fmt(value)}</span>
    </div>
  )
}

function PanelHeader({ title, count, filter, onFilter, search, onSearch }: {
  title: string; count: number; filter: Filter; onFilter: (filter: Filter) => void; search: string; onSearch: (value: string) => void
}) {
  const options: { value: Filter; label: string }[] = [{ value: "unmatched", label: tr("غير مطابق") }, { value: "matched", label: tr("مطابق") }, { value: "all", label: tr("الكل") }]
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-2">
      <span className="font-bold">{title}</span>
      <span className="rounded-full bg-white px-2 text-xs text-slate-500">{count}</span>
      <div className="flex overflow-hidden rounded-lg border bg-white text-xs">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onFilter(option.value)} className={`px-2.5 py-1 ${filter === option.value ? "bg-slate-800 text-white" : "hover:bg-slate-100"}`}>{option.label}</button>
        ))}
      </div>
      <div className="relative ms-auto w-full sm:w-48">
        <Search className="absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input className="h-8 ps-7 text-xs" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={tr("بحث...")} />
      </div>
    </div>
  )
}

function CreateJournalDialog({ line, busy, onClose, onSubmit }: {
  line: StatementLine | null; busy: boolean; onClose: () => void; onSubmit: (counterAccountId: number, note: string) => void | Promise<void>
}) {
  const [counter, setCounter] = useState("")
  const [note, setNote] = useState("")
  useEffect(() => { if (line) { setCounter(""); setNote(line.description || "") } }, [line])
  if (!line) return null
  const deposit = line.amount > 0
  return (
    <Dialog open={Boolean(line)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent dir={appDir()} className="max-w-lg">
        <DialogHeader><DialogTitle>{tr("تسجيل قيد لسطر الكشف")}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex justify-between"><span>{line.txn_date} — {line.description || "—"}</span><b className={`font-mono ${deposit ? "text-emerald-700" : "text-rose-600"}`}>{fmt(line.amount)}</b></div>
            <div className="mt-1 text-xs text-slate-500">
              {deposit ? tr("مدين: حساب البنك • دائن: الحساب المقابل (مثلاً إيرادات فوائد)") : tr("مدين: الحساب المقابل (مثلاً مصروف عمولات بنكية) • دائن: حساب البنك")}
            </div>
          </div>
          <AutoCompleteAccount label={tr("الحساب المقابل *")} value={counter} valueMode="id" showCostCenterButton={false} onValueChange={setCounter} />
          <div className="space-y-1.5"><Label>{tr("البيان")}</Label><Input value={note} maxLength={70} onChange={(event) => setNote(event.target.value)} /></div>
          <p className="text-xs text-slate-500">{tr("يُنشأ سند قيد معتمد بتاريخ سطر الكشف ويُطابَق معه مباشرة.")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{tr("إلغاء")}</Button>
            <Button disabled={busy || !counter} onClick={() => void onSubmit(Number(counter), note)}>{tr("إنشاء القيد ومطابقته")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
