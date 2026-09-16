"use client"
import {useState} from "react"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Label} from "@/components/ui/label"

export function PosDiscountDialog({subtotal,itemDiscount,customer,maximum,initialPercent,taxPercent,onApply,onClose}:{subtotal:number;itemDiscount:number;customer:string;maximum:number;initialPercent:number;taxPercent:number;onApply:(percent:number)=>void;onClose:()=>void}){
 const [percent,setPercent]=useState(initialPercent)
 const limit=Math.min(100,Math.max(0,maximum))
 const valid=Number.isFinite(percent)&&percent>=0&&percent<=limit
 const amount=subtotal*percent/100
 const net=(subtotal-amount)*(1+taxPercent/100)
 const info=[['اسم العميل',customer],['قيمة الفاتورة',subtotal.toFixed(2)],['أعلى نسبة خصم',`${limit}%`],['خصم الأصناف',itemDiscount.toFixed(2)]]
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>خصم الفاتورة</DialogTitle></DialogHeader>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">معلومات الفاتورة</h3><div className="grid grid-cols-2 gap-4">{info.map(([label,value])=><div key={label} className="space-y-2"><Label>{label}</Label><Input readOnly value={value} className="bg-slate-100"/></div>)}</div></section>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">إدخال الخصم</h3><div className="grid gap-3 sm:grid-cols-3">
   <div className="space-y-2"><Label htmlFor="pos-discount-amount">مبلغ الخصم</Label><Input autoFocus onFocus={e=>e.target.select()} id="pos-discount-amount" type="number" min="0" step="0.01" max={subtotal*limit/100} value={Number(amount.toFixed(2))} onChange={e=>setPercent(subtotal>0?Number(e.target.value)/subtotal*100:0)}/></div>
   <div className="space-y-2"><Label htmlFor="pos-discount-percent">نسبة الخصم %</Label><Input id="pos-discount-percent" type="number" min="0" max={limit} step="0.01" value={Number(percent.toFixed(6))} onChange={e=>setPercent(Number(e.target.value))}/></div>
   <div className="space-y-2"><Label>الصافي للدفع</Label><Input readOnly value={net.toFixed(2)}/></div>
  </div>{!valid&&<p role="alert" className="mt-3 text-sm text-rose-700">أدخل خصماً بين صفر و{limit}%.</p>}</section>
  <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق Esc</Button><Button disabled={!valid||subtotal<=0} onClick={()=>onApply(percent)}>موافق</Button></DialogFooter>
 </DialogContent></Dialog>
}

export function PosItemDiscountDialog({itemName,gross,maximum,initialPercent,onApply,onClose}:{itemName:string;gross:number;maximum:number;initialPercent:number;onApply:(percent:number)=>void;onClose:()=>void}){
 const [percentText,setPercentText]=useState(String(initialPercent))
 const [amountText,setAmountText]=useState(String(Number((gross*initialPercent/100).toFixed(2))))
 const limit=Math.min(100,Math.max(0,maximum))
 const percent=Number(percentText),amount=Number(amountText)
 const valid=percentText!==""&&amountText!==""&&Number.isFinite(percent)&&Number.isFinite(amount)&&percent>=0&&percent<=limit&&amount>=0&&amount<=gross+0.001
 const changePercent=(text:string)=>{setPercentText(text);setAmountText(text===""?"":String(Number((gross*Number(text)/100).toFixed(2))))}
 const changeAmount=(text:string)=>{setAmountText(text);setPercentText(text===""?"":gross>0?String(Number((Number(text)/gross*100).toFixed(6))):"0")}
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" className="w-[calc(100%-1.5rem)] max-w-md"><DialogHeader><DialogTitle>خصم الصنف: {itemName}</DialogTitle></DialogHeader>
  <p className="text-sm text-slate-600">قيمة الصنف قبل الخصم: <strong>{gross.toFixed(2)}</strong></p>
  <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pos-item-discount-amount">مبلغ الخصم</Label><Input id="pos-item-discount-amount" autoFocus type="number" min="0" max={gross} step="0.01" value={amountText} onChange={event=>changeAmount(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="pos-item-discount-percent">نسبة الخصم %</Label><Input id="pos-item-discount-percent" type="number" min="0" max={limit} step="0.01" value={percentText} onChange={event=>changePercent(event.target.value)}/></div></div>
  <p className="text-sm">الصافي بعد الخصم: <strong>{valid?Math.max(0,gross-amount).toFixed(2):"—"}</strong></p>
  {!valid&&<p role="alert" className="text-sm text-rose-700">يجب ألا يتجاوز الخصم قيمة الصنف أو {limit}%.</p>}
  <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button disabled={!valid} onClick={()=>onApply(percent)}>تطبيق الخصم</Button></DialogFooter>
 </DialogContent></Dialog>
}
