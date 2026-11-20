"use client"

import { tr, appDir } from "@/lib/i18n"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, ChefHat, TextSearch as ListSearchIcon, Clock, CreditCard, Link2, Link2Off, Loader2, Minus, Pencil, Plus, ReceiptText, Search, Send, ShoppingBag, Sparkles, UserRound, Users, X } from "lucide-react"
import type { RestaurantPermission } from "@/lib/transaction-permission-definitions"
import { elapsed } from "./restaurant-floor"
import { EXTRAS_GROUP, money, qtyText, type Addon, type AddonGroup, type OrderItem } from "./restaurant-dialogs"
import "./restaurant-order.css"

export type Order = {
  id: number; order_no: string; branch_id: number; location_id: number; location_name: string; status: string
  order_type: "dine_in" | "takeaway"; takeaway_name: string | null; takeaway_mobile?: string | null; takeaway_address?: string | null
  guests: number; customer_id: number | null; customer_name: string; discount_percent: number; note: string | null; revision: number; opened_at: string
  tables: { table_id: number; is_primary: boolean; name: string; seats: number; location_id: number; location_name: string }[]
  items: OrderItem[]; payments: { id: number; vch_code: string; amount: number; created_at: string }[]
  totals: { gross: number; remaining: number; paid: number }
  waiter_id?: string | null; waiter_name?: string | null; bill_requested_at?: string | null
}
export type Product = {
  id: number; code: string; name: string; price: number; unitId: number | null; unitName: string; category: string
  groupPrinter: string; itemPrinter: string; imageUrl: string | null; hasImage: boolean; search: string; unitPrices: { unitId: number | null; unitName: string; price: number }[]
  addonGroups: AddonGroup[]; relatedMode: number; relatedIds: number[]
  /** خيارات كل تابع: addPrice = اضافة السعر عند الاختيار، noKitchenPrint = عدم الطباعة في فواتير المطبخ */
  relatedItems: { id: number; addPrice: boolean; noKitchenPrint: boolean }[]
  /** اضافات المطعم (تعريف الصنف): معالج «مع/بدون» عند الإضافة */
  extras?: { name: string; price: number }[]
  /** طريقة اختيار الإضافات: toggle = «مع/بدون» لكل إضافة، multi = اختيار من متعدد بشاشة واحدة */
  extrasMode?: "toggle" | "multi"
  /** مجموعة الصنف (item_groups) */
  groupId?: number | null
  /** «اظهار الاصناف التابعة للمجموعة بعد الاختيار»: يُختار صنف من هذه المجموعة بعد الصنف (مثل مشروب) */
  followupGroupId?: number | null
}
export type Pending = {
  key: string; productId: number; name: string; unitId: number | null; unitName: string; price: number; quantity: number; discount: number
  note: string; addons: Addon[]; groupPrinter: string; category: string; relatedOf?: string; noKitchenPrint?: boolean
  /** سطر «اضافات» (خدمة اضافات المطعم) التابع لسطر الصنف بهذا المفتاح — كميته تتبع كمية الصنف */
  extrasOf?: string
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
  onBack: () => void; onAddProduct: (product: Product) => void; onOpenItemSearch: () => void
  onPendingQty: (key: string, delta: number) => void; onPendingRemove: (key: string) => void
  onEditPending: (key: string) => void; onEditItem: (item: OrderItem) => void; onRemoveService: (item: OrderItem) => void
  onPendingAddons: (key: string) => void; onItemAddons: (item: OrderItem) => void
  onSend: () => void; onPay: () => void; onDiscount: () => void; onGuests: (delta: number) => void
  onUnmerge: (tableId: number, name: string) => void; onRenameTakeaway: () => void
  /** النادل (بلا صلاحية الدفع): الزر الرئيسي «طلب الحساب» بدل «دفع الحساب» */
  billMode?: boolean; onRequestBill?: () => void
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")
// لون ثابت لكل مجموعة (دائرة المجموعة وأطباق أصنافها) — restaurant-order.css
const DISH_TONES: [string, string][] = [["#f08a4b", "#d0562a"], ["#5fbf8f", "#2f8a62"], ["#e2b53f", "#b08418"], ["#5fa8d3", "#2c78a3"], ["#e2627b", "#b03a55"], ["#8f7ae0", "#5b45b8"], ["#4fb8b0", "#23807a"], ["#d98a5f", "#a3542b"]]
const toneIndex = (text: string) => Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0) % DISH_TONES.length
const toneFor = (text: string) => { const [from, to] = DISH_TONES[toneIndex(text)]; return `linear-gradient(140deg, ${from}, ${to})` }
// حرف المجموعة بلا "ال" التعريف (كانت أغلب المجموعات تظهر «ا»)
const groupLetter = (name: string) => (name.trim().replace(/^ال(?=S{2,})/, "")[0] || "•")
const solidTone = (text: string) => DISH_TONES[toneIndex(text)][1]

