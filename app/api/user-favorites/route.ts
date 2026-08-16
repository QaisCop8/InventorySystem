import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureFavoritesTable() {
  await sql`CREATE TABLE IF NOT EXISTS user_favorites (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, favorite_type VARCHAR(50) NOT NULL, favorite_name VARCHAR(255) NOT NULL, favorite_title VARCHAR(255) NOT NULL, favorite_icon VARCHAR(50), favorite_component VARCHAR(100) NOT NULL, favorite_color VARCHAR(50), display_order INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, favorite_component))`
}

// دالة مساعدة للحصول على معرف المستخدم من الطلب
function getUserIdFromRequest(request: NextRequest): string | null {
  // محاولة الحصول على user_id من header
  const userId = request.headers.get("x-user-id")
  console.log("[v0] User ID from header:", userId)
  return userId
}

// GET - جلب المفضلة للمستخدم الحالي
export async function GET(request: NextRequest) {
  try {
    await ensureFavoritesTable()
    console.log("[v0] GET /api/user-favorites - Fetching favorites")
    const userId = getUserIdFromRequest(request)
    console.log("[v0] User ID:", userId)

    if (!userId) {
      console.log("[v0] Unauthorized - no user ID")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Querying database for user:", userId)
    const favorites = await sql`
      SELECT 
        id,
        favorite_type,
        favorite_name,
        favorite_title,
        favorite_icon,
        favorite_component,
        favorite_color,
        display_order,
        created_at
      FROM user_favorites
      WHERE user_id = ${userId}
      ORDER BY display_order ASC, created_at ASC
    `

    console.log("[v0] Fetched favorites count:", favorites.length)
    console.log("[v0] Favorites data:", favorites)
    return NextResponse.json({ favorites })
  } catch (error) {
    console.error("[v0] Error fetching user favorites:", error)
    return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 })
  }
}

// POST - إضافة مفضلة جديدة
export async function POST(request: NextRequest) {
  try {
    await ensureFavoritesTable()
    console.log("[v0] POST /api/user-favorites - Adding favorite")
    const userId = getUserIdFromRequest(request)
    console.log("[v0] User ID:", userId)

    if (!userId) {
      console.log("[v0] Unauthorized - no user ID")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    console.log("[v0] Request body:", body)
    const { favorite_type, favorite_name, favorite_title, favorite_icon, favorite_component, favorite_color } = body

    // التحقق من البيانات المطلوبة
    if (!favorite_type || !favorite_name || !favorite_title || !favorite_component) {
      console.log("[v0] Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // التحقق من عدم وجود المفضلة مسبقاً
    console.log("[v0] Checking for existing favorite...")
    const existing = await sql`
      SELECT id FROM user_favorites
      WHERE user_id = ${userId} AND favorite_component = ${favorite_component}
    `

    if (existing.length > 0) {
      console.log("[v0] Favorite already exists:", favorite_component)
      return NextResponse.json({ error: "هذا الاختصار موجود بالفعل في المفضلة" }, { status: 400 })
    }

    // الحصول على أعلى ترتيب حالي
    console.log("[v0] Getting max display order...")
    const maxOrderResult = await sql`
      SELECT COALESCE(MAX(display_order), 0) as max_order
      FROM user_favorites
      WHERE user_id = ${userId}
    `

    const newOrder = (maxOrderResult[0]?.max_order || 0) + 1
    console.log("[v0] New display order:", newOrder)

    // إضافة المفضلة
    console.log("[v0] Inserting new favorite...")
    const newFavorite = await sql`
      INSERT INTO user_favorites (
        user_id,
        favorite_type,
        favorite_name,
        favorite_title,
        favorite_icon,
        favorite_component,
        favorite_color,
        display_order
      ) VALUES (
        ${userId},
        ${favorite_type},
        ${favorite_name},
        ${favorite_title},
        ${favorite_icon || "Star"},
        ${favorite_component},
        ${favorite_color || "bg-gray-500"},
        ${newOrder}
      )
      RETURNING *
    `

    console.log("[v0] Successfully added favorite:", newFavorite[0])
    return NextResponse.json({ favorite: newFavorite[0] }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error adding favorite:", error)
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 })
  }
}

// DELETE - حذف مفضلة
export async function DELETE(request: NextRequest) {
  try {
    await ensureFavoritesTable()
    console.log("[v0] DELETE /api/user-favorites - Deleting favorite")
    const userId = getUserIdFromRequest(request)
    console.log("[v0] User ID:", userId)

    if (!userId) {
      console.log("[v0] Unauthorized - no user ID")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const favoriteId = searchParams.get("id")
    console.log("[v0] Favorite ID to delete:", favoriteId)

    if (!favoriteId) {
      console.log("[v0] Missing favorite ID")
      return NextResponse.json({ error: "Missing favorite ID" }, { status: 400 })
    }

    console.log("[v0] Deleting favorite from database...")
    await sql`
      DELETE FROM user_favorites
      WHERE id = ${favoriteId} AND user_id = ${userId}
    `

    console.log("[v0] Successfully deleted favorite")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting favorite:", error)
    return NextResponse.json({ error: "Failed to delete favorite" }, { status: 500 })
  }
}
