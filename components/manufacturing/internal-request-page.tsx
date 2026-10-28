"use client"
import { useVoucherDeepLink } from "@/hooks/use-voucher-deep-link"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Messages from "@/components/common/Messages"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, ClipboardCheck, Loader2, Minus, Package, Plus, Save, ScanBarcode, Search, Store, Trash2, Warehouse } from "lucide-react"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import { useAuth } from "@/components/auth/auth-context"
import MultiSelect from "@/components/common/MultiSelect"
import { expandProductWithRelatedItems } from "@/lib/product-related-items-client"
import { attachEnterAsTab } from "@/components/common/enterAsTab"
import { INTERNAL_STATUS_LABELS, INTERNAL_STEPS, InternalLockedState, InternalPageHeader, RefreshButton, useInternalWorkflow } from "./internal-workflow-shared"

const SELECT_CLASS = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-70 dark:focus:ring-emerald-900"

function ItemThumb({ src, alt }: { src?: string | null; alt?: string }) {
  return src
    ? <img src={src} alt={alt || ""} className="h-12 w-12 shrink-0 rounded-lg border object-cover" />
    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border bg-muted/40 text-muted-foreground"><Package className="h-5 w-5" /></span>
}

type InternalRequest = {
  id: number
  vch_code: string
  vch_date: string
  branch_id: number
  manufacturing_branch_id: number
  destination_warehouse_id: number | null
  internal_status: number
  items?: any[]
}

