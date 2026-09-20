"use client"

import {useEffect,useState,type ReactNode,type KeyboardEvent} from "react"
import {Banknote,Check,CreditCard,Gift,WalletCards,X} from "lucide-react"
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select"
import {PosDialogMessages} from "./pos-dialog-messages"

export type PaymentMethod="cash"|"cheque"|"card"|"account"|"gift_card"
export type CurrencyOption={currency_id:number;currency_code:string;currency_name:string;rate_to_point:number}
export type LookupOption={id:number;name:string;code?:string;bank_id?:number}
export type PaymentDetail={method:PaymentMethod;amount:number;currency_id?:number;currency_amount?:number;reference:string;due_date?:string;bank_id?:number;branch_id?:number;cheque_account?:string;card_type_id?:number;card_expiry?:string}

type Props={
 open:boolean;onOpenChange:(open:boolean)=>void;mode:"sale"|"return"|"gift";total:number;currencyCode:string;pointCurrencyId:number;
 currencies:CurrencyOption[];customers:LookupOption[];customerId:number|null;onCustomerChange:(id:number|null)=>void;
 banks:LookupOption[];branches:LookupOption[];cardTypes:LookupOption[];
 payments:PaymentDetail[];cashAmounts:Record<number,number>;onCashChange:(id:number,value:number)=>void;
 onPaymentAmount:(method:PaymentMethod,value:number,currencyId?:number)=>void;
 onPaymentField:(method:PaymentMethod,field:keyof PaymentDetail,value:string|number)=>void;
 onConfirm:()=>void;onSavedClose?:()=>boolean;busy:boolean;error:string;
}

const round=(value:number)=>Math.round(value*100)/100
const money=(value:number)=>round(value).toFixed(2)
const today=()=>new Date().toISOString().slice(0,10)

