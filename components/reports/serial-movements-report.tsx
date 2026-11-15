"use client"

import { tr, appDir } from "@/lib/i18n"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Barcode, ExternalLink, History, PackageCheck, PackageX, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { voucherHref } from "@/lib/voucher-links"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

type SerialRow = {
  id: number
  serial: string
  item_id: number
  product_code: string
  product_name: string
  in_stock: boolean | null
  store_name: string | null
  last_voucher_id: number | null
  last_vch_type: number | null
  last_vch_code: string | null
  last_vch_date: string | null
  last_vch_type_name: string | null
  movements_count: number
}

type MovementRow = {
  id: number
  voucher_id: number
  in_stock: boolean
  vch_type: number
  vch_code: string
  vch_date: string
  status: number
  vch_type_name: string | null
  store_name: string | null
  party_name: string
  user_name: string
  insert_date: string | null
}

const dateOnly = (value?: string | null) => (value ? String(value).slice(0, 10) : "-")
const dateTime = (value?: string | null) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  const part = (number: number) => String(number).padStart(2, "0")
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}`
}

const serialState = (row: SerialRow) =>
  row.last_voucher_id == null
    ? { label: tr("بلا حركة"), className: "bg-slate-100 text-slate-600" }
    : row.in_stock
      ? { label: tr("في المخزون"), className: "bg-emerald-100 text-emerald-800" }
      : { label: tr("خارج المخزون"), className: "bg-amber-100 text-amber-800" }

const statusName = (status: number) => (status === 3 ? tr("ملغى") : status === 2 ? tr("معتمد") : tr("فعال"))

const openVoucher = (voucherId?: number | null, vchType?: number | null) => {
  if (!voucherId || !vchType) return
  window.open(voucherHref(Number(voucherId), Number(vchType), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")
}

export function SerialMovementsReport() {
  const [rows, setRows] = useState<SerialRow[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<SerialRow | null>(null)
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsError, setMovementsError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams({ search, status })
      const response = await fetch(`/api/reports/serial-movements?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setRows(Array.isArray(data) ? data : [])
    } catch (reason: any) {
      setError(reason.message || tr("تعذر تحميل التقرير"))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showMovements = async (row: SerialRow) => {
    setSelected(row)
    setMovements([])
    setMovementsError("")
    setMovementsLoading(true)
    try {
      const response = await fetch(`/api/reports/serial-movements?serial_id=${row.id}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل حركات الرقم"))
      setMovements(Array.isArray(data) ? data : [])
    } catch (reason: any) {
      setMovementsError(reason.message || tr("تعذر تحميل حركات الرقم"))
    } finally {
      setMovementsLoading(false)
    }
  }

  const totals = useMemo(
    () => ({
      serials: rows.length,
      inStock: rows.filter((row) => row.last_voucher_id != null && row.in_stock).length,
      out: rows.filter((row) => row.last_voucher_id != null && !row.in_stock).length,
      none: rows.filter((row) => row.last_voucher_id == null).length,
    }),
    [rows],
  )

  return (
    <ReportPage loading={loading || movementsLoading}>
      <ReportHeader
        title={<>{tr("تقرير حركات السيريال")}</>}
        description={<>{tr("الأرقام التسلسلية للأصناف وحالتها الحالية، مع كل السندات التي حرّكت كل رقم.")}</>}
        actions={
          <Button onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {tr("تحديث التقرير")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["إجمالي الأرقام", totals.serials, Barcode],
          ["في المخزون", totals.inStock, PackageCheck],
          ["خارج المخزون", totals.out, PackageX],
          ["بلا حركة فعّالة", totals.none, History],
        ].map(([label, value, Icon]: any) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString("en-US")}</p>
              </div>
              <Icon className="h-7 w-7 text-emerald-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <ReportFilters>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_200px_auto] md:items-end">
          <div>
            <Label>{tr("بحث")}</Label>
            <div className="relative mt-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-report-apply-on-enter
                className="ps-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load()}
                placeholder={tr("الرقم التسلسلي أو رقم/اسم الصنف")}
              />
            </div>
          </div>
          <div>
            <Label>{tr("الحالة")}</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">{tr("الكل")}</option>
              <option value="in_stock">{tr("في المخزون")}</option>
              <option value="out">{tr("خارج المخزون")}</option>
              <option value="none">{tr("بلا حركة فعّالة")}</option>
            </select>
          </div>
          <Button data-report-apply onClick={() => void load()}>
            {tr("تطبيق")}
          </Button>
        </CardContent>
      </ReportFilters>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <ReportGrid rows={rows} exportFileName={tr("تقرير الأرقام التسلسلية")} onRowDoubleClick={(row: any) => void showMovements(row)}
            columns={[
              { key: "product_code", label: tr("رقم الصنف"), width: 130 },
              { key: "product_name", label: tr("اسم الصنف"), width: "*", minWidth: 200 },
              { key: "serial", label: tr("الرقم التسلسلي"), width: 170 },
              { key: "state", label: tr("الحالة"), width: 120, value: (row: any) => serialState(row).label, render: (row: any) => { const state = serialState(row); return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state.className}`}>{state.label}</span> } },
              { key: "store", label: tr("المستودع"), width: 130, value: (row: any) => row.last_voucher_id != null && row.in_stock ? row.store_name || "" : "" },
              { key: "last_vch", label: tr("آخر حركة"), width: 170, value: (row: any) => row.last_voucher_id ? `${row.last_vch_type_name || ""} ${row.last_vch_code}` : "", render: (row: any) => row.last_voucher_id ? <button className="text-start" onClick={(event) => { event.stopPropagation(); openVoucher(row.last_voucher_id, row.last_vch_type) }}><span className="text-xs text-muted-foreground">{row.last_vch_type_name || "-"} </span><span className="font-mono font-bold text-blue-700 underline">{row.last_vch_code}</span></button> : "-" },
              { key: "last_vch_date", label: tr("تاريخ آخر حركة"), width: 120, value: (row: any) => dateOnly(row.last_vch_date) },
              { key: "movements_count", label: tr("عدد الحركات"), type: "number", decimals: 0, width: 100 },
              { key: "actions", label: tr("الحركات"), width: 110, render: (row: any) => <Button size="sm" variant="outline" className="h-7 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={(event) => { event.stopPropagation(); void showMovements(row) }}><History className="h-3.5 w-3.5" />{tr("الحركات")}</Button> },
            ]}/>
        {!loading && !rows.length && <div className="py-16 text-center text-muted-foreground">{tr("لا توجد أرقام تسلسلية مطابقة للفلاتر")}</div>}
        {rows.length >= 2000 && <div className="border-t bg-amber-50 py-2 text-center text-xs text-amber-800">{tr("يُعرض أول 2000 رقم فقط — ضيّق البحث")}</div>}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir={appDir()} className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {tr("حركات الرقم التسلسلي")}
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700" dir="ltr">
                {selected?.serial}
              </span>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm sm:grid-cols-3">
                <div>
                  {tr("الصنف: ")}<b>{selected.product_code} — {selected.product_name}</b>
                </div>
                <div>
                  {tr("الحالة: ")}<b>{serialState(selected).label}</b>
                </div>
                <div>
                  {tr("المستودع الحالي: ")}<b>{selected.last_voucher_id != null && selected.in_stock ? selected.store_name || "-" : "-"}</b>
                </div>
              </div>

              {movementsError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{movementsError}</div>}

              <div className="overflow-hidden rounded-xl border">
                <ReportGrid rows={movements} exportFileName={tr("حركات الرقم التسلسلي")} height={360}
                  onRowDoubleClick={(movement: any) => openVoucher(movement.voucher_id, movement.vch_type)}
                  rowClassName={(movement: any) => Number(movement.status) === 3 ? "report-row-muted" : undefined}
                  columns={[
                    { key: "vch_type_name", label: tr("نوع السند"), width: 140, value: (m: any) => m.vch_type_name || m.vch_type },
                    { key: "vch_code", label: tr("رقم السند"), width: 130, render: (m: any) => <button className="font-mono font-bold text-blue-700 underline" onClick={() => openVoucher(m.voucher_id, m.vch_type)}>{m.vch_code}</button> },
                    { key: "vch_date", label: tr("التاريخ"), width: 110, value: (m: any) => dateOnly(m.vch_date) },
                    { key: "direction", label: tr("الحركة"), width: 90, value: (m: any) => m.in_stock ? tr("دخول") : tr("خروج") },
                    { key: "store_name", label: tr("المستودع"), width: 130 },
                    { key: "party_name", label: tr("الحساب / العميل"), width: "*", minWidth: 160 },
                    { key: "user", label: tr("المستخدم"), width: 180, value: (m: any) => `${m.user_name || "-"} · ${dateTime(m.insert_date)}` },
                    { key: "status", label: tr("حالة السند"), width: 110, value: (m: any) => statusName(Number(m.status)) },
                  ]}/>
                {movementsLoading && <div className="py-10 text-center text-sm text-muted-foreground">{tr("جاري تحميل الحركات...")}</div>}
                {!movementsLoading && !movementsError && movements.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">{tr("لا توجد حركات على هذا الرقم")}</div>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                {tr("انقر رقم السند أو انقر مزدوجاً على الحركة لفتح السند. السندات الملغاة مشطوبة ولا تُحتسب في الحالة الحالية.")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ReportPage>
  )
}

export default SerialMovementsReport
