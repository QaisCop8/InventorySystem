import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeRestaurant, errorStatus } from "@/lib/restaurant"

// صور الأصناف الظاهرة فقط في شاشة المطعم (دفعات حتى 60 صنفاً) — الكتالوج لا يحمل الصور
export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const auth = await authorizeRestaurant(request, [])
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => ({}))
    const ids = [...new Set((Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((id: number) => Number.isInteger(id) && id > 0))].slice(0, 60) as number[]
    if (!ids.length) return NextResponse.json({ images: {} })
    const rows = await sql`SELECT id, product_image FROM products WHERE id = ANY(${ids}::int[]) AND product_image IS NOT NULL AND product_image <> ''`
    const images: Record<number, string> = {}
    for (const row of rows as any[]) {
      const value = String(row.product_image)
      images[Number(row.id)] = /^(https?:|data:|\/)/i.test(value) ? value : `data:image/bmp;base64,${value}`
    }
    return NextResponse.json({ images }, { headers: { "Cache-Control": "private, max-age=300" } })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant product images", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الصور" }, { status: errorStatus(error) })
  }
}