export function PosPaymentDetailsDialog(props:Props){
 const {open,onOpenChange,mode,total,currencyCode,pointCurrencyId,currencies,customers,customerId,onCustomerChange,banks,branches,cardTypes,payments,cashAmounts,onCashChange,onPaymentAmount,onPaymentField,onConfirm,onSavedClose,busy,error}=props
 const [tab,setTab]=useState<PaymentMethod>("cash")
 useEffect(()=>{if(open)setTab("cash")},[open])
 const entries:ReadonlyArray<{key:PaymentMethod;label:string;shortcut:string;icon:typeof Banknote}>=[
  {key:"cash",label:"نقدي",shortcut:"F4",icon:Banknote},{key:"cheque",label:"شيك",shortcut:"F5",icon:WalletCards},
  {key:"card",label:"فيزا",shortcut:"F6",icon:CreditCard},{key:"account",label:"ذمم",shortcut:"F7",icon:Check},
  {key:"gift_card",label:"بطاقة هدية",shortcut:"F9",icon:Gift},
 ]
 const tabs=entries.filter(entry=>mode==="return"?["cash","account"].includes(entry.key):mode==="gift"?false:true)
 const payment=payments.find(row=>row.method===tab)
 const paid=round(payments.reduce((sum,row)=>sum+Number(row.amount||0),0))
 const remaining=round(total-paid)
 const changeDue=mode==="sale"?Math.max(0,-remaining):0
 const selectedCustomer=customers.find(row=>row.id===customerId)
 const selectedBank=Number(payment?.bank_id||0)
 const field=(label:string,content:ReactNode,required=false)=><div className="min-w-0 space-y-1.5"><Label className="text-xs font-semibold text-slate-700">{label}{required&&<span className="mr-1 text-red-600">*</span>}</Label>{content}</div>
 const currencyField=(method:PaymentMethod,disabled=false)=>field("العملة",<Select value={String(payment?.currency_id||pointCurrencyId)} disabled={disabled} onValueChange={value=>onPaymentAmount(method,Number(payment?.currency_amount??payment?.amount??0),Number(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{currencies.map(row=><SelectItem key={row.currency_id} value={String(row.currency_id)}>{row.currency_code} — {row.currency_name}</SelectItem>)}</SelectContent></Select>,true)
 const amountField=(method:PaymentMethod)=>field("المبلغ",<Input type="number" min="0" step="0.01" value={payment?.currency_amount??payment?.amount??0} onChange={event=>onPaymentAmount(method,Number(event.target.value))}/>,true)
 const customerField=field("رقم العميل",<Select value={customerId?String(customerId):"none"} onValueChange={value=>onCustomerChange(value==="none"?null:Number(value))}><SelectTrigger><SelectValue placeholder="اختر العميل"/></SelectTrigger><SelectContent><SelectItem value="none">اختر العميل</SelectItem>{customers.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code||row.id} — {row.name}</SelectItem>)}</SelectContent></Select>,tab==="account")
 const onKeyDown=(event:React.KeyboardEvent)=>{const key=event.key.toUpperCase();const target=entries.find(entry=>entry.shortcut===key&&tabs.some(t=>t.key===entry.key));if(target){event.preventDefault();event.stopPropagation();setTab(target.key)}else if(key==="F3"){event.preventDefault();event.stopPropagation();if(!busy)onConfirm()}else if(key==="F8"){event.preventDefault();event.stopPropagation();if(!busy)onConfirm()}}
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" onKeyDown={onKeyDown} onCloseAutoFocus={event=>{if(onSavedClose?.())event.preventDefault()}} className="flex max-h-[94dvh] w-[min(94vw,850px)] max-w-none flex-col gap-0 overflow-hidden p-0 text-slate-900 sm:w-[min(90vw,850px)]">
  <DialogHeader className="shrink-0 border-b bg-slate-50 px-5 py-3 text-right"><DialogTitle className="text-sm">تفاصيل الدفع</DialogTitle><DialogDescription className="sr-only">أدخل تفاصيل الدفع حسب الطريقة والعملة</DialogDescription></DialogHeader>
  <PosDialogMessages error={error} open={open}/>
  {mode!=="gift"&&<div role="tablist" aria-label="طرق الدفع" className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 pt-3 sm:px-6">{tabs.map(entry=><button key={entry.key} role="tab" aria-selected={tab===entry.key} onClick={()=>setTab(entry.key)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold sm:px-5 ${tab===entry.key?"border-blue-600 text-blue-700":"border-transparent text-slate-600 hover:text-blue-700"}`}><entry.icon className="h-4 w-4"/>{entry.label} <span className="text-[10px] opacity-70">{entry.shortcut}</span></button>)}</div>}
  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
   {mode==="gift"?<p className="rounded-lg bg-blue-50 p-5 text-center text-sm">سيُنشأ سند إخراج للهدية دون دفعة مالية.</p>:<div role="tabpanel" className="min-h-44 rounded-xl border border-slate-200 bg-blue-50/60 p-3 sm:p-5">
    {tab==="cash"&&<div><h3 className="mb-3 text-sm font-bold">تفاصيل النقد حسب العملة</h3><div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[520px] border-collapse text-xs"><thead><tr className="bg-slate-50 text-right"><th className="border-b px-3 py-2">#</th><th className="border-b px-3 py-2">رمز العملة</th><th className="border-b px-3 py-2">اسم العملة</th><th className="border-b px-3 py-2">المبلغ</th><th className="border-b px-3 py-2">سعر الصرف</th><th className="border-b px-3 py-2">المبلغ المقيّم</th></tr></thead><tbody>{currencies.map((row,index)=><tr key={row.currency_id} className="border-b last:border-0"><td className="px-3 py-2">{index+1}</td><td className="px-3 py-2 font-semibold">{row.currency_code}</td><td className="px-3 py-2">{row.currency_name}</td><td className="px-2 py-1"><Input aria-label={`مبلغ ${row.currency_code}`} type="number" min="0" step="0.01" value={cashAmounts[row.currency_id]??0} onChange={event=>onCashChange(row.currency_id,Number(event.target.value))} className="h-8 min-w-20 text-left"/></td><td className="px-3 py-2 tabular-nums" dir="ltr">{row.rate_to_point.toFixed(4)}</td><td className="px-3 py-2 font-bold tabular-nums" dir="ltr">{money((cashAmounts[row.currency_id]||0)*row.rate_to_point)}</td></tr>)}</tbody></table></div></div>}
    {tab==="cheque"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل الشيك</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}{field("رقم الحساب",<Input value={payment?.cheque_account||""} onChange={event=>onPaymentField("cheque","cheque_account",event.target.value)}/>,true)}{field("رقم الشيك",<Input value={payment?.reference||""} onChange={event=>onPaymentField("cheque","reference",event.target.value)}/>,true)}{amountField("cheque")}{field("تاريخ الاستحقاق",<Input type="date" min={today()} value={payment?.due_date||today()} onChange={event=>onPaymentField("cheque","due_date",event.target.value)}/>,true)}{currencyField("cheque")}{field("البنك",<Select value={payment?.bank_id?String(payment.bank_id):"none"} onValueChange={value=>{onPaymentField("cheque","bank_id",Number(value));onPaymentField("cheque","branch_id",0)}}><SelectTrigger><SelectValue placeholder="اختر البنك"/></SelectTrigger><SelectContent><SelectItem value="none">اختر البنك</SelectItem>{banks.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}{field("الفرع",<Select value={payment?.branch_id?String(payment.branch_id):"none"} onValueChange={value=>onPaymentField("cheque","branch_id",Number(value))}><SelectTrigger><SelectValue placeholder="اختر الفرع"/></SelectTrigger><SelectContent><SelectItem value="none">اختر الفرع</SelectItem>{branches.filter(row=>!row.bank_id||row.bank_id===selectedBank).map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}</div></div>}
    {tab==="card"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل البطاقة</h3><div className="grid gap-3 sm:grid-cols-2">{currencyField("card")}{field("اسم البطاقة",<Select value={payment?.card_type_id?String(payment.card_type_id):"none"} onValueChange={value=>onPaymentField("card","card_type_id",Number(value))}><SelectTrigger><SelectValue placeholder="اختر البطاقة"/></SelectTrigger><SelectContent><SelectItem value="none">اختر البطاقة</SelectItem>{cardTypes.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent></Select>,true)}{amountField("card")}{field("رقم البطاقة",<Input inputMode="numeric" maxLength={23} autoComplete="off" placeholder="رقم البطاقة" value={payment?.reference||""} onChange={event=>onPaymentField("card","reference",event.target.value)}/>,true)}{field("تاريخ الانتهاء",<Input type="month" value={payment?.card_expiry||""} onChange={event=>onPaymentField("card","card_expiry",event.target.value)}/>,true)}{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}</div></div>}
    {tab==="account"&&<div className="space-y-4"><h3 className="text-sm font-bold">تفاصيل الذمم</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field("اسم العميل",<Input readOnly value={selectedCustomer?.name||""}/>)}{currencyField("account")}{amountField("account")}</div></div>}
    {tab==="gift_card"&&<div className="space-y-4"><h3 className="text-sm font-bold">بطاقة الهدية</h3><div className="grid gap-3 sm:grid-cols-2">{field("رقم بطاقة الهدية",<Input value={payment?.reference||""} onChange={event=>onPaymentField("gift_card","reference",event.target.value)}/>,true)}{amountField("gift_card")}</div></div>}
   </div>}
   <div className="space-y-2 rounded-xl border border-blue-200 bg-white p-3 text-sm sm:p-4"><div className="flex justify-between"><span>مبلغ الفاتورة</span><strong>{money(total)} {currencyCode}</strong></div><div className="flex justify-between"><span>المبلغ المدفوع</span><strong>{money(paid)} {currencyCode}</strong></div><div className="flex justify-between border-t border-blue-500 pt-2 text-lg font-black"><span className={remaining>0.009?"text-red-600":"text-emerald-700"}>{changeDue>0.009?"المبلغ للإرجاع":"المبلغ المتبقي"}</span><span>{money(changeDue>0.009?changeDue:Math.max(0,remaining))} {currencyCode}</span></div></div>
  </div>
  <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t bg-white p-3"><Button onClick={onConfirm} disabled={busy} className="bg-green-600 hover:bg-green-700"><Check className="ml-1 h-4 w-4"/>موافق F3</Button><Button onClick={onConfirm} disabled={busy} className="bg-green-600 hover:bg-green-700"><Check className="ml-1 h-4 w-4"/>قبض متعدد F8</Button><Button variant="destructive" onClick={()=>onOpenChange(false)}><X className="ml-1 h-4 w-4"/>إغلاق Esc</Button></div>
 </DialogContent></Dialog>
}
