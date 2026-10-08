import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { availableSerials, checkVoucherSerials, serialTrackedIds } from "@/lib/item-serials"

// GET: الأرقام التسلسلية الموجودة حالياً في المخزون لصنف (ومستودع) — لاختيارها في سندات الخروج.
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = new URL(request.url).searchParams
    // ?tracked_ids=1,2,3 → أي هذه الأصناف لها رقم تسلسلي (لأسطر جاءت من نسخ/استيراد/سند مصدر)
    if (params.has("tracked_ids")) {
      const ids = String(params.get("tracked_ids") || "").split(",").map(Number).filter((id) => id > 0)
      return NextResponse.json([...(await serialTrackedIds(ids))])
    }
    const itemId = Number(params.get("item_id"))
    if (!(itemId > 0)) return NextResponse.json({ error: "الصنف مطلوب" }, { status: 400 })
    const rows = await availableSerials({
      itemId,
      storeId: Number(params.get("store_id")) || null,
      excludeVoucherId: Number(params.get("voucher_id")) || null,
      search: params.get("search") || "",
    })
    return NextResponse.json(rows)
  } catch (error: any) {
    console.error("Error loading item serials:", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل الأرقام التسلسلية" }, { status: 500 })
  }
}

// POST: فحص أرقام سند (أو سطر) قبل الحفظ — نفس قواعد الحفظ الفعلي، مع كل المشاكل لا أولها فقط.
export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const issues = await checkVoucherSerials({
      vchType: Number(data.vch_type),
      voucherId: Number(data.voucher_id) || null,
      items: Array.isArray(data.items) ? data.items : [],
      fromStoreId: Number(data.from_store_id) || null,
      toStoreId: Number(data.to_store_id) || null,
      enforceCount: data.enforce_count !== false,
    })
    return NextResponse.json({ issues })
  } catch (error: any) {
    console.error("Error checking item serials:", error)
    return NextResponse.json({ error: error?.message || "تعذر فحص الأرقام التسلسلية" }, { status: 500 })
  }
}
