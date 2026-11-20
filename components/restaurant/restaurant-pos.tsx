"use client"

import { addonsPriceDelta } from "@/lib/attribute-prices"
import { playPosBeep } from "@/lib/pos-beeps"
import { tr, appDir } from "@/lib/i18n"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { currentPosTenantKey, custodyOfflineMessage, loadPosCatalog, savePosCatalog } from "@/lib/pos-offline"
import {
  applyOffline, cacheCustody, cachedCustody, cacheFloor, cacheOrder, discardFailedOps, hasOfflineChanges, hasQueuedOps, isNetworkError, OFFLINE_ACTIONS,
  offlineFloor, offlineOps, offlineOrder, setRestaurantOfflineScope, syncRestaurantOffline, type OfflineOp,
} from "@/lib/restaurant-offline"
import { ArrowRightLeft, Ban, Combine, Loader2, Lock, Minus, Plus, Printer, Split, UserCog, Wallet } from "lucide-react"
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
import { RESTAURANT_PERMISSIONS, type RestaurantPermission } from "@/lib/transaction-permission-definitions"
import { askPermissionApproval, setApprovalScopeProvider } from "@/lib/permission-approval-client"
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
  AddonsDialog, addonsText, attributesText, extrasLines, EXTRAS_GROUP, isExtraAddon, ExtrasWizard, ValueDialog, ItemEditDialog, LineQuantities, money, PayScopeDialog, qtyText, round2, round4, TablePickerDialog,
  type Addon, type EditableLine, type FloorLocation, type FloorTable, type OrderItem,
} from "./restaurant-dialogs"
import { RestaurantFloor, type FloorStatusFilter, type Takeaway } from "./restaurant-floor"
import { AssignWaiterDialog, SetPinDialog, SwitchWaiterDialog, WaiterHeaderControls, WaiterLockScreen } from "./restaurant-waiter"
import { localPrintAvailable } from "@/lib/local-print"
import { getWaiterSession, installWaiterFetch, setWaiterSession, WAITER_ENDED_EVENT, type WaiterSession } from "@/lib/restaurant-waiter-client"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import { RestaurantOrder, type Order, type OrderAction, type Pending, type Product } from "./restaurant-order"

type Perms = Record<RestaurantPermission, boolean>
type Floor = {
  branch_id: number; permissions: Perms; locations: FloorLocation[]; tables: FloorTable[]; takeaways: Takeaway[]; server_time: string
  me?: { id: string; name: string; switched: boolean }; kitchen_stuck?: number
}
type Catalog = {
  point: any; taxRate: number; products: Product[]; customers: LookupOption[]; currencies: CurrencyOption[]; banks: LookupOption[]; bankBranches: LookupOption[]
  cardTypes: LookupOption[]; campaigns: PosCampaign[]; campaignUsage: PosCampaignUsage; session: any; canPay: boolean; receiptSettings: Record<string, string>
  /** خدمة اضافات المطعم للموقع (سطر «اضافات») */
  extrasService: { id: number; name: string; unitId: number | null; unitName: string } | null
  /** وقت آخر حفظ لإعدادات الموقع — يختلف عن لوحة الطاولات ⇐ الكتالوج قديم ويُعاد تحميله فوراً */
  settingsAt: string
}
type Line = { item: OrderItem; quantity: number }

