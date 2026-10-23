"use client"

import { Clock, Combine, LayoutGrid, Loader2, Plus, RefreshCw, ShoppingBag, Users, UtensilsCrossed, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { money, type FloorLocation, type FloorTable } from "./restaurant-dialogs"

export type Takeaway = { order_id: number; order_no: string; takeaway_name: string | null; location_id: number; opened_at: string; opened_by_name: string | null; remaining: number; items_count: number; paid_amount: number }

export const elapsed = (from: string | null, now: number) => {
  if (!from) return ""
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}س ${minutes % 60}د` : `${minutes}د`
}

type Props = {
  locations: FloorLocation[]; tables: FloorTable[]; takeaways: Takeaway[]; now: number; loading: boolean; busy: boolean; error: string
  locationFilter: number | "all"; onLocationFilter: (value: number | "all") => void
  statusFilter: "all" | "free" | "busy"; onStatusFilter: (value: "all" | "free" | "busy") => void
  canTakeaway: boolean; canCustody: boolean
  onRefresh: () => void; onCustody: () => void; onNewTakeaway: () => void; onTable: (table: FloorTable) => void; onOrder: (orderId: number) => void
}

/** شكل الطاولة: دائرية/مربعة/مستطيلة بلون حالتها، مع كراسي حولها بعدد المقاعد (حتى 8) */
function TableShape({ table, occupied }: { table: FloorTable; occupied: boolean }) {
  const chairs = Math.min(8, Math.max(2, table.seats || 4))
  const tone = occupied ? "bg-amber-500 text-white shadow-amber-500/30" : "bg-emerald-500 text-white shadow-emerald-500/30"
  const shape = table.shape === "round" ? "h-16 w-16 rounded-full" : table.shape === "rect" ? "h-14 w-24 rounded-xl" : "h-16 w-16 rounded-xl"
  return (
    <div className="relative flex h-24 w-full items-center justify-center">
      {Array.from({ length: chairs }).map((_, index) => {
        const angle = (index / chairs) * Math.PI * 2
        const rx = table.shape === "rect" ? 58 : 44, ry = table.shape === "rect" ? 38 : 40
        return (
          <span key={index} className={`absolute h-3 w-3 rounded-full ${occupied ? "bg-amber-300" : "bg-emerald-300"}`}
            style={{ transform: `translate(${Math.cos(angle) * rx}px, ${Math.sin(angle) * ry}px)` }} />
        )
      })}
      <div className={`relative z-10 flex items-center justify-center px-1 text-center text-lg font-black shadow-lg ${shape} ${tone}`}>
        <span className="line-clamp-2 leading-tight">{table.name}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone: string; icon: typeof Users }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-lg font-extrabold">{value}</div>
      </div>
    </div>
  )
}

export function RestaurantFloor(p: Props) {
  const { locations, tables, takeaways, now } = p
  const visible = tables.filter((table) =>
    (p.locationFilter === "all" || table.location_id === p.locationFilter) &&
    (p.statusFilter === "all" || (p.statusFilter === "busy" ? table.order_id : !table.order_id)))
  const busyCount = tables.filter((table) => table.order_id).length
  const openTotal = tables.filter((table) => table.order_id && table.is_primary).reduce((sum, table) => sum + table.remaining, 0) + takeaways.reduce((sum, row) => sum + row.remaining, 0)
  const groups = locations
    .filter((location) => p.locationFilter === "all" || location.id === p.locationFilter)
    .map((location) => ({ location, tables: visible.filter((table) => table.location_id === location.id) }))
    .filter((group) => group.tables.length)
  const unconfigured = locations.filter((location) => !location.configured)

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col bg-gradient-to-b from-rose-50/60 to-background dark:from-rose-950/10">
      {/* الشريط العلوي */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 text-white shadow"><UtensilsCrossed className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">شاشة المطعم</h1>
            <p className="text-xs text-muted-foreground">اختر طاولة لفتحها أو متابعة طلبها</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.canTakeaway && locations.length > 0 && <Button className="h-10 bg-violet-600 hover:bg-violet-700" disabled={p.busy} onClick={p.onNewTakeaway}><ShoppingBag className="ml-1 h-4 w-4" />سفري جديد</Button>}
          {p.canCustody && locations.length > 0 && <Button variant="outline" className="h-10" onClick={p.onCustody}><Wallet className="ml-1 h-4 w-4" />العهدة</Button>}
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={p.onRefresh} disabled={p.loading} title="تحديث"><RefreshCw className={`h-4 w-4 ${p.loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Stat label="طاولات فارغة" value={tables.length - busyCount} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950" icon={LayoutGrid} />
          <Stat label="طاولات مشغولة" value={busyCount} tone="bg-amber-100 text-amber-700 dark:bg-amber-950" icon={Users} />
          <Stat label="طلبات سفري" value={takeaways.length} tone="bg-violet-100 text-violet-700 dark:bg-violet-950" icon={ShoppingBag} />
          <Stat label="إجمالي المفتوح" value={money(openTotal)} tone="bg-rose-100 text-rose-700 dark:bg-rose-950" icon={Wallet} />
        </div>

        <div className="sticky top-0 z-10 -mx-3 flex flex-col gap-2 bg-background/90 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button type="button" onClick={() => p.onLocationFilter("all")}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${p.locationFilter === "all" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>كل المواقع</button>
            {locations.map((location) => {
              const active = p.locationFilter === location.id
              return (
                <button key={location.id} type="button" onClick={() => p.onLocationFilter(location.id)}
                  className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${active ? "text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                  style={active ? { backgroundColor: location.color || "#e11d48" } : undefined}>
                  {location.name} <span className="mr-1 text-xs opacity-75">{tables.filter((t) => t.location_id === location.id).length}</span>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1 text-sm md:w-72">
            {([["all", "الكل"], ["free", "فارغة"], ["busy", "مشغولة"]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => p.onStatusFilter(key)}
                className={`h-8 rounded-full font-bold ${p.statusFilter === key ? "bg-background shadow" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>

        {p.error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{p.error}</div>}
        {unconfigured.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            إعدادات البيع غير مكتملة للموقع: {unconfigured.map((l) => l.name).join("، ")} — أكملها من شاشة المواقع لتظهر الأصناف ويمكن الدفع.
          </div>
        )}

        {takeaways.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-violet-700"><ShoppingBag className="h-4 w-4" />طلبات سفري مفتوحة</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {takeaways.map((row) => (
                <button key={row.order_id} type="button" disabled={p.busy} onClick={() => p.onOrder(row.order_id)}
                  className="rounded-2xl border-2 border-violet-200 bg-card p-3 text-right shadow-sm transition hover:border-violet-400 active:scale-[0.98]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-extrabold">{row.takeaway_name || "سفري"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground"><Clock className="ml-0.5 inline h-3 w-3" />{elapsed(row.opened_at, now)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{row.order_no} · {row.items_count} صنف</div>
                  <div className="mt-1 text-base font-black text-violet-700 dark:text-violet-300">{money(row.remaining)}</div>
                  {row.paid_amount > 0 && <div className="text-[11px] text-emerald-700">مدفوع {money(row.paid_amount)}</div>}
                </button>
              ))}
            </div>
          </section>
        )}

        {p.loading && !tables.length ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-rose-600" /></div>
        ) : !locations.length ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">لا توجد مواقع نشطة لهذا الفرع. عرّف المواقع والطاولات من قائمة المطاعم.</div>
        ) : (
          groups.map(({ location, tables: list }) => (
            <section key={location.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: location.color || "#e11d48" }} />{location.name}
                <span className="font-normal text-muted-foreground">· {list.filter((t) => !t.order_id).length} فارغة من {list.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                {list.map((table) => {
                  const occupied = Boolean(table.order_id)
                  return (
                    <button key={table.id} type="button" disabled={p.busy} onClick={() => p.onTable(table)}
                      className={`flex flex-col rounded-2xl border-2 bg-card p-2 text-center shadow-sm transition active:scale-[0.97] ${occupied ? "border-amber-300 hover:border-amber-500" : "border-transparent hover:border-emerald-400"}`}>
                      <TableShape table={table} occupied={occupied} />
                      {occupied ? (
                        <div className="space-y-0.5">
                          <div className="text-base font-black text-amber-700 dark:text-amber-300">{money(table.remaining)}</div>
                          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                            <span><Clock className="ml-0.5 inline h-3 w-3" />{elapsed(table.opened_at, now)}</span>
                            <span><Users className="ml-0.5 inline h-3 w-3" />{table.guests}/{table.seats}</span>
                          </div>
                          {table.merged_with && <div className="truncate text-[11px] font-semibold text-blue-700"><Combine className="ml-0.5 inline h-3 w-3" />مع {table.merged_with}</div>}
                          {table.paid_amount > 0 && <div className="text-[11px] text-emerald-700">مدفوع {money(table.paid_amount)}</div>}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-sm font-bold text-emerald-700"><Plus className="h-4 w-4" />فتح · {table.seats} مقاعد</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
        {!p.loading && locations.length > 0 && !groups.length && <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">لا توجد طاولات مطابقة</div>}
      </div>
    </div>
  )
}
