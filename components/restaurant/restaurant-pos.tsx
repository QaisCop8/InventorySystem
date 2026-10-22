"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight, ArrowRightLeft, Pencil, ShoppingBag, Ban, ChefHat, Circle, Clock, Combine, CreditCard, Link2Off, Loader2, Lock, Minus, Plus, Printer,
  RectangleHorizontal, RefreshCw, Search, Send, Split, Square, Users, UtensilsCrossed, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import {
  PosPaymentDetailsDialog, type CurrencyOption, type LookupOption, type PaymentDetail, type PaymentMethod,
} from "@/components/pos/pos-payment-details-dialog"
import {
  ItemEditDialog, LineQuantities, money, PayScopeDialog, qtyText, round2, round4, TablePickerDialog,
  type EditableLine, type FloorLocation, type FloorTable, type OrderItem,
} from "./restaurant-dialogs"

type Perms = Record<RestaurantPermission, boolean>
type Takeaway = { order_id: number; order_no: string; takeaway_name: string | null; location_id: number; opened_at: string; opened_by_name: string | null; remaining: number; items_count: number; paid_amount: number }
type Floor = { branch_id: number; permissions: Perms; locations: FloorLocation[]; tables: FloorTable[]; takeaways: Takeaway[]; server_time: string }
type Order = {
  id: number; order_no: string; branch_id: number; location_id: number; location_name: string; pos_point_id: number | null; status: string
  order_type: "dine_in" | "takeaway"; takeaway_name: string | null
  guests: number; customer_id: number | null; customer_name: string; discount_percent: number; note: string | null; revision: number; opened_at: string
  tables: { table_id: number; is_primary: boolean; name: string; seats: number; location_id: number; location_name: string }[]
  items: OrderItem[]; payments: { id: number; vch_code: string; amount: number; created_at: string }[]
  totals: { gross: number; remaining: number; paid: number }
}
type Product = {
  id: number; code: string; name: string; price: number; unitId: number | null; unitName: string; category: string
  groupPrinter: string; image?: string; unitPrices: { unitId: number | null; unitName: string; price: number }[]
}
type Catalog = {
  point: any; taxRate: number; products: Product[]; customers: LookupOption[]; currencies: CurrencyOption[]; banks: LookupOption[]; bankBranches: LookupOption[]
  cardTypes: LookupOption[]; campaigns: PosCampaign[]; campaignUsage: PosCampaignUsage; session: any; canPay: boolean; receiptSettings: Record<string, string>
}
type Pending = { key: string; productId: number; name: string; unitId: number | null; unitName: string; price: number; quantity: number; discount: number; note: string; groupPrinter: string; category: string }
type Line = { item: OrderItem; quantity: number }