// قسيمة المطبخ (80مم، بلا أسعار/شعار) وورقة الحساب — من إعدادات طباعة فاتورة المبيعات على الجهاز الذي يطبع
/** مفتاح كتالوج الطلب: الموقع للطاولات، وسالبه للسفري (فئة السعر للسفري) */
const catalogIdOf = (order: { location_id: number; order_type?: string }) => order.order_type === "takeaway" ? -order.location_id : order.location_id
/** سطر «اضافات» يتبع كمية صنفه، ويُحذف إن حُذف الصنف */
const syncExtras = (rows: Pending[]) => rows.flatMap((row) => {
  if (!row.extrasOf) return [row]
  const parent = rows.find((other) => other.key === row.extrasOf)
  return parent ? [parent.quantity === row.quantity ? row : { ...row, quantity: parent.quantity }] : []
})
const kitchenSlip = (settings: any) => ({ ...settings, paper_size: "Receipt80" as const, orientation: "portrait" as const, print_method: "service" as const, copies: 1, copy_labels: "", show_logo: false, show_company_info: false, header_text: "", show_fields: true, show_row_numbers: true, hidden_columns: [], show_totals: false, show_amount_in_words: false, show_notes: false, show_barcode: false, show_signatures: false, show_footer: false, show_page_numbers: false })
const billSlip = (settings: any) => ({ ...settings, paper_size: "Receipt80" as const, orientation: "portrait" as const, show_totals: true, show_signatures: false, show_amount_in_words: false })
type KitchenTicket = { printer: string; title: string; document: PrintDocument }
// الجهاز المشترك (تابلت للنوادل): يُقفل بعد دقيقتين بلا استخدام ويطلب رمز PIN
const SHARED_KEY = "restaurant-shared-device"
const IDLE_LOCK_MS = 2 * 60_000
const deviceKey = () => {
  try {
    let key = localStorage.getItem("restaurant-device-key")
    if (!key) { key = `dev-${crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)}`; localStorage.setItem("restaurant-device-key", key) }
    return key
  } catch { return "dev-volatile-device" }
}

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
    settingsAt: data.settings_at ? String(data.settings_at) : "",
    extrasService: data.extras_service?.id ? { id: Number(data.extras_service.id), name: String(data.extras_service.product_name || ""), unitId: Number(data.extras_service.unit_id) || null, unitName: String(data.extras_service.unit_name || "") } : null,
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
      addonGroups: (Array.isArray(row.addon_groups) ? row.addon_groups : []).map((group: any) => ({ name: String(group.name || ""), values: (group.values || []).map(String), prices: group.prices && typeof group.prices === "object" ? group.prices : {} })),
      relatedMode: Number(row.related_items_mode || 1),
      relatedIds: (Array.isArray(row.related_ids) ? row.related_ids : []).map(Number),
      relatedItems: (Array.isArray(row.related_items) ? row.related_items : []).map((option: any) => ({ id: Number(option.related_id), addPrice: option.add_price !== false, noKitchenPrint: option.no_kitchen_print === true })),
      extras: (Array.isArray(row.restaurant_extras) ? row.restaurant_extras : []).map((extra: any) => ({ name: String(extra.name || ""), price: Math.max(0, Number(extra.price) || 0) })).filter((extra: any) => extra.name),
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
  const [statusFilter, setStatusFilter] = useState<FloorStatusFilter>("all")
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
  // دون اتصال (lib/restaurant-offline.ts): هذا الجهاز يحفظ عملياته ويزامنها عند عودة الاتصال
  setRestaurantOfflineScope(currentPosTenantKey(user?.id))
  const [offline, setOffline] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<OfflineOp[]>([])
  const refreshQueue = useCallback(() => setOfflineQueue(offlineOps()), [])

  // ---------------- النادل: جلسة PIN لهذا التبويب، الجهاز المشترك، الطباعة المحلية أو طابور المطبخ ----------------
  installWaiterFetch()
  const [waiter, setWaiter] = useState<WaiterSession | null>(() => (typeof window === "undefined" ? null : getWaiterSession()))
  const [sharedDevice, setSharedDevice] = useState(() => { try { return localStorage.getItem(SHARED_KEY) === "1" } catch { return false } })
  const [pinDialog, setPinDialog] = useState<null | "switch" | "set">(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState("")
  const [hasPin, setHasPin] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [waiters, setWaiters] = useState<{ id: string; name: string; role_name?: string | null }[]>([])
  const [waitersLoading, setWaitersLoading] = useState(false)
  // null = لم يُفحص بعد؛ true = جهاز كاشير بخدمة الطباعة (يطبع مباشرة + يطبع طابور الجوالات)؛ false = جوال/تابلت (طابور)
  const [canPrintHere, setCanPrintHere] = useState<boolean | null>(null)
  const lastActivity = useRef(Date.now())

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
  // اختيار يدوي من الأصناف التابعة (related_items_mode = 4): الصنف الأب + التوابع المؤشَّرة
  const [relatedPick, setRelatedPick] = useState<{ product: Product; options: Product[]; selected: number[] } | null>(null)
  const [extrasWizard, setExtrasWizard] = useState<{ product: Product; related: Product[]; includeParent: boolean } | null>(null)
  // kind "new": صنف له «المتغيرات والخصائص» لم يُضف بعد — لا يظهر في الطلب حتى يُختار (الإلغاء لا يضيف شيئاً)
  const [addonsTarget, setAddonsTarget] = useState<
    | { kind: "pending"; key: string }
    | { kind: "item"; item: OrderItem }
    | { kind: "new"; product: Product; related: Product[]; includeParent: boolean; chosen?: string[] }
    | null
  >(null)
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
  const [custodyAction, setCustodyAction] = useState("cash_in")
  const [custodyAmount, setCustodyAmount] = useState(0)
  const [custodyAmounts, setCustodyAmounts] = useState<Record<number, number>>({})
  const [movementAmounts, setMovementAmounts] = useState<Record<number, number>>({})
  const [custodyCurrencyId, setCustodyCurrencyId] = useState(0)
  const [custodyNote, setCustodyNote] = useState("")
  const [custodyError, setCustodyError] = useState("")
  const [custodyBusy, setCustodyBusy] = useState(false)

  const perms = floor?.permissions
  const can = (key: RestaurantPermission) => Boolean(perms?.[key])
  // صلاحية غير ممنوحة ⇐ نافذة "لا يوجد لديك صلاحية" مع رمز تفعيل لايميلي مدير النظام والمسؤول على الموقع
  const ensurePermission = async (key: RestaurantPermission, locationId?: number | null) =>
    can(key) || askPermissionApproval({ scope: "restaurant", key, name: RESTAURANT_PERMISSIONS[key], scopeId: locationId ?? null }, { fresh: true })
  // قبل فتح نافذة إجراء أو تنفيذه: الأزرار تبقى ظاهرة، والنقر بلا صلاحية يفتح نافذة رمز التفعيل أولاً
  const gated = (key: RestaurantPermission, fn: () => void, locationId?: number | null) => () => { void ensurePermission(key, locationId).then((ok) => { if (ok) fn() }) }
  // لوحة الطلب تُظهر كل أدواتها مفعّلة؛ الصلاحية تُفحص (أو تُطلب موافقتها) عند النقر في المعالجات أدناه
  const showAll = (_key: RestaurantPermission) => true

  const loadFloor = useCallback(async (silent = false) => {
    if (!silent) setLoadingFloor(true)
    try {
      const response = await fetch("/api/restaurant/floor", { cache: "no-store" })
      if (response.status === 403) { setDenied(true); setFloorError(await errorOf(response, "لا توجد صلاحية")); return }
      if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الطاولات"))
      const data = await response.json()
      cacheFloor(data)
      setOffline(false)
      // طلبات هذا الجهاز دون اتصال لم تُزامن بعد تبقى ظاهرة فوق لوحة الخادم
      setDenied(false); setFloorError(""); setFloor(hasQueuedOps() ? offlineFloor() || data : data)
    } catch (error) {
      const cached = isNetworkError(error) ? offlineFloor() : null
      if (cached) { setOffline(true); setDenied(false); setFloorError(""); setFloor(cached); return }
      if (!silent) setFloorError(error instanceof Error ? error.message : tr("تعذر تحميل الطاولات"))
    } finally {
      if (!silent) setLoadingFloor(false)
    }
  }, [])

  useEffect(() => { void loadFloor() }, [loadFloor])
  useEffect(() => { void localPrintAvailable().then(setCanPrintHere) }, [])
  // انتهاء جلسة النادل على الخادم (انتهت صلاحيتها/أُوقف الحساب) ⇐ قفل
  useEffect(() => {
    const onEnded = () => { setWaiter(null); setOrder(null); setPending([]); setMessage({ type: "error", text: tr("انتهت جلسة النادل — أدخل رمز PIN من جديد") }); void loadFloor(true) }
    window.addEventListener(WAITER_ENDED_EVENT, onEnded)
    return () => window.removeEventListener(WAITER_ENDED_EVENT, onEnded)
  }, [loadFloor])
  // الجهاز المشترك: قفل تلقائي بعد دقيقتين بلا لمس/كتابة
  useEffect(() => {
    if (!sharedDevice || !waiter) return
    const touch = () => { lastActivity.current = Date.now() }
    touch()
    window.addEventListener("pointerdown", touch); window.addEventListener("keydown", touch)
    const timer = window.setInterval(() => { if (Date.now() - lastActivity.current > IDLE_LOCK_MS) void lockWaiter(true) }, 10_000)
    return () => { window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedDevice, waiter])
  // جهاز الكاشير (خدمة الطباعة متاحة) وشاشة المطعم مفتوحة: يطبع قسائم المطبخ/الحساب التي أرسلتها جوالات النوادل
  useEffect(() => {
    if (!canPrintHere) return
    let stopped = false, running = false
    const device = deviceKey()
    const post = (body: Record<string, unknown>) => fetch("/api/restaurant/kitchen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device, ...body }) })
    const tick = async () => {
      if (running || stopped || document.visibilityState !== "visible") return
      running = true
      try {
        const response = await post({ action: "claim" })
        if (!response.ok) return
        const tickets: { id: number; kind: string; printer: string | null; title: string | null; document: PrintDocument }[] = (await response.json()).tickets || []
        if (!tickets.length) return
        const { settings, company } = await loadVoucherPrintSettings(12)
        const printed: number[] = [], failed: { id: number; error: string }[] = []
        for (const ticket of tickets) {
          try {
            if (ticket.kind === "bill") await printVoucherWithSettings(ticket.document, billSlip(settings), company)
            else await printVoucherWithSettings(ticket.document, { ...kitchenSlip(settings), printer_name: ticket.printer || settings.printer_name }, company)
            printed.push(ticket.id)
          } catch (error) {
            failed.push({ id: ticket.id, error: error instanceof Error ? error.message : "تعذرت الطباعة" })
          }
        }
        await post({ action: "ack", printed, failed })
        if (failed.length) setMessage({ type: "error", text: tr("تعذرت طباعة {0} من قسائم النوادل: {1}", failed.length, failed[0].error) })
        void loadFloor(true)
      } catch { /* يُعاد في الدورة التالية */ } finally {
        running = false
      }
    }
    const timer = window.setInterval(() => void tick(), 4000)
    void tick()
    return () => { stopped = true; window.clearInterval(timer) }
  }, [canPrintHere, loadFloor])
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
  /** مفتاح الكتالوج المعروض فعلاً في الشاشة (قد يختلف عن activeLocation أثناء التحميل) */
  const shownCatalogId = useRef<number | null>(null)
  // مفتاح الكتالوج: رقم الموقع للطاولات، وسالبه للسفري (أسعار «فئة السعر للسفري» — api/restaurant/catalog?order_type=takeaway)
  const fetchCatalog = useCallback(async (locationId: number) => {
    const response = await fetch(`/api/restaurant/catalog?location_id=${Math.abs(locationId)}${locationId < 0 ? "&order_type=takeaway" : ""}`, { cache: "no-store" })
    if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الأصناف"))
    const raw = await response.json()
    const next = normalizeCatalog(raw)
    catalogCache.current.set(locationId, next)
    catalogAt.current.set(locationId, Date.now())
    void savePosCatalog(catalogKey(locationId), raw).catch(() => undefined)
    if (activeLocation.current === locationId) {
      shownCatalogId.current = locationId
      setCatalog(next)
      // الخادم أعاد قائمة فارغة: سبب واضح بدل «لا توجد أصناف مطابقة»
      setCatalogError(next.products.length ? "" : tr("لا توجد أصناف لهذا الموقع — تحقق من «المستودع» في إعدادات الموقع (الأصناف المقيّدة بمستودعات أخرى لا تظهر)"))
    }
    return next
  }, [catalogKey])
  const loadCatalog = useCallback(async (locationId: number, force = false) => {
    activeLocation.current = locationId
    setCatalogError("")
    // كتالوج موقع/نوع آخر معروض (طاولات ⇄ سفري، أو موقع سابق): يُخفى فوراً حتى يجهز الصحيح — كان يبقى قابلاً للنقر
    // أثناء قراءة النسخة المحفوظة/فحص الإعدادات، فيُضاف الصنف بسعر فئة الطاولات (36) لطلب سفري (35)
    if (shownCatalogId.current !== locationId) { shownCatalogId.current = null; setCatalog(null); setCatalogLoading(true) }
    const show = (value: Catalog) => { if (activeLocation.current !== locationId) return; shownCatalogId.current = locationId; setCatalog(value) }
    try {
      let cached = catalogCache.current.get(locationId) || null
      if (!cached && !force) {
        const stored = await loadPosCatalog<any>(catalogKey(locationId)).catch(() => null)
        if (stored?.catalog) { cached = normalizeCatalog(stored.catalog); catalogCache.current.set(locationId, cached); catalogAt.current.set(locationId, 0) }
      }
      // إعدادات الموقع تغيّرت منذ حفظ الكتالوج (وقت الحفظ في لوحة الطاولات مختلف): تحميل فوري بدل انتظار التحديث الدوري
      const stamp = floorRef.current?.locations.find((row) => row.id === Math.abs(locationId))?.settings_at
      if (cached && stamp && cached.settingsAt !== String(stamp)) {
        try { return await fetchCatalog(locationId) } catch { /* دون اتصال: النسخة المحفوظة */ }
      }
      // نسخة محفوظة بلا أصناف: لا تُعرض شاشة فارغة بصمت — تحميل فعلي يُظهر سبب الخطأ إن فشل
      if (cached && !cached.products.length) cached = null
      if (cached) {
        show(cached)
        if (force || Date.now() - (catalogAt.current.get(locationId) || 0) > CATALOG_REFRESH_MS) void fetchCatalog(locationId).catch(() => undefined)
        return cached
      }
      try {
        return await fetchCatalog(locationId)
      } catch (error) {
        if (activeLocation.current === locationId) { setCatalog(null); setCatalogError(error instanceof Error ? error.message : tr("تعذر تحميل الأصناف")) }
        return null
      }
    } finally {
      if (activeLocation.current === locationId) setCatalogLoading(false)
    }
  }, [catalogKey, fetchCatalog])
  const floorRef = useRef<Floor | null>(null)
  floorRef.current = floor
  // حفظ إعدادات موقع (شاشة المواقع، نفس التبويب أو تبويب آخر): تُمسح نسخ الكتالوج وتُعاد اللوحة والطلب المفتوح فوراً
  const orderRef = useRef(order)
  orderRef.current = order
  useEffect(() => {
    const refresh = () => {
      catalogCache.current.clear(); catalogAt.current.clear()
      void loadFloor(true)
      const current = orderRef.current
      if (current?.location_id) void loadCatalog(catalogIdOf(current), true)
    }
    const onStorage = (event: StorageEvent) => { if (event.key === "restaurant-settings-changed") refresh() }
    window.addEventListener("restaurant-settings-changed", refresh)
    window.addEventListener("storage", onStorage)
    return () => { window.removeEventListener("restaurant-settings-changed", refresh); window.removeEventListener("storage", onStorage) }
  }, [loadFloor, loadCatalog])

  // سفري حُوِّل إلى طاولة (أو العكس): أسعار الإضافات التالية من فئة سعر النوع الجديد
  useEffect(() => {
    if (!order?.location_id) return
    const id = catalogIdOf(order)
    if (activeLocation.current !== id) void loadCatalog(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.location_id, order?.order_type, loadCatalog])

  const showOrder = useCallback(async (orderId: number) => {
    setBusy(true)
    const showLocal = () => {
      const local = offlineOrder(orderId)
      if (!local || local.status !== "open") { setMessage({ type: "error", text: tr("الطلب غير محفوظ على هذا الجهاز — يحتاج اتصالاً لفتحه") }); return }
      setOrder(local); setPending([]); setQuery(""); setCategory("all"); setMobileTab("menu")
      void loadCatalog(catalogIdOf(local))
    }
    try {
      if (hasOfflineChanges(orderId)) { showLocal(); return }
      const response = await fetch(`/api/restaurant/orders?id=${orderId}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الطلب"))
      const data: Order = await response.json()
      cacheOrder(data)
      if (data.status !== "open") { setMessage({ type: "error", text: tr("الطلب لم يعد مفتوحاً") }); await loadFloor(true); return }
      setOrder(data); setPending([]); setQuery(""); setCategory("all"); setMobileTab("menu")
      void loadCatalog(catalogIdOf(data))
    } catch (error) {
      if (isNetworkError(error)) { setOffline(true); showLocal(); return }
      setMessage({ type: "error", text: error instanceof Error ? error.message : tr("تعذر تحميل الطلب") })
    } finally {
      setBusy(false)
    }
  }, [loadCatalog, loadFloor])

  /** تنفيذ إجراء على الطلب؛ الاستجابة تحمل الطلب المحدَّث */
  const act = useCallback(async (action: string, body: Record<string, unknown>, success?: string): Promise<any> => {
    setBusy(true)
    // دون اتصال (أو طلب عليه عمليات لم تُزامن): يُطبَّق محلياً ويُحفظ في طابور المزامنة — lib/restaurant-offline.ts
    const runLocal = () => {
      if (!OFFLINE_ACTIONS.has(action)) throw new Error(tr("هذا الإجراء يحتاج اتصالاً بالخادم — متاح عند عودة الاتصال"))
      const data = applyOffline(action, body, { floor, userName: user?.fullName || user?.username || "" })
      if (data.order && data.order.status === "open") setOrder(data.order)
      else if (data.order) { setOrder(null); setPending([]) }
      if (success) setMessage({ type: "success", text: tr("{0} — دون اتصال، ستُزامن عند عودة الاتصال", success) })
      setFloor(offlineFloor()); refreshQueue()
      return data
    }
    try {
      if (body.order_id !== undefined && hasOfflineChanges(Number(body.order_id))) return runLocal()
      let response: Response
      try {
        response = await fetch("/api/restaurant/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
      } catch (error) {
        if (!isNetworkError(error)) throw error
        setOffline(true)
        return runLocal()
      }
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
      setMessage({ type: "error", text: error instanceof Error ? error.message : tr("تعذر تنفيذ العملية") })
      return null
    } finally {
      setBusy(false)
    }
  }, [floor, loadFloor, order, refreshQueue, showOrder, user?.fullName, user?.username])

  // المزامنة: عند عودة الاتصال، ودورياً ما دام في الطابور عمليات
  const runSync = useCallback(async () => {
    if (!hasQueuedOps()) { refreshQueue(); return }
    const result = await syncRestaurantOffline()
    refreshQueue()
    if (result.network) { setOffline(true); return }
    setOffline(false)
    if (result.done || result.failed) {
      const parts = [tr("تمت مزامنة {0} عملية من وقت الانقطاع", result.done), ...(result.failed ? [tr("فشلت {0} — راجع التنبيه", result.failed)] : []), ...result.notes.map((note) => tr(note))]
      setMessage({ type: result.failed ? "error" : "success", text: parts.join(" — ") })
      setOrder((current) => (current && current.id < 0 ? null : current))
      void loadFloor(true)
    }
  }, [loadFloor, refreshQueue])
  useEffect(() => {
    refreshQueue()
    const onOnline = () => void runSync()
    window.addEventListener("online", onOnline)
    const timer = window.setInterval(() => { if (hasQueuedOps() && navigator.onLine) void runSync() }, 20_000)
    void runSync()
    return () => { window.removeEventListener("online", onOnline); window.clearInterval(timer) }
  }, [refreshQueue, runSync])

  useNavigationGuard(() => pending.length > 0, (continueNavigation) => {
    void confirmYesNo(tr("توجد أصناف لم تُرسل للطاولة بعد. هل تريد المتابعة وتجاهلها؟")).then((ok) => { if (ok) { setPending([]); continueNavigation() } })
  })

  const backToFloor = async () => {
    if (pending.length && !(await confirmYesNo(tr("توجد أصناف لم تُرسل بعد. هل تريد تجاهلها والعودة للطاولات؟")))) return
    setOrder(null); setPending([]); setPayLines(null); void loadFloor(true)
  }

  const clickTable = async (table: FloorTable) => {
    if (table.order_id) { void showOrder(table.order_id); return }
    if (!(await ensurePermission("openTable", table.location_id))) { setMessage({ type: "error", text: tr("لا توجد لديك صلاحية فتح طاولة") }); return }
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
    // دون اتصال: آخر عهدة محفوظة للموقع (الدفع دون اتصال يتطلب عهدة كانت مفتوحة)
    const response = await fetch(`/api/restaurant/custody?location_id=${locationId}`, { cache: "no-store" }).catch((error) => {
      const cached = isNetworkError(error) ? cachedCustody(locationId) : null
      if (!cached) throw new Error(tr("لا يوجد اتصال بالخادم ولا عهدة محفوظة لهذا الموقع"))
      return { ok: true, json: async () => cached, offline: true } as unknown as Response
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(data?.error || "تعذر تحميل العهدة"))
    const info = {
      session: data.session || null, pending: data.pending || [], active_shift: data.active_shift || null,
      currencies: (data.currencies || []).map((row: any) => ({ currency_id: Number(row.currency_id), currency_code: String(row.currency_code || ""), currency_name: String(row.currency_name || ""), rate_to_point: Number(row.rate_to_point || 1) })),
    }
    if (!(response as any).offline) cacheCustody(locationId, data)
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
      setCustodyAction(session ? "cash_in" : info.pending.length ? "receive" : "open")
      const amounts: Record<number, number> = {}
      for (const row of session?.currencies || []) amounts[Number(row.currency_id)] = Number(row.expected_amount || 0)
      setCustodyAmounts(amounts)
      setCustodyCurrencyId(Number(info.currencies[0]?.currency_id || 0))
      if (!(await ensurePermission(session ? "handoverCustody" : "receiveCustody", resolved))) return
      setCustodyOpen(true)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : tr("تعذر تحميل العهدة") })
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
      }).catch(() => { throw new Error(tr(custodyOfflineMessage(action))) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data?.error || "فشلت عملية العهدة"))
      // إيصال تسليم/إغلاق العهدة بنفس طريقة الكاشير
      if (session && (action === "handover" || action === "close")) {
        void printCustodyHandover({
          kind: action === "close" ? "close" : "handover", pointName: custodyLocationName, userName: user?.fullName || user?.username || "",
          currencyCode: custodyCurrency?.currency_code || "", session, currencies, amounts: { ...custodyAmounts }, note: custodyNote,
        }).catch((error) => setMessage({ type: "error", text: tr("تمت العملية لكن تعذرت الطباعة: {0}", error instanceof Error ? error.message : "") }))
      }
      setMessage({ type: "success", text: tr("تم تنفيذ عملية العهدة بنجاح") })
      setCustodyOpen(false); setMovementAmounts({}); setCustodyNote("")
      await loadCustody(custodyLocation)
    } catch (error) {
      setCustodyError(error instanceof Error ? error.message : tr("فشلت عملية العهدة"))
    } finally {
      setCustodyBusy(false)
    }
  }
  // زر العهدة ظاهر دائماً؛ بلا صلاحية تظهر نافذة رمز التفعيل قبل نافذة العهدة (openCustody)
  // النادل (بلا دفع ولا استلام/تسليم عهدة): لا تظهر له العهدة؛ غيره تُفحص صلاحيته عند النقر (رمز التفعيل)
  const waiterMode = Boolean(perms) && !can("pay") && !can("receiveCustody") && !can("handoverCustody")
  const canCustody = !waiterMode
  // الموقع الحالي (الطلب المفتوح، ثم العهدة، ثم فلتر الموقع أو الموقع الوحيد) — إليه يُرسل رمز تفعيل الصلاحية
  const approvalLocationRef = useRef<number | null>(null)
  approvalLocationRef.current = order?.location_id ?? custodyLocation ?? (locationFilter !== "all" ? locationFilter : floor?.locations.length === 1 ? floor.locations[0].id : null)
  useEffect(() => setApprovalScopeProvider("restaurant", () => approvalLocationRef.current), [])
  // عند فتح الشاشة بلا عهدة مفتوحة للمستخدم على أي موقع: افتح نافذة العهدة مباشرة (مرة واحدة)
  const custodyAutoChecked = useRef(false)
  useEffect(() => {
    if (custodyAutoChecked.current || !floor || !can("receiveCustody")) return
    const locations = floor.locations || []
    if (!locations.length) return
    custodyAutoChecked.current = true
    void (async () => {
      const results = await Promise.all(locations.map(async (location) => {
        const response = await fetch(`/api/restaurant/custody?location_id=${location.id}`, { cache: "no-store" }).catch(() => null)
        const data = response?.ok ? await response.json().catch(() => null) : null
        return data ? { id: location.id, session: data.session, pending: (data.pending || []).length } : null
      }))
      const valid = results.filter(Boolean) as { id: number; session: any; pending: number }[]
      if (!valid.length || valid.some((row) => row.session)) return
      const target = locations.length === 1 ? valid[0] : valid.find((row) => row.pending > 0)
      if (target) void openCustody(target.id)
      else setCustodyPicker(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor])
  const custodyDialogs = (
    <>
      <Dialog open={custodyPicker} onOpenChange={setCustodyPicker}>
        <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader><DialogTitle>{tr("عهدة أي موقع؟")}</DialogTitle></DialogHeader>
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

  const startTakeaway = async () => {
    if (!(await ensurePermission("takeaway", locationFilter !== "all" ? locationFilter : null))) return
    const first = locationFilter !== "all" ? locationFilter : floor?.locations.find((l) => l.configured)?.id ?? floor?.locations[0]?.id ?? null
    // 2026-11-19: لا نافذة ملاحظة عند فتح السفري — الملاحظة تُضاف بعد الأصناف (زر «إضافة ملاحظة») وهي مطلوبة قبل الإرسال للمطبخ.
    // النافذة تظهر فقط لاختيار الموقع عند تعدد المواقع وعدم تحديد موقع في الفلتر
    if (locationFilter !== "all" || locations.length <= 1) { if (first) void confirmTakeaway(first); return }
    setTakeawayLocation(first); setTakeawayName(""); setTakeawayOpen(true)
  }
  const confirmTakeaway = async (locationId = takeawayLocation) => {
    if (!locationId) return
    const data = await act("open_takeaway", { location_id: locationId, name: "" })
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
   * إضافة صنف حسب "إضافة الأصناف التابعة" في تعريفه: 1 الصنف فقط، 2 التوابع فقط، 3 الصنف والتوابع، 4 اختيار يدوي من التوابع.
   * خيارات كل تابع: "اضافة السعر عند الاختيار" (لا = بسعر صفر) و"عدم الطباعة في فواتير المطبخ والمطعم".
   * التوابع غير الموجودة في قائمة الموقع (مستودع/فئة سعر مختلفة) تُتخطّى مع تنبيه.
   */
  const addProduct = async (product: Product) => {
    if (!(await ensurePermission("addItems", order?.location_id))) { setMessage({ type: "error", text: tr("لا توجد لديك صلاحية إضافة أصناف للطاولة") }); return }
    // الأسعار المعروضة يجب أن تكون لنوع هذا الطلب (طاولات/سفري) — وإلا ينتظر حتى تُحمَّل
    if (order && shownCatalogId.current !== catalogIdOf(order)) { setMessage({ type: "error", text: tr("جاري تحميل أسعار هذا الطلب — حاول بعد لحظة") }); return }
    // صنف بلا سعر في فئة السعر (الطاولات/السفري): تنبيه صوتي ومنع الإضافة
    if (!(Number(product.price) > 0)) {
      playPosBeep("noPrice")
      setMessage({ type: "error", text: tr("سعر الصنف المختار غير محدد يجب تحديد السعر للتمكن من الاستمرار") })
      return
    }
    const related = product.relatedMode > 1 ? product.relatedIds.map((id) => productById.get(id)).filter((row): row is Product => Boolean(row)) : []
    const missing = product.relatedMode > 1 ? product.relatedIds.length - related.length : 0
    if (missing > 0) setMessage({ type: "error", text: tr("{0} من توابع {1} غير متاحة في قائمة هذا الموقع وتم تخطيها", missing, product.name) })
    if (product.relatedMode === 4 && related.length) { setRelatedPick({ product, options: related, selected: [] }); return }
    addLines(product, product.relatedMode === 2 || product.relatedMode === 3 ? related : [], product.relatedMode !== 2 || !related.length)
  }

  const addLines = (product: Product, related: Product[], includeParent: boolean, chosen?: string[], attrs?: { addons: Addon[]; note: string }) => {
    // اضافات المطعم: معالج «مع/بدون» أولاً (الإلغاء لا يضيف شيئاً)، ثم يُعاد الاستدعاء بالمختار
    const extras = includeParent ? product.extras || [] : []
    if (extras.length && chosen === undefined) { setExtrasWizard({ product, related, includeParent }); return }
    // «المتغيرات والخصائص»: الاختيار قبل الإضافة — الصنف لا يظهر في الطلب حتى يُختار (الإلغاء لا يضيف شيئاً)
    const parentGroups = includeParent ? product.addonGroups || [] : []
    if (parentGroups.length && attrs === undefined) { setAddonsTarget({ kind: "new", product, related, includeParent, chosen }); return }
    const parentAddons: Addon[] = [...(attrs?.addons || []), ...(chosen || []).map((name) => ({ group: EXTRAS_GROUP, value: tr("مع {0}", name) }))]
    // سعر الصنف + فرق أسعار القيم المختارة (lib/attribute-prices.ts)
    const parentPrice = round4(Math.max(0, product.price + addonsPriceDelta(parentGroups, attrs?.addons)))
    const extrasTotal = round2(extras.filter((extra) => chosen?.includes(extra.name)).reduce((sum, extra) => sum + extra.price, 0))
    const service = catalog?.extrasService || null
    if (extrasTotal > 0 && !service) {
      playPosBeep("noPrice")
      setMessage({ type: "error", text: tr("حدّد «خدمة اضافات المطعم» في إعدادات الموقع لإضافة إضافات لها سعر") })
      return
    }
    const parentKey = `${product.id}-${Date.now()}-${Math.random()}`
    const optionOf = (id: number) => product.relatedItems?.find((option) => option.id === id)
    const lines: { product: Product; key: string; price: number; relatedOf?: string; noKitchenPrint?: boolean }[] = [
      ...(includeParent ? [{ product, key: parentKey, price: product.price }] : []),
      ...related.map((row) => {
        const option = optionOf(row.id)
        return { product: row, key: `${parentKey}-${row.id}`, price: option?.addPrice === false ? 0 : row.price, relatedOf: product.name, noKitchenPrint: option?.noKitchenPrint === true }
      }),
    ]
    // تابع له خصائص وميزات: سطر مستقل (لا يُدمج مع سطر سابق) وتُفتح نافذة الاختيار بعد إضافته
    const hasAddons = (row: Product) => (row.addonGroups || []).length > 0
    const firstWithAddons = lines.find((line) => line.key !== parentKey && hasAddons(line.product))
    setPending((rows) => {
      let next = rows
      for (const line of lines) {
        // صنف بإضافات مطعم: سطر مستقل بإضافاته «مع ...» وتحته سطر «اضافات» بمجموع أسعارها (يتبع كميته)
        if (line.key === parentKey && (extras.length || parentGroups.length)) {
          next = [...next, { key: line.key, productId: line.product.id, name: line.product.name, unitId: line.product.unitId, unitName: line.product.unitName, price: parentPrice, quantity: 1, discount: 0, note: attrs?.note || "", addons: parentAddons, groupPrinter: line.product.groupPrinter, category: line.product.category }]
          if (extrasTotal > 0 && service) next = [...next, { key: `${parentKey}-extras`, productId: service.id, name: tr("اضافات"), unitId: service.unitId, unitName: service.unitName, price: extrasTotal, quantity: 1, discount: 0, note: "", addons: [], groupPrinter: "", category: line.product.category, relatedOf: line.product.name, noKitchenPrint: true, extrasOf: parentKey }]
          continue
        }
        const index = hasAddons(line.product) ? -1 : next.findIndex((row) => row.productId === line.product.id && row.unitId === line.product.unitId && row.price === line.price && !row.note && !row.discount && !row.addons.length && row.relatedOf === line.relatedOf && Boolean(row.noKitchenPrint) === Boolean(line.noKitchenPrint))
        next = index >= 0
          ? next.map((row, i) => i === index ? { ...row, quantity: round4(row.quantity + 1) } : row)
          : [...next, { key: line.key, productId: line.product.id, name: line.product.name, unitId: line.product.unitId, unitName: line.product.unitName, price: line.price, quantity: 1, discount: 0, note: "", addons: [], groupPrinter: line.product.groupPrinter, category: line.product.category, relatedOf: line.relatedOf, noKitchenPrint: line.noKitchenPrint }]
      }
      return next
    })
    if (firstWithAddons) setAddonsTarget({ kind: "pending", key: firstWithAddons.key })
  }

  const confirmRelatedPick = () => {
    if (!relatedPick) return
    addLines(relatedPick.product, relatedPick.options.filter((row) => relatedPick.selected.includes(row.id)), true)
    setRelatedPick(null)
  }

  // مرجع ثابت لشبكة الأصناف (memo) — الضغط على صنف لا يعيد رسم الشبكة
  const addProductRef = useRef(addProduct)
  addProductRef.current = addProduct
  const onAddProduct = useCallback((product: Product) => addProductRef.current(product), [])

  // نافذة "بحث الأصناف" الموحّدة: المختار يُضاف من قائمة الموقع (سعرها وعملتها ووحدتها) كما لو نُقر في الشبكة
  const [itemSearchOpen, setItemSearchOpen] = useState(false)
  const addSearchedItems = async (selected: any[]) => {
    const missing: string[] = []
    for (const row of selected) {
      const product = productById.get(Number(row.id))
      if (!product) { missing.push(String(row.product_name || row.product_code || row.id)); continue }
      const unitId = Number(row.selected_unit?.unit_id) || null
      const unit = unitId ? product.unitPrices.find((option) => option.unitId === unitId) : undefined
      await addProduct(unit ? { ...product, unitId: unit.unitId, unitName: unit.unitName || product.unitName, price: unit.price } : product)
    }
    if (missing.length) setMessage({ type: "error", text: tr("أصناف غير متاحة في قائمة هذا الموقع: {0}", missing.join("، ")) })
  }

  const isTakeaway = order?.order_type === "takeaway"
  const tableNames = isTakeaway ? tr("سفري{0}", order?.takeaway_name ? ` ${order.takeaway_name}` : "") : order?.tables.map((table) => table.name).join(" + ") || ""

  // قسائم المطبخ: ورقة بالأصناف والكميات والملاحظات (بلا أسعار) — كما في كاشير نقطة البيع. الأولوية لطابعة الصنف
  // (الطابعة الافتراضية في ملف الصنف): أصنافها تُجمع على ورقة واحدة لكل طابعة؛ وإلا حسب مجموعة الصنف وطابعتها.
  const kitchenTickets = (lines: Pending[]): KitchenTicket[] => {
    const groups = new Map<string, { name: string; printer: string; lines: Pending[] }>()
    const products = new Map((catalog?.products || []).map((product) => [product.id, product]))
    for (const line of lines) {
      // تابع معرَّف بـ "عدم الطباعة في فواتير المطبخ والمطعم"
      if (line.noKitchenPrint) continue
      const itemPrinter = products.get(line.productId)?.itemPrinter || ""
      const printer = itemPrinter || line.groupPrinter
      if (!printer) continue
      const key = itemPrinter ? `printer|${itemPrinter}` : `${line.category}|${printer}`
      const group = groups.get(key) || { name: itemPrinter ? itemPrinter : line.category, printer, lines: [] }
      group.lines.push(line); groups.set(key, group)
    }
    // نفس شرط الكاشير: إعداد نقطة البيع "طباعة حسب مجموعة الصنف"
    if (!groups.size || !order || !catalog?.point?.print_by_item_group) return []
    return [...groups.values()].map((group) => ({
      printer: group.printer, title: group.name,
      document: {
        noAudit: true, voucherTypeId: 12, title: tr("{0} — {1}{2}", group.name, isTakeaway ? "" : "طاولة ", tableNames), code: order.order_no, date: nowText(),
        fields: [{ label: tr("الموقع"), value: order.location_name }, { label: tr("الطاولة"), value: tableNames }, ...(order.waiter_name ? [{ label: tr("النادل"), value: order.waiter_name }] : [])],
        columns: [{ key: "name", label: tr("الصنف"), weight: 3.2 }, { key: "quantity", label: tr("الكمية"), align: "center", weight: 1 }],
        rows: group.lines.flatMap((line) => {
          const attributes = attributesText(line.addons)
          return [
            { name: `${line.name}${line.unitName ? ` (${line.unitName})` : ""}${attributes ? ` + ${attributes}` : ""}${line.note ? ` — ${line.note}` : ""}`, quantity: qtyText(line.quantity) },
            ...extrasLines(line.addons).map((text) => ({ name: `    • ${text}`, quantity: "" })),
          ]
        }),
      } as PrintDocument,
    }))
  }

  const printKitchen = async (lines: Pending[]) => {
    const tickets = kitchenTickets(lines)
    if (!tickets.length) return
    try {
      const { settings, company } = await loadVoucherPrintSettings(12)
      const failures: string[] = []
      for (const ticket of tickets) {
        try { await printVoucherWithSettings(ticket.document, { ...kitchenSlip(settings), printer_name: ticket.printer }, company) }
        catch (error) { failures.push(`${ticket.title}: ${error instanceof Error ? error.message : "تعذرت الطباعة"}`) }
      }
      if (failures.length) setMessage({ type: "error", text: tr("أُرسلت الأصناف لكن تعذرت طباعة المطبخ: {0}", failures.join(" — ")) })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : tr("تعذرت طباعة المطبخ") })
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
      setMessage({ type: "error", text: tr("اختر إضافات \"{0}\": {1}", incomplete.name, missingGroups(incomplete.productId, incomplete.addons).join("، ")) })
      setAddonsTarget({ kind: "pending", key: incomplete.key })
      return
    }
    // السفري: ملاحظة الطلب (اسم/رقم الزبون) مطلوبة قبل الإرسال للمطبخ
    if (order.order_type === "takeaway" && !String(order.takeaway_name || "").trim()) {
      setMessage({ type: "error", text: tr("أدخل ملاحظة الطلب السفري قبل الإرسال إلى المطبخ") })
      setValueDialog("takeaway_name")
      return
    }
    const lines = pending
    // جهاز بلا طباعة محلية (جوال/تابلت النادل): القسائم تُرسل مع الأصناف لطابور يطبعه جهاز الكاشير
    const local = canPrintHere ?? await localPrintAvailable()
    let queue: KitchenTicket[] = []
    if (!local) {
      const wanted = !catalog?.point?.kitchen_print_confirm || await confirmYesNo(tr("هل تريد طباعة قسائم المطبخ لهذا الطلب؟"))
      if (wanted) queue = kitchenTickets(lines)
    }
    const data = await act("add_items", {
      order_id: order.id,
      items: lines.map((line) => ({ product_id: line.productId, product_name: line.name, unit_id: line.unitId, unit_name: line.unitName, price: line.price, quantity: line.quantity, discount: line.discount, note: line.note, addons: line.addons })),
      ...(queue.length ? { queue_tickets: queue } : {}),
    }, queue.length ? tr("أُرسل الطلب للمطبخ — يُطبع على جهاز الكاشير") : tr("تم إرسال الأصناف للطاولة"))
    if (!data) return
    setPending([])
    if (!local) return
    // خيار الموقع "اظهار رسالة طباعة عند ارسال الطلب الى المطبخ": يسأل قبل طباعة القسائم (لا = إرسال بلا طباعة)
    if (catalog?.point?.kitchen_print_confirm && !(await confirmYesNo(tr("تم إرسال الطلب إلى المطبخ. هل تريد طباعة قسائم المطبخ؟")))) return
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
    if (!order) return
    if (!catalog?.canPay && !(await ensurePermission("pay", order.location_id))) { setMessage({ type: "error", text: tr("لا توجد لديك صلاحية دفع حساب الطاولة") }); return }
    // مثل الكاشير: لا دفع بلا عهدة مفتوحة على موقع الطلب
    const info = await loadCustody(order.location_id).catch(() => null)
    if (!info?.session) {
      setScopeOpen(false)
      setMessage({ type: "error", text: tr("يجب فتح أو استلام العهدة على هذا الموقع قبل الدفع") })
      void openCustody(order.location_id)
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
    if (allocated < total - 0.009) { setPayError(tr("مجموع تفاصيل الدفع أقل من المبلغ المطلوب")); return }
    if (change > 0 && !changeAllowed) { setPayError(tr("الزيادة على المبلغ مسموحة للدفع النقدي فقط")); return }
    if (payments.some((row) => row.amount > 0 && (row.method === "cheque" || row.method === "account")) && !payCustomerId) { setPayError(tr("اختر العميل عند الدفع بشيك أو على الحساب")); return }
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
    if (!result) { setPayError(tr("تعذر الدفع؛ راجع الرسالة")); return }
    setPayLines(null)
    void printPosReceipt({ ...receiptSnapshot, pending: Boolean(result.offline), code: String(result.vch_code || "") }, {
      point, receiptSettings: catalog?.receiptSettings || {}, taxRate: catalog?.taxRate || 0,
      cashierName: user?.fullName || user?.username || "", onPreview: setPrintPreview, onMessage: setMessage,
    })
    setMessage({ type: "success", text: result.offline
      ? tr("حُفظ الدفع دون اتصال{0} — تُصدر الفاتورة عند عودة الاتصال{1}", result.closed ? " وأُغلقت الطاولة" : "", change > 0 ? ` — الباقي للعميل ${money(change)}` : "")
      : tr("تم حفظ الفاتورة {0}{1}{2}", result.vch_code || "", result.closed ? " وإغلاق الطاولة" : " — دفعة جزئية، الطاولة ما زالت مفتوحة", change > 0 ? ` — الباقي للعميل ${money(change)}` : "") })
    if (order.location_id && !result.offline) void loadCatalog(catalogIdOf(order), true)
  }

  const printBill = async () => {
    if (!order) return
    try {
      const lines = order.items.filter((item) => item.remaining_quantity > 0)
      const document: PrintDocument = {
        noAudit: true, voucherTypeId: 12, title: tr("حساب طاولة"), code: order.order_no, date: nowText(),
        fields: [{ label: tr("الموقع"), value: order.location_name }, { label: isTakeaway ? tr("النوع") : tr("الطاولة"), value: tableNames }, ...(isTakeaway ? [] : [{ label: tr("عدد الأشخاص"), value: String(order.guests) }])],
        columns: [{ key: "name", label: tr("الصنف"), weight: 3 }, { key: "quantity", label: tr("الكمية"), align: "center", weight: 1 }, { key: "price", label: tr("السعر"), align: "center", weight: 1.2 }, { key: "total", label: tr("المجموع"), align: "center", weight: 1.3 }],
        rows: lines.map((item) => ({ name: `${item.product_name}${item.addons?.length ? ` + ${addonsText(item.addons)}` : ""}`, quantity: qtyText(item.remaining_quantity), price: money(item.price), total: money(item.price * item.remaining_quantity * (1 - item.discount / 100)) })),
        totals: [
          ...(order.totals.paid > 0 ? [{ label: tr("مدفوع سابقاً"), value: money(order.totals.paid) }] : []),
          ...(order.discount_percent > 0 ? [{ label: tr("خصم"), value: `${order.discount_percent}%` }] : []),
          { label: tr("المطلوب"), value: `${money(remainingTotal)} ${currency}`, strong: true },
        ],
        amount: remainingTotal,
      }
      // «طلب الحساب» من جوال النادل: الورقة تُطبع على جهاز الكاشير، والطاولة تظهر «الحساب مطلوب»
      if (!(canPrintHere ?? await localPrintAvailable())) {
        await act("print", { order_id: order.id, queue_tickets: [{ printer: "", title: tr("حساب طاولة"), document }] }, tr("تم طلب الحساب — يُطبع على جهاز الكاشير"))
        return
      }
      const { settings, company } = await loadVoucherPrintSettings(12)
      await printVoucherWithSettings(document, billSlip(settings), company)
      void act("print", { order_id: order.id })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : tr("تعذرت الطباعة") })
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
    const currentDiscount = editing.kind === "pending" ? Number(pending.find((row) => row.key === editing.key)?.discount || 0) : Number(editing.item.discount || 0)
    if (Number(value.discount || 0) !== currentDiscount && Number(value.discount || 0) > 0 && !(await ensurePermission("discount", order.location_id))) return
    if (editing.kind === "pending") {
      setPending((rows) => rows.map((row) => {
        if (row.key !== editing.key) return row
        const unit = value.unitId !== undefined ? products.find((p) => p.id === row.productId)?.unitPrices.find((u) => u.unitId === value.unitId) : undefined
        return { ...row, quantity: value.quantity, discount: value.discount, note: value.note, ...(unit ? { unitId: unit.unitId, unitName: unit.unitName, price: unit.price } : {}) }
      }))
      setPending((rows) => syncExtras(rows))
      setEditing(null)
      return
    }
    const data = await act("update_item", { order_id: order.id, item_id: editing.item.id, quantity: value.quantity, discount: value.discount, note: value.note })
    if (data) setEditing(null)
  }
  const deleteEdit = async () => {
    if (!editing || !order) return
    if (editing.kind === "pending") { setPending((rows) => rows.filter((row) => row.key !== editing.key)); setEditing(null); return }
    if (!(await ensurePermission("deleteItems", order.location_id))) return
    if (!(await confirmYesNo(tr("حذف {0} من الطاولة؟", editing.item.product_name)))) return
    const data = await act("remove_item", { order_id: order.id, item_id: editing.item.id })
    if (data) setEditing(null)
  }

  // خدمة الطاولات: صلاحية مستقلة عن حذف الأصناف (أو موافقة برمز تفعيل)
  const removeService = async (item: OrderItem) => {
    if (!order) return
    if (!(await ensurePermission("removeTableService", order.location_id))) return
    if (!(await confirmYesNo(tr("حذف {0} من الطاولة؟", item.product_name)))) return
    await act("remove_item", { order_id: order.id, item_id: item.id }, tr("تم حذف خدمة الطاولة"))
  }

  const saveValueDialog = async (raw: string) => {
    if (!order || !valueDialog) return
    if (valueDialog === "takeaway_name" && !raw.trim()) { setMessage({ type: "error", text: tr("ملاحظة الطلب السفري مطلوبة") }); return }
    const data = valueDialog === "discount"
      ? await act("update_order", { order_id: order.id, discount_percent: Number(raw) }, tr("تم تحديث خصم الطلب"))
      : await act("update_order", { order_id: order.id, takeaway_name: raw })
    if (data) setValueDialog(null)
  }
  const changeGuests = async (delta: number) => {
    if (!order || !(await ensurePermission("openTable", order.location_id))) return
    await act("update_order", { order_id: order.id, guests: Math.max(1, order.guests + delta) })
  }

  // ---------------- الإضافات ----------------
  const addonsLine = useMemo(() => {
    if (!addonsTarget) return null
    if (addonsTarget.kind === "new") return { title: addonsTarget.product.name, groups: addonsTarget.product.addonGroups || [], selected: [] as Addon[], note: "" }
    if (addonsTarget.kind === "pending") {
      const row = pending.find((line) => line.key === addonsTarget.key)
      if (!row) return null
      return { title: row.name, groups: productById.get(row.productId)?.addonGroups || [], selected: row.addons.filter((addon) => !isExtraAddon(addon)), note: row.note }
    }
    const item = addonsTarget.item
    return { title: item.product_name, groups: productById.get(item.product_id)?.addonGroups || [], selected: (item.addons || []).filter((addon) => !isExtraAddon(addon)), note: item.note || "" }
  }, [addonsTarget, pending, productById])
  const saveAddons = async (addons: Addon[], note: string) => {
    if (!addonsTarget || !order) return
    if (addonsTarget.kind === "new") {
      const target = addonsTarget
      setAddonsTarget(null)
      addLines(target.product, target.related, target.includeParent, target.chosen, { addons, note })
      return
    }
    if (addonsTarget.kind === "pending") {
      setPending((rows) => rows.map((row) => {
        if (row.key !== addonsTarget.key) return row
        const groups = productById.get(row.productId)?.addonGroups
        const price = round4(Math.max(0, row.price - addonsPriceDelta(groups, row.addons) + addonsPriceDelta(groups, addons)))
        return { ...row, price, addons: [...addons, ...row.addons.filter(isExtraAddon)], note }
      }))
      setAddonsTarget(null)
      return
    }
    const data = await act("update_item", { order_id: order.id, item_id: addonsTarget.item.id, addons: [...addons, ...(addonsTarget.item.addons || []).filter(isExtraAddon)], note })
    if (data) setAddonsTarget(null)
  }

  // ---------------- العرض ----------------
  if (denied) {
    return (
      <div dir={appDir()} className="flex h-full min-h-[320px] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h2 className="text-lg font-bold text-amber-900">{tr("لا توجد صلاحية")}</h2>
          <p className="mt-1 text-sm text-amber-800">{floorError || tr("لا توجد لديك صلاحية الدخول لشاشة المطعم في الفرع الحالي.")}</p>
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
      <Dialog open={relatedPick !== null} onOpenChange={(value) => { if (!value) setRelatedPick(null) }}>
        <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-md">
          <DialogHeader><DialogTitle>{tr("الأصناف التابعة — ")}{relatedPick?.product.name}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {relatedPick?.options.map((row) => {
              const checked = relatedPick.selected.includes(row.id)
              const option = relatedPick.product.relatedItems?.find((item) => item.id === row.id)
              return (
                <button key={row.id} type="button" onClick={() => setRelatedPick((pick) => pick && { ...pick, selected: checked ? pick.selected.filter((id) => id !== row.id) : [...pick.selected, row.id] })}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors ${checked ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-muted"}`}>
                  <span className="flex items-center gap-2"><input type="checkbox" readOnly tabIndex={-1} checked={checked} className="h-4 w-4 accent-emerald-600" />{row.name}{row.unitName ? ` (${row.unitName})` : ""}</span>
                  <span className="text-xs text-muted-foreground">{option?.addPrice === false ? tr("بدون سعر") : row.price.toFixed(2)}</span>
                </button>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRelatedPick(null)}>{tr("إلغاء")}</Button>
            <Button className="h-11" onClick={confirmRelatedPick}>{tr("إضافة")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {toast}
      {(offline || offlineQueue.length > 0) && (
        <div className="pointer-events-none fixed left-1/2 top-1.5 z-[61] w-max max-w-[min(32rem,calc(100vw-1rem))] -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow print:hidden" role="status">
          {/* أعلى المنتصف ولا يلتقط النقر (كان يغطي زر «الطاولات») — زر حذف العمليات الفاشلة وحده قابل للنقر */}
          <div>{offline ? tr("دون اتصال — العمل محفوظ على هذا الجهاز") : tr("جاري مزامنة عمليات وقت الانقطاع")}{offlineQueue.filter((op) => op.status === "queued").length ? ` · ${tr("{0} عملية بانتظار المزامنة", offlineQueue.filter((op) => op.status === "queued").length)}` : ""}</div>
          {offlineQueue.some((op) => op.status === "failed") && (
            <div className="mt-1 space-y-0.5 text-rose-700">
              {offlineQueue.filter((op) => op.status === "failed").map((op) => <div key={op.id}>{tr(op.label)}: {op.error}</div>)}
              <button type="button" className="pointer-events-auto mt-1 rounded-md bg-rose-600 px-2 py-0.5 text-white" onClick={() => { void confirmYesNo(tr("حذف العمليات الفاشلة نهائياً؟ راجعها قبل الحذف.")).then((ok) => { if (ok) { discardFailedOps(); refreshQueue(); void loadFloor(true) } }) }}>{tr("حذف العمليات الفاشلة")}</button>
            </div>
          )}
        </div>
      )}
    </>
  )

  // ---------------- النادل: تبديل برمز PIN، الرمز الشخصي، القفل، تحويل الطاولة ----------------
  async function lockWaiter(silent = false) {
    if (waiter) await fetch("/api/restaurant/waiter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }) }).catch(() => undefined)
    setWaiterSession(null); setWaiter(null); setOrder(null); setPending([])
    if (!silent) setMessage({ type: "success", text: tr("تم قفل الجلسة") })
    void loadFloor(true)
  }
  const switchWaiter = async (pin: string) => {
    if (pending.length && !(await confirmYesNo(tr("توجد أصناف لم تُرسل بعد وستُتجاهل. هل تريد تبديل النادل؟")))) return
    setPinBusy(true); setPinError("")
    try {
      if (waiter) { await fetch("/api/restaurant/waiter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }) }).catch(() => undefined); setWaiterSession(null) }
      const response = await fetch("/api/restaurant/waiter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch", pin }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setWaiter(null); throw new Error(String(data?.error || tr("رمز PIN غير صحيح"))) }
      setWaiterSession(data); setWaiter(data); setPinDialog(null); setOrder(null); setPending([])
      lastActivity.current = Date.now()
      setMessage({ type: "success", text: tr("مرحباً {0}", data.user?.name || "") })
      await loadFloor(true)
    } catch (error) {
      setPinError(error instanceof Error ? error.message : tr("تعذر التبديل"))
    } finally {
      setPinBusy(false)
    }
  }
  const openSetPin = async () => {
    setPinError(""); setPinDialog("set")
    const data = await fetch("/api/restaurant/waiter", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null)
    setHasPin(Boolean(data?.has_pin))
  }
  const savePin = async (pin: string) => {
    setPinBusy(true); setPinError("")
    try {
      const response = await fetch("/api/restaurant/waiter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_pin", pin }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data?.error || tr("تعذر حفظ الرمز")))
      setPinDialog(null); setMessage({ type: "success", text: pin ? tr("تم حفظ رمز PIN") : tr("تم حذف رمز PIN") })
    } catch (error) {
      setPinError(error instanceof Error ? error.message : tr("تعذر حفظ الرمز"))
    } finally {
      setPinBusy(false)
    }
  }
  const toggleShared = () => {
    const next = !sharedDevice
    try { localStorage.setItem(SHARED_KEY, next ? "1" : "0") } catch { /* بلا تخزين */ }
    setSharedDevice(next)
    if (next && !waiter) setMessage({ type: "success", text: tr("وضع الجهاز المشترك: أدخل رمز PIN للعمل") })
  }
  const openAssign = async () => {
    setAssignOpen(true); setWaitersLoading(true)
    try {
      const data = await fetch("/api/restaurant/waiter?list=waiters", { cache: "no-store" }).then((response) => response.json())
      setWaiters(Array.isArray(data?.waiters) ? data.waiters : [])
    } catch { setWaiters([]) } finally { setWaitersLoading(false) }
  }
  const headerExtra = (
    <WaiterHeaderControls name={waiter?.user.name || floor?.me?.name || ""} switched={Boolean(waiter)} shared={sharedDevice}
      onSwitch={() => { setPinError(""); setPinDialog("switch") }} onSetPin={() => void openSetPin()} onLock={() => void lockWaiter()} onToggleShared={toggleShared} />
  )
  const waiterDialogs = (
    <>
      <SwitchWaiterDialog open={pinDialog === "switch"} onOpenChange={(value) => { if (!value) setPinDialog(null) }} busy={pinBusy} error={pinError} onPin={(pin) => void switchWaiter(pin)} />
      <SetPinDialog open={pinDialog === "set"} onOpenChange={(value) => { if (!value) setPinDialog(null) }} hasPin={hasPin} busy={pinBusy} error={pinError} onSave={(pin) => void savePin(pin)} />
    </>
  )

  if (sharedDevice && !waiter) {
    return (
      <>
        <WaiterLockScreen busy={pinBusy} error={pinError} onPin={(pin) => void switchWaiter(pin)} onLeaveShared={toggleShared} />
        {toast}
      </>
    )
  }

  if (!order) {
    return (
      <>
        <RestaurantFloor
          locations={locations} tables={tables} takeaways={floor?.takeaways || []} now={now} loading={loadingFloor} busy={busy} error={floorError}
          locationFilter={locationFilter} onLocationFilter={setLocationFilter} statusFilter={statusFilter} onStatusFilter={setStatusFilter}
          canTakeaway canCustody={canCustody} meId={waiter?.user.id || floor?.me?.id || ""} headerExtra={headerExtra} kitchenStuck={Number(floor?.kitchen_stuck || 0)}
          onRefresh={() => void loadFloor()} onCustody={() => void openCustody()} onNewTakeaway={startTakeaway}
          onTable={clickTable} onOrder={(orderId) => void showOrder(orderId)} />

        <Dialog open={openTable !== null} onOpenChange={(value) => { if (!value) setOpenTable(null) }}>
          <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-xs">
            <DialogHeader><DialogTitle>{tr("فتح طاولة ")}{openTable?.name}</DialogTitle></DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <Label>{tr("عدد الأشخاص")}</Label>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setGuests((g) => Math.max(1, g - 1))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" className="h-11 w-16 text-center text-lg font-bold" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} />
                <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setGuests((g) => g + 1)}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpenTable(null)}>{tr("إلغاء")}</Button>
              <Button className="h-11" disabled={busy} onClick={() => void confirmOpenTable()}>{busy && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("فتح الطاولة")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={takeawayOpen} onOpenChange={setTakeawayOpen}>
          <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
            <DialogHeader><DialogTitle>{tr("طلب سفري جديد")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {locations.length > 1 && (
                <div className="space-y-1">
                  <Label>{tr("الموقع")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((location) => <Button key={location.id} size="sm" variant={takeawayLocation === location.id ? "default" : "outline"} onClick={() => setTakeawayLocation(location.id)}>{location.name}</Button>)}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTakeawayOpen(false)}>{tr("إلغاء")}</Button>
              <Button className="h-11" disabled={busy || !takeawayLocation} onClick={() => void confirmTakeaway()}>{busy && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("فتح الطلب")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {waiterDialogs}
        {shared}
      </>
    )
  }

  // ---------------- شاشة الطلب ----------------
  const hasRemaining = remainingLines.length > 0
  const actions: OrderAction[] = [
    { key: "transfer", label: isTakeaway ? tr("إلى طاولة") : tr("نقل"), icon: ArrowRightLeft, show: true, onClick: gated("transfer", () => { setTransferFrom(order.tables[0]?.table_id ?? null); setPicker("transfer") }, order.location_id) },
    { key: "merge", label: tr("دمج"), icon: Combine, show: !isTakeaway, onClick: gated("merge", () => setPicker("merge"), order.location_id) },
    { key: "split", label: tr("فصل"), icon: Split, show: true, disabled: !hasRemaining, onClick: gated("split", () => { setSplitQty({}); setSplitOpen(true) }, order.location_id) },
    { key: "print", label: tr("طباعة الحساب"), icon: Printer, show: true, disabled: !hasRemaining, onClick: gated("printBill", () => void printBill(), order.location_id) },
    { key: "cancel", label: order.payments.length ? tr("إغلاق") : tr("إلغاء"), icon: Ban, show: order.payments.length ? !hasRemaining : true, tone: "text-red-600",
      onClick: gated(order.payments.length ? "pay" : "cancelOrder", () => { if (order.payments.length) void act("close", { order_id: order.id }, tr("تم إغلاق الطاولة")); else { setCancelReason(""); setCancelOpen(true) } }, order.location_id) },
    { key: "custody", label: tr("العهدة"), icon: Wallet, show: canCustody, onClick: () => void openCustody(order.location_id) },
    { key: "waiter", label: tr("النادل"), icon: UserCog, show: can("assignWaiter"), onClick: () => void openAssign() },
  ]

  return (
    <>
      <RestaurantOrder
        order={order} now={now} busy={busy} currency={currency} can={showAll}
        products={shown} productById={productById} categories={categories} totalProducts={products.length}
        query={query} onQuery={setQuery} category={category} onCategory={setCategory} catalogLoading={catalogLoading} catalogError={catalogError}
        pending={pending} pendingTotal={pendingTotal} remainingTotal={remainingTotal} mobileTab={mobileTab} onMobileTab={setMobileTab} actions={actions}
        onBack={() => void backToFloor()} onAddProduct={onAddProduct} onOpenItemSearch={() => setItemSearchOpen(true)}
        onPendingQty={(key, delta) => setPending((rows) => syncExtras(rows.flatMap((row) => row.key !== key ? [row] : row.quantity + delta > 0 ? [{ ...row, quantity: round4(row.quantity + delta) }] : [])))}
        onPendingRemove={(key) => setPending((rows) => syncExtras(rows.filter((row) => row.key !== key)))}
        onEditPending={(key) => setEditing({ kind: "pending", key })} onEditItem={(item) => gated("editItems", () => setEditing({ kind: "item", item }), order.location_id)()} onRemoveService={(item) => void removeService(item)}
        onPendingAddons={(key) => setAddonsTarget({ kind: "pending", key })} onItemAddons={(item) => gated("editItems", () => setAddonsTarget({ kind: "item", item }), order.location_id)()}
        onSend={() => void sendPending()} onPay={gated("pay", () => {
          // ولا دفع قبل اكتمال إضافات الأصناف غير المدفوعة
          const incomplete = order.items.find((item) => item.remaining_quantity > 0 && missingGroups(item.product_id, item.addons).length)
          if (incomplete) {
            setMobileTab("ticket")
            setMessage({ type: "error", text: tr("اختر إضافات \"{0}\" قبل الدفع: {1}", incomplete.product_name, missingGroups(incomplete.product_id, incomplete.addons).join("، ")) })
            if (can("editItems")) setAddonsTarget({ kind: "item", item: incomplete })
            return
          }
          setScopeOpen(true)
        }, order.location_id)} onDiscount={gated("discount", () => setValueDialog("discount"), order.location_id)} onGuests={(delta) => void changeGuests(delta)}
        onUnmerge={(tableId, name) => gated("split", () => void confirmYesNo(tr("فك الطاولة {0} من الطلب؟", name)).then((ok) => { if (ok) void act("unmerge", { order_id: order.id, table_id: tableId }, tr("تم فك الطاولة {0}", name)) }), order.location_id)()}
        onRenameTakeaway={gated("takeaway", () => setValueDialog("takeaway_name"), order.location_id)}
        billMode={waiterMode} onRequestBill={gated("printBill", () => void printBill(), order.location_id)} />

      <AssignWaiterDialog open={assignOpen} onOpenChange={setAssignOpen} waiters={waiters} currentId={order.waiter_id} loading={waitersLoading} busy={busy}
        onPick={(id) => void act("assign_waiter", { order_id: order.id, waiter_id: id }, tr("تم تحويل الطاولة")).then((data) => { if (data) setAssignOpen(false) })} />
      {waiterDialogs}

      <ValueDialog open={valueDialog !== null} onOpenChange={(value) => { if (!value) setValueDialog(null) }} busy={busy} onConfirm={(value) => void saveValueDialog(value)}
        {...(valueDialog === "discount"
          ? { title: tr("خصم الطلب"), label: tr("نسبة الخصم على الطلب"), value: String(order.discount_percent || 0), kind: "number" as const, min: 0, max: 100, suffix: "%", presets: [0, 5, 10, 15, 20, 25, 30, 50] }
          : { title: tr("ملاحظة الطلب السفري"), label: tr("اسم/رقم الزبون أو ملاحظة"), value: order.takeaway_name || "", placeholder: tr("مطلوبة قبل الإرسال للمطبخ") })} />

      <ItemEditDialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null) }} line={editLine} busy={busy}
        canDiscount canDelete canReduce
        onSave={(value) => void saveEdit(value)} onDelete={() => void deleteEdit()} />

      <ExtrasWizard open={extrasWizard !== null} title={extrasWizard?.product.name || ""} price={extrasWizard?.product.price || 0} currency={currency} extras={extrasWizard?.product.extras || []}
        onCancel={() => setExtrasWizard(null)}
        onDone={(chosen) => { const target = extrasWizard; setExtrasWizard(null); if (target) addLines(target.product, target.related, target.includeParent, chosen) }} />

      <AddonsDialog open={addonsLine !== null} onOpenChange={(value) => { if (!value) setAddonsTarget(null) }} title={addonsLine?.title || ""}
        groups={addonsLine?.groups || []} selected={addonsLine?.selected || []} note={addonsLine?.note || ""} busy={busy} onSave={(addons, note) => void saveAddons(addons, note)} />

      <TablePickerDialog open={picker === "transfer"} onOpenChange={(value) => { if (!value) setPicker(null) }} title={isTakeaway ? tr("تحويل الطلب السفري إلى طاولة") : tr("نقل الطاولة")} description={tr("اختر طاولة فارغة لنقل الطلب إليها")}
        tables={tables} locations={locations} allow={(table) => !table.order_id} busy={busy} confirmLabel={tr("نقل")}
        onConfirm={(ids) => void act("transfer", { order_id: order.id, from_table_id: transferFrom, to_table_id: ids[0] }, tr("تم نقل الطاولة")).then((data) => { if (data) setPicker(null) })}>
        {order.tables.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{tr("الطاولة المنقولة:")}</span>
            {order.tables.map((table) => <Button key={table.table_id} size="sm" variant={transferFrom === table.table_id ? "default" : "outline"} onClick={() => setTransferFrom(table.table_id)}>{table.name}</Button>)}
          </div>
        )}
      </TablePickerDialog>

      <TablePickerDialog open={picker === "merge"} onOpenChange={(value) => { if (!value) setPicker(null) }} title={tr("دمج طاولات")} multiple
        description={tr("الطاولات الفارغة تُضاف للطلب، والمشغولة ينتقل طلبها بالكامل (أصنافه ودفعاته) إلى هذا الطلب")}
        tables={tables} locations={locations} allow={(table) => !orderTableIds.has(table.id)} busy={busy} confirmLabel={tr("دمج")}
        onConfirm={(ids) => void act("merge", { order_id: order.id, table_ids: ids }, tr("تم دمج الطاولات")).then((data) => { if (data) setPicker(null) })} />

      <TablePickerDialog open={splitOpen} onOpenChange={setSplitOpen} title={tr("فصل أصناف لطاولة أخرى")}
        description={tr("حدد الكميات ثم اختر الطاولة: الفارغة يُفتح عليها طلب جديد، والمشغولة تُضاف الأصناف لطلبها")}
        tables={tables} locations={locations} allow={(table) => !orderTableIds.has(table.id)} busy={busy} confirmLabel={tr("فصل")}
        onConfirm={(ids) => {
          const lines = Object.entries(splitQty).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ item_id: Number(itemId), quantity }))
          if (!lines.length) { setMessage({ type: "error", text: tr("حدد كمية صنف واحد على الأقل") }); return }
          void act("split", { order_id: order.id, to_table_id: ids[0], lines }, tr("تم فصل الأصناف")).then((data) => { if (data) setSplitOpen(false) })
        }}>
        <LineQuantities items={order.items} values={splitQty} onChange={setSplitQty} />
      </TablePickerDialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader><DialogTitle>{tr("إلغاء الطلب")}</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>{tr("سبب الإلغاء *")}</Label><Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>{tr("رجوع")}</Button>
            <Button variant="destructive" disabled={busy || !cancelReason.trim()} onClick={() => void act("cancel", { order_id: order.id, reason: cancelReason }, tr("تم إلغاء الطلب")).then((data) => { if (data) setCancelOpen(false) })}>{tr("إلغاء الطلب")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductSearchPopup visible={itemSearchOpen} priceCategoryId={Number(catalog?.point?.price_category_id) || 0} productTypes={[1]} ShowSelect
        onClose={() => setItemSearchOpen(false)} onSelect={(selected: any[]) => void addSearchedItems(selected)} />

      <PayScopeDialog open={scopeOpen} onOpenChange={setScopeOpen} items={order.items} guests={order.guests} amountFor={amountFor} currencyCode={currency} busy={busy} onContinue={(lines, partial) => void startPayment(lines, partial)} />

      {catalog && (
        <PosPaymentDetailsDialog open={payLines !== null} onOpenChange={(value) => { if (!value) setPayLines(null) }} mode="sale" total={payTotal}
          currencyCode={currency} pointCurrencyId={pointCurrencyId} currencies={catalog.currencies} customers={catalog.customers}
          customerId={payCustomerId} onCustomerChange={setPayCustomerId}
          onCustomerAccount={(account) => {
            // عميل من دليل الحسابات غير موجود في قائمة الموقع المحفوظة: يُضاف للقائمة ثم يُختار
            setCatalog((current) => current && !current.customers.some((row) => row.id === account.id) ? { ...current, customers: [...current.customers, { id: account.id, name: account.name, code: account.code || "", accountId: account.id }] } : current)
            setPayCustomerId(account.id)
          }} banks={catalog.banks} branches={catalog.bankBranches} cardTypes={catalog.cardTypes}
          payments={payments} cashAmounts={cashAmounts} onCashChange={updateCash}
          onPaymentAmount={(method, value, currencyId) => { updatePayment(method, value, currencyId); setPayError("") }}
          onPaymentField={(method, field, value) => updatePaymentField(method, field, value)}
          pinpadBatch={custodyInfo?.session?.id ?? ""} onConfirm={() => void confirmPayment()} busy={busy} error={payError} />
      )}
      {shared}
    </>
  )
}
