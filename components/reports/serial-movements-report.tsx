"use client"

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
    ? { label: "بلا حركة", className: "bg-slate-100 text-slate-600" }
    : row.in_stock
      ? { label: "في المخزون", className: "bg-emerald-100 text-emerald-800" }
      : { label: "خارج المخزون", className: "bg-amber-100 text-amber-800" }

const statusName = (status: number) => (status === 3 ? "ملغى" : status === 2 ? "مرحّل" : "فعال")

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
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(Array.isArray(data) ? data : [])
    } catch (reason: any) {
      setError(reason.message || "تعذر تحميل التقرير")
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
      if (!response.ok) throw new Error(data.error || "تعذر تحميل حركات الرقم")
      setMovements(Array.isArray(data) ? data : [])
    } catch (reason: any) {
      setMovementsError(reason.message || "تعذر تحميل حركات الرقم")
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
    <ReportPage>
      <ReportHeader
        title={<>تقرير حركات السيريال</>}
        description={<>الأرقام التسلسلية للأصناف وحالتها الحالية، مع كل السندات التي حرّكت كل رقم.</>}
        actions={
          <Button onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            تحديث التقرير
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
                <p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString()}</p>
              </div>
              <Icon className="h-7 w-7 text-emerald-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <ReportFilters>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_200px_auto] md:items-end">
          <div>
            <Label>بحث</Label>
            <div className="relative mt-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-report-apply-on-enter
                className="pr-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load()}
                placeholder="الرقم التسلسلي أو رقم/اسم الصنف"
              />
            </div>
          </div>
          <div>
            <Label>الحالة</Label>
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">الكل</option>
              <option value="in_stock">في المخزون</option>
              <option value="out">خارج المخزون</option>
              <option value="none">بلا حركة فعّالة</option>
            </select>
          </div>
          <Button data-report-apply onClick={() => void load()}>
            تطبيق
          </Button>
        </CardContent>
      </ReportFilters>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-emerald-100 text-emerald-950">
              <tr>
                <th className="p-4 text-right">رقم الصنف</th>
                <th className="p-4 text-right">اسم الصنف</th>
                <th className="p-4 text-right">الرقم التسلسلي</th>
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">المستودع</th>
                <th className="p-4 text-right">آخر حركة</th>
                <th className="p-4 text-right">تاريخ آخر حركة</th>
                <th className="p-4 text-center">عدد الحركات</th>
                <th className="p-4 text-center">الحركات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = serialState(row)
                return (
                  <tr key={row.id} className="cursor-pointer border-t hover:bg-emerald-50/40" onDoubleClick={() => void showMovements(row)}>
                    <td className="p-4 font-mono text-xs text-slate-600">{row.product_code}</td>
                    <td className="p-4 font-semibold">{row.product_name}</td>
                    <td className="p-4 font-mono font-bold text-emerald-700" dir="ltr">
                      {row.serial}
                    </td>
                    <td className="p-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state.className}`}>{state.label}</span>
                    </td>
                    <td className="p-4">{row.last_voucher_id != null && row.in_stock ? row.store_name || "-" : "-"}</td>
                    <td className="p-4">
                      {row.last_voucher_id ? (
                        <button
                          className="text-right"
                          onClick={(event) => {
                            event.stopPropagation()
                            openVoucher(row.last_voucher_id, row.last_vch_type)
                          }}
                        >
                          <span className="block text-xs text-muted-foreground">{row.last_vch_type_name || "-"}</span>
                          <span className="font-mono font-bold text-blue-700 underline">{row.last_vch_code}</span>
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap font-mono" dir="ltr">
                      {dateOnly(row.last_vch_date)}
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant={row.movements_count > 0 ? "default" : "secondary"}>{row.movements_count}</Badge>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={(event) => {
                          event.stopPropagation()
                          void showMovements(row)
                        }}
                      >
                        <History className="h-3.5 w-3.5" />
                        الحركات
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && <div className="py-16 text-center text-muted-foreground">لا توجد أرقام تسلسلية مطابقة للفلاتر</div>}
        {rows.length >= 2000 && <div className="border-t bg-amber-50 py-2 text-center text-xs text-amber-800">يُعرض أول 2000 رقم فقط — ضيّق البحث</div>}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              حركات الرقم التسلسلي
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700" dir="ltr">
                {selected?.serial}
              </span>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm sm:grid-cols-3">
                <div>
                  الصنف: <b>{selected.product_code} — {selected.product_name}</b>
                </div>
                <div>
                  الحالة: <b>{serialState(selected).label}</b>
                </div>
                <div>
                  المستودع الحالي: <b>{selected.last_voucher_id != null && selected.in_stock ? selected.store_name || "-" : "-"}</b>
                </div>
              </div>

              {movementsError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{movementsError}</div>}

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-3 text-right">#</th>
                      <th className="p-3 text-right">نوع السند</th>
                      <th className="p-3 text-right">رقم السند</th>
                      <th className="p-3 text-right">التاريخ</th>
                      <th className="p-3 text-right">الحركة</th>
                      <th className="p-3 text-right">المستودع</th>
                      <th className="p-3 text-right">الحساب / العميل</th>
                      <th className="p-3 text-right">المستخدم</th>
                      <th className="p-3 text-right">حالة السند</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement, index) => {
                      const cancelled = Number(movement.status) === 3
                      return (
                        <tr
                          key={movement.id}
                          className={`cursor-pointer border-t hover:bg-emerald-50/40 ${cancelled ? "text-slate-400 line-through decoration-slate-300" : ""}`}
                          onDoubleClick={() => openVoucher(movement.voucher_id, movement.vch_type)}
                          title="نقر مزدوج لفتح السند"
                        >
                          <td className="p-3 text-slate-400">{index + 1}</td>
                          <td className="p-3">{movement.vch_type_name || movement.vch_type}</td>
                          <td className="p-3">
                            <button
                              className="font-mono font-bold text-blue-700 underline"
                              onClick={() => openVoucher(movement.voucher_id, movement.vch_type)}
                            >
                              {movement.vch_code}
                            </button>
                          </td>
                          <td className="p-3 whitespace-nowrap font-mono" dir="ltr">
                            {dateOnly(movement.vch_date)}
                          </td>
                          <td className="p-3">
                            {movement.in_stock ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                <ArrowDownToLine className="h-3 w-3" />
                                دخول
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                                <ArrowUpFromLine className="h-3 w-3" />
                                خروج
                              </span>
                            )}
                          </td>
                          <td className="p-3">{movement.store_name || "-"}</td>
                          <td className="p-3">{movement.party_name || "-"}</td>
                          <td className="p-3">
                            <span className="block">{movement.user_name || "-"}</span>
                            <span className="block font-mono text-[11px] text-muted-foreground" dir="ltr">
                              {dateTime(movement.insert_date)}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant={cancelled ? "destructive" : Number(movement.status) === 2 ? "default" : "secondary"}>{statusName(Number(movement.status))}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {movementsLoading && <div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل الحركات...</div>}
                {!movementsLoading && !movementsError && movements.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">لا توجد حركات على هذا الرقم</div>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                انقر رقم السند أو انقر مزدوجاً على الحركة لفتح السند. السندات الملغاة مشطوبة ولا تُحتسب في الحالة الحالية.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ReportPage>
  )
}

export default SerialMovementsReport
