"use client"

import {useEffect, useRef, useState} from "react"
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"

type Props = {
 open:boolean; onOpenChange:(open:boolean)=>void; userName:string; currency:string;
 error?:string; amount:number; onAmountChange:(amount:number)=>void; busy:boolean; online:boolean;
 pending:Array<{id:number; from_user_name?:string; handover_amount:number}>;
 onConfirm:(sourceId?:number)=>void;
}

export function PosStartSessionDialog({open,onOpenChange,userName,currency,amount,onAmountChange,busy,online,pending,onConfirm,error}:Props){
 const [date,setDate]=useState(()=>new Date()),[sourceId,setSourceId]=useState<number|null>(null)
 const input=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(open){setDate(new Date());setSourceId(null)}},[open])
 const valid=online&&!busy&&Number.isFinite(amount)&&amount>=0&&(!pending.length||sourceId!==null)
 const confirm=()=>{if(valid)onConfirm(sourceId??undefined)}
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}><DialogContent dir="rtl" className="max-w-lg" onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus();input.current?.select()}} onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}} onKeyDown={e=>{if(e.key==="F3"){e.preventDefault();e.stopPropagation();if(!e.repeat)confirm()}}}>
  <DialogHeader><DialogTitle>استلام عهدة</DialogTitle><DialogDescription>لا توجد عهدة مفتوحة للمستخدم الحالي على نقطة البيع. افتح وردية أو استلم عهدة مسلّمة.</DialogDescription></DialogHeader>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">بيانات الوردية</h3><div className="grid grid-cols-2 gap-4">
   <div className="space-y-2"><Label>تاريخ الوردية</Label><Input readOnly value={date.toLocaleDateString("en-GB")} /></div>
   <div className="space-y-2"><Label>الساعة</Label><Input readOnly value={date.toLocaleTimeString("en-GB")} /></div>
   <div className="space-y-2"><Label>موظف البيع</Label><Input readOnly value={userName}/></div>
   <div className="space-y-2"><Label>رقم الوردية</Label><Input readOnly value="يُحدد عند الحفظ"/></div>
  </div></section>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">رصيد بداية الوردية</h3>
   {pending.length>0?<div className="space-y-2"><Label htmlFor="pos-handover-source">العهدة المطلوب استلامها</Label><select id="pos-handover-source" className="h-11 w-full rounded-md border bg-white px-3" value={sourceId??""} disabled={busy} onChange={e=>setSourceId(Number(e.target.value)||null)}><option value="">اختر العهدة</option>{pending.map(row=><option key={row.id} value={row.id}>#{row.id} — {row.from_user_name} — {Number(row.handover_amount).toFixed(2)} {currency}</option>)}</select></div>:<div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="pos-opening-cash">الرصيد الافتتاحي</Label><Input ref={input} id="pos-opening-cash" type="number" min="0" step="0.01" value={amount} disabled={busy} onChange={e=>onAmountChange(Number(e.target.value))}/></div><div className="space-y-2"><Label>العملة الرئيسية</Label><Input readOnly value={currency}/></div></div>}
  </section>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  {!online&&<p role="alert" className="text-sm text-amber-700">فتح أو استلام العهدة يحتاج اتصالاً بالخادم.</p>}
  <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>إغلاق Esc</Button><Button disabled={!valid} onClick={confirm}>{busy?"جاري الحفظ…":"موافق F3"}</Button></DialogFooter>
 </DialogContent></Dialog>
}
