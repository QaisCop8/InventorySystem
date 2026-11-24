import { authorizeStoredProduct } from "@/app/api/inventory/products/_permissions"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"
import { ensureProductUnitRoleColumns } from "@/lib/product-unit-roles-schema"
import { withDerivedUnitPrices } from "@/lib/unit-prices"

// وحدات صنف واحد بمعرّفه — يستدعيه ProductSearchPopup (عند اختيار صنف بالنقر المزدوج/Enter) وشاشتا
// فاتورة/طلبية المبيعات، بنفس الشكل الذي يعيده /api/inventory/products/search لتوحيد التعامل مع
// الوحدات المتعددة (to_main_qnty) في كل الشاشات.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const permission = await authorizeStoredProduct(request, params.id, "lookup")
    if (!permission.ok) return permission.response
    const productId = Number(params.id)
    if (!productId) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const priceCategoryId = Number(searchParams.get("price_category_id") || 1)

    await ensureProductUnitRoleColumns()
    const client = await (await getTenantPool()).connect()
    try {
      const result = await client.query(
        `SELECT u.id AS unit_id, u.unit_name, pu.to_main_qnty, pu.is_stock_count_unit, pu.is_purchase_unit, pu.is_report_unit,
                pub.barcode AS primary_barcode, pub.barcode_list AS barcode, COALESCE(pub.barcodes, '[]'::json) AS barcodes,
                COALESCE(pp_selected.price, pp_fallback.price, 0) AS price
         FROM product_units pu
         LEFT JOIN units u ON pu.unit_id = u.id
         LEFT JOIN LATERAL (
           SELECT MIN(pub.barcode) AS barcode,
                  STRING_AGG(DISTINCT pub.barcode, ', ' ORDER BY pub.barcode) AS barcode_list,
                  JSON_AGG(DISTINCT pub.barcode) FILTER (WHERE COALESCE(pub.barcode, '') <> '') AS barcodes
           FROM product_unit_barcodes pub
           -- product_unit_barcodes.unit_id يحفظ معرّف سطر product_units (pu.id) لا معرّف الوحدة — كان الربط بـpu.unit_id
           -- فلا يُطابق أي باركود وتظهر "—" في لوحة وحدات بحث الأصناف
           WHERE pub.product_id = pu.product_id AND pub.unit_id = pu.id
         ) pub ON TRUE
         LEFT JOIN product_prices pp_selected
           ON pu.product_id = pp_selected.product_id
           AND pu.unit_id = pp_selected.unit_id
           AND pp_selected.price_category_id = $2
         LEFT JOIN product_prices pp_fallback
           ON pu.product_id = pp_fallback.product_id
           AND pu.unit_id = pp_fallback.unit_id
           AND pp_fallback.price_category_id = 1
         WHERE pu.product_id = $1
         ORDER BY pu.id ASC`,
        [productId, priceCategoryId],
      )
      // وحدة بلا سعر ⇐ سعر الوحدة الأولى × العلاقة بالرئيسية (lib/unit-prices.ts)
      let rows = result.rows.map((row: any) => ({ ...row, price: Number(row.price) || 0 }))
      // 2026-11-24: سعر محفوظ بلا وحدة مطابقة (unit_id فارغ/وحدة أخرى) كان يظهر 0 في الوحدات بينما بطاقة الصنف تعرضه —
      // نفس قاعدة first_price في قائمة الأصناف: أي سعر للصنف بالفئة يصبح سعر الوحدة الأولى ثم تُشتق الباقية
      if (rows.length && rows.every((row: any) => !row.price)) {
        const anyPrice = Number((await client.query(
          `SELECT price FROM product_prices WHERE product_id = $1 AND price_category_id IN ($2, 1) AND COALESCE(price, 0) <> 0
           ORDER BY (price_category_id = $2) DESC, id LIMIT 1`,
          [productId, priceCategoryId],
        ).catch(() => ({ rows: [] as any[] }))).rows[0]?.price || 0)
        if (anyPrice) rows = rows.map((row: any, index: number) => index === 0 ? { ...row, price: anyPrice } : row)
      }
      let units = withDerivedUnitPrices(rows, "price", "to_main_qnty")
      // numberType=factory|original (عمود الرقم في السند): أول رقم مصنع/أصلي للصنف بدل باركود كل وحدة
      const numberTypeParam = searchParams.get("numberType")
      const numberType = numberTypeParam === "factory" ? 2 : numberTypeParam === "original" ? 1 : 0
      if (numberType) {
        const number = String((await client.query(
          `SELECT TRIM(number) AS number FROM product_numbers WHERE product_id = $1 AND type = $2 AND TRIM(COALESCE(number, '')) <> '' ORDER BY id LIMIT 1`,
          [productId, numberType],
        ).catch(() => ({ rows: [] as any[] }))).rows[0]?.number || "")
        units = units.map((unit: any) => ({ ...unit, barcode: number, primary_barcode: number, barcodes: number ? [number] : [] }))
      }
      return NextResponse.json(units)
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error fetching product units:", error)
    return NextResponse.json({ error: "Failed to fetch product units" }, { status: 500 })
  }
}
