import sql from "@/lib/database"
import { ensurePosCampaignTables } from "@/lib/pos-campaign-storage"
import { date, mapGet, mapOne, mapSet, num, text, type StepContext } from "@/lib/shamel-migration/core"

/**
 * حملات الشامل (CampTbl + CampItem) ⇐ حملات نقطة البيع (pos_campaign_header_tbl / pos_campaign_items_tbl) — 2026-11-21.
 * شاشة الحملات هنا نُقلت من ShamelWeb (Campaigns.js) فالحقول تقابل أعمدة الشامل واحداً لواحد بنفس الرموز:
 * Type ⇐ type_id (1 خصومات أسعار، 2 حزم، 3 إجمالي الفاتورة، 4 إجمالي أصناف، 5 أول كمية)، TimeType ⇐ time_type (1/2)،
 * ConditionItemsOpt/AddedItemsOption ⇐ (1/2/3)، CampItem.Type 2 = صنف مضاف/هدية وغيره صنف شراء.
 * قيمة خارج المدى (لم يكن في بيانات الاختبار أي حملة للتحقق) ⇐ الافتراضي 1 بدل حملة غير صالحة.
 * الربط في shamel_migration_map: campaign (رمز الحملة) — إعادة الترحيل تحدّث ولا تكرر.
 */

type Row = Record<string, unknown>

const inRange = (value: unknown, min: number, max: number, fallback = 1) => {
  const n = Math.trunc(num(value))
  return n >= min && n <= max ? n : fallback
}
/** وقت HH:MM[:SS] أو null (الشامل يخزّن 00:00:00 للفارغ) */
const time = (value: unknown) => {
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text(value))
  if (!match) return null
  const hh = match[1].padStart(2, "0")
  if (hh === "00" && match[2] === "00" && (!match[3] || match[3] === "00")) return null
  return `${hh}:${match[2]}:${match[3] || "00"}`
}

export const campaignsSql = () => `select c."ID" as id, c."CODE" as code, c."Name" as name, c."StartDate" as start_date, c."EndDate" as end_date,
  c."TimeType" as time_type, c."FromTime" as from_time, c."ToTime" as to_time, c."StopDate" as stop_date, c."Notes" as notes,
  c."Type" as type_id, c."FromAmount" as from_amount, c."ToAmount" as to_amount, c."DiscountPerc" as discount_perc,
  c."ConditionItemsOpt" as condition_items_opt, c."ConditionItemsVal" as condition_items_val,
  c."AddedItemsOption" as added_items_option, c."AddedItemsValue" as added_items_value,
  c."PriceClass" as price_class, c."MaxCampaigns" as max_campaigns, c."Store" as store
  from "CampTbl" c order by c."ID"`

export const campaignItemsSql = () => `select i."id" as id, i."CampaignCode" as campaign_code, i."ItemCode" as item_code, i."Unit" as unit_pos,
  i."OriginalUnitPrice" as original_unit_price, i."DiscountType" as discount_type, i."UnitDiscountValue" as unit_discount_value,
  i."CampaignQnty" as campaign_qnty, i."Notes" as notes, i."Type" as type
  from "CampItem" i order by i."CampaignCode", i."id"`