function AddonChips({ addons }: { addons?: Addon[] }) {
  if (!addons?.length) return null
  // اضافات المطعم («مع ...») أسطر تحت الصنف؛ الخصائص شرائح كما كانت
  const attributes = addons.filter((addon) => addon.group !== EXTRAS_GROUP)
  const extras = addons.filter((addon) => addon.group === EXTRAS_GROUP)
  return (
    <>
      {attributes.length > 0 && (
        <span className="ro-chips">
          {attributes.map((addon) => <span key={`${addon.group}|${addon.value}`} className="ro-chip">+ {addon.value}</span>)}
        </span>
      )}
      {extras.length > 0 && (
        <span className="mt-0.5 block text-xs font-bold opacity-80">
          {extras.map((addon) => <span key={addon.value} className="block">• {addon.value}</span>)}
        </span>
      )}
    </>
  )
}

// ---------------- صور الأصناف: تُطلب دفعةً واحدة للأصناف الظاهرة فقط وتُخزَّن طوال الجلسة ----------------
const imageCache = new Map<number, string | null>()
const imageWaiters = new Map<number, ((src: string | null) => void)[]>()
const imageQueue = new Set<number>()
let imageTimer: number | null = null
async function flushImages() {
  imageTimer = null
  const ids = [...imageQueue].slice(0, 60)
  ids.forEach((id) => imageQueue.delete(id))
  if (imageQueue.size) imageTimer = window.setTimeout(flushImages, 40)
  let images: Record<string, string> = {}
  try {
    const response = await fetch("/api/restaurant/product-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
    if (response.ok) images = (await response.json()).images || {}
  } catch { /* تبقى الصورة البديلة */ }
  for (const id of ids) {
    const src = images[id] || null
    imageCache.set(id, src)
    for (const resolve of imageWaiters.get(id) || []) resolve(src)
    imageWaiters.delete(id)
  }
}
function requestImage(id: number, resolve: (src: string | null) => void) {
  if (imageCache.has(id)) { resolve(imageCache.get(id) ?? null); return }
  imageWaiters.set(id, [...(imageWaiters.get(id) || []), resolve])
  imageQueue.add(id)
  if (imageTimer === null) imageTimer = window.setTimeout(flushImages, 40)
}

/** صورة الصنف بعرض البطاقة (أعلاها)، أو أول حرفين على تدرّج بلون المجموعة */
function DishPlate({ product }: { product: Product }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [src, setSrc] = useState<string | null>(product.imageUrl || (product.hasImage ? imageCache.get(product.id) ?? null : null))
  useEffect(() => {
    if (product.imageUrl || !product.hasImage || imageCache.has(product.id) || !ref.current) return
    let active = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      requestImage(product.id, (value) => { if (active) setSrc(value) })
    }, { rootMargin: "300px" })
    observer.observe(ref.current)
    return () => { active = false; observer.disconnect() }
  }, [product.id, product.imageUrl, product.hasImage])
  return (
    <span ref={ref} className={src ? "ro-plate has-img" : "ro-plate"} style={{ background: toneFor(product.category) }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(product.name)}
    </span>
  )
}

const ProductTile = memo(function ProductTile({ product, count, canAdd, onAdd }: { product: Product; count: number; canAdd: boolean; onAdd: (product: Product) => void }) {
  return (
    <button type="button" onClick={() => onAdd(product)} disabled={!canAdd} className="ro-dish">
      {count > 0 && <span className="ro-count">×{qtyText(count)}</span>}
      <span className="ro-flags">
        {product.addonGroups.length > 0 && <Sparkles aria-label={tr("له إضافات")} />}
        {product.relatedMode > 1 && product.relatedIds.length > 0 && <Link2 aria-label={tr("له توابع")} />}
      </span>
      <DishPlate product={product} />
      <span className="ro-dish-body">
        <h4>{product.name}</h4>
        {/* صنف له «متغيرات وخصائص»: السعر يُعرض في نافذة الاختيار (السعر الفعلي لكل قيمة) لا على البطاقة */}
        <span className="ro-dish-foot">{product.addonGroups?.length ? <small className="text-xs font-semibold opacity-70">{tr("حسب الاختيار")}</small> : <b>{money(product.price)}</b>}<span className="ro-add"><Plus className="h-5 w-5" /></span></span>
      </span>
    </button>
  )
})

