"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownUp, CheckCircle2, Copy, FileText, Save, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Messages from "@/components/common/Messages"
import { useAuth } from "@/components/auth/auth-context"
import InternalItemImage from "./internal-item-image"
import {
  INTERNAL_STATUS_LABELS, INTERNAL_STEPS, InternalLockedState, InternalPageHeader, InternalRequestCard, InternalStepper, RefreshButton, SIDE_LABELS,
  formatQuantity, isStepEnabled, useInternalWorkflow, type InternalStepKey,
} from "./internal-workflow-shared"

type QuantityField = "qnty" | "prepared_quantity" | "received_quantity"
type StageRules = { editable: QuantityField | null; columns: QuantityField[]; fill?: { label: string; from: (item: any) => number } }

// ما يُعرض ويُعدَّل في كل مرحلة — نفس القواعد التي يقبلها الخادم (processInternalManufacturingAction).
const STAGE_RULES: Record<Exclude<InternalStepKey, "request">, StageRules> = {
  requestAudit: { editable: "qnty", columns: ["qnty"] },
  preparation: { editable: "prepared_quantity", columns: ["qnty", "prepared_quantity"], fill: { label: "تجهيز كامل الكميات المطلوبة", from: (item) => Number(item.qnty) } },
  readyAudit: { editable: "prepared_quantity", columns: ["qnty", "prepared_quantity"], fill: { label: "مطابقة للكميات المطلوبة", from: (item) => Number(item.qnty) } },
  send: { editable: null, columns: ["qnty", "prepared_quantity"] },
  receive: { editable: "received_quantity", columns: ["qnty", "prepared_quantity", "received_quantity"], fill: { label: "استلام كامل الكميات المجهزة", from: (item) => Number(item.prepared_quantity || item.qnty) } },
  receivedAudit: { editable: null, columns: ["qnty", "prepared_quantity", "received_quantity"] },
}
const COLUMN_LABELS: Record<QuantityField, string> = { qnty: "الكمية المطلوبة", prepared_quantity: "الكمية المجهزة", received_quantity: "الكمية المستلمة" }

function initialValue(stage: Exclude<InternalStepKey, "request">, item: any) {
  if (stage === "requestAudit") return Number(item.qnty)
  if (stage === "preparation") return Number(item.prepared_quantity) > 0 ? Number(item.prepared_quantity) : Number(item.qnty)
  if (stage === "readyAudit") return Number(item.prepared_quantity || 0)
  if (stage === "receive") return Number(item.received_quantity) > 0 ? Number(item.received_quantity) : Number(item.prepared_quantity || item.qnty)
  return 0
}

