"use client"

import { ArrowRight, ChefHat, Clock, CreditCard, Link2, Link2Off, Loader2, Minus, Pencil, Plus, Search, Send, ShoppingBag, Sparkles, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RestaurantPermission } from "@/lib/transaction-permission-definitions"
import { elapsed } from "./restaurant-floor"
import { money, qtyText, type Addon, type AddonGroup, type OrderItem } from "./restaurant-dialogs"

export type Order = {
  id: number; order_no: string; branch_id: number; location_id: number; location_name: string; status: string
  order_type: "dine_in" | "takeaway"; takeaway_name: string | null
  guests: number; customer_id: number | null; customer_name: string; discount_percent: number; note: string | null; revision: number; opened_at: string
  tables: { table_id: number; is_primary: boolean; name: string; seats: number; location_id: number; location_name: string }[]
  items: OrderItem[]; payments: { id: number; vch_code: string; amount: number; created_at: string }[]
  totals: { gross: number; remaining: number; paid: number }
}
export type Product = {
  id: number; code: string; name: string; price: number; unitId: number | null; unitName: string; category: string
  groupPrinter: string; image?: string; unitPrices: { unitId: number | null; unitName: string; price: number }[]
  addonGroups: AddonGroup[]; relatedMode: number; relatedIds: number[]
}
export type Pending = {
  key: string; productId: number; name: string; unitId: number | null; unitName: string; price: number; quantity: number; discount: number
  note: string; addons: Addon[]; groupPrinter: string; category: string; relatedOf?: string
}
export type OrderAction = { key: string; label: string; icon: typeof Users; show: boolean; onClick: () => void; tone?: string; disabled?: boolean }

type Props = {
  order: Order; now: number; busy: boolean; currency: string; can: (key: RestaurantPermission) => boolean
  products: Product[]; productById: Map<number, Product>; categories: { name: string; count: number }[]; totalProducts: number
  query: string; onQuery: (value: string) => void; category: string; onCategory: (value: string) => void
  catalogLoading: boolean; catalogError: string
  pending: Pending[]; pendingTotal: number; remainingTotal: number
  mobileTab: "menu" | "ticket"; onMobileTab: (tab: "menu" | "ticket") => void
  actions: OrderAction[]
  onBack: () => void; onAddProduct: (product: Product) => void
  onPendingQty: (key: string, delta: number) => void; onPendingRemove: (key: string) => void
  onEditPending: (key: string) => void; onEditItem: (item: OrderItem) => void
  onPendingAddons: (key: string) => void; onItemAddons: (item: OrderItem) => void
  onSend: () => void; onPay: () => void; onDiscount: () => void; onGuests: (delta: number) => void
  onUnmerge: (tableId: number, name: string) => void; onRenameTakeaway: () => void
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")
const TILE_TONES = ["from-rose-500 to-orange-400", "from-amber-500 to-yellow-400", "from-emerald-500 to-teal-400", "from-sky-500 to-indigo-400", "from-violet-500 to-fuchsia-400", "from-slate-500 to-slate-400"]
const toneFor = (text: string) => TILE_TONES[Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0) % TILE_TONES.length]

