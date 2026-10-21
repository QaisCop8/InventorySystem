"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import {useCallback,useEffect,useRef,useState,type KeyboardEvent} from "react"
import {BadgeDollarSign,Building2,CreditCard,Edit3,Package,Plus,RefreshCw,Save,Store,Trash2,Users,X} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Switch} from "@/components/ui/switch"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import {normalizePosPointUsers,togglePosPointUser} from "@/lib/pos-point-users"
import {PosDialogMessages} from "./pos-dialog-messages"
import {LicenseUsageStrip,useCompanyLicense,useLicenseRequestDialog} from "@/components/settings/license-limit"
import {ReportMultiChoice} from "@/components/reports/account-statement-report"

// طباعة الفواتير في الكاشير — اختيار واحد فقط
const INVOICE_PRINT_OPTIONS=[{id:0,name:"عدم الطباعة"},{id:1,name:"طباعة فاتورة كاملة"},{id:2,name:"طباعة فاتورة QR"}]
const printModeOf=(point:any)=>point?.invoice_print_mode!=null?Number(point.invoice_print_mode):point?.print_invoices?1:0

type Option={id:number;code?:string;name:string;currency_id?:number}
type Meta={branches:Option[];warehouses:Option[];currencies:Option[];books:Option[];accounts:Option[];users:{user_id:string;name:string}[];priceCategories:Option[]}
type Point=Record<string,any>&{id:number;code:string;name:string;users:any[]}
const empty={code:"",name:"",branch_id:"",main_warehouse_id:"",currency_id:"",sales_book_id:"",return_book_id:"",cash_account_id:"",walk_in_account_id:"",card_account_id:"",cheque_account_id:"",gift_account_id:"",tax_account_id:"",return_account_id:"",price_category_id:"",max_discount_percent:100,allow_offline:true,allow_returns:true,allow_gifts:true,print_invoices:false,invoice_print_mode:0,item_grouping_mode:"on_entry",print_by_item_group:false,tobacco_custody:false,users:[] as any[]}

