import { logVoucherAudit } from "@/lib/audit-client"
import { invoiceQrDataUrl, qrReceiptHtml, type QrInvoice } from "@/lib/pos-invoice-qr"

// طباعة فاتورة نقطة البيع — مشتركة بين كاشير نقطة البيع وشاشة المطعم: خدمة الطباعة المحلية (CashService
// ws://localhost:32999) على الحاسوب، ومعاينة داخل الصفحة على الجوال، وفاتورة QR فقط حسب إعداد invoice_print_mode للنقطة.

export type PosReceiptLine = { name: string; code?: string; unitName?: string; quantity: number; price: number; discount: number; campaign_discount?: number; gift?: boolean }
export type PosReceiptPayment = { method: string; amount: number; reference?: string }
export type PosReceipt = {
  code: string; total: number; pending: boolean; lines: PosReceiptLine[]; mode: "sale" | "return" | "gift"; date: string
  customerName: string; customerPhone?: string; customerAddress?: string; note: string; subtotal: number; itemDiscount: number
  invoiceDiscount: number; tax: number; payments: PosReceiptPayment[]; refundAmount: number; currencyCode: string; pointName: string
}
export type PosReceiptContext = {
  point: any; receiptSettings: Record<string, string>; taxRate: number; cashierName: string
  onPreview: (preview: { title: string; html: string }) => void
  onMessage: (message: { type: "success" | "error"; text: string }) => void
}

export const paymentLabels: Record<string, string> = { cash: "نقدي", card: "بطاقة", cheque: "شيك", account: "على الحساب", gift_card: "بطاقة هدية" }

