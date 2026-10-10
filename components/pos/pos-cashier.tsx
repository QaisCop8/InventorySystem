"use client"

import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { repricePosCart } from "@/lib/pos-customer-prices"
import { applyPosCampaigns, type PosCampaign, type PosCampaignLine, type PosCampaignUsage } from "@/lib/pos-campaigns"

import "./pos-workspace.css"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { posCartLineKey } from "@/lib/pos-cart"
import { validatePosAccounts } from "@/lib/pos-account-validation"
import { isScaleProduct, resolvePosBarcode } from "@/lib/scale-barcode"
import {PosDiscountDialog,PosItemDiscountDialog} from "./pos-discount-dialog"
import {PosPartyPicker,PosPartyButton,type PosParty} from "./pos-party-picker"
import {PosStartSessionDialog} from "./pos-start-session-dialog"
import {PosHandoverDialog} from "./pos-handover-dialog"
import {PosPaymentDetailsDialog,type PaymentDetail} from "./pos-payment-details-dialog"
import {PosInvoiceHistoryDialog,type PosInvoice} from "./pos-invoice-history-dialog"
import {PosItemSearchDialog} from "./pos-item-search-dialog"
import { playPosBeep } from "@/lib/pos-beeps"
import {PosReturnFromInvoiceDialog,type ReturnSourceInvoice,type SelectedReturnItem} from "./pos-return-from-invoice-dialog"

import {useCallback,useEffect,useMemo,useRef,useState} from "react"
import {ArrowDownToLine,ArrowUpFromLine,ArrowLeft,Banknote,Barcode,Bookmark,ChevronLeft,ChevronRight,ChevronsLeft,ChevronsRight,Clock3,CreditCard,FolderOpen,Gift,HandCoins,History,Minus,PackageOpen,Pencil,Percent,Plus,Printer,RefreshCw,RotateCcw,Save,Search,ShoppingBag,ShoppingCart,StickyNote,Trash2,UserRound,WalletCards,Warehouse,Wifi,WifiOff,X} from "lucide-react"
import {useAuth} from "@/components/auth/auth-context"
import {Button} from "@/components/ui/button"
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select"
import {cn} from "@/lib/utils"
import {useToast} from "@/hooks/use-toast"
import {currentPosTenantKey,listPosSales,loadPosCatalog,markPosSaleFailed,queuePosSale,removePosSale,savePosCatalog,type PosQueuedSale} from "@/lib/pos-offline"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"