function Field({label,children}:any){return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}</div>}
function SelectField({value,onChange,options,placeholder="اختر..."}:any){return <select value={value??""} onChange={e=>onChange(e.target.value)} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"><option value="">{placeholder}</option>{options.map((x:any)=><option key={x.id??x.user_id} value={x.id??x.user_id}>{x.code?`${x.code} — `:""}{x.name}</option>)}</select>}

export default function PosPointsSettings(){
 const [points,setPoints]=useState<Point[]>([]),[meta,setMeta]=useState<Meta>({branches:[],warehouses:[],currencies:[],books:[],accounts:[],users:[],priceCategories:[]}),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState<any>(empty),[message,setMessage]=useState("")
 const nameRef=useRef<HTMLInputElement>(null)
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/pos/points?meta=1",{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error);setPoints(d.points||[]);setMeta(d.meta||meta)}catch(e){setMessage(e instanceof Error?e.message:"تعذر التحميل")}finally{setLoading(false)}},[])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{
  if(!open||form.id)return
  const controller=new AbortController()
  void (async()=>{
   try{
    const response=await fetch("/api/pos/points?next-code=1",{cache:"no-store",signal:controller.signal}),data=await response.json()
    if(!response.ok)throw new Error(data.error||"تعذر توليد رمز نقطة البيع")
    if(!controller.signal.aborted)setForm((current:any)=>({...current,code:data.code}))
   }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"تعذر توليد رمز نقطة البيع")}
  })()
  return ()=>controller.abort()
 },[open,form.id])
 const handleEnterAsTab=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.key!=="Enter"||event.defaultPrevented||event.nativeEvent.isComposing||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return
  const target=event.target as HTMLElement
  if(!event.currentTarget.contains(target)||!["INPUT","SELECT"].includes(target.tagName)&&target.getAttribute("role")!=="switch")return
  const fields=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]):not([readonly]):not([type="hidden"]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),button[role="switch"]:not([disabled]),button[data-enter-tab-stop]:not([disabled])')).filter(field=>field.tabIndex>=0&&field.getClientRects().length>0)
  const index=fields.indexOf(target),next=fields[index+1]
  if(index<0||!next)return
  event.preventDefault()
  event.stopPropagation()
  next.focus()
  if(next instanceof HTMLInputElement&&!["checkbox","radio","date"].includes(next.type))next.select()
 }
 const handleEmptyAccountEnter=(event:KeyboardEvent<HTMLDivElement>)=>{
  const target=event.target as HTMLElement
  // Empty optional accounts can be skipped; typed accounts keep their lookup action.
  if(target instanceof HTMLInputElement&&!target.value.trim()&&target.closest("[data-pos-account-field]"))handleEnterAsTab(event)
 }
 // ترخيص الشركة: عدد نقاط البيع المسموح به (0 افتراضياً) — بلوغه يفتح نافذة طلب الزيادة بدل نموذج الإضافة
 const {license,reload:reloadLicense}=useCompanyLicense()
 const licenseRequest=useLicenseRequestDialog(()=>void reloadLicense())
 const posLimitReached=!!license&&license.usage.pos_points>=license.limits.pos_points
 const edit=(point?:Point)=>{if(!point&&license&&posLimitReached){licenseRequest.open("pos_points",`تم الوصول للحد المرخّص من نقاط البيع (${license.usage.pos_points} من ${license.limits.pos_points}).`,license.pending.some(request=>request.resource==="pos_points"));return}setForm(point?{...empty,...point,users:normalizePosPointUsers(point.users)}:{...empty,price_category_id:meta.priceCategories[0]?.id?String(meta.priceCategories[0].id):""});setMessage("");setOpen(true)}
 const save=async()=>{setSaving(true);setMessage("");try{const r=await fetch("/api/pos/points",{method:form.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)}),d=await r.json();if(!r.ok){if(licenseRequest.handleLimit(d)){setOpen(false);return}throw new Error(d.error)}setOpen(false);await load();void reloadLicense()}catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ")}finally{setSaving(false)}}
 const remove=async(point:Point)=>{if(!(await confirmYesNo(`حذف نقطة البيع ${point.name}؟`)))return;const r=await fetch("/api/pos/points",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:point.id,status:3})});const d=await r.json();if(!r.ok)setMessage(d.error||"تعذر الحذف");else{await load();void reloadLicense()}}
 const account=(key:string,label:string)=>(
  <div data-pos-account-field><AutoCompleteAccount
   label={label}
   value={String(form[key]??"")}
   valueMode="id"
   onValueChange={value=>setForm((current:any)=>({...current,[key]:value}))}
   placeholder="اختياري — الحساب الافتراضي"
   leafOnly
   showCostCenterButton={false}
   showCostCenterDialog={false}
  /></div>
 )
 return <div dir="rtl" className="min-h-full w-full bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-3 sm:p-6">
    <div className="w-full space-y-5">
     <header className="relative overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-l from-emerald-700 via-teal-600 to-cyan-600 p-6 text-white shadow-xl shadow-emerald-900/10"><div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl"/><div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/25"><Store/></div><div><p className="text-xs font-bold text-emerald-100">نظام البيع بالتجزئة</p><h1 className="text-2xl font-black">إعداد نقاط البيع</h1><p className="mt-1 text-sm text-emerald-50/80">مستودع وحسابات ودفاتر وصلاحيات مستقلة لكل نقطة</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void load()} className="border-white/30 bg-white/10 text-white hover:bg-white/20"><RefreshCw className="ml-2 h-4 w-4"/>تحديث</Button><Button onClick={()=>edit()} className="bg-white font-black text-emerald-700 hover:bg-emerald-50"><Plus className="ml-2 h-4 w-4"/>نقطة جديدة</Button></div></div></header>{licenseRequest.element}<div className="mb-4"><LicenseUsageStrip resource="pos_points" license={license} onRequest={()=>licenseRequest.open("pos_points")}/></div>
   <PosDialogMessages error={message} open={!open}/>
   {loading?<div className="grid h-64 place-items-center"><RefreshCw className="animate-spin text-emerald-600"/></div>:points.length?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{points.map(p=><article key={p.id} className="group overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="h-1.5 bg-gradient-to-l from-emerald-400 to-cyan-500"/><div className="p-5"><div className="flex items-start justify-between"><div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{p.code}</span><h2 className="mt-3 text-xl font-black">{p.name}</h2></div><div className="flex gap-1"><button onClick={()=>edit(p)} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"><Edit3 className="h-4 w-4"/></button><button onClick={()=>void remove(p)} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></div><div className="mt-5 grid grid-cols-2 gap-2 text-sm"><div className="rounded-2xl bg-slate-50 p-3"><Building2 className="mb-2 h-4 w-4 text-indigo-500"/><span className="text-xs text-slate-400">الفرع</span><p className="truncate font-bold">{p.branch_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><Package className="mb-2 h-4 w-4 text-amber-500"/><span className="text-xs text-slate-400">المستودع</span><p className="truncate font-bold">{p.warehouse_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><BadgeDollarSign className="mb-2 h-4 w-4 text-emerald-600"/><span className="text-xs text-slate-400">العملة</span><p className="truncate font-bold">{p.currency_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><Users className="mb-2 h-4 w-4 text-cyan-600"/><span className="text-xs text-slate-400">الكاشير</span><p className="font-bold">{p.users?.length||"كل المستخدمين"}</p></div></div></div></article>)}</div>:<div className="grid h-72 place-items-center rounded-3xl border border-dashed bg-white text-center"><div><Store className="mx-auto h-12 w-12 text-slate-300"/><h2 className="mt-3 font-black">لم تُعرّف نقاط بيع بعد</h2><Button onClick={()=>edit()} className="mt-4">إضافة أول نقطة بيع</Button></div></div>}
  </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent hideCloseButton onOpenAutoFocus={event=>{event.preventDefault();nameRef.current?.focus();nameRef.current?.select()}} onKeyDown={handleEnterAsTab} onKeyDownCapture={handleEmptyAccountEnter} className="flex h-[min(92dvh,850px)] max-h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"><div className="z-10 flex shrink-0 items-start justify-between gap-4 bg-gradient-to-l from-emerald-700 to-teal-600 p-4 pr-5 text-white sm:p-5"><DialogHeader className="min-w-0 text-right"><DialogTitle className="text-lg sm:text-xl">{form.id?"تعديل نقطة البيع":"إضافة نقطة بيع"}</DialogTitle><DialogDescription className="text-emerald-50/80"> هذه الإعدادات تُفرض على الكاشير عند البيع والمردود.</DialogDescription></DialogHeader><button type="button" aria-label="إغلاق" onClick={()=>setOpen(false)} className="shrink-0 rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-4 w-4"/></button></div><div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
   <PosDialogMessages error={message} open={open}/>
   <section><h3 className="mb-3 font-black">التعريف والمستودع</h3><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4"><Field label="رمز نقطة البيع"><Input value={form.code} readOnly tabIndex={-1} placeholder="يُولّد تلقائياً" className="bg-slate-100 font-mono" dir="ltr"/></Field><Field label="اسم نقطة البيع *"><Input ref={nameRef} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="الفرع *"><SelectField value={form.branch_id} onChange={(v:string)=>setForm({...form,branch_id:v})} options={meta.branches}/></Field><Field label="المستودع *"><SelectField value={form.main_warehouse_id} onChange={(v:string)=>setForm({...form,main_warehouse_id:v})} options={meta.warehouses}/></Field><Field label="العملة *"><SelectField value={form.currency_id} onChange={(v:string)=>setForm({...form,currency_id:v})} options={meta.currencies}/></Field><Field label="فئة السعر *"><SelectField value={form.price_category_id} onChange={(value:string)=>setForm({...form,price_category_id:value})} options={meta.priceCategories} placeholder="اختر فئة السعر"/></Field></div></section>
  <section className="rounded-2xl bg-slate-50 p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><CreditCard className="h-5 w-5 text-emerald-600"/>الدفاتر والحسابات</h3><p className="mb-4 text-xs leading-6 text-slate-500">جميع الحسابات اختيارية. عند ترك الحساب فارغاً يُستخدم حساب المستخدم لعملة النقطة أو إعداد النظام الافتراضي.</p><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4"><Field label="دفتر فواتير البيع *"><SelectField value={form.sales_book_id} onChange={(v:string)=>setForm({...form,sales_book_id:v})} options={meta.books}/></Field><Field label="دفتر المردود"><SelectField value={form.return_book_id} onChange={(v:string)=>setForm({...form,return_book_id:v})} options={meta.books}/></Field>{account("cash_account_id","حساب الصندوق")}{account("walk_in_account_id","الحساب النقدي")}{account("card_account_id","حساب البطاقات")}{account("cheque_account_id","حساب الشيكات")}{account("gift_account_id","حساب بطاقات الهدايا")}{account("tax_account_id","حساب الضريبة")}</div></section>
  <section><h3 className="mb-3 font-black">السياسات والكاشير</h3><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4"><Field label="أقصى خصم %"><Input type="number" min="0" max="100" value={form.max_discount_percent} onChange={e=>setForm({...form,max_discount_percent:e.target.value})}/></Field><div className="space-y-2">{[["allow_offline","العمل دون اتصال"],["allow_returns","السماح بالمردودات"],["allow_gifts","السماح بالهدايا"]].map(([k,l])=><label key={k} className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm font-bold"><span>{l}</span><Switch checked={Boolean(form[k])} onCheckedChange={v=>setForm({...form,[k]:v})}/></label>)}</div><div className="min-w-0"><ReportMultiChoice label="طباعة الفواتير" options={INVOICE_PRINT_OPTIONS} selected={[printModeOf(form)]} onChange={ids=>{const mode=ids.length?Number(ids[ids.length-1]):printModeOf(form);setForm({...form,invoice_print_mode:mode,print_invoices:mode>0})}} placeholder="عدم الطباعة"/><p className="mt-1 text-xs text-slate-400">{printModeOf(form)===2?"يُطبع رمز QR فقط يحمل كل بيانات الفاتورة عند مسحه.":printModeOf(form)===1?"تُطبع الفاتورة كاملة بعد كل حفظ.":"لا تُطبع الفاتورة بعد الحفظ."}</p></div><div className="col-span-full min-w-0"><Label>المستخدمون المسموحون</Label><p className="mb-2 text-xs text-slate-400">اترك الجميع دون تحديد لإتاحة النقطة لكل مستخدمي الفرع.</p><div className="grid max-h-40 gap-2 overflow-y-auto rounded-xl border bg-white p-3 sm:grid-cols-2">{meta.users.map(u=>{const checked=form.users.some((x:any)=>String(x.user_id??x)===String(u.user_id));return <label key={u.user_id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={e=>{const checked=e.target.checked;setForm((current:any)=>({...current,users:togglePosPointUser(current.users,u.user_id,checked)}))}}/><span className="text-sm">{u.name}</span></label>})}</div></div></div></section>
   <section className="rounded-2xl bg-slate-50 p-4"><h3 className="mb-3 font-black">الأصناف والطباعة</h3><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="pos-item-grouping">تجميع الاصناف</Label><select id="pos-item-grouping" value={form.item_grouping_mode} onChange={e=>setForm({...form,item_grouping_mode:e.target.value})} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"><option value="none">عدم التجميع</option><option value="on_entry">تجميع عند الادخال</option><option value="on_print">تجميع عند الطباعة</option></select></div><label className="flex items-center gap-3 self-end rounded-xl border bg-white p-3 text-sm font-bold"><input type="checkbox" checked={Boolean(form.print_by_item_group)} onChange={e=>setForm({...form,print_by_item_group:e.target.checked})} className="h-4 w-4 accent-emerald-600"/><span>طباعة حسب مجموعة الصنف</span></label><label className="flex items-center gap-3 self-end rounded-xl border bg-white p-3 text-sm font-bold"><input type="checkbox" checked={Boolean(form.tobacco_custody)} onChange={e=>setForm({...form,tobacco_custody:e.target.checked})} className="h-4 w-4 accent-emerald-600"/><span>يوجد عهدة دخان<small className="block text-xs font-normal text-muted-foreground">يستلم الكاشير كميات أصناف الدخان مع العهدة ويسلّم المتبقي قبل تسليمها</small></span></label></div></section>
  </div><DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-white p-3 sm:p-4"><Button variant="outline" onClick={()=>setOpen(false)}>إلغاء</Button><Button data-enter-tab-stop disabled={saving} onClick={()=>void save()} className="bg-emerald-600 hover:bg-emerald-700">{saving?<RefreshCw className="ml-2 h-4 w-4 animate-spin"/>:<Save className="ml-2 h-4 w-4"/>}حفظ الإعداد</Button></DialogFooter></DialogContent></Dialog>
 </div>
}
