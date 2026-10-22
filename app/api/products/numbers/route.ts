import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeProductLookupScope } from "@/app/api/inventory/products/_permissions"

// أرقام الأصناف الإضافية لبحث الأصناف (فلتر "نوع الرقم"): product_numbers.type 1 = الرقم الأصلي، 2 = رقم المصنع.
// يعيد { numbers: { [product_id]: "رقم1، رقم2" } } لكل الأصناف المسموح الاطلاع عليها.
export async function GET(request: NextRequest) {
  try {
    const scope = await authorizeProductLookupScope(request)
    if (!scope.ok) return scope.response
    const type = Number(request.nextUrl.searchParams.get("type"))
    if (type !== 1 && type !== 2) return NextResponse.json({ error: "نوع الرقم غير صالح" }, { status: 400 })
    if ((await sql`SELECT to_regclass('product_numbers') IS NOT NULL AS ok`)[0]?.ok !== true) return NextResponse.json({ numbers: {} })
    const rows = await sql`
      SELECT n.product_id, STRING_AGG(DISTINCT BTRIM(n.number), '، ') AS numbers
      FROM product_numbers n JOIN products p ON p.id = n.product_id
      WHERE n.type = ${type} AND BTRIM(COALESCE(n.number, '')) <> '' AND COALESCE(p.type, 1) = ANY(${scope.types}::int[])
      GROUP BY n.product_id
    ` as any[]
    return NextResponse.json({ numbers: Object.fromEntries(rows.map((row) => [Number(row.product_id), String(row.numbers || "")])) })
  } catch (error) {
    console.error("[products/numbers] failed", error)
    return NextResponse.json({ error: "تعذر تحميل أرقام الأصناف" }, { status: 500 })
  }
}