type BarcodeOption={barcode:string;price:number;unitId:number|null;unitName:string}
type Product={unitPrices?:{unitId:number|null;price:number;unitName?:string}[];soldUsingScale:boolean;id:number;code:string;name:string;barcode:string;price:number;unitId:number|null;unitName:string;accountId:number|null;returnAccountId:number|null;category:string;image?:string;available:number;barcodeOptions:BarcodeOption[]}
type CartLine=Product&{quantity:number;discount:number;gift:boolean;lineId?:string;campaign_discount?:number;campaign_id?:number|null;returnSalesInvoiceId?:number;quantityAdjusted?:boolean}
type Customer={pricecategory?:number;id:number;name:string;code?:string;mobile1?:string;address?:string;accountId:number|null}
type Point=Record<string,any>&{id:number;name:string;code:string;warehouse_name:string;currency_name:string;currency_code:string}
type Session=Record<string,any>&{id:number;expected_cash:number;opening_cash:number;payments?:any[];movements?:any[]}
type Currency={currency_id:number;currency_code:string;currency_name:string;rate_to_point:number;exchange_rate:number}
type Catalog={point:Point|null;taxRate:number;receiptSettings:Record<string,string>;products:Product[];customers:Customer[];salesmen?:PosParty[];currencies:Currency[];banks:PosParty[];bankBranches:(PosParty&{bank_id?:number})[];cardTypes:(PosParty&{currency_id:number})[];campaigns?:PosCampaign[];campaignUsage?:PosCampaignUsage;session:Session|null}
type PaymentKey="cash"|"card"|"cheque"|"account"|"gift_card"
type Payment=PaymentDetail
type Receipt={code:string;total:number;pending:boolean;lines:CartLine[];mode:"sale"|"return"|"gift";date:string;customerName:string;customerPhone?:string;customerAddress?:string;note:string;subtotal:number;itemDiscount:number;invoiceDiscount:number;tax:number;payments:Payment[];refundAmount:number;currencyCode:string;pointName:string}|null
const EMPTY:Catalog={point:null,taxRate:0,receiptSettings:{},products:[],customers:[],currencies:[],banks:[],bankBranches:[],cardTypes:[],campaigns:[],campaignUsage:{},session:null}
const round=(n:number)=>Math.round(n*100)/100
const localDate=(date=new Date())=>{const pad=(value:number)=>String(value).padStart(2,"0");return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
const localDateTime=(date=new Date())=>{const pad=(value:number)=>String(value).padStart(2,"0");return `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`}
const today=()=>localDate()
const makeId=()=>globalThis.crypto?.randomUUID?.()||`pos-${Date.now()}-${Math.random().toString(16).slice(2)}`
const paymentLabels:Record<PaymentKey,string>={cash:"نقدي",card:"بطاقة",cheque:"شيك",account:"على الحساب",gift_card:"بطاقة هدية"}
const paymentIcons:Record<PaymentKey,any>={cash:Banknote,card:CreditCard,cheque:WalletCards,account:UserRound,gift_card:Gift}
const errorText=(d:any,f:string)=>String(d?.error||d?.message||f)
const isMobilePrintDevice=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)
const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]||char))
const receiptHtml=(receipt:NonNullable<Receipt>,settings:Record<string,string>,cashierName:string,taxRate:number)=>{
 const money=(value:number)=>Number(value||0).toFixed(2)
 const items=receipt.lines.map((line,index)=>`<tr><td class="item"><span class="index">${index+1}</span><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.code)}${line.unitName?` · ${escapeHtml(line.unitName)}`:""}</small></td><td>${money(line.quantity)}</td><td>${money(line.price)}</td><td>${money(line.price*line.quantity*line.discount/100)}</td><td>${money(Number(line.campaign_discount||0))}</td><td class="amount">${money(line.price*line.quantity*(1-line.discount/100)-Number(line.campaign_discount||0))}</td></tr>`).join("")
 const payments=receipt.payments.filter(row=>row.amount>0).map(row=>`<div class="payment"><span>${escapeHtml(paymentLabels[row.method]||row.method)}${row.reference?` · ${escapeHtml(row.reference)}`:""}</span><b>${money(row.amount)} ${escapeHtml(receipt.currencyCode)}</b></div>`).join("")
 const logo=settings.company_logo?`<img class="logo" src="${escapeHtml(settings.company_logo)}" alt="">`:""
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf2f4;color:#172c37;font-family:"Segoe UI",Tahoma,Arial,sans-serif}.sheet{width:min(100%,760px);margin:auto;background:#fff;border:1px solid #dce5e9;border-radius:18px;overflow:hidden;box-shadow:0 16px 48px #18374718}.top{height:8px;background:linear-gradient(90deg,#10a889,#087f73,#174b5a)}.content{padding:30px}.brand{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid #e4ecef}.company{display:flex;align-items:center;gap:14px}.logo{max-width:88px;max-height:64px;object-fit:contain}.company h1{margin:0;font-size:20px}.company p,.meta small,.muted{margin:5px 0 0;color:#71838c;font-size:12px}.badge{padding:9px 13px;border-radius:999px;background:#e8f5f1;color:#087f73;font-size:12px;font-weight:700}.title{display:flex;align-items:end;justify-content:space-between;gap:20px;padding:22px 0}.title h2{margin:0;font-size:24px}.code{text-align:left}.code small{display:block;color:#71838c;font-size:11px}.code strong{font:700 18px Consolas,monospace;color:#087f73}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px}.meta>div{padding:12px;border:1px solid #e3eaed;border-radius:11px;background:#fafcfc}.meta b{display:block;margin-top:5px;font-size:13px}.table-wrap{overflow:auto;border:1px solid #dce5e9;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:680px}th{padding:11px 12px;background:#173b49;color:white;text-align:right;font-size:11px}td{padding:12px;border-bottom:1px solid #e7edef;font-size:12px}tbody tr:nth-child(even){background:#f7fafb}.item strong,.item small{display:block}.item small{margin-top:4px;color:#71838c;font-size:10px}.index{display:inline-grid;place-items:center;width:22px;height:22px;margin-left:7px;border-radius:7px;background:#e7f4f0;color:#087f73;font-size:10px;font-weight:700}.amount{font-weight:700;white-space:nowrap}.summary{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:22px;margin-top:22px}.notes{padding:14px;border-radius:12px;background:#f5f8f9;color:#52666f;font-size:12px;line-height:1.8}.totals{padding:16px;border:1px solid #dce5e9;border-radius:13px}.total-row,.payment{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:12px}.total-row.sub{color:#61747d}.total-row.final{margin-top:8px;padding-top:13px;border-top:1px solid #dce5e9;color:#087f73;font-size:18px;font-weight:800}.payments{margin-top:12px;padding-top:10px;border-top:1px dashed #d5e1e5}.payments h3{margin:0 0 5px;font-size:11px}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:24px;padding-top:14px;border-top:1px solid #e4ecef;color:#71838c;font-size:10px}.footer b{color:#087f73}@page{size:auto;margin:0}@media(max-width:600px){body{padding:0;background:white}.sheet{border:0;border-radius:0;box-shadow:none}.content{padding:18px}.meta{grid-template-columns:repeat(2,minmax(0,1fr))}.summary{grid-template-columns:1fr}.title h2{font-size:20px}}@media print{body{padding:0;background:#fff}.sheet{width:100%;border:0;border-radius:0;box-shadow:none}.content{padding:0}.top{height:5px}.footer{break-inside:avoid}}
</style></head><body><main class="sheet"><div class="top"></div><div class="content"><header class="brand"><div class="company">${logo}<div><h1>${escapeHtml(settings.company_name||receipt.pointName)}</h1><p>${escapeHtml(settings.company_address||"")}${settings.company_phone?` · ${escapeHtml(settings.company_phone)}`:""}</p>${settings.company_email?`<p>${escapeHtml(settings.company_email)}</p>`:""}</div></div><span class="badge">${receipt.pending?"نسخة غير متصلة":"فاتورة نقطة بيع"}</span></header><section class="title"><div><p class="muted">${escapeHtml(receipt.pointName)}</p><h2>${receipt.mode==="return"?"إشعار مردود مبيعات":receipt.mode==="gift"?"سند إخراج هدية":"فاتورة مبيعات"}</h2></div><div class="code"><small>رقم الفاتورة</small><strong>${escapeHtml(receipt.code)}</strong></div></section><section class="meta"><div><small>التاريخ والوقت</small><b>${escapeHtml(receipt.date)}</b></div><div><small>العميل</small><b>${escapeHtml(receipt.customerName||"عميل نقدي")}</b></div><div><small>الكاشير</small><b>${escapeHtml(cashierName||"—")}</b></div>${settings.tax_number?`<div><small>الرقم الضريبي</small><b>${escapeHtml(settings.tax_number)}</b></div>`:""}<div><small>العملة</small><b>${escapeHtml(receipt.currencyCode)}</b></div></section><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر شامل الضريبة</th><th>خصم</th><th>خصم حملة</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table></div><section class="summary"><div class="notes">${receipt.note?`<b>ملاحظات</b><br>${escapeHtml(receipt.note)}`:"شكراً لتسوقكم معنا"}<p class="muted">الأسعار تشمل ضريبة القيمة المضافة.</p></div><div class="totals"><div class="total-row sub"><span>مجموع الأصناف</span><b>${money(receipt.subtotal)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الأصناف</span><b>− ${money(receipt.itemDiscount)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الحملات</span><b>− ${money(receipt.lines.reduce((sum,line)=>sum+Number(line.campaign_discount||0),0))} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الفاتورة</span><b>− ${money(receipt.invoiceDiscount)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>الضريبة (ضمن السعر)</span><b>${money(receipt.tax)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row final"><span>${receipt.mode==="return"?"الصافي للاسترجاع":receipt.mode==="gift"?"إجمالي الهدية":"الصافي للدفع"}</span><b>${money(receipt.total)} ${escapeHtml(receipt.currencyCode)}</b></div>${payments?`<div class="payments"><h3>المدفوعات</h3>${payments}</div>`:""}${receipt.refundAmount>0?`<div class="total-row sub"><span>الباقي للعميل</span><b>${money(receipt.refundAmount)} ${escapeHtml(receipt.currencyCode)}</b></div>`:""}</div>
 </section><footer class="footer"><span>${escapeHtml(settings.company_name||receipt.pointName)}</span><b>${receipt.pending?"بانتظار المزامنة":"نسخة العميل"}</b></footer></div></main></body></html>`
}

export default function PosCashier(){
  const workspaceTabActive = useWorkspaceTabActive()
 const {user}=useAuth(),{toast}=useToast(),baseKey=useMemo(()=>currentPosTenantKey(user?.id),[user?.id]),searchRef=useRef<HTMLInputElement>(null),categoriesRef=useRef<HTMLDivElement>(null),syncingRef=useRef(false),focusBarcodeAfterSaveRef=useRef(false)
 const [restoredWorkspace,setRestoredWorkspace]=useState<string|null>(null)
 const selectedPointRef=useRef<number|null>(null),initialPointResolutionRef=useRef(false)
 const [points,setPoints]=useState<Point[]>([]),[pointId,setPointId]=useState<number|null>(null),[catalog,setCatalog]=useState<Catalog>(EMPTY),[cart,setCart]=useState<CartLine[]>([]),[query,setQuery]=useState(""),[barcodeQuery,setBarcodeQuery]=useState(""),[category,setCategory]=useState("all"),[customerId,setCustomerId]=useState<number|null>(null),[mode,setMode]=useState<"sale"|"return"|"gift">("sale"),[note,setNote]=useState("")
 const [online,setOnline]=useState(true),[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[pendingCount,setPendingCount]=useState(0),[message,setMessage]=useState<{type:"success"|"error"|"info";text:string}|null>(null),[receipt,setReceipt]=useState<Receipt>(null)
 const [checkoutOpen,setCheckoutOpen]=useState(false),[payments,setPayments]=useState<Payment[]>([]),[cashTendered,setCashTendered]=useState(0),[saving,setSaving]=useState(false),[custodyOpen,setCustodyOpen]=useState(false),[custodyAction,setCustodyAction]=useState("open"),[custodyAmount,setCustodyAmount]=useState(0),[custodyNote,setCustodyNote]=useState(""),[pendingHandovers,setPendingHandovers]=useState<any[]>([]),[discountOpen,setDiscountOpen]=useState(false),[discountValue,setDiscountValue]=useState(0),[noteOpen,setNoteOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[historyRows,setHistoryRows]=useState<any[]>([]),[historyQuery,setHistoryQuery]=useState(""),[draftNoteOpen,setDraftNoteOpen]=useState(false),[draftNote,setDraftNote]=useState(""),[draftNoteError,setDraftNoteError]=useState(""),[draftQuery,setDraftQuery]=useState("")
 const custodyAmountsEditedRef=useRef(false)
 const [custodyAmounts,setCustodyAmounts]=useState<Record<number,number>>({})
 const [historyScope,setHistoryScope]=useState<"shift"|"all">("shift"),[historySelected,setHistorySelected]=useState<PosInvoice|null>(null),[historyLoading,setHistoryLoading]=useState(false),[historyDeleting,setHistoryDeleting]=useState(false),[historyError,setHistoryError]=useState(""),[editingInvoiceId,setEditingInvoiceId]=useState<number|null>(null)
 const [editingDraftId,setEditingDraftId]=useState<number|null>(null)
 const [returnChoiceOpen,setReturnChoiceOpen]=useState(false),[returnSourceOpen,setReturnSourceOpen]=useState(false),[returnSourceInvoices,setReturnSourceInvoices]=useState<ReturnSourceInvoice[]>([]),[returnSourceQuery,setReturnSourceQuery]=useState(""),[returnSourceLoading,setReturnSourceLoading]=useState(false),[returnSourceLoadingItems,setReturnSourceLoadingItems]=useState(false),[returnSourceError,setReturnSourceError]=useState(""),[returnSourceInvoice,setReturnSourceInvoice]=useState<ReturnSourceInvoice|null>(null)
 const [draftOpen,setDraftOpen]=useState(false),[draftRows,setDraftRows]=useState<any[]>([]),[draftLoading,setDraftLoading]=useState(false),[draftError,setDraftError]=useState(""),[draftSaving,setDraftSaving]=useState(false)
 const [custodyCurrencyId,setCustodyCurrencyId]=useState<number|null>(null)
 const [movementAmounts,setMovementAmounts]=useState<Record<number,number>>({})
 const [activePointShift,setActivePointShift]=useState<{id:number;shift_guid?:string;user_name?:string}|null>(null)
 const [cashCurrencyAmounts,setCashCurrencyAmounts]=useState<Record<number,number>>({})
 const [posCampaigns,setPosCampaigns]=useState<PosCampaign[]>([])
 const [checkoutError,setCheckoutError]=useState("")
 const [custodyError,setCustodyError]=useState("")
 const [selectedLineId,setSelectedLineId]=useState<string|null>(null),[quantityEntry,setQuantityEntry]=useState("")
 const [itemDiscountId,setItemDiscountId]=useState<string|null>(null)
 const [visibleLimit,setVisibleLimit]=useState(180)
 const applyQuantity=()=>{const quantity=Number(quantityEntry);if(!Number.isFinite(quantity)||quantity<=0)return;setCart(lines=>lines.map(line=>posCartLineKey(line)===selectedLineId?{...line,quantity,quantityAdjusted:true}:line))}
 const [noPoints,setNoPoints]=useState(false)
 const [pointChooserOpen,setPointChooserOpen]=useState(false),[pointChooserBusy,setPointChooserBusy]=useState(false),[pointChooserError,setPointChooserError]=useState("")
 const [partyPicker,setPartyPicker]=useState<"customer"|"salesman"|null>(null),[salesmanId,setSalesmanId]=useState<number|null>(null)
 const [customerProducts,setCustomerProducts]=useState<Product[]|null>(null)
 const [pendingCustomer,setPendingCustomer]=useState<Customer|null>(null)
 const [pricingBusy,setPricingBusy]=useState(false)
 const [customerPriceError,setCustomerPriceError]=useState("")
 const pricingRequestRef=useRef(0)
 const productsForSale=customerProducts??catalog.products
 const point=catalog.point,session=catalog.session
 useEffect(()=>{
  if(!point?.allow_offline||!session?.id)return
  // Retain the existing authenticated session, including its original expiry.
  // Normal logout still removes these standard authentication keys.
  for(const key of ["erp_user","erp_token","erp_session","erp_active_branch","erp_active_department","active_tenant_db"]){
   const value=sessionStorage.getItem(key);if(value)localStorage.setItem(key,value)
  }
  if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>false)
  if("serviceWorker" in navigator)void navigator.serviceWorker.ready.then(registration=>{
   registration.active?.postMessage({type:"CACHE_ASSETS",urls:performance.getEntriesByType("resource").map(entry=>entry.name)})
  })
 },[point?.allow_offline,session?.id])
 const logCashierAction=useCallback((movementType:string,transactionNo="",notes="")=>{if(!pointId)return;void fetch("/api/pos/cashier-log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pos_point_id:pointId,session_id:session?.id,movement_type:movementType,transaction_no:transactionNo,notes})}).catch(()=>{})},[pointId,session?.id])
 const campaignResult=useMemo(()=>{const selectedCustomer=catalog.customers.find(customer=>customer.id===customerId);const campaignPriceClassId=Number(selectedCustomer?.pricecategory)||Number(point?.price_category_id||0);const calculated=mode==="sale"?applyPosCampaigns(cart.map(line=>({...line,unit_id:line.unitId})) as PosCampaignLine[],posCampaigns,{branchId:Number(point?.branch_id||0),warehouseId:Number(point?.main_warehouse_id||0),priceClassId:campaignPriceClassId},undefined,catalog.campaignUsage||{}):{items:cart,invoiceDiscount:0,campaignId:0};if(!editingInvoiceId||mode!=="sale")return calculated;return {...calculated,items:cart.map(line=>({...line,campaign_discount:Number(line.campaign_discount||0),campaign_id:line.campaign_id||null}))}},[cart,posCampaigns,point?.branch_id,point?.main_warehouse_id,point?.price_category_id,customerId,catalog.customers,catalog.campaignUsage,mode,editingInvoiceId])
 const campaignItems=campaignResult.items as unknown as CartLine[]
 const subtotal=useMemo(()=>round(campaignResult.items.reduce((sum,line)=>sum+line.price*line.quantity*(1-line.discount/100)-Number(line.campaign_discount||0),0)),[campaignResult.items]),invoiceDiscount=mode==="gift"?0:round(subtotal*discountValue/100),total=mode==="gift"?0:round(subtotal-invoiceDiscount-campaignResult.invoiceDiscount),tax=mode==="gift"?0:round(total*catalog.taxRate/(100+catalog.taxRate))
 const allocated=round(payments.reduce((s,p)=>s+p.amount,0))
 const cashPayment=round(payments.find(p=>p.method==="cash")?.amount||0)
 const nonCashPaid=round(allocated-cashPayment)
 const change=mode==="sale"?round(Math.max(0,allocated-total)):0
 const pointCashOnly=catalog.currencies.every(row=>!(cashCurrencyAmounts[row.currency_id]>0)||row.currency_id===Number(point?.currency_id))
 const cashChangeAllowed=change>0&&pointCashOnly&&cashPayment>=change&&nonCashPaid<=total+.009
 const categories=useMemo(()=>Array.from(new Set(productsForSale.map(p=>p.category).filter(Boolean))).map(name=>({name,count:productsForSale.filter(product=>product.category===name).length})),[productsForSale])
 const shown=useMemo(()=>{const t=query.trim().toLocaleLowerCase("ar");return productsForSale.filter(p=>(category==="all"||p.category===category)&&(!t||p.name.toLocaleLowerCase("ar").includes(t)))},[productsForSale,category,query])
 useEffect(()=>setVisibleLimit(180),[category,query,pointId])
 const updateQueue=useCallback(async()=>{try{setPendingCount((await listPosSales(baseKey)).length)}catch{setPendingCount(0)}},[baseKey])
 const normalize=(d:any):Catalog=>({point:d.point||null,taxRate:Math.max(0,Number(d.tax_rate||0)),receiptSettings:d.receiptSettings||{},session:d.session?{...d.session,expected_cash:Number(d.session.expected_cash||0),opening_cash:Number(d.session.opening_cash||0)}:null,products:(d.products||[]).map((r:any)=>({id:Number(r.id),code:String(r.product_code||""),name:String(r.product_name||"صنف"),soldUsingScale:isScaleProduct(r.pos_sold_using_scale),barcode:String(r.first_barcode||r.barcode||""),price:Number(r.first_price||0),unitId:Number(r.unit_id)||null,unitName:String(r.unit_name||""),accountId:Number(r.selling_account_id)||null,returnAccountId:Number(r.selling_returns_account_id)||null,category:String(r.category_name||"غير مصنف"),image:r.product_image?( /^(https?:|data:|\/)/i.test(String(r.product_image))?String(r.product_image):`data:image/bmp;base64,${r.product_image}`):undefined,available:Number(r.available_stock||0),unitPrices:(Array.isArray(r.unit_prices)?r.unit_prices:[]).map((option:any)=>({unitId:Number(option.unit_id)||null,price:Number(option.price||0),unitName:String(option.unit_name||"")})),barcodeOptions:(Array.isArray(r.barcode_options)?r.barcode_options:[]).map((option:any)=>({barcode:String(option.barcode||""),price:Number(option.price||0),unitId:Number(option.unit_id)||null,unitName:String(option.unit_name||"")}))})),currencies:(d.currencies||[]).map((r:any)=>({currency_id:Number(r.currency_id),currency_code:String(r.currency_code||""),currency_name:String(r.currency_name||""),rate_to_point:Number(r.rate_to_point||1),exchange_rate:Number(r.exchange_rate||1)})),banks:(d.banks||[]).map((r:any)=>({id:Number(r.id),code:String(r.code||""),name:String(r.name||"")})),bankBranches:(d.bankBranches||[]).map((r:any)=>({id:Number(r.id),bank_id:Number(r.bank_id)||undefined,code:String(r.code||""),name:String(r.name||"")})),cardTypes:(d.cardTypes||[]).filter((r:any)=>Number(r.currency_id)===Number(d.point?.currency_id)).map((r:any)=>({id:Number(r.id),name:String(r.name||""),currency_id:Number(r.currency_id)})),salesmen:(d.salesmen||[]).map((r:any)=>({id:Number(r.id),code:String(r.code||""),name:String(r.name||"")})),customers:(d.customers||[]).map((r:any)=>({id:Number(r.id),name:String(r.name||""),code:String(r.code||""),accountId:Number(r.account_id)||null,pricecategory:Number(r.pricecategory)||undefined}))})
 const validatePointShift=useCallback(async(selectedPoint:Point)=>{
  if(!navigator.onLine)throw new Error("يجب الاتصال بالإنترنت للتحقق من الوردية المفتوحة على نقطة البيع")
  const response=await fetch(`/api/pos/sessions?point_id=${selectedPoint.id}`,{cache:"no-store"})
  const data=await response.json()
  if(!response.ok)throw new Error(errorText(data,"تعذر التحقق من عهدة نقطة البيع"))
  if(data.session)return data
  const activeShift=data.active_shift
  if(activeShift&&Number(activeShift.user_id)!==Number(user?.id)){
    const owner=String(activeShift.user_name||"مستخدم آخر")
    throw new Error(`توجد وردية مفتوحة بالفعل على نقطة البيع باسم ${owner}. يجب إغلاقها أو تسليم عهدتها قبل فتح وردية جديدة.`)
  }
  return data
 },[user?.id])
 const choosePoint=useCallback(async(selectedPoint:Point)=>{
  setPointChooserBusy(true);setPointChooserError("")
  try{
   const data=await validatePointShift(selectedPoint)
   selectedPointRef.current=selectedPoint.id
   setPointId(selectedPoint.id)
   setPointChooserOpen(false)
   if(data.session){setCatalog(current=>({...current,session:data.session}));setPendingHandovers(data.pending||[])}
  }catch(error){
   const text=error instanceof Error?error.message:"تعذر التحقق من نقطة البيع"
   if(pointChooserOpen)setPointChooserError(text)
   else setMessage({type:"error",text})
  }finally{setPointChooserBusy(false)}
 },[pointChooserOpen,validatePointShift])
 const loadPoints=useCallback(async()=>{
  const restoreCachedPoint=async()=>{
   const last=Number(localStorage.getItem(baseKey+":last-point"))
   const cached=last?await loadPosCatalog<Catalog>(baseKey+":point:"+last).catch(()=>null):null
   if(cached?.catalog.point?.allow_offline&&cached.catalog.session){
    setPoints([cached.catalog.point]);selectedPointRef.current=last;initialPointResolutionRef.current=true;setPointId(last);setCatalog(cached.catalog);setLoading(false)
    return true
   }
   return false
  }
  if(!navigator.onLine){
   if(!await restoreCachedPoint()){setLoading(false);setMessage({type:"error",text:"يجب فتح وردية وتحميل نقطة البيع أولاً أثناء الاتصال"})}
   return
  }
  try{
   const response=await fetch("/api/pos/points",{cache:"no-store"}),data=await response.json()
   if(!response.ok)throw new Error(errorText(data,"تعذر تحميل نقاط البيع"))
   const availablePoints:Point[]=data.points||[]
   setPoints(availablePoints);setNoPoints(!availablePoints.length)
  if(selectedPointRef.current&&!availablePoints.some(point=>point.id===selectedPointRef.current)){
   selectedPointRef.current=null;initialPointResolutionRef.current=false;setPointId(null);setCatalog(EMPTY)
  }
  if(!availablePoints.length){selectedPointRef.current=null;initialPointResolutionRef.current=false;setPointId(null);setCatalog(EMPTY);setLoading(false);setCustodyOpen(false);return}
   if(initialPointResolutionRef.current||selectedPointRef.current)return
   initialPointResolutionRef.current=true
   const sessions=await Promise.all(availablePoints.map(async(point)=>{
    try{const result=await fetch(`/api/pos/sessions?point_id=${point.id}`,{cache:"no-store"}),payload=await result.json();return result.ok?{point,payload}:null}catch{return null}
   }))
  if(sessions.every(entry=>entry===null)&&await restoreCachedPoint()){
   setMessage({type:"info",text:"تعذر الاتصال بالخادم؛ تم استعادة نقطة البيع والوردية المحفوظتين"})
   return
  }
   const ownSession=sessions.find(entry=>entry?.payload.session)
   if(ownSession){selectedPointRef.current=ownSession.point.id;setPointId(ownSession.point.id);setCatalog(current=>({...current,session:ownSession.payload.session}));setPendingHandovers(ownSession.payload.pending||[]);return}
   if(availablePoints.length>1){setPointChooserError("");setPointChooserOpen(true);return}
   await choosePoint(availablePoints[0])
  }catch(error){
   if(await restoreCachedPoint()){setMessage({type:"info",text:"الخادم غير متاح؛ تعمل نقطة البيع من البيانات المحفوظة وسيتم رفع الفواتير عند عودة الاتصال"});return}
   setLoading(false);setMessage({type:"error",text:error instanceof Error?error.message:"تعذر تحميل نقاط البيع"})
  }
 },[baseKey,choosePoint,user?.id])
 const refreshCampaignUsage=useCallback(async()=>{if(!pointId||!navigator.onLine)return;try{const response=await fetch(`/api/pos/campaign-usage?point_id=${pointId}`,{cache:"no-store"}),data=await response.json();if(response.ok)setCatalog(current=>({...current,campaignUsage:data.campaignUsage||{}}))}catch{}},[pointId])
 const loadCatalogData=useCallback(async()=>{if(!pointId)return;setLoading(true);const key=`${baseKey}:point:${pointId}`,cached=await loadPosCatalog<Catalog>(key).catch(()=>null);if(cached?.catalog){setCatalog(cached.catalog);setPosCampaigns(cached.catalog.campaigns||[])}if(!navigator.onLine){if(!cached)setMessage({type:"error",text:"افتح نقطة البيع مرة أثناء الاتصال لتنزيل أصناف المخزن الرئيسي"});setLoading(false);return}try{const r=await fetch(`/api/pos/catalog?point_id=${pointId}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error);const next={...normalize(d),campaigns:d.campaigns||[],campaignUsage:d.campaignUsage||{}};setCatalog(next);setPosCampaigns(next.campaigns||[]);await savePosCatalog(key,next);localStorage.setItem(`${baseKey}:last-point`,String(pointId));setMessage(null)}catch(e){if(!cached)setMessage({type:"error",text:e instanceof Error?e.message:"تعذر تحميل الكاشير"})}finally{setLoading(false)}},[baseKey,pointId])
 const loadSession=useCallback(async()=>{if(!pointId||!navigator.onLine)return;try{const r=await fetch(`/api/pos/sessions?point_id=${pointId}`,{cache:"no-store"}),d=await r.json();if(r.ok){setCatalog(c=>({...c,session:d.session||null}));setPendingHandovers(d.pending||[]);setActivePointShift(d.active_shift||null);return d}}catch{}},[pointId])
 const syncPending=useCallback(async()=>{if(!navigator.onLine||syncingRef.current)return;syncingRef.current=true;setSyncing(true);try{for(const sale of await listPosSales(baseKey)){try{const r=await fetch("/api/pos/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sale.payload)}),d=await r.json();if(!r.ok){await markPosSaleFailed(sale,errorText(d,"فشلت المزامنة"));continue}await removePosSale(sale.id)}catch(e){await markPosSaleFailed(sale,e instanceof Error?e.message:"انقطع الاتصال");break}}await updateQueue();await loadSession()}finally{syncingRef.current=false;setSyncing(false)}},[baseKey,loadSession,updateQueue])
 useEffect(()=>{setOnline(navigator.onLine);void loadPoints();void updateQueue();void syncPending();const on=()=>{setOnline(true);void syncPending();void loadPoints()},off=()=>setOnline(false);addEventListener("online",on);addEventListener("offline",off);return()=>{removeEventListener("online",on);removeEventListener("offline",off)}},[loadPoints,syncPending,updateQueue])
 useEffect(()=>{
  if(!pointId)return
  const key=baseKey+":workspace:"+pointId
  let saved:any=null
  try{saved=JSON.parse(localStorage.getItem(key)||"null")}catch{}
  pricingRequestRef.current++;setPendingCustomer(null);setPricingBusy(false)
  setCart(saved?.cart||[]);setCustomerProducts(saved?.customerProducts||null);setCustomerId(saved?.customerId??null);setSalesmanId(saved?.salesmanId??null)
  setDiscountValue(saved?.discountValue||0);setNote(saved?.note||"");setMode(saved?.mode||"sale");setPayments(saved?.payments||[]);setCashCurrencyAmounts(saved?.cashCurrencyAmounts||{});setCashTendered(saved?.cashTendered||0)
  setEditingInvoiceId(saved?.editingInvoiceId??null);setEditingDraftId(saved?.editingDraftId??null)
  setRestoredWorkspace(key);void loadCatalogData()
 },[baseKey,pointId,loadCatalogData])
 useEffect(()=>{
  const key=baseKey+":workspace:"+pointId
  if(!pointId||restoredWorkspace!==key)return
  try{localStorage.setItem(key,JSON.stringify({cart,customerProducts,customerId,salesmanId,discountValue,note,mode,payments,cashCurrencyAmounts,cashTendered,editingInvoiceId,editingDraftId}))}
  catch{setMessage({type:"error",text:"تعذر حفظ السلة على الجهاز"})}
 },[baseKey,pointId,restoredWorkspace,cart,customerProducts,customerId,salesmanId,discountValue,note,mode,payments,cashCurrencyAmounts,cashTendered,editingInvoiceId,editingDraftId])
 useEffect(()=>{if(pointId&&catalog.point?.id===pointId)void savePosCatalog(`${baseKey}:point:${pointId}`,catalog)},[baseKey,catalog,pointId])
 useEffect(()=>{if(custodyOpen)void loadSession()},[custodyOpen,loadSession])
 useEffect(()=>{const refresh=()=>{void loadSession()};window.addEventListener("pos-session-changed",refresh);return()=>window.removeEventListener("pos-session-changed",refresh)},[loadSession])
 useEffect(()=>{if(custodyOpen){setCustodyError("");setMessage(null)}},[custodyOpen])
 useEffect(()=>{if(!custodyOpen)custodyAmountsEditedRef.current=false;if(!session?.id||custodyAmountsEditedRef.current)return;const next:Record<number,number>={};for(const row of session.currencies||[])next[Number(row.currency_id)]=Number(row.expected_amount||0);if(!Object.keys(next).length&&point?.currency_id)next[Number(point.currency_id)]=Number(session.expected_cash||0);setCustodyAmounts(next)},[custodyOpen,session?.id,session?.expected_cash,session?.currencies,point?.currency_id])
 useEffect(()=>{if(!custodyOpen)return;if(session){if(!["cash_in","cash_out","handover","close"].includes(custodyAction)){setCustodyAction("handover");setCustodyAmount(Number(session.expected_cash||0))}if(!custodyAmountsEditedRef.current)setCustodyAmounts(Object.fromEntries((session.currencies||[]).map((row:any)=>[Number(row.currency_id),Number(row.expected_amount||0)])))}else if(pendingHandovers.length){setCustodyAction("receive")}},[custodyOpen,session?.id,pendingHandovers.length])
 useEffect(()=>{if(!pointId||!catalog.point||!online)return;let active=true;void loadSession().then(data=>{if(active&&data&&!data.session){setCustodyAmount(0);setCustodyAction(data.pending?.length?"receive":"open");setCustodyOpen(true)}});return()=>{active=false}},[pointId,catalog.point?.id,online,loadSession])
 useEffect(()=>{const h=(e:KeyboardEvent)=>{ if (!workspaceTabActive.current) return;if(document.querySelector('[role="dialog"]'))return;if(e.key==="F2"){e.preventDefault();requestTransactionAction(()=>setCustodyOpen(true))}else if(e.key==="F3"&&cart.length){e.preventDefault();openCheckout()}else if(e.key==="F4"){e.preventDefault();requestTransactionAction(()=>void loadHistory())}else if(e.key==="F5"){e.preventDefault();if(historySelected)void deleteHistoryInvoice(historySelected);else if(cart.length&&mode!=="gift")setDiscountOpen(true)}else if(e.key==="F7"&&selectedLineId){e.preventDefault();removeSelectedLine()}else if(e.key==="F8"){e.preventDefault();requestTransactionAction(()=>setPartyPicker("customer"))}else if(e.key==="F9"){e.preventDefault();requestTransactionAction(()=>setPartyPicker("salesman"))}else if(e.key==="F11"){e.preventDefault();setNoteOpen(true)}else if(e.key==="F12"){e.preventDefault();void loadCatalogData()}};addEventListener("keydown",h);return()=>removeEventListener("keydown",h)})
 // أصوات التنبيه (lib/pos-beeps.ts): نجاح الإضافة، باركود غير موجود (طويل)، صنف بلا سعر (نغمتان)
 const playPriceErrorBeep=()=>playPosBeep("noPrice")
 const add=(p:Product,quantity=1)=>{if(pricingBusy)return;if(!Number.isFinite(p.price)||p.price<=0){toast({title:"خطأ",description:"لم يتم تحديد سعر الصنف المختار لا يمكن اضافته الى الفاتورة",variant:"destructive"});playPriceErrorBeep();setBarcodeQuery("");requestAnimationFrame(()=>searchRef.current?.focus());return}const shouldGroup=point?.item_grouping_mode==="on_entry",existing=shouldGroup?cart.find(l=>posCartLineKey(l)===posCartLineKey(p)):undefined,lineId=existing?.lineId||(!shouldGroup?makeId():undefined),lineKey=lineId||posCartLineKey(p),nextQuantity=Number(((existing?.quantity||0)+quantity).toFixed(4));setHistorySelected(null);setSelectedLineId(lineKey);setQuantityEntry(String(nextQuantity));setCart(c=>{const current=shouldGroup?c.find(x=>posCartLineKey(x)===posCartLineKey(p)):undefined;return current?c.map(x=>posCartLineKey(x)===posCartLineKey(p)?{...x,quantity:Number((x.quantity+quantity).toFixed(4))}:x):[...c,{...p,lineId,quantity,discount:0,gift:false}]});playPosBeep("success");setBarcodeQuery("");requestAnimationFrame(()=>searchRef.current?.focus())}
 const changeQty=(id:string,n:number)=>setCart(c=>c.map(x=>posCartLineKey(x)===id?{...x,quantity:Math.max(0,x.quantity+n),quantityAdjusted:true}:x).filter(x=>x.quantity>0))
 const removeSelectedLine=()=>{if(!selectedLineId)return;const line=cart.find(item=>posCartLineKey(item)===selectedLineId);setCart(lines=>lines.filter(item=>posCartLineKey(item)!==selectedLineId));setSelectedLineId(null);setQuantityEntry("");logCashierAction("حذف صنف من فاتورة","",line?.name||"")}
 // F10 من حقل الباركود أو حقل البحث بالاسم: نافذة بحث الأصناف — اختيار الصنف ثم وحدته (بسعرها وباركودها)
 const [itemSearchOpen,setItemSearchOpen]=useState(false),[itemSearchSeed,setItemSearchSeed]=useState("")
 const openItemSearch=(seed:string)=>{if(pricingBusy||historySelected)return;setItemSearchSeed(seed.trim());setItemSearchOpen(true)}
 const searchEnter=()=>{
  const term=barcodeQuery.trim()
  if(!term)return
  // A scanner usually sends the complete barcode followed by Enter. Prefer a
  // unique exact identifier over the currently selected category or text filter.
  const resolved=resolvePosBarcode(productsForSale,term)
  const product=resolved?.product
  const option=product?.barcodeOptions.find(row=>row.barcode===resolved?.barcode)
  const match=product&&option?{...product,barcode:option.barcode,price:option.price,unitId:option.unitId,unitName:option.unitName}:product
  if(match&&resolved)add(match,resolved.quantity)
  else{playPosBeep("notFound");setMessage({type:"error",text:"لا يوجد صنف بهذا الباركود"});searchRef.current?.select()}
 }
 const setPay=(method:PaymentKey,value:number,reference?:string,dueDate?:string)=>setPayments(rows=>{const exists=rows.find(p=>p.method===method),next={...exists,method,amount:Math.max(0,round(value)),reference:reference??exists?.reference??"",due_date:dueDate??exists?.due_date};return exists?rows.map(p=>p.method===method?next:p):[...rows,next]})
 const applyCustomerPrices=async(customer:Customer)=>{
  const requestId=++pricingRequestRef.current
  setPricingBusy(true);setCustomerPriceError("")
  try{
   const response=await fetch(`/api/pos/catalog?point_id=${pointId}&customer_id=${customer.id}`,{cache:"no-store"})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||"تعذر تحميل أسعار العميل")
   const nextProducts=normalize(data).products
   setPosCampaigns(data.campaigns || [])
   const nextCart=repricePosCart(cart,nextProducts)
   if(requestId!==pricingRequestRef.current)return
   setCart(nextCart);setCustomerProducts(nextProducts);setCustomerId(customer.id);setPendingCustomer(null)
   setPayments([]);setCashCurrencyAmounts({});setCashTendered(0)
  }catch(reason){
   if(requestId===pricingRequestRef.current){setPendingCustomer(null);setCustomerPriceError(reason instanceof Error?reason.message:"تعذر تحميل أسعار العميل")}
  }finally{if(requestId===pricingRequestRef.current)setPricingBusy(false)}
 }
 const selectCustomer=(id:number|null)=>{
  if(pricingBusy||saving||id===customerId)return
  if(id===null){
   try{
    const nextCart=cart.length?repricePosCart(cart,catalog.products):cart
    setCart(nextCart);setCustomerId(null);setCustomerProducts(null)
    setPayments([]);setCashCurrencyAmounts({});setCashTendered(0)
   }catch(error){setCustomerPriceError(error instanceof Error?error.message:"تعذر إعادة تسعير الأصناف حسب نقطة البيع")}
   return
  }
  const customer=catalog.customers.find(row=>row.id===id)
  if(!customer)return
  const priceClass=Number(customer.pricecategory)||Number(point?.price_category_id)
  if(priceClass!==Number(point?.price_category_id)){
   if(cart.length){setPendingCustomer(customer);return}
   void applyCustomerPrices(customer)
  }else{setCustomerId(id);setCustomerProducts(null)}
 }
 const keepCustomerPrices=()=>{if(pendingCustomer)setCustomerId(pendingCustomer.id);setPendingCustomer(null)}
 const cancelCustomerSelection=()=>setPendingCustomer(null)
 const [unsavedActionOpen,setUnsavedActionOpen]=useState(false)
 const pendingActionRef=useRef<null|(()=>void)>(null)
 const hasUnsavedChanges=cart.length>0||Boolean(note.trim())||customerId!==null||salesmanId!==null||discountValue!==0||editingInvoiceId!==null||editingDraftId!==null||mode!=="sale"||payments.some(payment=>payment.amount>0)||Object.values(cashCurrencyAmounts).some(value=>Number(value)>0)
 const resetTransaction=()=>{pricingRequestRef.current++;setCustomerProducts(null);setPendingCustomer(null);setPricingBusy(false);setCart([]);setNote("");setCustomerId(null);setSalesmanId(null);setDiscountValue(0);setPayments([]);setCashCurrencyAmounts({});setCashTendered(0);setEditingInvoiceId(null);setEditingDraftId(null);setSelectedLineId(null);setQuantityEntry("");setCheckoutError("")}
 const requestTransactionAction=(action:()=>void)=>{
  if(saving||draftSaving||pricingBusy)return
  if(!hasUnsavedChanges){action();return}
  pendingActionRef.current=action
  setUnsavedActionOpen(true)
 }
 const cancelTransactionAction=()=>{pendingActionRef.current=null;setUnsavedActionOpen(false)}
 const resumeTransactionAction=()=>{const action=pendingActionRef.current;pendingActionRef.current=null;action?.()}
 const discardAndContinue=()=>{resetTransaction();setUnsavedActionOpen(false);resumeTransactionAction()}
 const saveAndContinue=()=>{setUnsavedActionOpen(false);openCheckout()}
 useEffect(()=>{
  const onNavigationRequest=(event:Event)=>{
   if(!hasUnsavedChanges||saving||draftSaving||pricingBusy)return
   const navigationEvent=event as CustomEvent<{continueNavigation:()=>void}>
   if(typeof navigationEvent.detail?.continueNavigation!=="function")return
   event.preventDefault()
   pendingActionRef.current=navigationEvent.detail.continueNavigation
   setUnsavedActionOpen(true)
  }
  const onBeforeUnload=(event:BeforeUnloadEvent)=>{
   if(!hasUnsavedChanges)return
   event.preventDefault()
   event.returnValue=""
  }
  window.addEventListener("pos-cashier:navigate-request",onNavigationRequest)
  window.addEventListener("beforeunload",onBeforeUnload)
  return()=>{
   window.removeEventListener("pos-cashier:navigate-request",onNavigationRequest)
   window.removeEventListener("beforeunload",onBeforeUnload)
  }
 },[hasUnsavedChanges,saving,draftSaving,pricingBusy])
 const openCheckout=()=>{if(!session){setCustodyAction(pendingHandovers.length?"receive":"open");setCustodyOpen(true);return}setPayments([]);setCashCurrencyAmounts({});setCashTendered(0);setCheckoutError("");setCheckoutOpen(true);setMessage(null)}
 const updateCashCurrency=(currencyId:number,value:number)=>{const next={...cashCurrencyAmounts,[currencyId]:Math.max(0,round(value))};setCashCurrencyAmounts(next);const evaluated=round(catalog.currencies.reduce((sum,row)=>sum+round((next[row.currency_id]||0)*row.rate_to_point),0));setPay("cash",evaluated);setCashTendered(evaluated);setCheckoutError("")}
 const updatePayment=(method:PaymentKey,value:number,reference?:string,currencyId?:number)=>{setPayments(rows=>{const exists=rows.find(p=>p.method===method),chosen=currencyId||exists?.currency_id||Number(point?.currency_id),currency=catalog.currencies.find(row=>row.currency_id===chosen),original=Math.max(0,round(value)),next:Payment={...exists,method,amount:round(original*(currency?.rate_to_point||1)),currency_id:chosen,currency_amount:original,reference:reference??exists?.reference??"",due_date:exists?.due_date};return exists?rows.map(p=>p.method===method?next:p):[...rows,next]})}
 const updatePaymentField=(method:PaymentKey,field:keyof Payment,value:string|number)=>{setPayments(rows=>{const existing=rows.find(row=>row.method===method),next={method,amount:0,reference:"",...existing,[field]:value} as Payment;return existing?rows.map(row=>row.method===method?next:row):[...rows,next]});setCheckoutError("")}
 const buildPayload=(id:string)=>{const customer=catalog.customers.find(c=>c.id===customerId);return {pos_client_sale_id:id,pos_point_id:pointId,pos_session_id:session?.id,pos_customer_id:customerId,pos_mode:mode,cashier_action:editingInvoiceId?"تعديل فاتورة":"حفظ فاتورة",salesman_id:salesmanId,vch_date:localDateTime(),manual_date:today(),due_date:today(),account_id:customer?.accountId||null,customer_name:customer?.name||"عميل نقدي",rate:Number(point?.exchange_rate||1),discount_type:"percentage",discount_value:discountValue,vat_percent:catalog.taxRate,vat_classification_id:1,invoice_type:1,vat_included:false,is_maqasa:false,status:2,note:note||`${mode==="return"?"مردود":mode==="gift"?"هدية":"فاتورة"} من نقطة البيع ${point?.name||""}`,insert_user:Number(user?.id)||null,pos_payments:payments.filter(p=>p.amount>0).map(p=>p.method==="cash"&&cashChangeAllowed?{...p,amount:round(p.amount-change),currency_amount:round(p.amount-change)}:p).filter(p=>p.amount>0),cash_currency_amounts:cashChangeAllowed?[{currency_id:Number(point?.currency_id),amount:round(cashPayment-change)}].filter(row=>row.amount>0):catalog.currencies.filter(row=>(cashCurrencyAmounts[row.currency_id]||0)>0).map(row=>({currency_id:row.currency_id,amount:cashCurrencyAmounts[row.currency_id]})),items:campaignItems.map(l=>({product_id:l.id,item_id:l.id,product_code:l.code,product_name:l.name,item_name:l.name,barcode:l.barcode,unit_id:l.unitId,unit_name:l.unitName,unit:l.unitName,quantity:l.quantity,qnty:l.quantity,unit_price:l.price,price:l.price,discount_percent:l.discount,discount:l.discount,campaign_discount:Number(l.campaign_discount||0),campaign_id:l.campaign_id,total_price:round(l.price*l.quantity*(1-l.discount/100)-Number(l.campaign_discount||0)),line_amount:round(l.price*l.quantity*(1-l.discount/100)-Number(l.campaign_discount||0)),account_id:mode==="return"?(point?.return_account_id||l.returnAccountId):l.accountId,available_stock:l.available,return_sales_invoice_id:l.returnSalesInvoiceId||null,quantity_adjusted:Boolean(l.quantityAdjusted)}))}}
 const paymentIssue=()=>{
  if(payments.some(row=>row.amount>0&&(row.method==="cheque"||row.method==="account"))&&!customerId)return"اختر العميل عند الدفع بشيك أو على الحساب"
  const accountIssue=point&&validatePosAccounts(point,payments,{mode,taxAmount:catalog.taxRate,returnAccountIds:cart.map(line=>line.returnAccountId),customerAccountId:customerId})
  if(accountIssue)return accountIssue
  if(catalog.currencies.some(row=>{const value=cashCurrencyAmounts[row.currency_id];return value!==undefined&&(!Number.isFinite(value)||value<0||Math.abs(value*100-Math.round(value*100))>0.000001)}))return"مبلغ النقد يجب أن يكون موجباً وبدقتين عشريتين"
  for(const payment of payments.filter(row=>row.amount>0)){
   const value=Number(payment.currency_amount??payment.amount)
   if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.000001)return"مبلغ الدفع غير صالح"
   if(!catalog.currencies.some(row=>row.currency_id===Number(payment.currency_id||point?.currency_id)))return"اختر عملة دفع صالحة"
   if(payment.method==="cheque"){
    if(!payment.cheque_account?.trim())return"رقم حساب الشيك مطلوب"
    if(!payment.reference.trim())return"رقم الشيك مطلوب"
    if(!payment.due_date||payment.due_date<today())return"تاريخ استحقاق الشيك غير صالح"
    if(!payment.bank_id||!payment.branch_id)return"اختر البنك والفرع للشيك"
   }
   if(payment.method==="card"){
    if(!payment.card_type_id)return"اختر نوع البطاقة"
    if(!/^\d+$/.test(payment.reference.replace(/[\s-]/g,"")))return"أدخل رقم البطاقة"
   }
   if(payment.method==="account"&&!customerId)return"اختر العميل للدفع على الحساب"
   if(payment.method==="gift_card"&&!payment.reference.trim())return"رقم بطاقة الهدية مطلوب"
  }
  return null
 }
 const validate=()=>{if(mode==="return"&&payments.some(p=>p.amount>0&&p.method!=="cash"&&p.method!=="account"))return"المردودات متاحة نقداً أو على الذمة فقط";if(!point)return"اختر نقطة بيع";if(!session)return"يجب فتح عهدة";if(!cart.length)return"السلة فارغة";if(cart.some(line=>!Number.isFinite(line.discount)||line.discount<0||line.discount>Math.min(100,Math.max(0,Number(point.max_discount_percent??100)))||line.price*line.quantity*line.discount/100>line.price*line.quantity+0.009))return"خصم الصنف يجب ألا يتجاوز قيمته أو 100%";if(mode==="gift"){if(!point.allow_gifts)return"الهدايا غير مفعلة لهذه النقطة";if(cart.some(l=>l.quantity>l.available))return"كمية الهدية أكبر من الرصيد المتاح";return null}if(total<=0)return"لا يمكن حفظ فاتورة بإجمالي صفر";if(cashTendered<(payments.find(p=>p.method==="cash")?.amount||0))return"المبلغ النقدي المستلم أقل من الدفعة النقدية";const issue=paymentIssue();if(issue)return issue;if(allocated<total-.009)return"مجموع تفاصيل الدفع أقل من إجمالي الفاتورة";if(allocated>total+.009&&!cashChangeAllowed)return"الزيادة على إجمالي الفاتورة مسموحة للنقد بعملة نقطة البيع فقط";if(payments.some(p=>p.amount>0&&p.method==="cheque"&&!p.reference.trim()))return"رقم الشيك مطلوب";if(payments.some(p=>p.amount>0&&p.method==="gift_card"&&!p.reference.trim()))return"رقم بطاقة الهدية مطلوب";if(payments.some(p=>p.amount>0&&p.method==="account")&&!customerId)return"اختر العميل للدفع على الحساب";if(cart.some(l=>!(mode==="return"?(point.return_account_id||l.returnAccountId):l.accountId)))return mode==="return"?"يوجد صنف بلا حساب مردود مبيعات":"يوجد صنف بلا حساب مبيعات";return null}
 const makeReceiptSnapshot=(code:string,pending:boolean,lines:CartLine[]):NonNullable<Receipt>=>{const customer=catalog.customers.find(row=>row.id===customerId);return {code,total,pending,lines,mode,date:localDateTime(),customerName:customer?.name||"عميل نقدي",customerPhone:customer?.mobile1,customerAddress:customer?.address,note,subtotal:lines.reduce((sum,line)=>sum+line.price*line.quantity,0),itemDiscount:lines.reduce((sum,line)=>sum+line.price*line.quantity*line.discount/100,0),invoiceDiscount:invoiceDiscount+campaignResult.invoiceDiscount,tax,payments:payments.filter(payment=>payment.amount>0),refundAmount:change,currencyCode:point?.currency_code||"",pointName:point?.name||"نقطة البيع"}}
 const printReceiptDirect=async(receiptData:NonNullable<Receipt>,browserPrintWindow:Window|null=null)=>{
  if(!point?.print_invoices)return
  if(isMobilePrintDevice()){
   if(!browserPrintWindow){setMessage({type:"error",text:"تعذر فتح صفحة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة."});return}
   const printDocument=browserPrintWindow.document
   printDocument.open()
   printDocument.write(receiptHtml(receiptData,catalog.receiptSettings,user?.fullName||user?.username||"",catalog.taxRate))
   printDocument.close()
  const thermalPrintStyles=printDocument.createElement("style")
  thermalPrintStyles.media="print"
  thermalPrintStyles.textContent=`
   @page{size:80mm auto;margin:0}
   *,*::before,*::after{box-sizing:border-box!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
   html,body{width:80mm!important;min-width:80mm!important;max-width:80mm!important;margin:0!important;padding:0!important;background:#fff!important}
   body{font-family:Arial,Tahoma,sans-serif!important}
   .sheet{width:80mm!important;min-width:80mm!important;max-width:80mm!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important}
   .content{padding:3mm!important}
   .top{height:2mm!important}
   .brand{gap:2mm!important;padding-bottom:3mm!important}
   .company{min-width:0!important;gap:2mm!important}
   .logo{max-width:16mm!important;max-height:13mm!important}
   .company h1{font-size:13px!important;overflow-wrap:anywhere!important}
   .company p,.meta small,.muted{font-size:9px!important}
   .badge{padding:1.5mm!important;font-size:8px!important}
   .title{gap:2mm!important;padding:3mm 0!important}
   .title h2{font-size:15px!important}
   .code strong{font-size:12px!important;overflow-wrap:anywhere!important}
   .meta{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:1.5mm!important;margin-bottom:3mm!important}
   .meta>div{min-width:0!important;padding:1.5mm!important;border-radius:1mm!important}
   .meta b{font-size:10px!important;overflow-wrap:anywhere!important}
   .table-wrap{overflow:visible!important;border-radius:1mm!important}
   table{width:100%!important;min-width:0!important;table-layout:fixed!important}
   th,td{padding:1.5mm 0.8mm!important;font-size:8px!important;overflow-wrap:anywhere!important}
   th{font-size:7px!important}
   .item strong{font-size:9px!important}
   .item small{font-size:7px!important}
   .index{width:5mm!important;height:5mm!important;margin-left:1mm!important}
   .summary{grid-template-columns:1fr!important;gap:2mm!important;margin-top:3mm!important}
   .notes,.totals{min-width:0!important;padding:2.5mm!important;border-radius:1mm!important}
   .total-row{font-size:10px!important}
   .total-row b{font-size:10px!important}
   .footer{gap:2mm!important;margin-top:3mm!important;padding-top:2mm!important;font-size:8px!important;overflow-wrap:anywhere!important}
  `
  printDocument.head.appendChild(thermalPrintStyles)
   browserPrintWindow.document.title=""
   browserPrintWindow.focus()
   window.setTimeout(()=>browserPrintWindow.print(),400)
   return
  }
  const socket=new WebSocket("ws://localhost:32999/cashier")
  const commands:Array<Record<string,string|number>>=[]
  const text=(value:string,x:number,y:number,width:number,height:number,fontSize=9,textFormat=1,fontStyle=0,brush=2)=>commands.push({type:6,text:value,fontFamilyName:"Arial",fontSize,fontStyle,brush,x,y,width,height,textFormat})
  const line=(x1:number,y1:number,x2:number,y2:number,brush=3)=>commands.push({type:5,x:x1,y:y1,width:x2,height:y2,brush})
  const box=(x:number,y:number,width:number,height:number,brush=3)=>commands.push({type:3,x,y,width,height,brush})
  const fill=(x:number,y:number,width:number,height:number)=>commands.push({type:4,x,y,width,height,brush:3})
  const sectionTitle=(label:string)=>{fill(left,y,fullWidth,20);text(label,left+4,y+1,fullWidth-8,18,9,1,1);y+=23}
  const money=(value:number)=>Number(value||0).toFixed(2)
  let y=8
  const left=18,right=297,fullWidth=right-left
  const title=receiptData.mode==="return"?"إشعار مردود مبيعات":receiptData.mode==="gift"?"سند إخراج هدية":"فاتورة مبيعات"
  const logo=catalog.receiptSettings.company_logo
  if(logo){commands.push({type:1,image:logo,x:left+(fullWidth-72)/2,y:y,width:72,height:72});y+=76}
  const companyName=catalog.receiptSettings.company_name||receiptData.pointName
  const companyNameWidth=Math.min(fullWidth,Math.max(80,companyName.length*14))
  text(companyName,left+(fullWidth-companyNameWidth)/2,y,companyNameWidth,22,14,1,1)
  y+=22
  const companyInfo=[catalog.receiptSettings.company_address,catalog.receiptSettings.company_phone].filter(Boolean).join(" | ")
  if(companyInfo){text(companyInfo,left,y,fullWidth,14,8,1);y+=16}
  if(catalog.receiptSettings.company_email){text(catalog.receiptSettings.company_email,left,y,fullWidth,13,7,1);y+=15}
  y=Math.max(y,logo?99:25)
  line(left,y,right,y,3);y+=5
  fill(left,y,fullWidth,25)
  text(title,left+5,y+3,fullWidth-10,19,12,1,1);y+=30

  const cardGap=4,cardWidth=Math.floor((fullWidth-cardGap)/2)
  const rightCardX=left+cardWidth+cardGap
  const card=(label:string,value:string,x:number,width:number)=>{
   box(x,y,width,31,3)
   text(label,x+3,y+2,width-6,10,6,1,0,3)
   text(value,x+3,y+13,width-6,15,8,1,1)
  }
  card("التاريخ والوقت",receiptData.date,rightCardX,cardWidth)
  card("رقم الفاتورة",receiptData.code,left,cardWidth)
  y+=35
  card("العميل",receiptData.customerName||"عميل نقدي",rightCardX,cardWidth)
  card("الكاشير",user?.fullName||user?.username||"—",left,cardWidth)
  y+=35
  if(receiptData.customerPhone||catalog.receiptSettings.tax_number){
   if(receiptData.customerPhone){box(rightCardX,y,cardWidth,28,3);text("الهاتف",rightCardX+3,y+2,cardWidth-6,9,6,1,0,3);text(receiptData.customerPhone,rightCardX+3,y+12,cardWidth-6,13,7,1,1)}
   if(catalog.receiptSettings.tax_number){box(left,y,cardWidth,28,3);text("الرقم الضريبي",left+3,y+2,cardWidth-6,9,6,1,0,3);text(catalog.receiptSettings.tax_number,left+3,y+12,cardWidth-6,13,7,1,1)}
   y+=32
  }

  const itemWidth=102,quantityWidth=32,priceWidth=38,discountWidth=40,campaignWidth=42,amountWidth=fullWidth-itemWidth-quantityWidth-priceWidth-discountWidth-campaignWidth
  const itemX=right-itemWidth,quantityX=itemX-quantityWidth,priceX=quantityX-priceWidth,discountX=priceX-discountWidth,campaignX=discountX-campaignWidth,amountX=left
  fill(left,y,fullWidth,21)
  text("الصنف",itemX+3,y+2,itemWidth-6,16,7,1,1)
  text("الكمية",quantityX,y+2,quantityWidth,16,6,1,1)
  text("السعر",priceX,y+2,priceWidth,16,6,1,1)
  text("خصم",discountX,y+2,discountWidth,16,6,1,1)
  text("خصم حملة",campaignX,y+2,campaignWidth,16,5,1,1)
  text("المبلغ",amountX,y+2,amountWidth,16,6,1,1)
  y+=23
  for(let index=0;index<receiptData.lines.length;index++){
   const item=receiptData.lines[index]
    const itemLabel=`${item.name}${item.unitName?` - ${item.unitName}`:""}`
    text(itemLabel,left+3,y+2,fullWidth-6,14,8,1,1)
    text(money(item.quantity),quantityX,y+17,quantityWidth,13,7,1)
    text(money(item.price),priceX,y+17,priceWidth,13,7,1)
    text(money(item.price*item.quantity*item.discount/100),discountX,y+17,discountWidth,13,7,1)
    text(money(Number(item.campaign_discount||0)),campaignX,y+17,campaignWidth,13,7,1)
    text(money(item.price*item.quantity*(1-item.discount/100)-Number(item.campaign_discount||0)),amountX,y+17,amountWidth,13,7,1,1)
    line(left,y+32,right,y+32,3);y+=33
  }

  y+=5
  const panelGap=8,panelWidth=Math.floor((fullWidth-panelGap)/2),notesX=left+panelWidth+panelGap,totalsX=left
  box(notesX,y,panelWidth,90,3)
  text("ملاحظات",notesX+4,y+4,panelWidth-8,13,7,1,1)
  const noteText=receiptData.note||"شكراً لتسوقكم معنا"
  text(noteText,notesX+4,y+19,panelWidth-8,48,7,1)
  text("الأسعار تشمل ضريبة القيمة المضافة",notesX+4,y+69,panelWidth-8,14,6,1,0,3)
  const totalsBoxHeight=112
  box(totalsX,y,panelWidth,totalsBoxHeight,3)
  const totals:[string,string][]=[
   ["مجموع الأصناف",`${money(receiptData.subtotal)} ${receiptData.currencyCode}`],
   ["خصم الأصناف",`− ${money(receiptData.itemDiscount)} ${receiptData.currencyCode}`],
   ["خصم الفاتورة",`− ${money(receiptData.invoiceDiscount)} ${receiptData.currencyCode}`],
   [`ضريبة (${money(catalog.taxRate)}%)`,`${money(receiptData.tax)} ${receiptData.currencyCode}`],
  ]
  let totalY=y+6
  for(const [label,value] of totals){
   text(label,totalsX+panelWidth/2,totalY,panelWidth/2-5,16,6,1)
   text(value,totalsX+4,totalY,panelWidth/2-5,16,7,0,1)
   totalY+=17
  }
  line(totalsX+4,totalY,totalsX+panelWidth-4,totalY,3)
  totalY+=3
  fill(totalsX+2,totalY,panelWidth-4,22)
  text("الإجمالي",totalsX+panelWidth/2,totalY+3,panelWidth/2-5,17,8,1,1)
  text(`${money(receiptData.total)} ${receiptData.currencyCode}`,totalsX+5,totalY+3,panelWidth/2-5,17,9,0,1)
  y+=totalsBoxHeight+5
  if(receiptData.payments.length){
   const paymentBoxHeight=22+receiptData.payments.filter(row=>row.amount>0).length*16+16
   box(left,y,fullWidth,paymentBoxHeight,3)
   text("تفاصيل الدفع",right-100,y+3,96,14,7,1,1)
   let paymentY=y+19
   for(const payment of receiptData.payments.filter(row=>row.amount>0)){
    text(paymentLabels[payment.method]||payment.method,right-105,paymentY,100,14,6,1)
    text(`${money(payment.amount)} ${receiptData.currencyCode}`,left+3,paymentY,fullWidth-112,14,7,1,1)
    paymentY+=16
   }
   text("المبلغ للإرجاع",right-105,paymentY,100,14,6,1,1)
   text(`${money(receiptData.refundAmount)} ${receiptData.currencyCode}`,left+3,paymentY,fullWidth-112,14,7,1,1)
   y+=paymentBoxHeight+4
  }
  if(receiptData.code){
   const barcodeWidth=205,barcodeHeight=38,barcodeX=Math.floor(left+(fullWidth-barcodeWidth)/2)
   commands.push({type:7,image:receiptData.code,text:`invoice-${Date.now()}`,x:barcodeX,y,width:barcodeWidth,height:barcodeHeight,barcodeWidth:barcodeWidth*2,barcodeHeight:barcodeHeight*2,barcodeMargin:2})
   y+=barcodeHeight+2
   text(receiptData.code,left,y,fullWidth,13,7,0,1);y+=16
  }
  line(left,y,right,y,3);y+=4
  const footer=[catalog.receiptSettings.company_address,catalog.receiptSettings.company_phone,catalog.receiptSettings.company_email].filter(Boolean).join(" | ")
  if(footer){text(footer,left,y,fullWidth,18,6,1,0,3);y+=19}
  text("شكراً لتسوقكم معنا",left,y,fullWidth,16,8,1,1);y+=19
  try{
   await new Promise<void>((resolve,reject)=>{
    const timer=window.setTimeout(()=>reject(new Error("لم يتم العثور على خدمة الطباعة في هذا الجهاز")),5000)
    socket.addEventListener("open",()=>{window.clearTimeout(timer);resolve()},{once:true})
    socket.addEventListener("error",()=>{window.clearTimeout(timer);reject(new Error("تعذر الاتصال بخدمة الطباعة على هذا الجهاز"))},{once:true})
   })
  const sendRequest=(type:string,data:Record<string,string|number|boolean>)=>new Promise<void>((resolve,reject)=>{
   const timeoutMs=type==="startPrinting"?60000:5000
   const timer=window.setTimeout(()=>{socket.removeEventListener("message",onMessage);reject(new Error("انتهت مهلة استجابة خدمة الطباعة"))},timeoutMs)
    const onMessage=(event:MessageEvent)=>{
     try{
      const envelope=JSON.parse(String(event.data))
      if(String(envelope.Type||envelope.type||"").toLowerCase()!==type.toLowerCase())return
      let response=envelope.Data??envelope.data
      if(typeof response==="string")response=JSON.parse(response)
      const result=response?.data??response
      if(result?.success===false)throw new Error(String(result.message||"فشلت الطباعة"))
      window.clearTimeout(timer);socket.removeEventListener("message",onMessage);resolve()
     }catch(error){
      if(error instanceof SyntaxError)return
      window.clearTimeout(timer);socket.removeEventListener("message",onMessage);reject(error)
     }
    }
    socket.addEventListener("message",onMessage)
    socket.send(JSON.stringify(type==="startPrinting"?{type,...data}:{type,data}))
   })
   await sendRequest("initialPrinting",{})
   for(const command of commands)await sendRequest("addPrintCommand",command)
   await sendRequest("startPrinting",{printerName:"",paper:"POS 80mm",paperWidth:315,paperHeight:Math.max(220,y+8),openDrawer:false})
   setMessage({type:"success",text:"تم إرسال الفاتورة إلى الطابعة الافتراضية"})
  }catch(error){
   setMessage({type:"error",text:error instanceof Error?error.message:"تعذرت طباعة الفاتورة. تأكد من تشغيل خدمة الطباعة"})
  }finally{
   socket.close()
  }
 }
 const finish=async()=>{if(pricingBusy)return;const v=validate();if(v){setCheckoutError(v);return}if(editingInvoiceId&&!navigator.onLine){setCheckoutError(" تعديل الفاتورة يحتاج اتصالاً بالخادم");return}const browserPrintWindow=point?.print_invoices&&isMobilePrintDevice()?window.open("about:blank","_blank"):null;setSaving(true);
 const id=makeId(),payload=buildPayload(id),snapshot=campaignItems.map(x=>({...x})),queued:PosQueuedSale={id,tenantKey:baseKey,createdAt:new Date().toISOString(),payload,attempts:0};let completed=false;try{
  if(!navigator.onLine)throw new TypeError("offline");if(editingInvoiceId){const remove=await fetch(`/api/pos/history?point_id=${pointId}&id=${editingInvoiceId}`,{method:"DELETE"}),removed=await remove.json();if(!remove.ok)throw new Error(errorText(removed,"تعذر إلغاء الفاتورة القديمة"))}const r=await fetch("/api/pos/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok){setCheckoutError(errorText(d,"فشل الحفظ"));browserPrintWindow?.close();return}await refreshCampaignUsage();const receiptData=makeReceiptSnapshot(String(d.vch_code||""),false,snapshot);if(point?.print_invoices)void printReceiptDirect(receiptData,browserPrintWindow);else setReceipt(null);setMessage({type:"success",text:`تم ${editingInvoiceId?"تعديل":"حفظ"} ${mode==="return"?"المردود":mode==="gift"?"الهدية":"الفاتورة"} ${d.vch_code||""}`});completed=true;await loadSession()}catch(e){if(!(e instanceof TypeError)&&navigator.onLine){setCheckoutError(e instanceof Error?e.message:"فشل الحفظ");browserPrintWindow?.close();return}if(!point?.allow_offline){setCheckoutError("العمل دون اتصال غير مسموح لهذه النقطة");browserPrintWindow?.close();return}await queuePosSale(queued);await updateQueue();const localCode=`OFF-${id.slice(0,8).toUpperCase()}`,receiptData=makeReceiptSnapshot(localCode,true,snapshot);if(point?.print_invoices)void printReceiptDirect(receiptData,browserPrintWindow);else setReceipt(null);setMessage({type:"info",text:"حُفظت العملية على الجهاز وستُزامن تلقائيًا"});completed=true}finally{setSaving(false)}if(completed){
  setCart([]);setEditingInvoiceId(null);setEditingDraftId(null);focusBarcodeAfterSaveRef.current=true;setCheckoutOpen(false);setMode("sale");resetTransaction();if(pendingActionRef.current){setReceipt(null);resumeTransactionAction()}}}
 const custody=async(sourceId?:number,shiftGuid?:string)=>{if(saving)return;setCustodyError("");if(!navigator.onLine){setCustodyError("عمليات العهدة تحتاج اتصالاً بالخادم");return}setSaving(true);try{const closeAmounts=catalog.currencies.map(row=>({currency_id:row.currency_id,amount:Number(custodyAmounts[row.currency_id]??0)}));const closeTotal=closeAmounts.reduce((sum,row)=>sum+row.amount*Number(session?.currencies?.find((currency:any)=>Number(currency.currency_id)===row.currency_id)?.rate_to_point||catalog.currencies.find(currency=>currency.currency_id===row.currency_id)?.rate_to_point||1),0);const r=await fetch("/api/pos/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:!session?(sourceId?"receive":"open"):custodyAction,point_id:pointId,shift_guid:shiftGuid,amount:custodyAction==="close"?Math.round(closeTotal*100)/100:custodyAmount,currency_id:custodyCurrencyId||point?.currency_id,currency_amounts:(custodyAction==="cash_in"||custodyAction==="cash_out")?catalog.currencies.filter(row=>Number(movementAmounts[row.currency_id]||0)>0).map(row=>({currency_id:row.currency_id,amount:movementAmounts[row.currency_id]})):custodyAction==="close"?closeAmounts:(custodyAction==="open"||custodyAction==="handover")?catalog.currencies.map(row=>({currency_id:row.currency_id,amount:custodyAmounts[row.currency_id]||0})):undefined,note:custodyNote,source_session_id:sourceId})}),d=await r.json();if(!r.ok)throw new Error(d.error);setCatalog(c=>({...c,session:d.session||null}));setMessage({type:"success",text:"تم تنفيذ عملية العهدة بنجاح"});setCustodyOpen(false);setCustodyAmount(0);setCustodyAmounts({});setMovementAmounts({});setCustodyNote("");await loadSession()}catch(e){setCustodyError(e instanceof Error?e.message:"فشلت عملية العهدة")}finally{setSaving(false)}}
 const loadHistory=async(q=historyQuery,scope: "shift"|"all"=historyScope)=>{if(!pointId||!navigator.onLine){setHistoryError("سجل الفواتير يحتاج اتصالاً بالخادم");setHistoryOpen(true);return}const effectiveScope=scope==="shift"&&!session?.id?"all":scope;setHistoryScope(effectiveScope);setHistoryLoading(true);setHistoryError("");setHistoryOpen(true);try{const sessionFilter=effectiveScope==="shift"?`&session_id=${session?.id}`:"",r=await fetch(`/api/pos/history?point_id=${pointId}&q=${encodeURIComponent(q)}${sessionFilter}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(errorText(d,"تعذر تحميل الفواتير"));setHistoryRows(d.rows||[])}catch(e){setHistoryError(e instanceof Error?e.message:"تعذر تحميل الفواتير")}finally{setHistoryLoading(false)}}
 const loadReturnSourceInvoices=async(query=returnSourceQuery)=>{if(!pointId||!navigator.onLine){setReturnSourceError("اختيار فاتورة مصدر يحتاج اتصالاً بالخادم");return}setReturnSourceLoading(true);setReturnSourceError("");try{const response=await fetch(`/api/pos/history?point_id=${pointId}&source_invoices=1&q=${encodeURIComponent(query)}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(errorText(data,"تعذر تحميل فواتير المبيعات"));setReturnSourceInvoices((data.rows||[]).filter((row:ReturnSourceInvoice)=>Number(row.vch_type)===12))}catch(error){setReturnSourceError(error instanceof Error?error.message:"تعذر تحميل فواتير المبيعات")}finally{setReturnSourceLoading(false)}}
 const selectReturnSourceInvoice=async(invoice:ReturnSourceInvoice)=>{if(!pointId)return;setReturnSourceLoadingItems(true);setReturnSourceError("");setReturnSourceInvoice(invoice);try{const response=await fetch(`/api/pos/history?point_id=${pointId}&id=${invoice.id}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(errorText(data,"تعذر تحميل أصناف الفاتورة"));setReturnSourceInvoice(data)}catch(error){setReturnSourceInvoice(null);setReturnSourceError(error instanceof Error?error.message:"تعذر تحميل أصناف الفاتورة")}finally{setReturnSourceLoadingItems(false)}}
 const startManualReturn=()=>{setReturnChoiceOpen(false);resetTransaction();setMode("return");requestAnimationFrame(()=>searchRef.current?.focus())}
 const startInvoiceReturn=()=>{setReturnChoiceOpen(false);resetTransaction();setMode("return");setReturnSourceQuery("");setReturnSourceInvoice(null);setReturnSourceError("");setReturnSourceOpen(true);void loadReturnSourceInvoices("")}
 const addSelectedReturnItems=(selectedItems:SelectedReturnItem[])=>{const invoice=returnSourceInvoice;if(!invoice)return;const lines=selectedItems.map(({item,quantity})=>{const product=catalog.products.find(row=>row.id===Number(item.product_id));if(!product)return null;return {...product,lineId:makeId(),unitId:Number(item.unit_id)||product.unitId,unitName:String(item.unit_name||product.unitName||""),barcode:String(item.barcode||product.barcode||""),price:round(Number(item.price??item.unit_price??0)*(1+catalog.taxRate/100)),quantity,discount:Number(item.discount_percent??item.discount??0),gift:false,returnSalesInvoiceId:Number(invoice.id)}});if(lines.some(line=>!line)){setReturnSourceError("تعذر مطابقة أحد أصناف الفاتورة مع كتالوج نقطة البيع");return}resetTransaction();setMode("return");setCart(lines as CartLine[]);setCustomerId(Number(invoice.account_id)||null);setNote(`مرتجع من الفاتورة ${invoice.vch_code}`);setReturnSourceOpen(false);setReturnSourceInvoice(null);requestAnimationFrame(()=>searchRef.current?.focus())}
 const saveDraft=async()=>{if(saving||draftSaving)return;if(!pointId||!cart.length){setMessage({type:"error",text:"أضف صنفاً واحداً على الأقل قبل حفظ المسودة"});return}if(!session){setMessage({type:"error",text:"يجب فتح العهدة قبل حفظ المسودة"});return}setDraftNote(note);setDraftNoteError("");setDraftNoteOpen(true)}
 const confirmDraftSave=async()=>{const requiredNote=draftNote.trim();if(!requiredNote){setDraftNoteError("ملاحظة المسودة مطلوبة");return}setDraftSaving(true);setDraftError("");try{const r=await fetch("/api/pos/drafts",{method:editingDraftId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editingDraftId,pos_point_id:pointId,pos_session_id:session?.id,pos_customer_id:customerId,salesman_id:salesmanId,pos_mode:mode,note:requiredNote,discount_value:discountValue,items:cart.map(line=>({product_id:line.id,product_code:line.code,product_name:line.name,barcode:line.barcode,unit_id:line.unitId,unit_name:line.unitName,price:line.price,quantity:line.quantity,discount:line.discount,account_id:line.accountId,return_account_id:line.returnAccountId,available:line.available}))})}),d=await r.json();if(!r.ok)throw new Error(errorText(d,"تعذر حفظ مسودة الكاشير"));setMessage({type:"success",text:`تم حفظ المسودة ${d.draft_code||""}`});setDraftNoteOpen(false);setCart([]);setCustomerId(null);setSalesmanId(null);setNote("");setDraftNote("");setDiscountValue(0);setMode("sale")}catch(e){setDraftError(e instanceof Error?e.message:"تعذر حفظ المسودة");setMessage({type:"error",text:e instanceof Error?e.message:"تعذر حفظ المسودة"})}finally{setDraftSaving(false)}}
 const loadDrafts=async()=>{if(!pointId||!navigator.onLine){setDraftError("بحث المسودات يحتاج اتصالاً بالخادم");setDraftOpen(true);return}setDraftLoading(true);setDraftError("");setDraftQuery("");setDraftOpen(true);try{const r=await fetch(`/api/pos/drafts?point_id=${pointId}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(errorText(d,"تعذر تحميل المسودات"));setDraftRows(d.rows||[])}catch(e){setDraftError(e instanceof Error?e.message:"تعذر تحميل المسودات")}finally{setDraftLoading(false)}}
 const openDraft=(draft:any)=>{const lines=(Array.isArray(draft.items)?draft.items:[]).map((item:any)=>{const product=catalog.products.find(row=>row.id===Number(item.product_id));if(!product)return null;return {...product,lineId:makeId(),barcode:String(item.barcode||product.barcode||""),unitId:Number(item.unit_id)||product.unitId,unitName:String(item.unit_name||product.unitName||""),price:Number(item.price||0),quantity:Number(item.quantity||0),discount:Number(item.discount_percent??item.discount??0),gift:false}}).filter((line:any)=>line&&line.quantity>0);if(!lines.length||lines.length!==(draft.items||[]).length){setDraftError("تعذر مطابقة أصناف المسودة مع كتالوج نقطة البيع");return}setEditingInvoiceId(null);setEditingDraftId(Number(draft.id));setCart(lines);setCustomerId(Number(draft.customer_id)||null);setSalesmanId(Number(draft.salesman_id)||null);setMode(["sale","return","gift"].includes(draft.mode)?draft.mode:"sale");setNote(String(draft.note||""));setDiscountValue(Number(draft.discount_value||0));setPayments([]);setCashCurrencyAmounts({});setCashTendered(0);setDraftOpen(false);setMessage({type:"info",text:`تم فتح المسودة ${draft.draft_code}`});requestAnimationFrame(()=>searchRef.current?.focus())}
 const selectHistoryInvoice=async(row:PosInvoice)=>{setHistorySelected(row);setHistoryError("");setHistoryOpen(false);if(!pointId||row.items)return;try{const r=await fetch(`/api/pos/history?point_id=${pointId}&id=${row.id}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(errorText(d,"تعذر تحميل الفاتورة"));setHistorySelected(current=>Number(current?.id)===Number(row.id)?d:current)}catch(e){setMessage({type:"error",text:e instanceof Error?e.message:"تعذر تحميل الفاتورة"})}}
 const editHistoryInvoice=async()=>{const invoice=historySelected;if(!invoice?.items?.length)return;if(Number(invoice.vch_type)===9){setMessage({type:"error",text:"تعديل سند الهدية غير متاح من الكاشير"});return}const lines:CartLine[]=invoice.items.flatMap(item=>{const product=catalog.products.find(row=>row.id===Number(item.product_id));if(!product)return [];return [{...product,lineId:makeId(),quantity:Number(item.qnty??item.quantity??0),discount:Number((item as any).regular_discount_percent??item.discount_percent??item.discount??0),campaign_discount:Number((item as any).campaign_discount_display??(item as any).campaign_discount??0),campaign_id:Number((item as any).campaign_id)||null,gift:false}]});if(!lines.length||lines.length!==invoice.items.length){setMessage({type:"error",text:"تعذر مطابقة أصناف الفاتورة الحالية مع كتالوج نقطة البيع"});return}setCart(lines);setCustomerId(Number(invoice.account_id)||null);setSalesmanId(Number(invoice.salesman_id)||null);setNote(String(invoice.note||""));setMode(Number(invoice.vch_type)===16?"return":"sale");setDiscountValue(0);setPayments([]);setCashCurrencyAmounts({});setCashTendered(0);setEditingDraftId(null);setEditingInvoiceId(Number(invoice.id));setHistorySelected(null);setMessage({type:"info",text:`جاري تعديل الفاتورة ${invoice.vch_code}`});requestAnimationFrame(()=>searchRef.current?.focus())}
 const historyIndex=historySelected?historyRows.findIndex(row=>Number(row.id)===Number(historySelected.id)):-1
 const moveHistory=(index:number)=>{const row=historyRows[index];if(row)void selectHistoryInvoice(row)}
 const deleteHistoryInvoice=async(row:PosInvoice)=>{if(!pointId||Number(row.id)<=0||!window.confirm(`تأكيد حذف الفاتورة ${row.vch_code}${row.receipt_vch_code?` وسند القبض المرتبط ${row.pos_receipts?.length ? row.pos_receipts.map(receipt=>receipt.vch_code).join(" / ") : row.receipt_vch_code}`:""}؟`))return;setHistoryDeleting(true);setHistoryError("");try{const r=await fetch(`/api/pos/history?point_id=${pointId}&id=${row.id}`,{method:"DELETE"}),d=await r.json();if(!r.ok)throw new Error(errorText(d,"تعذر حذف الفاتورة"));const index=historyRows.findIndex(item=>Number(item.id)===Number(row.id)),remaining=historyRows.filter(item=>Number(item.id)!==Number(row.id));setHistoryRows(remaining);setHistorySelected(null);if(remaining.length)void selectHistoryInvoice(remaining[Math.min(index,remaining.length-1)]);await loadSession();await loadCatalogData();setMessage({type:"success",text:`تم حذف الفاتورة ${row.vch_code}`})}catch(e){setMessage({type:"error",text:e instanceof Error?e.message:"تعذر حذف الفاتورة"})}finally{setHistoryDeleting(false)}}
 const print=()=>{if(!receipt)return;const rows=receipt.lines.map(l=>`<tr><td>${l.name}</td><td>${l.quantity}</td><td>${l.price.toFixed(2)}</td><td>${round(l.price*l.quantity*(1-l.discount/100)).toFixed(2)}</td></tr>`).join("");const w=window.open("","_blank","width=420,height=680");if(!w)return;w.document.write(`<html dir=rtl><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px dashed #aaa}</style><h2>${receipt.mode==="return"?"مردود مبيعات":mode==="gift"?"سند إخراج هدية":"فاتورة بيع"}</h2><p>${receipt.code}</p><table><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>${rows}</table><h2>الإجمالي ${receipt.total.toFixed(2)} ${point?.currency_code||""}</h2></html>`);w.document.close();w.print()}
 const actions=[{label:mode==="gift"?"تأكيد الهدية":"تفاصيل الدفع",shortcut:"F3",icon:CreditCard,onClick:openCheckout},{label:"خصم",shortcut:"F5",icon:Percent,onClick:()=>setDiscountOpen(true)},{label:mode==="return"?"إلغاء المردود":"مردودات",icon:RotateCcw,onClick:()=>{if(!point?.allow_returns)return setMessage({type:"error",text:"المردودات غير مفعلة لهذه النقطة"});if(mode==="return"){requestTransactionAction(()=>{resetTransaction();setMode("sale")});return}requestTransactionAction(()=>setReturnChoiceOpen(true))}},{label:mode==="gift"?"إلغاء الهدية":"هدية",icon:Gift,onClick:()=>{if(!point?.allow_gifts)return setMessage({type:"error",text:"الهدايا غير مفعلة لهذه النقطة"});const nextMode=mode==="gift"?"sale":"gift";requestTransactionAction(()=>{resetTransaction();setMode(nextMode)})}},{label:"ملاحظة",shortcut:"F11",icon:StickyNote,onClick:()=>setNoteOpen(true)},{label:"الفواتير",shortcut:"F4",icon:History,onClick:()=>requestTransactionAction(()=>void loadHistory())},{label:"العهدة",shortcut:"F2",icon:HandCoins,onClick:()=>requestTransactionAction(()=>setCustodyOpen(true))},{label:"تحديث",shortcut:"F12",icon:RefreshCw,onClick:()=>void loadCatalogData()}]
 const visibleDraftRows=draftRows.filter(draft=>`${draft.draft_code||""} ${draft.customer_name||""} ${draft.note||""}`.toLowerCase().includes(draftQuery.trim().toLowerCase()))
 const discountLine=cart.find(line=>posCartLineKey(line)===itemDiscountId)
 const discountCampaignAmount=discountLine?Number(campaignItems.find(line=>posCartLineKey(line)===posCartLineKey(discountLine))?.campaign_discount||0):0
 const discountLineGross=discountLine?discountLine.price*discountLine.quantity:0
 const discountLineRemaining=Math.max(0,discountLineGross-discountCampaignAmount)
 const discountLineInitialPercent=discountLineRemaining>0?Math.min(100,discountLineGross*discountLine.discount/discountLineRemaining*100):0
 return <div dir="rtl" className="pos-workspace pos-cashier" data-mode={mode}>
  {pricingBusy && <div role="status" className="fixed inset-x-0 top-0 z-[1300] bg-teal-700 p-2 text-center text-sm text-white">جاري تحميل أسعار فئة العميل…</div>}
  <ConfirmDialogYesNo visible={Boolean(pendingCustomer)} title="فئة سعر العميل" message="فئة السعر للعميل المختار تختلف عن فئة السعر لنقطة البيع هل تريد احتساب اسعار الاصناف ؟" showBack useAppDialog busy={pricingBusy} confirmLabel="نعم" cancelLabel="لا" backLabel="إلغاء" onConfirm={()=>{if(pendingCustomer)void applyCustomerPrices(pendingCustomer)}} onCancel={keepCustomerPrices} onBack={cancelCustomerSelection} onDismiss={cancelCustomerSelection}/>
  <Dialog open={Boolean(customerPriceError)} onOpenChange={open=>{if(!open)setCustomerPriceError("")}}><DialogContent dir="rtl" className="z-[1200] max-w-md"><DialogHeader><DialogTitle>تعذر اختيار العميل</DialogTitle><DialogDescription>{customerPriceError}</DialogDescription></DialogHeader><DialogFooter><Button onClick={()=>setCustomerPriceError("")}>حسناً</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={unsavedActionOpen} onOpenChange={open=>{if(!open)cancelTransactionAction()}}>
   <DialogContent dir="rtl" className="pos-unsaved-dialog">
    <div className="pos-unsaved-heading"><span className="pos-unsaved-icon"><Save size={24}/></span><DialogHeader><DialogTitle>حفظ التغييرات؟</DialogTitle><DialogDescription>توجد تغييرات غير محفوظة في الحركة الحالية. هل تريد حفظها قبل المتابعة؟</DialogDescription></DialogHeader></div>
    <DialogFooter className="pos-unsaved-actions">
     <Button className="pos-save-continue" onClick={saveAndContinue} disabled={!cart.length||saving||!session}><Save/>حفظ ومتابعة</Button>
     <Button className="pos-discard-continue" variant="outline" onClick={discardAndContinue}><ArrowLeft/>تجاهل ومتابعة</Button>
     <Button variant="outline" onClick={cancelTransactionAction}><X/>إلغاء</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
  <Dialog open={pointChooserOpen} onOpenChange={open=>{if(open)setPointChooserOpen(true)}}>
   <DialogContent dir="rtl" className="max-w-lg" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>event.preventDefault()}>
    <DialogHeader><DialogTitle>اختر نقطة البيع</DialogTitle><DialogDescription>لا توجد لديك عهدة مفتوحة. اختر نقطة البيع للمتابعة.</DialogDescription></DialogHeader>
    {pointChooserError&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">{pointChooserError}</p>}
    <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
     {points.map(posPoint=><Button key={posPoint.id} type="button" variant="outline" className="h-auto min-h-14 justify-between whitespace-normal rounded-xl px-4 py-3 text-right" disabled={pointChooserBusy} onClick={()=>void choosePoint(posPoint)}>
      <span><strong className="block">{posPoint.name}</strong><small className="mt-1 block text-slate-500">{posPoint.code}{posPoint.warehouse_name?` · ${posPoint.warehouse_name}`:""}</small></span>
      {pointChooserBusy&&<RefreshCw className="size-4 shrink-0 animate-spin"/>}
     </Button>)}
    </div>
   </DialogContent>
  </Dialog>
  {noPoints&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-lg font-bold text-amber-800">يجب تعريف نقطة بيع اولا</div>}
  <div className="pos-topbar">
  <header className="pos-toolbar">
   <div className="pos-identity"><span className="pos-brand"><ShoppingBag size={25}/></span><div><span className="pos-eyebrow">مساحة البيع</span><h1>الكاشير</h1></div></div>
   <nav className="pos-toolbar-actions" aria-label="إجراءات نقطة البيع">
    <button type="button" onClick={()=>requestTransactionAction(()=>{resetTransaction();setMode("sale");setHistorySelected(null);requestAnimationFrame(()=>searchRef.current?.focus())})} disabled={saving||draftSaving||pricingBusy}><Plus size={16}/>جديد</button>
    <button type="button" className="pos-primary-tool" onClick={openCheckout} disabled={!cart.length||saving}><CreditCard size={16}/>الدفع والحفظ <kbd>F3</kbd></button>
    <button type="button" onClick={()=>requestTransactionAction(()=>void loadHistory())}><History size={16}/>الفواتير <kbd>F4</kbd></button>
    <button type="button" onClick={()=>void saveDraft()} disabled={!cart.length||saving||draftSaving}><Bookmark size={16}/>حفظ كمسودة</button>
    <button type="button" onClick={()=>requestTransactionAction(()=>void loadDrafts())} disabled={draftLoading}><FolderOpen size={16}/>بحث المسودات</button>
    <button type="button" onClick={()=>requestTransactionAction(()=>setCustodyOpen(true))}><HandCoins size={16}/>العهدة <kbd>F2</kbd></button>
    <button type="button" onClick={()=>void syncPending()} disabled={syncing||!online}><RefreshCw size={16} className={cn(syncing&&"animate-spin")}/>مزامنة{pendingCount>0&&<span className="pos-badge">{pendingCount}</span>}</button>
   </nav>
   <span className={cn("pos-connection",!online&&"is-offline")} role="status" title={online?"متصل":"غير متصل"} aria-label={online?"متصل":"غير متصل"}>{online?<Wifi size={15}/>:<WifiOff size={15}/>} {online?"متصل":"غير متصل"}</span>
  </header>
  <section className="pos-overview">
   <div className="pos-context" title={cart.length?"احفظ الفاتورة الحالية أو ألغها قبل تغيير نقطة البيع":undefined}>
    <label htmlFor="pos-point">نقطة البيع الحالية</label>
    <PrimeDropdown inputId="pos-point" value={pointId||null} options={points.map(p=>({label:`${p.code} — ${p.name}`,value:p.id}))} optionLabel="label" optionValue="value" placeholder="اختر نقطة البيع" filter={points.length>6} disabled={cart.length>0||saving||pointChooserBusy} className="pos-point-dropdown w-full" panelClassName="invoice-currency-dropdown-panel pos-point-panel" appendTo={typeof document!=="undefined"?document.body:undefined} onChange={(event:any)=>{const selected=points.find(posPoint=>posPoint.id===Number(event.value));if(selected&&selected.id!==pointId)void choosePoint(selected)}}/>
   </div>
   <div className="pos-shift"><div><UserRound size={15}/><b>{user?.fullName||user?.username||"الكاشير"}</b><time dateTime={today()}>{today()}</time></div><div><Warehouse size={15}/><span>{point?.warehouse_name||"المخزن"}</span><span className={cn("pos-shift-state",!session&&"is-closed")}><span/>{session?"العهدة مفتوحة":"العهدة مغلقة"}</span></div></div>
   <div className="pos-net"><span className="pos-net-icon"><WalletCards size={25}/></span><div><span>{mode==="return"?"الصافي للاسترجاع":mode==="gift"?"إجمالي الهدية":"الصافي للدفع"}</span><strong><bdi>{total.toFixed(2)}</bdi> <small>{point?.currency_code}</small></strong></div></div>
  </section>
  </div>
  {message&&<div role="status" className={cn("pos-message",message.type==="error"&&"is-error")}><span>{message.text}</span><button aria-label="إغلاق الرسالة" onClick={()=>setMessage(null)}><X size={16}/></button></div>}
  <main className="pos-layout">
   <section className="pos-catalog">
    <div className="pos-catalog-head">
     <div className="pos-search-field"><Search size={19}/><Input aria-label="البحث باسم الصنف" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="F10"){e.preventDefault();e.stopPropagation();openItemSearch(e.currentTarget.value)}}} placeholder="ابحث باسم الصنف… (F10 بحث)"/>{query&&<button type="button" aria-label="مسح البحث" onClick={()=>setQuery("")}><X size={16}/></button>}<button type="button" className="pos-item-search-btn" aria-label="بحث الأصناف (F10)" title="بحث الأصناف (F10)" onClick={()=>openItemSearch(query)} disabled={pricingBusy||Boolean(historySelected)}><Search size={16}/><span>بحث</span></button></div>
     <span className="pos-count">{shown.length} صنف</span>
    </div>
    <div className="pos-categories-bar"><button type="button" className="pos-categories-arrow" aria-label="التصنيفات السابقة" onClick={()=>categoriesRef.current?.scrollBy({left:260,behavior:"smooth"})}><ChevronRight size={18}/></button><div ref={categoriesRef} className="pos-categories" aria-label="تصنيفات الأصناف" onWheel={event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX))event.currentTarget.scrollLeft-=event.deltaY}}><button type="button" aria-pressed={category==="all"} onClick={()=>setCategory("all")} title="كل الأصناف"><ShoppingBag size={16} aria-hidden="true"/><span>الكل</span><small>{productsForSale.length}</small></button>{categories.map(group=><button type="button" key={group.name} aria-pressed={category===group.name} onClick={()=>setCategory(group.name)} title={group.name}><span>{group.name}</span><small>{group.count}</small></button>)}</div><button type="button" className="pos-categories-arrow" aria-label="التصنيفات التالية" onClick={()=>categoriesRef.current?.scrollBy({left:-260,behavior:"smooth"})}><ChevronLeft size={18}/></button></div>
    <div className="pos-products" aria-busy={loading}>{loading?<div className="pos-empty"><RefreshCw className="animate-spin"/>جاري تحميل الأصناف…</div>:shown.length?shown.slice(0,visibleLimit).map(p=><button key={p.id} onClick={()=>add(p)} className="pos-product" aria-label={`إضافة ${p.name}`} disabled={pricingBusy}>
     <div className="pos-product-visual"><span className={cn("pos-product-icon",p.image&&"has-image")}>{p.image?<img src={p.image} alt="" loading="lazy"/>:<PackageOpen size={30}/>}</span><small className={cn("pos-stock",p.available<=0&&"is-unavailable")}><span/>{p.available<=0?"نفد":`${p.available} ${p.unitName||""}`}</small><span className="pos-product-add" aria-hidden="true"><Plus size={16}/></span></div>
     <div className="pos-product-details"><b>{p.name}</b><small className="pos-product-code" dir="ltr">{p.code}</small><strong><bdi>{p.price.toFixed(2)}</bdi><small>{point?.currency_code}</small></strong></div>
    </button>):<div className="pos-empty"><span className="pos-empty-icon"><Search size={30}/></span><h3>لا توجد أصناف مطابقة</h3><button className="pos-tool" onClick={()=>{setQuery("");setCategory("all")}}>مسح البحث والتصنيف</button></div>}</div>
    {shown.length>visibleLimit&&<button className="pos-tool pos-more" onClick={()=>setVisibleLimit(limit=>limit+180)}>عرض المزيد ({shown.length-visibleLimit})</button>}
   </section>
   <section className="pos-sale">
    <div className="pos-panel-heading"><div className="pos-panel-title"><span className="pos-heading-icon"><ShoppingCart size={18}/></span><div><h2>{historySelected?`عرض الفاتورة ${historySelected.vch_code}`:mode==="return"?"مردود مبيعات":mode==="gift"?"هدية":"الفاتورة الحالية"}</h2><p>{historySelected?`${historySelected.items?.length||0} أصناف`:`${cart.length} أصناف · ${cart.reduce((s,l)=>s+l.quantity,0)} وحدات`}</p></div></div><span className={cn("pos-mode-badge",`is-${mode}`)}>{historySelected?"عرض":editingInvoiceId?"تعديل":mode==="return"?"مردود":mode==="gift"?"هدية":"بيع جديد"}</span></div>
    {!historySelected&&<div className="pos-parties">{(["customer","salesman"] as const).map(kind=><PosPartyButton key={kind} kind={kind} selected={kind==="customer"?catalog.customers.find(c=>c.id===customerId):(catalog.salesmen||[]).find(c=>c.id===salesmanId)} onOpen={()=>setPartyPicker(kind)} onClear={()=>kind==="customer"?selectCustomer(null):setSalesmanId(null)}/>)}</div>}
    <div className="pos-search-field pos-barcode-field"><Barcode size={21}/><Input ref={searchRef} autoFocus aria-label="إدخال باركود الصنف" value={barcodeQuery} onChange={e=>setBarcodeQuery(e.target.value)} onKeyDown={e=>{if(e.key==="F10"){e.preventDefault();e.stopPropagation();openItemSearch(e.currentTarget.value)}else if(e.key==="Enter"){e.preventDefault();if(!e.nativeEvent.isComposing)searchEnter()}}} placeholder="امسح أو أدخل الباركود ثم Enter… (F10 بحث)"/><button type="button" className="pos-item-search-btn" aria-label="بحث الأصناف (F10)" title="بحث الأصناف (F10)" onClick={()=>openItemSearch(barcodeQuery)} disabled={pricingBusy||Boolean(historySelected)}><Search size={16}/><span>بحث</span></button></div>
    <div className="pos-cart" aria-label="أصناف الفاتورة">
     {historySelected?<div className="pos-history-view">
      <div className="pos-history-nav">
       <Button size="icon" variant="outline" disabled={historyIndex<=0} onClick={()=>moveHistory(0)} aria-label="أول فاتورة"><ChevronsRight size={16}/></Button>
       <Button size="icon" variant="outline" disabled={historyIndex<=0} onClick={()=>moveHistory(historyIndex-1)} aria-label="الفاتورة السابقة"><ChevronRight size={16}/></Button>
       <span>{historyIndex>=0?`${historyIndex+1} / ${historyRows.length}`:"—"}</span>
       <Button size="icon" variant="outline" disabled={historyIndex<0||historyIndex>=historyRows.length-1} onClick={()=>moveHistory(historyIndex+1)} aria-label="الفاتورة التالية"><ChevronLeft size={16}/></Button>
       <Button size="icon" variant="outline" disabled={historyIndex<0||historyIndex>=historyRows.length-1} onClick={()=>moveHistory(historyRows.length-1)} aria-label="آخر فاتورة"><ChevronsLeft size={16}/></Button>
      </div>
      <div className="pos-history-actions">
       <Button size="sm" variant="outline" disabled={!historySelected.items?.length||historyDeleting} onClick={editHistoryInvoice}><Pencil size={15}/> تعديل وحفظ</Button>
       <Button size="sm" variant="outline" className="text-rose-700" disabled={Number(historySelected.id)<=0||historyDeleting} onClick={()=>void deleteHistoryInvoice(historySelected)}><Trash2 size={15}/>حذف <kbd>F5</kbd></Button>
       <Button size="sm" variant="outline" onClick={()=>{setHistorySelected(null);setEditingInvoiceId(null);setEditingDraftId(null);requestAnimationFrame(()=>searchRef.current?.focus())}}><Plus size={15}/>فاتورة جديدة</Button>
      </div>
      <div className="pos-history-summary"><div><small>العميل</small><b>{historySelected.customer_name||"عميل نقدي"}</b></div><div><small>التاريخ</small><b>{String(historySelected.vch_date).slice(0,10)}</b></div><div><small>الإجمالي</small><b dir="ltr">{Number(historySelected.amount||0).toFixed(2)} {point?.currency_code}</b></div></div>
      {!!historySelected.payments?.length&&<div className="pos-history-payments">{historySelected.payments.map((payment,index)=><span key={index}>{paymentLabels[payment.method as PaymentKey]||payment.method}: {Number(payment.amount||0).toFixed(2)}{payment.reference?` · ${payment.reference}`:""}</span>)}</div>}
      {(historySelected.items||[]).map((item,index)=><article key={item.id||index} className="pos-cart-line is-history"><div className="pos-line-name"><span className="pos-line-index">{index+1}</span><span className="pos-line-info"><b>{item.product_name||item.item_name||"—"}</b><small>{Number(item.qnty??item.quantity??0)} × {Number(item.price||0).toFixed(2)}</small></span><strong className="pos-line-total">{Number(item.total_price??item.line_amount??0).toFixed(2)}</strong></div></article>)}
      {!historySelected.items&&<p className="pos-history-loading">جاري تحميل تفاصيل الفاتورة...</p>}
     </div>:cart.length?cart.map((l,index)=>{const key=posCartLineKey(l),campaign=Number(campaignItems[index]?.campaign_discount||0),selected=selectedLineId===key;return <article key={key} className={cn("pos-cart-line",selected&&"is-selected",l.gift&&"is-gift")}>
      <button className="pos-line-name" aria-pressed={selected} onClick={()=>{setSelectedLineId(key);setQuantityEntry(String(l.quantity))}}>
       <span className="pos-line-index">{index+1}</span>
       <span className="pos-line-info"><b>{l.name}</b><small>{l.code}{l.barcode?` · ${l.barcode}`:""} · {l.price.toFixed(2)} / {l.unitName||"وحدة"}</small>{(l.gift||l.discount>0||campaign>0)&&<span className="pos-line-tags">{l.gift&&<i className="is-gift">هدية</i>}{l.discount>0&&<i>خصم {Number(l.discount.toFixed(2))}%</i>}{campaign>0&&<i className="is-campaign">حملة −{campaign.toFixed(2)}</i>}</span>}</span>
       <strong className="pos-line-total">{round(l.price*l.quantity*(1-l.discount/100)-campaign).toFixed(2)}</strong>
      </button>
      <div className="pos-line-controls">
       <div className="pos-quantity"><button aria-label={`تقليل كمية ${l.name}`} onClick={()=>changeQty(key,-1)}><Minus size={15}/></button><strong>{l.quantity}</strong><button aria-label={`زيادة كمية ${l.name}`} onClick={()=>changeQty(key,1)}><Plus size={15}/></button></div>
       <button type="button" className="pos-item-discount" disabled={mode==="gift"||saving} onClick={()=>setItemDiscountId(key)} aria-label={`خصم الصنف ${l.name}`}><Percent size={14}/><span>{l.discount?`${Number(l.discount.toFixed(2))}%`:"خصم"}</span></button>
       <button className="pos-remove" aria-label={`حذف ${l.name}`} onClick={()=>{setCart(c=>c.filter(x=>posCartLineKey(x)!==key));if(selected){setSelectedLineId(null);setQuantityEntry("")}logCashierAction("حذف صنف من فاتورة","",l.name)}}><Trash2 size={16}/></button>
      </div>
     </article>}):<div className="pos-empty"><span className="pos-empty-icon"><ShoppingCart size={34}/><span className="pos-empty-plus"><Plus size={14}/></span></span><h3>فاتورتك جاهزة للبدء</h3><p>اختر صنفاً من الكتالوج أو امسح الباركود</p></div>}
    </div>
    {!historySelected&&<footer className="pos-ticket-footer">
     <div className="pos-totals">
      <div><span>مجموع الأصناف</span><b>{cart.reduce((s,l)=>s+l.price*l.quantity,0).toFixed(2)}</b></div>
      {cart.some(l=>l.discount>0)&&<div><span>خصم الأصناف</span><b>−{cart.reduce((s,l)=>s+l.price*l.quantity*l.discount/100,0).toFixed(2)}</b></div>}
      {(campaignItems.some(line=>Number(line.campaign_discount||0)>0)||campaignResult.invoiceDiscount>0)&&<div><span>خصم الحملات</span><b>−{(campaignItems.reduce((sum,line)=>sum+Number(line.campaign_discount||0),0)+campaignResult.invoiceDiscount).toFixed(2)}</b></div>}
      {invoiceDiscount>0&&<div><span>خصم الفاتورة</span><b>−{invoiceDiscount.toFixed(2)}</b></div>}
      <div><span>الضريبة (ضمن السعر)</span><b>{tax.toFixed(2)}</b></div>
      <div className="pos-totals-due"><span>{mode==="return"?"إجمالي المبلغ للاسترجاع":mode==="gift"?"إجمالي الهدية":"إجمالي المبلغ للدفع"}</span><b><bdi>{total.toFixed(2)}</bdi> <small>{point?.currency_code}</small></b></div>
     </div>
     <div className="pos-control-row">
      <div className="pos-keypad"><div className="pos-keypad-entry"><Input id="pos-quantity-entry" aria-label="كمية الصنف المحدد" placeholder="الكمية" inputMode="decimal" value={quantityEntry} disabled={!cart.some(l=>posCartLineKey(l)===selectedLineId)} onChange={e=>setQuantityEntry(e.target.value)} onKeyDown={e=>e.key==="Enter"&&applyQuantity()}/><Button variant="outline" onClick={applyQuantity} disabled={!cart.some(l=>posCartLineKey(l)===selectedLineId)}>تطبيق</Button></div><div className="pos-keypad-keys" dir="ltr">{["1","2","3","4","5","6","7","8","9","⌫","0","."].map(key=><button key={key} disabled={!cart.some(l=>posCartLineKey(l)===selectedLineId)} aria-label={key==="⌫"?"مسح رقم":key} onClick={()=>setQuantityEntry(v=>key==="⌫"?v.slice(0,-1):key==="."&&v.includes(".")?v:v+key)}>{key}</button>)}</div></div>
      <nav className="pos-actions" aria-label="إجراءات الفاتورة">{actions.slice(1).map(a=><button key={a.label} onClick={a.onClick} disabled={mode==="gift"&&a.label==="خصم"}><a.icon size={18}/><span>{a.label}</span>{a.shortcut&&<kbd>{a.shortcut}</kbd>}</button>)}</nav>
     </div>
     <button type="button" className="pos-pay-button" onClick={openCheckout} disabled={!cart.length||saving}>
      <span className="pos-pay-label"><CreditCard size={20}/>{mode==="return"?"استرجاع":mode==="gift"?"تأكيد الهدية":"الدفع"}<kbd>F3</kbd></span>
      <strong><bdi>{total.toFixed(2)}</bdi> <small>{point?.currency_code}</small></strong>
     </button>
     {note&&<p className="pos-ticket-note"><StickyNote size={13}/>{note}</p>}
    </footer>}
   </section>
  </main>

 {partyPicker&&<PosPartyPicker title={partyPicker==="customer"?"بحث الحساب":"بحث المندوب"} rows={partyPicker==="customer"?catalog.customers:catalog.salesmen||[]} onClose={()=>setPartyPicker(null)} onSelect={id=>{if(partyPicker==="customer")selectCustomer(id);else setSalesmanId(id);setPartyPicker(null)}}/>}
 <PosPaymentDetailsDialog open={checkoutOpen} onOpenChange={open=>{setCheckoutOpen(open);if(!open)pendingActionRef.current=null}} mode={mode} total={total} currencyCode={point?.currency_code||""} pointCurrencyId={Number(point?.currency_id||0)} currencies={catalog.currencies} customers={catalog.customers} customerId={customerId} onCustomerChange={selectCustomer} banks={catalog.banks} branches={catalog.bankBranches} cardTypes={catalog.cardTypes.filter(card=>Number(card.currency_id)===Number(point?.currency_id))} payments={payments} cashAmounts={cashCurrencyAmounts} onCashChange={updateCashCurrency} onPaymentAmount={(method,value,currencyId)=>{updatePayment(method,value,undefined,currencyId);setCheckoutError("")}} onPaymentField={updatePaymentField} onConfirm={()=>void finish()} onSavedClose={()=>{if(!focusBarcodeAfterSaveRef.current)return false;focusBarcodeAfterSaveRef.current=false;searchRef.current?.focus();return true}} busy={saving} error={checkoutError}/>
 <PosStartSessionDialog open={custodyOpen&&!session&&!!point&&!noPoints} onOpenChange={setCustodyOpen} userName={user?.fullName||user?.username||""} currency={point?.currency_name||""} amount={custodyAmount} onAmountChange={setCustodyAmount} currencies={catalog.currencies} amounts={custodyAmounts} onCurrencyAmountChange={(currencyId,amount)=>setCustodyAmounts(current=>({...current,[currencyId]:amount}))} busy={saving} online={online} error={custodyError} pending={pendingHandovers} activeShift={activePointShift} onConfirm={(sourceId,shiftGuid)=>void custody(sourceId,shiftGuid)}/>
 <PosHandoverDialog open={custodyOpen&&!!session} onOpenChange={setCustodyOpen} session={session} userName={user?.fullName||user?.username||""} currencyCode={point?.currency_code||""} currencies={catalog.currencies} action={custodyAction} onActionChange={action=>{setCustodyAction(action);setCustodyAmount(0);setMovementAmounts({});}} amount={custodyAmount} onAmountChange={setCustodyAmount} currencyId={custodyCurrencyId||Number(point?.currency_id||catalog.currencies[0]?.currency_id)} onCurrencyIdChange={setCustodyCurrencyId} amounts={custodyAmounts} onCurrencyAmountChange={(id,amount)=>{custodyAmountsEditedRef.current=true;setCustodyAmounts(current=>({...current,[id]:amount}))}} movementAmounts={movementAmounts} onMovementAmountChange={(id,amount)=>setMovementAmounts(current=>({...current,[id]:amount}))} note={custodyNote} onNoteChange={setCustodyNote} onConfirm={()=>void custody()} busy={saving} error={custodyError}/>
 {discountOpen&&<PosDiscountDialog subtotal={subtotal} itemDiscount={cart.reduce((sum,line)=>sum+line.price*line.quantity*line.discount/100,0)} customer={catalog.customers.find(c=>c.id===customerId)?.name||"عميل نقدي"} maximum={Number(point?.max_discount_percent??100)} initialPercent={discountValue} onApply={percent=>{setDiscountValue(percent);setDiscountOpen(false);logCashierAction("اضافة خصم","",`${percent}%`)}} onClose={()=>setDiscountOpen(false)}/>}
 {discountLine&&<PosItemDiscountDialog key={itemDiscountId} itemName={discountLine.name} gross={discountLineRemaining} maximum={Number(point?.max_discount_percent??100)} initialPercent={discountLineInitialPercent} onApply={percent=>{const regularDiscountAmount=discountLineRemaining*percent/100;const regularDiscountPercent=discountLineGross>0?regularDiscountAmount/discountLineGross*100:0;setCart(lines=>lines.map(line=>posCartLineKey(line)===itemDiscountId?{...line,discount:regularDiscountPercent}:line));setItemDiscountId(null);logCashierAction("اضافة خصم صنف","",`${discountLine.name} ${regularDiscountAmount.toFixed(2)}`)}} onClose={()=>setItemDiscountId(null)}/>}
 <Dialog open={noteOpen} onOpenChange={setNoteOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>ملاحظة الفاتورة</DialogTitle></DialogHeader><textarea value={note} onChange={e=>setNote(e.target.value)} rows={5} className="w-full rounded-xl border p-3"/><DialogFooter><Button onClick={()=>setNoteOpen(false)}>حفظ الملاحظة</Button></DialogFooter></DialogContent></Dialog>
 <PosItemSearchDialog open={itemSearchOpen} products={productsForSale} initialQuery={itemSearchSeed} currencyCode={point?.currency_code} onClose={()=>{setItemSearchOpen(false);requestAnimationFrame(()=>searchRef.current?.focus())}} onSelect={(product,unit)=>{setItemSearchOpen(false);add({...product,unitId:unit.unitId,unitName:unit.unitName||product.unitName,price:unit.price,barcode:unit.barcode||product.barcode})}}/>
 <Dialog open={draftNoteOpen} onOpenChange={open=>{if(!open&&!draftSaving)setDraftNoteOpen(false)}}><DialogContent dir="rtl" className="max-w-md" onKeyDown={event=>{if(event.key==="F3"){event.preventDefault();void confirmDraftSave()}}}><DialogHeader><DialogTitle>ملاحظة المسودة</DialogTitle><DialogDescription>أدخل ملاحظة للمسودة قبل الحفظ. الملاحظة مطلوبة.</DialogDescription></DialogHeader><textarea autoFocus value={draftNote} onChange={event=>{setDraftNote(event.target.value);setDraftNoteError("")}} rows={5} placeholder="اكتب ملاحظة المسودة..." className="w-full rounded-xl border p-3"/>{draftNoteError&&<p className="text-sm text-rose-600">{draftNoteError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setDraftNoteOpen(false)} disabled={draftSaving}><X className="ml-2 h-4 w-4"/>خروج</Button><Button onClick={()=>void confirmDraftSave()} disabled={draftSaving}>{draftSaving?"جاري الحفظ...":"موافق"}<kbd className="mr-2 rounded bg-white/20 px-1.5 text-xs">F3</kbd></Button></DialogFooter></DialogContent></Dialog>
 <Dialog open={returnChoiceOpen} onOpenChange={setReturnChoiceOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>هل تريد عمل مردود من فاتورة؟</DialogTitle><DialogDescription>اختر نعم لربط المردود بفاتورة مبيعات سابقة، أو لا لإضافة الأصناف يدوياً.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={startManualReturn}>لا</Button><Button onClick={startInvoiceReturn}>نعم</Button></DialogFooter></DialogContent></Dialog>
 <PosReturnFromInvoiceDialog open={returnSourceOpen} onOpenChange={open=>{setReturnSourceOpen(open);if(!open){setReturnSourceInvoice(null);setReturnSourceError("")}}} invoices={returnSourceInvoices} query={returnSourceQuery} onQueryChange={setReturnSourceQuery} onSearch={()=>void loadReturnSourceInvoices()} loadingInvoices={returnSourceLoading} error={returnSourceError} selectedInvoice={returnSourceInvoice} loadingItems={returnSourceLoadingItems} onSelectInvoice={invoice=>void selectReturnSourceInvoice(invoice)} onBack={()=>{setReturnSourceInvoice(null);setReturnSourceError("")}} onAddItems={addSelectedReturnItems} currencyCode={point?.currency_code||""}/>
 <PosInvoiceHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} rows={historyRows} query={historyQuery} onQueryChange={setHistoryQuery} scope={historyScope} onScopeChange={scope=>{setHistoryScope(scope);void loadHistory(historyQuery,scope)}} onSearch={()=>void loadHistory(historyQuery,historyScope)} onSelect={row=>void selectHistoryInvoice(row)} loading={historyLoading} error={historyError} currencyCode={point?.currency_code||""} hasShift={!!session?.id}/>
 <Dialog open={draftOpen} onOpenChange={setDraftOpen}><DialogContent dir="rtl" className="flex max-h-[88dvh] w-[min(94vw,680px)] max-w-none flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 border-b bg-amber-50 px-5 py-4 text-right"><DialogTitle className="flex items-center gap-2 text-base"><FolderOpen className="h-5 w-5 text-amber-700"/>بحث المسودات</DialogTitle><DialogDescription>اختر مسودة لاستكمالها في الكاشير. المسودة لا تنشئ فاتورة حتى تضغط الدفع والحفظ.</DialogDescription></DialogHeader><div className="shrink-0 border-b bg-white p-3"><Input value={draftQuery} onChange={event=>setDraftQuery(event.target.value)} placeholder="ابحث برقم المسودة أو العميل أو الملاحظة..." /></div>{draftError&&<p className="mx-4 mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{draftError}</p>}<div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">{draftLoading?<p className="py-12 text-center text-sm text-slate-500">جاري تحميل المسودات...</p>:visibleDraftRows.length?visibleDraftRows.map(draft=><button key={draft.id} type="button" onClick={()=>openDraft(draft)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border bg-white p-3 text-right transition hover:border-amber-400 hover:bg-amber-50"><div className="min-w-0"><strong>{draft.draft_code}</strong><p className="mt-1 text-xs text-slate-500">{draft.customer_name||"عميل نقدي"} · {Array.isArray(draft.items)?draft.items.length:0} أصناف</p><p className="mt-1 truncate text-sm text-slate-700">{draft.note||"بدون ملاحظة"}</p></div><span className="shrink-0 text-xs text-slate-500">{String(draft.updated_at||draft.created_at||"").slice(0,16).replace("T"," ")}</span></button>):<p className="py-12 text-center text-sm text-slate-500">لا توجد مسودات مطابقة</p>}</div></DialogContent></Dialog>
 <Dialog open={Boolean(receipt)} onOpenChange={o=>!o&&setReceipt(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{receipt?.mode==="return"?"تم حفظ المردود":receipt?.mode==="gift"?"تم إصدار سند الهدية":"تمت عملية البيع"}</DialogTitle><DialogDescription>{receipt?.pending?"نسخة محلية بانتظار المزامنة":receipt?.mode==="gift"?"تم إخراج الهدية من المخزون":"تم ترحيل الحركة والمخزون والمدفوعات"}</DialogDescription></DialogHeader><div className="rounded-2xl bg-slate-950 p-5 text-center text-white"><small className="text-slate-400">رقم الحركة</small><p className="text-xl font-black text-emerald-300">{receipt?.code}</p><p className="mt-4 text-3xl font-black">{receipt?.total.toFixed(2)} {point?.currency_code}</p></div><DialogFooter><Button variant="outline" onClick={()=>setReceipt(null)}>عملية جديدة</Button><Button onClick={print}><Printer className="ml-2 h-4 w-4"/>طباعة</Button></DialogFooter></DialogContent></Dialog>
 </div>
}

function Field({label,children}:any){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
