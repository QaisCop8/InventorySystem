"use client"

import { tr, appDir } from "@/lib/i18n"
import {useEffect, useRef, useState} from "react"
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {PosDialogMessages} from "./pos-dialog-messages"
import {Check, Clock3, HandCoins, X} from "lucide-react"
import "./pos-custody.css"

type Props = {
 open:boolean; onOpenChange:(open:boolean)=>void; userName:string; currency:string;
 error?:string; amount:number; onAmountChange:(amount:number)=>void; busy:boolean; online:boolean;
 currencies:Array<{currency_id:number;currency_code:string;currency_name:string;rate_to_point:number}>;
 amounts:Record<number,number>; onCurrencyAmountChange:(currencyId:number,amount:number)=>void;
 pending:Array<{id:number; shift_guid?:string; from_user_name?:string; handover_amount:number; currency_code?:string; currency_name?:string;currency_amounts?:Array<{currency_code:string;amount:number}>}>;
 activeShift?:{id:number;shift_guid?:string;user_name?:string}|null;
 onConfirm:(sourceId?:number,shiftGuid?:string)=>void;
}

const createShiftGuid=()=>{
 const bytes=new Uint8Array(16)
 if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes)
 else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256)
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
 const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

export function PosStartSessionDialog({open,onOpenChange,userName,currency,amount,onAmountChange,busy,online,pending,activeShift,onConfirm,error,currencies,amounts,onCurrencyAmountChange}:Props){
 const [date,setDate]=useState(()=>new Date()),[sourceId,setSourceId]=useState<number|null>(null),[shiftGuid,setShiftGuid]=useState("")
 const [amountDrafts,setAmountDrafts]=useState<Record<number,string>>({})
 const input=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(open){setDate(new Date());setSourceId(null);setShiftGuid(globalThis.crypto?.randomUUID?.()||createShiftGuid());setAmountDrafts(Object.fromEntries(currencies.map(row=>[row.currency_id,String(amounts[row.currency_id]??0)])))}},[open])
 const valid=online&&!busy&&!activeShift&&!!shiftGuid&&(pending.length>0?sourceId!==null:currencies.length>0&&currencies.every(row=>Number.isFinite(amounts[row.currency_id]||0)&&(amounts[row.currency_id]||0)>=0))
 const confirm=()=>{if(valid)onConfirm(sourceId??undefined,shiftGuid)}
 const handleKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(event.key==="F3"){event.preventDefault();event.stopPropagation();if(!event.repeat)confirm();return}
  if(event.key!=="Enter"||event.altKey||event.ctrlKey||event.metaKey)return
  const target=event.target
  if(!(target instanceof HTMLInputElement||target instanceof HTMLSelectElement)||target.disabled||(target instanceof HTMLInputElement&&target.readOnly))return
  const fields=Array.from(event.currentTarget.querySelectorAll<HTMLInputElement|HTMLSelectElement>(
   'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled])',
  )).filter(field=>field.offsetWidth>0||field.offsetHeight>0)
  const index=fields.indexOf(target)
  if(index<0)return
  event.preventDefault()
  const next=fields[index+1]
  if(next)next.focus()
  else event.currentTarget.querySelector<HTMLButtonElement>("[data-enter-tab-confirm]:not([disabled])")?.focus()
 }
 const total=currencies.reduce((sum,row)=>sum+(amounts[row.currency_id]||0)*row.rate_to_point,0)
 const setDraft=(currencyId:number,value:string)=>{setAmountDrafts(current=>({...current,[currencyId]:value}));if(value===""||value===".")onCurrencyAmountChange(currencyId,0);else{const parsed=Number(value);if(Number.isFinite(parsed)&&parsed>=0)onCurrencyAmountChange(currencyId,parsed)}}
 // بنمط شاشة الكاشير "Floating dock" — pos-custody.css
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}><DialogContent dir={appDir()} className="pos-custody flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0" onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus();input.current?.select()}} onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}} onKeyDown={handleKeyDown}>
  <DialogHeader className="pc-head shrink-0"><div className="pc-head-row"><span className="pc-brand"><HandCoins/></span><div className="min-w-0"><span className="pc-eyebrow">{tr("العهدة")}</span><DialogTitle className="pc-title">{tr("استلام العهدة")}</DialogTitle><DialogDescription className="pc-desc">{tr("لا توجد عهدة مفتوحة للمستخدم الحالي. افتح وردية أو استلم عهدة مسلّمة.")}</DialogDescription></div><span className="pc-chip max-sm:hidden"><Clock3/>{date.toLocaleTimeString("en-GB")}</span></div></DialogHeader>
  <div className="pc-body min-h-0 flex-1 overflow-y-auto">
   <PosDialogMessages error={error} open={open}/>
   {activeShift&&<p role="alert" className="pc-alert">{tr("توجد وردية مفتوحة بالفعل على نقطة البيع")}{activeShift.user_name?tr(" باسم {0}", activeShift.user_name):""}{tr(". يجب إغلاقها أو تسليم عهدتها قبل فتح وردية جديدة.")}</p>}
   <section className="pc-card"><h3 className="pc-card-title">{tr("بيانات الوردية")}</h3><div className="pc-card-body"><div className="pc-facts">
    <div className="pc-fact"><span>{tr("تاريخ الوردية")}</span><strong dir="ltr" className="text-start">{date.toLocaleDateString("en-GB")}</strong></div>
    <div className="pc-fact"><span>{tr("الساعة")}</span><strong dir="ltr" className="text-start">{date.toLocaleTimeString("en-GB")}</strong></div>
    <div className="pc-fact"><span>{tr("موظف البيع")}</span><strong>{userName||"—"}</strong></div>
    <div className="pc-fact"><span>{tr("رقم الوردية")}</span><strong dir="ltr" className="text-start" title={shiftGuid}>{shiftGuid}</strong></div>
   </div></div></section>
   <section className="pc-card"><h3 className="pc-card-title">{pending.length>0?tr("العهدة المطلوب استلامها حسب العملة"):tr("رصيد بداية الوردية")}</h3><div className="pc-card-body">
    {pending.length>0?<div role="radiogroup" aria-label={tr("اختر العهدة المطلوب استلامها")} className="pc-rows">{pending.map(row=><button key={row.id} type="button" role="radio" aria-checked={sourceId===row.id} disabled={busy} onClick={()=>setSourceId(row.id)} className="pc-option sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
      <span className="flex items-center gap-3"><span className="pc-dot"/><span className="pc-cur">{row.currency_name||currency}<small>{row.currency_code||""}</small></span></span>
      <span className="pc-strong text-start" dir="ltr">{Number(row.handover_amount).toFixed(2)}<small className="pc-num block">{(row.currency_amounts||[]).filter(item=>Number(item.amount)>0).map(item=>`${item.amount} ${item.currency_code}`).join(" · ")}</small></span>
      <span className="pc-cur">{row.from_user_name||"—"}<small>{tr("عهدة رقم ")}{row.shift_guid||row.id}</small></span>
     </button>)}</div>
    :<div className="pc-rows">
     <div className="pc-rows-head pc-cols-4 max-sm:hidden"><span>{tr("العملة")}</span><span>{tr("المبلغ")}</span><span>{tr("سعر الصرف")}</span><span>{tr("المقيّم")}</span></div>
     {currencies.map((row,index)=><div key={row.currency_id} className="pc-row pc-cols-4">
      <span className="pc-cur">{row.currency_code}<small>{row.currency_name}</small></span>
      <Input ref={index===0?input:undefined} aria-label={tr("مبلغ {0}", row.currency_code)} type="text" inputMode="decimal" dir="ltr" className="text-end" value={amountDrafts[row.currency_id]??String(amounts[row.currency_id]??0)} disabled={busy} onFocus={event=>event.currentTarget.select()} onChange={event=>setDraft(row.currency_id,event.target.value)} onBlur={()=>{const value=amountDrafts[row.currency_id]??"";if(value===""||value==="."){setAmountDrafts(current=>({...current,[row.currency_id]:"0"}));onCurrencyAmountChange(row.currency_id,0)}}}/>
      <span className="pc-num" dir="ltr">{Number(row.rate_to_point).toFixed(4)}</span>
      <span className="pc-strong" dir="ltr">{((amounts[row.currency_id]||0)*row.rate_to_point).toFixed(2)}</span>
     </div>)}
    </div>}
   </div></section>
   {pending.length===0&&currencies.length>0&&<div className="pc-total" aria-live="polite"><span className="pc-total-icon"><HandCoins/></span><div className="pc-total-item"><span>{tr("الإجمالي: ")}</span><strong dir="ltr">{total.toFixed(2)}</strong><span>{currency}</span></div></div>}
   {!online&&<p role="alert" className="pc-alert">{tr("فتح أو استلام العهدة يحتاج اتصالاً بالخادم.")}</p>}
  </div>
  <DialogFooter className="pc-foot sm:justify-center sm:space-x-0"><button type="button" data-enter-tab-confirm className="pc-confirm" disabled={!valid} onClick={confirm}><Check className="size-5"/>{busy?tr("جاري الحفظ…"):tr("موافق")}<kbd>F3</kbd></button><button type="button" className="pc-cancel" disabled={busy} onClick={()=>onOpenChange(false)}><X className="size-5"/>{tr("إغلاق")}<kbd>Esc</kbd></button></DialogFooter>
 </DialogContent></Dialog>
}
