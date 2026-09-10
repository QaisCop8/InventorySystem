import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { POST as createSalesVoucher } from "@/app/api/sales-vouchers/route"
import { ensureTables, generateSalesVoucherCode, SALES_INVOICE_VCH_TYPE, RETURN_SELL_VCH_TYPE } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, getOpenPosSession, getPosPoint, requestBranchId, requestUserId } from "../_lib"

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
      const isReturn=data.pos_mode==="return"
      if(isReturn&&!point.allow_returns)return NextResponse.json({error:"المردودات غير مفعلة لهذه النقطة"},{status:400})
      const payments=(Array.isArray(data.pos_payments)?data.pos_payments:[]).map((payment:any)=>{
        const method=String(payment.payment_method||payment.method||"cash")
        const configured:Record<string,number|null>={cash:Number(point.cash_account_id)||null,card:Number(point.card_account_id)||null,cheque:Number(point.cheque_account_id)||null,account:Number(data.account_id||point.receivable_account_id)||null,gift_card:Number(point.gift_account_id)||null}
        return {...payment,payment_method:method,account_id:configured[method]||null}
      })
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
          ...data,vch_type:vchType,vch_code:vchCode,vch_book_id:vchBookId,branch_id:Number(point.branch_id),
          currency_id:Number(point.currency_id),to_store_id:Number(point.main_warehouse_id),cash_account_id:Number(point.cash_account_id),
          tax_account_id:Number(point.tax_account_id)||null,vat_percent:Number(point.tax_percent||0),pos_payments:payments,
          items:data.items.map((item:any)=>({...item,warehouse_id:Number(point.main_warehouse_id),store_id:Number(point.main_warehouse_id)})),
        }),
      })
      const response=await createSalesVoucher(forwarded)
      if(!response.ok)return response
      const saved=await response.clone().json()
      await sql`UPDATE pos_sale_payments_tbl SET pos_point_id=${pointId},session_id=${Number(session.id)} WHERE voucher_id=${Number(saved.id)}`
      for(const payment of payments.filter((p:any)=>p.payment_method==="cheque")){
        await sql`
          INSERT INTO cheques_tbl (
            voucher_id,cheq_type,bank_account,cheq_num,branch_id,amount,currency_id,rate,
            received_date,trans_date,due_date,cheq_owner_name,customer_id,rec_cheq_account_id,
            current_account_id,status_id,manual_insert,is_printed,order_no
          ) VALUES (
            ${Number(saved.id)},${isReturn?2:1},'',${String(payment.reference||"").trim()},${Number(point.branch_id)},${Number(payment.amount)},
            ${Number(point.currency_id)},${Number(data.rate||1)},${data.vch_date||new Date().toISOString().slice(0,10)},
            ${data.vch_date||new Date().toISOString().slice(0,10)},${payment.due_date||data.vch_date||null},
            ${String(data.customer_name||"")},${Number(data.account_id)||null},${Number(point.cheque_account_id)},
            ${Number(point.cheque_account_id)},1,1,0,1
          )
        `
      }
      const cashAmount=payments.filter((p:any)=>p.payment_method==="cash").reduce((sum:number,p:any)=>sum+Number(p.amount||0),0)
      if(cashAmount>0){const delta=isReturn?-cashAmount:cashAmount;await sql`UPDATE pos_sessions_tbl SET expected_cash=expected_cash+${delta},updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,reference,note,user_id) VALUES(${Number(session.id)},${isReturn?"refund":"sale"},${cashAmount},${String(saved.vch_code||"")},${isReturn?"مردود نقدي":"بيع نقدي"},${userId})`}
      for(const payment of payments.filter((p:any)=>p.payment_method==="gift_card"))await sql`UPDATE pos_gift_cards_tbl SET balance=balance-${Number(payment.amount)},updated_at=NOW() WHERE code=${String(payment.reference||"").trim()}`
      return response
    })
  } catch (error) {
    console.error("Error creating POS sale:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "فشل حفظ عملية البيع" }, { status: 500 })
  }
}
