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
    const [products,customers,rates,session,salesmen,banks,bankBranches,cardTypes]=await Promise.all([
      sql`
        SELECT p.id,p.product_code,p.product_name,p.barcode,p.product_image,p.selling_account_id,p.selling_returns_account_id,p.pos_sold_using_scale,
               COALESCE(NULLIF(ig.group_name,''),NULLIF(main_group.group_name,''),'غير مصنف') category_name,
               u.id unit_id,u.unit_name,COALESCE(pu.first_barcode,p.barcode,'') first_barcode,
               COALESCE(pr.price,0) source_price,pr.currency_id price_currency_id,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'barcode',pub.barcode,'unit_id',all_pu.unit_id,'unit_name',all_u.unit_name,
                   'source_price',COALESCE(all_pr.price,0),'price_currency_id',all_pr.currency_id
                 ) ORDER BY pub.id)
                 FROM product_unit_barcodes pub
                 JOIN product_units all_pu ON all_pu.id=pub.unit_id AND all_pu.product_id=p.id
                 JOIN units all_u ON all_u.id=all_pu.unit_id
                 LEFT JOIN LATERAL (
                   SELECT pp.price,pp.currency_id FROM product_prices pp
                   WHERE pp.product_id=p.id AND pp.price_category_id=${Number(point.price_category_id)}
                     AND pp.unit_id IN (all_pu.id,all_pu.unit_id)
                   ORDER BY CASE WHEN pp.unit_id=all_pu.id THEN 0 ELSE 1 END,pp.id DESC LIMIT 1
                 ) all_pr ON TRUE
                 WHERE pub.product_id=p.id
               ),'[]'::jsonb) barcode_options,
               COALESCE(
                 (SELECT SUM(CASE WHEN it.transaction_type='in' THEN it.quantity ELSE -it.quantity END)
                  FROM inventory_transactions it WHERE it.product_id=p.id AND it.warehouse_id=${Number(point.main_warehouse_id)}),
                 CASE WHEN COALESCE(p.main_stock_id,p.default_store)=${Number(point.main_warehouse_id)} THEN ps.available_stock ELSE 0 END,0
               ) available_stock
        FROM products p
        LEFT JOIN item_groups ig ON ig.id=p.category_id
        LEFT JOIN item_groups main_group ON main_group.id=p.main_stock_id AND COALESCE(main_group.status,1)=1
        LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.organization_id=1
        LEFT JOIN LATERAL (SELECT x.*,b.barcode first_barcode FROM product_units x LEFT JOIN LATERAL
          (SELECT barcode FROM product_unit_barcodes WHERE product_id=x.product_id AND unit_id=x.id ORDER BY id LIMIT 1) b ON TRUE
          WHERE x.product_id=p.id
          ORDER BY CASE WHEN EXISTS (
            SELECT 1 FROM product_prices selected_price
            WHERE selected_price.product_id=p.id AND selected_price.price_category_id=${Number(point.price_category_id)}
              AND selected_price.unit_id=x.unit_id
          ) THEN 0 ELSE 1 END, x.id LIMIT 1) pu ON TRUE
        LEFT JOIN units u ON u.id=pu.unit_id
        LEFT JOIN LATERAL (SELECT x.price,x.currency_id FROM product_prices x WHERE x.product_id=p.id
          AND x.price_category_id=${Number(point.price_category_id)}
          AND (x.unit_id IN (pu.unit_id,pu.id) OR (
            (SELECT COUNT(*) FROM product_units one_unit WHERE one_unit.product_id=p.id)=1
            AND (SELECT COUNT(*) FROM product_prices one_price WHERE one_price.product_id=p.id
              AND one_price.price_category_id=${Number(point.price_category_id)})=1
          ))
          ORDER BY CASE WHEN x.unit_id=pu.unit_id THEN 0 WHEN x.unit_id=pu.id THEN 1 ELSE 2 END,x.id DESC LIMIT 1) pr ON TRUE
        WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
          AND (NOT EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id)
               OR EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id AND pw.warehouse_id=${Number(point.main_warehouse_id)}))
        ORDER BY p.product_code
      `,
      sql`SELECT id,code,name,id account_id FROM account_tbl WHERE COALESCE(status,1)<>3 AND type IN (2,3,5) ORDER BY name`,
      sql`SELECT c.id currency_id,c.currency_name,c.currency_code,CASE WHEN c.id=(SELECT MIN(id) FROM currency) THEN 1 ELSE (SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=c.id AND er.rate_date::date<=CURRENT_DATE AND COALESCE(er.is_active,true) ORDER BY er.rate_date DESC,er.id DESC LIMIT 1) END exchange_rate FROM currency c`,
      getOpenPosSession(pointId,userId),
      sql`SELECT id,code,name FROM salesmen WHERE COALESCE(is_active,true) ORDER BY name`,
      sql`SELECT id,bank_code code,bank_name name FROM banks WHERE COALESCE(status,1)=1 ORDER BY bank_name`,
      sql`SELECT id,bank_id,branch_code code,branch_name name FROM branches WHERE COALESCE(status,1)=1 AND bank_id IS NOT NULL ORDER BY branch_name`,
      sql`SELECT id,name FROM credit_cards_types_tbl WHERE COALESCE(status,1)=1 ORDER BY name`,
    ])
    const pointCurrencyId=Number(point.currency_id)
    const rateByCurrency=new Map<number,number>(rates.map((row:any)=>[Number(row.currency_id),Number(row.exchange_rate)] as [number,number]))
    const pointRate=rateByCurrency.get(pointCurrencyId)
    if(!pointRate||pointRate<=0)throw new Error(`لا يوجد سعر صرف صالح لعملة نقطة البيع ${point.currency_code||""} حتى اليوم`)
    const pricedProducts=products.map((product:any)=>{
      const sourcePrice=Number(product.source_price||0)
      const sourceCurrencyId=Number(product.price_currency_id||pointCurrencyId)
      const sourceRate=sourceCurrencyId===pointCurrencyId?pointRate:rateByCurrency.get(sourceCurrencyId)
      if(!sourceRate||sourceRate<=0)throw new Error(`لا يوجد سعر صرف صالح لعملة بيع الصنف ${product.product_code||product.product_name} حتى اليوم`)
      const firstPrice=sourceCurrencyId===pointCurrencyId?sourcePrice:Math.round(sourcePrice*sourceRate/pointRate*10000)/10000
      const {source_price,price_currency_id,...rest}=product
      const barcodeOptions=(Array.isArray(product.barcode_options)?product.barcode_options:[]).map((option:any)=>{
        const optionSourcePrice=Number(option.source_price||0)
        const optionCurrencyId=Number(option.price_currency_id||pointCurrencyId)
        const optionRate=optionCurrencyId===pointCurrencyId?pointRate:rateByCurrency.get(optionCurrencyId)
        if(!optionRate||optionRate<=0)throw new Error(`لا يوجد سعر صرف صالح لعملة بيع الصنف ${product.product_code||product.product_name} حتى اليوم`)
        return {barcode:String(option.barcode||''),unit_id:Number(option.unit_id)||null,unit_name:String(option.unit_name||''),price:optionCurrencyId===pointCurrencyId?optionSourcePrice:Math.round(optionSourcePrice*optionRate/pointRate*10000)/10000}
      })
      return {...rest,first_price:firstPrice,barcode_options:barcodeOptions}
    })
    return NextResponse.json({point:{...point,exchange_rate:pointRate},products:pricedProducts,customers,salesmen,banks,bankBranches,cardTypes,
      currencies:rates.filter((row:any)=>Number(row.exchange_rate)>0).map((row:any)=>({...row,rate_to_point:Number(row.exchange_rate)/pointRate})),
      session,server_time:new Date().toISOString()})
  } catch(error){console.error("POS catalog error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل أصناف نقطة البيع"},{status:500})}
}
