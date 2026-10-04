"use client"

import {useEffect, useRef, useState} from "react"
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {PosDialogMessages} from "./pos-dialog-messages"
import {Clock3, HandCoins} from "lucide-react"

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
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}><DialogContent dir="rtl" className="pos-start-session-dialog max-h-[90dvh] max-w-3xl overflow-y-auto border-slate-300 p-0 shadow-[0_28px_80px_-28px_rgba(15,23,42,.55)] dark:border-slate-700" onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus();input.current?.select()}} onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}} onKeyDown={e=>{if(e.key==="F3"){e.preventDefault();e.stopPropagation();if(!e.repeat)confirm()}}}>
    <DialogHeader className="border-b border-[#6967c4] bg-gradient-to-l from-[#262653] via-[#433b91] to-[#5950b2] px-6 py-5 text-right text-white"><div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/30 bg-white/15 text-white"><HandCoins className="size-5"/></span><div><DialogTitle className="text-lg font-bold text-white">استلام العهدة</DialogTitle><DialogDescription className="mt-1 text-xs text-indigo-100">لا توجد عهدة مفتوحة للمستخدم الحالي. افتح وردية أو استلم عهدة مسلّمة.</DialogDescription></div><span className="mr-auto hidden items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs text-indigo-100 sm:flex"><Clock3 className="size-4 text-white"/>{date.toLocaleTimeString("en-GB")}</span></div></DialogHeader>
    <style jsx global>{`
        .pos-start-session-dialog section {
            border: 1px solid #cbd5e1 !important;
            border-radius: 8px !important;
            background: #fff !important;
            padding: 16px !important;
            box-shadow: none !important;
        }
        .dark .pos-start-session-dialog section { border-color: #334155 !important; background: #020617 !important; }
        .pos-start-session-dialog section h3 {
            border-color: #cbd5e1 !important;
            color: #0f172a !important;
            font-size: 13px;
        }
        .dark .pos-start-session-dialog section h3 { border-color: #334155 !important; color: #f8fafc !important; }
        .pos-start-session-dialog section input {
            min-height: 42px;
            border-color: #cbd5e1;
            border-radius: 6px;
            background: #f8fafc;
            font-variant-numeric: tabular-nums;
        }
        .pos-start-session-dialog section input:focus-visible { border-color: #5146b9; box-shadow: 0 0 0 2px rgb(81 70 185 / 18%); }
        .dark .pos-start-session-dialog section input { border-color: #475569; background: #0b1220; }
        .pos-start-session-dialog [role="radio"] { border-radius: 7px !important; border-color: #cbd5e1 !important; background: #fff !important; }
        .pos-start-session-dialog [role="radio"][aria-checked="true"] { border-color: #5146b9 !important; background: #eeecff !important; box-shadow: inset 3px 0 #5146b9; }
        .dark .pos-start-session-dialog [role="radio"] { border-color: #334155 !important; background: #0f172a !important; }
        .dark .pos-start-session-dialog [role="radio"][aria-checked="true"] { border-color: #8b82e8 !important; background: #302d57 !important; box-shadow: inset 3px 0 #8b82e8; }
        .pos-start-session-dialog > div:last-child { border-top: 1px solid #cbd5e1; padding-top: 16px; }
        .dark .pos-start-session-dialog > div:last-child { border-color: #334155; }
        .pos-start-session-dialog .pos-start-confirm { border-radius: 6px; background: #5146b9; color: #fff; }
        .pos-start-session-dialog .pos-start-confirm:hover { background: #433b91; }
        .pos-start-session-dialog .pos-start-cancel { border-radius: 6px; border-color: #cbd5e1; background: #fff; color: #334155; }
        .dark .pos-start-session-dialog .pos-start-confirm { background: #655bc9; color: #fff; }
        .dark .pos-start-session-dialog .pos-start-confirm:hover { background: #5146b9; }
        .dark .pos-start-session-dialog .pos-start-cancel { border-color: #475569; background: #0f172a; color: #e2e8f0; }
        @media (max-width: 639px) {
            .pos-start-session-dialog [class*="grid-cols-[1fr_1fr_1fr_1fr]"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
    `}</style>
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
    <DialogFooter className="justify-center gap-3"><Button className="pos-start-confirm" disabled={!valid} onClick={confirm}>{busy?"جاري الحفظ…":"موافق F3"}</Button><Button className="pos-start-cancel" variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>إغلاق Esc</Button></DialogFooter>
 </DialogContent></Dialog>
}
