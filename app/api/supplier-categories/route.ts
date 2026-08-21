// app/api/customer-categories/route.ts
import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureSupplierCategoriesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS supplier_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      paymentterms VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS paymentterms VARCHAR(200) NOT NULL DEFAULT ''`
  await sql`ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`CREATE SEQUENCE IF NOT EXISTS supplier_categories_id_seq`
  await sql`ALTER SEQUENCE supplier_categories_id_seq OWNED BY supplier_categories.id`
  await sql`ALTER TABLE supplier_categories ALTER COLUMN id SET DEFAULT nextval('supplier_categories_id_seq')`
  await sql`SELECT setval('supplier_categories_id_seq', COALESCE((SELECT MAX(id) FROM supplier_categories), 1), COALESCE((SELECT MAX(id) FROM supplier_categories), 0) > 0)`
}

// GET all customer categories
export async function GET() {
  try {
    await ensureSupplierCategoriesTable()
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
    await ensureSupplierCategoriesTable()
    const body = await request.json()
    const { name, paymentTerms, paymentterms } = body

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO supplier_categories (name, paymentterms)
      VALUES (${name}, ${paymentTerms ?? paymentterms ?? ""})
      RETURNING *
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating supplier category:", error)
    return NextResponse.json({ error: error?.message || "Failed to create supplier category" }, { status: 500 })
  }
}

// PUT to update an existing category
export async function PUT(request: NextRequest) {
  try {
    await ensureSupplierCategoriesTable()
    const { id, name, paymentTerms, paymentterms } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    }

    const updated = await sql`
      UPDATE supplier_categories
      SET
        name = COALESCE(${name}, name),
        paymentterms = COALESCE(${paymentTerms ?? paymentterms}, paymentterms),
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
