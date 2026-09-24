"use client"
import {useEffect,useState,type KeyboardEvent} from "react"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Label} from "@/components/ui/label"

export function PosDiscountDialog({subtotal,itemDiscount,customer,maximum,initialPercent,taxPercent,onApply,onClose}:{subtotal:number;itemDiscount:number;customer:string;maximum:number;initialPercent:number;taxPercent:number;onApply:(percent:number)=>void;onClose:()=>void}){
 const limit=Math.min(100,Math.max(0,maximum))
 const grossNet=subtotal*(1+taxPercent/100)
 const [percentText,setPercentText]=useState(initialPercent.toFixed(6))
 const [amountText,setAmountText]=useState((subtotal*initialPercent/100).toFixed(2))
 const [netText,setNetText]=useState((grossNet*(1-initialPercent/100)).toFixed(2))
 useEffect(()=>{setPercentText(initialPercent.toFixed(6));setAmountText((subtotal*initialPercent/100).toFixed(2));setNetText((grossNet*(1-initialPercent/100)).toFixed(2))},[initialPercent,subtotal,grossNet])
 const percent=Number(percentText),amount=Number(amountText),net=Number(netText)
 const minimumNet=grossNet*(1-limit/100)
 const valid=percentText!==""&&amountText!==""&&netText!==""&&Number.isFinite(percent)&&Number.isFinite(amount)&&Number.isFinite(net)&&percent>=0&&percent<=limit&&amount>=0&&amount<=subtotal*limit/100+0.001&&net>=minimumNet-0.001&&net<=grossNet+0.001
 const syncFromPercent=(text:string)=>{setPercentText(text);const value=Number(text);if(text===""||!Number.isFinite(value))return;setAmountText((subtotal*value/100).toFixed(2));setNetText((grossNet*(1-value/100)).toFixed(2))}
 const syncFromAmount=(text:string)=>{setAmountText(text);const value=Number(text);if(text===""||!Number.isFinite(value)||subtotal<=0)return;const valuePercent=value/subtotal*100;setPercentText(valuePercent.toFixed(6));setNetText((grossNet*(1-valuePercent/100)).toFixed(2))}
 const syncFromNet=(text:string)=>{setNetText(text);const value=Number(text);if(text===""||!Number.isFinite(value)||grossNet<=0)return;const valuePercent=(1-value/grossNet)*100;setPercentText(valuePercent.toFixed(6));setAmountText((subtotal*valuePercent/100).toFixed(2))}
 const onEnterAsTab=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.key==="F3"){event.preventDefault();event.stopPropagation();if(valid&&subtotal>0)onApply(percent);return}if(event.key!=="Enter"||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;const target=event.target as HTMLElement;if(target.tagName==="BUTTON"||target.tagName==="TEXTAREA")return;const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled])')).filter(control=>control.offsetParent!==null);const inputs=controls.filter(control=>control.tagName==="INPUT");const index=controls.indexOf(target);if(index<0)return;event.preventDefault();event.stopPropagation();(inputs.indexOf(target)===inputs.length-1?event.currentTarget.querySelector<HTMLElement>(".pos-payment-confirm"):controls[index+1])?.focus()}
 const info=[['اسم العميل',customer],['قيمة الفاتورة',subtotal.toFixed(2)],['أعلى نسبة خصم',`${limit}%`],['خصم الأصناف',itemDiscount.toFixed(2)]]
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" onKeyDown={onEnterAsTab} className="pos-discount-dialog max-w-xl"><DialogHeader><DialogTitle>خصم الفاتورة</DialogTitle></DialogHeader>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">معلومات الفاتورة</h3><div className="grid grid-cols-2 gap-4">{info.map(([label,value])=><div key={label} className="space-y-2"><Label>{label}</Label><Input readOnly value={value} className="bg-slate-100"/></div>)}</div></section>
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="mb-4 border-b border-emerald-200 pb-3 font-bold text-emerald-800">إدخال الخصم</h3><div className="grid gap-3 sm:grid-cols-3">
    <div className="space-y-2"><Label htmlFor="pos-discount-amount">مبلغ الخصم</Label><Input autoFocus onFocus={e=>e.target.select()} id="pos-discount-amount" type="number" min="0" step="0.01" max={subtotal*limit/100} value={amountText} onChange={e=>syncFromAmount(e.target.value)}/></div>
    <div className="space-y-2"><Label htmlFor="pos-discount-percent">نسبة الخصم %</Label><Input onFocus={e=>e.target.select()} id="pos-discount-percent" type="number" min="0" max={limit} step="0.01" value={percentText} onChange={e=>syncFromPercent(e.target.value)}/></div>
    <div className="space-y-2"><Label htmlFor="pos-discount-net">الصافي للدفع</Label><Input onFocus={e=>e.target.select()} id="pos-discount-net" type="number" min={minimumNet.toFixed(2)} max={grossNet.toFixed(2)} step="0.01" value={netText} onChange={e=>syncFromNet(e.target.value)}/></div>
  </div>{!valid&&<p role="alert" className="mt-3 text-sm text-rose-700">أدخل خصماً بين صفر و{limit}%.</p>}</section>
    <DialogFooter className="pos-payment-dialog-footer"><Button data-dialog-close className="pos-payment-close" onClick={onClose}>إغلاق Esc</Button><Button className="pos-payment-confirm" disabled={!valid||subtotal<=0} onClick={()=>onApply(percent)}>موافق</Button></DialogFooter>
 </DialogContent></Dialog>
}

