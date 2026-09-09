import { NextRequest,NextResponse } from "next/server"
import sql,{withTenantTransaction} from "@/lib/database"
import {ensureTables as ensureSalesTables} from "@/app/api/sales-vouchers/_lib"
import {ensurePosTables,getOpenPosSession,getPosPoint,requestBranchId,requestUserId} from "../_lib"

const amount=(value:unknown)=>Math.round(Number(value||0)*100)/100

async function sessionDetails(pointId:number,userId:string){
  const session=await getOpenPosSession(pointId,userId); if(!session)return null
  const [movements,payments]=await Promise.all([
    sql`SELECT * FROM pos_cash_movements_tbl WHERE session_id=${Number(session.id)} ORDER BY id DESC LIMIT 100`,
    sql`SELECT payment_method,COALESCE(SUM(amount),0) amount,COUNT(*) count FROM pos_sale_payments_tbl WHERE session_id=${Number(session.id)} GROUP BY payment_method ORDER BY payment_method`,
  ])
  return {...session,movements,payments}
}

export async function GET(request:NextRequest){try{await ensureSalesTables();await ensurePosTables();const pointId=Number(request.nextUrl.searchParams.get("point_id")||0),userId=requestUserId(request);if(!pointId||!userId)return NextResponse.json({error:"بيانات الجلسة غير مكتملة"},{status:400});const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة"},{status:403});const session=await sessionDetails(pointId,userId);const pending=await sql`SELECT s.*,p.name point_name,us.full_name from_user_name FROM pos_sessions_tbl s JOIN pos_points_tbl p ON p.id=s.pos_point_id LEFT JOIN user_settings us ON us.user_id=s.user_id WHERE s.pos_point_id=${pointId} AND s.status='handover_pending' AND (s.handover_to_user_id IS NULL OR s.handover_to_user_id=${userId}) ORDER BY s.id DESC`;return NextResponse.json({session,pending})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل العهدة"},{status:500})}}

export async function POST(request:NextRequest){
  try{await ensureSalesTables();await ensurePosTables();const data=await request.json(),action=String(data.action||""),pointId=Number(data.point_id||0),userId=requestUserId(request);if(!pointId||!userId)return NextResponse.json({error:"بيانات نقطة البيع غير مكتملة"},{status:400});const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة"},{status:403})
    return await withTenantTransaction(async()=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-session:${pointId}:${userId}`}))`
      let session=await getOpenPosSession(pointId,userId)
      if(action==="open"){
        if(session)return NextResponse.json({error:"لديك عهدة مفتوحة على نقطة البيع"},{status:400});const opening=amount(data.amount);if(opening<0)return NextResponse.json({error:"رصيد بداية العهدة غير صالح"},{status:400});const rows=await sql`INSERT INTO pos_sessions_tbl(pos_point_id,user_id,opening_cash,expected_cash,notes) VALUES(${pointId},${userId},${opening},${opening},${String(data.note||"")}) RETURNING *`;session=rows[0];await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'opening',${opening},${String(data.note||"")},${userId})`
      } else if(action==="receive"){
        if(session)return NextResponse.json({error:"أغلق العهدة الحالية قبل استلام عهدة أخرى"},{status:400});const sourceId=Number(data.source_session_id||0);const source=(await sql`SELECT * FROM pos_sessions_tbl WHERE id=${sourceId} AND pos_point_id=${pointId} AND status='handover_pending' AND (handover_to_user_id IS NULL OR handover_to_user_id=${userId}) FOR UPDATE`)[0];if(!source)return NextResponse.json({error:"العهدة المطلوب استلامها غير متاحة"},{status:400});const received=amount(source.handover_amount);const rows=await sql`INSERT INTO pos_sessions_tbl(pos_point_id,user_id,opening_cash,expected_cash,received_from_session_id,notes) VALUES(${pointId},${userId},${received},${received},${sourceId},${String(data.note||"")}) RETURNING *`;session=rows[0];await sql`UPDATE pos_sessions_tbl SET status='handed_over',closed_at=NOW(),updated_at=NOW() WHERE id=${sourceId}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,reference,note,user_id) VALUES(${Number(session.id)},'receive',${received},${String(sourceId)},${String(data.note||"")},${userId})`
      } else {
        if(!session)return NextResponse.json({error:"يجب فتح أو استلام عهدة أولاً"},{status:400});const value=amount(data.amount)
        if(["cash_in","cash_out"].includes(action)){if(value<=0)return NextResponse.json({error:"أدخل مبلغاً أكبر من صفر"},{status:400});const delta=action==="cash_in"?value:-value;if(Number(session.expected_cash)+delta<0)return NextResponse.json({error:"لا يمكن أن يصبح رصيد العهدة سالباً"},{status:400});await sql`UPDATE pos_sessions_tbl SET expected_cash=expected_cash+${delta},updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,reference,note,user_id) VALUES(${Number(session.id)},${action},${value},${String(data.reference||"")},${String(data.note||"")},${userId})`
        } else if(action==="handover"){const handover=value||amount(session.expected_cash);if(handover<0||handover>Number(session.expected_cash)+.009)return NextResponse.json({error:"مبلغ التسليم أكبر من رصيد العهدة"},{status:400});await sql`UPDATE pos_sessions_tbl SET status='handover_pending',handover_amount=${handover},handover_to_user_id=${String(data.to_user_id||"")||null},updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'handover',${handover},${String(data.note||"")},${userId})`;session=null
        } else if(action==="close"){const counted=amount(data.amount);await sql`UPDATE pos_sessions_tbl SET status='closed',counted_cash=${counted},closed_at=NOW(),updated_at=NOW() WHERE id=${Number(session.id)}`;await sql`INSERT INTO pos_cash_movements_tbl(session_id,movement_type,amount,note,user_id) VALUES(${Number(session.id)},'close',${counted},${String(data.note||"")},${userId})`;session=null
        } else return NextResponse.json({error:"عملية العهدة غير معروفة"},{status:400})
      }
      return NextResponse.json({success:true,session:session?await sessionDetails(pointId,userId):null})
    })
  }catch(error){console.error("POS session error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تنفيذ عملية العهدة"},{status:500})}
}
