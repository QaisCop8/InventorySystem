import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { authorizeFile } from "@/lib/file-permissions"
import { applyBulkItems, ensureBulkItemSchema, previewBulkItems } from "@/lib/bulk-items"

// أدوات ⇐ تعديل الأصناف. GET = القوائم (المجموعات، التصنيفات، العلامات التجارية، المستودعات، فئات الأسعار...)
// POST {action: "preview", filters, price_category_id} = الأصناف المطابقة، {action: "apply", ...} = تطبيق التعديل
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "bulk_items", "view", "")
    if (!auth.ok) return auth.response
    await ensureBulkItemSchema()
    const safe = async (query: Promise<any>) => { try { return await query } catch { return [] } }
    const [groups, categories, brands, warehouses, priceCategories, taxClassifications] = await Promise.all([
      safe(sql`SELECT id, group_name AS name, group_code AS code FROM item_groups WHERE COALESCE(status, 1) <> 3 ORDER BY group_name`),
      safe(sql`SELECT id, name FROM product_categories ORDER BY name`),
      safe(sql`SELECT b.id, b.name, bt.name AS type_name FROM brands b LEFT JOIN brand_types bt ON bt.id = b.brand_type_id WHERE COALESCE(b.status, 1) <> 3 ORDER BY b.name`),
      safe(sql`SELECT id, warehouse_name AS name, warehouse_code AS code FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY warehouse_name`),
      safe(sql`SELECT id, name FROM pricecategory WHERE COALESCE(status, 1) <> 3 ORDER BY id`),
      safe(sql`SELECT id, name, tax_percent FROM tax_classifications WHERE COALESCE(status, 1) <> 3 ORDER BY name`),
    ])
    return NextResponse.json({ groups, categories, brands, warehouses, priceCategories, taxClassifications })
  } catch (error: any) {
    console.error("[tools/bulk-items] GET", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل القوائم" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body.action === "apply") {
      const auth = await authorizeTransaction(request, "bulk_items", "update")
      if (!auth.ok) return auth.response
      // تعديل ملفات الأصناف يتطلب أيضاً صلاحية "تعديل الأصناف" في صلاحيات الملفات
      const items = await authorizeFile(request, "items", "update")
      if (!items.ok) return items.response
      const result = await applyBulkItems({ filters: body.filters || {}, productIds: body.product_ids || [], changes: body.changes || {}, price: body.price || null })
      return NextResponse.json(result)
    }
    const auth = await authorizeTransaction(request, "bulk_items", "view", "")
    if (!auth.ok) return auth.response
    return NextResponse.json(await previewBulkItems(body.filters || {}, Number(body.price_category_id) || null))
  } catch (error: any) {
    const message = error?.message || "تعذر تعديل الأصناف"
    const known = /غير صالحة|اختر|حدد|لا توجد|غير مسموح|يجب|الحساب/.test(message)
    if (!known) console.error("[tools/bulk-items] POST", error)
    return NextResponse.json({ error: message }, { status: known ? 400 : 500 })
  }
}