export const isMobilePrintDevice=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)
const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]||char))
export const receiptHtml=(receipt:PosReceipt,settings:Record<string,string>,cashierName:string,taxRate:number)=>{
 const money=(value:number)=>Number(value||0).toFixed(2)
 const items=receipt.lines.map((line,index)=>`<tr><td class="item"><span class="index">${index+1}</span><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.code)}${line.unitName?` · ${escapeHtml(line.unitName)}`:""}</small></td><td>${money(line.quantity)}</td><td>${money(line.price)}</td><td>${money(line.price*line.quantity*line.discount/100)}</td><td>${money(Number(line.campaign_discount||0))}</td><td class="amount">${money(line.price*line.quantity*(1-line.discount/100)-Number(line.campaign_discount||0))}</td></tr>`).join("")
 const payments=receipt.payments.filter(row=>row.amount>0).map(row=>`<div class="payment"><span>${escapeHtml(paymentLabels[row.method]||row.method)}${row.reference?` · ${escapeHtml(row.reference)}`:""}</span><b>${money(row.amount)} ${escapeHtml(receipt.currencyCode)}</b></div>`).join("")
 const logo=settings.company_logo?`<img class="logo" src="${escapeHtml(settings.company_logo)}" alt="">`:""
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf2f4;color:#172c37;font-family:"Segoe UI",Tahoma,Arial,sans-serif}.sheet{width:min(100%,760px);margin:auto;background:#fff;border:1px solid #dce5e9;border-radius:18px;overflow:hidden;box-shadow:0 16px 48px #18374718}.top{height:8px;background:linear-gradient(90deg,#10a889,#087f73,#174b5a)}.content{padding:30px}.brand{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid #e4ecef}.company{display:flex;align-items:center;gap:14px}.logo{max-width:88px;max-height:64px;object-fit:contain}.company h1{margin:0;font-size:20px}.company p,.meta small,.muted{margin:5px 0 0;color:#71838c;font-size:12px}.badge{padding:9px 13px;border-radius:999px;background:#e8f5f1;color:#087f73;font-size:12px;font-weight:700}.title{display:flex;align-items:end;justify-content:space-between;gap:20px;padding:22px 0}.title h2{margin:0;font-size:24px}.code{text-align:left}.code small{display:block;color:#71838c;font-size:11px}.code strong{font:700 18px Consolas,monospace;color:#087f73}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px}.meta>div{padding:12px;border:1px solid #e3eaed;border-radius:11px;background:#fafcfc}.meta b{display:block;margin-top:5px;font-size:13px}.table-wrap{overflow:auto;border:1px solid #dce5e9;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:680px}th{padding:11px 12px;background:#173b49;color:white;text-align:right;font-size:11px}td{padding:12px;border-bottom:1px solid #e7edef;font-size:12px}tbody tr:nth-child(even){background:#f7fafb}.item strong,.item small{display:block}.item small{margin-top:4px;color:#71838c;font-size:10px}.index{display:inline-grid;place-items:center;width:22px;height:22px;margin-left:7px;border-radius:7px;background:#e7f4f0;color:#087f73;font-size:10px;font-weight:700}.amount{font-weight:700;white-space:nowrap}.summary{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:22px;margin-top:22px}.notes{padding:14px;border-radius:12px;background:#f5f8f9;color:#52666f;font-size:12px;line-height:1.8}.totals{padding:16px;border:1px solid #dce5e9;border-radius:13px}.total-row,.payment{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:12px}.total-row.sub{color:#61747d}.total-row.final{margin-top:8px;padding-top:13px;border-top:1px solid #dce5e9;color:#087f73;font-size:18px;font-weight:800}.payments{margin-top:12px;padding-top:10px;border-top:1px dashed #d5e1e5}.payments h3{margin:0 0 5px;font-size:11px}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:24px;padding-top:14px;border-top:1px solid #e4ecef;color:#71838c;font-size:10px}.footer b{color:#087f73}@page{size:auto;margin:0}@media(max-width:600px){body{padding:0;background:white}.sheet{border:0;border-radius:0;box-shadow:none}.content{padding:18px}.meta{grid-template-columns:repeat(2,minmax(0,1fr))}.summary{grid-template-columns:1fr}.title h2{font-size:20px}}@media print{body{padding:0;background:#fff}.sheet{width:100%;border:0;border-radius:0;box-shadow:none}.content{padding:0}.top{height:5px}.footer{break-inside:avoid}}
</style></head><body><main class="sheet"><div class="top"></div><div class="content"><header class="brand"><div class="company">${logo}<div><h1>${escapeHtml(settings.company_name||receipt.pointName)}</h1><p>${escapeHtml(settings.company_address||"")}${settings.company_phone?` · ${escapeHtml(settings.company_phone)}`:""}</p>${settings.company_email?`<p>${escapeHtml(settings.company_email)}</p>`:""}</div></div><span class="badge">${receipt.pending?"نسخة غير متصلة":"فاتورة نقطة بيع"}</span></header><section class="title"><div><p class="muted">${escapeHtml(receipt.pointName)}</p><h2>${receipt.mode==="return"?"إشعار مردود مبيعات":receipt.mode==="gift"?"سند إخراج هدية":"فاتورة مبيعات"}</h2></div><div class="code"><small>رقم الفاتورة</small><strong>${escapeHtml(receipt.code)}</strong></div></section><section class="meta"><div><small>التاريخ والوقت</small><b>${escapeHtml(receipt.date)}</b></div><div><small>العميل</small><b>${escapeHtml(receipt.customerName||"عميل نقدي")}</b></div><div><small>الكاشير</small><b>${escapeHtml(cashierName||"—")}</b></div>${settings.tax_number?`<div><small>الرقم الضريبي</small><b>${escapeHtml(settings.tax_number)}</b></div>`:""}<div><small>العملة</small><b>${escapeHtml(receipt.currencyCode)}</b></div></section><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر شامل الضريبة</th><th>خصم</th><th>خصم حملة</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table></div><section class="summary"><div class="notes">${receipt.note?`<b>ملاحظات</b><br>${escapeHtml(receipt.note)}`:"شكراً لتسوقكم معنا"}<p class="muted">الأسعار تشمل ضريبة القيمة المضافة.</p></div><div class="totals"><div class="total-row sub"><span>مجموع الأصناف</span><b>${money(receipt.subtotal)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الأصناف</span><b>− ${money(receipt.itemDiscount)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الحملات</span><b>− ${money(receipt.lines.reduce((sum,line)=>sum+Number(line.campaign_discount||0),0))} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>خصم الفاتورة</span><b>− ${money(receipt.invoiceDiscount)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row sub"><span>الضريبة (ضمن السعر)</span><b>${money(receipt.tax)} ${escapeHtml(receipt.currencyCode)}</b></div><div class="total-row final"><span>${receipt.mode==="return"?"الصافي للاسترجاع":receipt.mode==="gift"?"إجمالي الهدية":"الصافي للدفع"}</span><b>${money(receipt.total)} ${escapeHtml(receipt.currencyCode)}</b></div>${payments?`<div class="payments"><h3>المدفوعات</h3>${payments}</div>`:""}${receipt.refundAmount>0?`<div class="total-row sub"><span>الباقي للعميل</span><b>${money(receipt.refundAmount)} ${escapeHtml(receipt.currencyCode)}</b></div>`:""}</div>
 </section><footer class="footer"><span>${escapeHtml(settings.company_name||receipt.pointName)}</span><b>${receipt.pending?"بانتظار المزامنة":"نسخة العميل"}</b></footer></div></main></body></html>`
}


export async function printPosReceipt(receiptData: PosReceipt, ctx: PosReceiptContext) {
  // طباعة الفواتير (إعداد نقطة البيع): 0 عدم الطباعة، 1 فاتورة كاملة، 2 فاتورة QR فقط
  const invoicePrintMode=ctx.point?.invoice_print_mode!=null?Number(ctx.point.invoice_print_mode):ctx.point?.print_invoices?1:0
  if(invoicePrintMode===0)return
  if(!receiptData.pending)logVoucherAudit({action:"print_original",vch_type:receiptData.mode==="return"?16:receiptData.mode==="gift"?9:12,vch_code:receiptData.code,channel:"pos"})
  const qrOnly=invoicePrintMode===2
  const qrInvoice:QrInvoice|null=qrOnly?{title:receiptData.mode==="return"?"إشعار مردود مبيعات":receiptData.mode==="gift"?"سند إخراج هدية":"فاتورة مبيعات",code:receiptData.code,date:receiptData.date,companyName:ctx.receiptSettings.company_name||receiptData.pointName,companyLogo:ctx.receiptSettings.company_logo||"",companyInfo:[ctx.receiptSettings.company_address,ctx.receiptSettings.company_phone].filter(Boolean).join(" | "),taxNumber:ctx.receiptSettings.tax_number,customerName:receiptData.customerName,customerPhone:receiptData.customerPhone,cashierName:ctx.cashierName,currencyCode:receiptData.currencyCode,lines:receiptData.lines.map(line=>({name:line.name,quantity:line.quantity,price:line.price,discount:line.discount,campaign_discount:line.campaign_discount,gift:line.gift})),subtotal:receiptData.subtotal,itemDiscount:receiptData.itemDiscount,invoiceDiscount:receiptData.invoiceDiscount,tax:receiptData.tax,total:receiptData.total,payments:receiptData.payments.filter(payment=>payment.amount>0).map(payment=>({label:paymentLabels[payment.method]||payment.method,amount:payment.amount,reference:payment.reference})),change:receiptData.refundAmount,note:receiptData.note}:null
  const qr=qrInvoice?await invoiceQrDataUrl(qrInvoice).catch(()=>null):null
  if(qrOnly&&!qr){ctx.onMessage({type:"error",text:"تعذر إنشاء رمز QR للفاتورة"});return}
  // الجوال: معاينة الفاتورة داخل نفس الصفحة (طباعة / إغلاق) بدل فتح تبويب جديد
  if(isMobilePrintDevice()&&qrInvoice&&qr){
   ctx.onPreview({title:qrInvoice.title,html:qrReceiptHtml(qrInvoice,qr.dataUrl)})
   return
  }
  if(isMobilePrintDevice()){
   const thermalPrintStyles=`
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
   const html=receiptHtml(receiptData,ctx.receiptSettings,ctx.cashierName,ctx.taxRate).replace("</head>",`<style media="print">${thermalPrintStyles}</style></head>`)
   ctx.onPreview({title:receiptData.mode==="return"?"مردود مبيعات":receiptData.mode==="gift"?"سند إخراج هدية":"فاتورة بيع",html})
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
  const logo=ctx.receiptSettings.company_logo
  if(logo){commands.push({type:1,image:logo,x:left+(fullWidth-72)/2,y:y,width:72,height:72});y+=76}
  const companyName=ctx.receiptSettings.company_name||receiptData.pointName
  const companyNameWidth=Math.min(fullWidth,Math.max(80,companyName.length*14))
  text(companyName,left+(fullWidth-companyNameWidth)/2,y,companyNameWidth,22,14,1,1)
  y+=22
  const companyInfo=[ctx.receiptSettings.company_address,ctx.receiptSettings.company_phone].filter(Boolean).join(" | ")
  if(companyInfo){text(companyInfo,left,y,fullWidth,14,8,1);y+=16}
  if(ctx.receiptSettings.company_email){text(ctx.receiptSettings.company_email,left,y,fullWidth,13,7,1);y+=15}
  y=Math.max(y,logo?99:25)
  line(left,y,right,y,3);y+=5
  // فاتورة QR: الشعار وترويسة الشركة فقط ثم الرمز — نوع الفاتورة ورقمها والتاريخ والعميل والإجمالي كلها داخل الرمز
  const qrMode=Boolean(qrOnly&&qr)
  if(!qrMode){
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
  card("الكاشير",ctx.cashierName||"—",left,cardWidth)
  y+=35
  if(receiptData.customerPhone||ctx.receiptSettings.tax_number){
   if(receiptData.customerPhone){box(rightCardX,y,cardWidth,28,3);text("الهاتف",rightCardX+3,y+2,cardWidth-6,9,6,1,0,3);text(receiptData.customerPhone,rightCardX+3,y+12,cardWidth-6,13,7,1,1)}
   if(ctx.receiptSettings.tax_number){box(left,y,cardWidth,28,3);text("الرقم الضريبي",left+3,y+2,cardWidth-6,9,6,1,0,3);text(ctx.receiptSettings.tax_number,left+3,y+12,cardWidth-6,13,7,1,1)}
   y+=32
  }
  }

  if(qrMode&&qr){
   y+=4
   const qrSize=230;commands.push({type:1,image:qr.dataUrl,x:left+Math.round((fullWidth-qrSize)/2),y,width:qrSize,height:qrSize});y+=qrSize+4
   text("امسح الرمز لعرض تفاصيل الفاتورة كاملة",left,y,fullWidth,14,7,1,0,3);y+=18
   text("شكراً لتسوقكم معنا",left,y,fullWidth,16,8,1,1);y+=19
  }else{
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
   [`ضريبة (${money(ctx.taxRate)}%)`,`${money(receiptData.tax)} ${receiptData.currencyCode}`],
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
  const footer=[ctx.receiptSettings.company_address,ctx.receiptSettings.company_phone,ctx.receiptSettings.company_email].filter(Boolean).join(" | ")
  if(footer){text(footer,left,y,fullWidth,18,6,1,0,3);y+=19}
  text("شكراً لتسوقكم معنا",left,y,fullWidth,16,8,1,1);y+=19
  }
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
   ctx.onMessage({type:"success",text:"تم إرسال الفاتورة إلى الطابعة الافتراضية"})
  }catch(error){
   ctx.onMessage({type:"error",text:error instanceof Error?error.message:"تعذرت طباعة الفاتورة. تأكد من تشغيل خدمة الطباعة"})
  }finally{
   socket.close()
  }
}
