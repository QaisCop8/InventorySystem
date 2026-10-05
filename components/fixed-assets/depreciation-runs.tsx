"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Calculator, CheckCircle2, History, Loader2, RotateCcw, Send } from "lucide-react"
import { periodEnd } from "@/lib/fixed-assets/depreciation"
import { api, CsvButton, DataTable, day, exportCsv, Field, money, n, SectionCard, Stat, StatusBadge, thisPeriod, type Column, type Lookups, type Row } from "./shared"

export function DepreciationRuns({ lookups, onChanged }: { lookups: Lookups; onChanged: (message: string) => void }) {
  const [period, setPeriod] = useState(thisPeriod())
  const [postingDate, setPostingDate] = useState(periodEnd(thisPeriod()))
  const [notes, setNotes] = useState("")
  const [preview, setPreview] = useState<Row[] | null>(null)
  const [runs, setRuns] = useState<Row[]>([])
  const [busy, setBusy] = useState<"" | "preview" | "post" | "reverse">("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [reverseRun, setReverseRun] = useState<Row | null>(null)
  const [detail, setDetail] = useState<{ run: Row; lines: Row[] } | null>(null)
  const branchIds = useMemo(() => lookups.branches.filter(row => row.current).map(row => Number(row.id)), [lookups.branches])

  const loadRuns = async () => {
    try { setRuns((await api<{ runs: Row[] }>("/api/fixed-assets/depreciation")).runs) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل التشغيلات") }
  }
  useEffect(() => { void loadRuns() }, [])

  const calculate = async () => {
    setBusy("preview")
    setError("")
    setSuccess("")
    try {
      const data = await api<{ lines: Row[]; postingDate: string }>(`/api/fixed-assets/depreciation?preview=1&period=${period}&branch_ids=${branchIds.join(",")}`)
      setPreview(data.lines)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الاحتساب")
    } finally {
      setBusy("")
    }
  }

  const post = async () => {
    setBusy("post")
    setError("")
    try {
      const result = await api<Row>("/api/fixed-assets/depreciation", { method: "POST", json: { period, posting_date: postingDate, branch_ids: branchIds, notes } })
      const message = `تم ترحيل ${result.runNo}: ${money(result.total)} لعدد ${result.assetCount} أصل`
      setSuccess(message)
      setPreview(null)
      onChanged(message)
      await loadRuns()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الترحيل")
    } finally {
      setBusy("")
    }
  }

  const reverse = async () => {
    const run = reverseRun
    setReverseRun(null)
    if (!run) return
    setBusy("reverse")
    setError("")
    try {
      await api(`/api/fixed-assets/depreciation/${run.id}`, { method: "DELETE" })
      setSuccess(`تم عكس ${run.run_no} وإنشاء قيد عكسي`)
      onChanged(`تم عكس ${run.run_no}`)
      await loadRuns()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر العكس")
    } finally {
      setBusy("")
    }
  }

  const openDetail = async (run: Row) => {
    try { setDetail({ run, lines: (await api<{ lines: Row[] }>(`/api/fixed-assets/depreciation/${run.id}`)).lines }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التحميل") }
  }

  const total = (preview ?? []).reduce((sum, row) => sum + n(row.depreciation_amount), 0)
  const assets = new Set((preview ?? []).map(row => row.asset_id)).size
  const catchUp = (preview ?? []).filter(row => row.period < period).length
  const previewColumns: Column[] = [
    { key: "asset_no", label: "رقم الأصل" },
    { key: "asset_name", label: "الأصل" },
    { key: "category_name", label: "التصنيف" },
    { key: "period", label: "الفترة", render: row => <span className={row.period < period ? "font-bold text-amber-600" : ""}>{row.period}</span> },
    { key: "cost", label: "التكلفة", numeric: true },
    { key: "opening_book_value", label: "القيمة الافتتاحية", numeric: true },
    { key: "depreciation_amount", label: "الإهلاك", numeric: true, total: true },
    { key: "closing_book_value", label: "القيمة الدفترية بعد", numeric: true },
  ]

  return <div className="space-y-4">
    {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
    {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

    <SectionCard title="تشغيل الإهلاك الشهري" icon={<Calculator className="h-4 w-4" />}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
        {["احتساب", "مراجعة", "ترحيل", "قيد محاسبي"].map((step, index) => <span key={step} className="flex items-center gap-2">
          <span className={`grid h-6 w-6 place-items-center rounded-full ${index === 0 || (preview && index === 1) ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700"}`}>{index + 1}</span>{step}{index < 3 && <span className="text-slate-300">—</span>}
        </span>)}
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="الفترة" htmlFor="fa-run-period"><Input id="fa-run-period" type="month" value={period} onChange={event => { setPeriod(event.target.value); setPostingDate(periodEnd(event.target.value)); setPreview(null) }} /></Field>
        <Field label="الدفتر"><Input value="الدفتر المحاسبي" disabled /></Field>
        <Field label="تاريخ الترحيل" htmlFor="fa-run-date"><Input id="fa-run-date" type="date" value={postingDate} onChange={event => setPostingDate(event.target.value)} /></Field>
        <Field label="ملاحظات" htmlFor="fa-run-notes"><Input id="fa-run-notes" value={notes} onChange={event => setNotes(event.target.value)} /></Field>
        <Button onClick={() => void calculate()} disabled={busy !== "" || !period}>{busy === "preview" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Calculator className="ml-2 h-4 w-4" />}احتساب</Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">يشمل التشغيل كل الإهلاك المخطط غير المرحّل حتى الفترة المختارة (بما فيها الأشهر السابقة الفائتة) لأصول الفرع الحالي، ويُنشئ قيد إهلاك واحداً مجمّعاً حسب الحسابات ومراكز التكلفة.</p>
    </SectionCard>

    {preview && <SectionCard title="مراجعة قبل الترحيل" actions={<>
      <CsvButton onClick={() => exportCsv(`depreciation-${period}`, previewColumns, preview)} disabled={!preview.length} />
      <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => void post()} disabled={busy !== "" || !preview.length}>{busy === "post" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}ترحيل وإنشاء القيد</Button>
    </>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Stat label="إجمالي الإهلاك" value={money(total)} tone="teal" />
        <Stat label="عدد الأصول" value={assets} />
        <Stat label="أشهر سابقة غير مرحّلة" value={catchUp} tone={catchUp ? "amber" : "slate"} hint={catchUp ? "ستُرحّل ضمن هذا التشغيل" : undefined} />
      </div>
      <DataTable rows={preview} columns={previewColumns} maxHeight="45dvh" empty="لا يوجد إهلاك مخطط غير مرحّل حتى هذه الفترة" />
    </SectionCard>}

    <SectionCard title="سجل تشغيلات الإهلاك" icon={<History className="h-4 w-4" />}>
      <DataTable rows={runs} footer={false} maxHeight="45dvh" onRowClick={row => void openDetail(row)} columns={[
        { key: "run_no", label: "الرقم" },
        { key: "period", label: "الفترة" },
        { key: "posting_date", label: "تاريخ الترحيل", render: row => day(row.posting_date) },
        { key: "asset_count", label: "الأصول" },
        { key: "total_amount", label: "المبلغ", numeric: true },
        { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} /> },
        { key: "journal_codes", label: "القيود", render: row => (row.journal_codes ?? []).join("، ") },
        { key: "reversal_codes", label: "قيود العكس", render: row => (row.reversal_codes ?? []).join("، ") },
        { key: "actions", label: "", render: row => row.status === "POSTED" ? <Button size="sm" variant="ghost" className="text-rose-600" disabled={busy !== ""} onClick={event => { event.stopPropagation(); setReverseRun(row) }}><RotateCcw className="ml-1 h-4 w-4" />عكس</Button> : null },
      ]} empty="لم يتم ترحيل أي إهلاك بعد" />
    </SectionCard>

    <ConfirmDialogYesNo useAppDialog visible={reverseRun !== null} message={`عكس تشغيل الإهلاك ${reverseRun?.run_no ?? ""}؟ سيُنشأ قيد عكسي وتعود الفترات إلى "مخطط".`} onConfirm={() => void reverse()} onCancel={() => setReverseRun(null)} />
    <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null) }}>
      <DialogContent dir="rtl" className="w-[94vw] max-w-4xl">
        <DialogHeader><DialogTitle>{detail?.run.run_no} — {detail?.run.period}</DialogTitle><DialogDescription>بنود تشغيل الإهلاك</DialogDescription></DialogHeader>
        <DataTable rows={detail?.lines ?? []} maxHeight="60dvh" columns={[
          { key: "asset_no", label: "رقم الأصل" }, { key: "asset_name", label: "الأصل" }, { key: "category_name", label: "التصنيف" },
          { key: "branch_name", label: "الفرع" }, { key: "period", label: "الفترة" },
          { key: "depreciation_amount", label: "الإهلاك", numeric: true, total: true },
          { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} /> },
        ]} />
      </DialogContent>
    </Dialog>
  </div>
}
