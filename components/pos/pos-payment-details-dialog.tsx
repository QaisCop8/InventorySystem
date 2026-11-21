"use client"

import { tr, appDir } from "@/lib/i18n"
import {useEffect,useRef,useState,type ReactNode} from "react"
import {useNoAutoKeyboard} from "./camera-barcode-scanner"
import {WorkspaceDialogProvider,useWorkspaceDialog} from "@/contexts/workspace-dialog-context"
import {Banknote,Check,CreditCard,HeartHandshake,Loader2,WalletCards,X} from "lucide-react"
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import {PosDialogMessages} from "./pos-dialog-messages"
import {PinpadPayButton} from "@/components/pinpad/pinpad-pay-button"
import type {PinpadResult} from "@/lib/pinpad"

export type PaymentMethod="cash"|"cheque"|"card"|"account"|"gift_card"|"aid_voucher"
export type CurrencyOption={currency_id:number;currency_code:string;currency_name:string;rate_to_point:number}
export type LookupOption={id:number;name:string;code?:string;bank_id?:number;accountId?:number|null;pinpadMachineId?:number|null}
export type PaymentDetail={method:PaymentMethod;amount:number;currency_id?:number;currency_amount?:number;reference:string;due_date?:string;bank_id?:number;branch_id?:number;cheque_account?:string;card_type_id?:number;card_expiry?:string;pinpad?:PinpadResult;aid_pin?:string}

type Props={
 open:boolean;onOpenChange:(open:boolean)=>void;mode:"sale"|"return"|"gift";total:number;currencyCode:string;pointCurrencyId:number;
 currencies:CurrencyOption[];customers:LookupOption[];customerId:number|null;onCustomerChange:(id:number|null)=>void;
 // عميل اختير من دليل الحسابات وليس في قائمة عملاء الكتالوج (كتالوج قديم/محفوظ قبل تعريفه) — يضيفه المستدعي ثم يختاره
 onCustomerAccount?:(account:{id:number;code?:string;name:string})=>void;
 banks:LookupOption[];branches:LookupOption[];cardTypes:LookupOption[];
 payments:PaymentDetail[];cashAmounts:Record<number,number>;onCashChange:(id:number,value:number)=>void;
 onPaymentAmount:(method:PaymentMethod,value:number,currencyId?:number)=>void;
 onPaymentField:(method:PaymentMethod,field:keyof PaymentDetail,value:string|number|PinpadResult|undefined)=>void;
 pinpadBatch?:string|number;
 // قسيمة مساعدة (lib/aid-program.ts): تظهر فقط إن وُجد نشاط فعّال للنقطة اليوم. aidLines = أصناف السلة بمبالغها بعد الخصومات
 aidPointId?:number|null;aidLines?:{product_id:number;amount:number}[];
 onConfirm:()=>void;onSavedClose?:()=>boolean;busy:boolean;error:string;
 /** طرق دفع لا تظهر (المطعم: بلا شيك ولا ذمم) — اختصاراتها تتعطل معها */
 hiddenMethods?:PaymentMethod[];
}

const round=(value:number)=>Math.round(value*100)/100
const money=(value:number)=>round(value).toFixed(2)
const today=()=>new Date().toISOString().slice(0,10)
const selectAllOnFocus=(event: React.FocusEvent<HTMLInputElement>)=>{
 event.currentTarget.select()
}

