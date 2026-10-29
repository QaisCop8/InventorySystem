import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensureTables as ensureCreditCardTables } from "@/app/api/credit-cards/_lib"
import { canUsePosCashierPermission, posPermissionDenied, ensurePosTables, getPosPoint, requestUserId } from "../_lib"
import { buildPosCatalog } from "../_catalog"

export async function GET(request:NextRequest) {
  try {
    await ensureSalesTables(); await ensurePosTables(); await ensureCreditCardTables()
    const pointId=Number(request.nextUrl.searchParams.get("point_id")||0), userId=requestUserId(request)
    if(!pointId||!userId)return NextResponse.json({error:"نقطة البيع والمستخدم مطلوبان"},{status:400})
    const point=await getPosPoint(pointId,userId); if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة لهذا المستخدم"},{status:403})
    if(!await canUsePosCashierPermission(userId,Number(point.branch_id),"access"))return posPermissionDenied("access","لا توجد لديك صلاحية استخدام الكاشير على هذا الفرع")
    let priceCategoryId = Number(point.price_category_id)
    const customerId = Number(request.nextUrl.searchParams.get("customer_id") || 0)
    if (customerId) {
      const customer = (await sql`SELECT (SELECT c.pricecategory FROM customers c WHERE c.account_id=a.id AND COALESCE(c.isDeleted,false)=false ORDER BY c.id DESC LIMIT 1) pricecategory FROM account_tbl a WHERE a.id=${customerId} AND COALESCE(a.status,1)<>3 AND a.type IN (2,3,5)`)[0]
      if (!customer) return NextResponse.json({ error: "العميل غير موجود أو غير نشط" }, { status: 400 })
      priceCategoryId = Number(customer.pricecategory) || priceCategoryId
    }
    return NextResponse.json(await buildPosCatalog(point,pointId,userId,priceCategoryId))
  } catch(error){console.error("POS catalog error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل أصناف نقطة البيع"},{status:500})}
}
