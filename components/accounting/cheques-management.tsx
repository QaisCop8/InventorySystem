"use client"
import "@/components/accounting/cheque-theme.css"

import { createChequeCsvBlob } from "@/lib/cheque-csv"
import { VoucherLink } from "@/components/reports/voucher-link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Messages from "@/components/common/Messages"
import { Activity, ArrowLeftRight, Banknote, CalendarClock, CheckCircle2, ChevronLeft, CircleDollarSign, Download, Eye, FileClock, History, Landmark, Loader2, RefreshCcw, RotateCcw, Search, ShieldCheck, Undo2, WalletCards } from "lucide-react"

type Option={id:number;name?:string;code?:string;currency_code?:string;currency_name?:string;bank_code?:string;bank_name?:string;bank_account_id?:number;jary_account_id?:number;tahsil_account_id?:number;branch_name?:string}
type Operation={code:string;name:string;needsDate?:boolean;needsAccount?:boolean;accountKind?:"bank"|"ledger";createsJournal?:boolean}
type Cheque={id:number;cheq_type:number;cheq_num:string;bank_account:string;amount:number;rate:number;received_date?:string;due_date?:string;pay_date?:string;return_date?:string;cheq_owner_name?:string;status_id:number;status_name:string;currency_code?:string;currency_name?:string;bank_name?:string;branch_name?:string;bank_account_code?:string;bank_account_name?:string;customer_code?:string;customer_name?:string;current_account_code?:string;current_account_name?:string;vch_code?:string;last_update_date:string;allowed_operations?:Operation[]}
type Meta={statuses:Option[];currencies:Option[];banks:Option[];bank_accounts:Option[];accounts:Option[]}
type Summary={count:number;total:number;due:number;returned:number}
type Filters={q:string;statusId:string;currencyId:string;bankId:string;fromDueDate:string;toDueDate:string;minAmount:string;maxAmount:string}
type Log={id:number;operation_name:string;operation_date:string;previous_status_name?:string;new_status_name?:string;account_code?:string;account_name?:string;note?:string;user_name?:string;voucher_id?:number;voucher_type?:number;journal_voucher_code?:string}

const emptyMeta:Meta={statuses:[],currencies:[],banks:[],bank_accounts:[],accounts:[]}
const emptySummary:Summary={count:0,total:0,due:0,returned:0}
const today=()=>new Date().toISOString().slice(0,10)
const firstDay=()=>`${today().slice(0,4)}-01-01`
const initialFilters:Filters={q:"",statusId:"all",currencyId:"all",bankId:"all",fromDueDate:firstDay(),toDueDate:"",minAmount:"",maxAmount:""}
const money=new Intl.NumberFormat("ar",{minimumFractionDigits:2,maximumFractionDigits:2})
const dateText=(value?:string)=>value?String(value).slice(0,10):"—"
const statusTone=(id:number)=>id===4?"bg-emerald-100 text-emerald-800":id===5?"bg-rose-100 text-rose-800":id===7?"bg-violet-100 text-violet-800":id===8?"bg-sky-100 text-sky-800":id===9?"bg-slate-200 text-slate-700":"bg-amber-100 text-amber-800"

function buildQuery(type:number,filters:Filters,meta=false){const p=new URLSearchParams({type:String(type)});if(meta)p.set("meta","1");if(filters.q.trim())p.set("q",filters.q.trim());if(filters.statusId!=="all")p.set("status_id",filters.statusId);if(filters.currencyId!=="all")p.set("currency_id",filters.currencyId);if(filters.bankId!=="all")p.set("bank_id",filters.bankId);if(filters.fromDueDate)p.set("from_due_date",filters.fromDueDate);if(filters.toDueDate)p.set("to_due_date",filters.toDueDate);if(filters.minAmount)p.set("min_amount",filters.minAmount);if(filters.maxAmount)p.set("max_amount",filters.maxAmount);return p}

