import { NextRequest,NextResponse } from "next/server"
import sql,{withTenantTransaction} from "@/lib/database"
import {ensureTables as ensureSalesTables} from "@/app/api/sales-vouchers/_lib"
import {ensurePosTables,getOpenPosSession,getPosPoint,requestBranchId,requestUserId} from "../_lib"
import {getPosCurrencies, type PosCurrency} from "@/lib/pos-currencies"

const amount=(value:unknown)=>Math.round(Number(value||0)*100)/100

function currencyAmounts(input:unknown, currencies:PosCurrency[], pointCurrencyId:number, fallback:number) {
  const entries=Array.isArray(input)?input:[{currency_id:pointCurrencyId,amount:fallback}]
  if(!entries.length) throw new Error("لا توجد عملات متاحة للعهدة")
  const seen=new Set<number>()
  return entries.map((entry:any)=>{
    const currencyId=Number(entry.currency_id),currency=currencies.find(row=>row.currency_id===currencyId)
    const value=Number(entry.amount)
    if(!currency||seen.has(currencyId)||!Number.isFinite(value)||value<0||Math.abs(Math.round(value*100)-value*100)>0.000001)
      throw new Error("تفاصيل مبالغ العهدة حسب العملة غير صالحة")
    seen.add(currencyId)
    return {...currency,amount:amount(value)}
  })
}

const evaluated=(rows:Array<{amount:number;rate_to_point:number}>)=>amount(rows.reduce((sum,row)=>sum+row.amount*row.rate_to_point,0))

async function sessionDetails(pointId:number,userId:string){
  const session=await getOpenPosSession(pointId,userId); if(!session)return null
  const [movements,payments,totals]=await Promise.all([
    sql`SELECT m.*,c.currency_code FROM pos_cash_movements_tbl m LEFT JOIN currency c ON c.id=m.currency_id WHERE m.session_id=${Number(session.id)} ORDER BY m.id DESC LIMIT 100`,
    sql`SELECT p.payment_method,COALESCE(SUM(CASE WHEN v.vch_type=16 THEN 0 ELSE p.amount END),0) sale_amount,COALESCE(SUM(CASE WHEN v.vch_type=16 THEN p.amount ELSE 0 END),0) refund_amount,COALESCE(SUM(CASE WHEN v.vch_type=16 THEN -p.amount ELSE p.amount END),0) amount,COUNT(*) count FROM pos_sale_payments_tbl p JOIN voucher_header_tbl v ON v.id=p.voucher_id WHERE p.session_id=${Number(session.id)} GROUP BY p.payment_method ORDER BY p.payment_method`,
    sql`SELECT movement_type,COALESCE(SUM(amount),0) amount,COUNT(*) count FROM pos_cash_movements_tbl WHERE session_id=${Number(session.id)} GROUP BY movement_type`,
  ])
  const currencies=await sql`SELECT sc.*,c.currency_code,c.currency_name FROM pos_session_currencies_tbl sc JOIN currency c ON c.id=sc.currency_id WHERE sc.session_id=${Number(session.id)} ORDER BY sc.currency_id`
  return {...session,movements,payments,movement_totals:totals,currencies}
}

