import { NextResponse, type NextRequest } from "next/server"
import { authorizeRestaurant, errorStatus } from "@/lib/restaurant"
import { ackTickets, claimTickets } from "@/lib/restaurant-waiters"

// طابور المطبخ: جهاز بخدمة الطباعة المحلية (الكاشير) وشاشة المطعم مفتوحة يحجز قسائم فرعه المعلّقة ويطبعها.
//   POST {action:"claim", device}                         ⇐ يحجز حتى 10 قسائم (لا يطبعها جهازان)
//   POST {action:"ack", device, printed:[id], failed:[{id,error}]}
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRestaurant(request, [])
    if (!auth.ok) return auth.response
    const data = await request.json().catch(() => ({}))
    const device = String(data?.device || "").trim()
    if (!/^[\w-]{8,100}$/.test(device)) return NextResponse.json({ error: "معرّف الجهاز غير صالح" }, { status: 400 })
    if (data?.action === "claim") return NextResponse.json({ tickets: await claimTickets(auth.branchId, device) })
    if (data?.action === "ack") {
      const printed = (Array.isArray(data.printed) ? data.printed : []).map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
      const failed = (Array.isArray(data.failed) ? data.failed : []).filter((row: any) => Number.isInteger(Number(row?.id))).map((row: any) => ({ id: Number(row.id), error: String(row.error || "") }))
      await ackTickets(auth.branchId, device, printed, failed)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500) console.error("restaurant kitchen POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status })
  }
}
