"use client"

import {useEffect,useRef,useState,type ReactNode} from "react"
import {Banknote,Check,CreditCard,WalletCards,X} from "lucide-react"
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import {PosDialogMessages} from "./pos-dialog-messages"
import {PinpadPayButton} from "@/components/pinpad/pinpad-pay-button"
import type {PinpadResult} from "@/lib/pinpad"

export type PaymentMethod="cash"|"cheque"|"card"|"account"|"gift_card"
export type CurrencyOption={currency_id:number;currency_code:string;currency_name:string;rate_to_point:number}
export type LookupOption={id:number;name:string;code?:string;bank_id?:number;accountId?:number|null;pinpadMachineId?:number|null}
export type PaymentDetail={method:PaymentMethod;amount:number;currency_id?:number;currency_amount?:number;reference:string;due_date?:string;bank_id?:number;branch_id?:number;cheque_account?:string;card_type_id?:number;card_expiry?:string;pinpad?:PinpadResult}

type Props={
 open:boolean;onOpenChange:(open:boolean)=>void;mode:"sale"|"return"|"gift";total:number;currencyCode:string;pointCurrencyId:number;
 currencies:CurrencyOption[];customers:LookupOption[];customerId:number|null;onCustomerChange:(id:number|null)=>void;
 banks:LookupOption[];branches:LookupOption[];cardTypes:LookupOption[];
 payments:PaymentDetail[];cashAmounts:Record<number,number>;onCashChange:(id:number,value:number)=>void;
 onPaymentAmount:(method:PaymentMethod,value:number,currencyId?:number)=>void;
 onPaymentField:(method:PaymentMethod,field:keyof PaymentDetail,value:string|number|PinpadResult|undefined)=>void;
 pinpadBatch?:string|number;
 onConfirm:()=>void;onSavedClose?:()=>boolean;busy:boolean;error:string;
}

const round=(value:number)=>Math.round(value*100)/100
const money=(value:number)=>round(value).toFixed(2)
const today=()=>new Date().toISOString().slice(0,10)
const selectAllOnFocus=(event: React.FocusEvent<HTMLInputElement>)=>{
 event.currentTarget.select()
}

