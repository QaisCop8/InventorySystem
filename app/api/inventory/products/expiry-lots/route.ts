import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { STOCK_IN_VCH_TYPE, STOCK_VOUCHER_TYPES } from "../../../stock-vouchers/_lib"

// دفعات الصنف المتاحة (رقم تشغيلي/تاريخ صلاحية + الكمية المتاحة)، مُشتقّة من voucher_items_tbl
// نفسها — لا يوجد في هذه القاعدة جدول دفعات مخزون مستقل (product_lots في lib/lot-management.ts
// غير موجود فعلياً؛ stock_batch الموجود لا يحمل عمود تاريخ صلاحية إطلاقاً)، فيُحسَب "المتاح" هنا
// كمجموع الكمية الداخلة من سندات ادخال بضاعة (vch_type=12) لكل مجموعة (رقم تشغيلي/تاريخ صلاحية)
// ناقص الكمية الخارجة من سندات اخراج بضاعة/استعمال/ارسالية داخلية لنفس المجموعة — حدّها الوحيد:
// تُغطّي فقط ما يمر عبر سندات الحركة الأربعة نفسها (لا فواتير المبيعات مثلاً، نظام منفصل خارج نطاق
// هذه الميزة). تُستخدَم عند إدخال الكمية في سندات اخراج/استعمال/ارسالية داخلية لصنف له تتبع
// صلاحية/دفعة، لاختيار الدفعة(دفعات) التي تُستهلك منها الكمية المُدخَلة.
//
// يُحتسَب السندان المسودة (status=1) والمُرحَّل (status=2) معاً على طرفَي المعادلة (دخول وخروج)
// بطلب صريح من المستخدم — بضاعة أُدخِلت للتو في سند لم يُرحَّل بعد يجب أن تظهر متاحة فوراً للاختيار
// في سند اخراج/استعمال يُنشَأ بعدها مباشرة، بدل انتظار الترحيل. status=3 (ملغى منطقياً) مُستبعَد دوماً.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = Number(searchParams.get("product_id"))
    if (!productId) {
      return NextResponse.json({ error: "product_id مطلوب" }, { status: 400 })
    }
    const warehouseId = Number(searchParams.get("warehouse_id"))
    if (!warehouseId) {
      return NextResponse.json({ error: "warehouse_id مطلوب" }, { status: 400 })
    }
    // العلاقة بالرئيسية لوحدة السطر الحالي في السند (اختيار الكمية جارٍ إدخالها بها) — تُستخدَم
    // لتحويل مجموع "المتاح" (المُحتسَب بوحدة كل حركة تاريخية على حِدة عبر product_units أدناه، ثم
    // مُوحَّداً بالوحدة الرئيسية) إلى نفس وحدة السطر الحالي عرضاً للمستخدم. القيمة الافتراضية 1
    // (الوحدة الرئيسية) عند غيابها.
    const toMainQtyParam = Number(searchParams.get("to_main_qnty"))
    const toMainQty = toMainQtyParam > 0 ? toMainQtyParam : 1

    const rows = await sql`
      SELECT
        vi.batch_number,
        vi.expiry_date,
        SUM(
          CASE WHEN vh.vch_type = ${STOCK_IN_VCH_TYPE} THEN vi.quantity * COALESCE(pu.to_main_qnty, 1)
          ELSE -(vi.quantity * COALESCE(pu.to_main_qnty, 1)) END
        ) AS available_quantity_main
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      LEFT JOIN units u ON u.unit_name = vi.unit
      LEFT JOIN product_units pu ON pu.product_id = vi.product_id AND pu.unit_id = u.id
      WHERE vi.product_id = ${productId}
        AND vi.warehouse_id = ${warehouseId}
        AND vh.status IN (1, 2)
        AND vh.vch_type = ANY(${STOCK_VOUCHER_TYPES as unknown as number[]}::int[])
        AND vi.expiry_date IS NOT NULL
      GROUP BY vi.batch_number, vi.expiry_date
      HAVING SUM(
        CASE WHEN vh.vch_type = ${STOCK_IN_VCH_TYPE} THEN vi.quantity * COALESCE(pu.to_main_qnty, 1)
        ELSE -(vi.quantity * COALESCE(pu.to_main_qnty, 1)) END
      ) > 0
      ORDER BY vi.expiry_date ASC
    `

    const available = (rows as any[]).map((row) => ({
      lot_number: row.batch_number || "",
      expiry_date: row.expiry_date || null,
      available_quantity: Number(row.available_quantity_main) / toMainQty,
      unit_cost: 0,
    }))

    return NextResponse.json(available)
  } catch (error) {
    console.error("Error fetching product expiry lots:", error)
    return NextResponse.json({ error: "فشل جلب دفعات الصنف" }, { status: 500 })
  }
}
