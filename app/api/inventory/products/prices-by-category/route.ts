import { authorizeStoredProduct } from "@/app/api/inventory/products/_permissions"
import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { withDerivedUnitPrices } from "@/lib/unit-prices"
import { getProductBalances } from "@/lib/item-inventory-reports"

// إعادة احتساب أسعار مجموعة أصناف دفعة واحدة حسب "فئة سعر" مختارة — نظير جماعي لِمنطق
// /api/inventory/products/search (الذي يجلب سعر صنف واحد فقط حسب priceCategoryId)، مطابق لِـ
// getItemsPriceByCategory/urlPostGetCategoryItemPrice في StockInVoucher.js القديم.
//
// معرّفات سالبة خاصة (بدل صفوف جدول pricecategory الحقيقية) — نفس أسلوب القائمة القديمة
// (prices_class_list.splice سالبة الفهرس) لكن هنا مربوطة ببيانات فعلية بدل تصميم واجهة فقط:
//   -3 متوسط الكلفة، -4 داخل أول خارج أول، -5 آخر سعر شراء — من محرك تقييم المخزون (getProductBalances)
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

    for (const productId of productIds) {
      const permission = await authorizeStoredProduct(request, productId, "lookup")
      if (!permission.ok) return permission.response
    }

    if (priceCategoryId === -3 || priceCategoryId === -4 || priceCategoryId === -5) {
      // كلفة الصنف من محرك تقييم المخزون نفسه (lib/item-inventory-reports getProductBalances — نفس «تقييم المخزون بتاريخ
      // معين» وقواعد الشامل): -3 متوسط الكلفة، -4 FIFO، -5 آخر سعر شراء (فاتورة/إرسالية مشتريات). كانت -5 تقرأ أوامر
      // الشراء و-3/-4 دفعات product_lots فتعود صفراً (2026-11-17). الكلفة للوحدة الرئيسية حتى تاريخ السند، ثم × علاقة وحدة السطر.
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || "")) ? String(body.date) : new Date().toISOString().slice(0, 10)
      const balances = await getProductBalances(0, date, 0, "", { productIds, includeUnposted: true })
      const costByProduct = new Map<number, number>((balances as any[]).map((row) => [Number(row.id), Number(
        priceCategoryId === -3 ? row.average_cost : priceCategoryId === -4 ? row.fifo_cost : row.last_incoming_cost) || 0]))
      const unitRows = await sql`
        SELECT pu.product_id, u.unit_name, COALESCE(NULLIF(pu.to_main_qnty, 0), 1)::float8 AS factor
        FROM product_units pu LEFT JOIN units u ON u.id = pu.unit_id
        WHERE pu.product_id = ANY(${productIds}) ORDER BY pu.id`
      const factorOf = (productId: number, unitName: string) => {
        const name = unitName.trim().toLowerCase()
        const row = (unitRows as any[]).find((unit) => Number(unit.product_id) === productId && String(unit.unit_name || "").trim().toLowerCase() === name)
        return Number(row?.factor) || 1
      }
      const round = (value: number) => Math.round(value * 1e6) / 1e6
      const results = items.map((item) => ({
        product_id: item.product_id,
        unit_name: item.unit_name || "",
        price: round((costByProduct.get(Number(item.product_id)) ?? 0) * factorOf(Number(item.product_id), item.unit_name || "")),
      }))
      return NextResponse.json({ results })
    }

    if (priceCategoryId < 0) {
      // -1 (سعر الإنتاج) أو أي معرّف خاص غير مدعوم — لا مصدر بيانات له، يُعاد صفر بدل خطأ.
      return NextResponse.json({ results: items.map((item) => ({ product_id: item.product_id, unit_name: item.unit_name || "", price: 0 })) })
    }

    const rows = await sql`
      SELECT pu.product_id, u.id AS unit_id, u.unit_name, pu.to_main_qnty, COALESCE(pp.price, 0) AS price
      FROM product_units pu
      LEFT JOIN units u ON u.id = pu.unit_id
      LEFT JOIN product_prices pp
        ON pp.product_id = pu.product_id AND pp.unit_id = pu.unit_id AND pp.price_category_id = ${priceCategoryId}
      WHERE pu.product_id = ANY(${productIds})
      ORDER BY pu.id
    `

    const byProduct = new Map<number, { unit_name: string; price: number; to_main_qnty: number }[]>()
    for (const row of rows as any[]) {
      const list = byProduct.get(row.product_id) || []
      list.push({ unit_name: row.unit_name || "", price: Number(row.price || 0), to_main_qnty: Number(row.to_main_qnty) || 1 })
      byProduct.set(row.product_id, list)
    }
    // وحدة بلا سعر في الفئة ⇐ سعر الوحدة الأولى × العلاقة بالرئيسية (lib/unit-prices.ts)
    for (const [productId, list] of byProduct) byProduct.set(productId, withDerivedUnitPrices(list, "price", "to_main_qnty"))

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
