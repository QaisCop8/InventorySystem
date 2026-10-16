import { NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"
import { authorizeStoredProduct } from "@/app/api/inventory/products/_permissions"

// تحديث أصناف موجودة من Excel (وضع "تحديث" في استيراد الأصناف) — تحديث جزئي آمن:
//  - الحقول النصية/التصنيف/المجموعة/المستودع الافتراضي: تُحدَّث فقط إن وُجدت قيمة في الملف (الفارغ يُبقي القديم)
//  - الوحدات: تُضاف الوحدات الجديدة فقط؛ لا تُحذف وحدة ولا يُغيَّر معامل تحويل وحدة قائمة (قد يكون عليها رصيد)
//  - الباركودات وأرقام المصنع/الأصلية: تُضاف الجديدة فقط
//  - أسعار البيع: تُحدَّث/تُضاف لكل (فئة سعر، وحدة) وردت في الملف
//  - لا يُمسّ: سعر الشراء، الكمية (لا سند إدخال بضاعة)، تتبّع الصلاحية/التشغيلي/المتسلسل
class UpdateError extends Error {}

const text = (value: unknown) => String(value ?? "").trim()
const positive = (value: unknown) => { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null }

export async function POST(request: NextRequest) {
  let client: any
  try {
    const data = await request.json().catch(() => ({}))
    const code = text(data.product_code)
    if (!code) return NextResponse.json({ error: "رقم الصنف مطلوب" }, { status: 400 })
    const pool = await getTenantPool()
    const found = await pool.query(`SELECT id, type FROM products WHERE product_code = $1 AND COALESCE(status, 1) <> 3 LIMIT 1`, [code])
    const product = found.rows[0]
    if (!product) return NextResponse.json({ error: `الصنف ${code} غير موجود` }, { status: 404 })
    const productId = Number(product.id)
    const permission = await authorizeStoredProduct(request, productId, "update")
    if (!permission.ok) return permission.response

    client = await pool.connect()
    await client.query("BEGIN")
    await client.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [productId])

    await client.query(
      `UPDATE products SET
         product_name = COALESCE(NULLIF($2, ''), product_name),
         product_name_en = COALESCE(NULLIF($3, ''), product_name_en),
         description = COALESCE(NULLIF($4, ''), description),
         category_id = COALESCE($5::int, category_id),
         main_stock_id = COALESCE($6::int, main_stock_id),
         default_store = COALESCE($7::int, default_store),
         notes = COALESCE(NULLIF($8, ''), notes)
       WHERE id = $1`,
      [productId, text(data.product_name), text(data.product_name_en), text(data.description), positive(data.category_id), positive(data.main_stock_id), positive(data.default_store), text(data.notes)],
    )

    // الوحدات والباركودات
    const existingUnits = await client.query(`SELECT unit_id, to_main_qnty FROM product_units WHERE product_id = $1`, [productId])
    const unitIds = new Set<number>(existingUnits.rows.map((row: any) => Number(row.unit_id)))
    const mainUnit = existingUnits.rows.find((row: any) => Number(row.to_main_qnty) === 1)
    const units: any[] = Array.isArray(data.units) ? data.units : []
    let addedUnits = 0, addedBarcodes = 0
    for (const [index, unit] of units.entries()) {
      const unitId = positive(unit?.unit_id)
      if (!unitId) continue
      const isMain = unit?.is_main === true
      if (isMain && mainUnit && Number(mainUnit.unit_id) !== unitId && !unitIds.has(unitId)) {
        throw new UpdateError("لا يمكن تغيير الوحدة الرئيسية لصنف موجود — اترك عمود الوحدة الرئيسية فارغاً أو بنفس الوحدة")
      }
      if (!unitIds.has(unitId)) {
        const factor = isMain && !existingUnits.rows.length ? 1 : Number(unit?.to_main_qnty)
        if (!(factor > 0)) throw new UpdateError(`العلاقة بالوحدة الرئيسية مطلوبة للوحدة الجديدة ${index + 1}`)
        await client.query(`INSERT INTO product_units (product_id, unit_id, to_main_qnty) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [productId, unitId, factor])
        unitIds.add(unitId)
        addedUnits++
      }
      for (const barcode of (Array.isArray(unit?.barcode_list) ? unit.barcode_list : []).map(text).filter(Boolean)) {
        const used = await client.query(`SELECT p.product_code FROM product_unit_barcodes b JOIN products p ON p.id = b.product_id WHERE b.barcode = $1 AND b.product_id <> $2 LIMIT 1`, [barcode, productId])
        if (used.rows[0]) throw new UpdateError(`الباركود ${barcode} مستخدم للصنف ${used.rows[0].product_code}`)
        const inserted = await client.query(`INSERT INTO product_unit_barcodes (product_id, unit_id, barcode) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [productId, unitId, barcode])
        addedBarcodes += inserted.rowCount || 0
      }
    }

    // أسعار البيع
    let prices = 0
    for (const price of Array.isArray(data.prices) ? data.prices : []) {
      const categoryId = positive(price?.price_category_id), unitId = positive(price?.unit_id), value = Number(price?.price)
      if (!categoryId || !unitId || !(value >= 0)) continue
      if (!unitIds.has(unitId)) throw new UpdateError("سعر بيع لوحدة غير معرّفة على الصنف")
      await client.query(
        `INSERT INTO product_prices (product_id, price_category_id, unit_id, price, currency_id) VALUES ($1, $2, $3, $4, COALESCE($5, 1))
         ON CONFLICT (product_id, price_category_id, unit_id) DO UPDATE SET price = EXCLUDED.price`,
        [productId, categoryId, unitId, value, positive(price?.currency_id)],
      )
      prices++
    }

    // أرقام المصنع (2) والأرقام الأصلية (1): إضافة الجديد فقط
    for (const [type, list] of [[1, data.original_numbers], [2, data.factory_numbers]] as const) {
      for (const number of (Array.isArray(list) ? list : []).map(text).filter(Boolean)) {
        await client.query(
          `INSERT INTO product_numbers (product_id, type, number) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM product_numbers WHERE product_id = $1 AND type = $2 AND number = $3)`,
          [productId, type, number],
        )
      }
    }

    await client.query("COMMIT")
    return NextResponse.json({ success: true, id: productId, added_units: addedUnits, added_barcodes: addedBarcodes, prices })
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => undefined)
    if (error instanceof UpdateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[import] products-update failed", error)
    return NextResponse.json({ error: error?.message || "تعذر تحديث الصنف" }, { status: 500 })
  } finally {
    client?.release()
  }
}
