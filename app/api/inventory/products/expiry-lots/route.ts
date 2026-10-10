import { type NextRequest, NextResponse } from "next/server"
import { lotBalances } from "@/lib/stock-lots"

// دفعات الصنف المتاحة (رقم تشغيلي/تاريخ صلاحية + الكمية المتاحة)، مُشتقّة من voucher_items_tbl
// نفسها — لا يوجد في هذه القاعدة جدول دفعات مخزون مستقل (product_lots في lib/lot-management.ts
// غير موجود فعلياً؛ stock_batch الموجود لا يحمل عمود تاريخ صلاحية إطلاقاً)، فيُحسَب "المتاح" هنا
// كمجموع الكمية الداخلة من سندات ادخال بضاعة (vch_type=STOCK_IN_VCH_TYPE) لكل مجموعة (رقم تشغيلي/تاريخ صلاحية)
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

    // الدفعات المتاحة (محفوظ + مرحّل) من دفتر الدفعات الموحَّد lib/stock-lots.ts — الاستعلام السابق كان
    // يقرأ أعمدة غير موجودة بـvoucher_items_tbl (product_id/quantity/unit/warehouse_id) فيفشل دائماً.
    const lots = await lotBalances({ warehouseId, productIds: [productId], mode: "active" })
    const byLot = new Map<string, { lot_number: string; expiry_date: string | null; quantity: number }>()
    for (const lot of lots) {
      if (!lot.expiry_date && !lot.batch_no) continue
      const key = `${lot.batch_no.toUpperCase()}|${lot.expiry_date ?? ""}`
      const current = byLot.get(key) || { lot_number: lot.batch_no, expiry_date: lot.expiry_date, quantity: 0 }
      current.quantity += lot.quantity
      byLot.set(key, current)
    }
    const available = [...byLot.values()]
      .filter((lot) => lot.quantity > 1e-6)
      .sort((x, y) => String(x.expiry_date ?? "9999").localeCompare(String(y.expiry_date ?? "9999")))
      .map((lot) => ({ lot_number: lot.lot_number, expiry_date: lot.expiry_date, available_quantity: lot.quantity / toMainQty, unit_cost: 0 }))

    return NextResponse.json(available)
  } catch (error) {
    console.error("Error fetching product expiry lots:", error)
    return NextResponse.json({ error: "فشل جلب دفعات الصنف" }, { status: 500 })
  }
}
