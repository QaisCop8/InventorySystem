import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { requirePermissionByName } from "@/lib/tenant-auth"

export async function GET(request: NextRequest) {
  try {
    const permission = await requirePermissionByName(request, "استعلام مسودة طلبية مبيعات")
    if (!permission.ok) return permission.response
    await ensureOrderDraftTables()

    const params = new URL(request.url).searchParams
    const from = params.get("from") || "1900-01-01"
    const to = params.get("to") || "2999-12-31"
    const search = `%${(params.get("search") || "").trim()}%`
    const status = params.get("status") || "all"

    const rows = await sql`
      SELECT d.*,
        o.order_number,
        o.order_status,
        COALESCE((
          SELECT COALESCE(us.full_name, us.username, e.user_id)
          FROM sales_order_draft_events e
          LEFT JOIN user_settings us ON us.user_id::text = e.user_id::text
          WHERE e.draft_id = d.id AND e.event_type = 'created'
          ORDER BY e.created_at, e.id LIMIT 1
        ), (
          SELECT COALESCE(us.full_name, us.username, d.created_by)
          FROM user_settings us WHERE us.user_id::text = d.created_by::text LIMIT 1
        ), d.created_by) AS created_by_name,
        COALESCE((
          SELECT COALESCE(us.full_name, us.username, e.user_id)
          FROM sales_order_draft_events e
          LEFT JOIN user_settings us ON us.user_id::text = e.user_id::text
          WHERE e.draft_id = d.id AND e.event_type = 'confirmed'
          ORDER BY e.created_at DESC, e.id DESC LIMIT 1
        ), '-') AS converted_by_name,
        COALESCE((
          SELECT e.created_at FROM sales_order_draft_events e
          WHERE e.draft_id = d.id AND e.event_type = 'confirmed'
          ORDER BY e.created_at DESC, e.id DESC LIMIT 1
        ), CASE WHEN d.status = 'confirmed' THEN d.updated_at ELSE NULL END) AS converted_at,
        COALESCE((
          SELECT json_agg(i ORDER BY i.id)
          FROM sales_order_draft_items i WHERE i.draft_id = d.id
        ), '[]'::json) AS items,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', e.id, 'event_type', e.event_type, 'user_id', e.user_id,
            'user_name', COALESCE(us.full_name, us.username, e.user_id),
            'details', e.details, 'created_at', e.created_at
          ) ORDER BY e.created_at, e.id)
          FROM sales_order_draft_events e
          LEFT JOIN user_settings us ON us.user_id::text = e.user_id::text
          WHERE e.draft_id = d.id
        ), '[]'::json) AS events
      FROM sales_order_drafts d
      LEFT JOIN orders o ON o.id = d.confirmed_order_id
      WHERE d.order_date BETWEEN ${from}::date AND ${to}::date
        AND (${status} = 'all' OR d.status = ${status})
        AND (d.draft_number ILIKE ${search} OR d.customer_name ILIKE ${search} OR COALESCE(o.order_number, '') ILIKE ${search})
      ORDER BY d.created_at DESC, d.id DESC
    `

    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل أرشيف مسودات طلبيات المبيعات" }, { status: 500 })
  }
}
