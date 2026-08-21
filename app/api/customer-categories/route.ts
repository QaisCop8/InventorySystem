// app/api/customer-categories/route.ts
import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureCustomerCategoryStatus() {
  await sql`ALTER TABLE customer_categories ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
  await sql`ALTER TABLE customer_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
}

// GET all customer categories
export async function GET() {
  try {
    await ensureCustomerCategoryStatus()
    const categories = await sql`SELECT * FROM customer_categories ORDER BY id`
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching customer categories:", error)
    return NextResponse.json({ error: "Failed to fetch customer categories" }, { status: 500 })
  }
}

// POST a new customer category
export async function POST(request: NextRequest) {
  try {
    await ensureCustomerCategoryStatus()
    const body = await request.json()
    const { name, discount, status } = body

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    // Get last ID
    const lastIdRow = await sql`SELECT MAX(id) AS max_id FROM customer_categories`
    const lastId = lastIdRow[0]?.max_id ?? 0
    const newId = lastId + 1

    const result = await sql`
      INSERT INTO customer_categories (id, name, discount, status)
      VALUES (${newId}, ${name}, ${discount || 0}, ${status ?? 1})
      RETURNING *
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error creating customer category:", error)
    return NextResponse.json({ error: "Failed to create customer category" }, { status: 500 })
  }
}

// PUT to update an existing category
export async function PUT(request: NextRequest) {
  try {
    await ensureCustomerCategoryStatus()
    const { id, name, discount, status } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    }

    const updated = await sql`
      UPDATE customer_categories
      SET
        name = COALESCE(${name}, name),
        discount = COALESCE(${discount}, discount),
        status = COALESCE(${status}, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    return NextResponse.json({ category: updated[0] })
  } catch (error) {
    console.error("Error updating customer category:", error)
    return NextResponse.json({ error: "Failed to update customer category" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureCustomerCategoryStatus()
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    const deleted = await sql`UPDATE customer_categories SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`
    if (!deleted.length) return NextResponse.json({ error: "Category not found" }, { status: 404 })
    return NextResponse.json({ category: deleted[0] })
  } catch (error) {
    console.error("Error deleting customer category:", error)
    return NextResponse.json({ error: "Failed to delete customer category" }, { status: 500 })
  }
}