const SHAPE_ICON: Record<string, typeof Square> = { square: Square, round: Circle, rect: RectangleHorizontal }
const errorOf = async (response: Response, fallback: string) => String((await response.json().catch(() => ({})))?.error || fallback)
const elapsed = (from: string | null, now: number) => {
  if (!from) return ""
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}س ${minutes % 60}د` : `${minutes}د`
}
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
      image: row.product_image ? (/^(https?:|data:|\/)/i.test(String(row.product_image)) ? String(row.product_image) : `data:image/bmp;base64,${row.product_image}`) : undefined,
      unitPrices: (Array.isArray(row.unit_prices) ? row.unit_prices : []).map((option: any) => ({ unitId: Number(option.unit_id) || null, unitName: String(option.unit_name || ""), price: Number(option.price || 0) })),
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
  const [editing, setEditing] = useState<{ kind: "item"; item: OrderItem } | { kind: "pending"; key: string } | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [payLines, setPayLines] = useState<{ lines: Line[]; partial: boolean } | null>(null)
  const [payments, setPayments] = useState<PaymentDetail[]>([])
  const [cashAmounts, setCashAmounts] = useState<Record<number, number>>({})
  const [payCustomerId, setPayCustomerId] = useState<number | null>(null)
  const [payError, setPayError] = useState("")

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

  const loadCatalog = useCallback(async (locationId: number, force = false) => {
    const cached = catalogCache.current.get(locationId)
    if (cached && !force) { setCatalog(cached); setCatalogError(""); return cached }
    setCatalogLoading(true); setCatalogError("")
    try {
      const response = await fetch(`/api/restaurant/catalog?location_id=${locationId}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await errorOf(response, "تعذر تحميل الأصناف"))
      const next = normalizeCatalog(await response.json())
      catalogCache.current.set(locationId, next)
      setCatalog(next)
      return next
    } catch (error) {
      setCatalog(null); setCatalogError(error instanceof Error ? error.message : "تعذر تحميل الأصناف")
      return null
    } finally {
      setCatalogLoading(false)
    }
  }, [])

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

  const startTakeaway = () => {
    if (!can("takeaway")) return
    const first = locationFilter !== "all" ? locationFilter : floor?.locations.find((l) => l.pos_point_id)?.id ?? floor?.locations[0]?.id ?? null
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
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))), [products])
  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ar")
    return products.filter((product) => (category === "all" || product.category === category) && (!term || product.name.toLocaleLowerCase("ar").includes(term) || product.code.toLowerCase().includes(term)))
  }, [products, category, query])

  const addProduct = (product: Product) => {
    if (!can("addItems")) { setMessage({ type: "error", text: "لا توجد لديك صلاحية إضافة أصناف للطاولة" }); return }
    setPending((rows) => {
      const index = rows.findIndex((row) => row.productId === product.id && row.unitId === product.unitId && !row.note && !row.discount)
      if (index >= 0) return rows.map((row, i) => i === index ? { ...row, quantity: round4(row.quantity + 1) } : row)
      return [...rows, { key: `${product.id}-${Date.now()}-${Math.random()}`, productId: product.id, name: product.name, unitId: product.unitId, unitName: product.unitName, price: product.price, quantity: 1, discount: 0, note: "", groupPrinter: product.groupPrinter, category: product.category }]
    })
  }

  const isTakeaway = order?.order_type === "takeaway"
  const tableNames = isTakeaway ? `سفري${order?.takeaway_name ? ` ${order.takeaway_name}` : ""}` : order?.tables.map((table) => table.name).join(" + ") || ""

  // قسائم المطبخ: لكل مجموعة أصناف لها طابعة ورقة بالأصناف والكميات والملاحظات (بلا أسعار) — كما في كاشير نقطة البيع
  const printKitchen = async (lines: Pending[]) => {
    const groups = new Map<string, { name: string; printer: string; lines: Pending[] }>()
    for (const line of lines) {
      if (!line.groupPrinter) continue
      const key = `${line.category}|${line.groupPrinter}`
      const group = groups.get(key) || { name: line.category, printer: line.groupPrinter, lines: [] }
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
          rows: group.lines.map((line) => ({ name: `${line.name}${line.unitName ? ` (${line.unitName})` : ""}${line.note ? ` — ${line.note}` : ""}`, quantity: qtyText(line.quantity) })),
        }
        try { await printVoucherWithSettings(document, { ...slip, printer_name: group.printer }, company) }
        catch (error) { failures.push(`${group.name}: ${error instanceof Error ? error.message : "تعذرت الطباعة"}`) }
      }
      if (failures.length) setMessage({ type: "error", text: `أُرسلت الأصناف لكن تعذرت طباعة المطبخ: ${failures.join(" — ")}` })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذرت طباعة المطبخ" })
    }
  }

  const sendPending = async () => {
    if (!order || !pending.length) return
    const lines = pending
    const data = await act("add_items", {
      order_id: order.id,
      items: lines.map((line) => ({ product_id: line.productId, product_name: line.name, unit_id: line.unitId, unit_name: line.unitName, price: line.price, quantity: line.quantity, discount: line.discount, note: line.note })),
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

  const startPayment = (lines: Line[], partial: boolean) => {
    if (!catalog?.canPay) { setMessage({ type: "error", text: `الدفع يتطلب أن تكون من مستخدمي نقطة البيع ${catalog?.point?.name || ""} وأن تفتح العهدة عليها من شاشة كاشير نقطة البيع` }); return }
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
        rows: lines.map((item) => ({ name: item.product_name, quantity: qtyText(item.remaining_quantity), price: money(item.price), total: money(item.price * item.remaining_quantity * (1 - item.discount / 100)) })),
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

  const setOrderDiscount = async () => {
    if (!order) return
    const raw = window.prompt("نسبة خصم الطلب %", String(order.discount_percent || 0))
    if (raw === null) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || value > 100) { setMessage({ type: "error", text: "نسبة الخصم غير صالحة" }); return }
    await act("update_order", { order_id: order.id, discount_percent: value }, "تم تحديث خصم الطلب")
  }
  const changeGuests = async (delta: number) => {
    if (!order || !can("openTable")) return
    await act("update_order", { order_id: order.id, guests: Math.max(1, order.guests + delta) })
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

  if (!order) {
    const visible = tables.filter((table) => (locationFilter === "all" || table.location_id === locationFilter) && (statusFilter === "all" || (statusFilter === "busy" ? table.order_id : !table.order_id)))
    const busyCount = tables.filter((table) => table.order_id).length
    const takeaways = floor?.takeaways || []
    return (
      <div dir="rtl" className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-rose-700 to-orange-600 p-4 text-white shadow">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-8 w-8" />
            <div>
              <h1 className="text-xl font-bold">شاشة المطعم</h1>
              <p className="text-sm text-rose-50">{tables.length - busyCount} فارغة · {busyCount} مشغولة</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void loadFloor()} disabled={loadingFloor}><RefreshCw className={`ml-1 h-4 w-4 ${loadingFloor ? "animate-spin" : ""}`} />تحديث</Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button size="sm" variant={locationFilter === "all" ? "default" : "outline"} onClick={() => setLocationFilter("all")}>كل المواقع</Button>
            {locations.map((location) => (
              <Button key={location.id} size="sm" variant={locationFilter === location.id ? "default" : "outline"} className="shrink-0" onClick={() => setLocationFilter(location.id)}
                style={locationFilter === location.id && location.color ? { backgroundColor: location.color } : undefined}>
                {location.name} <span className="mr-1 text-xs opacity-75">({tables.filter((t) => t.location_id === location.id).length})</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm md:w-72">
            {([["all", "الكل"], ["free", "فارغة"], ["busy", "مشغولة"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} className={`rounded-md px-2 py-1.5 font-semibold ${statusFilter === key ? "bg-background shadow" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>

        {floorError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{floorError}</div>}

        {(can("takeaway") || takeaways.length > 0) && locations.length > 0 && (
          <div className="rounded-2xl border bg-card p-2 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold"><ShoppingBag className="h-5 w-5 text-violet-600" />سفري <span className="text-sm font-normal text-muted-foreground">({takeaways.length} مفتوح)</span></div>
              {can("takeaway") && <Button size="sm" className="bg-violet-600 hover:bg-violet-700" disabled={busy} onClick={startTakeaway}><Plus className="ml-1 h-4 w-4" />طلب سفري جديد</Button>}
            </div>
            {takeaways.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {takeaways.map((row) => (
                  <button key={row.order_id} type="button" disabled={busy} onClick={() => void showOrder(row.order_id)}
                    className="min-w-[150px] shrink-0 rounded-xl border-2 border-violet-300 bg-violet-50 p-2 text-right transition hover:bg-violet-100 dark:bg-violet-950/30">
                    <div className="truncate font-bold">{row.takeaway_name || row.order_no}</div>
                    <div className="text-xs text-muted-foreground">{row.order_no} · <Clock className="inline h-3 w-3" /> {elapsed(row.opened_at, now)}</div>
                    <div className="text-sm font-bold text-violet-800 dark:text-violet-300">{money(row.remaining)} <span className="text-xs font-normal text-muted-foreground">· {row.items_count} صنف</span></div>
                    {row.paid_amount > 0 && <Badge variant="secondary" className="text-[10px]">مدفوع جزئياً {money(row.paid_amount)}</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingFloor && !floor ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-rose-600" /></div>
        ) : !locations.length ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد مواقع نشطة لهذا الفرع. عرّف المواقع والطاولات من قائمة المطاعم.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
              {visible.map((table) => {
                const Icon = SHAPE_ICON[table.shape] || Square
                const occupied = Boolean(table.order_id)
                return (
                  <button key={table.id} type="button" disabled={busy} onClick={() => clickTable(table)}
                    className={`relative flex min-h-[120px] flex-col rounded-2xl border-2 p-3 text-right shadow-sm transition active:scale-[0.98] ${occupied ? "border-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40" : "border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/30"}`}>
                    <div className="flex items-center justify-between">
                      <Icon className={`h-5 w-5 ${occupied ? "text-amber-600" : "text-emerald-600"}`} />
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />{occupied ? `${table.guests}/${table.seats}` : table.seats}</span>
                    </div>
                    <div className="mt-1 text-xl font-extrabold">{table.name}</div>
                    {locationFilter === "all" && <div className="text-[11px] text-muted-foreground">{locations.find((l) => l.id === table.location_id)?.name}</div>}
                    {occupied ? (
                      <div className="mt-auto space-y-0.5 text-xs">
                        <div className="text-base font-bold text-amber-800 dark:text-amber-300">{money(table.remaining)}</div>
                        <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{elapsed(table.opened_at, now)} · {table.items_count} صنف</div>
                        {table.merged_with && <div className="truncate text-blue-700"><Combine className="ml-1 inline h-3 w-3" />مع {table.merged_with}</div>}
                        {table.paid_amount > 0 && <Badge variant="secondary" className="text-[10px]">مدفوع جزئياً {money(table.paid_amount)}</Badge>}
                      </div>
                    ) : (
                      <div className="mt-auto text-sm font-semibold text-emerald-700">فارغة</div>
                    )}
                  </button>
                )
              })}
            </div>
            {!visible.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد طاولات</div>}
          </div>
        )}

        <Dialog open={openTable !== null} onOpenChange={(value) => { if (!value) setOpenTable(null) }}>
          <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-xs">
            <DialogHeader><DialogTitle>فتح طاولة {openTable?.name}</DialogTitle></DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <Label>عدد الأشخاص</Label>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" onClick={() => setGuests((g) => Math.max(1, g - 1))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" className="w-16 text-center" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} />
                <Button size="icon" variant="outline" onClick={() => setGuests((g) => g + 1)}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpenTable(null)}>إلغاء</Button>
              <Button disabled={busy} onClick={() => void confirmOpenTable()}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}فتح الطاولة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={takeawayOpen} onOpenChange={setTakeawayOpen}>
          <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
            <DialogHeader><DialogTitle>طلب سفري جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {locations.length > 1 && (
                <div className="space-y-1">
                  <Label>الموقع (نقطة البيع)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((location) => <Button key={location.id} size="sm" variant={takeawayLocation === location.id ? "default" : "outline"} onClick={() => setTakeawayLocation(location.id)}>{location.name}</Button>)}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>اسم/رقم الزبون (اختياري)</Label>
                <Input value={takeawayName} autoFocus onChange={(e) => setTakeawayName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmTakeaway() }} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTakeawayOpen(false)}>إلغاء</Button>
              <Button disabled={busy || !takeawayLocation} onClick={() => void confirmTakeaway()}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}فتح الطلب</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {printPreview && <PosPrintPreview title={printPreview.title} html={printPreview.html} onClose={() => setPrintPreview(null)} />}
        {toast}
      </div>
    )
  }

  // ---------------- شاشة الطلب ----------------
  const hasRemaining = remainingLines.length > 0
  const actionButtons: { key: string; label: string; icon: typeof Square; show: boolean; onClick: () => void; tone?: string; disabled?: boolean }[] = [
    { key: "transfer", label: isTakeaway ? "لطاولة" : "نقل", icon: ArrowRightLeft, show: can("transfer"), onClick: () => { setTransferFrom(order.tables[0]?.table_id ?? null); setPicker("transfer") } },
    { key: "merge", label: "دمج", icon: Combine, show: can("merge") && !isTakeaway, onClick: () => setPicker("merge") },
    { key: "split", label: "فصل", icon: Split, show: can("split"), disabled: !hasRemaining, onClick: () => { setSplitQty({}); setSplitOpen(true) } },
    { key: "print", label: "طباعة", icon: Printer, show: can("printBill"), disabled: !hasRemaining, onClick: () => void printBill() },
    { key: "cancel", label: order.payments.length ? "إغلاق" : "إلغاء", icon: Ban, show: order.payments.length ? can("pay") && !hasRemaining : can("cancelOrder"), tone: "text-red-600",
      onClick: () => { if (order.payments.length) void act("close", { order_id: order.id }, "تم إغلاق الطاولة"); else { setCancelReason(""); setCancelOpen(true) } } },
  ]

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-l from-rose-700 to-orange-600 px-3 py-2 text-white">
        <Button size="sm" variant="secondary" onClick={() => void backToFloor()}><ArrowRight className="ml-1 h-4 w-4" />الطاولات</Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isTakeaway && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/80 px-3 py-1 text-sm font-bold">
              <ShoppingBag className="h-4 w-4" />سفري{order.takeaway_name ? ` — ${order.takeaway_name}` : ""}
              {can("takeaway") && (
                <button title="تعديل الاسم" className="rounded-full p-0.5 hover:bg-white/30" disabled={busy}
                  onClick={() => { const name = window.prompt("اسم/رقم الزبون", order.takeaway_name || ""); if (name !== null) void act("update_order", { order_id: order.id, takeaway_name: name }) }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )}
          {order.tables.map((table) => (
            <span key={table.table_id} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
              {table.name}
              {order.tables.length > 1 && can("split") && (
                <button title="فك الدمج" className="rounded-full p-0.5 hover:bg-white/30" disabled={busy}
                  onClick={() => void confirmYesNo(`فك الطاولة ${table.name} من الطلب؟`).then((ok) => { if (ok) void act("unmerge", { order_id: order.id, table_id: table.table_id }, `تم فك الطاولة ${table.name}`) })}>
                  <Link2Off className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          <span className="text-xs text-rose-50">{order.location_name} · {order.order_no} · <Clock className="inline h-3 w-3" /> {elapsed(order.opened_at, now)}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/15 px-1">
          <button className="rounded-full p-1 hover:bg-white/20 disabled:opacity-40" disabled={!can("openTable") || busy || order.guests <= 1} onClick={() => void changeGuests(-1)}><Minus className="h-4 w-4" /></button>
          <span className="flex items-center gap-1 text-sm font-bold"><Users className="h-4 w-4" />{order.guests}</span>
          <button className="rounded-full p-1 hover:bg-white/20 disabled:opacity-40" disabled={!can("openTable") || busy} onClick={() => void changeGuests(1)}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* القائمة */}
        <section className={`${mobileTab === "menu" ? "flex" : "hidden"} min-h-0 flex-col gap-2 p-2 sm:p-3 lg:flex lg:order-2 lg:border-r`}>
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث عن صنف" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <Button size="sm" variant={category === "all" ? "default" : "outline"} className="shrink-0" onClick={() => setCategory("all")}>الكل</Button>
            {categories.map((name) => <Button key={name} size="sm" variant={category === name ? "default" : "outline"} className="shrink-0" onClick={() => setCategory(name)}>{name}</Button>)}
          </div>
          {catalogError && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{catalogError}</div>}
          {catalogLoading ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-rose-600" /></div>
          ) : (
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {shown.slice(0, 300).map((product) => (
                <button key={product.id} type="button" onClick={() => addProduct(product)} disabled={!can("addItems")}
                  className="flex min-h-[86px] flex-col overflow-hidden rounded-xl border bg-card text-right shadow-sm transition hover:border-rose-400 active:scale-[0.98] disabled:opacity-50">
                  {product.image && <img src={product.image} alt="" className="h-16 w-full object-cover" loading="lazy" />}
                  <div className="flex flex-1 flex-col p-2">
                    <span className="line-clamp-2 text-sm font-semibold leading-tight">{product.name}</span>
                    <span className="mt-auto text-sm font-bold text-rose-700">{money(product.price)}</span>
                  </div>
                </button>
              ))}
              {!shown.length && !catalogError && <div className="col-span-full p-8 text-center text-muted-foreground">لا توجد أصناف</div>}
            </div>
          )}
        </section>

        {/* الفاتورة */}
        <section className={`${mobileTab === "ticket" ? "flex" : "hidden"} min-h-0 flex-col bg-muted/30 lg:flex lg:order-1`}>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:p-3">
            {order.items.map((item) => {
              const paid = item.remaining_quantity <= 0
              return (
                <button key={item.id} type="button" disabled={busy || paid || (!can("editItems") && !can("deleteItems"))} onClick={() => setEditing({ kind: "item", item })}
                  className={`flex w-full items-start gap-2 rounded-lg border bg-card p-2 text-right ${paid ? "opacity-60" : "hover:border-rose-300"}`}>
                  <span className="min-w-[2.5rem] rounded-md bg-slate-100 px-1.5 py-0.5 text-center text-sm font-bold dark:bg-slate-800">{qtyText(item.quantity)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.product_name}{item.unit_name ? <span className="text-xs text-muted-foreground"> ({item.unit_name})</span> : null}</span>
                    {item.note && <span className="block truncate text-xs text-orange-700">{item.note}</span>}
                    <span className="flex flex-wrap gap-1 text-[11px]">
                      {item.discount > 0 && <Badge variant="outline" className="text-[10px]">خصم {item.discount}%</Badge>}
                      {item.paid_quantity > 0 && <Badge variant="secondary" className="text-[10px]">{paid ? "مدفوع" : `مدفوع ${qtyText(item.paid_quantity)}`}</Badge>}
                    </span>
                  </span>
                  <span className="text-sm font-bold">{money(item.price * item.quantity * (1 - item.discount / 100))}</span>
                </button>
              )
            })}
            {pending.length > 0 && (
              <div className="space-y-1.5 rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/60 p-2 dark:bg-rose-950/20">
                <div className="flex items-center justify-between text-xs font-bold text-rose-700"><span><ChefHat className="ml-1 inline h-4 w-4" />أصناف جديدة لم تُرسل</span><span>{money(pendingTotal)}</span></div>
                {pending.map((line) => (
                  <div key={line.key} className="flex items-center gap-2 rounded-lg bg-card p-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPending((rows) => rows.flatMap((row) => row.key !== line.key ? [row] : row.quantity > 1 ? [{ ...row, quantity: round4(row.quantity - 1) }] : []))}><Minus className="h-3.5 w-3.5" /></Button>
                      <span className="w-8 text-center text-sm font-bold">{qtyText(line.quantity)}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPending((rows) => rows.map((row) => row.key === line.key ? { ...row, quantity: round4(row.quantity + 1) } : row))}><Plus className="h-3.5 w-3.5" /></Button>
                    </div>
                    <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setEditing({ kind: "pending", key: line.key })}>
                      <span className="block truncate text-sm font-semibold">{line.name}</span>
                      {line.note && <span className="block truncate text-xs text-orange-700">{line.note}</span>}
                    </button>
                    <span className="text-sm font-bold">{money(line.price * line.quantity * (1 - line.discount / 100))}</span>
                    <button type="button" className="text-red-500" onClick={() => setPending((rows) => rows.filter((row) => row.key !== line.key))}><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
            {!order.items.length && !pending.length && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">الطاولة فارغة — اختر الأصناف من القائمة</div>}
          </div>

          <div className="space-y-2 border-t bg-background p-2 sm:p-3">
            <div className="space-y-1 text-sm">
              {order.totals.paid > 0 && <div className="flex justify-between text-muted-foreground"><span>مدفوع ({order.payments.map((p) => p.vch_code).join("، ")})</span><span>{money(order.totals.paid)}</span></div>}
              <div className="flex justify-between">
                <button className="text-muted-foreground underline-offset-2 hover:underline disabled:no-underline" disabled={!can("discount") || busy} onClick={() => void setOrderDiscount()}>
                  خصم الطلب {order.discount_percent > 0 ? `${order.discount_percent}%` : can("discount") ? "(إضافة)" : "—"}
                </button>
              </div>
              <div className="flex items-center justify-between text-lg font-extrabold"><span>المتبقي</span><span>{money(remainingTotal)} {currency}</span></div>
            </div>
            {pending.length > 0 ? (
              <Button className="h-12 w-full bg-rose-600 text-base hover:bg-rose-700" disabled={busy} onClick={() => void sendPending()}>
                {busy ? <Loader2 className="ml-1 h-5 w-5 animate-spin" /> : <Send className="ml-1 h-5 w-5" />}إرسال للطاولة ({pending.length})
              </Button>
            ) : (
              <Button className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={busy || !hasRemaining || !can("pay")} onClick={() => setScopeOpen(true)}>
                <CreditCard className="ml-1 h-5 w-5" />دفع الحساب
              </Button>
            )}
            <div className="grid grid-cols-5 gap-1.5">
              {actionButtons.filter((button) => button.show).map((button) => (
                <Button key={button.key} variant="outline" size="sm" className={`flex h-auto flex-col gap-0.5 px-1 py-1.5 text-xs ${button.tone || ""}`} disabled={busy || button.disabled || pending.length > 0} onClick={button.onClick}>
                  <button.icon className="h-4 w-4" />{button.label}
                </Button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* شريط الجوال: تبديل القائمة/الفاتورة */}
      <div className="grid grid-cols-2 border-t bg-background lg:hidden">
        <button className={`py-3 text-sm font-bold ${mobileTab === "menu" ? "text-rose-700" : "text-muted-foreground"}`} onClick={() => setMobileTab("menu")}>القائمة</button>
        <button className={`py-3 text-sm font-bold ${mobileTab === "ticket" ? "text-rose-700" : "text-muted-foreground"}`} onClick={() => setMobileTab("ticket")}>
          الطلب ({order.items.length + pending.length}) · {money(remainingTotal + pendingTotal)}
        </button>
      </div>

      <ItemEditDialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null) }} line={editLine} busy={busy}
        canDiscount={can("discount")} canDelete={editing?.kind === "pending" || can("deleteItems")} canReduce={editing?.kind === "pending" || can("deleteItems")}
        onSave={(value) => void saveEdit(value)} onDelete={() => void deleteEdit()} />

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
          <DialogHeader><DialogTitle>إلغاء طلب الطاولة</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>سبب الإلغاء *</Label><Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>رجوع</Button>
            <Button variant="destructive" disabled={busy || !cancelReason.trim()} onClick={() => void act("cancel", { order_id: order.id, reason: cancelReason }, "تم إلغاء الطلب").then((data) => { if (data) setCancelOpen(false) })}>إلغاء الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayScopeDialog open={scopeOpen} onOpenChange={setScopeOpen} items={order.items} guests={order.guests} amountFor={amountFor} currencyCode={currency} busy={busy} onContinue={startPayment} />

      {catalog && (
        <PosPaymentDetailsDialog open={payLines !== null} onOpenChange={(value) => { if (!value) setPayLines(null) }} mode="sale" total={payTotal}
          currencyCode={currency} pointCurrencyId={pointCurrencyId} currencies={catalog.currencies} customers={catalog.customers}
          customerId={payCustomerId} onCustomerChange={setPayCustomerId} banks={catalog.banks} branches={catalog.bankBranches} cardTypes={catalog.cardTypes}
          payments={payments} cashAmounts={cashAmounts} onCashChange={updateCash}
          onPaymentAmount={(method, value, currencyId) => { updatePayment(method, value, currencyId); setPayError("") }}
          onPaymentField={(method, field, value) => updatePaymentField(method, field, value)}
          pinpadBatch={catalog.session?.id ?? ""} onConfirm={() => void confirmPayment()} busy={busy} error={payError} />
      )}
      {printPreview && <PosPrintPreview title={printPreview.title} html={printPreview.html} onClose={() => setPrintPreview(null)} />}
      {toast}
    </div>
  )
}
