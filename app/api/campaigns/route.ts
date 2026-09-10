import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS pos_campaign_header_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      start_date DATE,
      end_date DATE,
      time_type INTEGER DEFAULT 1,
      from_time TIME,
      to_time TIME,
      notes TEXT,
      type_id INTEGER DEFAULT 1,
      from_amount NUMERIC(18,4) DEFAULT 0,
      to_amount NUMERIC(18,4) DEFAULT 0,
      discount_perc NUMERIC(9,4) DEFAULT 0,
      condition_items_opt INTEGER DEFAULT 1,
      condition_items_val NUMERIC(18,4) DEFAULT 0,
      added_items_option INTEGER DEFAULT 1,
      added_items_value NUMERIC(18,4) DEFAULT 0,
      price_class INTEGER DEFAULT 1,
      max_campaigns INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_modify_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS pos_campaign_items_tbl (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES pos_campaign_header_tbl(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      unit_id INTEGER,
      item_name VARCHAR(200),
      original_unit_price NUMERIC(18,4) DEFAULT 0,
      discount_type INTEGER DEFAULT 1,
      unit_discount_value NUMERIC(18,4) DEFAULT 0,
      campaign_qnty NUMERIC(18,4) DEFAULT 1,
      notes TEXT,
      type INTEGER NOT NULL DEFAULT 1
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS pos_campaign_warehouses_tbl (
      campaign_id INTEGER NOT NULL REFERENCES pos_campaign_header_tbl(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL,
      PRIMARY KEY (campaign_id, warehouse_id)
    )
  `
}

const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const date = (value: unknown) => value ? String(value) : null

async function meta() {
  const [products, warehouses] = await Promise.all([
    sql`SELECT id, product_code code, name, COALESCE(sale_price,0) sale_price FROM products WHERE status IS NULL OR status::text IN ('1','نشط','active','ACTIVE') ORDER BY name`,
    sql`SELECT id, warehouse_code code, warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 ORDER BY warehouse_name`,
  ])
  return { products, warehouses }
}

async function campaignRows() {
  return sql`
    SELECT h.*, COALESCE((SELECT json_agg(json_build_object('id',i.id,'item_id',i.item_id,'item_name',COALESCE(i.item_name,p.name,''),'item_code',p.product_code,'unit_id',i.unit_id,'price',i.original_unit_price,'discount',i.unit_discount_value,'quantity',i.campaign_qnty,'type',i.type) ORDER BY i.id) FROM pos_campaign_items_tbl i LEFT JOIN products p ON p.id=i.item_id WHERE i.campaign_id=h.id),'[]') items,
    COALESCE((SELECT json_agg(w.warehouse_id ORDER BY w.warehouse_id) FROM pos_campaign_warehouses_tbl w WHERE w.campaign_id=h.id),'[]') warehouse_ids
    FROM pos_campaign_header_tbl h WHERE COALESCE(h.status,1)<>3 ORDER BY h.id DESC
  `
}

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const id = Number(request.nextUrl.searchParams.get("id") || 0)
    if (request.nextUrl.searchParams.get("meta") === "1") return NextResponse.json({ campaigns: await campaignRows(), ...(await meta()) })
    if (id) {
      const rows = await campaignRows()
      return NextResponse.json(rows.find((row: any) => Number(row.id) === id) || null)
    }
    return NextResponse.json({ campaigns: await campaignRows() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الحملات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return save(request, false)
}

export async function PUT(request: NextRequest) {
  return save(request, true)
}

async function save(request: NextRequest, updating: boolean) {
  try {
    await ensureTables()
    const data = await request.json()
    if (!String(data.name || "").trim()) return NextResponse.json({ error: "اسم الحملة مطلوب" }, { status: 400 })
    const code = String(data.code || `CMP-${Date.now()}`).trim().toUpperCase()
    const existing = await sql`SELECT id FROM pos_campaign_header_tbl WHERE code=${code} AND COALESCE(status,1)<>3 AND id<>${number(data.id)}`
    if (existing[0]) return NextResponse.json({ error: "رمز الحملة مستخدم مسبقاً" }, { status: 400 })
    let campaignId = number(data.id)
    if (updating && campaignId) {
      await sql`UPDATE pos_campaign_header_tbl SET code=${code},name=${String(data.name).trim()},start_date=${date(data.start_date)},end_date=${date(data.end_date)},time_type=${number(data.time_type,1)},from_time=${data.from_time||null},to_time=${data.to_time||null},notes=${data.notes||null},type_id=${number(data.type_id,1)},from_amount=${number(data.from_amount)},to_amount=${number(data.to_amount)},discount_perc=${number(data.discount_perc)},condition_items_opt=${number(data.condition_items_opt,1)},condition_items_val=${number(data.condition_items_val)},added_items_option=${number(data.added_items_option,1)},added_items_value=${number(data.added_items_value)},price_class=${number(data.price_class,1)},max_campaigns=${number(data.max_campaigns,1)},last_modify_date=NOW() WHERE id=${campaignId}`
    } else {
      const inserted = await sql`INSERT INTO pos_campaign_header_tbl(code,name,start_date,end_date,time_type,from_time,to_time,notes,type_id,from_amount,to_amount,discount_perc,condition_items_opt,condition_items_val,added_items_option,added_items_value,price_class,max_campaigns) VALUES(${code},${String(data.name).trim()},${date(data.start_date)},${date(data.end_date)},${number(data.time_type,1)},${data.from_time||null},${data.to_time||null},${data.notes||null},${number(data.type_id,1)},${number(data.from_amount)},${number(data.to_amount)},${number(data.discount_perc)},${number(data.condition_items_opt,1)},${number(data.condition_items_val)},${number(data.added_items_option,1)},${number(data.added_items_value)},${number(data.price_class,1)},${number(data.max_campaigns,1)}) RETURNING id`
      campaignId = Number(inserted[0].id)
    }
    await sql`DELETE FROM pos_campaign_items_tbl WHERE campaign_id=${campaignId}`
    for (const item of Array.isArray(data.buy_items) ? data.buy_items : []) {
      if (!number(item.item_id)) continue
      await sql`INSERT INTO pos_campaign_items_tbl(campaign_id,item_id,unit_id,item_name,original_unit_price,discount_type,unit_discount_value,campaign_qnty,notes,type) VALUES(${campaignId},${number(item.item_id)},${number(item.unit_id)||null},${item.item_name||null},${number(item.price)},${number(item.discount_type,1)},${number(item.discount)},${number(item.quantity,1)},${item.notes||null},1)`
    }
    for (const item of Array.isArray(data.added_items) ? data.added_items : []) {
      if (!number(item.item_id)) continue
      await sql`INSERT INTO pos_campaign_items_tbl(campaign_id,item_id,unit_id,item_name,original_unit_price,discount_type,unit_discount_value,campaign_qnty,notes,type) VALUES(${campaignId},${number(item.item_id)},${number(item.unit_id)||null},${item.item_name||null},${number(item.price)},${number(item.discount_type,1)},${number(item.discount)},${number(item.quantity,1)},${item.notes||null},2)`
    }
    await sql`DELETE FROM pos_campaign_warehouses_tbl WHERE campaign_id=${campaignId}`
    for (const warehouseId of Array.isArray(data.warehouse_ids) ? data.warehouse_ids : []) if (number(warehouseId)) await sql`INSERT INTO pos_campaign_warehouses_tbl(campaign_id,warehouse_id) VALUES(${campaignId},${number(warehouseId)}) ON CONFLICT DO NOTHING`
    return NextResponse.json({ success: true, id: campaignId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الحملة" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureTables()
    const id = number(request.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "معرف الحملة مطلوب" }, { status: 400 })
    await sql`UPDATE pos_campaign_header_tbl SET status=3,last_modify_date=NOW() WHERE id=${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الحملة" }, { status: 500 })
  }
}
