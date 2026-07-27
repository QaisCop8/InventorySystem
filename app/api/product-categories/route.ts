import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// --- Database setup ---


// ❌ Remove this line:
// export default sql
// ✅ No default exports in App Router API routes!

// --- GET all customer categories ---
export async function GET() {
  try {
    const categories = await sql`SELECT * FROM product_categories ORDER BY id`
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching product categories:", error)
    return NextResponse.json({ error: "Failed to fetch product categories" }, { status: 500 })
  }
}

// --- POST a new category ---
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const lastIdRow = await sql`SELECT MAX(id) AS max_id FROM product_categories`
    const lastId = lastIdRow[0]?.max_id ?? 0
    const newId = lastId + 1

    const result = await sql`
      INSERT INTO product_categories (id, name)
      VALUES (${newId}, ${name})
      RETURNING *
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error creating product category:", error)
    return NextResponse.json({ error: "Failed to create product category" }, { status: 500 })
  }
}

// --- PUT to update existing category ---
export async function PUT(request: NextRequest) {
  try {
    const { id, name } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    }

    const updated = await sql`
      UPDATE product_categories
      SET
        name = COALESCE(${name}, name),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    return NextResponse.json({ category: updated[0] })
  } catch (error) {
    console.error("Error updating product category:", error)
    return NextResponse.json({ error: "Failed to update product category" }, { status: 500 })
  }
}