export function PosPaymentDetailsDialog(props:Props){
 const {open,onOpenChange,mode,total,currencyCode,pointCurrencyId,currencies,customers,customerId,onCustomerChange,banks,branches,cardTypes,payments,cashAmounts,onCashChange,onPaymentAmount,onPaymentField,onConfirm,onSavedClose,busy,error,pinpadBatch}=props
 const [pinpadError,setPinpadError]=useState("")
 const [tab,setTab]=useState<PaymentMethod>("cash")
 const amountInputRef=useRef<HTMLInputElement>(null)
 const confirmButtonRef=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!open)return;setTab("cash");requestAnimationFrame(()=>{amountInputRef.current?.focus();amountInputRef.current?.select()})},[open])
 const entries:ReadonlyArray<{key:PaymentMethod;label:string;shortcut:string;icon:typeof Banknote}>=[
  {key:"cash",label:"نقدي",shortcut:"F4",icon:Banknote},{key:"cheque",label:"شيك",shortcut:"F5",icon:WalletCards},
  {key:"card",label:"فيزا",shortcut:"F6",icon:CreditCard},{key:"account",label:"ذمم",shortcut:"F7",icon:Check},
 ]
 const tabs=entries.filter(entry=>mode==="return"?["cash","account"].includes(entry.key):mode==="gift"?false:true)
 const payment=payments.find(row=>row.method===tab)
 const paid=round(payments.reduce((sum,row)=>sum+Number(row.amount||0),0))
 const remaining=round(total-paid)
 const changeDue=mode==="sale"?Math.max(0,-remaining):0
 const selectedCustomer=customers.find(row=>row.id===customerId)
 const selectedBank=Number(payment?.bank_id||0)
 const pinpadMachine=tab==="card"?Number(cardTypes.find(row=>row.id===Number(payment?.card_type_id))?.pinpadMachineId||0):0
 const field=(label:string,content:ReactNode,required=false)=><div className="min-w-0 space-y-1.5"><Label className="text-xs font-semibold text-slate-700">{label}{required&&<span className="mr-1 text-red-600">*</span>}</Label>{content}</div>
 const currencyField=(method:PaymentMethod,disabled=false)=>field("العملة",<Select value={String(payment?.currency_id||pointCurrencyId)} disabled={disabled} onValueChange={value=>onPaymentAmount(method,Number(payment?.currency_amount??payment?.amount??0),Number(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{currencies.map(row=><SelectItem key={row.currency_id} value={String(row.currency_id)}>{row.currency_code} — {row.currency_name}</SelectItem>)}</SelectContent></Select>,true)
 const amountField=(method:PaymentMethod)=>field("المبلغ",<Input type="number" disabled={method==="card"&&!!payment?.pinpad} min="0" step="0.01" value={payment?.currency_amount??payment?.amount??0} onFocus={selectAllOnFocus} onChange={event=>onPaymentAmount(method,Number(event.target.value))}/>,true)
 const customerField=field("رقم العميل",<AutoCompleteAccount voucherCurrencyId={Number(pointCurrencyId) || null} label="" value={String(customers.find(row=>row.id===customerId)?.accountId||"")} valueMode="id" onValueChange={()=>undefined} onAccountSelect={account=>{const selected=account?customers.find(row=>row.accountId===account.id||row.id===account.id):undefined;onCustomerChange(selected?.id??null)}} requiredTypeValues={[2,3,5]} searchAllowedTypeValues={[2,3,5]} showCostCenterButton={false} className="w-full" placeholder="ابحث عن العميل"/>,tab==="account"||tab==="cheque")
 const onKeyDown=(event:React.KeyboardEvent)=>{const key=event.key.toUpperCase();if(key==="ENTER"&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey){const target=event.target as HTMLElement;if(target.tagName!=="TEXTAREA"&&target.tagName!=="BUTTON"){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), button:not([role="tab"]):not([data-dialog-close])')).filter(control=>control.offsetParent!==null);const index=controls.indexOf(target);if(index>=0){event.preventDefault();event.stopPropagation();(controls[index+1]||confirmButtonRef.current)?.focus();return}}}const target=entries.find(entry=>entry.shortcut===key&&tabs.some(t=>t.key===entry.key));if(target){event.preventDefault();event.stopPropagation();setTab(target.key)}else if(key==="F3"){event.preventDefault();event.stopPropagation();if(!busy)onConfirm()}}
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" onKeyDown={onKeyDown} onPointerDownOutside={event=>event.preventDefault()} onInteractOutside={event=>event.preventDefault()} onOpenAutoFocus={event=>{event.preventDefault();requestAnimationFrame(()=>{amountInputRef.current?.focus();amountInputRef.current?.select()})}} onCloseAutoFocus={event=>{if(onSavedClose?.())event.preventDefault()}} hideCloseButton className="pos-payment-dialog flex h-[min(calc(100%-1rem),calc(100dvh-1rem))] max-h-[min(calc(100%-1rem),calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 text-slate-900 sm:h-auto sm:max-h-[min(calc(100%-1.5rem),94dvh)] sm:w-[min(92vw,860px)]">
  <DialogHeader className="flex shrink-0 flex-row items-center gap-3 space-y-0 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-right text-white">
   <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><WalletCards className="h-5 w-5"/></span>
   <div className="min-w-0 flex-1"><DialogTitle className="truncate text-base font-black text-white sm:text-lg">{mode==="return"?"تفاصيل الاسترجاع":mode==="gift"?"تأكيد الهدية":"تفاصيل الدفع"}</DialogTitle><DialogDescription className="text-xs text-emerald-50">مبلغ الفاتورة <b dir="ltr" className="text-white">{money(total)} {currencyCode}</b></DialogDescription></div>
   <button type="button" data-dialog-close aria-label="إغلاق" onClick={()=>onOpenChange(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/30"><X className="h-4 w-4"/></button>
  </DialogHeader>
  <PosDialogMessages error={error} open={open}/>
  {mode!=="gift"&&<div role="tablist" aria-label="طرق الدفع" className="shrink-0 border-b bg-slate-50 px-3 py-2 sm:px-5"><div className="grid gap-1 rounded-xl bg-slate-200/70 p-1" style={{gridTemplateColumns:`repeat(${tabs.length},minmax(0,1fr))`}}>{tabs.map(entry=><button key={entry.key} role="tab" aria-selected={tab===entry.key} onClick={()=>setTab(entry.key)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition sm:text-sm ${tab===entry.key?"bg-white text-emerald-700 shadow-sm":"text-slate-600 hover:text-emerald-700"}`}><entry.icon className="h-4 w-4 shrink-0"/><span className="truncate">{entry.label}</span><span className="hidden text-[10px] opacity-60 sm:inline">{entry.shortcut}</span></button>)}</div></div>}
  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-5">
   {mode==="gift"?<p className="rounded-lg bg-blue-50 p-5 text-center text-sm">سيُنشأ سند إخراج للهدية دون دفعة مالية.</p>:<div role="tabpanel" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
    {tab==="cash"&&<div><h3 className="mb-2 text-sm font-bold">تفاصيل النقد حسب العملة</h3>
     <div className="hidden grid-cols-[minmax(0,1fr)_10rem_6rem_7rem] gap-2 px-3 pb-1 text-[11px] font-bold text-slate-500 sm:grid"><span>العملة</span><span>المبلغ</span><span>سعر الصرف</span><span className="text-left">المبلغ المقيّم</span></div>
     <div className="space-y-2">{currencies.map((row,index)=><div key={row.currency_id} className="grid grid-cols-2 items-center gap-x-2 gap-y-1.5 rounded-xl border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_7rem] sm:p-2 sm:px-3">
      <div className="order-1 min-w-0"><span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">{index+1}</span><b className="text-sm">{row.currency_code}</b> <span className="text-xs text-slate-500">{row.currency_name}</span></div>
      <div className="order-2 text-left text-sm font-black tabular-nums sm:order-4" dir="ltr">{money((cashAmounts[row.currency_id]||0)*row.rate_to_point)}</div>
      <div className="order-3 col-span-2 sm:order-2 sm:col-span-1"><Input ref={index===0?amountInputRef:undefined} aria-label={`مبلغ ${row.currency_code}`} type="number" inputMode="decimal" min="0" step="0.01" value={cashAmounts[row.currency_id]??0} onFocus={selectAllOnFocus} onChange={event=>onCashChange(row.currency_id,Number(event.target.value))} className="h-10 text-left text-base font-bold sm:h-9 sm:text-sm"/></div>
      <div className="order-4 col-span-2 text-[11px] text-slate-500 tabular-nums sm:order-3 sm:col-span-1 sm:text-xs" dir="ltr"><span className="sm:hidden">سعر الصرف: </span>{row.rate_to_point.toFixed(4)}</div>
     </div>)}</div></div>}
    {tab==="cheque"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل الشيك</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}{field("رقم الحساب",<Input value={payment?.cheque_account||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","cheque_account",event.target.value)}/>,true)}{field("رقم الشيك",<Input value={payment?.reference||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","reference",event.target.value)}/>,true)}{amountField("cheque")}{field("تاريخ الاستحقاق",<Input type="date" min={today()} value={payment?.due_date||today()} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","due_date",event.target.value)}/>,true)}{currencyField("cheque")}{field("البنك",<Select value={payment?.bank_id?String(payment.bank_id):"none"} onValueChange={value=>{onPaymentField("cheque","bank_id",Number(value));onPaymentField("cheque","branch_id",0)}}><SelectTrigger><SelectValue placeholder="اختر البنك"/></SelectTrigger><SelectContent><SelectItem value="none">اختر البنك</SelectItem>{banks.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}{field("الفرع",<Select value={payment?.branch_id?String(payment.branch_id):"none"} onValueChange={value=>onPaymentField("cheque","branch_id",Number(value))}><SelectTrigger><SelectValue placeholder="اختر الفرع"/></SelectTrigger><SelectContent><SelectItem value="none">اختر الفرع</SelectItem>{branches.filter(row=>!row.bank_id||row.bank_id===selectedBank).map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}</div></div>}
    {tab==="card"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل البطاقة</h3><div className="grid gap-3 sm:grid-cols-2">{currencyField("card")}{field("اسم البطاقة",<Select value={payment?.card_type_id?String(payment.card_type_id):"none"} disabled={!!payment?.pinpad} onValueChange={value=>{onPaymentField("card","card_type_id",Number(value));setPinpadError("")}}><SelectTrigger><SelectValue placeholder="اختر البطاقة"/></SelectTrigger><SelectContent><SelectItem value="none">اختر البطاقة</SelectItem>{cardTypes.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent></Select>,true)}{amountField("card")}{field("رقم البطاقة",<Input inputMode="numeric" maxLength={23} autoComplete="off" placeholder="رقم البطاقة" readOnly={!!payment?.pinpad} value={payment?.reference||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("card","reference",event.target.value)}/>,true)}{field("تاريخ الانتهاء",<Input type="month" value={payment?.card_expiry||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("card","card_expiry",event.target.value)}/>,true)}{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}</div>{pinpadMachine>0&&<div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3">{payment?.pinpad?<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span className="font-bold text-emerald-700">✓ تمت العملية على الجهاز</span><span>رقم الموافقة: <b dir="ltr">{payment.pinpad.auth_code||"-"}</b></span>{payment.pinpad.trans_id&&<span>رقم الحركة: <b dir="ltr">{payment.pinpad.trans_id}</b></span>}{payment.pinpad.terminal_id&&<span>الجهاز: <b dir="ltr">{payment.pinpad.terminal_id}</b></span>}<button type="button" className="mr-auto text-rose-600 underline" onClick={()=>{onPaymentField("card","pinpad",undefined);onPaymentField("card","reference","")}}>إلغاء الربط والإدخال يدوياً</button></div>:<><p className="text-xs text-slate-600">هذه البطاقة مربوطة بجهاز الدفع — اضغط «إرسال للجهاز» ليُرسل المبلغ ويمرّر العميل بطاقته، أو أدخل البيانات يدوياً.</p><PinpadPayButton machineId={pinpadMachine} amount={Number(payment?.currency_amount??payment?.amount??0)} currency={currencyCode} batch={pinpadBatch??""} onError={setPinpadError} onSuccess={result=>{setPinpadError("");onPaymentField("card","pinpad",result);onPaymentField("card","reference",result.card_number||result.auth_code)}}/></>}{pinpadError&&<p role="alert" className="rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">{pinpadError}</p>}</div>}</div>}
    {tab==="account"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل الذمم</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}{currencyField("account")}{amountField("account")}</div></div>}
   </div>}
   <div className="grid grid-cols-3 gap-2 text-center">
    <div className="rounded-xl border bg-white p-2 sm:p-3"><div className="text-[11px] font-semibold text-slate-500">مبلغ الفاتورة</div><div className="text-sm font-black tabular-nums sm:text-base" dir="ltr">{money(total)}</div></div>
    <div className="rounded-xl border bg-white p-2 sm:p-3"><div className="text-[11px] font-semibold text-slate-500">المبلغ المدفوع</div><div className="text-sm font-black tabular-nums sm:text-base" dir="ltr">{money(paid)}</div></div>
    <div className={`rounded-xl border p-2 sm:p-3 ${changeDue>0.009?"border-sky-200 bg-sky-50 text-sky-800":remaining>0.009?"border-rose-200 bg-rose-50 text-rose-700":"border-emerald-200 bg-emerald-50 text-emerald-700"}`}><div className="text-[11px] font-bold">{changeDue>0.009?"المبلغ للإرجاع":"المبلغ المتبقي"}</div><div className="text-base font-black tabular-nums sm:text-lg" dir="ltr">{money(changeDue>0.009?changeDue:Math.max(0,remaining))} <small className="text-[10px] font-semibold">{currencyCode}</small></div></div>
   </div>
  </div>
    <div className="pos-payment-dialog-footer grid shrink-0 grid-cols-2 gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-center"><Button ref={confirmButtonRef} onClick={onConfirm} disabled={busy} className="pos-payment-confirm"><Check className="ml-1 h-4 w-4"/>موافق F3</Button><Button data-dialog-close onClick={()=>onOpenChange(false)} className="pos-payment-close"><X className="ml-1 h-4 w-4"/>إغلاق Esc</Button></div>
 </DialogContent></Dialog>
}