export function PosItemDiscountDialog({itemName,gross,maximum,initialPercent,onApply,onClose}:{itemName:string;gross:number;maximum:number;initialPercent:number;onApply:(percent:number)=>void;onClose:()=>void}){
 const [percentText,setPercentText]=useState(String(initialPercent))
 const [amountText,setAmountText]=useState(String(Number((gross*initialPercent/100).toFixed(2))))
 const [netText,setNetText]=useState(String(Number((gross*(1-initialPercent/100)).toFixed(2))))
 const limit=Math.min(100,Math.max(0,maximum))
 const percent=Number(percentText),amount=Number(amountText)
 const net=Number(netText)
 const valid=percentText!==""&&amountText!==""&&netText!==""&&Number.isFinite(percent)&&Number.isFinite(amount)&&Number.isFinite(net)&&percent>=0&&percent<=limit&&amount>=0&&amount<=gross*limit/100+0.001&&net>=gross*(1-limit/100)-0.001&&net<=gross+0.001
 const changePercent=(text:string)=>{setPercentText(text);if(text===""){setAmountText("");setNetText("");return}const value=Number(text);setAmountText(String(Number((gross*value/100).toFixed(2))));setNetText(String(Number((gross*(1-value/100)).toFixed(2))))}
 const changeAmount=(text:string)=>{setAmountText(text);if(text===""){setPercentText("");setNetText("");return}const valuePercent=gross>0?Number(text)/gross*100:0;setPercentText(String(Number(valuePercent.toFixed(6))));setNetText(String(Number((gross-Number(text)).toFixed(2))))}
 const changeNet=(text:string)=>{setNetText(text);if(text===""){setPercentText("");setAmountText("");return}const value=Number(text);const valueAmount=gross-value;setAmountText(String(Number(valueAmount.toFixed(2))));setPercentText(gross>0?String(Number((valueAmount/gross*100).toFixed(6))):"0")}
 const onEnterAsTab=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.key==="F3"){event.preventDefault();event.stopPropagation();if(valid)onApply(percent);return}if(event.key!=="Enter"||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;const target=event.target as HTMLElement;if(target.tagName==="BUTTON"||target.tagName==="TEXTAREA")return;const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled])')).filter(control=>control.offsetParent!==null);const inputs=controls.filter(control=>control.tagName==="INPUT");const index=controls.indexOf(target);if(index<0)return;event.preventDefault();event.stopPropagation();(inputs.indexOf(target)===inputs.length-1?event.currentTarget.querySelector<HTMLElement>(".pos-payment-confirm"):controls[index+1])?.focus()}
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" onKeyDown={onEnterAsTab} className="pos-discount-dialog w-[calc(100%-1.5rem)] max-w-md"><DialogHeader><DialogTitle>خصم الصنف: {itemName}</DialogTitle></DialogHeader>
  <p className="text-sm text-slate-600">قيمة الصنف قبل الخصم: <strong>{gross.toFixed(2)}</strong></p>
  <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="pos-item-discount-amount">مبلغ الخصم</Label><Input id="pos-item-discount-amount" autoFocus onFocus={event=>event.target.select()} type="number" min="0" max={gross*limit/100} step="0.01" value={amountText} onChange={event=>changeAmount(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="pos-item-discount-percent">نسبة الخصم %</Label><Input id="pos-item-discount-percent" onFocus={event=>event.target.select()} type="number" min="0" max={limit} step="0.01" value={percentText} onChange={event=>changePercent(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="pos-item-discount-net">الصافي</Label><Input id="pos-item-discount-net" onFocus={event=>event.target.select()} type="number" min={Math.max(0,gross*(1-limit/100)).toFixed(2)} max={gross} step="0.01" value={netText} onChange={event=>changeNet(event.target.value)}/></div></div>
  <p className="text-sm">الصافي بعد الخصم: <strong>{valid?Math.max(0,net).toFixed(2):"—"}</strong></p>
  {!valid&&<p role="alert" className="text-sm text-rose-700">يجب ألا يتجاوز الخصم قيمة الصنف أو {limit}%.</p>}
  <DialogFooter className="pos-payment-dialog-footer"><Button data-dialog-close className="pos-payment-close" onClick={onClose}>إلغاء</Button><Button className="pos-payment-confirm" disabled={!valid} onClick={()=>onApply(percent)}>تطبيق الخصم</Button></DialogFooter>
 </DialogContent></Dialog>
}