export default function InternalStagePage({ stageKey }: { stageKey: Exclude<InternalStepKey, "request"> }) {
  const step = INTERNAL_STEPS.find((candidate) => candidate.key === stageKey)!
  const rules = STAGE_RULES[stageKey]
  const { activeBranchId } = useAuth()
  const workflow = useInternalWorkflow()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [search, setSearch] = useState("")
  const [oldestFirst, setOldestFirst] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [values, setValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const pageMessagesRef = useRef<any>(null)
  const dialogMessagesRef = useRef<any>(null)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const sequenceRef = useRef(0)

  const allowed = workflow.permissions?.[step.permission] === true
  const canEditRequest = stageKey === "requestAudit" && (allowed || workflow.permissions?.edit === true)
  const enabled = isStepEnabled(step, workflow.settings)

  const load = async () => {
    const branchId = Number(activeBranchId || 0)
    const sequence = ++sequenceRef.current
    if (!branchId) { setRequests([]); return }
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests?status=${step.status}&_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(branchId) } })
      const data = await response.json()
      if (sequence !== sequenceRef.current) return
      if (response.ok && Array.isArray(data)) { setRequests(data); setListError("") }
      else { setRequests([]); setListError(data.error || "تعذر تحميل الطلبات") }
    } catch (error: any) {
      if (sequence === sequenceRef.current) setListError(error.message || "تعذر تحميل الطلبات")
    } finally {
      if (sequence === sequenceRef.current) setLoading(false)
    }
  }

  useEffect(() => { if (!workflow.loading && allowed) void load(); else if (!workflow.loading) setRequests([]) }, [activeBranchId, step.status, workflow.loading, allowed])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = requests.filter((request) => !term
      || String(request.vch_code || "").toLowerCase().includes(term)
      || String(request.requester_name || "").toLowerCase().includes(term)
      || workflow.branchName(request.branch_id).toLowerCase().includes(term)
      || workflow.branchName(request.manufacturing_branch_id).toLowerCase().includes(term)
      || (request.items || []).some((item: any) => String(item.item_name || "").toLowerCase().includes(term)))
    return [...rows].sort((left, right) => (oldestFirst ? 1 : -1) * (Number(left.id) - Number(right.id)))
  }, [requests, search, oldestFirst, workflow.branchName])

  const showDialogMessage = (detail: string, severity: "success" | "error" | "warn" = "error") => {
    dialogMessagesRef.current?.clear?.()
    dialogMessagesRef.current?.show?.([{ severity, summary: "", detail, sticky: severity === "error", life: 5000 }])
  }

  const openRequest = (request: any) => {
    setSelected(request)
    setValues(Object.fromEntries((request.items || []).map((item: any) => [item.id, formatQuantity(initialValue(stageKey, item))])))
    inputRefs.current = []
    requestAnimationFrame(() => { dialogMessagesRef.current?.clear?.(); inputRefs.current[0]?.focus(); inputRefs.current[0]?.select() })
  }

  const items: any[] = selected?.items || []
  const numericValue = (item: any) => Number(values[item.id])
  const dirty = !!rules.editable && items.some((item) => numericValue(item) !== Number(initialValue(stageKey, item)))

  const validate = () => {
    if (!rules.editable) return true
    const invalidIndex = items.findIndex((item) => {
      const value = numericValue(item)
      if (String(values[item.id] ?? "").trim() === "" || !Number.isFinite(value)) return true
      return stageKey === "requestAudit" ? value <= 0 : value < 0 || value > 100000
    })
    if (invalidIndex < 0) return true
    showDialogMessage(stageKey === "requestAudit" ? "يجب أن تكون كمية كل صنف أكبر من صفر" : `${COLUMN_LABELS[rules.editable]} يجب أن تكون بين 0 و100000`)
    inputRefs.current[invalidIndex]?.focus()
    inputRefs.current[invalidIndex]?.select()
    return false
  }

  // تعديل كميات الطلب أثناء تدقيقه يُحفظ عبر نفس مسار تعديل الطلب (PUT).
  const saveRequestItems = async () => {
    if (!selected) return false
    const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch_id: selected.branch_id, manufacturing_branch_id: selected.manufacturing_branch_id, source_warehouse_id: selected.to_store_id, destination_warehouse_id: selected.destination_warehouse_id, vch_date: String(selected.vch_date).slice(0, 10), items: items.map((item) => ({ product_id: item.item_id, product_name: item.item_name, unit_id: item.unit_id, quantity: numericValue(item), barcode: item.barcode, properties: item.item_properties })) }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { showDialogMessage(data.error || "تعذر حفظ التعديلات"); return false }
    return true
  }

  const saveOnly = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (!(await saveRequestItems())) return
      showDialogMessage("تم حفظ تعديلات الطلب", "success")
      await load()
      setSelected((current: any) => current && { ...current, items: current.items.map((item: any) => ({ ...item, qnty: numericValue(item) })) })
    } finally { setSaving(false) }
  }

  const approve = async () => {
    if (!selected || !step.action) return
    if (!validate()) return
    setSaving(true)
    try {
      if (stageKey === "requestAudit" && dirty && !(await saveRequestItems())) return
      const body: Record<string, unknown> = { action: step.action }
      if (rules.editable === "prepared_quantity") body.prepared_items = items.map((item) => ({ id: item.id, prepared_quantity: numericValue(item) }))
      if (rules.editable === "received_quantity") body.received_items = items.map((item) => ({ id: item.id, received_quantity: numericValue(item) }))
      const response = await fetch(`/api/internal-manufacturing-requests/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { showDialogMessage(data.error || "تعذر اعتماد المرحلة"); return }
      const next = INTERNAL_STATUS_LABELS[Number(data.status)] || ""
      setSelected(null)
      pageMessagesRef.current?.clear?.()
      pageMessagesRef.current?.show?.([{ severity: "success", summary: "", detail: `${step.done} ${selected.vch_code}${next ? ` — الحالة الآن: ${next}` : ""}`, life: 5000 }])
      await Promise.all([load(), workflow.reload()])
    } catch (error: any) {
      showDialogMessage(error.message || "تعذر اعتماد المرحلة")
    } finally { setSaving(false) }
  }

  const fillAll = () => { if (rules.fill) setValues(Object.fromEntries(items.map((item) => [item.id, formatQuantity(rules.fill!.from(item))]))) }
  const totals = rules.columns.map((column) => ({ column, value: items.reduce((sum, item) => sum + (column === rules.editable ? (Number.isFinite(numericValue(item)) ? numericValue(item) : 0) : Number(item[column] || 0)), 0) }))

  const header = <InternalPageHeader
    title={step.title}
    description={step.description}
    icon={step.icon}
    branchLabel={workflow.branchId ? workflow.branchName(workflow.branchId) : undefined}
    sideLabel={`تُنفَّذ من: ${SIDE_LABELS[step.side]}`}
    actions={<RefreshButton loading={loading} onClick={() => { void load(); void workflow.reload() }} />}
  >
    <InternalStepper settings={workflow.settings} counts={workflow.counts} permissions={workflow.permissions} current={stageKey} />
  </InternalPageHeader>

  if (!workflow.loading && !allowed) {
    return <div dir="rtl" className="space-y-4 p-3 md:p-5">{header}<InternalLockedState title="لا توجد صلاحية" message={workflow.branchId ? `لا يوجد لديك صلاحية "${step.title}" في فرع ${workflow.branchName(workflow.branchId)}. اختر فرعاً آخر أو اطلب منحك الصلاحية على هذا الفرع.` : "اختر الفرع أولاً."} /></div>
  }

  return <div dir="rtl" className="space-y-4 p-3 md:p-5">
    {header}
    <Messages innerRef={pageMessagesRef} />
    {!enabled && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">هذه المرحلة معطلة في إعدادات طلب بضاعة داخلي؛ تظهر هنا فقط الطلبات التي وصلتها قبل تعطيلها.</div>}
    {listError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{listError}</div>}

    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center dark:bg-slate-950">
      <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث برقم الطلب، مقدم الطلب، الفرع أو الصنف..." /></div>
      <Button variant="outline" onClick={() => setOldestFirst((value) => !value)}><ArrowDownUp className="ml-2 h-4 w-4" />{oldestFirst ? "الأقدم أولاً" : "الأحدث أولاً"}</Button>
      <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{visible.length} طلب</span>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visible.map((request) => <InternalRequestCard key={request.id} request={request} branchName={workflow.branchName} warehouseName={workflow.warehouseName} actionLabel={step.verb || "فتح الطلب"} onOpen={() => openRequest(request)} highlightBranchId={workflow.branchId} />)}
    </div>
    {!loading && !listError && visible.length === 0 && <div className="rounded-xl border-2 border-dashed py-14 text-center text-muted-foreground"><FileText className="mx-auto mb-3 h-10 w-10 text-emerald-600" /><div className="font-semibold text-foreground">لا توجد طلبات في هذه المرحلة</div><div className="mt-1 text-sm">{search ? "لا توجد نتائج مطابقة للبحث." : "ستظهر هنا الطلبات فور وصولها لهذه المرحلة."}</div></div>}

    <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !saving) setSelected(null) }}>
      <DialogContent dir="rtl" className="flex max-h-[94vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-3"><DialogTitle className="flex items-center gap-2 text-right"><step.icon className="h-5 w-5 text-emerald-600" />{step.title}: <span className="font-mono">{selected?.vch_code}</span></DialogTitle></DialogHeader>
        {selected && <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Messages innerRef={dialogMessagesRef} />
          <InternalStepper settings={workflow.settings} compact requestStatus={Number(selected.internal_status)} />
          <div className="grid gap-2 rounded-xl border bg-slate-50/60 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3 dark:bg-slate-900/40">
            <Info label="رقم الطلب" value={selected.vch_code} />
            <Info label="تاريخ الطلب" value={String(selected.vch_date).slice(0, 10)} />
            <Info label="مقدم الطلب" value={selected.requester_name || "-"} />
            <Info label="فرع مقدم الطلب" value={workflow.branchName(selected.branch_id)} />
            <Info label="مستودع مقدم الطلب" value={workflow.warehouseName(selected.to_store_id)} />
            <Info label="الحالة" value={INTERNAL_STATUS_LABELS[Number(selected.internal_status)] || "-"} />
            <Info label="الفرع المطلوب منه البضاعة" value={workflow.branchName(selected.manufacturing_branch_id)} />
            <Info label="المستودع المطلوب منه البضاعة" value={workflow.warehouseName(selected.destination_warehouse_id)} />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2 dark:bg-slate-900">
              <h3 className="font-bold">الأصناف <span className="text-sm font-normal text-muted-foreground">({items.length})</span></h3>
              {rules.fill && allowed && <Button size="sm" variant="outline" onClick={fillAll}><Copy className="ml-1.5 h-3.5 w-3.5" />{rules.fill.label}</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50/60 text-xs text-muted-foreground dark:bg-slate-900/40"><tr>
                  <th className="w-10 p-2 text-center">#</th>
                  <th className="p-2 text-right">الصنف</th>
                  {rules.columns.map((column) => <th key={column} className={`w-36 p-2 text-center ${column === rules.editable ? "text-emerald-700" : ""}`}>{COLUMN_LABELS[column]}</th>)}
                </tr></thead>
                <tbody>{items.map((item, index) => {
                  const value = numericValue(item)
                  const reference = rules.editable === "received_quantity" ? Number(item.prepared_quantity || item.qnty) : Number(item.qnty)
                  const differs = rules.editable && rules.editable !== "qnty" && Number.isFinite(value) && value !== reference
                  return <tr key={item.id} className="border-t">
                    <td className="p-2 text-center text-muted-foreground">{index + 1}</td>
                    <td className="p-2"><div className="flex items-center gap-3"><InternalItemImage item={item} size="sm" /><div className="min-w-0"><div className="truncate font-bold text-blue-700 dark:text-blue-400">{item.item_name || "-"}</div><div className="text-xs text-red-600">{item.unit_name || "بدون وحدة"}{item.barcode ? <span className="mr-2 font-mono text-muted-foreground">{item.barcode}</span> : null}</div></div></div></td>
                    {rules.columns.map((column) => <td key={column} className="p-2 text-center">
                      {column === rules.editable && allowed
                        ? <Input ref={(element) => { inputRefs.current[index] = element }} aria-label={COLUMN_LABELS[column]} type="number" inputMode="decimal" min="0" className={`h-9 text-center font-semibold ${differs ? "border-amber-400 bg-amber-50" : ""}`} value={values[item.id] ?? ""} onFocus={(event) => event.target.select()} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const nextInput = inputRefs.current[index + 1]; if (nextInput) { nextInput.focus(); nextInput.select() } else void approve() } }} />
                        : <span className="font-semibold">{formatQuantity(item[column])}</span>}
                    </td>)}
                  </tr>
                })}</tbody>
                <tfoot className="border-t bg-slate-50 text-sm font-bold dark:bg-slate-900"><tr>
                  <td className="p-2" colSpan={2}>الإجمالي</td>
                  {totals.map((total) => <td key={total.column} className="p-2 text-center">{formatQuantity(total.value)}</td>)}
                </tr></tfoot>
              </table>
            </div>
          </div>
        </div>}
        {selected && <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-5 py-3 dark:bg-slate-900">
          <span className="text-xs text-muted-foreground">{rules.editable && allowed ? "Enter للانتقال للصنف التالي — Enter على آخر صنف للاعتماد." : "مراجعة فقط — لا توجد كميات قابلة للتعديل في هذه المرحلة."}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>إغلاق</Button>
            {stageKey === "requestAudit" && canEditRequest && <Button variant="outline" onClick={() => void saveOnly()} disabled={saving || !dirty}><Save className="ml-2 h-4 w-4" />حفظ التعديلات</Button>}
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void approve()} disabled={saving || !allowed}><CheckCircle2 className="ml-2 h-4 w-4" />{saving ? "جارٍ الحفظ..." : step.verb}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate font-semibold">{value}</div></div>
}