export async function processCampaigns(rows: Row[], ctx: StepContext) {
  await ensurePosCampaignTables()
  for (const r of rows) {
    ctx.stats.received++
    const code = text(r.code).slice(0, 40)
    if (!code) { ctx.stats.skipped++; continue }
    try {
      // الفئة السعرية: موضع فئة الشامل ⇐ فئة السعر المرحّلة؛ غير معروفة ⇐ 0 (كل الفئات السعرية)
      const priceClass = num(r.price_class) >= 0 ? (await mapOne("price_class", String(Math.trunc(num(r.price_class))))) ?? 0 : 0
      const values = {
        name: (text(r.name) || code).slice(0, 160),
        start_date: date(r.start_date),
        end_date: date(r.end_date),
        time_type: inRange(r.time_type, 1, 2),
        from_time: time(r.from_time),
        to_time: time(r.to_time),
        notes: text(r.notes) || null,
        type_id: inRange(r.type_id, 1, 5),
        from_amount: num(r.from_amount),
        to_amount: num(r.to_amount),
        discount_perc: num(r.discount_perc),
        condition_items_opt: inRange(r.condition_items_opt, 1, 3),
        condition_items_val: num(r.condition_items_val),
        added_items_option: inRange(r.added_items_option, 1, 3),
        added_items_value: num(r.added_items_value),
        price_class: priceClass,
        max_campaigns: Math.max(1, Math.trunc(num(r.max_campaigns)) || 1),
        // StopDate معبأ ⇐ حملة موقوفة يدوياً (لا يطبّقها الكاشير)
        status: date(r.stop_date) ? 2 : 1,
      }
      const mapped = await mapOne("campaign", code)
      const existing = mapped ?? (((await sql`SELECT id FROM pos_campaign_header_tbl WHERE code = ${code} LIMIT 1`) as any[])[0]?.id ?? null)
      let campaignId: number
      if (existing) {
        campaignId = Number(existing)
        await sql`
          UPDATE pos_campaign_header_tbl SET name = ${values.name}, start_date = ${values.start_date}, end_date = ${values.end_date},
            time_type = ${values.time_type}, from_time = ${values.from_time}, to_time = ${values.to_time}, notes = ${values.notes},
            type_id = ${values.type_id}, from_amount = ${values.from_amount}, to_amount = ${values.to_amount}, discount_perc = ${values.discount_perc},
            condition_items_opt = ${values.condition_items_opt}, condition_items_val = ${values.condition_items_val},
            added_items_option = ${values.added_items_option}, added_items_value = ${values.added_items_value},
            price_class = ${values.price_class}, max_campaigns = ${values.max_campaigns}, status = ${values.status}, last_modify_date = NOW()
          WHERE id = ${campaignId}`
        ctx.stats.updated++
      } else {
        const [row] = await sql`
          INSERT INTO pos_campaign_header_tbl (code, name, start_date, end_date, time_type, from_time, to_time, notes, type_id, from_amount, to_amount,
            discount_perc, condition_items_opt, condition_items_val, added_items_option, added_items_value, price_class, max_campaigns, status)
          VALUES (${code}, ${values.name}, ${values.start_date}, ${values.end_date}, ${values.time_type}, ${values.from_time}, ${values.to_time},
            ${values.notes}, ${values.type_id}, ${values.from_amount}, ${values.to_amount}, ${values.discount_perc}, ${values.condition_items_opt},
            ${values.condition_items_val}, ${values.added_items_option}, ${values.added_items_value}, ${values.price_class}, ${values.max_campaigns}, ${values.status})
          RETURNING id` as any[]
        campaignId = Number(row.id)
        ctx.stats.created++
      }
      await mapSet("campaign", code, campaignId)
      // مستودع الحملة: موضع مستودع الشامل ⇐ المستودع المرحّل (غير معروف ⇐ بلا تقييد = كل المستودعات)
      const warehouseId = num(r.store) >= 0 ? await mapOne("store", String(Math.trunc(num(r.store)))) : null
      await sql`DELETE FROM pos_campaign_warehouses_tbl WHERE campaign_id = ${campaignId}`
      if (warehouseId) await sql`INSERT INTO pos_campaign_warehouses_tbl (campaign_id, warehouse_id) VALUES (${campaignId}, ${warehouseId}) ON CONFLICT DO NOTHING`
    } catch (error) {
      ctx.error(code, error instanceof Error ? error.message : String(error))
    }
  }
}

export async function processCampaignItems(rows: Row[], ctx: StepContext) {
  await ensurePosCampaignTables()
  const campaigns = await mapGet("campaign", [...new Set(rows.map((r) => text(r.campaign_code).slice(0, 40)).filter(Boolean))])
  const items = await mapGet("item", [...new Set(rows.map((r) => text(r.item_code)).filter(Boolean))])
  const units = await mapGet("item_unit", rows.map((r) => `${text(r.item_code)}|${Math.trunc(num(r.unit_pos))}`))
  const productIds = [...new Set([...items.values()])]
  const names = new Map<number, string>(productIds.length
    ? ((await sql`SELECT id, product_name FROM products WHERE id = ANY(${productIds}::int[])`) as any[]).map((row) => [Number(row.id), String(row.product_name || "")] as [number, string])
    : [])
  for (const r of rows) {
    ctx.stats.received++
    const campaignCode = text(r.campaign_code).slice(0, 40)
    const itemCode = text(r.item_code)
    const ref = `${campaignCode}/${itemCode}`
    try {
      const campaignId = campaigns.get(campaignCode)
      if (!campaignId) { ctx.error(ref, "الحملة غير مرحّلة"); continue }
      const productId = items.get(itemCode)
      if (!productId) { ctx.error(ref, "الصنف غير مرحّل"); continue }
      // أصناف الحملة تُستبدل مرة واحدة لكل ترحيل (أول دفعة تراها) — إعادة الترحيل تطابق الشامل دون تكرار
      const resetKey = `${ctx.run.id}|${campaignCode}`
      if (!(await mapOne("campaign_items_reset", resetKey))) {
        await sql`DELETE FROM pos_campaign_items_tbl WHERE campaign_id = ${campaignId}`
        await mapSet("campaign_items_reset", resetKey, campaignId)
      }
      await sql`
        INSERT INTO pos_campaign_items_tbl (campaign_id, item_id, unit_id, item_name, original_unit_price, discount_type, unit_discount_value, campaign_qnty, notes, type)
        VALUES (${campaignId}, ${productId}, ${units.get(`${itemCode}|${Math.trunc(num(r.unit_pos))}`) ?? null}, ${(names.get(productId) || itemCode).slice(0, 200)},
          ${num(r.original_unit_price)}, ${inRange(r.discount_type, 1, 2)}, ${num(r.unit_discount_value)}, ${Math.max(1, num(r.campaign_qnty) || 1)},
          ${text(r.notes) || null}, ${Math.trunc(num(r.type)) === 2 ? 2 : 1})`
      ctx.stats.created++
    } catch (error) {
      ctx.error(ref, error instanceof Error ? error.message : String(error))
    }
  }
}