export default function InternalRequestPage() {
  const { activeBranchId } = useAuth()
  const workflow = useInternalWorkflow()
  const can = (key: "create" | "edit" | "delete") => workflow.permissions?.[key] === true
  const [requests, setRequests] = useState<InternalRequest[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedRequest, setSelectedRequest] = useState<InternalRequest | null>(null)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [sourceWarehouse, setSourceWarehouse] = useState("")
  const [destinationBranch, setDestinationBranch] = useState("")
  const [destinationWarehouse, setDestinationWarehouse] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [productOpen, setProductOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requestAuditRequired, setRequestAuditRequired] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editingRequest, setEditingRequest] = useState<InternalRequest | null>(null)
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [requesterBranches, setRequesterBranches] = useState<number[]>([])
  const [manufacturingBranches, setManufacturingBranches] = useState<number[]>([])
  const [sourceWarehouses, setSourceWarehouses] = useState<number[]>([])
  const [destinationWarehouses, setDestinationWarehouses] = useState<number[]>([])
  const messagesRef = useRef<any>(null)
  const loadRequestsSequenceRef = useRef(0)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [barcodeSearching, setBarcodeSearching] = useState(false)
  const unitsCacheRef = useRef(new Map<number, Promise<any[]>>())
  // Enter كـTab داخل نموذج الطلب (التاريخ ⇐ المستودعات ⇐ الباركود ⇐ وحدة/كمية كل صنف)؛ الباركود يُبقي Enter للإضافة.
  // يتوقف أثناء فتح نافذة بحث الأصناف حتى تبقى مفاتيحها لها.
  const [formBodyElement, setFormBodyElement] = useState<HTMLDivElement | null>(null)
  const enterAsTabEnabledRef = useRef(true)

  enterAsTabEnabledRef.current = !productOpen
  useEffect(() => {
    if (!formBodyElement) return
    return attachEnterAsTab(formBodyElement, enterAsTabEnabledRef)
  }, [formBodyElement])

  const showMessage = (detail: string, severity: "success" | "error") => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000 }])
  }

  const loadRequests = async () => {
    const branchId = Number(activeBranchId || 0)
    const sequence = ++loadRequestsSequenceRef.current
    if (!branchId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests?_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(branchId) } })
      const data = await response.json()
      if (sequence !== loadRequestsSequenceRef.current) return
      if (response.ok && Array.isArray(data)) setRequests(data)
    } finally {
      if (sequence === loadRequestsSequenceRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!activeBranchId) {
      loadRequestsSequenceRef.current += 1
      setRequests([])
      setLoading(false)
      return
    }
    if (workflow.loading) return
    if (!can("create")) { setRequests([]); return }
    void loadRequests()
  }, [activeBranchId, workflow.loading, workflow.permissions])


  useEffect(() => {
    Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchResponse, warehouseResponse]) => {
      const [branchData, warehouseData] = await Promise.all([branchResponse.json(), warehouseResponse.json()])
      setBranches(Array.isArray(branchData) ? [...branchData].sort((left, right) => Number(left.id) - Number(right.id)) : [])
      setWarehouses(Array.isArray(warehouseData) ? [...warehouseData].sort((left, right) => Number(left.id) - Number(right.id)) : [])
    })
    fetch("/api/internal-manufacturing-requests/settings").then((response) => response.json()).then((settings) => setRequestAuditRequired(settings.requestAudit !== false))
  }, [])


  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || id
  const warehouseName = (id: number | null) => warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.warehouse_name || id || "-"
  const selectedOptionIds = (options: any[], event: any) => {
    if (Array.isArray(event?.value)) return event.value.map((option: any) => Number(option?.id ?? option))
    return event?.checked ? options.map((option) => Number(option.id)) : []
  }
  const filteredRequests = useMemo(() => requests.filter((request) => {
    const requestDate = String(request.vch_date).slice(0, 10)
    const sourceWarehouseId = Number((request as any).to_store_id || 0)
    return (!fromDate || requestDate >= fromDate) &&
      (!toDate || requestDate <= toDate) &&
      (!requesterBranches.length || requesterBranches.includes(Number(request.branch_id))) &&
      (!manufacturingBranches.length || manufacturingBranches.includes(Number(request.manufacturing_branch_id))) &&
      (!sourceWarehouses.length || sourceWarehouses.includes(sourceWarehouseId)) &&
      (!destinationWarehouses.length || destinationWarehouses.includes(Number(request.destination_warehouse_id || 0)))
  }), [requests, fromDate, toDate, requesterBranches, manufacturingBranches, sourceWarehouses, destinationWarehouses])
  const openNewRequest = () => { setSelectedRequest(null); setEditingRequest(null); setEditing(false); setItems([]); setOpen(true) }
  const editableStatus = (request: InternalRequest) => Number(request.internal_status) === 2 || (!requestAuditRequired && Number(request.internal_status) === 3)
  const canEditOrDelete = (request: InternalRequest) => editableStatus(request) && can("edit")
  const openExistingRequest = (request: InternalRequest) => {
    const canEdit = canEditOrDelete(request)
    setSelectedRequest(canEdit ? null : request)
    setEditingRequest(canEdit ? request : null)
    setEditing(canEdit)
    setDate(String(request.vch_date).slice(0, 10))
    setSourceWarehouse(String((request as any).to_store_id || ""))
    setDestinationBranch(String(request.manufacturing_branch_id || ""))
    setDestinationWarehouse(String(request.destination_warehouse_id || ""))
    setItems((request.items || []).map((item: any) => { const [baseProductName, ...unitParts] = String(item.item_name || "").split(" - "); return { product_id: item.item_id, product_name: baseProductName, base_product_name: baseProductName, product_image: item.product_image || item.image_url || null, unit_id: item.unit_id, unit_name: item.unit_name || unitParts.join(" - "), quantity: Number(item.qnty), barcode: item.barcode } }))
    setOpen(true)
  }
  useEffect(() => {
    const openFromAI = () => {
      const raw = sessionStorage.getItem("ai_open_document")
      if (!raw) return
      try {
        const target = JSON.parse(raw) as { section?: string; id?: number }
        if (target.section !== "internal-manufacturing-request" || !target.id) return
        const request = requests.find((row) => Number(row.id) === Number(target.id))
        if (!request) return
        sessionStorage.removeItem("ai_open_document")
        openExistingRequest(request)
      } catch { sessionStorage.removeItem("ai_open_document") }
    }
    window.addEventListener("ai-open-document", openFromAI)
    openFromAI()
    return () => window.removeEventListener("ai-open-document", openFromAI)
  }, [requests])
  useVoucherDeepLink(id => {
    const request = requests.find(row => Number(row.id) === id)
    if (request) openExistingRequest(request)
  }, requests.length > 0, 20)

  const buildRequestItem = (product: any, barcodeOverride?: string) => {
    const unit = product.units?.find((item: any) => Number(item.unit_id) === Number(product.unit_id)) || product.selected_unit || product.units?.[0] || (product.unit_id ? { unit_id: product.unit_id, unit_name: product.unit_name, barcode: product.barcode } : null)
    return { product_id: product.id, product_name: product.product_name, base_product_name: product.product_name, product_image: product.product_image || product.image_url || product.display_image || null, unit_id: unit?.unit_id, unit_name: unit?.unit_name || product.first_unit || "", quantity: 1, barcode: barcodeOverride || unit?.primary_barcode || unit?.barcode || product.first_barcode || product.barcode || "", units: Array.isArray(product.units) && product.units.some((entry: any) => entry?.unit_name) ? product.units : undefined, properties: product.properties || product.features || product.attributes || null }
  }
  // وحدات الصنف (لتغيير وحدة السطر): من نتيجة البحث إن توفرت، وإلا تُحمَّل مرة لكل صنف
  const loadUnits = (productId: number) => {
    let pending = unitsCacheRef.current.get(productId)
    if (!pending) {
      pending = fetch(`/api/products/${productId}/units`, { cache: "no-store" }).then((response) => (response.ok ? response.json() : [])).then((rows) => (Array.isArray(rows) ? rows : [])).catch(() => [])
      unitsCacheRef.current.set(productId, pending)
    }
    return pending
  }
  useEffect(() => {
    if (!open) return
    const missing = [...new Set(items.filter((item) => item.product_id && !Array.isArray(item.units)).map((item) => Number(item.product_id)))]
    if (!missing.length) return
    let cancelled = false
    void Promise.all(missing.map(async (productId) => [productId, await loadUnits(productId)] as const)).then((pairs) => {
      if (cancelled) return
      const byProduct = new Map<number, any[]>(pairs)
      setItems((current) => current.map((item) => (!Array.isArray(item.units) && byProduct.has(Number(item.product_id)) ? { ...item, units: byProduct.get(Number(item.product_id)) } : item)))
    })
    return () => { cancelled = true }
  }, [open, items])
  const changeItemUnit = (index: number, unitId: number) => setItems((current) => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const unit = (item.units || []).find((entry: any) => Number(entry.unit_id) === unitId)
    if (!unit) return item
    const barcode = String(unit.primary_barcode || String(unit.barcode || "").split(",")[0] || "").trim()
    return { ...item, unit_id: unit.unit_id, unit_name: unit.unit_name, barcode }
  }))
  const setItemQuantity = (index: number, quantity: number) => setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Number.isFinite(quantity) ? quantity : 0 } : item)))
  const addProduct = async (products: any[]) => {
    if (!Array.isArray(products) || products.length === 0) return
    try {
      const groups = await Promise.all(products.map((product) => expandProductWithRelatedItems(product)))
      setItems((current) => { const next = [...current]; for (const product of groups.flat()) if (!next.some((item) => Number(item.product_id) === Number(product.id))) next.push(buildRequestItem(product)); return next })
      setProductOpen(false)
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "تعذر إضافة توابع الصنف", "error")
    }
  }
  const addProductByBarcode = async () => {
    const barcode = barcodeInput.trim()
    if (!barcode || barcodeSearching) return
    setBarcodeSearching(true)
    try {
      const response = await fetch(`/api/inventory/products/search?query=${encodeURIComponent(barcode)}`)
      const product = await response.json()
      if (!response.ok || !product?.id) {
        showMessage("رقم الباركود المدخل غير صحيح", "error")
        return
      }
      const expanded = await expandProductWithRelatedItems(product)
      setItems((current) => { const next = [...current]; for (const expandedProduct of expanded) if (!next.some((item) => Number(item.product_id) === Number(expandedProduct.id))) next.push(buildRequestItem(expandedProduct, Number(expandedProduct.id) === Number(product.id) ? barcode : undefined)); return next })
      setBarcodeInput("")
    } catch {
      showMessage("رقم الباركود المدخل غير صحيح", "error")
    } finally {
      setBarcodeSearching(false)
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0)
    }
  }
  const saveRequest = async () => {
    messagesRef.current?.clear?.()
    if (items.length === 0) { showMessage("يجب اضافة صنف واحد على الأقل", "error"); return }
    if (items.some((item) => !(Number(item.quantity) > 0))) { showMessage("يجب أن تكون كمية كل صنف أكبر من صفر", "error"); return }
    if (!sourceWarehouse) { showMessage("يجب اختيار مستودع مقدم الطلب", "error"); return }
    if (!destinationBranch) { showMessage("يجب اختيار الفرع المطلوب منه البضاعة", "error"); return }
    if (!destinationWarehouse) { showMessage("يجب اختيار المستودع المطلوب منه البضاعة", "error"); return }
    if (String(sourceWarehouse) === String(destinationWarehouse)) { showMessage("لا يمكن أن يكون نفس المستودع", "error"); return }
    setLoading(true)
    try {
      const saveItems = items.map(({ base_product_name, units, ...item }) => ({ ...item, product_name: base_product_name || item.product_name }))
      const response = await fetch(editing && editingRequest ? `/api/internal-manufacturing-requests/${editingRequest.id}` : "/api/internal-manufacturing-requests", { method: editing && editingRequest ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vch_date: date, branch_id: activeBranchId, source_warehouse_id: sourceWarehouse, manufacturing_branch_id: destinationBranch, destination_warehouse_id: destinationWarehouse, items: saveItems }) })
      const data = await response.json()
      if (!response.ok) { showMessage(data.error || "تعذر حفظ الطلب", "error"); return }
      showMessage(`تم حفظ الطلب ${data.vch_code}`, "success")
      setRequests((current) => [data, ...current.filter((request) => request.id !== data.id)])
      setOpen(false)
      setEditing(false)
      setEditingRequest(null)
      await loadRequests()
    } finally { setLoading(false) }
  }
  const deleteRequest = (requestId: number) => {
    setDeleteRequestId(requestId)
  }

  const performDeleteRequest = async (requestId: number) => {
    const response = await fetch(`/api/internal-manufacturing-requests/${requestId}?_=${Date.now()}`, { method: "DELETE", cache: "no-store" })
    const data = await response.json()
    if (!response.ok) { showMessage(data.error || "تعذر حذف الطلب", "error"); return }
    setRequests((current) => current.filter((request) => request.id !== requestId))
    await loadRequests()
  }

  return <div dir="rtl" className="space-y-4 p-3 md:p-5">
    <InternalPageHeader title="طلب بضاعة داخلي" description={INTERNAL_STEPS[0].description} icon={INTERNAL_STEPS[0].icon} branchLabel={workflow.branchId ? workflow.branchName(workflow.branchId) : undefined} sideLabel="تُنفَّذ من: فرع مقدم الطلب" actions={<><RefreshButton loading={loading} onClick={() => { void loadRequests(); void workflow.reload() }} />{can("create") && <Button data-hotkey-new onClick={openNewRequest}><Plus className="ml-2 h-4 w-4" />إضافة طلب داخلي <span className="text-[11px] font-semibold opacity-75" dir="ltr">F5</span></Button>}</>} />
    {!workflow.loading && !can("create") && <InternalLockedState title="لا توجد صلاحية" message={`لا يوجد لديك صلاحية "إنشاء طلب بضاعة داخلي" في فرع ${workflow.branchName(workflow.branchId)}.`} />}
    <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3 grid gap-3 md:grid-cols-2"><div><Label>من تاريخ طلب</Label><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div><div><Label>إلى تاريخ طلب</Label><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div></div><div className="grid gap-3 md:grid-cols-2"><div><Label>فرع مقدم الطلب</Label><MultiSelect value={requesterBranches} options={branches} optionLabel="branch_name" optionValue="id" showFilter showMultiSelect placeholder="كل الفروع" selectedItemsLabel="تم تحديد {0} فروع" onChange={(event: any) => setRequesterBranches(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setRequesterBranches(selectedOptionIds(branches, event))} /></div><div><Label>الفرع المطلوب من البضاعة</Label><MultiSelect value={manufacturingBranches} options={branches} optionLabel="branch_name" optionValue="id" showFilter showMultiSelect placeholder="كل الفروع" selectedItemsLabel="تم تحديد {0} فروع" onChange={(event: any) => setManufacturingBranches(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setManufacturingBranches(selectedOptionIds(branches, event))} /></div><div><Label>مستودع مقدم الطلب</Label><MultiSelect value={sourceWarehouses} options={warehouses} optionLabel="warehouse_name" optionValue="id" showFilter showMultiSelect placeholder="كل المستودعات" selectedItemsLabel="تم تحديد {0} مستودعات" onChange={(event: any) => setSourceWarehouses(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setSourceWarehouses(selectedOptionIds(warehouses, event))} /></div><div><Label>المستودع المطلوب منه البضاعة</Label><MultiSelect value={destinationWarehouses} options={warehouses} optionLabel="warehouse_name" optionValue="id" showFilter showMultiSelect placeholder="كل المستودعات" selectedItemsLabel="تم تحديد {0} مستودعات" onChange={(event: any) => setDestinationWarehouses(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setDestinationWarehouses(selectedOptionIds(warehouses, event))} /></div></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredRequests.map((request) => { const status = Number(request.internal_status); const editable = canEditOrDelete(request); const statusLabel = INTERNAL_STATUS_LABELS[status] || "قيد المعالجة"; return <Card key={request.id}><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><Badge>{statusLabel}</Badge></CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div>التاريخ: <b>{String(request.vch_date).slice(0, 10)}</b></div><div>فرع البضاعة: <b>{branchName(request.manufacturing_branch_id)}</b></div><div>المستودع: <b>{warehouseName(request.destination_warehouse_id)}</b></div><div className="flex gap-2"><Button className="flex-1" variant="outline" onClick={() => openExistingRequest(request)}>{editable ? "تعديل" : <><Search className="ml-2 h-4 w-4" />مشاهدة</>}</Button>{editableStatus(request) && can("delete") && <Button variant="destructive" onClick={() => void deleteRequest(request.id)}><Trash2 className="h-4 w-4" /></Button>}</div></CardContent></Card> })}</div>
    {!loading && filteredRequests.length === 0 && <div className="rounded-xl border-2 border-dashed py-16 text-center"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" /><h2 className="font-bold">لا توجد طلبات مطابقة للفلاتر</h2></div>}
    <ConfirmDialogYesNo visible={deleteRequestId !== null} message="هل أنت متأكد من حذف الطلب؟" onConfirm={() => { const requestId = deleteRequestId; setDeleteRequestId(null); if (requestId !== null) void performDeleteRequest(requestId) }} onCancel={() => setDeleteRequestId(null)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <div className="bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><ClipboardCheck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1 text-right">
              <DialogTitle className="truncate text-lg font-bold text-white">{selectedRequest ? "مشاهدة طلب البضاعة" : editingRequest ? "تعديل طلب داخلي" : "إضافة طلب داخلي"}</DialogTitle>
              <DialogDescription className="text-xs text-emerald-50/90">{selectedRequest ? "عرض بيانات الطلب وأصنافه" : "حدد المستودعات ثم أضف الأصناف بالبحث أو بالباركود"}</DialogDescription>
            </div>
            {(selectedRequest || editingRequest) && <span className="ml-8 shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">{(selectedRequest || editingRequest)?.vch_code}</span>}
          </div>
        </div>

        <div ref={setFormBodyElement} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:p-5">
          <Messages innerRef={messagesRef} />
          {selectedRequest ? <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["رقم الطلب", selectedRequest.vch_code], ["التاريخ", String(selectedRequest.vch_date).slice(0, 10)], ["فرع البضاعة", branchName(selectedRequest.manufacturing_branch_id)], ["المستودع", warehouseName(selectedRequest.destination_warehouse_id)]].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border bg-card p-3 shadow-sm"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate font-bold">{value}</div></div>
              ))}
            </div>
            <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Package className="h-4 w-4" /></span>الأصناف <Badge variant="secondary">{(selectedRequest.items || []).length}</Badge></h3>
              <div className="space-y-2">
                {(selectedRequest.items || []).map((item: any, index: number) => (
                  <div key={item.id || index} className="flex items-center gap-3 rounded-lg border bg-background p-2">
                    <ItemThumb src={item.product_image} alt={item.item_name} />
                    <div className="min-w-0 flex-1"><div className="truncate font-bold text-blue-700 dark:text-blue-300">{item.item_name || "-"}</div><div className="text-xs text-muted-foreground">{item.unit_name || "بدون وحدة"}</div></div>
                    <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{Number(item.qnty || 0)}</div>
                  </div>
                ))}
              </div>
            </section>
          </> : <>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
              <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"><Store className="h-4 w-4" /></span>مقدم الطلب</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2"><Label>تاريخ الطلب</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
                  <div className="space-y-1"><Label>الفرع</Label><Input value={String(branchName(Number(activeBranchId)))} disabled className="bg-muted" /></div>
                  <div className="space-y-1"><Label>المستودع *</Label><select className={SELECT_CLASS} value={sourceWarehouse} onChange={(event) => setSourceWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div>
                </div>
              </section>
              <div className="hidden items-center justify-center lg:flex"><span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white shadow"><ArrowLeft className="h-5 w-5" /></span></div>
              <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Warehouse className="h-4 w-4" /></span>المطلوب منه البضاعة</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>الفرع *</Label><select className={SELECT_CLASS} value={destinationBranch} onChange={(event) => setDestinationBranch(event.target.value)}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div>
                  <div className="space-y-1"><Label>المستودع *</Label><select className={SELECT_CLASS} value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div>
                </div>
              </section>
            </div>

            <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Package className="h-4 w-4" /></span>الأصناف <Badge variant="secondary">{items.length}</Badge></h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setProductOpen(true)}><Search className="ml-1 h-4 w-4" />بحث وإضافة صنف</Button>
              </div>
              <div className="relative mb-3">
                <ScanBarcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input ref={barcodeInputRef} data-enter-action className="h-11 pl-24 pr-9 text-base" value={barcodeInput} disabled={barcodeSearching} onChange={(event) => setBarcodeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addProductByBarcode() } }} placeholder="امسح أو أدخل الباركود ثم Enter" />
                <Button type="button" size="sm" className="absolute left-1.5 top-1/2 -translate-y-1/2" disabled={barcodeSearching || !barcodeInput.trim()} onClick={() => void addProductByBarcode()}>{barcodeSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="ml-1 h-4 w-4" />}إضافة</Button>
              </div>
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-sm text-muted-foreground"><Package className="h-9 w-9 text-emerald-500/70" />لم تتم إضافة أصناف بعد</div>
              ) : (
                <div className="space-y-2">
                  <div className="hidden grid-cols-[48px_1fr_170px_150px_40px] gap-3 px-2 text-xs font-semibold text-muted-foreground md:grid"><span /><span>الصنف</span><span>الوحدة</span><span>الكمية</span><span /></div>
                  {items.map((item, index) => {
                    const units: any[] = Array.isArray(item.units) ? item.units : []
                    return (
                      <div key={`${item.product_id}-${index}`} className="grid grid-cols-[48px_1fr_40px] items-center gap-3 rounded-lg border bg-background p-2 md:grid-cols-[48px_1fr_170px_150px_40px]">
                        <ItemThumb src={item.product_image} alt={item.product_name} />
                        <div className="min-w-0"><div className="truncate font-bold text-blue-700 dark:text-blue-300">{item.product_name}</div>{item.barcode && <div className="truncate font-mono text-[11px] text-muted-foreground">{item.barcode}</div>}</div>
                        <Button type="button" variant="ghost" size="icon" className="text-red-600 hover:bg-red-50 hover:text-red-700 md:order-last" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                        <div className="col-span-3 grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-[170px_150px] md:gap-3">
                          <select className={SELECT_CLASS} value={item.unit_id ? String(item.unit_id) : ""} disabled={units.length <= 1} onChange={(event) => changeItemUnit(index, Number(event.target.value))} title="الوحدة">
                            {!units.length && <option value={item.unit_id ? String(item.unit_id) : ""}>{item.unit_name || "بدون وحدة"}</option>}
                            {units.map((unit) => <option key={unit.unit_id} value={String(unit.unit_id)}>{unit.unit_name}{Number(unit.to_main_qnty) > 1 ? ` (×${Number(unit.to_main_qnty)})` : ""}</option>)}
                          </select>
                          <div className="flex h-10 items-center overflow-hidden rounded-md border bg-background">
                            <button type="button" className="grid h-full w-9 place-items-center text-muted-foreground hover:bg-muted" onClick={() => setItemQuantity(index, Number(item.quantity || 0) + 1)}><Plus className="h-4 w-4" /></button>
                            <input type="number" min="0" step="any" className="h-full min-w-0 flex-1 bg-transparent text-center font-bold outline-none" value={item.quantity} onChange={(event) => setItemQuantity(index, Number(event.target.value))} />
                            <button type="button" className="grid h-full w-9 place-items-center text-muted-foreground hover:bg-muted" onClick={() => setItemQuantity(index, Math.max(1, Number(item.quantity || 0) - 1))}><Minus className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-background px-5 py-3">
          <span className="text-xs text-muted-foreground">{selectedRequest ? "" : <>عدد الأصناف: <b className="text-foreground">{items.length}</b> · إجمالي الكميات: <b className="text-foreground">{items.reduce((total, item) => total + Number(item.quantity || 0), 0)}</b></>}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
            {!selectedRequest && <Button onClick={() => void saveRequest()} disabled={loading} className="min-w-32 bg-emerald-600 hover:bg-emerald-700">{loading ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}حفظ مسودة الطلب</Button>}
          </div>
        </div>
        {productOpen && <ProductSearchPopup open={productOpen} onClose={() => setProductOpen(false)} onSelect={addProduct} />}
      </DialogContent>
    </Dialog>
  </div>
}
