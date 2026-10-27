"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"

type VoucherType = { id: number; name: string }
type Voucher = {
  id: number
  vch_type: number
  vch_code: string
  vch_date: string
  branch_id: number
  branch_name: string | null
  amount: number
}
type PostingResult = { id: number; vch_type: number; vch_code: string; ok: boolean; error?: string }

const pad = (value: number) => String(value).padStart(2, "0")
const today = new Date()
const todayValue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
const monthStart = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`
const voucherKey = (voucher: Voucher) => `${voucher.vch_type}:${voucher.id}`

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data
}

function voucherEndpoint(vchType: number) {
  return vchType === 3
    ? "journal-vouchers"
    : [4, 5].includes(vchType)
      ? "receipts"
      : [6, 7].includes(vchType)
        ? "credit-notes"
        : [8, 9, 10, 11].includes(vchType)
          ? "stock-vouchers"
          : vchType >= 12 && vchType <= 19
            ? "sales-vouchers"
            : vchType === 21
              ? "cheque-payment-vouchers"
              : null
}

async function fetchVoucherDetails(voucher: Voucher) {
  const endpoint = voucherEndpoint(voucher.vch_type)
  if (!endpoint) throw new Error("نوع السند غير مدعوم للترحيل من هذه الشاشة")
  return responseData(await fetch(`/api/${endpoint}/${voucher.id}`, { cache: "no-store" }))
}

async function postVoucher(voucher: Voucher, details?: any) {
  if (voucher.vch_type === 20) {
    const response = await fetch("/api/production-vouchers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: voucher.id, action: "post" }),
    })
    await responseData(response)
    return
  }

  const endpoint = voucherEndpoint(voucher.vch_type)
  if (!endpoint) throw new Error("نوع السند غير مدعوم للترحيل من هذه الشاشة")

  if (voucher.vch_type === 21) {
    const response = await fetch(`/api/${endpoint}/${voucher.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post" }),
    })
    await responseData(response)
    return
  }

  const voucherDetails = details ?? await fetchVoucherDetails(voucher)
  await responseData(await fetch(`/api/${endpoint}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...voucherDetails, status: 2 }),
  }))
}

export default function VoucherPostingTools() {
  const [fromDate, setFromDate] = useState(monthStart)
  const [toDate, setToDate] = useState(todayValue)
  const [voucherTypeIds, setVoucherTypeIds] = useState<number[]>([])
  const [types, setTypes] = useState<VoucherType[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError] = useState("")
  const [results, setResults] = useState<PostingResult[]>([])
  const [confirmPosting, setConfirmPosting] = useState(false)

  const load = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("حدد فترة تاريخ صحيحة")
      return
    }
    setLoading(true)
    setError("")
    setResults([])
    try {
      const params = new URLSearchParams({ from_date: fromDate, to_date: toDate })
      voucherTypeIds.forEach((id) => params.append("vch_type", String(id)))
      const data = await responseData(await fetch(`/api/voucher-posting-tools?${params}`, { cache: "no-store" }))
      setTypes(Array.isArray(data.types) ? data.types : [])
      setVouchers(Array.isArray(data.vouchers) ? data.vouchers : [])
      setSelected(new Set())
      setProgress("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل السندات")
      setVouchers([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, voucherTypeIds])

  useEffect(() => { void load() }, [load])

  const allSelected = vouchers.length > 0 && vouchers.every((voucher) => selected.has(voucherKey(voucher)))
  const selectedCount = selected.size
  const typeName = useMemo(() => new Map(types.map((type) => [type.id, type.name])), [types])
  const resultByKey = useMemo(() => new Map(results.map((result) => [`${result.vch_type}:${result.id}`, result])), [results])

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(vouchers.map(voucherKey)))
  }

  const toggleOne = (voucher: Voucher) => {
    setSelected((previous) => {
      const next = new Set(previous)
      const key = voucherKey(voucher)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const postSelected = async () => {
    const queue = vouchers.filter((voucher) => selected.has(voucherKey(voucher)))
    if (!queue.length || posting) return
    setConfirmPosting(true)
  }

  const confirmSelectedPosting = async () => {
    const queue = vouchers.filter((voucher) => selected.has(voucherKey(voucher)))
    if (!queue.length || posting) return
    setConfirmPosting(false)
    setPosting(true)
    setResults([])
    const completed: PostingResult[] = []
    for (let offset = 0; offset < queue.length; offset += 4) {
      const batch = queue.slice(offset, offset + 4)
      setProgress(`جاري تجهيز بيانات السندات ${offset + 1} إلى ${offset + batch.length}...`)
      const detailResults = await Promise.all(batch.map(async (voucher) => {
        if ([20, 21].includes(voucher.vch_type)) return { key: voucherKey(voucher), details: undefined, error: undefined }
        try {
          return { key: voucherKey(voucher), details: await fetchVoucherDetails(voucher), error: undefined }
        } catch (reason) {
          return { key: voucherKey(voucher), details: undefined, error: reason instanceof Error ? reason.message : "تعذر تحميل بيانات السند" }
        }
      }))
      const detailsByKey = new Map(detailResults.map((detail) => [detail.key, detail]))
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const voucher = batch[batchIndex]
        const index = offset + batchIndex
        setProgress(`جاري ترحيل السند رقم ${voucher.vch_code}، يرجى الانتظار (${index + 1} من ${queue.length})`)
        try {
          const detail = detailsByKey.get(voucherKey(voucher))
          if (detail?.error) throw new Error(detail.error)
          await postVoucher(voucher, detail?.details)
          completed.push({ id: voucher.id, vch_type: voucher.vch_type, vch_code: voucher.vch_code, ok: true })
        } catch (reason) {
          completed.push({ id: voucher.id, vch_type: voucher.vch_type, vch_code: voucher.vch_code, ok: false, error: reason instanceof Error ? reason.message : "تعذر الترحيل" })
        }
        setResults([...completed])
      }
    }
    setSelected(new Set())
    setPosting(false)
    setProgress("")
    await load()
    setResults(completed)
  }

  return (
    <main dir="rtl" className="space-y-4 p-3 sm:p-5">
      <header className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ترحيل السندات</h1>
          <p className="mt-1 text-sm text-slate-500">اختر الفترة ونوع السند، ثم حدد السندات المراد ترحيلها.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || posting}>
          {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCw className="ml-2 h-4 w-4" />}تحديث
        </Button>
      </header>

      <section className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <div className="space-y-1.5"><Label htmlFor="posting-from">من تاريخ</Label><Input id="posting-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="posting-to">إلى تاريخ</Label><Input id="posting-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div>
        <ReportMultiChoice label="نوع السند" options={types} selected={voucherTypeIds} onChange={setVoucherTypeIds} placeholder="كل الأنواع المسموح بها" />
        <Button onClick={() => void load()} disabled={loading || posting}>
          {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}بحث
        </Button>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {progress && <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800"><Loader2 className="h-4 w-4 animate-spin" />{progress}</div>}

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!vouchers.length || posting} className="h-4 w-4 accent-emerald-600" />
            {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}<span className="text-slate-500">({vouchers.length} سند)</span>
          </label>
          <Button onClick={() => void postSelected()} disabled={!selectedCount || posting || loading} className="gap-2">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ترحيل المحدد ({selectedCount})
          </Button>
        </div>

        {vouchers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">لا توجد سندات غير مرحلة ضمن الفترة المحددة ولديك صلاحية ترحيلها.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr><th className="w-12 p-3"><span className="sr-only">تحديد</span></th><th className="p-3 text-right">نوع السند</th><th className="p-3 text-right">رقم السند</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-left">المبلغ</th><th className="p-3 text-right">الحالة</th></tr>
              </thead>
              <tbody>
                {vouchers.map((voucher) => {
                  const result = resultByKey.get(voucherKey(voucher))
                  return <tr key={voucherKey(voucher)} className="border-t hover:bg-slate-50">
                    <td className="p-3"><input type="checkbox" checked={selected.has(voucherKey(voucher))} onChange={() => toggleOne(voucher)} disabled={posting} aria-label={`تحديد ${voucher.vch_code}`} className="h-4 w-4 accent-emerald-600" /></td>
                    <td className="p-3">{typeName.get(voucher.vch_type) || `سند ${voucher.vch_type}`}</td>
                    <td className="p-3 font-mono" dir="ltr">{voucher.vch_code}</td>
                    <td className="p-3 font-mono" dir="ltr">{voucher.vch_date}</td>
                    <td className="p-3">{voucher.branch_name || "—"}</td>
                    <td className="p-3 text-left font-mono" dir="ltr">{Number(voucher.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`p-3 ${result ? result.ok ? "text-emerald-700" : "text-rose-700" : "text-slate-400"}`} title={result?.error}>{result ? result.ok ? <CheckCircle2 className="h-4 w-4" /> : result.error : "غير مرحل"}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {results.length > 0 && <div className="rounded-lg border bg-white p-3 text-sm">
        <b>نتيجة الترحيل:</b> {results.filter((result) => result.ok).length} ناجح، {results.filter((result) => !result.ok).length} لم يترحل.
        {results.some((result) => !result.ok) && <ul className="mt-2 list-inside list-disc space-y-1 text-rose-700">{results.filter((result) => !result.ok).map((result) => <li key={`${result.vch_type}:${result.id}`}>{result.vch_code}: {result.error}</li>)}</ul>}
      </div>}
      <ConfirmDialogYesNo
        visible={confirmPosting}
        useAppDialog
        title="تأكيد ترحيل السندات"
        message={`سيتم ترحيل ${selectedCount} سند. هل تريد المتابعة؟`}
        confirmLabel="نعم، ترحيل"
        cancelLabel="إلغاء"
        onConfirm={() => void confirmSelectedPosting()}
        onCancel={() => setConfirmPosting(false)}
      />
    </main>
  )
}
