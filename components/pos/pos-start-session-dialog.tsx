"use client"

import {useEffect, useRef, useState} from "react"
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {PosDialogMessages} from "./pos-dialog-messages"

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
 const input=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(open){setDate(new Date());setSourceId(null);setShiftGuid(globalThis.crypto?.randomUUID?.()||createShiftGuid())}},[open])
 const valid=online&&!busy&&!activeShift&&!!shiftGuid&&(pending.length>0?sourceId!==null:currencies.length>0&&currencies.every(row=>Number.isFinite(amounts[row.currency_id]||0)&&(amounts[row.currency_id]||0)>=0))
 const confirm=()=>{if(valid)onConfirm(sourceId??undefined,shiftGuid)}
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}><DialogContent dir="rtl" className="max-h-[90dvh] max-w-3xl overflow-y-auto" onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus();input.current?.select()}} onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}} onKeyDown={e=>{if(e.key==="F3"){e.preventDefault();e.stopPropagation();if(!e.repeat)confirm()}}}>
  <DialogHeader><DialogTitle>استلام العهدة</DialogTitle><DialogDescription>لا توجد عهدة مفتوحة للمستخدم الحالي على نقطة البيع. افتح وردية أو استلم عهدة مسلّمة.</DialogDescription></DialogHeader>
  <PosDialogMessages error={error} open={open}/>
  {activeShift&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">توجد وردية مفتوحة بالفعل على نقطة البيع{activeShift.user_name?` باسم ${activeShift.user_name}`:""}. يجب إغلاقها أو تسليم عهدتها قبل فتح وردية جديدة.</p>}
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">بيانات الوردية</h3><div className="grid grid-cols-2 gap-4">
   <div className="space-y-2"><Label>تاريخ الوردية</Label><Input readOnly value={date.toLocaleDateString("en-GB")} /></div>
   <div className="space-y-2"><Label>الساعة</Label><Input readOnly value={date.toLocaleTimeString("en-GB")} /></div>
   <div className="space-y-2"><Label>موظف البيع</Label><Input readOnly value={userName}/></div>
   <div className="space-y-2"><Label>رقم الوردية</Label><Input dir="ltr" readOnly value={shiftGuid}/></div>
  </div></section>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">رصيد بداية الوردية</h3>
   {pending.length>0?<div className="space-y-3"><Label>العهدة المطلوب استلامها حسب العملة</Label><div role="radiogroup" aria-label="اختر العهدة المطلوب استلامها" className="space-y-2"><div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 text-xs font-bold text-slate-500 sm:grid"><span>العملة</span><span>المبلغ</span><span>المسلّم</span></div>{pending.map(row=><button key={row.id} type="button" role="radio" aria-checked={sourceId===row.id} disabled={busy} onClick={()=>setSourceId(row.id)} className={`grid w-full gap-2 rounded-xl border p-4 text-right transition sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center ${sourceId===row.id?"border-emerald-500 bg-emerald-100 ring-1 ring-emerald-500":"bg-white hover:border-emerald-300"}`}><span className="flex items-center gap-2 font-bold"><span className={`h-4 w-4 rounded-full border-2 ${sourceId===row.id?"border-emerald-600 bg-emerald-600":"border-slate-400"}`}/>{row.currency_name||currency} <small className="text-slate-500">{row.currency_code||""}</small></span><strong dir="ltr" className="text-right">{Number(row.handover_amount).toFixed(2)}<small className="block font-normal">{(row.currency_amounts||[]).filter(item=>Number(item.amount)>0).map(item=>`${item.amount} ${item.currency_code}`).join(" · ")}</small></strong><span className="text-sm text-slate-600">{row.from_user_name||"—"} <small className="block text-slate-400">عهدة رقم {row.shift_guid||row.id}</small></span></button>)}</div></div>:<div className="space-y-3"><div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-2 text-xs font-bold text-slate-500"><span>العملة</span><span>المبلغ</span><span>سعر الصرف</span><span>المقيّم</span></div>{currencies.map((row,index)=><div key={row.currency_id} className="grid grid-cols-[1fr_1fr_1fr_1fr] items-center gap-2 rounded-xl border bg-white p-2"><span className="font-bold">{row.currency_code}<small className="block text-slate-500">{row.currency_name}</small></span><Input ref={index===0?input:undefined} aria-label={`مبلغ ${row.currency_code}`} type="number" min="0" step="0.01" value={amounts[row.currency_id]??0} disabled={busy} onChange={event=>onCurrencyAmountChange(row.currency_id,Number(event.target.value))}/><span dir="ltr">{Number(row.rate_to_point).toFixed(4)}</span><strong dir="ltr">{((amounts[row.currency_id]||0)*row.rate_to_point).toFixed(2)}</strong></div>)}<p className="text-left font-bold">الإجمالي: {currencies.reduce((sum,row)=>sum+(amounts[row.currency_id]||0)*row.rate_to_point,0).toFixed(2)} {currency}</p></div>}
  </section>
  {!online&&<p role="alert" className="text-sm text-amber-700">فتح أو استلام العهدة يحتاج اتصالاً بالخادم.</p>}
  <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>إغلاق Esc</Button><Button disabled={!valid} onClick={confirm}>{busy?"جاري الحفظ…":"موافق F3"}</Button></DialogFooter>
 </DialogContent></Dialog>
}
