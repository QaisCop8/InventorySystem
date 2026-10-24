import sql from "@/lib/database"
import { deniedAccountIdsFor } from "@/lib/account-access"
import { getPosCurrencies } from "@/lib/pos-currencies"
import { loadStoredSettings } from "@/app/api/settings/system/route"
import { getOpenPosSession } from "./_lib"
import { getPosCampaigns, getPosCampaignUsage } from "@/lib/pos-campaign-storage"
import { runSchemaOnce } from "@/lib/schema-once"

const byText = (a: string, b: string) => a.localeCompare(b, "ar", { numeric: true })

function ensureProductExtrasSchema() {
  return runSchemaOnce("app/api/pos/_catalog.ts#ensureProductExtrasSchema", async () => {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS related_items_mode INTEGER NOT NULL DEFAULT 1`
    await sql`CREATE TABLE IF NOT EXISTS product_related_items (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, related_id), CHECK (product_id <> related_id))`
  })
}

/**
 * لكل صنف: addon_groups = "المتغيرات والخصائص" (المجموعات وقيمها تصاعدياً)، و related_items_mode / related_ids =
 * التوابع (1 الصنف فقط، 2 التوابع فقط، 3 الصنف والتوابع) — مشتركة بين كاشير نقطة البيع وشاشة المطعم.
 */
export async function attachProductExtras<T extends { id: number | string }>(products: T[]) {
  const ids = products.map((product) => Number(product.id)).filter((id) => id > 0)
  if (!ids.length) return products.map((product) => ({ ...product, addon_groups: [], related_items_mode: 1, related_ids: [] as number[] }))
  await ensureProductExtrasSchema()
  const [extras, relations] = await Promise.all([
    sql`SELECT id, attributes, related_items_mode FROM products WHERE id = ANY(${ids}::int[]) AND (CASE WHEN jsonb_typeof(attributes) = 'array' THEN jsonb_array_length(attributes) ELSE 0 END > 0 OR COALESCE(related_items_mode, 1) > 1)`,
    sql`SELECT product_id, related_id FROM product_related_items WHERE product_id = ANY(${ids}::int[]) ORDER BY id`,
  ])
  const extraById = new Map<number, any>((extras as any[]).map((row) => [Number(row.id), row]))
  const relatedById = new Map<number, number[]>()
  for (const row of relations as any[]) relatedById.set(Number(row.product_id), [...(relatedById.get(Number(row.product_id)) || []), Number(row.related_id)])
  return products.map((product) => {
    const extra = extraById.get(Number(product.id))
    const groups = (Array.isArray(extra?.attributes) ? extra.attributes : [])
      .map((group: any) => ({
        name: String(group?.name || "").trim(),
        values: (Array.isArray(group?.values) ? group.values : []).map((value: unknown) => String(value || "").trim()).filter(Boolean).sort(byText),
      }))
      .filter((group: any) => group.name && group.values.length)
      .sort((a: any, b: any) => byText(a.name, b.name))
    return {
      ...product,
      addon_groups: groups as { name: string; values: string[] }[],
      related_items_mode: Math.min(3, Math.max(1, Number(extra?.related_items_mode || 1))),
      related_ids: relatedById.get(Number(product.id)) || [],
    }
  })
}

// كتالوج نقطة البيع (أصناف المخزن الرئيسي بأسعار فئة السعر، العملات، البنوك، البطاقات، الحملات وجلسة المستخدم المفتوحة)
// — مشترك بين كاشير نقطة البيع (api/pos/catalog) وشاشة المطعم (api/restaurant/catalog)
export async function buildPosCatalog(point: any, pointId: number, userId: string, priceCategoryId: number) {
    const [products,customers,rates,session,salesmen,banks,bankBranches,cardTypes,systemSettings]=await Promise.all([
      // كتالوج الكاشير: كل جزء (آخر سعر لكل وحدة، الوحدة الافتراضية، قائمة الوحدات، الباركودات، الرصيد) يُحسب مرة واحدة لكل
      // الأصناف بتجميع ثم يُربط — بدل ~5 استعلامات فرعية مترابطة لكل صنف (16 ألف صنف ⇐ ~7 ثوانٍ). نفس قواعد الاختيار:
      // الوحدة الافتراضية = أول وحدة لها سعر في فئة السعر (ثم الأقدم)، والسعر = سعر وحدتها ثم سعر صف وحدة الصنف ثم السعر
      // الوحيد إن كان للصنف وحدة وسعر واحدان، والأحدث (id الأعلى) عند التكرار.
      sql`
        WITH prices AS (
          SELECT id, product_id, unit_id, price, currency_id FROM product_prices WHERE price_category_id=${priceCategoryId}
        ), price_by_unit AS (
          SELECT DISTINCT ON (product_id, unit_id) product_id, unit_id, price, currency_id FROM prices ORDER BY product_id, unit_id, id DESC
        ), single_price AS (
          SELECT DISTINCT ON (product_id) product_id, price, currency_id, COUNT(*) OVER (PARTITION BY product_id) n FROM prices ORDER BY product_id, id DESC
        ), unit_counts AS (
          SELECT product_id, COUNT(*) n FROM product_units GROUP BY product_id
        ), first_barcode AS (
          SELECT DISTINCT ON (product_id, unit_id) product_id, unit_id, barcode FROM product_unit_barcodes ORDER BY product_id, unit_id, id
        ), default_unit AS (
          SELECT DISTINCT ON (x.product_id) x.product_id, x.id pu_id, x.unit_id, fb.barcode first_barcode
          FROM product_units x
          LEFT JOIN price_by_unit has_price ON has_price.product_id=x.product_id AND has_price.unit_id=x.unit_id
          LEFT JOIN first_barcode fb ON fb.product_id=x.product_id AND fb.unit_id=x.id
          ORDER BY x.product_id, CASE WHEN has_price.product_id IS NOT NULL THEN 0 ELSE 1 END, x.id
        ), unit_prices AS (
          SELECT up.product_id, jsonb_agg(jsonb_build_object(
              'unit_id',up.unit_id,'unit_name',un.unit_name,
              'source_price',COALESCE(CASE WHEN by_unit.product_id IS NOT NULL THEN by_unit.price ELSE by_row.price END,0),
              'price_currency_id',CASE WHEN by_unit.product_id IS NOT NULL THEN by_unit.currency_id ELSE by_row.currency_id END
            ) ORDER BY up.id) list
          FROM product_units up
          LEFT JOIN units un ON un.id=up.unit_id
          LEFT JOIN price_by_unit by_unit ON by_unit.product_id=up.product_id AND by_unit.unit_id=up.unit_id
          LEFT JOIN price_by_unit by_row ON by_row.product_id=up.product_id AND by_row.unit_id=up.id
          GROUP BY up.product_id
        ), barcode_options AS (
          SELECT pub.product_id, jsonb_agg(jsonb_build_object(
              'barcode',pub.barcode,'unit_id',all_pu.unit_id,'unit_name',all_u.unit_name,
              'source_price',COALESCE(CASE WHEN by_row.product_id IS NOT NULL THEN by_row.price ELSE by_unit.price END,0),
              'price_currency_id',CASE WHEN by_row.product_id IS NOT NULL THEN by_row.currency_id ELSE by_unit.currency_id END
            ) ORDER BY pub.id) list
          FROM product_unit_barcodes pub
          JOIN product_units all_pu ON all_pu.id=pub.unit_id AND all_pu.product_id=pub.product_id
          JOIN units all_u ON all_u.id=all_pu.unit_id
          LEFT JOIN price_by_unit by_row ON by_row.product_id=pub.product_id AND by_row.unit_id=all_pu.id
          LEFT JOIN price_by_unit by_unit ON by_unit.product_id=pub.product_id AND by_unit.unit_id=all_pu.unit_id
          GROUP BY pub.product_id
        ), stock AS (
          SELECT product_id, SUM(CASE WHEN transaction_type='in' THEN quantity ELSE -quantity END) qty
          FROM inventory_transactions WHERE warehouse_id=${Number(point.main_warehouse_id)} GROUP BY product_id
        )
        SELECT p.id,p.product_code,p.product_name,p.barcode,p.product_image,p.selling_account_id,p.selling_returns_account_id,p.pos_sold_using_scale,
               COALESCE(NULLIF(ig.group_name,''),NULLIF(main_group.group_name,''),'غير مصنف') category_name,
               COALESCE(ig.id,main_group.id) group_id,
               -- الأولوية لطابعة الصنف نفسه (products.default_printer)، وإلا طابعة مجموعته
               NULLIF(TRIM(to_jsonb(p)->>'default_printer'),'') item_printer,
               COALESCE(NULLIF(TRIM(to_jsonb(p)->>'default_printer'),''), CASE WHEN ig.id IS NOT NULL THEN NULLIF(TRIM(ig.default_printer),'') ELSE NULLIF(TRIM(main_group.default_printer),'') END) group_printer,
               u.id unit_id,u.unit_name,COALESCE(pu.first_barcode,p.barcode,'') first_barcode,
               COALESCE(CASE WHEN pr_unit.product_id IS NOT NULL THEN pr_unit.price WHEN pr_row.product_id IS NOT NULL THEN pr_row.price WHEN uc.n=1 AND sp.n=1 THEN sp.price END,0) source_price,
               CASE WHEN pr_unit.product_id IS NOT NULL THEN pr_unit.currency_id WHEN pr_row.product_id IS NOT NULL THEN pr_row.currency_id WHEN uc.n=1 AND sp.n=1 THEN sp.currency_id END price_currency_id,
               COALESCE(unit_prices.list,'[]'::jsonb) unit_prices,
               COALESCE(barcode_options.list,'[]'::jsonb) barcode_options,
               COALESCE(stock.qty, CASE WHEN COALESCE(p.main_stock_id,p.default_store)=${Number(point.main_warehouse_id)} THEN ps.available_stock ELSE 0 END, 0) available_stock
        FROM products p
        LEFT JOIN item_groups ig ON ig.id=p.category_id
        LEFT JOIN item_groups main_group ON main_group.id=p.main_stock_id AND COALESCE(main_group.status,1)=1
        LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.organization_id=1
        LEFT JOIN default_unit pu ON pu.product_id=p.id
        LEFT JOIN units u ON u.id=pu.unit_id
        LEFT JOIN price_by_unit pr_unit ON pr_unit.product_id=p.id AND pr_unit.unit_id=pu.unit_id
        LEFT JOIN price_by_unit pr_row ON pr_row.product_id=p.id AND pr_row.unit_id=pu.pu_id
        LEFT JOIN single_price sp ON sp.product_id=p.id
        LEFT JOIN unit_counts uc ON uc.product_id=p.id
        LEFT JOIN unit_prices ON unit_prices.product_id=p.id
        LEFT JOIN barcode_options ON barcode_options.product_id=p.id
        LEFT JOIN stock ON stock.product_id=p.id
        WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
          AND (NOT EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id)
               OR EXISTS(SELECT 1 FROM product_warehouses pw WHERE pw.product_id=p.id AND pw.warehouse_id=${Number(point.main_warehouse_id)}))
        ORDER BY p.product_code
      `,
      sql`SELECT a.id,a.code,a.name,a.id account_id,(SELECT c.pricecategory FROM customers c WHERE c.account_id=a.id AND COALESCE(c.isDeleted,false)=false ORDER BY c.id DESC LIMIT 1) pricecategory FROM account_tbl a WHERE COALESCE(a.status,1)<>3 AND a.type IN (2,3,5) ORDER BY a.name`,
      getPosCurrencies(Number(point.currency_id)),
      getOpenPosSession(pointId,userId),
      sql`SELECT id,code,name FROM salesmen WHERE COALESCE(is_active,true) ORDER BY name`,
      sql`SELECT id,bank_code code,bank_name name FROM banks WHERE COALESCE(status,1)=1 ORDER BY bank_name`,
      sql`SELECT id,bank_id,branch_code code,branch_name name FROM branches WHERE COALESCE(status,1)=1 AND bank_id IS NOT NULL ORDER BY branch_name`,
      sql`SELECT id,name,currency_id,COALESCE(link_bank_machine,false) AS link_bank_machine,pinpad_machine_id FROM credit_cards_types_tbl WHERE COALESCE(status,1)=1 AND currency_id=${Number(point.currency_id)} ORDER BY name`,
      loadStoredSettings(),
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
      const unitPrices=(Array.isArray(product.unit_prices)?product.unit_prices:[]).map((option:any)=>{
        const rate=rateByCurrency.get(Number(option.price_currency_id||pointCurrencyId))||1
        return {unit_id:Number(option.unit_id),unit_name:String(option.unit_name||''),price:Math.round(Number(option.source_price||0)*rate/pointRate*10000)/10000}
      })
      return {...rest,first_price:firstPrice,barcode_options:barcodeOptions,unit_prices:unitPrices}
    })
    const [campaigns,campaignUsage,productsWithExtras]=await Promise.all([getPosCampaigns(),getPosCampaignUsage(),attachProductExtras(pricedProducts)])
    // صلاحيات المستخدمين على الحسابات: العملاء الممنوعون عن المستخدم (بفرع النقطة) لا يظهرون بالكاشير/المطعم
    const deniedCustomers=await deniedAccountIdsFor(userId,Number(point.branch_id)||0)
    const visibleCustomers=deniedCustomers.size?(customers as any[]).filter((row:any)=>!deniedCustomers.has(Number(row.id))):customers
    return {point:{...point,exchange_rate:pointRate},tax_rate:Number(systemSettings.tax_rate||0),allow_negative_item_balances:!(systemSettings.allow_negative_item_balances===false||systemSettings.allow_negative_item_balances==="false"||systemSettings.allow_negative_item_balances===0||systemSettings.allow_negative_item_balances==="0"),default_selling_account_id:Number(systemSettings.default_selling_account_id)||null,receiptSettings:{company_name:systemSettings.company_name||"",company_address:systemSettings.company_address||"",company_phone:systemSettings.company_phone||"",company_email:systemSettings.company_email||"",tax_number:systemSettings.tax_number||"",company_logo:systemSettings.company_logo||""},products:productsWithExtras,customers:visibleCustomers,salesmen,banks,bankBranches,cardTypes,campaigns,
      campaignUsage,
      currencies:rates.filter((row:any)=>Number(row.exchange_rate)>0).map((row:any)=>({...row,rate_to_point:Number(row.exchange_rate)/pointRate})),
      session,server_time:new Date().toISOString()}
}