const PAGE = 120
/** شبكة الأصناف: تُرسم 120 صنفاً ثم المزيد عند التمرير؛ عدد كل صنف في الطلب يظهر على طبقه */
const ProductGrid = memo(function ProductGrid({ products, counts, canAdd, onAdd, empty }: { products: Product[]; counts: Map<number, number>; canAdd: boolean; onAdd: (product: Product) => void; empty: boolean }) {
  const [limit, setLimit] = useState(PAGE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setLimit(PAGE); scrollRef.current?.scrollTo({ top: 0 }) }, [products])
  useEffect(() => {
    const target = sentinelRef.current
    if (!target || limit >= products.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => Math.min(products.length, current + PAGE))
    }, { root: scrollRef.current, rootMargin: "600px" })
    observer.observe(target)
    return () => observer.disconnect()
  }, [limit, products.length])
  return (
    <div ref={scrollRef} className="ro-grid-scroll">
      <div className="ro-grid">
        {products.slice(0, limit).map((product) => <ProductTile key={product.id} product={product} count={counts.get(product.id) || 0} canAdd={canAdd} onAdd={onAdd} />)}
      </div>
      {limit < products.length && <div ref={sentinelRef} className="h-10" />}
      {!products.length && empty && <div className="ro-empty">{tr("لا توجد أصناف مطابقة")}</div>}
    </div>
  )
})

