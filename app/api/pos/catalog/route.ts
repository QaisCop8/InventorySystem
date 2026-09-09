import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, getOpenPosSession, getPosPoint, requestBranchId, requestUserId } from "../_lib"

export async function GET(request:NextRequest) {
  try {
    await ensureSalesTables(); await ensurePosTables()
    const pointId=Number(request.nextUrl.searchParams.get("point_id")||0), userId=requestUserId(request)
    if(!pointId||!userId)return NextResponse.json({error:"نقطة البيع والمستخدم مطلوبان"},{status:400})
    const point=await getPosPoint(pointId,userId,requestBranchId(request)); if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة لهذا المستخدم أو الفرع"},{status:403})
    const [products,customers,rates,session]=await Promise.all([
      sql`
        SELECT p.id,p.product_code,p.product_name,p.barcode,p.product_image,p.selling_account_id,p.selling_returns_account_id,
               COALESCE(NULLIF(p.classifications,''),'غير مصنف') category_name,
               u.id unit_id,u.unit_name,COALESCE(pu.first_barcode,p.barcode,'') first_barcode,
               COALESCE(pr.price,0) first_price,
               COALESCE(
                 (SELECT SUM(CASE WHEN it.transaction_type='in' THEN it.quantity ELSE -it.quantity END)
                  FROM inventory_transactions it WHERE it.product_id=p.id AND it.warehouse_id=${Number(point.main_warehouse_id)}),
                 CASE WHEN COALESCE(p.main_stock_id,p.default_store)=${Number(point.main_warehouse_id)} THEN ps.available_stock ELSE 0 END,0
               ) available_stock
        FROM products p
        LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.organization_id=1
        LEFT JOIN LATERAL (SELECT x.*,b.barcode first_barcode FROM product_units x LEFT JOIN product_unit_barcodes b ON b.product_id=x.product_id AND b.unit_id=x.id WHERE x.product_id=p.id ORDER BY x.id LIMIT 1) pu ON TRUE
        LEFT JOIN units u ON u.id=pu.unit_id
        LEFT JOIN LATERAL (SELECT x.price FROM product_prices x WHERE x.product_id=p.id AND x.price_category_id=${Number(point.price_category_id||1)} ORDER BY x.id LIMIT 1) pr ON TRUE
        WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
          AND (NOT EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id)
               OR EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id AND pw.warehouse_id=${Number(point.main_warehouse_id)}))
        ORDER BY p.product_code
      `,
      sql`SELECT id,name,account_id FROM customers WHERE COALESCE(isDeleted,false)=false AND COALESCE(type,1)=1 ORDER BY name LIMIT 10000`,
      sql`SELECT c.id currency_id,c.currency_name,c.currency_code,COALESCE((SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=c.id ORDER BY er.rate_date DESC,er.id DESC LIMIT 1),1) exchange_rate FROM currency c WHERE c.id=${Number(point.currency_id)}`,
      getOpenPosSession(pointId,userId),
    ])
    return NextResponse.json({point:{...point,exchange_rate:Number(rates[0]?.exchange_rate||1)},products,customers,currencies:rates,session,server_time:new Date().toISOString()})
  } catch(error){console.error("POS catalog error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل أصناف نقطة البيع"},{status:500})}
}