export function PosPaymentDetailsDialog(props:Props){
 const {open,onOpenChange,mode,total,currencyCode,pointCurrencyId,currencies,customers,customerId,onCustomerChange,onCustomerAccount,banks,branches,cardTypes,payments,cashAmounts,onCashChange,onPaymentAmount,onPaymentField,onConfirm,onSavedClose,busy,error,pinpadBatch,aidPointId,aidLines,hiddenMethods}=props
 const [pinpadError,setPinpadError]=useState("")
 const [tab,setTab]=useState<PaymentMethod>("cash")
 const [aidCode,setAidCode]=useState(""),[aidPin,setAidPin]=useState(""),[aidBusy,setAidBusy]=useState(false),[aidError,setAidError]=useState("")
 const [aidInfo,setAidInfo]=useState<{participant_name:string;activity_name:string;balance:number;available:number}|null>(null)
 const amountInputRef=useRef<HTMLInputElement>(null)
 // الجوال: النافذة على الشاشة كلها (fixed) لا داخل مساحة التبويب — كانت بعرض الشاشة داخل تبويب أضيق فيُقصّ طرفاها
 const workspaceDialog=useWorkspaceDialog(),[phone,setPhone]=useState(false)
 useEffect(()=>{const query=window.matchMedia("(max-width: 767px)");const sync=()=>setPhone(query.matches);sync();query.addEventListener("change",sync);return()=>query.removeEventListener("change",sync)},[])
 // الجوال: التركيز على المبلغ دون فتح لوحة المفاتيح (لوحة الأرقام في الشاشة) — تفتح فقط عند لمس الحقل
 const amountKeyboard=useNoAutoKeyboard("decimal")
 const confirmButtonRef=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!open)return;setTab("cash");setAidCode("");setAidPin("");setAidInfo(null);setAidError("");requestAnimationFrame(()=>{amountInputRef.current?.focus();amountInputRef.current?.select()})},[open])
 const entries:ReadonlyArray<{key:PaymentMethod;label:string;shortcut:string;icon:typeof Banknote}>=[
  {key:"cash",label:tr("نقدي"),shortcut:"F4",icon:Banknote},{key:"cheque",label:tr("شيك"),shortcut:"F5",icon:WalletCards},
  {key:"card",label:tr("فيزا"),shortcut:"F6",icon:CreditCard},{key:"account",label:tr("ذمم"),shortcut:"F7",icon:Check},
  ...(aidPointId?[{key:"aid_voucher" as const,label:tr("قسيمة مساعدة"),shortcut:"F8",icon:HeartHandshake}]:[]),
 ]
 const tabs=entries.filter(entry=>!hiddenMethods?.includes(entry.key)).filter(entry=>mode==="return"?["cash","account"].includes(entry.key):mode==="gift"?false:entry.key!=="aid_voucher"||mode==="sale")
 const payment=payments.find(row=>row.method===tab)
 const paid=round(payments.reduce((sum,row)=>sum+Number(row.amount||0),0))
 const remaining=round(total-paid)
 const changeDue=mode==="sale"?Math.max(0,-remaining):0
 const selectedCustomer=customers.find(row=>row.id===customerId)
 const selectedBank=Number(payment?.bank_id||0)
 const pinpadMachine=tab==="card"?Number(cardTypes.find(row=>row.id===Number(payment?.card_type_id))?.pinpadMachineId||0):0
 const field=(label:string,content:ReactNode,required=false)=><div className="min-w-0 space-y-1.5"><Label className="text-xs font-semibold text-slate-700">{label}{required&&<span className="ms-1 text-red-600">*</span>}</Label>{content}</div>
 const currencyField=(method:PaymentMethod,disabled=false)=>field(tr("العملة"),<Select value={String(payment?.currency_id||pointCurrencyId)} disabled={disabled} onValueChange={value=>onPaymentAmount(method,Number(payment?.currency_amount??payment?.amount??0),Number(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{currencies.map(row=><SelectItem key={row.currency_id} value={String(row.currency_id)}>{row.currency_code} — {row.currency_name}</SelectItem>)}</SelectContent></Select>,true)
 const amountField=(method:PaymentMethod)=>field(tr("المبلغ"),<Input type="number" disabled={method==="card"&&!!payment?.pinpad} min="0" step="0.01" value={payment?.currency_amount??payment?.amount??0} onFocus={selectAllOnFocus} onChange={event=>onPaymentAmount(method,Number(event.target.value))}/>,true)
 const customerField=field(tr("رقم العميل"),<AutoCompleteAccount voucherCurrencyId={Number(pointCurrencyId) || null} label="" value={String(customers.find(row=>row.id===customerId)?.accountId||"")} valueMode="id" onValueChange={()=>undefined} onAccountSelect={account=>{const selected=account?customers.find(row=>row.accountId===account.id||row.id===account.id):undefined;if(!selected&&account&&onCustomerAccount){onCustomerAccount({id:Number(account.id),code:String(account.code||""),name:String(account.name||"")});return}onCustomerChange(selected?.id??null)}} requiredTypeValues={[2,3,5]} searchAllowedTypeValues={[2,3,5]} showCostCenterButton={false} className="w-full" placeholder={tr("ابحث عن العميل")}/>,tab==="account"||tab==="cheque")
 // أي تعديل على الرمز/الرقم السري يُلغي التحقق السابق ومبلغه — الخادم يعيد التحقق عند الحفظ على أي حال
 const resetAid=()=>{if(aidInfo||payments.some(row=>row.method==="aid_voucher"&&row.amount>0)){setAidInfo(null);onPaymentAmount("aid_voucher",0)}}
 const verifyAid=async()=>{
  setAidError("");if(!/^\d{10}$/.test(aidCode)||!/^\d{4}$/.test(aidPin)){setAidError(tr("أدخل رمز الصرف (10 أرقام) والرقم السري (4 أرقام)"));return}
  setAidBusy(true)
  try{
   const response=await fetch("/api/aid/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({point_id:aidPointId,code:aidCode,pin:aidPin,lines:aidLines||[]})})
   const data=await response.json().catch(()=>({}))
   if(!response.ok){setAidInfo(null);setAidError(String(data?.error||"تعذر التحقق من الرمز"));return}
   setAidInfo(data)
   const others=round(payments.filter(row=>row.method!=="aid_voucher").reduce((sum,row)=>sum+Number(row.amount||0),0))
   onPaymentField("aid_voucher","reference",aidCode);onPaymentField("aid_voucher","aid_pin",aidPin)
   onPaymentAmount("aid_voucher",round(Math.max(0,Math.min(Number(data.available)||0,total-others))),pointCurrencyId)
  }catch{setAidError(tr("تعذر الاتصال بالخادم — قسيمة المساعدة تتطلب اتصالاً بالإنترنت"))}
  finally{setAidBusy(false)}
 }
 const onKeyDown=(event:React.KeyboardEvent)=>{const key=event.key.toUpperCase();if(key==="ENTER"&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey){const target=event.target as HTMLElement;if(target.tagName!=="TEXTAREA"&&target.tagName!=="BUTTON"){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), button:not([role="tab"]):not([data-dialog-close])')).filter(control=>control.offsetParent!==null);const index=controls.indexOf(target);if(index>=0){event.preventDefault();event.stopPropagation();(controls[index+1]||confirmButtonRef.current)?.focus();return}}}const target=entries.find(entry=>entry.shortcut===key&&tabs.some(t=>t.key===entry.key));if(target){event.preventDefault();event.stopPropagation();setTab(target.key)}else if(key==="F3"){event.preventDefault();event.stopPropagation();if(!busy)onConfirm()}}
 // ───── تصميم A (2026-11-20، اختاره المستخدم من المعاينة): لوحة جانبية داكنة بالمبالغ وطرق الدفع، ولوحة عمل
 // بالمبلغ الكبير + أزرار سريعة + لوحة أرقام للنقدي. باقي طرق الدفع (شيك/فيزا/ذمم/قسيمة) بنفس حقولها في لوحة العمل.
 const [cashCurrency,setCashCurrency]=useState<number>(0)
 const [cashEntry,setCashEntry]=useState<string|null>(null)
 useEffect(()=>{if(!open)return;setCashCurrency(Number(pointCurrencyId)||Number(currencies[0]?.currency_id)||0);setCashEntry(null)},[open,pointCurrencyId,currencies])
 const activeCash=currencies.find(row=>row.currency_id===cashCurrency)||currencies[0]
 const activeCashId=Number(activeCash?.currency_id||0)
 const activeRate=Number(activeCash?.rate_to_point||1)||1
 const activeAmount=Number(cashAmounts[activeCashId]||0)
 const setCash=(text:string)=>{setCashEntry(text);onCashChange(activeCashId,Number(text)||0)}
 const pickCurrency=(id:number)=>{setCashCurrency(id);setCashEntry(null);requestAnimationFrame(()=>{amountInputRef.current?.focus();amountInputRef.current?.select()})}
 // «المبلغ كاملاً»: المتبقي (بعد بقية الدفعات) بعملة الخانة المختارة
 const fillRemaining=()=>{const others=round(paid-activeAmount*activeRate);const value=round(Math.max(0,total-others)/activeRate);setCashEntry(null);onCashChange(activeCashId,value)}
 const addNote=(note:number)=>{setCashEntry(null);onCashChange(activeCashId,round(activeAmount+note))}
 // المؤشر دائماً بعد آخر رقم (يمين المبلغ) بعد أي كتابة/لوحة أرقام — كان يبقى قبل المبلغ
 const amountText=cashEntry??(activeAmount?String(activeAmount):"0")
 useEffect(()=>{const el=amountInputRef.current;if(!el||document.activeElement!==el||el.selectionStart!==el.selectionEnd)return;const end=el.value.length;if(el.selectionStart!==end)el.setSelectionRange(end,end)},[amountText])
 const pressKey=(key:string)=>{
  const base=cashEntry??""
  if(key==="back"){setCash((cashEntry??(activeAmount?String(activeAmount):"")).slice(0,-1));return}
  if(key==="."){if(base.includes("."))return;setCash((base||"0")+".");return}
  const next=(base==="0"?"":base)+key
  if(/\.\d{3,}$/.test(next))return
  setCash(next)
 }
 const methodTone=(key:PaymentMethod)=>payments.some(row=>row.method===key&&Number(row.amount)>0)
 const isSale=mode==="sale"
 return <WorkspaceDialogProvider container={phone?null:workspaceDialog.container} confined={phone?false:workspaceDialog.confined}><Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir={appDir()} onKeyDown={onKeyDown} onPointerDownOutside={event=>event.preventDefault()} onInteractOutside={event=>event.preventDefault()} onOpenAutoFocus={event=>{event.preventDefault();requestAnimationFrame(()=>{amountInputRef.current?.focus();amountInputRef.current?.select()})}} onCloseAutoFocus={event=>{if(onSavedClose?.())event.preventDefault()}} hideCloseButton className="pos-payment-dialog flex h-[min(calc(100%-1rem),calc(100dvh-1rem))] max-h-[min(calc(100%-1rem),calc(100dvh-1rem))] w-[min(calc(100%-1rem),calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[26px] border-0 p-0 text-slate-900 sm:h-[min(640px,calc(100dvh-1.5rem))] sm:w-[min(calc(100%-1.5rem),96vw,980px)]">
  <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
   {/* ── اللوحة الجانبية: المبالغ وطرق الدفع ── */}
   <aside className="flex min-h-0 flex-col gap-3 bg-[#24453a] p-4 text-white md:p-5">
    <DialogHeader className="flex flex-row items-center gap-3 space-y-0 text-start">
     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><WalletCards className="h-5 w-5"/></span>
     <div className="min-w-0 flex-1"><DialogTitle className="truncate text-base font-black text-white">{mode==="return"?tr("تفاصيل الاسترجاع"):mode==="gift"?tr("تأكيد الهدية"):tr("تفاصيل الدفع")}</DialogTitle><DialogDescription className="text-xs text-white/70">{tr("مبلغ الفاتورة")}</DialogDescription></div>
     <button type="button" data-dialog-close aria-label={tr("إغلاق")} onClick={()=>onOpenChange(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:hidden"><X className="h-4 w-4"/></button>
    </DialogHeader>
    <div className="text-4xl font-black tabular-nums tracking-wide md:text-5xl" dir="ltr" style={{textAlign:"end"}}>{money(total)}<small className="ms-1.5 text-sm font-bold text-white/60">{currencyCode}</small></div>
    {mode!=="gift"&&<div className="grid grid-cols-3 gap-2 md:grid-cols-1">
     <div className="flex flex-col justify-between rounded-2xl bg-white/10 px-3 py-2 font-bold md:flex-row md:items-center md:py-3"><span className="text-xs md:text-sm">{tr("المدفوع")}</span><span className="tabular-nums" dir="ltr">{money(paid)}</span></div>
     <div className={`flex flex-col justify-between rounded-2xl px-3 py-2 font-black md:flex-row md:items-center md:py-3 ${remaining>0.009?"bg-[#ef6f4c]":"bg-emerald-500/80"}`}><span className="text-xs md:text-sm">{tr("المتبقي")}</span><span className="tabular-nums" dir="ltr">{money(Math.max(0,remaining))}</span></div>
     <div className={`flex flex-col justify-between rounded-2xl px-3 py-2 font-black md:flex-row md:items-center md:py-3 ${changeDue>0.009?"bg-[#dcefe6] text-[#24453a]":"bg-white/5 text-white/60"}`}><span className="text-xs md:text-sm">{isSale?tr("الباقي للزبون"):tr("المبلغ للإرجاع")}</span><span className="tabular-nums" dir="ltr">{money(changeDue)}</span></div>
    </div>}
    {mode!=="gift"&&<div role="tablist" aria-label={tr("طرق الدفع")} className="mt-auto grid grid-cols-2 gap-2 max-md:grid-cols-4">
     {tabs.map(entry=><button key={entry.key} type="button" role="tab" aria-selected={tab===entry.key} onClick={()=>setTab(entry.key)}
      className={`relative flex min-w-0 items-center gap-2 rounded-2xl px-3 py-3 text-sm font-black transition ${tab===entry.key?"bg-white text-[#24453a] shadow":"bg-white/10 text-white hover:bg-white/20"}`}>
      <entry.icon className="h-4 w-4 shrink-0"/><span className="truncate">{entry.label}</span><span className="ms-auto hidden text-[10px] font-semibold opacity-60 sm:inline">{entry.shortcut}</span>
      {methodTone(entry.key)&&<span className="absolute -top-1 end-1 h-2.5 w-2.5 rounded-full bg-[#ef6f4c] ring-2 ring-[#24453a]"/>}
     </button>)}
    </div>}
   </aside>

   {/* ── لوحة العمل ── */}
   <section className="flex min-h-0 flex-col bg-[#f8f5ef]">
    <PosDialogMessages error={error} open={open}/>
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
     {mode==="gift"?<p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold">{tr("سيُنشأ سند إخراج للهدية دون دفعة مالية.")}</p>:<div role="tabpanel">
      {tab==="cash"&&<div className="flex h-full flex-col gap-3">
       {currencies.length>1&&<div className="grid gap-2" style={{gridTemplateColumns:`repeat(${Math.min(currencies.length,4)},minmax(0,1fr))`}}>
        {currencies.map(row=>{const amount=Number(cashAmounts[row.currency_id]||0);const on=row.currency_id===activeCashId;return <button key={row.currency_id} type="button" onClick={()=>pickCurrency(row.currency_id)}
         className={`relative rounded-2xl border-2 bg-white px-2 py-2 text-center transition ${on?"border-[#3b7a66] text-[#3b7a66]":"border-transparent text-slate-700 hover:border-slate-200"}`}>
         <b className="block text-sm font-black">{row.currency_code}</b><small className="block text-[11px] text-slate-500 tabular-nums" dir="ltr">{row.rate_to_point.toFixed(4)}</small>
         {amount>0&&<span className="absolute -top-2 end-2 rounded-full bg-[#ef6f4c] px-1.5 text-[10px] font-black text-white tabular-nums" dir="ltr">{money(amount)}</span>}
        </button>})}
       </div>}
       <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#3b7a66] bg-white px-4 py-2">
        <span className="shrink-0 text-sm font-bold text-slate-500">{tr("المبلغ المستلم")} <b className="text-slate-700">{activeCash?.currency_code}</b>{activeRate!==1&&<small className="ms-2 font-semibold tabular-nums" dir="ltr">= {money(activeAmount*activeRate)} {currencyCode}</small>}</span>
        <input ref={amountInputRef} aria-label={tr("مبلغ {0}", activeCash?.currency_code||"")} {...amountKeyboard.props} autoComplete="off" dir="ltr"
         value={cashEntry??(activeAmount?String(activeAmount):"0")} onFocus={selectAllOnFocus}
         onChange={event=>{const text=event.target.value.replace(/[^\d.]/g,"");setCash(text)}}
         onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();setCashEntry(null);confirmButtonRef.current?.focus()}}}
         className="min-w-0 flex-1 bg-transparent text-left text-4xl font-black tabular-nums outline-none"/>
       </label>
       <div className="grid grid-cols-5 gap-2">
        <button type="button" onClick={fillRemaining} className="rounded-xl bg-[#dcefe6] px-1 py-3 text-xs font-black text-[#24453a] sm:text-sm">{tr("المبلغ كاملاً")}</button>
        {[20,50,100,200].map(note=><button key={note} type="button" onClick={()=>addNote(note)} className="rounded-xl bg-white py-3 font-black shadow-[0_6px_14px_-12px_rgba(0,0,0,.6)] hover:bg-slate-50">+{note}</button>)}
       </div>
       <div className="grid min-h-[200px] flex-1 grid-cols-3 gap-2">
        {["7","8","9","4","5","6","1","2","3",".","0","back"].map(key=><button key={key} type="button" onClick={()=>pressKey(key)} aria-label={key==="back"?tr("حذف"):key}
         className="grid place-items-center rounded-xl bg-white text-xl font-black text-slate-800 shadow-[0_6px_14px_-12px_rgba(0,0,0,.6)] active:scale-95">{key==="back"?<span aria-hidden>⌫</span>:key}</button>)}
       </div>
      </div>}
      {tab!=="cash"&&<div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
       {tab==="cheque"&&<div className="space-y-4"><h3 className="text-sm font-bold">{tr("تفاصيل الشيك")}</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field(tr("اسم العميل"),<Input readOnly value={selectedCustomer?.name||""}/>)}{field(tr("رقم الحساب"),<Input value={payment?.cheque_account||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","cheque_account",event.target.value)}/>,true)}{field(tr("رقم الشيك"),<Input value={payment?.reference||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","reference",event.target.value)}/>,true)}{amountField("cheque")}{field(tr("تاريخ الاستحقاق"),<Input type="date" min={today()} value={payment?.due_date||today()} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("cheque","due_date",event.target.value)}/>,true)}{currencyField("cheque")}{field(tr("البنك"),<Select value={payment?.bank_id?String(payment.bank_id):"none"} onValueChange={value=>{onPaymentField("cheque","bank_id",Number(value));onPaymentField("cheque","branch_id",0)}}><SelectTrigger><SelectValue placeholder={tr("اختر البنك")}/></SelectTrigger><SelectContent><SelectItem value="none">{tr("اختر البنك")}</SelectItem>{banks.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}{field(tr("الفرع"),<Select value={payment?.branch_id?String(payment.branch_id):"none"} onValueChange={value=>onPaymentField("cheque","branch_id",Number(value))}><SelectTrigger><SelectValue placeholder={tr("اختر الفرع")}/></SelectTrigger><SelectContent><SelectItem value="none">{tr("اختر الفرع")}</SelectItem>{branches.filter(row=>!row.bank_id||row.bank_id===selectedBank).map(row=><SelectItem key={row.id} value={String(row.id)}>{row.code} — {row.name}</SelectItem>)}</SelectContent></Select>,true)}</div></div>}
       {tab==="card"&&<div className="space-y-4"><h3 className="text-sm font-bold">{tr("تفاصيل البطاقة")}</h3><div className="grid gap-3 sm:grid-cols-2">{currencyField("card")}{field(tr("اسم البطاقة"),<Select value={payment?.card_type_id?String(payment.card_type_id):"none"} disabled={!!payment?.pinpad} onValueChange={value=>{onPaymentField("card","card_type_id",Number(value));setPinpadError("")}}><SelectTrigger><SelectValue placeholder={tr("اختر البطاقة")}/></SelectTrigger><SelectContent><SelectItem value="none">{tr("اختر البطاقة")}</SelectItem>{cardTypes.map(row=><SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent></Select>,true)}{amountField("card")}{field(tr("رقم البطاقة"),<Input inputMode="numeric" maxLength={23} autoComplete="off" placeholder={tr("رقم البطاقة")} readOnly={!!payment?.pinpad} value={payment?.reference||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("card","reference",event.target.value)}/>,true)}{field(tr("تاريخ الانتهاء"),<Input type="month" value={payment?.card_expiry||""} onFocus={selectAllOnFocus} onChange={event=>onPaymentField("card","card_expiry",event.target.value)}/>,true)}{customerField}{field(tr("اسم العميل"),<Input readOnly value={selectedCustomer?.name||""}/>)}</div>{pinpadMachine>0&&<div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3">{payment?.pinpad?<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span className="font-bold text-emerald-700">{tr("✓ تمت العملية على الجهاز")}</span><span>{tr("رقم الموافقة: ")}<b dir="ltr">{payment.pinpad.auth_code||"-"}</b></span>{payment.pinpad.trans_id&&<span>{tr("رقم الحركة: ")}<b dir="ltr">{payment.pinpad.trans_id}</b></span>}{payment.pinpad.terminal_id&&<span>{tr("الجهاز: ")}<b dir="ltr">{payment.pinpad.terminal_id}</b></span>}<button type="button" className="ms-auto text-rose-600 underline" onClick={()=>{onPaymentField("card","pinpad",undefined);onPaymentField("card","reference","")}}>{tr("إلغاء الربط والإدخال يدوياً")}</button></div>:<><p className="text-xs text-slate-600">{tr("هذه البطاقة مربوطة بجهاز الدفع — اضغط «إرسال للجهاز» ليُرسل المبلغ ويمرّر العميل بطاقته، أو أدخل البيانات يدوياً.")}</p><PinpadPayButton machineId={pinpadMachine} amount={Number(payment?.currency_amount??payment?.amount??0)} currency={currencyCode} batch={pinpadBatch??""} onError={setPinpadError} onSuccess={result=>{setPinpadError("");onPaymentField("card","pinpad",result);onPaymentField("card","reference",result.card_number||result.auth_code)}}/></>}{pinpadError&&<p role="alert" className="rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">{pinpadError}</p>}</div>}</div>}
       {tab==="account"&&<div className="space-y-4"><h3 className="text-sm font-bold">{tr("تفاصيل الذمم")}</h3><div className="grid gap-3 sm:grid-cols-2">{customerField}{field(tr("اسم العميل"),<Input readOnly value={selectedCustomer?.name||""}/>)}{currencyField("account")}{amountField("account")}</div></div>}
       {tab==="aid_voucher"&&<div className="space-y-4"><h3 className="text-sm font-bold">{tr("قسيمة مساعدة")}</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto] sm:items-end">
         {field(tr("رمز الصرف"),<Input dir="ltr" inputMode="numeric" autoComplete="off" maxLength={10} placeholder={tr("10 أرقام")} value={aidCode} onFocus={selectAllOnFocus} onChange={event=>{setAidCode(event.target.value.replace(/\D/g,"").slice(0,10));resetAid()}}/>,true)}
         {field(tr("الرقم السري"),<Input type="password" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" value={aidPin} onFocus={selectAllOnFocus} onChange={event=>{setAidPin(event.target.value.replace(/\D/g,"").slice(0,4));resetAid()}}/>,true)}
         <Button type="button" onClick={()=>void verifyAid()} disabled={aidBusy} className="h-10">{aidBusy?<Loader2 className="me-1 h-4 w-4 animate-spin"/>:<Check className="me-1 h-4 w-4"/>}{tr("تحقق")}</Button>
        </div>
        {aidError&&<p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{aidError}</p>}
        {aidInfo&&<div className="grid gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm sm:grid-cols-2">
         <div><span className="text-xs text-slate-500">{tr("المستفيد")}</span><p className="font-bold">{aidInfo.participant_name}</p></div>
         <div><span className="text-xs text-slate-500">{tr("النشاط")}</span><p className="font-bold">{aidInfo.activity_name}</p></div>
         <div><span className="text-xs text-slate-500">{tr("الرصيد")}</span><p className="font-black tabular-nums" dir="ltr">{money(aidInfo.balance)} {currencyCode}</p></div>
         <div><span className="text-xs text-slate-500">{tr("المتاح لأصناف هذه الفاتورة")}</span><p className="font-black tabular-nums text-emerald-700" dir="ltr">{money(aidInfo.available)} {currencyCode}</p></div>
        </div>}
        {aidInfo&&<div className="grid gap-3 sm:grid-cols-2">{field(tr("المبلغ من القسيمة"),<Input type="number" min="0" step="0.01" max={aidInfo.available} value={payment?.amount??0} onFocus={selectAllOnFocus} onChange={event=>onPaymentAmount("aid_voucher",Math.min(Number(event.target.value)||0,aidInfo.available),pointCurrencyId)}/>,true)}<p className="self-end pb-2 text-xs text-slate-500">{tr("ما يزيد عن المتاح يُدفع بطريقة أخرى (نقدي/بطاقة).")}</p></div>}
       </div>}
      </div>}
     </div>}
    </div>
    <div className="pos-payment-dialog-footer flex shrink-0 gap-2 border-t border-black/5 bg-[#f8f5ef] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
     <Button data-dialog-close onClick={()=>onOpenChange(false)} className="pos-payment-close h-12 px-5"><X className="me-1 h-4 w-4"/>{tr("إغلاق Esc")}</Button>
     <Button ref={confirmButtonRef} onClick={onConfirm} disabled={busy} className="h-12 flex-1 rounded-2xl border-0 bg-[#ef6f4c] text-base font-black text-white hover:bg-[#e2603d]">{busy?<Loader2 className="me-1 h-5 w-5 animate-spin"/>:<Check className="me-1 h-5 w-5"/>}{mode==="gift"?tr("تأكيد F3"):tr("تأكيد الدفع F3")}</Button>
    </div>
   </section>
  </div>
 </DialogContent></Dialog></WorkspaceDialogProvider>
}
