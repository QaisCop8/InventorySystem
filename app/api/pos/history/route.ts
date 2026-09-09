import {NextRequest,NextResponse} from "next/server"
import sql from "@/lib/database"
import {ensureTables as ensureSalesTables} from "@/app/api/sales-vouchers/_lib"
import {ensurePosTables,getPosPoint,requestBranchId,requestUserId} from "../_lib"

export async function GET(request:NextRequest){
 try{await ensureSalesTables();await ensurePosTables();const pointId=Number(request.nextUrl.searchParams.get("point_id")||0),userId=requestUserId(request);if(!pointId||!userId)return NextResponse.json({error:"بيانات نقطة البيع غير مكتملة"},{status:400});const point=await getPosPoint(pointId,userId,requestBranchId(request));if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة"},{status:403});const q=String(request.nextUrl.searchParams.get("q")||"").trim();const rows=await sql`
   SELECT vh.id,vh.vch_code,vh.vch_date,vh.vch_type,vh.customer_name,vh.amount,vh.status,
          COALESCE((SELECT json_agg(json_build_object('method',p.payment_method,'amount',p.amount,'reference',p.reference,'due_date',p.due_date) ORDER BY p.id) FROM pos_sale_payments_tbl p WHERE p.voucher_id=vh.id),'[]') payments
   FROM voucher_header_tbl vh
   WHERE vh.id IN(SELECT p.voucher_id FROM pos_sale_payments_tbl p WHERE p.pos_point_id=${pointId})
     AND (${q}='' OR CONCAT_WS(' ',vh.vch_code,vh.customer_name,vh.amount::text) ILIKE ${`%${q}%`})
   ORDER BY vh.id DESC LIMIT 100
 `;return NextResponse.json({rows})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل فواتير النقطة"},{status:500})}
}
