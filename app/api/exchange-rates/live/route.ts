import { NextResponse } from "next/server"
import sql from "@/lib/database"

// أسعار الصرف الحية لشاشة العملات (زر «جلب أسعار الصرف»): https://open.er-api.com/v6/latest/<عملة الأساس> تعيد كم وحدة من كل
// عملة تساوي وحدة واحدة من عملة الأساس، وسعر الصرف في النظام = كم وحدة من عملة الأساس تساوي وحدة من العملة ⇐ 1 / السعر.
// لا يُحفظ شيء هنا — الشاشة تعرض الأسعار للمراجعة ثم تحفظ المختار منها كسعر اليوم.
export async function GET() {
  try {
    const currencies = await sql`SELECT id, currency_code, currency_name FROM currency ORDER BY id`
    const base = String(currencies[0]?.currency_code || "").trim().toUpperCase()
    if (!base) return NextResponse.json({ error: "لا توجد عملة أساس معرّفة" }, { status: 400 })

    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.result !== "success" || !data?.rates) {
      return NextResponse.json({ error: data?.["error-type"] === "unsupported-code" ? `عملة الأساس ${base} غير مدعومة في خدمة الأسعار` : "تعذر جلب أسعار الصرف من الخدمة" }, { status: 502 })
    }

    const rates = currencies.slice(1).map((currency: any) => {
      const code = String(currency.currency_code || "").trim().toUpperCase()
      const perBase = Number(data.rates[code])
      return {
        currency_id: Number(currency.id),
        currency_code: code,
        currency_name: currency.currency_name,
        rate: perBase > 0 ? Number((1 / perBase).toFixed(6)) : null,
      }
    })
    return NextResponse.json({ base, updated_at: data.time_last_update_utc || null, rates })
  } catch (error) {
    console.error("[exchange-rates/live] failed:", error)
    return NextResponse.json({ error: "تعذر الاتصال بخدمة أسعار الصرف" }, { status: 502 })
  }
}
