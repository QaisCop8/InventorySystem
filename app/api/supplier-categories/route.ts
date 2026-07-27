// app/api/customer-categories/route.ts
import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export default sql

// GET all customer categories
export async function GET() {
  try {
    const categories = await sql`SELECT * FROM supplier_categories ORDER BY id`
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching supplier categories:", error)
    return NextResponse.json({ error: "Failed to fetch supplier categories" }, { status: 500 })
  }
}

// POST a new customer category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, paymentTerms } = body

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    // Get last ID
    const lastIdRow = await sql`SELECT MAX(id) AS max_id FROM supplier_categories`
    const lastId = lastIdRow[0]?.max_id ?? 0
    const newId = lastId + 1

    const result = await sql`
      INSERT INTO supplier_categories (id, name, paymentTerms)
      VALUES (${newId}, ${name}, ${paymentTerms})
      RETURNING *
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error creating supplier category:", error)
    return NextResponse.json({ error: "Failed to create supplier category" }, { status: 500 })
  }
}

// PUT to update an existing category
export async function PUT(request: NextRequest) {
  try {
    const { id, name, paymentTerms } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    }

    const updated = await sql`
      UPDATE supplier_categories
      SET
        name = COALESCE(${name}, name),
        paymentTerms = COALESCE(${paymentTerms}, paymentTerms),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    return NextResponse.json({ category: updated[0] })
  } catch (error) {
    console.error("Error updating supplier category:", error)
    return NextResponse.json({ error: "Failed to update supplier category" }, { status: 500 })
  }
}
