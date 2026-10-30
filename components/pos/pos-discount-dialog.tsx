"use client"
import {useEffect,useState,type KeyboardEvent} from "react"
import {Check,Percent,X} from "lucide-react"
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {Label} from "@/components/ui/label"

export function PosDiscountDialog({subtotal,itemDiscount,customer,maximum,initialPercent,onApply,onClose}:{subtotal:number;itemDiscount:number;customer:string;maximum:number;initialPercent:number;onApply:(percent:number)=>void;onClose:()=>void}){
 const limit=Math.min(100,Math.max(0,maximum))
 const grossNet=subtotal
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
 const info:[string,string][]=[['اسم العميل',customer],['قيمة الفاتورة',subtotal.toFixed(2)],['أعلى نسبة خصم',`${limit}%`],['خصم الأصناف',itemDiscount.toFixed(2)]]
 // نسب سريعة (ضمن الحد المسموح)
 const presets=[5,10,15,20,25].filter(value=>value<=limit)
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" hideCloseButton onKeyDown={onEnterAsTab} className="pos-discount-dialog flex max-h-[min(calc(100%-1rem),calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:w-[min(94vw,36rem)]">
  <DialogHeader className="flex shrink-0 flex-row items-center gap-3 space-y-0 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-right text-white">
   <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><Percent className="h-5 w-5"/></span>
   <div className="min-w-0 flex-1"><DialogTitle className="truncate text-base font-black !text-white sm:text-lg">خصم الفاتورة</DialogTitle><p className="truncate text-xs text-emerald-50">{customer}</p></div>
   <button type="button" data-dialog-close aria-label="إغلاق" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/30"><X className="h-4 w-4"/></button>
  </DialogHeader>
  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-5">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{info.map(([label,value])=><div key={label} className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30"><div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</div><div className="truncate text-sm font-black text-slate-800 dark:text-slate-100" dir={label==="اسم العميل"?undefined:"ltr"}>{value}</div></div>)}</div>
   <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4"><h3 className="mb-3 text-sm font-bold text-emerald-800 sm:text-base">إدخال الخصم</h3>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
     <div className="space-y-1.5"><Label htmlFor="pos-discount-amount">مبلغ الخصم</Label><Input autoFocus onFocus={e=>e.target.select()} id="pos-discount-amount" type="text" inputMode="decimal" dir="ltr" value={amountText} onChange={e=>syncFromAmount(e.target.value)} className="text-center"/></div>
     <div className="space-y-1.5"><Label htmlFor="pos-discount-percent">نسبة الخصم %</Label><Input onFocus={e=>e.target.select()} id="pos-discount-percent" type="text" inputMode="decimal" dir="ltr" value={percentText} onChange={e=>syncFromPercent(e.target.value)} className="text-center"/></div>
     <div className="space-y-1.5"><Label htmlFor="pos-discount-net">الصافي للدفع</Label><Input onFocus={e=>e.target.select()} id="pos-discount-net" type="text" inputMode="decimal" dir="ltr" value={netText} onChange={e=>syncFromNet(e.target.value)} className="text-center font-bold"/></div>
    </div>
    {presets.length>0&&<div className="mt-3 flex flex-wrap gap-1.5">{presets.map(value=><button key={value} type="button" tabIndex={-1} onClick={()=>syncFromPercent(String(value))} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${Math.abs(percent-value)<0.0001?"border-emerald-600 bg-emerald-600 text-white":"border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"}`}>{value}%</button>)}<button type="button" tabIndex={-1} onClick={()=>syncFromPercent("0")} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">بدون خصم</button></div>}
    {!valid&&<p role="alert" className="mt-3 text-sm text-rose-700">أدخل خصماً بين صفر و{limit}%.</p>}
   </section>
  </div>
  <div className="pos-payment-dialog-footer grid shrink-0 grid-cols-2 gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-center">
   <Button className="pos-payment-confirm" disabled={!valid||subtotal<=0} onClick={()=>onApply(percent)}><Check className="ml-1 h-4 w-4"/>موافق F3</Button>
   <Button data-dialog-close className="pos-payment-close" onClick={onClose}><X className="ml-1 h-4 w-4"/>إغلاق Esc</Button>
  </div>
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
  <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="pos-item-discount-amount">مبلغ الخصم</Label><Input id="pos-item-discount-amount" autoFocus onFocus={event=>event.target.select()} type="text" inputMode="decimal" value={amountText} onChange={event=>changeAmount(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="pos-item-discount-percent">نسبة الخصم %</Label><Input id="pos-item-discount-percent" onFocus={event=>event.target.select()} type="text" inputMode="decimal" value={percentText} onChange={event=>changePercent(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="pos-item-discount-net">الصافي</Label><Input id="pos-item-discount-net" onFocus={event=>event.target.select()} type="text" inputMode="decimal" value={netText} onChange={event=>changeNet(event.target.value)}/></div></div>
  <p className="text-sm">الصافي بعد الخصم: <strong>{valid?Math.max(0,net).toFixed(2):"—"}</strong></p>
  {!valid&&<p role="alert" className="text-sm text-rose-700">يجب ألا يتجاوز الخصم قيمة الصنف أو {limit}%.</p>}
  <div className="pos-payment-dialog-footer grid grid-cols-2 gap-2 pt-3 sm:flex sm:justify-center"><Button className="pos-payment-confirm" disabled={!valid} onClick={()=>onApply(percent)}><Check className="ml-1 h-4 w-4"/>تطبيق الخصم</Button><Button data-dialog-close className="pos-payment-close" onClick={onClose}><X className="ml-1 h-4 w-4"/>إلغاء</Button></div>
 </DialogContent></Dialog>
}