// بنمط "حديقة وأطباق" — restaurant-order.css
export function RestaurantOrder(p: Props) {
  const { order, can, pending } = p
  const isTakeaway = order.order_type === "takeaway"
  const hasRemaining = order.items.some((item) => item.remaining_quantity > 0)
  const itemCount = order.items.length + pending.length
  // عدد كل صنف في الطلب (على الطاولة غير المدفوع + الجديد) — شارة ×N على طبقه
  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const item of order.items) if (item.remaining_quantity > 0 && !item.is_table_service) map.set(item.product_id, (map.get(item.product_id) || 0) + item.remaining_quantity)
    for (const line of pending) map.set(line.productId, (map.get(line.productId) || 0) + line.quantity)
    return map
  }, [order.items, pending])
  const categories = [{ name: "all", label: tr("الكل"), count: p.totalProducts }, ...p.categories.map((row) => ({ name: row.name, label: row.name, count: row.count }))]

  return (
    <div dir={appDir()} className="ro-root">
      {/* الشريط العلوي */}
      <header className="ro-top">
        <button type="button" className="ro-back" onClick={p.onBack}><ArrowRight className="h-5 w-5" />{tr("الطاولات")}</button>
        <div className="ro-tags">
          {isTakeaway ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="ro-table"><ShoppingBag className="h-5 w-5" />{tr("سفري")}{order.takeaway_name ? ` — ${order.takeaway_name}` : ""}</span>
              {/* ملاحظة السفري (اسم/رقم الزبون) مطلوبة قبل الإرسال للمطبخ — تُضاف من هنا بعد إدخال الأصناف */}
              <button type="button" className={order.takeaway_name ? "ro-soft" : "ro-badge"} disabled={p.busy} onClick={p.onRenameTakeaway}>
                <Pencil className="h-3.5 w-3.5" />{order.takeaway_name ? tr("بيانات الزبون") : tr("إضافة بيانات الزبون")}
              </button>
            </span>
          ) : order.tables.map((table) => (
            <span key={table.table_id} className="ro-table">
              {tr("طاولة ")}{table.name}
              {order.tables.length > 1 && can("split") && (
                <button type="button" title={tr("فك الدمج")} disabled={p.busy} onClick={() => p.onUnmerge(table.table_id, table.name)}><Link2Off className="h-3.5 w-3.5" /></button>
              )}
            </span>
          ))}
          <span className="ro-badge"><Clock className="h-3.5 w-3.5" />{elapsed(order.opened_at, p.now)}</span>
          <span className="ro-soft max-sm:hidden">{order.location_name} · {order.order_no}</span>
          {order.waiter_name && <span className="ro-soft"><UserRound className="h-3.5 w-3.5" />{order.waiter_name}</span>}
        </div>
        {!isTakeaway && (
          <div className="ro-guests">
            <button type="button" disabled={!can("openTable") || p.busy || order.guests <= 1} onClick={() => p.onGuests(-1)}><Minus className="h-4 w-4" /></button>
            <span><Users className="h-4 w-4" />{order.guests}</span>
            <button type="button" disabled={!can("openTable") || p.busy} onClick={() => p.onGuests(1)}><Plus className="h-4 w-4" /></button>
          </div>
        )}
      </header>

      {/* RTL: المجموعات (يمين) | الأصناف | الطلب (يسار) */}
      <div className="ro-body">
        <nav className={`${p.mobileTab === "menu" ? "flex" : "hidden"} ro-rail lg:flex`} aria-label={tr("مجموعات الأصناف")}>
          {categories.map((row) => (
            <button key={row.name} type="button" className="ro-cat" aria-pressed={p.category === row.name} onClick={() => p.onCategory(row.name)} title={row.label}>
              <i style={{ background: row.name === "all" ? "var(--ro-coral)" : solidTone(row.name) }}>{row.name === "all" ? "★" : groupLetter(row.label)}</i>
              <span>{row.label}</span>
              <small>{row.count}</small>
            </button>
          ))}
        </nav>

        <section className={`${p.mobileTab === "menu" ? "flex" : "hidden"} ro-menu lg:flex`}>
          <div className="ro-search">
            <Search />
            <input placeholder={tr("ابحث عن صنف بالاسم أو الرمز")} value={p.query} onChange={(event) => p.onQuery(event.target.value)} />
            {p.query && <button type="button" className="ro-icon-btn" onClick={() => p.onQuery("")} aria-label={tr("مسح")}><X className="h-4 w-4" /></button>}
            <button type="button" className="ro-icon-btn is-dark" title={tr("بحث الأصناف")} disabled={!can("addItems")} onClick={p.onOpenItemSearch}><ListSearchIcon className="h-4 w-4" /></button>
          </div>
          {p.catalogError && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{p.catalogError}</div>}
          {p.catalogLoading ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--ro-coral)" }} /></div>
          ) : (
            <ProductGrid products={p.products} counts={counts} canAdd={can("addItems")} onAdd={p.onAddProduct} empty={!p.catalogError} />
          )}
        </section>

        {/* الطلب */}
        <section className={`${p.mobileTab === "ticket" ? "flex" : "hidden"} ro-ticket lg:flex`}>
          <div className="ro-ticket-head"><b>{tr("الطلب ")}{order.order_no}</b><span>{tr("{0} أصناف", itemCount)}</span></div>
          <div className="ro-lines">
            {order.items.length > 0 && <div className="ro-section-label"><span>{tr("على الطاولة")}</span></div>}
            {order.items.map((item) => {
              const paid = item.remaining_quantity <= 0
              const product = p.productById.get(item.product_id)
              const canEdit = !paid && !item.is_table_service && (can("editItems") || can("deleteItems"))
              return (
                <div key={item.id} className={`ro-line ${paid ? "is-paid" : ""}`}>
                  <div className="ro-line-row">
                    <span className="ro-q">{qtyText(item.quantity)}</span>
                    <div className="ro-name">
                      {item.product_name}{item.unit_name ? <small> ({item.unit_name})</small> : null}
                      <AddonChips addons={item.addons} />
                      {item.note && <div className="ro-note">{item.note}</div>}
                      {(item.is_table_service || item.discount > 0 || item.paid_quantity > 0) && (
                        <span className="ro-chips">
                          {item.is_table_service && <span className="ro-chip is-amber">{tr("خدمة الطاولة")}</span>}
                          {item.discount > 0 && <span className="ro-chip is-amber">{tr("خصم ")}{item.discount}%</span>}
                          {item.paid_quantity > 0 && <span className="ro-chip is-mint">{paid ? tr("مدفوع") : tr("مدفوع {0}", qtyText(item.paid_quantity))}</span>}
                        </span>
                      )}
                    </div>
                    <span className="ro-amount">{money(item.price * item.quantity * (1 - item.discount / 100))}</span>
                  </div>
                  {!paid && item.is_table_service && (
                    <div className="ro-line-tools"><button type="button" className="ro-tool is-danger" disabled={p.busy} onClick={() => p.onRemoveService(item)}><X className="h-3.5 w-3.5" />{tr("حذف الخدمة")}</button></div>
                  )}
                  {canEdit && (
                    <div className="ro-line-tools">
                      {can("editItems") && (product?.addonGroups.length || item.addons?.length) ? <button type="button" className="ro-tool" disabled={p.busy} onClick={() => p.onItemAddons(item)}><Sparkles className="h-3.5 w-3.5" />{tr("إضافات")}</button> : null}
                      <button type="button" className="ro-tool" disabled={p.busy} onClick={() => p.onEditItem(item)}><Pencil className="h-3.5 w-3.5" />{tr("تعديل")}</button>
                    </div>
                  )}
                </div>
              )
            })}

            {pending.length > 0 && <div className="ro-section-label"><span><ChefHat className="me-1 inline h-4 w-4" />{tr("جديد — لم يُرسل بعد")}</span><span>{money(p.pendingTotal)}</span></div>}
            {pending.map((line) => {
              const product = p.productById.get(line.productId)
              return (
                <div key={line.key} className="ro-line is-new">
                  <div className="ro-line-row">
                    <span className="ro-q">{qtyText(line.quantity)}</span>
                    <button type="button" className="ro-name" onClick={() => p.onEditPending(line.key)}>
                      {line.name}{line.unitName ? <small> ({line.unitName})</small> : null}
                      {line.relatedOf && <span className="ro-chip ms-1"><Link2 className="me-0.5 inline h-3 w-3" />{tr("تابع")}</span>}
                      <AddonChips addons={line.addons} />
                      {line.note && <div className="ro-note">{line.note}</div>}
                    </button>
                    <span className="ro-amount">{money(line.price * line.quantity * (1 - line.discount / 100))}</span>
                    <button type="button" className="ro-x" title={tr("حذف")} onClick={() => p.onPendingRemove(line.key)}><X className="h-4 w-4" /></button>
                  </div>
                  <div className="ro-line-tools">
                    <span className="ro-stepper">
                      <button type="button" onClick={() => p.onPendingQty(line.key, -1)} aria-label={tr("إنقاص")}><Minus className="h-4 w-4" /></button>
                      <span>{qtyText(line.quantity)}</span>
                      <button type="button" onClick={() => p.onPendingQty(line.key, 1)} aria-label={tr("زيادة")}><Plus className="h-4 w-4" /></button>
                    </span>
                    {product?.addonGroups.length ? <button type="button" className="ro-tool" onClick={() => p.onPendingAddons(line.key)}><Sparkles className="h-3.5 w-3.5" />{tr("إضافات")}</button> : <span className="flex-1" />}
                  </div>
                </div>
              )
            })}
            {!order.items.length && !pending.length && (
              <div className="ro-ticket-empty"><ChefHat className="h-10 w-10 opacity-50" />{tr("الطلب فارغ — اختر الأصناف من القائمة")}</div>
            )}
          </div>

          <div className="ro-foot">
            <div className="ro-sums">
              {order.totals.paid > 0 && <div className="is-paid"><span>{tr("مدفوع")}</span><span>{money(order.totals.paid)}</span></div>}
              <div>
                <button type="button" disabled={!can("discount") || p.busy} onClick={p.onDiscount}>
                  {tr("خصم الطلب ")}{order.discount_percent > 0 ? `${order.discount_percent}%` : can("discount") ? tr("(إضافة)") : "—"}
                </button>
                {pending.length > 0 && <span className="is-new">{tr("+ جديد ")}{money(p.pendingTotal)}</span>}
              </div>
            </div>
            <div className="ro-total"><span>{tr("المتبقي")}</span><strong>{money(p.remainingTotal)}<small>{p.currency}</small></strong></div>
            {pending.length > 0 ? (
              <button type="button" className="ro-main is-send" disabled={p.busy} onClick={p.onSend}>
                {p.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{tr("إرسال للمطبخ (")}{pending.length})
              </button>
            ) : p.billMode ? (
              <button type="button" className="ro-main is-bill" disabled={p.busy || !hasRemaining} onClick={p.onRequestBill}>
                <ReceiptText className="h-5 w-5" />{order.bill_requested_at ? tr("طلب الحساب مجدداً") : tr("طلب الحساب")}
              </button>
            ) : (
              <button type="button" className="ro-main is-pay" disabled={p.busy || !hasRemaining || !can("pay")} onClick={p.onPay}>
                <CreditCard className="h-5 w-5" />{tr("دفع الحساب")}
              </button>
            )}
            <div className="ro-actions">
              {p.actions.filter((action) => action.show).map((action) => (
                <button key={action.key} type="button" className={`ro-action ${action.tone?.includes("red") ? "is-danger" : ""}`} disabled={p.busy || action.disabled || (pending.length > 0 && action.key !== "custody")} onClick={action.onClick}>
                  <action.icon />{action.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* الجوال: تبديل القائمة/الطلب */}
      <nav className="ro-tabs">
        <button type="button" aria-pressed={p.mobileTab === "menu"} onClick={() => p.onMobileTab("menu")}>{tr("القائمة")}</button>
        <button type="button" aria-pressed={p.mobileTab === "ticket"} onClick={() => p.onMobileTab("ticket")}>
          {tr("الطلب (")}{itemCount}) · {money(p.remainingTotal + p.pendingTotal)}
        </button>
      </nav>
    </div>
  )
}
