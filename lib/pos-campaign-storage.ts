import sql from "@/lib/database"

export async function ensurePosCampaignTables() {
  await sql`CREATE TABLE IF NOT EXISTS pos_campaign_header_tbl (
    id SERIAL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
    start_date DATE, end_date DATE, time_type INTEGER DEFAULT 1, from_time TIME, to_time TIME,
    notes TEXT, type_id INTEGER DEFAULT 1, from_amount NUMERIC(18,4) DEFAULT 0,
    to_amount NUMERIC(18,4) DEFAULT 0, discount_perc NUMERIC(9,4) DEFAULT 0,
    condition_items_opt INTEGER DEFAULT 1, condition_items_val NUMERIC(18,4) DEFAULT 0,
    added_items_option INTEGER DEFAULT 1, added_items_value NUMERIC(18,4) DEFAULT 0,
    price_class INTEGER DEFAULT 1, max_campaigns INTEGER DEFAULT 1, status INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_modify_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
  await sql`CREATE TABLE IF NOT EXISTS pos_campaign_items_tbl (
    id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES pos_campaign_header_tbl(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL, unit_id INTEGER, item_name VARCHAR(200),
    original_unit_price NUMERIC(18,4) DEFAULT 0, discount_type INTEGER DEFAULT 1,
    unit_discount_value NUMERIC(18,4) DEFAULT 0, campaign_qnty NUMERIC(18,4) DEFAULT 1,
    notes TEXT, type INTEGER NOT NULL DEFAULT 1
  )`
  await sql`CREATE TABLE IF NOT EXISTS pos_campaign_warehouses_tbl (
    campaign_id INTEGER NOT NULL REFERENCES pos_campaign_header_tbl(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL, PRIMARY KEY(campaign_id,warehouse_id)
  )`
  await sql`CREATE TABLE IF NOT EXISTS pos_campaign_branches_tbl (
    campaign_id INTEGER NOT NULL REFERENCES pos_campaign_header_tbl(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL, PRIMARY KEY(campaign_id,branch_id)
  )`
}

export async function getPosCampaigns() {
  await ensurePosCampaignTables()
  return sql`
    SELECT h.id,h.start_date::text,h.end_date::text,h.time_type,h.from_time::text,h.to_time::text,
      h.type_id,h.from_amount,h.to_amount,h.discount_perc,h.condition_items_opt,h.condition_items_val,
      h.added_items_option,h.added_items_value,h.price_class,h.max_campaigns,
      COALESCE((SELECT json_agg(i ORDER BY i.id) FROM (
        SELECT id,item_id,unit_id,campaign_qnty AS quantity,unit_discount_value AS discount,type
        FROM pos_campaign_items_tbl WHERE campaign_id=h.id
      ) i),'[]') items,
      COALESCE((SELECT json_agg(warehouse_id ORDER BY warehouse_id) FROM pos_campaign_warehouses_tbl WHERE campaign_id=h.id),'[]') warehouse_ids,
      COALESCE((SELECT json_agg(branch_id ORDER BY branch_id) FROM pos_campaign_branches_tbl WHERE campaign_id=h.id),'[]') branch_ids
    FROM pos_campaign_header_tbl h
    WHERE COALESCE(h.status,1)=1
    ORDER BY h.id
  `
}