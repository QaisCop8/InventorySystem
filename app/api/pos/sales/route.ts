import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { POST as createSalesVoucher } from "@/app/api/sales-vouchers/route"
import { POST as createStockVoucher } from "@/app/api/stock-vouchers/route"
import { regenerateVoucherCode, STOCK_OUT_VCH_TYPE } from "@/app/api/stock-vouchers/_lib"
import { ensureTables, generateSalesVoucherCode, SALES_INVOICE_VCH_TYPE, RETURN_SELL_VCH_TYPE } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, getOpenPosSession, getPosPoint, requestBranchId, requestUserId } from "../_lib"
import { getPosCurrencies } from "@/lib/pos-currencies"
import { needsPosReceipt } from "@/lib/pos-receipt"
import { validatePosAccounts } from "@/lib/pos-account-validation"
import { createPosReceipt } from "../_receipts"

const localDate = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const clientSaleId = String(data?.pos_client_sale_id || "").trim()
    if (!clientSaleId) return NextResponse.json({ error: "رقم عملية نقطة البيع مطلوب" }, { status: 400 })
    if (!Array.isArray(data?.items) || data.items.length === 0) {
      return NextResponse.json({ error: "السلة فارغة" }, { status: 400 })
    }

    return await withTenantTransaction(async () => {
      await ensureTables(); await ensurePosTables()
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-sale:${clientSaleId}`}))`

      const existing = await sql`SELECT * FROM voucher_header_tbl WHERE pos_client_sale_id = ${clientSaleId} LIMIT 1`
      if (existing[0]) return NextResponse.json({ ...existing[0], duplicate: true })

      const userId=requestUserId(request), pointId=Number(data.pos_point_id||0)
      if(!userId||!pointId)return NextResponse.json({error:"نقطة البيع والمستخدم مطلوبان"},{status:400})
      const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة لهذا المستخدم أو الفرع"},{status:403})
      const session=await getOpenPosSession(pointId,userId);if(!session)return NextResponse.json({error:"يجب فتح أو استلام عهدة قبل البيع"},{status:400})
      if(Number(data.pos_session_id)!==Number(session.id))return NextResponse.json({error:"جلسة العهدة تغيرت؛ حدّث الشاشة وحاول مرة أخرى"},{status:409})
      const discountLimit=Math.min(100,Math.max(0,Number(point.max_discount_percent??100)))
      for(const item of data.items){
        const gross=Number(item.price??item.unit_price)*Number(item.quantity??item.qnty)
        const discount=Number(item.discount_percent??item.discount??0)
        if(!Number.isFinite(gross)||gross<0||!Number.isFinite(discount)||discount<0||discount>100||discount>discountLimit||gross*discount/100>gross+0.009){
          return NextResponse.json({error:`خصم الصنف ${String(item.product_name||item.item_name||"")} يجب ألا يتجاوز قيمته أو ${discountLimit}%`},{status:400})
        }
      }
      if(!["sale","return","gift"].includes(String(data.pos_mode)))return NextResponse.json({error:"نوع حركة نقطة البيع غير صالح"},{status:400})
      const isReturn=data.pos_mode==="return"
      const isGift=data.pos_mode==="gift"
      const availableCurrencies=await getPosCurrencies(Number(point.currency_id))
      const pointRate=Number(availableCurrencies.find(row=>row.currency_id===Number(point.currency_id))?.exchange_rate)||1
      if(isReturn&&!point.allow_returns)return NextResponse.json({error:"المردودات غير مفعلة لهذه النقطة"},{status:400})
      if(isGift){
        if(!point.allow_gifts)return NextResponse.json({error:"الهدايا غير مفعلة لهذه النقطة"},{status:400})
        if((data.pos_payments||[]).some((payment:any)=>Number(payment.amount)>0))return NextResponse.json({error:"الهدية لا تتطلب تفاصيل دفع"},{status:400})
        const bookId=Number(point.sales_book_id)
        const code=await regenerateVoucherCode(request.url,STOCK_OUT_VCH_TYPE,bookId)
        if(!code)return NextResponse.json({error:"تعذر توليد رقم سند إخراج الهدية"},{status:400})
        const forwarded=new NextRequest(new URL("/api/stock-vouchers",request.url),{
          method:"POST",headers:request.headers,body:JSON.stringify({
            vch_type:STOCK_OUT_VCH_TYPE,vch_code:code,vch_book_id:bookId,
            vch_date:data.vch_date,manual_date:data.manual_date,branch_id:Number(point.branch_id),
            currency_id:Number(point.currency_id),rate:pointRate,
            to_store_id:Number(point.main_warehouse_id),account_id:data.account_id||null,
            customer_name:data.customer_name||"",note:data.note||"هدية من نقطة البيع",
            status:2,insert_user:userId,
            items:data.items.map((item:any)=>({...item,product_id:Number(item.product_id||item.item_id),store_id:Number(point.main_warehouse_id),warehouse_id:Number(point.main_warehouse_id),total_price:0,line_amount:0})),
          }),
        })
        const response=await createStockVoucher(forwarded)
        if(!response.ok)return response
        const saved=await response.clone().json()
        await sql`UPDATE voucher_header_tbl SET pos_client_sale_id=${clientSaleId},pos_point_id=${pointId},pos_session_id=${Number(session.id)},shift_guid=${String(session.shift_guid)}::uuid WHERE id=${Number(saved.id)}`
        return response
      }
      let payments=(Array.isArray(data.pos_payments)?data.pos_payments:[]).map((payment:any)=>{
        const method=String(payment.payment_method||payment.method||"cash")
        const configured:Record<string,number|null>={cash:Number(point.cash_account_id)||null,card:Number(point.card_account_id)||null,cheque:Number(point.cheque_account_id)||null,account:null,gift_card:Number(point.gift_account_id)||null}
        return {...payment,payment_method:method,account_id:configured[method]||null}
      })
      const customerRequired = payments.some((payment:any)=>Number(payment.currency_amount??payment.amount)>0&&payment.payment_method==="account")
      if(customerRequired || Number(data.pos_customer_id)>0){
        const customerId=Number(data.pos_customer_id)
        const customer=customerId?(await sql`SELECT id,name FROM account_tbl WHERE id=${customerId} AND COALESCE(status,1)<>3 AND type IN (2,3,5)`)[0]:null
        if(!customer)return NextResponse.json({error:"اختر العميل في تفاصيل الدفع بدلاً من العميل النقدي"},{status:400})
        data.account_id=Number(customer.id);data.customer_name=String(customer.name)
        for(const payment of payments)if(payment.payment_method==="account")payment.account_id=Number(customer.id)
      }else{
        data.account_id=null;data.customer_name="عميل نقدي"
      }
      if(Array.isArray(data.cash_currency_amounts)){
        const currencies=availableCurrencies,seen=new Set<number>()
        const cashPayments=[] as any[]
        for(const entry of data.cash_currency_amounts){
          const currencyId=Number(entry.currency_id),currency=currencies.find(row=>row.currency_id===currencyId),original=Number(entry.amount)
          if(!currency||seen.has(currencyId)||!Number.isFinite(original)||original<0||Math.abs(Math.round(original*100)-original*100)>0.000001)
            return NextResponse.json({error:"تفاصيل النقد حسب العملة غير صالحة"},{status:400})
          seen.add(currencyId)
          if(original>0)cashPayments.push({payment_method:"cash",account_id:Number(point.cash_account_id),amount:Math.round(original*currency.rate_to_point*100)/100,currency_id:currencyId,currency_amount:original,exchange_rate:currency.rate_to_point,reference:""})
        }
        payments=[...payments.filter((payment:any)=>payment.payment_method!=="cash"),...cashPayments]
      }
      for(const payment of payments){
        if(payment.payment_method==="cash"&&payment.currency_id)continue
        const currencyId=Number(payment.currency_id||point.currency_id),currency=availableCurrencies.find(row=>row.currency_id===currencyId)
        const original=Number(payment.currency_amount??payment.amount)
        if(!currency||!Number.isFinite(original)||original<0||Math.abs(Math.round(original*100)-original*100)>0.000001)
          return NextResponse.json({error:"عملة أو مبلغ الدفع غير صالح"},{status:400})
        if(payment.payment_method==="gift_card"&&currencyId!==Number(point.currency_id))
          return NextResponse.json({error:"بطاقة الهدية يجب أن تكون بعملة نقطة البيع"},{status:400})
        payment.currency_id=currencyId;payment.currency_amount=original;payment.exchange_rate=currency.rate_to_point
        payment.amount=Math.round(original*currency.rate_to_point*100)/100
      }
      const accountIssue=validatePosAccounts(point,payments,{mode:String(data.pos_mode),taxAmount:Number(point.tax_percent),returnAccountIds:data.items.map((item:any)=>item.account_id),customerAccountId:data.account_id})
      if(accountIssue)return NextResponse.json({error:accountIssue},{status:400})
      for(const payment of payments.filter((row:any)=>Number(row.amount)>0)){
        if(payment.payment_method==="account"){
          const customerId=Number(data.pos_customer_id)
          if(!customerId||customerId!==Number(data.account_id)||!(await sql`SELECT id FROM account_tbl WHERE id=${customerId} AND COALESCE(status,1)<>3 AND type IN (2,3,5)`)[0])
            return NextResponse.json({error:"اختر عميلاً صالحاً لتفاصيل الدفع"},{status:400})
        }
        if(payment.payment_method==="cheque"){
          if(!String(payment.cheque_account||"").trim()||!String(payment.reference||"").trim())
            return NextResponse.json({error:"رقم الحساب ورقم الشيك مطلوبان"},{status:400})
          if(String(payment.cheque_account).trim().length>20||String(payment.reference).trim().length>20)
            return NextResponse.json({error:"رقم الحساب ورقم الشيك يجب ألا يتجاوزا 20 حرفاً"},{status:400})
          const due=String(payment.due_date||"")
          if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||due<new Date().toISOString().slice(0,10))
            return NextResponse.json({error:"تاريخ استحقاق الشيك غير صالح"},{status:400})
          const bankId=Number(payment.bank_id),branchId=Number(payment.branch_id)
          const validBank=bankId>0&&(await sql`SELECT id FROM banks WHERE id=${bankId} AND COALESCE(status,1)=1`)[0]
          const validBranch=branchId>0&&(await sql`SELECT id FROM branches WHERE id=${branchId} AND bank_id=${bankId} AND COALESCE(status,1)=1`)[0]
          if(!validBank||!validBranch)return NextResponse.json({error:"اختر بنكاً وفرعاً صالحين للشيك"},{status:400})
        }
        if(payment.payment_method==="card"){
          const digits=String(payment.reference||"").replace(/[\s-]/g,"")
          const cardTypeId=Number(payment.card_type_id),expiry=String(payment.card_expiry||"")
          if(!/^\d{12,19}$/.test(digits)||!cardTypeId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(expiry)||expiry<new Date().toISOString().slice(0,7))
            return NextResponse.json({error:"بيانات البطاقة أو تاريخ انتهائها غير صالحة"},{status:400})
          if(!(await sql`SELECT id FROM credit_cards_types_tbl WHERE id=${cardTypeId} AND currency_id=${Number(point.currency_id)} AND COALESCE(status,1)=1`)[0])
            return NextResponse.json({error:"نوع البطاقة غير متاح"},{status:400})
          payment.reference=`****${digits.slice(-4)}`
        }
        if(payment.payment_method==="account"&&!Number(data.pos_customer_id))return NextResponse.json({error:"اختر العميل للدفع على الحساب"},{status:400})
        if(payment.payment_method==="gift_card"&&!String(payment.reference||"").trim())return NextResponse.json({error:"رقم بطاقة الهدية مطلوب"},{status:400})
      }
      if(payments.some((payment:any)=>!Number.isFinite(Number(payment.amount))||Number(payment.amount)<0))return NextResponse.json({error:"مبلغ الدفع غير صالح"},{status:400})
      payments=payments.filter((payment:any)=>Number(payment.amount)>0)
      if(isReturn&&payments.some((payment:any)=>Number(payment.amount)>0&&!['cash','account'].includes(payment.payment_method)))return NextResponse.json({error:"المردودات متاحة نقداً أو على الذمة فقط"},{status:400})
      for(const payment of payments){if(!payment.account_id)return NextResponse.json({error:`لم يتم تعيين حساب لطريقة الدفع ${payment.payment_method}`},{status:400});if(payment.payment_method==="gift_card"){
        const gift=(await sql`SELECT * FROM pos_gift_cards_tbl WHERE code=${String(payment.reference||"").trim()} AND status=1 FOR UPDATE`)[0];if(!gift||Number(gift.currency_id)!==Number(point.currency_id)||Number(gift.balance)+.009<Number(payment.amount))return NextResponse.json({error:"بطاقة الهدية غير صالحة أو رصيدها غير كافٍ"},{status:400})
      }}
      const vchType=isReturn?RETURN_SELL_VCH_TYPE:SALES_INVOICE_VCH_TYPE
      const vchBookId = Number(isReturn?(point.return_book_id||point.sales_book_id):point.sales_book_id) || null
      if (!vchBookId) return NextResponse.json({ error: "يجب تعيين دفتر افتراضي لفاتورة المبيعات" }, { status: 400 })
      const vchCode = await generateSalesVoucherCode(request.url, vchType, vchBookId)
      if (!vchCode) return NextResponse.json({ error: "تعذر توليد رقم فاتورة المبيعات" }, { status: 400 })

      const forwarded = new NextRequest(new URL("/api/sales-vouchers", request.url), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          ...data,vch_type:vchType,vch_code:vchCode,vch_book_id:vchBookId,branch_id:Number(point.branch_id),rate:pointRate,
          currency_id:Number(point.currency_id),to_store_id:Number(point.main_warehouse_id),cash_account_id:Number(point.cash_account_id),
          tax_account_id:Number(point.tax_account_id)||null,vat_percent:Number(point.tax_percent||0),pos_payments:payments,
          items:data.items.map((item:any)=>({...item,account_id:isReturn?(point.return_account_id||item.account_id):item.account_id,warehouse_id:Number(point.main_warehouse_id),store_id:Number(point.main_warehouse_id)})),
        }),
      })
      const response=await createSalesVoucher(forwarded)
      if(!response.ok){const failure=await response.json();throw Object.assign(new Error(String(failure.error||"تعذر حفظ الفاتورة")),{status:response.status})}
      const saved=await response.clone().json()
      const receipt=!isReturn&&needsPosReceipt(payments)?await createPosReceipt(request,saved,point,userId,payments):null
      await sql`UPDATE pos_sale_payments_tbl SET pos_point_id=${pointId},session_id=${Number(session.id)} WHERE voucher_id=${Number(saved.id)}`
      await sql`UPDATE voucher_header_tbl SET pos_session_id=${Number(session.id)},shift_guid=${String(session.shift_guid)}::uuid WHERE id=${Number(saved.id)}`
      await sql`INSERT INTO pos_cashier_log_tbl(pos_point_id,session_id,user_id,movement_type,transaction_no,notes) VALUES(${pointId},${Number(session.id)},${Number(userId)},${String(data.cashier_action || (data.pos_mode === "return" ? "حفظ فاتورة" : "حفظ فاتورة"))},${String(saved.vch_code || "")},${String(data.note || "")})`
      for(const payment of payments.filter((p:any)=>p.payment_method==="cheque")){
        if(receipt){
          await sql`UPDATE cheques_tbl SET amount=${Number(payment.currency_amount??payment.amount)},currency_id=${Number(payment.currency_id||point.currency_id)},rate=${Number(availableCurrencies.find(row=>row.currency_id===Number(payment.currency_id||point.currency_id))?.exchange_rate??1)}
            WHERE voucher_id=${Number(receipt.id)} AND cheq_num=${String(payment.reference||"").trim()} AND bank_account=${String(payment.cheque_account||"").trim()}`
          continue
        }
        await sql`
          INSERT INTO cheques_tbl (
            voucher_id,cheq_type,bank_account,cheq_num,bank_id,branch_id,amount,currency_id,rate,
            received_date,trans_date,due_date,cheq_owner_name,customer_id,rec_cheq_account_id,
            current_account_id,status_id,manual_insert,is_printed,order_no
          ) VALUES (
            ${Number(saved.id)},${isReturn?2:1},${String(payment.cheque_account||"").trim()},${String(payment.reference||"").trim()},${Number(payment.bank_id)},${Number(payment.branch_id)},${Number(payment.currency_amount??payment.amount)},
            ${Number(payment.currency_id||point.currency_id)},${Number(availableCurrencies.find(row=>row.currency_id===Number(payment.currency_id||point.currency_id))?.exchange_rate??1)},${data.vch_date||localDate()},
            ${data.vch_date||localDate()},${payment.due_date||data.vch_date||null},
            ${String(data.customer_name||"")},${Number(data.account_id)||null},${Number(point.cheque_account_id)},
            ${Number(point.cheque_account_id)},1,1,0,1
          )
        `
      }
      const cashAmount=payments.filter((p:any)=>p.payment_method==="cash").reduce((sum:number,p:any)=>sum+Number(p.amount||0),0)
      if(cashAmount>0){const delta=isReturn?-cashAmount:cashAmount;await sql`UPDATE pos_sessions_tbl SET expected_cash=expected_cash+${delta},updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,reference,note,user_id) VALUES(${Number(session.id)},${isReturn?"refund":"sale"},${cashAmount},${String(saved.vch_code||"")},${isReturn?"مردود نقدي":"بيع نقدي"},${userId})`}
      for(const payment of payments.filter((p:any)=>p.payment_method==="cash"&&Number(p.amount)>0)){
        const currencyId=Number(payment.currency_id||point.currency_id),original=Number(payment.currency_amount??payment.amount),rate=Number(payment.exchange_rate||1),delta=isReturn?-original:original
        await sql`INSERT INTO pos_session_currencies_tbl(session_id,currency_id,opening_amount,expected_amount,rate_to_point)
          VALUES(${Number(session.id)},${currencyId},0,${delta},${rate})
          ON CONFLICT(session_id,currency_id) DO UPDATE SET expected_amount=pos_session_currencies_tbl.expected_amount+${delta}`
      }
      for(const payment of payments.filter((p:any)=>p.payment_method==="gift_card"))await sql`UPDATE pos_gift_cards_tbl SET balance=balance-${Number(payment.amount)},updated_at=NOW() WHERE code=${String(payment.reference||"").trim()}`
      return NextResponse.json({...saved,pos_receipt_voucher_id:receipt?Number(receipt.id):null,receipt_vch_code:receipt?.vch_code||null},{status:201})
    })
  } catch (error) {
    console.error("Error creating POS sale:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "فشل حفظ عملية البيع" }, { status: Number((error as {status?:number})?.status)||500 })
  }
}