function ChequeTypeTabs({value,onChange}:{value:number;onChange:(value:number)=>void}){return <Tabs value={String(value)} onValueChange={value=>onChange(Number(value))} dir="rtl"><TabsList className="grid h-12 w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:w-[390px]"><TabsTrigger value="1" className="gap-2 rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white"><CircleDollarSign className="h-4 w-4"/>شيكات واردة</TabsTrigger><TabsTrigger value="2" className="gap-2 rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><WalletCards className="h-4 w-4"/>شيكات صادرة</TabsTrigger></TabsList></Tabs>}

function FiltersPanel({filters,setFilters,meta,onSearch,loading}:{filters:Filters;setFilters:(value:Filters)=>void;meta:Meta;onSearch:()=>void;loading:boolean}){const update=(key:keyof Filters,value:string)=>setFilters({...filters,[key]:value});return <section className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-950"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="sm:col-span-2"><Label>بحث شامل</Label><div className="relative mt-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400"/><Input value={filters.q} onChange={e=>update("q",e.target.value)} onKeyDown={e=>e.key==="Enter"&&onSearch()} className="pr-9" placeholder="رقم الشيك، الحساب، العميل، البنك أو رقم السند..."/></div></div><SelectFilter label="حالة الشيك" value={filters.statusId} onChange={v=>update("statusId",v)} options={meta.statuses}/><SelectFilter label="العملة" value={filters.currencyId} onChange={v=>update("currencyId",v)} options={meta.currencies}/><SelectFilter label="البنك" value={filters.bankId} onChange={v=>update("bankId",v)} options={meta.banks}/><Field label="استحقاق من" type="date" value={filters.fromDueDate} onChange={v=>update("fromDueDate",v)}/><Field label="استحقاق إلى" type="date" value={filters.toDueDate} onChange={v=>update("toDueDate",v)}/><div className="grid grid-cols-2 gap-2"><Field label="مبلغ من" type="number" value={filters.minAmount} onChange={v=>update("minAmount",v)}/><Field label="مبلغ إلى" type="number" value={filters.maxAmount} onChange={v=>update("maxAmount",v)}/></div></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={onSearch} disabled={loading} className="gap-2 bg-slate-900 hover:bg-slate-800">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}عرض الشيكات</Button><Button variant="outline" onClick={()=>setFilters(initialFilters)}><RotateCcw className="ml-2 h-4 w-4"/>مسح الفلاتر</Button></div></section>}
function SelectFilter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Option[]}){return <div><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{options.map(o=><SelectItem key={o.id} value={String(o.id)}>{o.name||o.currency_name||o.bank_name||o.code}</SelectItem>)}</SelectContent></Select></div>}
function Field({label,type="text",value,onChange}:{label:string;type?:string;value:string;onChange:(value:string)=>void}){return <div><Label>{label}</Label><Input dir={type==="number"?"ltr":undefined} type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1" min={type==="number"?0:undefined}/></div>}

function SummaryCards({summary}:{summary:Summary}){const cards=[{label:"عدد الشيكات",value:String(summary.count),icon:FileClock,color:"text-sky-600 bg-sky-50"},{label:"إجمالي القيمة",value:money.format(summary.total),icon:Banknote,color:"text-emerald-600 bg-emerald-50"},{label:"قيد الاستحقاق",value:String(summary.due),icon:CalendarClock,color:"text-amber-600 bg-amber-50"},{label:"شيكات راجعة",value:String(summary.returned),icon:Undo2,color:"text-rose-600 bg-rose-50"}];return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(item=><Card key={item.label} className="overflow-hidden"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-xl font-black" dir="ltr">{item.value}</p></div><span className={`rounded-xl p-3 ${item.color}`}><item.icon className="h-5 w-5"/></span></CardContent></Card>)}</div>}

function ChequesTable({rows,selectedId,onSelect,onDetails,operations}:{rows:Cheque[];selectedId?:number;onSelect?:(row:Cheque)=>void;onDetails:(row:Cheque)=>void;operations?:boolean}){return <div className="overflow-auto rounded-2xl border bg-white shadow-sm dark:bg-slate-950"><table className="w-full min-w-[1180px] text-sm"><thead className="cheque-table-header sticky top-0 z-10 bg-slate-900 text-white"><tr>{["رقم الشيك","الحساب البنكي","صاحب الشيك / المستفيد","المبلغ","العملة","الاستحقاق","البنك والفرع","السند","الحالة",operations?"عملية":"تفاصيل"].map(title=><th key={title} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{title}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id} onClick={()=>onSelect?.(row)} onDoubleClick={()=>onDetails(row)} className={`cursor-pointer border-b transition hover:bg-cyan-50/70 dark:hover:bg-cyan-950/20 ${selectedId===row.id?"bg-cyan-100 ring-1 ring-inset ring-cyan-400 dark:bg-cyan-950/40":index%2?"bg-slate-50/70 dark:bg-slate-900/40":""}`}><td className="px-3 py-3 font-mono font-black text-cyan-700">{row.cheq_num||"—"}</td><td className="px-3 py-3"><div className="font-semibold">{row.bank_account_name||row.bank_account||"—"}</div><div className="text-xs text-muted-foreground" dir="ltr">{row.bank_account_code||row.bank_account||""}</div></td><td className="px-3 py-3"><div className="font-semibold">{row.customer_name||row.cheq_owner_name||"—"}</div><div className="text-xs text-muted-foreground">{row.customer_code||row.cheq_owner_name||""}</div></td><td className="px-3 py-3 font-black text-emerald-700" dir="ltr">{money.format(Number(row.amount||0))}</td><td className="px-3 py-3">{row.currency_code||row.currency_name||"—"}</td><td className="px-3 py-3" dir="ltr">{dateText(row.due_date)}</td><td className="px-3 py-3"><div>{row.bank_name||"—"}</div><div className="text-xs text-muted-foreground">{row.branch_name||""}</div></td><td className="px-3 py-3 font-mono">{row.vch_code||"—"}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(Number(row.status_id))}`}>{row.status_name||"—"}</span></td><td className="px-3 py-3"><Button size="sm" variant={selectedId===row.id?"default":"outline"} onClick={event=>{event.stopPropagation();operations?onSelect?.(row):onDetails(row)}} className="gap-1">{operations?<CheckCircle2 className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}{operations?"تنفيذ":"عرض"}</Button></td></tr>)}</tbody></table>{!rows.length&&<div className="py-16 text-center text-muted-foreground"><FileClock className="mx-auto mb-3 h-10 w-10 text-slate-300"/>لا توجد شيكات مطابقة للفلاتر</div>}</div>}

function DetailsDialog({ cheque, open, onOpenChange }: { cheque: Cheque | null; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [logs, setLogs] = useState<Log[]>([])
  const [currentCheque, setCurrentCheque] = useState<{ id: number; status_id: number; status_name: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || !cheque) return
    const controller = new AbortController()
    setLogs([])
    setCurrentCheque(null)
    setError("")
    setLoading(true)
    void (async () => {
      try {
        const response = await fetch(`/api/cheques/operations?cheque_id=${cheque.id}`, { cache: "no-store", signal: controller.signal })
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(data.error || "تعذر تحميل سجل عمليات الشيك")
        setLogs(data.logs || [])
        setCurrentCheque(data.cheque || null)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل سجل عمليات الشيك")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [open, cheque?.id])

  if (!cheque) return null
  const statusName = Number(currentCheque?.id) === Number(cheque.id) ? currentCheque?.status_name : cheque.status_name
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="max-h-[88vh] max-w-3xl overflow-y-auto">
      <DialogHeader className="cheque-page-header rounded-xl p-4">
        <DialogTitle className="flex items-center gap-2 text-xl"><span className="rounded-xl bg-cyan-100 p-2 text-cyan-700"><History className="h-5 w-5" /></span>تفاصيل الشيك رقم {cheque.cheq_num}</DialogTitle>
        <DialogDescription>بيانات الشيك وسجل العمليات الكامل</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:bg-slate-900">
        <Info label="المبلغ" value={`${money.format(Number(cheque.amount || 0))} ${cheque.currency_code || ""}`} />
        <Info label="الحالة" value={statusName} />
        <Info label="تاريخ الاستحقاق" value={dateText(cheque.due_date)} />
        <Info label="الحساب البنكي" value={cheque.bank_account_name || cheque.bank_account} />
        <Info label="العميل / المستفيد" value={cheque.customer_name || cheque.cheq_owner_name} />
        <Info label="السند المصدر" value={cheque.vch_code} />
      </div>
      <div>
        <h3 className="mb-3 font-bold">سجل العمليات</h3>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <div className="space-y-2">
          {logs.map(log => {
            const voucherType = Number(log.voucher_type)
            const voucherLabel = voucherType === 21 ? "سند صرف شيكات" : voucherType === 3 ? "سند القيد" : "السند"
            return <div key={log.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{log.operation_name}</b><span className="text-xs text-muted-foreground" dir="ltr">{String(log.operation_date).slice(0, 16).replace("T", " ")}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{log.previous_status_name || "—"} <ChevronLeft className="inline h-3 w-3" /> {log.new_status_name || "—"}{log.account_name && ` · ${log.account_code} - ${log.account_name}`}{log.user_name && ` · ${log.user_name}`}</div>
              {log.journal_voucher_code && <div className="mt-2 inline-flex gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                {voucherLabel}:
                {log.voucher_id && Number.isInteger(voucherType) && voucherType > 0
                  ? <VoucherLink id={Number(log.voucher_id)} type={voucherType} code={log.journal_voucher_code} />
                  : log.journal_voucher_code}
              </div>}
              {log.note && <p className="mt-2 text-sm">{log.note}</p>}
            </div>
          })}
          {!error && !logs.length && <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">لم تُنفذ عمليات على هذا الشيك بعد</p>}
        </div>}
      </div>
    </DialogContent>
  </Dialog>
}
function Info({label,value}:{label:string;value?:string}){return <div><span className="text-xs text-muted-foreground">{label}</span><p className="mt-1 font-semibold">{value||"—"}</p></div>}

function PageHeader({operations,type,setType}:{operations?:boolean;type:number;setType:(value:number)=>void}){return <div className={`cheque-page-header overflow-hidden rounded-3xl bg-gradient-to-l ${operations?"from-indigo-700 via-violet-700 to-fuchsia-700":"from-slate-950 via-cyan-950 to-emerald-800"} p-5 text-white shadow-xl sm:p-7`}><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="flex items-start gap-4"><span className="rounded-2xl bg-white/15 p-3 backdrop-blur">{operations?<ArrowLeftRight className="h-7 w-7"/>:<WalletCards className="h-7 w-7"/>}</span><div><h1 className="text-2xl font-black sm:text-3xl">{operations?"عمليات الشيكات":"الشيكات"}</h1><p className="mt-1 max-w-2xl text-sm text-white/75">{operations?"نفّذ عمليات الإيداع والإرجاع والتجيير وتغيير الاستحقاق مع حفظ سجل كامل لكل حركة.":"تابع الشيكات الواردة والصادرة، تواريخ الاستحقاق والحالة الحالية من مكان واحد."}</p></div></div><ChequeTypeTabs value={type} onChange={setType}/></div></div>}

function useCheques(type:number){const [meta,setMeta]=useState<Meta>(emptyMeta),[rows,setRows]=useState<Cheque[]>([]),[summary,setSummary]=useState<Summary>(emptySummary),[filters,setFilters]=useState<Filters>(initialFilters),[loading,setLoading]=useState(false),[error,setError]=useState("");const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch(`/api/cheques?${buildQuery(type,filters)}`),data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر تحميل الشيكات");setRows(data.rows||[]);setSummary(data.summary||emptySummary);setMeta(data.meta||emptyMeta)}catch(reason){setError(reason instanceof Error?reason.message:"تعذر تحميل الشيكات")}finally{setLoading(false)}},[type,filters]);useEffect(()=>{void load()},[type]);return{meta,rows,setRows,summary,filters,setFilters,loading,error,setError,load}}

export function ChequesPage(){const [type,setType]=useState(1),[details,setDetails]=useState<Cheque|null>(null);const state=useCheques(type);const exportCsv=()=>{const headers=["رقم الشيك","الحساب البنكي","العميل / المستفيد","المبلغ","العملة","الاستحقاق","البنك","الفرع","رقم السند","الحالة"],lines=state.rows.map(r=>[r.cheq_num,r.bank_account_name||r.bank_account,r.customer_name||r.cheq_owner_name,r.amount,r.currency_code||r.currency_name,dateText(r.due_date),r.bank_name,r.branch_name,r.vch_code,r.status_name]),blob=createChequeCsvBlob([headers,...lines]),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`cheques-${type}-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(a.href),1000)};return <main dir="rtl" className="min-h-full space-y-4 bg-slate-50/70 p-3 sm:p-5 dark:bg-slate-950"><PageHeader type={type} setType={value=>{setType(value);setDetails(null)}}/><FiltersPanel {...state} onSearch={state.load}/>{state.error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{state.error}</div>}<div className="flex flex-wrap items-center justify-between gap-2"><SummaryCards summary={state.summary}/><Button variant="outline" onClick={exportCsv} disabled={!state.rows.length} className="gap-2"><Download className="h-4 w-4"/>تصدير CSV</Button></div><ChequesTable rows={state.rows} onDetails={row=>setDetails(row)}/><DetailsDialog cheque={details} open={Boolean(details)} onOpenChange={open=>!open&&setDetails(null)}/></main>}

export function ChequeOperationsPage() {
  const [type, setType] = useState(1)
  const [selected, setSelected] = useState<Cheque | null>(null)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [operationDate, setOperationDate] = useState(today())
  const [newDueDate, setNewDueDate] = useState("")
  const [accountId, setAccountId] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [operationOpen, setOperationOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const operationMessagesRef = useRef<any>(null)
  const state = useCheques(type)
  const available = selected?.allowed_operations || []
  const accountOptions = useMemo(
    () => operation?.accountKind === "bank" ? state.meta.bank_accounts : state.meta.accounts,
    [operation, state.meta],
  )

  const resetOperationFields = useCallback(() => {
    setOperation(null)
    setOperationDate(today())
    setNewDueDate("")
    setAccountId("")
    setNote("")
    operationMessagesRef.current?.clear?.()
  }, [])

  useEffect(() => {
    setSelected(null)
    setOperationOpen(false)
    resetOperationFields()
  }, [type, resetOperationFields])

  const openOperation = (cheque: Cheque) => {
    setSelected(cheque)
    resetOperationFields()
    setOperationOpen(true)
  }

  const showOperationMessage = (severity: "success" | "error", detail: string) => {
    operationMessagesRef.current?.clear?.()
    operationMessagesRef.current?.show?.([{ severity, summary: "", detail, sticky: true }])
  }

  const execute = async () => {
    if (!selected || !operation) return
    setSaving(true)
    operationMessagesRef.current?.clear?.()
    try {
      const response = await fetch("/api/cheques/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cheque_id: selected.id,
          operation_code: operation.code,
          operation_date: operationDate,
          new_due_date: newDueDate || null,
          account_id: accountId === "" ? null : Number(accountId),
          note,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية")

      setSelected(current => current ? { ...current, ...data.cheque } : data.cheque)
      setOperation(null)
      setNewDueDate("")
      setAccountId("")
      setNote("")
      showOperationMessage("success", data.message || "تم تنفيذ عملية الشيك بنجاح")
      await state.load()
    } catch (reason) {
      showOperationMessage("error", reason instanceof Error ? reason.message : "تعذر تنفيذ العملية")
    } finally {
      setSaving(false)
    }
  }

  return <main dir="rtl" className="min-h-full space-y-4 bg-slate-50/70 p-3 sm:p-5 dark:bg-slate-950">
    <PageHeader operations type={type} setType={setType}/>
    <FiltersPanel {...state} onSearch={state.load}/>
    {state.error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{state.error}</div>}
    <ChequesTable
      rows={state.rows}
      selectedId={selected?.id}
      onSelect={openOperation}
      onDetails={row => { setSelected(row); setDetailsOpen(true) }}
      operations
    />

    <Dialog open={operationOpen} onOpenChange={open => { setOperationOpen(open); if (!open) resetOperationFields() }}>
      <DialogContent dir="rtl" className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="cheque-page-header shrink-0 bg-gradient-to-l from-indigo-800 via-violet-700 to-fuchsia-700 px-5 py-5 text-white">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="rounded-xl bg-white/15 p-2"><Activity className="h-5 w-5"/></span>
            تنفيذ عملية على الشيك #{selected?.cheq_num}
          </DialogTitle>
          <DialogDescription className="text-violet-100">تظهر العمليات المسموحة فقط وفق حالة الشيك الحالية.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <Messages innerRef={operationMessagesRef}/>
          {selected && <>
            <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-3 dark:bg-slate-900">
              <Info label="حالة الشيك" value={selected.status_name}/>
              <Info label="صاحب الشيك / المستفيد" value={selected.customer_name || selected.cheq_owner_name}/>
              <Info label="المبلغ" value={`${money.format(Number(selected.amount || 0))} ${selected.currency_code || ""}`}/>
              <Info label="تاريخ الاستحقاق" value={dateText(selected.due_date)}/>
              <Info label="البنك" value={selected.bank_name}/>
              <Info label="الحساب الحالي" value={selected.current_account_name || selected.bank_account_name || selected.bank_account}/>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-black">العمليات المتاحة</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map(item => <button
                  type="button"
                  key={item.code}
                  onClick={() => { setOperation(item); setAccountId(""); setNewDueDate(""); operationMessagesRef.current?.clear?.() }}
                  className={`flex items-center justify-between rounded-xl border p-3 text-right text-sm font-bold transition ${operation?.code === item.code ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100" : "hover:border-violet-300 hover:bg-violet-50/50"}`}
                >
                  <span className="flex items-center gap-2">{item.name}{item.createsJournal&&<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">سند قيد</span>}</span><ChevronLeft className="h-4 w-4"/>
                </button>)}
              </div>
              {!available.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد عمليات متاحة لحالة هذا الشيك.</p>}
            </section>

            {operation && <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-violet-100 p-3 text-sm font-black text-violet-900 dark:bg-violet-900 dark:text-violet-100"><span>{operation.name}</span>{operation.createsJournal&&<span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] text-white">سيُنشأ سند قيد مرحّل</span>}</div>
              <Field label="تاريخ العملية" type="date" value={operationDate} onChange={setOperationDate}/>
              {operation.needsDate && <Field label="تاريخ الاستحقاق الجديد" type="date" value={newDueDate} onChange={setNewDueDate}/>}
              {operation.needsAccount && <div>
                <Label>{operation.accountKind === "bank" ? "حساب البنك" : "الحساب الجديد"}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1 bg-white dark:bg-slate-950"><SelectValue placeholder="اختر الحساب"/></SelectTrigger>
                  <SelectContent>{accountOptions.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.code ? `${option.code} - ` : ""}{option.name}{option.bank_name ? ` · ${option.bank_name}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              <div><Label>ملاحظة العملية</Label><Input className="mt-1 bg-white dark:bg-slate-950" value={note} onChange={event => setNote(event.target.value)} placeholder="ملاحظة اختيارية..."/></div>
              <Button onClick={execute} disabled={saving || (operation.needsDate && !newDueDate) || (operation.needsAccount && !accountId)} className="w-full gap-2 bg-violet-700 hover:bg-violet-800">
                {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}تنفيذ العملية
              </Button>
            </section>}

            <Button variant="outline" className="w-full gap-2" onClick={() => setDetailsOpen(true)}><History className="h-4 w-4"/>عرض سجل عمليات الشيك</Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>

    <DetailsDialog cheque={selected} open={detailsOpen} onOpenChange={setDetailsOpen}/>
  </main>
}
