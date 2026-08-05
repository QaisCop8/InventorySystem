import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { cookies } from "next/headers"

// دالة مساعدة للحصول على معرف المستخدم من الكوكيز
async function getUserIdFromCookies() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("user")
  if (userCookie) {
    try {
      const user = JSON.parse(userCookie.value)
      return user.id
    } catch {
      return null
    }
  }
  return null
}

// PUT - إعادة ترتيب المفضلة
export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookies()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { favorites } = body // مصفوفة من {id, display_order}

    if (!Array.isArray(favorites)) {
      return NextResponse.json({ error: "Invalid favorites array" }, { status: 400 })
    }

    // تحديث ترتيب كل مفضلة
    for (const favorite of favorites) {
      await sql`
        UPDATE user_favorites
        SET display_order = ${favorite.display_order}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${favorite.id} AND user_id = ${userId}
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error reordering favorites:", error)
    return NextResponse.json({ error: "Failed to reorder favorites" }, { status: 500 })
  }
}
