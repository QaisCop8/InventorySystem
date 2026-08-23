"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import Messages from "@/components/common/Messages"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClipboardCheck, Plus, Search, Trash2 } from "lucide-react"
import { createPortal } from "react-dom"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import { useAuth } from "@/components/auth/auth-context"
import MultiSelect from "@/components/common/MultiSelect"

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

const getCurrentMonthDateRange = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  return {
    from: formatDate(new Date(year, month, 1)),
    to: formatDate(new Date(year, month + 1, 0)),
  }
}

export default function InternalRequestPage() {
  const { activeBranchId } = useAuth()
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
  const currentMonthDateRange = getCurrentMonthDateRange()
  const [fromDate, setFromDate] = useState(currentMonthDateRange.from)
  const [toDate, setToDate] = useState(currentMonthDateRange.to)
  const [requesterBranches, setRequesterBranches] = useState<number[]>([])
  const [manufacturingBranches, setManufacturingBranches] = useState<number[]>([])
  const [sourceWarehouses, setSourceWarehouses] = useState<number[]>([])
  const [destinationWarehouses, setDestinationWarehouses] = useState<number[]>([])
  const messagesRef = useRef<any>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [barcodeSearching, setBarcodeSearching] = useState(false)
  const [itemsPanelElement, setItemsPanelElement] = useState<Element | null>(null)

  const showMessage = (detail: string, severity: "success" | "error") => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000 }])
  }

  const loadRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests?_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(activeBranchId || "") } })
      const data = await response.json()
      setRequests(response.ok && Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadRequests() }, [activeBranchId])

  useEffect(() => {
    if (!open || selectedRequest) { setItemsPanelElement(null); return }
    const frame = window.requestAnimationFrame(() => {
      const heading = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"] h3')).find((element) => element.textContent?.trim() === "الأصناف")
      setItemsPanelElement(heading?.parentElement || null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, selectedRequest])

  useEffect(() => {
    if (!itemsPanelElement) return
    const productInputs = Array.from(itemsPanelElement.parentElement?.querySelectorAll("input[disabled]") || []) as HTMLInputElement[]
    items.forEach((item, index) => {
      const input = productInputs[index]
      if (!input) return
      input.classList.add("text-lg", "font-bold", "text-blue-600")
      if (!item.unit_name || input.parentElement?.querySelector("[data-internal-request-unit]")) return
      const unitLabel = document.createElement("span")
      unitLabel.dataset.internalRequestUnit = "true"
      unitLabel.className = "mr-2 text-base font-normal text-red-600"
      unitLabel.textContent = `- ${item.unit_name}`
      input.parentElement?.appendChild(unitLabel)
    })
  }, [itemsPanelElement, items])

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
  const canEditOrDelete = (request: InternalRequest) => Number(request.internal_status) === 2 || (!requestAuditRequired && Number(request.internal_status) === 3)
  const openExistingRequest = (request: InternalRequest) => {
    const canEdit = canEditOrDelete(request)
    setSelectedRequest(canEdit ? null : request)
    setEditingRequest(canEdit ? request : null)
    setEditing(canEdit)
    setDate(String(request.vch_date).slice(0, 10))
    setSourceWarehouse(String((request as any).to_store_id || ""))
    setDestinationBranch(String(request.manufacturing_branch_id || ""))
    setDestinationWarehouse(String(request.destination_warehouse_id || ""))
    setItems((request.items || []).map((item: any) => { const [baseProductName, ...unitParts] = String(item.item_name || "").split(" - "); return { product_id: item.item_id, product_name: baseProductName, base_product_name: baseProductName, unit_id: item.unit_id, unit_name: item.unit_name || unitParts.join(" - "), quantity: Number(item.qnty), barcode: item.barcode } }))
    setOpen(true)
  }
  const addProduct = (products: any[]) => {
    const product = products[0]
    if (!product) return
    const unit = product.selected_unit || product.units?.[0]
    setItems((current) => [...current, { product_id: product.id, product_name: product.product_name, base_product_name: product.product_name, unit_id: unit?.unit_id, unit_name: unit?.unit_name || "", quantity: 1, barcode: unit?.barcode || product.barcode || "", properties: product.properties || product.features || product.attributes || null }])
    setProductOpen(false)
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0)
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
      const unit = product.units?.find((item: any) => Number(item.unit_id) === Number(product.unit_id)) || product.selected_unit || product.units?.[0]
      setItems((current) => [...current, { product_id: product.id, product_name: product.product_name, base_product_name: product.product_name, unit_id: unit?.unit_id, unit_name: unit?.unit_name || "", quantity: 1, barcode, properties: product.properties || product.features || product.attributes || null }])
      setBarcodeInput("")
    } catch {
      showMessage("رقم الباركود المدخل غير صحيح", "error")
    } finally {
      setBarcodeSearching(false)
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0)
    }
  }
  const barcodePortal = itemsPanelElement && open && !selectedRequest
    ? createPortal(<div className="order-last mb-3 w-full basis-full rounded-lg border bg-muted/20 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Label className="text-base" htmlFor="internal-request-barcode">الباركود</Label><Input className="text-base" id="internal-request-barcode" ref={barcodeInputRef} value={barcodeInput} disabled={barcodeSearching} onChange={(event) => setBarcodeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addProductByBarcode() } }} placeholder="أدخل الباركود" /></div><Button type="button" className="shrink-0 text-base" disabled={barcodeSearching || !barcodeInput.trim()} onClick={() => void addProductByBarcode()}>{barcodeSearching ? "بحث..." : "بحث"}</Button></div></div>, itemsPanelElement)
    : null
  const saveRequest = async () => {
    messagesRef.current?.clear?.()
    if (items.length === 0) { showMessage("يجب اضافة صنف واحد على الأقل", "error"); return }
    if (!sourceWarehouse) { showMessage("يجب اختيار مستودع مقدم الطلب", "error"); return }
    if (!destinationBranch) { showMessage("يجب اختيار الفرع المطلوب منه البضاعة", "error"); return }
    if (!destinationWarehouse) { showMessage("يجب اختيار المستودع المطلوب منه البضاعة", "error"); return }
    if (String(sourceWarehouse) === String(destinationWarehouse)) { showMessage("لا يمكن أن يكون نفس المستودع", "error"); return }
    setLoading(true)
    try {
      const saveItems = items.map(({ base_product_name, ...item }) => ({ ...item, product_name: base_product_name || item.product_name }))
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

  return <div dir="rtl" className="space-y-5 p-3 md:p-6">
    {barcodePortal}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold">طلب بضاعة داخلي</h1><p className="mt-1 text-sm text-muted-foreground">أنشئ وتابع طلبات البضاعة الداخلية.</p></div><Button onClick={openNewRequest}><Plus className="ml-2 h-4 w-4" />إضافة طلب داخلي</Button></div>
    <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3 grid gap-3 md:grid-cols-2"><div><Label>من تاريخ طلب</Label><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div><div><Label>إلى تاريخ طلب</Label><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div></div><div className="grid gap-3 md:grid-cols-2"><div><Label>فرع مقدم الطلب</Label><MultiSelect value={requesterBranches} options={branches} optionLabel="branch_name" optionValue="id" showFilter showMultiSelect placeholder="كل الفروع" selectedItemsLabel="تم تحديد {0} فروع" onChange={(event: any) => setRequesterBranches(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setRequesterBranches(selectedOptionIds(branches, event))} /></div><div><Label>الفرع المطلوب من البضاعة</Label><MultiSelect value={manufacturingBranches} options={branches} optionLabel="branch_name" optionValue="id" showFilter showMultiSelect placeholder="كل الفروع" selectedItemsLabel="تم تحديد {0} فروع" onChange={(event: any) => setManufacturingBranches(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setManufacturingBranches(selectedOptionIds(branches, event))} /></div><div><Label>مستودع مقدم الطلب</Label><MultiSelect value={sourceWarehouses} options={warehouses} optionLabel="warehouse_name" optionValue="id" showFilter showMultiSelect placeholder="كل المستودعات" selectedItemsLabel="تم تحديد {0} مستودعات" onChange={(event: any) => setSourceWarehouses(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setSourceWarehouses(selectedOptionIds(warehouses, event))} /></div><div><Label>المستودع المطلوب منه البضاعة</Label><MultiSelect value={destinationWarehouses} options={warehouses} optionLabel="warehouse_name" optionValue="id" showFilter showMultiSelect placeholder="كل المستودعات" selectedItemsLabel="تم تحديد {0} مستودعات" onChange={(event: any) => setDestinationWarehouses(Array.isArray(event.value) ? event.value.map(Number) : [])} onSelectAll={(event: any) => setDestinationWarehouses(selectedOptionIds(warehouses, event))} /></div></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredRequests.map((request) => { const status = Number(request.internal_status); const editable = canEditOrDelete(request); const statusLabel = status === 2 ? "قيد التدقيق" : status === 3 ? "قيد التجهيز" : status === 1 ? "مسودة" : "قيد المعالجة"; return <Card key={request.id}><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span>{request.vch_code}</span><Badge>{statusLabel}</Badge></CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div>التاريخ: <b>{String(request.vch_date).slice(0, 10)}</b></div><div>فرع البضاعة: <b>{branchName(request.manufacturing_branch_id)}</b></div><div>المستودع: <b>{warehouseName(request.destination_warehouse_id)}</b></div><div className="flex gap-2"><Button className="flex-1" variant="outline" onClick={() => openExistingRequest(request)}>{editable ? "تعديل" : <><Search className="ml-2 h-4 w-4" />مشاهدة</>}</Button>{editable && <Button variant="destructive" onClick={() => void deleteRequest(request.id)}><Trash2 className="h-4 w-4" /></Button>}</div></CardContent></Card> })}</div>
    {!loading && filteredRequests.length === 0 && <div className="rounded-xl border-2 border-dashed py-16 text-center"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" /><h2 className="font-bold">لا توجد طلبات مطابقة للفلاتر</h2></div>}
    <ConfirmDialogYesNo visible={deleteRequestId !== null} message="هل أنت متأكد من حذف الطلب؟" onConfirm={() => { const requestId = deleteRequestId; setDeleteRequestId(null); if (requestId !== null) void performDeleteRequest(requestId) }} onCancel={() => setDeleteRequestId(null)} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}><DialogHeader><DialogTitle>{selectedRequest ? "مشاهدة طلب البضاعة" : "إضافة طلب داخلي"}</DialogTitle></DialogHeader><Messages innerRef={messagesRef} />{selectedRequest ? <div className="space-y-4"><div className="grid gap-3 rounded border p-4 sm:grid-cols-2"><div>رقم الطلب: <b>{selectedRequest.vch_code}</b></div><div>التاريخ: <b>{String(selectedRequest.vch_date).slice(0, 10)}</b></div><div>فرع البضاعة: <b>{branchName(selectedRequest.manufacturing_branch_id)}</b></div><div>المستودع: <b>{warehouseName(selectedRequest.destination_warehouse_id)}</b></div></div><Button className="w-full" variant="outline" onClick={() => setOpen(false)}>إغلاق</Button></div> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2 sm:w-1/2"><Label>تاريخ الطلب</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div><Label>فرع مقدم الطلب</Label><Input value={branchName(Number(activeBranchId))} disabled /></div><div><Label>مستودع مقدم الطلب</Label><select className="w-full rounded border p-2" value={sourceWarehouse} onChange={(event) => setSourceWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div><div><Label>الفرع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationBranch} onChange={(event) => setDestinationBranch(event.target.value)}><option value="">اختر الفرع</option>{branches.filter((branch) => Number(branch.id) !== Number(activeBranchId)).map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div><div><Label>المستودع المطلوب منه البضاعة</Label><select className="w-full rounded border p-2" value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value)}><option value="">اختر المستودع</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name || warehouse.name}</option>)}</select></div></div><div className="rounded border p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">الأصناف</h3><Button type="button" variant="outline" onClick={() => setProductOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة صنف</Button></div>{items.map((item, index) => <div key={`${item.product_id}-${index}`} className="mb-2 grid grid-cols-[1fr_100px_40px] items-center gap-2"><Input value={item.product_name} disabled /><Input type="number" min="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /><Button type="button" variant="ghost" size="icon" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button className="w-full" onClick={() => void saveRequest()} disabled={loading}>حفظ مسودة الطلب</Button>{productOpen && <ProductSearchPopup open={productOpen} onClose={() => setProductOpen(false)} onSelect={addProduct} />}</div>}</DialogContent></Dialog>
  </div>
}
