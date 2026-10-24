"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { currentPosTenantKey, loadPosCatalog, savePosCatalog } from "@/lib/pos-offline"
import { ArrowRightLeft, Ban, Combine, Loader2, Lock, Minus, Plus, Printer, Split, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { applyPosCampaigns, type PosCampaign, type PosCampaignLine, type PosCampaignUsage } from "@/lib/pos-campaigns"
import { loadVoucherPrintSettings, printVoucherWithSettings } from "@/lib/voucher-print/print"
import type { PrintDocument } from "@/lib/voucher-print/document"
import type { RestaurantPermission } from "@/lib/transaction-permission-definitions"
import { printPosReceipt, type PosReceipt } from "@/lib/pos-receipt-print"
import { PosPrintPreview } from "@/components/pos/pos-print-preview"
import { useAuth } from "@/components/auth/auth-context"
import { PosStartSessionDialog } from "@/components/pos/pos-start-session-dialog"
import { PosHandoverDialog } from "@/components/pos/pos-handover-dialog"
import { printCustodyHandover } from "@/lib/pos-custody-print"
import {
  PosPaymentDetailsDialog, type CurrencyOption, type LookupOption, type PaymentDetail, type PaymentMethod,
} from "@/components/pos/pos-payment-details-dialog"
import {
  AddonsDialog, addonsText, ValueDialog, ItemEditDialog, LineQuantities, money, PayScopeDialog, qtyText, round2, round4, TablePickerDialog,
  type Addon, type EditableLine, type FloorLocation, type FloorTable, type OrderItem,
} from "./restaurant-dialogs"
import { RestaurantFloor, type Takeaway } from "./restaurant-floor"
import { RestaurantOrder, type Order, type OrderAction, type Pending, type Product } from "./restaurant-order"

type Perms = Record<RestaurantPermission, boolean>
type Floor = { branch_id: number; permissions: Perms; locations: FloorLocation[]; tables: FloorTable[]; takeaways: Takeaway[]; server_time: string }
type Catalog = {
  point: any; taxRate: number; products: Product[]; customers: LookupOption[]; currencies: CurrencyOption[]; banks: LookupOption[]; bankBranches: LookupOption[]
  cardTypes: LookupOption[]; campaigns: PosCampaign[]; campaignUsage: PosCampaignUsage; session: any; canPay: boolean; receiptSettings: Record<string, string>
}
type Line = { item: OrderItem; quantity: number }

// بحث عربي متسامح: بلا تشكيل، وتوحيد الألف/الياء/التاء المربوطة
const searchKey = (value: string) => value.toLocaleLowerCase("ar").replace(/[ً-ٟـ]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
const CATALOG_REFRESH_MS = 5 * 60_000
const errorOf = async (response: Response, fallback: string) => String((await response.json().catch(() => ({})))?.error || fallback)
const pad = (value: number) => String(value).padStart(2, "0")
const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }

function normalizeCatalog(data: any): Catalog {
  return {
    point: data.point || null,
    taxRate: Math.max(0, Number(data.tax_rate || 0)),
    receiptSettings: data.receiptSettings || {},
    session: data.session || null,
    canPay: Boolean(data.can_pay),
    campaigns: data.campaigns || [],
    campaignUsage: data.campaignUsage || {},
    products: (data.products || []).map((row: any) => ({
      id: Number(row.id), code: String(row.product_code || ""), name: String(row.product_name || "صنف"), price: Number(row.first_price || 0),
      unitId: Number(row.unit_id) || null, unitName: String(row.unit_name || ""), category: String(row.category_name || "غير مصنف"),
      groupPrinter: String(row.group_printer || "").trim(),
      itemPrinter: String(row.item_printer || "").trim(),
      imageUrl: row.image_url ? String(row.image_url) : null, hasImage: Boolean(row.has_image),
      search: searchKey(`${row.product_name || ""} ${row.product_code || ""}`),
      unitPrices: (Array.isArray(row.unit_prices) ? row.unit_prices : []).map((option: any) => ({ unitId: Number(option.unit_id) || null, unitName: String(option.unit_name || ""), price: Number(option.price || 0) })),
      addonGroups: (Array.isArray(row.addon_groups) ? row.addon_groups : []).map((group: any) => ({ name: String(group.name || ""), values: (group.values || []).map(String) })),
      relatedMode: Number(row.related_items_mode || 1),
      relatedIds: (Array.isArray(row.related_ids) ? row.related_ids : []).map(Number),
    })),
    customers: (data.customers || []).map((row: any) => ({ id: Number(row.id), name: String(row.name || ""), code: String(row.code || ""), accountId: Number(row.account_id) || null })),
    currencies: (data.currencies || []).map((row: any) => ({ currency_id: Number(row.currency_id), currency_code: String(row.currency_code || ""), currency_name: String(row.currency_name || ""), rate_to_point: Number(row.rate_to_point || 1) })),
    banks: (data.banks || []).map((row: any) => ({ id: Number(row.id), code: String(row.code || ""), name: String(row.name || "") })),
    bankBranches: (data.bankBranches || []).map((row: any) => ({ id: Number(row.id), bank_id: Number(row.bank_id) || undefined, code: String(row.code || ""), name: String(row.name || "") })),
    cardTypes: (data.cardTypes || []).map((row: any) => ({ id: Number(row.id), name: String(row.name || ""), pinpadMachineId: row.link_bank_machine ? Number(row.pinpad_machine_id) || null : null })),
  }
}

export default function RestaurantPos() {
  const { user } = useAuth()
  const [printPreview, setPrintPreview] = useState<{ title: string; html: string } | null>(null)
  const [floor, setFloor] = useState<Floor | null>(null)
  const [floorError, setFloorError] = useState("")
  const [denied, setDenied] = useState(false)
  const [loadingFloor, setLoadingFloor] = useState(true)
  const [locationFilter, setLocationFilter] = useState<number | "all">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "free" | "busy">("all")
  const [now, setNow] = useState(() => Date.now())
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [order, setOrder] = useState<Order | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState("")
  const [catalogLoading, setCatalogLoading] = useState(false)
  const catalogCache = useRef(new Map<number, Catalog>())
  const [pending, setPending] = useState<Pending[]>([])
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [mobileTab, setMobileTab] = useState<"menu" | "ticket">("menu")
  const [busy, setBusy] = useState(false)

  const [openTable, setOpenTable] = useState<FloorTable | null>(null)
  const [guests, setGuests] = useState(2)
  const [takeawayOpen, setTakeawayOpen] = useState(false)
  const [takeawayName, setTakeawayName] = useState("")
  const [takeawayLocation, setTakeawayLocation] = useState<number | null>(null)
  const [picker, setPicker] = useState<null | "transfer" | "merge">(null)
  const [transferFrom, setTransferFrom] = useState<number | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitQty, setSplitQty] = useState<Record<number, number>>({})
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [valueDialog, setValueDialog] = useState<null | "discount" | "takeaway_name">(null)
  const [addonsTarget, setAddonsTarget] = useState<{ kind: "pending"; key: string } | { kind: "item"; item: OrderItem } | null>(null)
  const [editing, setEditing] = useState<{ kind: "item"; item: OrderItem } | { kind: "pending"; key: string } | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [payLines, setPayLines] = useState<{ lines: Line[]; partial: boolean } | null>(null)
  const [payments, setPayments] = useState<PaymentDetail[]>([])
  const [cashAmounts, setCashAmounts] = useState<Record<number, number>>({})
  const [payCustomerId, setPayCustomerId] = useState<number | null>(null)
  const [payError, setPayError] = useState("")

  // عهدة المطعم (لكل موقع) — نفس نوافذ عهدة الكاشير
  const [custodyLocation, setCustodyLocation] = useState<number | null>(null)
  const [custodyPicker, setCustodyPicker] = useState(false)
  const [custodyInfo, setCustodyInfo] = useState<{ session: any; pending: any[]; active_shift: any; currencies: CurrencyOption[] } | null>(null)
  const [custodyOpen, setCustodyOpen] = useState(false)
  const [custodyAction, setCustodyAction] = useState("handover")
  const [custodyAmount, setCustodyAmount] = useState(0)
  const [custodyAmounts, setCustodyAmounts] = useState<Record<number, number>>({})
  const [movementAmounts, setMovementAmounts] = useState<Record<number, number>>({})
  const [custodyCurrencyId, setCustodyCurrencyId] = useState(0)
  const [custodyNote, setCustodyNote] = useState("")
  const [custodyError, setCustodyError] = useState("")
  const [custodyBusy, setCustodyBusy] = useState(false)

  const perms = floor?.permissions
  const can = (key: RestaurantPermission) => Boolean(perms?.[key])

  const loadFloor = useCallback(async (silent = false) => {
    if (!silent) setLoadingFloor(true)
    try {
      const response = await fetch("/api/restaurant/floor", { cache: "no-store" })
      if (response.status === 403) { setDenied(true); setFloorError(await errorOf(response, "لا توجد صلاحية")); return }
      if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الطاولات"))
      const data = await response.json()
      setDenied(false); setFloorError(""); setFloor(data)
    } catch (error) {
      if (!silent) setFloorError(error instanceof Error ? error.message : "تعذر تحميل الطاولات")
    } finally {
      if (!silent) setLoadingFloor(false)
    }
  }, [])

  useEffect(() => { void loadFloor() }, [loadFloor])
  // تحديث لوحة الطاولات دورياً (مستخدمون آخرون يفتحون/يدفعون طاولات) والوقت المنقضي
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (document.visibilityState === "visible" && !order) void loadFloor(true)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [loadFloor, order])
  useEffect(() => { if (!message) return; const t = window.setTimeout(() => setMessage(null), 6000); return () => window.clearTimeout(t) }, [message])

  // الكتالوج: من الذاكرة أو من IndexedDB فوراً (كالكاشير) ثم تحديث بالخلفية؛ التحميل الكامل يُنتظر فقط أول مرة على الجهاز
  const catalogKey = useCallback((locationId: number) => `restaurant:${currentPosTenantKey(user?.id)}:location:${locationId}`, [user?.id])
  const catalogAt = useRef(new Map<number, number>())
  const activeLocation = useRef<number | null>(null)
  const fetchCatalog = useCallback(async (locationId: number) => {
    const response = await fetch(`/api/restaurant/catalog?location_id=${locationId}`, { cache: "no-store" })
    if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الأصناف"))
    const raw = await response.json()
    const next = normalizeCatalog(raw)
    catalogCache.current.set(locationId, next)
    catalogAt.current.set(locationId, Date.now())
    void savePosCatalog(catalogKey(locationId), raw).catch(() => undefined)
    if (activeLocation.current === locationId) setCatalog(next)
    return next
  }, [catalogKey])
  const loadCatalog = useCallback(async (locationId: number, force = false) => {
    activeLocation.current = locationId
    setCatalogError("")
    let cached = catalogCache.current.get(locationId) || null
    if (!cached && !force) {
      const stored = await loadPosCatalog<any>(catalogKey(locationId)).catch(() => null)
      if (stored?.catalog) { cached = normalizeCatalog(stored.catalog); catalogCache.current.set(locationId, cached); catalogAt.current.set(locationId, 0) }
    }
    if (cached) {
      setCatalog(cached)
      if (force || Date.now() - (catalogAt.current.get(locationId) || 0) > CATALOG_REFRESH_MS) void fetchCatalog(locationId).catch(() => undefined)
      return cached
    }
    setCatalogLoading(true)
    try {
      return await fetchCatalog(locationId)
    } catch (error) {
      setCatalog(null); setCatalogError(error instanceof Error ? error.message : "تعذر تحميل الأصناف")
      return null
    } finally {
      setCatalogLoading(false)
    }
  }, [catalogKey, fetchCatalog])

  const showOrder = useCallback(async (orderId: number) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/restaurant/orders?id=${orderId}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الطلب"))
      const data: Order = await response.json()
      if (data.status !== "open") { setMessage({ type: "error", text: "الطلب لم يعد مفتوحاً" }); await loadFloor(true); return }
      setOrder(data); setPending([]); setQuery(""); setCategory("all"); setMobileTab("menu")
      void loadCatalog(data.location_id)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر تحميل الطلب" })
    } finally {
      setBusy(false)
    }
  }, [loadCatalog, loadFloor])

  /** تنفيذ إجراء على الطلب؛ الاستجابة تحمل الطلب المحدَّث */
  const act = useCallback(async (action: string, body: Record<string, unknown>, success?: string) => {
    setBusy(true)
    try {
      const response = await fetch("/api/restaurant/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 409 && order) void showOrder(order.id)
        throw new Error(String(data?.error || "تعذر تنفيذ العملية"))
      }
      if (data.order && data.order.status === "open") setOrder(data.order)
      else if (data.order) { setOrder(null); setPending([]) }
      if (success) setMessage({ type: "success", text: success })
      void loadFloor(true)
      return data
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر تنفيذ العملية" })
      return null
    } finally {
      setBusy(false)
    }
  }, [loadFloor, order, showOrder])

  useNavigationGuard(() => pending.length > 0, (continueNavigation) => {
    void confirmYesNo("توجد أصناف لم تُرسل للطاولة بعد. هل تريد المتابعة وتجاهلها؟").then((ok) => { if (ok) { setPending([]); continueNavigation() } })
  })

  const backToFloor = async () => {
    if (pending.length && !(await confirmYesNo("توجد أصناف لم تُرسل بعد. هل تريد تجاهلها والعودة للطاولات؟"))) return
    setOrder(null); setPending([]); setPayLines(null); void loadFloor(true)
  }

  const clickTable = (table: FloorTable) => {
    if (table.order_id) { void showOrder(table.order_id); return }
    if (!can("openTable")) { setMessage({ type: "error", text: "لا توجد لديك صلاحية فتح طاولة" }); return }
    setGuests(Math.min(table.seats || 2, 2) || 1); setOpenTable(table)
  }
  const confirmOpenTable = async () => {
    if (!openTable) return
    const data = await act("open", { table_id: openTable.id, guests })
    setOpenTable(null)
    if (data?.order_id) void showOrder(Number(data.order_id))
  }

  // ---------------- العهدة ----------------
  const custodyLocationName = floor?.locations.find((l) => l.id === custodyLocation)?.name || ""
  const custodyCurrency = (custodyInfo?.currencies || [])[0]
  const loadCustody = useCallback(async (locationId: number) => {
    const response = await fetch(`/api/restaurant/custody?location_id=${locationId}`, { cache: "no-store" })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(data?.error || "تعذر تحميل العهدة"))
    const info = {
      session: data.session || null, pending: data.pending || [], active_shift: data.active_shift || null,
      currencies: (data.currencies || []).map((row: any) => ({ currency_id: Number(row.currency_id), currency_code: String(row.currency_code || ""), currency_name: String(row.currency_name || ""), rate_to_point: Number(row.rate_to_point || 1) })),
    }
    setCustodyInfo(info)
    return info
  }, [])
  const openCustody = async (locationId?: number | null) => {
    const resolved = locationId ?? (locationFilter !== "all" ? locationFilter : floor?.locations.length === 1 ? floor.locations[0].id : null)
    if (!resolved) { setCustodyPicker(true); return }
    setCustodyPicker(false); setCustodyLocation(resolved); setCustodyError(""); setCustodyNote(""); setMovementAmounts({}); setCustodyAmount(0)
    try {
      const info = await loadCustody(resolved)
      const session = info.session
      setCustodyAction(session ? "handover" : info.pending.length ? "receive" : "open")
      const amounts: Record<number, number> = {}
      for (const row of session?.currencies || []) amounts[Number(row.currency_id)] = Number(row.expected_amount || 0)
      setCustodyAmounts(amounts)
      setCustodyCurrencyId(Number(info.currencies[0]?.currency_id || 0))
      setCustodyOpen(true)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر تحميل العهدة" })
    }
  }
  const runCustody = async (sourceId?: number, shiftGuid?: string) => {
    if (!custodyLocation || !custodyInfo) return
    const session = custodyInfo.session
    const action = !session ? (sourceId ? "receive" : "open") : custodyAction
    const currencies = custodyInfo.currencies
    setCustodyBusy(true); setCustodyError("")
    try {
      const amountsFor = (source: Record<number, number>) => currencies.map((row) => ({ currency_id: row.currency_id, amount: Number(source[row.currency_id] || 0) }))
      const response = await fetch("/api/restaurant/custody", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, location_id: custodyLocation, shift_guid: shiftGuid, source_session_id: sourceId, note: custodyNote, amount: custodyAmount,
          currency_amounts: action === "cash_in" || action === "cash_out" ? amountsFor(movementAmounts).filter((row) => row.amount > 0) : amountsFor(custodyAmounts),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data?.error || "فشلت عملية العهدة"))
      // إيصال تسليم/إغلاق العهدة بنفس طريقة الكاشير
      if (session && (action === "handover" || action === "close")) {
        void printCustodyHandover({
          kind: action === "close" ? "close" : "handover", pointName: custodyLocationName, userName: user?.fullName || user?.username || "",
          currencyCode: custodyCurrency?.currency_code || "", session, currencies, amounts: { ...custodyAmounts }, note: custodyNote,
        }).catch((error) => setMessage({ type: "error", text: `تمت العملية لكن تعذرت الطباعة: ${error instanceof Error ? error.message : ""}` }))
      }
      setMessage({ type: "success", text: "تم تنفيذ عملية العهدة بنجاح" })
      setCustodyOpen(false); setMovementAmounts({}); setCustodyNote("")
      await loadCustody(custodyLocation)
    } catch (error) {
      setCustodyError(error instanceof Error ? error.message : "فشلت عملية العهدة")
    } finally {
      setCustodyBusy(false)
    }
  }
  const canCustody = can("receiveCustody") || can("handoverCustody")
  const custodyDialogs = (
    <>
      <Dialog open={custodyPicker} onOpenChange={setCustodyPicker}>
        <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader><DialogTitle>عهدة أي موقع؟</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(floor?.locations || []).map((location) => <Button key={location.id} variant="outline" className="h-12" onClick={() => void openCustody(location.id)}>{location.name}</Button>)}
          </div>
        </DialogContent>
      </Dialog>
      {custodyInfo && (
        <>
          <PosStartSessionDialog open={custodyOpen && !custodyInfo.session} onOpenChange={setCustodyOpen} userName={user?.fullName || user?.username || ""}
            currency={custodyCurrency?.currency_name || ""} amount={custodyAmount} onAmountChange={setCustodyAmount} currencies={custodyInfo.currencies}
            amounts={custodyAmounts} onCurrencyAmountChange={(currencyId, amount) => setCustodyAmounts((current) => ({ ...current, [currencyId]: amount }))}
            busy={custodyBusy} online error={custodyError} pending={custodyInfo.pending} activeShift={custodyInfo.active_shift}
            onConfirm={(sourceId, shiftGuid) => void runCustody(sourceId, shiftGuid)} />
          <PosHandoverDialog open={custodyOpen && !!custodyInfo.session} onOpenChange={setCustodyOpen} session={custodyInfo.session} userName={user?.fullName || user?.username || ""}
            currencyCode={custodyCurrency?.currency_code || ""} currencies={custodyInfo.currencies} action={custodyAction}
            onActionChange={(action) => { setCustodyAction(action); setCustodyAmount(0); setMovementAmounts({}) }}
            amount={custodyAmount} onAmountChange={setCustodyAmount} currencyId={custodyCurrencyId} onCurrencyIdChange={setCustodyCurrencyId}
            amounts={custodyAmounts} onCurrencyAmountChange={(id, amount) => setCustodyAmounts((current) => ({ ...current, [id]: amount }))}
            movementAmounts={movementAmounts} onMovementAmountChange={(id, amount) => setMovementAmounts((current) => ({ ...current, [id]: amount }))}
            note={custodyNote} onNoteChange={setCustodyNote} onConfirm={() => void runCustody()} busy={custodyBusy} error={custodyError} />
        </>
      )}
    </>
  )

  const startTakeaway = () => {
    if (!can("takeaway")) return
    const first = locationFilter !== "all" ? locationFilter : floor?.locations.find((l) => l.configured)?.id ?? floor?.locations[0]?.id ?? null
    setTakeawayLocation(first); setTakeawayName(""); setTakeawayOpen(true)
  }
  const confirmTakeaway = async () => {
    if (!takeawayLocation) return
    const data = await act("open_takeaway", { location_id: takeawayLocation, name: takeawayName })
    setTakeawayOpen(false)
    if (data?.order_id) void showOrder(Number(data.order_id))
  }

  // ---------------- القائمة والأصناف ----------------
  const products = catalog?.products || []
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of products) counts.set(product.category, (counts.get(product.category) || 0) + 1)
    return [...counts.entries()].map(([name, count]) => ({ name, count }))
  }, [products])
  // البحث يُطبَّق بأولوية منخفضة (useDeferredValue) فتبقى الكتابة سريعة حتى مع آلاف الأصناف
  const deferredQuery = useDeferredValue(query)
  const shown = useMemo(() => {
    const terms = searchKey(deferredQuery.trim()).split(/\s+/).filter(Boolean)
    if (!terms.length && category === "all") return products
    return products.filter((product) => (category === "all" || product.category === category) && terms.every((term) => product.search.includes(term)))
  }, [products, category, deferredQuery])

  /**
   * إضافة صنف حسب "إضافة الأصناف التابعة" في تعريفه (كما في طلبية المبيعات): 1 الصنف فقط، 2 التوابع فقط، 3 الصنف والتوابع.
   * التوابع غير الموجودة في قائمة الموقع (مستودع/فئة سعر مختلفة) تُتخطّى مع تنبيه.
   */
  const addProduct = (product: Product) => {
    if (!can("addItems")) { setMessage({ type: "error", text: "لا توجد لديك صلاحية إضافة أصناف للطاولة" }); return }
    const related = product.relatedMode > 1 ? product.relatedIds.map((id) => productById.get(id)).filter((row): row is Product => Boolean(row)) : []
    const missing = product.relatedMode > 1 ? product.relatedIds.length - related.length : 0
    const parentKey = `${product.id}-${Date.now()}-${Math.random()}`
    const lines: { product: Product; key: string; relatedOf?: string }[] =
      product.relatedMode === 2 && related.length ? related.map((row) => ({ product: row, key: `${parentKey}-${row.id}`, relatedOf: product.name }))
        : product.relatedMode === 3 ? [{ product, key: parentKey }, ...related.map((row) => ({ product: row, key: `${parentKey}-${row.id}`, relatedOf: product.name }))]
          : [{ product, key: parentKey }]
    setPending((rows) => {
      let next = rows
      for (const line of lines) {
        const index = next.findIndex((row) => row.productId === line.product.id && row.unitId === line.product.unitId && !row.note && !row.discount && !row.addons.length && row.relatedOf === line.relatedOf)
        next = index >= 0
          ? next.map((row, i) => i === index ? { ...row, quantity: round4(row.quantity + 1) } : row)
          : [...next, { key: line.key, productId: line.product.id, name: line.product.name, unitId: line.product.unitId, unitName: line.product.unitName, price: line.product.price, quantity: 1, discount: 0, note: "", addons: [], groupPrinter: line.product.groupPrinter, category: line.product.category, relatedOf: line.relatedOf }]
      }
      return next
    })
    if (missing > 0) setMessage({ type: "error", text: `${missing} من توابع ${product.name} غير متاحة في قائمة هذا الموقع وتم تخطيها` })
  }

  // مرجع ثابت لشبكة الأصناف (memo) — الضغط على صنف لا يعيد رسم الشبكة
  const addProductRef = useRef(addProduct)
  addProductRef.current = addProduct
  const onAddProduct = useCallback((product: Product) => addProductRef.current(product), [])

  const isTakeaway = order?.order_type === "takeaway"
  const tableNames = isTakeaway ? `سفري${order?.takeaway_name ? ` ${order.takeaway_name}` : ""}` : order?.tables.map((table) => table.name).join(" + ") || ""

  // قسائم المطبخ: ورقة بالأصناف والكميات والملاحظات (بلا أسعار) — كما في كاشير نقطة البيع. الأولوية لطابعة الصنف
  // (الطابعة الافتراضية في ملف الصنف): أصنافها تُجمع على ورقة واحدة لكل طابعة؛ وإلا حسب مجموعة الصنف وطابعتها.
  const printKitchen = async (lines: Pending[]) => {
    const groups = new Map<string, { name: string; printer: string; lines: Pending[] }>()
    const products = new Map((catalog?.products || []).map((product) => [product.id, product]))
    for (const line of lines) {
      const itemPrinter = products.get(line.productId)?.itemPrinter || ""
      const printer = itemPrinter || line.groupPrinter
      if (!printer) continue
      const key = itemPrinter ? `printer|${itemPrinter}` : `${line.category}|${printer}`
      const group = groups.get(key) || { name: itemPrinter ? itemPrinter : line.category, printer, lines: [] }
      group.lines.push(line); groups.set(key, group)
    }
    // نفس شرط الكاشير: إعداد نقطة البيع "طباعة حسب مجموعة الصنف"
    if (!groups.size || !order || !catalog?.point?.print_by_item_group) return
    try {
      const { settings, company } = await loadVoucherPrintSettings(12)
      const slip = { ...settings, paper_size: "Receipt80" as const, orientation: "portrait" as const, print_method: "service" as const, copies: 1, copy_labels: "", show_logo: false, show_company_info: false, header_text: "", show_fields: true, show_row_numbers: true, hidden_columns: [], show_totals: false, show_amount_in_words: false, show_notes: false, show_barcode: false, show_signatures: false, show_footer: false, show_page_numbers: false }
      const failures: string[] = []
      for (const group of groups.values()) {
        const document: PrintDocument = {
          noAudit: true, voucherTypeId: 12, title: `${group.name} — ${isTakeaway ? "" : "طاولة "}${tableNames}`, code: order.order_no, date: nowText(),
          fields: [{ label: "الموقع", value: order.location_name }, { label: "الطاولة", value: tableNames }],
          columns: [{ key: "name", label: "الصنف", weight: 3.2 }, { key: "quantity", label: "الكمية", align: "center", weight: 1 }],
          rows: group.lines.map((line) => ({ name: `${line.name}${line.unitName ? ` (${line.unitName})` : ""}${line.addons.length ? ` + ${addonsText(line.addons)}` : ""}${line.note ? ` — ${line.note}` : ""}`, quantity: qtyText(line.quantity) })),
        }
        try { await printVoucherWithSettings(document, { ...slip, printer_name: group.printer }, company) }
        catch (error) { failures.push(`${group.name}: ${error instanceof Error ? error.message : "تعذرت الطباعة"}`) }
      }
      if (failures.length) setMessage({ type: "error", text: `أُرسلت الأصناف لكن تعذرت طباعة المطبخ: ${failures.join(" — ")}` })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذرت طباعة المطبخ" })
    }
  }

  /** المجموعات الناقصة لسطر: كل مجموعة "متغيرات وخصائص" للصنف يجب أن يُختار منها قيمة على الأقل */
  const missingGroups = (productId: number, addons?: Addon[]) =>
    (productById.get(productId)?.addonGroups || []).filter((group) => !(addons || []).some((addon) => addon.group === group.name && group.values.includes(addon.value))).map((group) => group.name)

  const sendPending = async () => {
    if (!order || !pending.length) return
    // لا إرسال للمطبخ قبل اختيار الإضافات المطلوبة — تُفتح نافذة الإضافات لأول سطر ناقص
    const incomplete = pending.find((line) => missingGroups(line.productId, line.addons).length)
    if (incomplete) {
      setMobileTab("ticket")
      setMessage({ type: "error", text: `اختر إضافات "${incomplete.name}": ${missingGroups(incomplete.productId, incomplete.addons).join("، ")}` })
      setAddonsTarget({ kind: "pending", key: incomplete.key })
      return
    }
    const lines = pending
    const data = await act("add_items", {
      order_id: order.id,
      items: lines.map((line) => ({ product_id: line.productId, product_name: line.name, unit_id: line.unitId, unit_name: line.unitName, price: line.price, quantity: line.quantity, discount: line.discount, note: line.note, addons: line.addons })),
    }, "تم إرسال الأصناف للطاولة")
    if (!data) return
    setPending([])
    void printKitchen(lines)
  }

  // ---------------- الحساب (نفس حساب الكاشير: خصم الصنف → الحملات → خصم الطلب) ----------------
  const amountFor = useCallback((lines: Line[]) => {
    if (!lines.length) return 0
    const campaignLines: PosCampaignLine[] = lines.map(({ item, quantity }) => ({ id: item.product_id, unit_id: item.unit_id, quantity, price: item.price, discount: item.discount }))
    const point = catalog?.point
    const result = catalog && point
      ? applyPosCampaigns(campaignLines, catalog.campaigns, { branchId: Number(point.branch_id || 0), warehouseId: Number(point.main_warehouse_id || 0), priceClassId: Number(point.price_category_id || 0) }, new Date(), catalog.campaignUsage)
      : { items: campaignLines, invoiceDiscount: 0 }
    const subtotal = result.items.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity) * (1 - Number(line.discount) / 100) - Number(line.campaign_discount || 0), 0)
    const discount = subtotal * Number(order?.discount_percent || 0) / 100
    return round2(subtotal - discount - Number(result.invoiceDiscount || 0))
  }, [catalog, order?.discount_percent])

  const remainingLines = useMemo(() => (order?.items || []).filter((item) => item.remaining_quantity > 0).map((item) => ({ item, quantity: item.remaining_quantity })), [order])
  const remainingTotal = amountFor(remainingLines)
  const pendingTotal = round2(pending.reduce((sum, line) => sum + line.price * line.quantity * (1 - line.discount / 100), 0))
  const currency = catalog?.point?.currency_code || ""

  // ---------------- الدفع ----------------
  const payTotal = payLines ? amountFor(payLines.lines) : 0
  const rateOf = (currencyId: number) => catalog?.currencies.find((row) => row.currency_id === currencyId)?.rate_to_point || 1
  const pointCurrencyId = Number(catalog?.point?.currency_id || 0)
  const updateCash = (currencyId: number, value: number) => {
    const next = { ...cashAmounts, [currencyId]: Math.max(0, round2(value)) }
    setCashAmounts(next)
    const evaluated = round2((catalog?.currencies || []).reduce((sum, row) => sum + round2((next[row.currency_id] || 0) * row.rate_to_point), 0))
    updatePayment("cash", evaluated, pointCurrencyId)
    setPayError("")
  }
  const updatePayment = (method: PaymentMethod, value: number, currencyId?: number) => {
    setPayments((rows) => {
      const existing = rows.find((row) => row.method === method)
      const chosen = currencyId || existing?.currency_id || pointCurrencyId
      const original = Math.max(0, round2(value))
      const next: PaymentDetail = { reference: "", ...existing, method, amount: round2(original * rateOf(chosen)), currency_id: chosen, currency_amount: original }
      return existing ? rows.map((row) => row.method === method ? next : row) : [...rows, next]
    })
  }
  const updatePaymentField = (method: PaymentMethod, field: keyof PaymentDetail, value: unknown) => {
    setPayments((rows) => {
      const existing = rows.find((row) => row.method === method)
      const next = { method, amount: 0, reference: "", ...existing, [field]: value } as PaymentDetail
      return existing ? rows.map((row) => row.method === method ? next : row) : [...rows, next]
    })
    setPayError("")
  }

  const startPayment = async (lines: Line[], partial: boolean) => {
    if (!order || !catalog?.canPay) { setMessage({ type: "error", text: "لا توجد لديك صلاحية دفع حساب الطاولة" }); return }
    // مثل الكاشير: لا دفع بلا عهدة مفتوحة على موقع الطلب
    const info = await loadCustody(order.location_id).catch(() => null)
    if (!info?.session) {
      setScopeOpen(false)
      setMessage({ type: "error", text: "يجب فتح أو استلام العهدة على هذا الموقع قبل الدفع" })
      if (can("receiveCustody")) void openCustody(order.location_id)
      return
    }
    setScopeOpen(false)
    const amount = amountFor(lines)
    setPayLines({ lines, partial })
    setPayCustomerId(order?.customer_id || null)
    setPayError("")
    const cash = { [pointCurrencyId]: amount }
    setCashAmounts(cash)
    setPayments([{ method: "cash", amount, currency_id: pointCurrencyId, currency_amount: amount, reference: "" }])
  }

  const confirmPayment = async () => {
    if (!order || !payLines) return
    const total = payTotal
    const allocated = round2(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0))
    const cash = round2(payments.find((row) => row.method === "cash")?.amount || 0)
    const change = round2(Math.max(0, allocated - total))
    const changeAllowed = change > 0 && cash >= change - 0.009 && allocated - cash <= total + 0.009
    if (allocated < total - 0.009) { setPayError("مجموع تفاصيل الدفع أقل من المبلغ المطلوب"); return }
    if (change > 0 && !changeAllowed) { setPayError("الزيادة على المبلغ مسموحة للدفع النقدي فقط"); return }
    if (payments.some((row) => row.amount > 0 && (row.method === "cheque" || row.method === "account")) && !payCustomerId) { setPayError("اختر العميل عند الدفع بشيك أو على الحساب"); return }
    setPayError("")
    // لقطة الفاتورة قبل الحفظ (الطلب يتحدّث بعده) — تُطبع بنفس طريقة كاشير نقطة البيع
    const point = catalog?.point
    const campaign = catalog && point
      ? applyPosCampaigns(payLines.lines.map(({ item, quantity }) => ({ id: item.product_id, unit_id: item.unit_id, quantity, price: item.price, discount: item.discount })), catalog.campaigns,
        { branchId: Number(point.branch_id || 0), warehouseId: Number(point.main_warehouse_id || 0), priceClassId: Number(point.price_category_id || 0) }, new Date(), catalog.campaignUsage)
      : null
    const receiptLines = payLines.lines.map(({ item, quantity }, index) => ({
      name: item.product_name, code: item.product_code, unitName: item.unit_name || "", quantity, price: item.price, discount: item.discount,
      campaign_discount: Number(campaign?.items[index]?.campaign_discount || 0),
    }))
    const itemsNet = receiptLines.reduce((sum, line) => sum + line.price * line.quantity * (1 - line.discount / 100) - line.campaign_discount, 0)
    const customer = catalog?.customers.find((row) => row.id === payCustomerId)
    const receiptSnapshot: Omit<PosReceipt, "code"> = {
      total, pending: false, lines: receiptLines, mode: "sale", date: nowText(), customerName: customer?.name || "عميل نقدي",
      note: `${order.location_name} - ${tableNames} - ${order.order_no}`,
      subtotal: round2(receiptLines.reduce((sum, line) => sum + line.price * line.quantity, 0)),
      itemDiscount: round2(receiptLines.reduce((sum, line) => sum + line.price * line.quantity * line.discount / 100, 0)),
      invoiceDiscount: round2(itemsNet * Number(order.discount_percent || 0) / 100 + Number(campaign?.invoiceDiscount || 0)),
      tax: round2(total * (catalog?.taxRate || 0) / (100 + (catalog?.taxRate || 0))),
      payments: payments.filter((row) => row.amount > 0), refundAmount: changeAllowed ? change : 0,
      currencyCode: currency, pointName: point?.name || order.location_name,
    }
    const result = await act("pay", {
      order_id: order.id,
      revision: order.revision,
      customer_id: payCustomerId,
      lines: payLines.partial ? payLines.lines.map((line) => ({ item_id: line.item.id, quantity: line.quantity })) : undefined,
      pos_payments: payments.filter((row) => row.amount > 0)
        .map((row) => row.method === "cash" && changeAllowed ? { ...row, amount: round2(row.amount - change), currency_amount: round2(Number(row.currency_amount ?? row.amount) - change) } : row)
        .filter((row) => row.amount > 0),
      cash_change_amount: changeAllowed ? change : 0,
      cash_currency_amounts: (catalog?.currencies || []).filter((row) => (cashAmounts[row.currency_id] || 0) > 0).map((row) => ({ currency_id: row.currency_id, amount: cashAmounts[row.currency_id] })),
    })
    if (!result) { setPayError("تعذر الدفع؛ راجع الرسالة"); return }
    setPayLines(null)
    void printPosReceipt({ ...receiptSnapshot, code: String(result.vch_code || "") }, {
      point, receiptSettings: catalog?.receiptSettings || {}, taxRate: catalog?.taxRate || 0,
      cashierName: user?.fullName || user?.username || "", onPreview: setPrintPreview, onMessage: setMessage,
    })
    setMessage({ type: "success", text: `تم حفظ الفاتورة ${result.vch_code || ""}${result.closed ? " وإغلاق الطاولة" : " — دفعة جزئية، الطاولة ما زالت مفتوحة"}${change > 0 ? ` — الباقي للعميل ${money(change)}` : ""}` })
    if (order.location_id) void loadCatalog(order.location_id, true)
  }

  const printBill = async () => {
    if (!order) return
    try {
      const { settings, company } = await loadVoucherPrintSettings(12)
      const lines = order.items.filter((item) => item.remaining_quantity > 0)
      const document: PrintDocument = {
        noAudit: true, voucherTypeId: 12, title: "حساب طاولة", code: order.order_no, date: nowText(),
        fields: [{ label: "الموقع", value: order.location_name }, { label: isTakeaway ? "النوع" : "الطاولة", value: tableNames }, ...(isTakeaway ? [] : [{ label: "عدد الأشخاص", value: String(order.guests) }])],
        columns: [{ key: "name", label: "الصنف", weight: 3 }, { key: "quantity", label: "الكمية", align: "center", weight: 1 }, { key: "price", label: "السعر", align: "center", weight: 1.2 }, { key: "total", label: "المجموع", align: "center", weight: 1.3 }],
        rows: lines.map((item) => ({ name: `${item.product_name}${item.addons?.length ? ` + ${addonsText(item.addons)}` : ""}`, quantity: qtyText(item.remaining_quantity), price: money(item.price), total: money(item.price * item.remaining_quantity * (1 - item.discount / 100)) })),
        totals: [
          ...(order.totals.paid > 0 ? [{ label: "مدفوع سابقاً", value: money(order.totals.paid) }] : []),
          ...(order.discount_percent > 0 ? [{ label: "خصم", value: `${order.discount_percent}%` }] : []),
          { label: "المطلوب", value: `${money(remainingTotal)} ${currency}`, strong: true },
        ],
        amount: remainingTotal,
      }
      await printVoucherWithSettings(document, { ...settings, paper_size: "Receipt80" as const, orientation: "portrait" as const, show_totals: true, show_signatures: false, show_amount_in_words: false }, company)
      void act("print", { order_id: order.id })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذرت الطباعة" })
    }
  }

  // ---------------- حوارات الطاولات ----------------
  const orderTableIds = new Set(order?.tables.map((table) => table.table_id) || [])
  const tables = floor?.tables || []
  const locations = floor?.locations || []

  const editLine: EditableLine | null = useMemo(() => {
    if (!editing) return null
    if (editing.kind === "pending") {
      const row = pending.find((line) => line.key === editing.key)
      if (!row) return null
      const product = products.find((p) => p.id === row.productId)
      return { name: row.name, quantity: row.quantity, minQuantity: 0, discount: row.discount, note: row.note, units: product?.unitPrices, unitId: row.unitId }
    }
    return { name: editing.item.product_name, quantity: editing.item.quantity, minQuantity: editing.item.paid_quantity, discount: editing.item.discount, note: editing.item.note || "" }
  }, [editing, pending, products])

  const saveEdit = async (value: { quantity: number; discount: number; note: string; unitId?: number | null }) => {
    if (!editing || !order) return
    if (editing.kind === "pending") {
      setPending((rows) => rows.map((row) => {
        if (row.key !== editing.key) return row
        const unit = value.unitId !== undefined ? products.find((p) => p.id === row.productId)?.unitPrices.find((u) => u.unitId === value.unitId) : undefined
        return { ...row, quantity: value.quantity, discount: value.discount, note: value.note, ...(unit ? { unitId: unit.unitId, unitName: unit.unitName, price: unit.price } : {}) }
      }))
      setEditing(null)
      return
    }
    const data = await act("update_item", { order_id: order.id, item_id: editing.item.id, quantity: value.quantity, discount: value.discount, note: value.note })
    if (data) setEditing(null)
  }
  const deleteEdit = async () => {
    if (!editing || !order) return
    if (editing.kind === "pending") { setPending((rows) => rows.filter((row) => row.key !== editing.key)); setEditing(null); return }
    if (!(await confirmYesNo(`حذف ${editing.item.product_name} من الطاولة؟`))) return
    const data = await act("remove_item", { order_id: order.id, item_id: editing.item.id })
    if (data) setEditing(null)
  }

  const saveValueDialog = async (raw: string) => {
    if (!order || !valueDialog) return
    const data = valueDialog === "discount"
      ? await act("update_order", { order_id: order.id, discount_percent: Number(raw) }, "تم تحديث خصم الطلب")
      : await act("update_order", { order_id: order.id, takeaway_name: raw })
    if (data) setValueDialog(null)
  }
  const changeGuests = async (delta: number) => {
    if (!order || !can("openTable")) return
    await act("update_order", { order_id: order.id, guests: Math.max(1, order.guests + delta) })
  }

  // ---------------- الإضافات ----------------
  const addonsLine = useMemo(() => {
    if (!addonsTarget) return null
    if (addonsTarget.kind === "pending") {
      const row = pending.find((line) => line.key === addonsTarget.key)
      if (!row) return null
      return { title: row.name, groups: productById.get(row.productId)?.addonGroups || [], selected: row.addons, note: row.note }
    }
    const item = addonsTarget.item
    return { title: item.product_name, groups: productById.get(item.product_id)?.addonGroups || [], selected: item.addons || [], note: item.note || "" }
  }, [addonsTarget, pending, productById])
  const saveAddons = async (addons: Addon[], note: string) => {
    if (!addonsTarget || !order) return
    if (addonsTarget.kind === "pending") {
      setPending((rows) => rows.map((row) => row.key === addonsTarget.key ? { ...row, addons, note } : row))
      setAddonsTarget(null)
      return
    }
    const data = await act("update_item", { order_id: order.id, item_id: addonsTarget.item.id, addons, note })
    if (data) setAddonsTarget(null)
  }

  // ---------------- العرض ----------------
  if (denied) {
    return (
      <div dir="rtl" className="flex h-full min-h-[320px] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h2 className="text-lg font-bold text-amber-900">لا توجد صلاحية</h2>
          <p className="mt-1 text-sm text-amber-800">{floorError || "لا توجد لديك صلاحية الدخول لشاشة المطعم في الفرع الحالي."}</p>
        </div>
      </div>
    )
  }

  const toast = message && (
    <div className={`fixed bottom-20 left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg lg:bottom-6 ${message.type === "success" ? "bg-emerald-600" : "bg-red-600"}`} onClick={() => setMessage(null)}>
      {message.text}
    </div>
  )
  const shared = (
    <>
      {custodyDialogs}
      {printPreview && <PosPrintPreview title={printPreview.title} html={printPreview.html} onClose={() => setPrintPreview(null)} />}
      {toast}
    </>
  )

  if (!order) {
    return (
      <>
        <RestaurantFloor
          locations={locations} tables={tables} takeaways={floor?.takeaways || []} now={now} loading={loadingFloor} busy={busy} error={floorError}
          locationFilter={locationFilter} onLocationFilter={setLocationFilter} statusFilter={statusFilter} onStatusFilter={setStatusFilter}
          canTakeaway={can("takeaway")} canCustody={canCustody}
          onRefresh={() => void loadFloor()} onCustody={() => void openCustody()} onNewTakeaway={startTakeaway}
          onTable={clickTable} onOrder={(orderId) => void showOrder(orderId)} />

        <Dialog open={openTable !== null} onOpenChange={(value) => { if (!value) setOpenTable(null) }}>
          <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-xs">
            <DialogHeader><DialogTitle>فتح طاولة {openTable?.name}</DialogTitle></DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <Label>عدد الأشخاص</Label>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setGuests((g) => Math.max(1, g - 1))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" className="h-11 w-16 text-center text-lg font-bold" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} />
                <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setGuests((g) => g + 1)}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpenTable(null)}>إلغاء</Button>
              <Button className="h-11" disabled={busy} onClick={() => void confirmOpenTable()}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}فتح الطاولة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={takeawayOpen} onOpenChange={setTakeawayOpen}>
          <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
            <DialogHeader><DialogTitle>طلب سفري جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {locations.length > 1 && (
                <div className="space-y-1">
                  <Label>الموقع</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((location) => <Button key={location.id} size="sm" variant={takeawayLocation === location.id ? "default" : "outline"} onClick={() => setTakeawayLocation(location.id)}>{location.name}</Button>)}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>اسم/رقم الزبون (اختياري)</Label>
                <Input className="h-11" value={takeawayName} autoFocus onChange={(e) => setTakeawayName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmTakeaway() }} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTakeawayOpen(false)}>إلغاء</Button>
              <Button className="h-11" disabled={busy || !takeawayLocation} onClick={() => void confirmTakeaway()}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}فتح الطلب</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {shared}
      </>
    )
  }

  // ---------------- شاشة الطلب ----------------
  const hasRemaining = remainingLines.length > 0
  const actions: OrderAction[] = [
    { key: "transfer", label: isTakeaway ? "إلى طاولة" : "نقل", icon: ArrowRightLeft, show: can("transfer"), onClick: () => { setTransferFrom(order.tables[0]?.table_id ?? null); setPicker("transfer") } },
    { key: "merge", label: "دمج", icon: Combine, show: can("merge") && !isTakeaway, onClick: () => setPicker("merge") },
    { key: "split", label: "فصل", icon: Split, show: can("split"), disabled: !hasRemaining, onClick: () => { setSplitQty({}); setSplitOpen(true) } },
    { key: "print", label: "طباعة الحساب", icon: Printer, show: can("printBill"), disabled: !hasRemaining, onClick: () => void printBill() },
    { key: "cancel", label: order.payments.length ? "إغلاق" : "إلغاء", icon: Ban, show: order.payments.length ? can("pay") && !hasRemaining : can("cancelOrder"), tone: "text-red-600",
      onClick: () => { if (order.payments.length) void act("close", { order_id: order.id }, "تم إغلاق الطاولة"); else { setCancelReason(""); setCancelOpen(true) } } },
    { key: "custody", label: "العهدة", icon: Wallet, show: canCustody, onClick: () => void openCustody(order.location_id) },
  ]

  return (
    <>
      <RestaurantOrder
        order={order} now={now} busy={busy} currency={currency} can={can}
        products={shown} productById={productById} categories={categories} totalProducts={products.length}
        query={query} onQuery={setQuery} category={category} onCategory={setCategory} catalogLoading={catalogLoading} catalogError={catalogError}
        pending={pending} pendingTotal={pendingTotal} remainingTotal={remainingTotal} mobileTab={mobileTab} onMobileTab={setMobileTab} actions={actions}
        onBack={() => void backToFloor()} onAddProduct={onAddProduct}
        onPendingQty={(key, delta) => setPending((rows) => rows.flatMap((row) => row.key !== key ? [row] : row.quantity + delta > 0 ? [{ ...row, quantity: round4(row.quantity + delta) }] : []))}
        onPendingRemove={(key) => setPending((rows) => rows.filter((row) => row.key !== key))}
        onEditPending={(key) => setEditing({ kind: "pending", key })} onEditItem={(item) => setEditing({ kind: "item", item })}
        onPendingAddons={(key) => setAddonsTarget({ kind: "pending", key })} onItemAddons={(item) => setAddonsTarget({ kind: "item", item })}
        onSend={() => void sendPending()} onPay={() => {
          // ولا دفع قبل اكتمال إضافات الأصناف غير المدفوعة
          const incomplete = order.items.find((item) => item.remaining_quantity > 0 && missingGroups(item.product_id, item.addons).length)
          if (incomplete) {
            setMobileTab("ticket")
            setMessage({ type: "error", text: `اختر إضافات "${incomplete.product_name}" قبل الدفع: ${missingGroups(incomplete.product_id, incomplete.addons).join("، ")}` })
            if (can("editItems")) setAddonsTarget({ kind: "item", item: incomplete })
            return
          }
          setScopeOpen(true)
        }} onDiscount={() => setValueDialog("discount")} onGuests={(delta) => void changeGuests(delta)}
        onUnmerge={(tableId, name) => void confirmYesNo(`فك الطاولة ${name} من الطلب؟`).then((ok) => { if (ok) void act("unmerge", { order_id: order.id, table_id: tableId }, `تم فك الطاولة ${name}`) })}
        onRenameTakeaway={() => setValueDialog("takeaway_name")} />

      <ValueDialog open={valueDialog !== null} onOpenChange={(value) => { if (!value) setValueDialog(null) }} busy={busy} onConfirm={(value) => void saveValueDialog(value)}
        {...(valueDialog === "discount"
          ? { title: "خصم الطلب", label: "نسبة الخصم على الطلب", value: String(order.discount_percent || 0), kind: "number" as const, min: 0, max: 100, suffix: "%", presets: [0, 5, 10, 15, 20, 25, 30, 50] }
          : { title: "اسم الطلب السفري", label: "اسم/رقم الزبون", value: order.takeaway_name || "", placeholder: "اختياري" })} />

      <ItemEditDialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null) }} line={editLine} busy={busy}
        canDiscount={can("discount")} canDelete={editing?.kind === "pending" || can("deleteItems")} canReduce={editing?.kind === "pending" || can("deleteItems")}
        onSave={(value) => void saveEdit(value)} onDelete={() => void deleteEdit()} />

      <AddonsDialog open={addonsLine !== null} onOpenChange={(value) => { if (!value) setAddonsTarget(null) }} title={addonsLine?.title || ""}
        groups={addonsLine?.groups || []} selected={addonsLine?.selected || []} note={addonsLine?.note || ""} busy={busy} onSave={(addons, note) => void saveAddons(addons, note)} />

      <TablePickerDialog open={picker === "transfer"} onOpenChange={(value) => { if (!value) setPicker(null) }} title={isTakeaway ? "تحويل الطلب السفري إلى طاولة" : "نقل الطاولة"} description="اختر طاولة فارغة لنقل الطلب إليها"
        tables={tables} locations={locations} allow={(table) => !table.order_id} busy={busy} confirmLabel="نقل"
        onConfirm={(ids) => void act("transfer", { order_id: order.id, from_table_id: transferFrom, to_table_id: ids[0] }, "تم نقل الطاولة").then((data) => { if (data) setPicker(null) })}>
        {order.tables.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>الطاولة المنقولة:</span>
            {order.tables.map((table) => <Button key={table.table_id} size="sm" variant={transferFrom === table.table_id ? "default" : "outline"} onClick={() => setTransferFrom(table.table_id)}>{table.name}</Button>)}
          </div>
        )}
      </TablePickerDialog>

      <TablePickerDialog open={picker === "merge"} onOpenChange={(value) => { if (!value) setPicker(null) }} title="دمج طاولات" multiple
        description="الطاولات الفارغة تُضاف للطلب، والمشغولة ينتقل طلبها بالكامل (أصنافه ودفعاته) إلى هذا الطلب"
        tables={tables} locations={locations} allow={(table) => !orderTableIds.has(table.id)} busy={busy} confirmLabel="دمج"
        onConfirm={(ids) => void act("merge", { order_id: order.id, table_ids: ids }, "تم دمج الطاولات").then((data) => { if (data) setPicker(null) })} />

      <TablePickerDialog open={splitOpen} onOpenChange={setSplitOpen} title="فصل أصناف لطاولة أخرى"
        description="حدد الكميات ثم اختر الطاولة: الفارغة يُفتح عليها طلب جديد، والمشغولة تُضاف الأصناف لطلبها"
        tables={tables} locations={locations} allow={(table) => !orderTableIds.has(table.id)} busy={busy} confirmLabel="فصل"
        onConfirm={(ids) => {
          const lines = Object.entries(splitQty).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ item_id: Number(itemId), quantity }))
          if (!lines.length) { setMessage({ type: "error", text: "حدد كمية صنف واحد على الأقل" }); return }
          void act("split", { order_id: order.id, to_table_id: ids[0], lines }, "تم فصل الأصناف").then((data) => { if (data) setSplitOpen(false) })
        }}>
        <LineQuantities items={order.items} values={splitQty} onChange={setSplitQty} />
      </TablePickerDialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader><DialogTitle>إلغاء الطلب</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>سبب الإلغاء *</Label><Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>رجوع</Button>
            <Button variant="destructive" disabled={busy || !cancelReason.trim()} onClick={() => void act("cancel", { order_id: order.id, reason: cancelReason }, "تم إلغاء الطلب").then((data) => { if (data) setCancelOpen(false) })}>إلغاء الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayScopeDialog open={scopeOpen} onOpenChange={setScopeOpen} items={order.items} guests={order.guests} amountFor={amountFor} currencyCode={currency} busy={busy} onContinue={(lines, partial) => void startPayment(lines, partial)} />

      {catalog && (
        <PosPaymentDetailsDialog open={payLines !== null} onOpenChange={(value) => { if (!value) setPayLines(null) }} mode="sale" total={payTotal}
          currencyCode={currency} pointCurrencyId={pointCurrencyId} currencies={catalog.currencies} customers={catalog.customers}
          customerId={payCustomerId} onCustomerChange={setPayCustomerId} banks={catalog.banks} branches={catalog.bankBranches} cardTypes={catalog.cardTypes}
          payments={payments} cashAmounts={cashAmounts} onCashChange={updateCash}
          onPaymentAmount={(method, value, currencyId) => { updatePayment(method, value, currencyId); setPayError("") }}
          onPaymentField={(method, field, value) => updatePaymentField(method, field, value)}
          pinpadBatch={custodyInfo?.session?.id ?? ""} onConfirm={() => void confirmPayment()} busy={busy} error={payError} />
      )}
      {shared}
    </>
  )
}