function AddonChips({ addons }: { addons?: Addon[] }) {
  if (!addons?.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {addons.map((addon) => <span key={`${addon.group}|${addon.value}`} className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">+ {addon.value}</span>)}
    </span>
  )
}

export function RestaurantOrder(p: Props) {
  const { order, can, pending } = p
  const isTakeaway = order.order_type === "takeaway"
  const hasRemaining = order.items.some((item) => item.remaining_quantity > 0)
  const itemCount = order.items.length + pending.length

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col bg-muted/20">
      {/* الشريط العلوي */}
      <header className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-l from-rose-700 to-orange-600 px-2 py-2 text-white sm:px-3">
        <Button variant="secondary" className="h-11 px-4 text-base font-extrabold" onClick={p.onBack}><ArrowRight className="ml-1 h-5 w-5" />رجوع</Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isTakeaway ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-sm font-extrabold">
              <ShoppingBag className="h-4 w-4" />سفري{order.takeaway_name ? ` — ${order.takeaway_name}` : ""}
              {can("takeaway") && <button title="تعديل الاسم" className="rounded-full p-0.5 hover:bg-white/30" disabled={p.busy} onClick={p.onRenameTakeaway}><Pencil className="h-3.5 w-3.5" /></button>}
            </span>
          ) : order.tables.map((table) => (
            <span key={table.table_id} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-sm font-extrabold">
              طاولة {table.name}
              {order.tables.length > 1 && can("split") && (
                <button title="فك الدمج" className="rounded-full p-0.5 hover:bg-white/30" disabled={p.busy} onClick={() => p.onUnmerge(table.table_id, table.name)}><Link2Off className="h-3.5 w-3.5" /></button>
              )}
            </span>
          ))}
          <span className="hidden text-xs text-rose-50 sm:inline">{order.location_name} · {order.order_no} · <Clock className="inline h-3 w-3" /> {elapsed(order.opened_at, p.now)}</span>
        </div>
        {!isTakeaway && (
          <div className="flex items-center gap-1 rounded-full bg-white/15 p-1">
            <button className="rounded-full p-1.5 hover:bg-white/20 disabled:opacity-40" disabled={!can("openTable") || p.busy || order.guests <= 1} onClick={() => p.onGuests(-1)}><Minus className="h-4 w-4" /></button>
            <span className="flex items-center gap-1 px-1 text-sm font-bold"><Users className="h-4 w-4" />{order.guests}</span>
            <button className="rounded-full p-1.5 hover:bg-white/20 disabled:opacity-40" disabled={!can("openTable") || p.busy} onClick={() => p.onGuests(1)}><Plus className="h-4 w-4" /></button>
          </div>
        )}
      </header>

      {/* RTL: العمود الأول (يمين) = الطلب بعرض ثابت، والثاني (يسار) = قائمة الأصناف بكل المساحة الباقية */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* الطلب */}
        <section className={`${p.mobileTab === "ticket" ? "flex" : "hidden"} min-h-0 flex-col border-l bg-background lg:flex`}>
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="font-extrabold">الطلب <span className="text-sm font-normal text-muted-foreground">({itemCount})</span></div>
            <div className="text-xs text-muted-foreground">{order.order_no}</div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 sm:p-3">
            {order.items.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-muted-foreground">على الطاولة</div>
                {order.items.map((item) => {
                  const paid = item.remaining_quantity <= 0
                  const product = p.productById.get(item.product_id)
                  const canEdit = !paid && (can("editItems") || can("deleteItems"))
                  return (
                    <div key={item.id} className={`rounded-xl border bg-card p-2 ${paid ? "opacity-55" : ""}`}>
                      <div className="flex items-start gap-2">
                        <span className="min-w-[2.6rem] rounded-lg bg-slate-100 px-1.5 py-1 text-center text-sm font-black dark:bg-slate-800">{qtyText(item.quantity)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold leading-tight">{item.product_name}{item.unit_name ? <span className="text-xs font-normal text-muted-foreground"> ({item.unit_name})</span> : null}</div>
                          <AddonChips addons={item.addons} />
                          {item.note && <div className="mt-0.5 text-xs text-orange-700">{item.note}</div>}
                          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                            {item.discount > 0 && <span className="rounded bg-muted px-1.5">خصم {item.discount}%</span>}
                            {item.paid_quantity > 0 && <span className="rounded bg-emerald-100 px-1.5 text-emerald-700 dark:bg-emerald-950">{paid ? "مدفوع" : `مدفوع ${qtyText(item.paid_quantity)}`}</span>}
                          </div>
                        </div>
                        <span className="text-sm font-extrabold">{money(item.price * item.quantity * (1 - item.discount / 100))}</span>
                      </div>
                      {canEdit && (
                        <div className="mt-1.5 flex gap-1.5">
                          {can("editItems") && (product?.addonGroups.length || item.addons?.length) ? <Button size="sm" variant="outline" className="h-8 flex-1" disabled={p.busy} onClick={() => p.onItemAddons(item)}><Sparkles className="ml-1 h-3.5 w-3.5" />إضافات</Button> : null}
                          <Button size="sm" variant="outline" className="h-8 flex-1" disabled={p.busy} onClick={() => p.onEditItem(item)}><Pencil className="ml-1 h-3.5 w-3.5" />تعديل</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {pending.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/60 p-2 dark:bg-rose-950/20">
                <div className="flex items-center justify-between text-xs font-extrabold text-rose-700"><span><ChefHat className="ml-1 inline h-4 w-4" />جديد — لم يُرسل بعد</span><span>{money(p.pendingTotal)}</span></div>
                {pending.map((line) => {
                  const product = p.productById.get(line.productId)
                  return (
                    <div key={line.key} className="rounded-xl bg-card p-2 shadow-sm">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <button type="button" className="block w-full text-right font-bold leading-tight" onClick={() => p.onEditPending(line.key)}>
                            {line.name}{line.unitName ? <span className="text-xs font-normal text-muted-foreground"> ({line.unitName})</span> : null}
                            {line.relatedOf && <span className="mr-1 rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-700"><Link2 className="ml-0.5 inline h-3 w-3" />تابع</span>}
                          </button>
                          <AddonChips addons={line.addons} />
                          {line.note && <div className="mt-0.5 text-xs text-orange-700">{line.note}</div>}
                        </div>
                        <span className="text-sm font-extrabold">{money(line.price * line.quantity * (1 - line.discount / 100))}</span>
                        <button type="button" className="text-red-500" title="حذف" onClick={() => p.onPendingRemove(line.key)}><X className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => p.onPendingQty(line.key, -1)}><Minus className="h-4 w-4" /></Button>
                          <span className="w-9 text-center font-black">{qtyText(line.quantity)}</span>
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => p.onPendingQty(line.key, 1)}><Plus className="h-4 w-4" /></Button>
                        </div>
                        {product?.addonGroups.length ? <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => p.onPendingAddons(line.key)}><Sparkles className="ml-1 h-3.5 w-3.5" />إضافات</Button> : <span className="flex-1" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {!order.items.length && !pending.length && (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center text-muted-foreground">
                <ChefHat className="h-10 w-10 opacity-40" />الطلب فارغ — اختر الأصناف من القائمة
              </div>
            )}
          </div>

          <div className="space-y-2 border-t bg-background p-2 sm:p-3">
            <div className="space-y-1 text-sm">
              {order.totals.paid > 0 && <div className="flex justify-between text-emerald-700"><span>مدفوع</span><span>{money(order.totals.paid)}</span></div>}
              <div className="flex justify-between">
                <button className="text-muted-foreground underline-offset-2 hover:underline disabled:no-underline" disabled={!can("discount") || p.busy} onClick={p.onDiscount}>
                  خصم الطلب {order.discount_percent > 0 ? `${order.discount_percent}%` : can("discount") ? "(إضافة)" : "—"}
                </button>
                {pending.length > 0 && <span className="text-rose-700">+ جديد {money(p.pendingTotal)}</span>}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-white dark:bg-slate-800">
                <span className="font-bold">المتبقي</span><span className="text-xl font-black">{money(p.remainingTotal)} <span className="text-xs font-normal">{p.currency}</span></span>
              </div>
            </div>
            {pending.length > 0 ? (
              <Button className="h-12 w-full bg-rose-600 text-base font-extrabold hover:bg-rose-700" disabled={p.busy} onClick={p.onSend}>
                {p.busy ? <Loader2 className="ml-1 h-5 w-5 animate-spin" /> : <Send className="ml-1 h-5 w-5" />}إرسال للمطبخ ({pending.length})
              </Button>
            ) : (
              <Button className="h-12 w-full bg-emerald-600 text-base font-extrabold hover:bg-emerald-700" disabled={p.busy || !hasRemaining || !can("pay")} onClick={p.onPay}>
                <CreditCard className="ml-1 h-5 w-5" />دفع الحساب
              </Button>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {p.actions.filter((action) => action.show).map((action) => (
                <Button key={action.key} variant="outline" className={`flex h-auto flex-col gap-0.5 px-1 py-2 text-xs font-bold ${action.tone || ""}`} disabled={p.busy || action.disabled || (pending.length > 0 && action.key !== "custody")} onClick={action.onClick}>
                  <action.icon className="h-4 w-4" />{action.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* قائمة الأصناف */}
        <section className={`${p.mobileTab === "menu" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          <div className="space-y-2 border-b bg-background p-2 sm:p-3">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="h-10 pr-9 text-base" placeholder="ابحث عن صنف بالاسم أو الرمز" value={p.query} onChange={(event) => p.onQuery(event.target.value)} />
              {p.query && <button type="button" className="absolute left-3 top-3 text-muted-foreground" onClick={() => p.onQuery("")}><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ name: "all", label: "الكل", count: p.totalProducts }, ...p.categories.map((row) => ({ name: row.name, label: row.name, count: row.count }))].map((row) => (
                <button key={row.name} type="button" onClick={() => p.onCategory(row.name)}
                  className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${p.category === row.name ? "bg-rose-600 text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                  {row.label} <span className="mr-0.5 text-xs opacity-70">{row.count}</span>
                </button>
              ))}
            </div>
          </div>
          {p.catalogError && <div className="m-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{p.catalogError}</div>}
          {p.catalogLoading ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-rose-600" /></div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2 sm:gap-3">
                {p.products.slice(0, 400).map((product) => (
                  <button key={product.id} type="button" onClick={() => p.onAddProduct(product)} disabled={!can("addItems")}
                    className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-right shadow-sm transition hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-md active:scale-[0.97] disabled:opacity-50">
                    {product.image ? (
                      <img src={product.image} alt="" className="h-24 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className={`flex h-24 w-full items-center justify-center bg-gradient-to-br text-3xl font-black text-white ${toneFor(product.category)}`}>{initials(product.name)}</div>
                    )}
                    <div className="flex flex-1 flex-col gap-1 p-2">
                      <span className="line-clamp-2 text-sm font-bold leading-tight">{product.name}</span>
                      <div className="mt-auto flex items-center justify-between gap-1">
                        <span className="text-base font-black text-rose-700 dark:text-rose-400">{money(product.price)}</span>
                        <span className="flex gap-0.5">
                          {product.addonGroups.length > 0 && <Sparkles className="h-3.5 w-3.5 text-rose-500" aria-label="له إضافات" />}
                          {product.relatedMode > 1 && product.relatedIds.length > 0 && <Link2 className="h-3.5 w-3.5 text-sky-600" aria-label="له توابع" />}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {!p.products.length && !p.catalogError && <div className="p-10 text-center text-muted-foreground">لا توجد أصناف مطابقة</div>}
            </div>
          )}
        </section>
      </div>

      {/* الجوال: تبديل القائمة/الطلب */}
      <nav className="grid grid-cols-2 gap-1 border-t bg-background p-1.5 lg:hidden">
        <button className={`h-12 rounded-xl text-sm font-extrabold ${p.mobileTab === "menu" ? "bg-rose-600 text-white" : "text-muted-foreground"}`} onClick={() => p.onMobileTab("menu")}>القائمة</button>
        <button className={`h-12 rounded-xl text-sm font-extrabold ${p.mobileTab === "ticket" ? "bg-rose-600 text-white" : "text-muted-foreground"}`} onClick={() => p.onMobileTab("ticket")}>
          الطلب ({itemCount}) · {money(p.remainingTotal + p.pendingTotal)}
        </button>
      </nav>
    </div>
  )
}
