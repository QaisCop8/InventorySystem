import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// إعادة احتساب أسعار مجموعة أصناف دفعة واحدة حسب "فئة سعر" مختارة — نظير جماعي لِمنطق
// /api/inventory/products/search (الذي يجلب سعر صنف واحد فقط حسب priceCategoryId)، مطابق لِـ
// getItemsPriceByCategory/urlPostGetCategoryItemPrice في StockInVoucher.js القديم.
//
// معرّفات سالبة خاصة (بدل صفوف جدول pricecategory الحقيقية) — نفس أسلوب القائمة القديمة
// (prices_class_list.splice سالبة الفهرس) لكن هنا مربوطة ببيانات فعلية بدل تصميم واجهة فقط:
//   -3 متوسط الأسعار: متوسط مرجّح بالكمية المتاحة من دفعات المخزون (product_lots.unit_cost)
//   -4 داخل أول خارج أول: تكلفة أقدم دفعة لا تزال متوفرة (نفس ترتيب FIFO في lib/lot-management.ts)
//   -5 اخر سعر: سعر آخر عملية شراء فعلية لهذا الصنف (purchase_order_items/purchase_orders)
// -1 (سعر الإنتاج) و-2 (يدوي) لا تصلان إلى هذا الـ endpoint إطلاقاً: الأولى لا يوجد لها مصدر بيانات
// في هذا النظام (لا BOM ولا عمود تكلفة تصنيع) فتبقى معطَّلة في القائمة، والثانية تُصفِّر السعر محلياً
// في الواجهة دون أي طلب شبكة.
//
// ملاحظة: القيم السالبة (-3/-4/-5) تُحسَب على مستوى الصنف فقط (بلا اعتبار للوحدة المختارة في السطر)
// لأن تكلفة الدفعة/الشراء تُسجَّل بوحدة الصنف الأساسية، خلافاً لفئات product_prices الحقيقية
// (فئة سعر موجبة) المُسعَّرة لكل وحدة على حدة.
export async function POST(request: NextRequest) {
  try {
    if (!sql) return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })

    const body = await request.json()
    const priceCategoryId = Number(body?.price_category_id)
    const items: { product_id: number; unit_name?: string }[] = Array.isArray(body?.items) ? body.items : []

    if (!priceCategoryId || items.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const productIds = [...new Set(items.map((i) => Number(i.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
    if (productIds.length === 0) {
      return NextResponse.json({ results: [] })
    }

    if (priceCategoryId === -3 || priceCategoryId === -4 || priceCategoryId === -5) {
      const priceByProduct = new Map<number, number>()

      if (priceCategoryId === -3) {
        const rows = await sql`
          SELECT product_id, SUM(unit_cost * available_quantity) / NULLIF(SUM(available_quantity), 0) AS avg_price
          FROM product_lots
          WHERE product_id = ANY(${productIds}) AND available_quantity > 0
          GROUP BY product_id
        `
        for (const row of rows as any[]) priceByProduct.set(Number(row.product_id), Number(row.avg_price || 0))
      } else if (priceCategoryId === -4) {
        const rows = await sql`
          SELECT DISTINCT ON (product_id) product_id, unit_cost
          FROM product_lots
          WHERE product_id = ANY(${productIds}) AND available_quantity > 0
          ORDER BY product_id, expiry_date ASC NULLS LAST, created_at ASC
        `
        for (const row of rows as any[]) priceByProduct.set(Number(row.product_id), Number(row.unit_cost || 0))
      } else {
        const rows = await sql`
          SELECT DISTINCT ON (poi.product_id) poi.product_id, poi.unit_price
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.purchase_order_id
          WHERE poi.product_id = ANY(${productIds})
          ORDER BY poi.product_id, po.order_date DESC, poi.id DESC
        `
        for (const row of rows as any[]) priceByProduct.set(Number(row.product_id), Number(row.unit_price || 0))
      }

      const results = items.map((item) => ({
        product_id: item.product_id,
        unit_name: item.unit_name || "",
        price: priceByProduct.get(Number(item.product_id)) ?? 0,
      }))
      return NextResponse.json({ results })
    }

    if (priceCategoryId < 0) {
      // -1 (سعر الإنتاج) أو أي معرّف خاص غير مدعوم — لا مصدر بيانات له، يُعاد صفر بدل خطأ.
      return NextResponse.json({ results: items.map((item) => ({ product_id: item.product_id, unit_name: item.unit_name || "", price: 0 })) })
    }

    const rows = await sql`
      SELECT pu.product_id, u.id AS unit_id, u.unit_name, COALESCE(pp.price, 0) AS price
      FROM product_units pu
      LEFT JOIN units u ON u.id = pu.unit_id
      LEFT JOIN product_prices pp
        ON pp.product_id = pu.product_id AND pp.unit_id = pu.unit_id AND pp.price_category_id = ${priceCategoryId}
      WHERE pu.product_id = ANY(${productIds})
      ORDER BY pu.id
    `

    const byProduct = new Map<number, { unit_name: string; price: number }[]>()
    for (const row of rows as any[]) {
      const list = byProduct.get(row.product_id) || []
      list.push({ unit_name: row.unit_name || "", price: Number(row.price || 0) })
      byProduct.set(row.product_id, list)
    }

    const results = items.map((item) => {
      const units = byProduct.get(Number(item.product_id)) || []
      const normalizedUnit = (item.unit_name || "").trim().toLowerCase()
      const match = normalizedUnit ? units.find((u) => u.unit_name.trim().toLowerCase() === normalizedUnit) : undefined
      const chosen = match || units[0]
      return { product_id: item.product_id, unit_name: item.unit_name || chosen?.unit_name || "", price: Number(chosen?.price || 0) }
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Error recalculating prices by category:", error)
    return NextResponse.json({ error: "Failed to recalculate prices" }, { status: 500 })
  }
}