export async function GET(request:NextRequest){try{await ensureSalesTables();await ensurePosTables();const pointId=Number(request.nextUrl.searchParams.get("point_id")||0),userId=requestUserId(request);if(!pointId||!userId)return NextResponse.json({error:"بيانات الجلسة غير مكتملة"},{status:400});const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة"},{status:403});const session=await sessionDetails(pointId,userId);const activeShift=(await sql`SELECT s.id,s.shift_guid,us.full_name user_name FROM pos_sessions_tbl s LEFT JOIN user_settings us ON us.user_id=s.user_id WHERE s.pos_point_id=${pointId} AND s.status='open' ORDER BY s.id DESC LIMIT 1`)[0]||null;const pending=await sql`SELECT s.*,p.name point_name,c.currency_name,c.currency_code,us.full_name from_user_name,
  COALESCE((SELECT json_agg(json_build_object('currency_id',sc.currency_id,'currency_code',cc.currency_code,'currency_name',cc.currency_name,'amount',sc.handover_amount,'rate_to_point',sc.rate_to_point) ORDER BY sc.currency_id)
    FROM pos_session_currencies_tbl sc JOIN currency cc ON cc.id=sc.currency_id WHERE sc.session_id=s.id),'[]'::json) currency_amounts
  FROM pos_sessions_tbl s JOIN pos_points_tbl p ON p.id=s.pos_point_id LEFT JOIN currency c ON c.id=p.currency_id LEFT JOIN user_settings us ON us.user_id=s.user_id WHERE s.pos_point_id=${pointId} AND s.status='handover_pending' AND (s.handover_to_user_id IS NULL OR s.handover_to_user_id=${userId}) ORDER BY s.id DESC`;return NextResponse.json({session,pending,active_shift:activeShift,currencies:await getPosCurrencies(Number(point.currency_id))})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل العهدة"},{status:500})}}

export async function POST(request:NextRequest){
  try{await ensureSalesTables();await ensurePosTables();const data=await request.json(),action=String(data.action||""),pointId=Number(data.point_id||0),userId=requestUserId(request);if(!pointId||!userId)return NextResponse.json({error:"بيانات نقطة البيع غير مكتملة"},{status:400});const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة"},{status:403})
    const shiftGuid=String(data.shift_guid||"").trim()
    if(shiftGuid&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shiftGuid))return NextResponse.json({error:"رقم الوردية GUID غير صالح"},{status:400})
    return await withTenantTransaction(async()=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-session:${pointId}`}))`
      let session=await getOpenPosSession(pointId,userId)
      if(action==="open"){
        if(session)return NextResponse.json({error:"لديك عهدة مفتوحة على نقطة البيع"},{status:400});const otherOpen=(await sql`SELECT id FROM pos_sessions_tbl WHERE pos_point_id=${pointId} AND status='open' LIMIT 1`)[0];if(otherOpen)return NextResponse.json({error:"توجد وردية مفتوحة بالفعل على نقطة البيع. يجب إغلاقها أو تسليم عهدتها قبل فتح وردية جديدة"},{status:409});const entered=currencyAmounts(data.currency_amounts,await getPosCurrencies(Number(point.currency_id)),Number(point.currency_id),amount(data.amount));const opening=evaluated(entered);const rows=await sql`INSERT INTO pos_sessions_tbl(pos_point_id,user_id,shift_guid,opening_cash,expected_cash,notes) VALUES(${pointId},${userId},COALESCE(${shiftGuid||null}::uuid,gen_random_uuid()),${opening},${opening},${String(data.note||"")}) RETURNING *`;session=rows[0];for(const item of entered)await sql`INSERT INTO pos_session_currencies_tbl(session_id,currency_id,opening_amount,expected_amount,rate_to_point) VALUES(${Number(session.id)},${item.currency_id},${item.amount},${item.amount},${item.rate_to_point})`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'opening',${opening},${String(data.note||"")},${userId})`
      } else if(action==="receive"){
        if(session)return NextResponse.json({error:"أغلق العهدة الحالية قبل استلام عهدة أخرى"},{status:400});const otherOpen=(await sql`SELECT id FROM pos_sessions_tbl WHERE pos_point_id=${pointId} AND status='open' LIMIT 1`)[0];if(otherOpen)return NextResponse.json({error:"توجد وردية مفتوحة بالفعل على نقطة البيع. يجب إغلاقها أو تسليم عهدتها أولاً"},{status:409});const sourceId=Number(data.source_session_id||0);const source=(await sql`SELECT * FROM pos_sessions_tbl WHERE id=${sourceId} AND pos_point_id=${pointId} AND status='handover_pending' AND (handover_to_user_id IS NULL OR handover_to_user_id=${userId}) FOR UPDATE`)[0];if(!source)return NextResponse.json({error:"العهدة المطلوب استلامها غير متاحة"},{status:400});const received=amount(source.handover_amount);const rows=await sql`INSERT INTO pos_sessions_tbl(pos_point_id,user_id,shift_guid,opening_cash,expected_cash,received_from_session_id,notes) VALUES(${pointId},${userId},COALESCE(${shiftGuid||null}::uuid,gen_random_uuid()),${received},${received},${sourceId},${String(data.note||"")}) RETURNING *`;session=rows[0];await sql`INSERT INTO pos_session_currencies_tbl(session_id,currency_id,opening_amount,expected_amount,rate_to_point)
          SELECT ${Number(session.id)},currency_id,COALESCE(handover_amount,0),COALESCE(handover_amount,0),rate_to_point FROM pos_session_currencies_tbl WHERE session_id=${sourceId}`;await sql`UPDATE pos_sessions_tbl SET status='handed_over',closed_at=NOW(),updated_at=NOW() WHERE id=${sourceId}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,reference,note,user_id) VALUES(${Number(session.id)},'receive',${received},${String(sourceId)},${String(data.note||"")},${userId})`
      } else {
        if(!session)return NextResponse.json({error:"يجب فتح أو استلام عهدة أولاً"},{status:400});const value=amount(data.amount)
        if(!Number.isFinite(value)||value<0)return NextResponse.json({error:"مبلغ العهدة غير صالح"},{status:400})
        if(["cash_in","cash_out"].includes(action)){
          const currencies=await getPosCurrencies(Number(point.currency_id))
          const entered=currencyAmounts(data.currency_amounts,currencies,Number(point.currency_id),value).filter(row=>row.amount>0)
          if(!entered.length)return NextResponse.json({error:"أدخل مبلغاً أكبر من صفر"},{status:400})
          const current=await sql`SELECT currency_id,expected_amount,rate_to_point FROM pos_session_currencies_tbl WHERE session_id=${Number(session.id)}`
          const movements=entered.map(row=>{const balance=current.find((item:any)=>Number(item.currency_id)===row.currency_id);return {...row,rate_to_point:Number(balance?.rate_to_point||row.rate_to_point),available:Number(balance?.expected_amount||0)}})
          const total=evaluated(movements)
          if(action==="cash_out"&&movements.some(row=>row.amount>row.available+.009))return NextResponse.json({error:"مبلغ السحب أكبر من الرصيد المتاح لإحدى العملات"},{status:400})
          if(action==="cash_out"&&Number(session.expected_cash)-total<-.009)return NextResponse.json({error:"لا يمكن أن يصبح رصيد العهدة سالباً"},{status:400})
          await sql`UPDATE pos_sessions_tbl SET expected_cash=expected_cash+${action==="cash_in"?total:-total},updated_at=NOW() WHERE id=${Number(session.id)}`
          for(const row of movements){
            const delta=action==="cash_in"?row.amount:-row.amount
            await sql`INSERT INTO pos_session_currencies_tbl(session_id,currency_id,opening_amount,expected_amount,rate_to_point) VALUES(${Number(session.id)},${row.currency_id},0,${delta},${row.rate_to_point}) ON CONFLICT(session_id,currency_id) DO UPDATE SET expected_amount=pos_session_currencies_tbl.expected_amount+${delta}`
            await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,currency_id,currency_amount,reference,note,user_id) VALUES(${Number(session.id)},${action},${amount(row.amount*row.rate_to_point)},${row.currency_id},${row.amount},${String(data.reference||"")},${String(data.note||"")},${userId})`
          }
        } else if(action==="handover"){const current=await sql`SELECT currency_id,expected_amount,rate_to_point FROM pos_session_currencies_tbl WHERE session_id=${Number(session.id)}`;const entered=currencyAmounts(data.currency_amounts,await getPosCurrencies(Number(point.currency_id)),Number(point.currency_id),value||amount(session.expected_cash));const handover=evaluated(entered);if(handover<0||(current.length===0&&handover>Number(session.expected_cash)+.009))return NextResponse.json({error:"مبلغ التسليم أكبر من رصيد العهدة"},{status:400});for(const item of entered){const available=current.find((row:any)=>Number(row.currency_id)===item.currency_id);if(item.amount>Number(available?.expected_amount||0)+.009&&current.length)return NextResponse.json({error:`مبلغ ${item.currency_code} أكبر من الرصيد المتاح`},{status:400})}for(const item of entered){await sql`INSERT INTO pos_session_currencies_tbl(session_id,currency_id,opening_amount,expected_amount,handover_amount,rate_to_point) VALUES(${Number(session.id)},${item.currency_id},0,0,${item.amount},${item.rate_to_point}) ON CONFLICT(session_id,currency_id) DO UPDATE SET handover_amount=${item.amount}`};await sql`UPDATE pos_sessions_tbl SET status='handover_pending',handover_amount=${handover},counted_cash=${handover},handover_to_user_id=${String(data.to_user_id||"")||null},updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'handover',${handover},${String(data.note||"")},${userId})`;session=null
        } else if(action==="close"){
          const balances=await sql`SELECT expected_amount,rate_to_point FROM pos_session_currencies_tbl WHERE session_id=${Number(session.id)}`
          const counted=balances.length
            ? amount(balances.reduce((sum:number,row:any)=>sum+Number(row.expected_amount||0)*Number(row.rate_to_point||1),0))
            : amount(session.expected_cash)
          await sql`UPDATE pos_sessions_tbl SET status='closed',counted_cash=${counted},closed_at=NOW(),updated_at=NOW() WHERE id=${Number(session.id)}`
          await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'close',${counted},${String(data.note||"")},${userId})`
          session=null
        } else return NextResponse.json({error:"عملية العهدة غير معروفة"},{status:400})
      }
      return NextResponse.json({success:true,session:session?await sessionDetails(pointId,userId):null})
    })
  }catch(error){console.error("POS session error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تنفيذ عملية العهدة"},{status:500})}
}
