import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { generateItemGroupNumber } from "@/lib/number-generator"

interface ItemGroupDB {
  id: number
  group_code: string
  group_name: string
  description: string | null
  status: number | null
  product_count: number | null
  created_at: string
  updated_at: string
}

interface ItemGroup {
  id: number
  group_code: string
  group_name: string
  description: string | null
  status: "نشط" | "غير نشط"
  product_count: number
  created_at: string
  updated_at: string
}

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL
    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            ""
          )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      sql = neon(dbUrl)
    }
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

function toDisplayStatus(status: number | null | undefined): "نشط" | "غير نشط" {
  return status === 2 ? "غير نشط" : "نشط"
}

function toDbStatus(status: string | undefined): number {
  return status === "غير نشط" ? 2 : 1
}

function normalizeGroupCode(code?: string): string {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = letters.slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
}

function toItemGroup(group: ItemGroupDB): ItemGroup {
  return {
    ...group,
    status: toDisplayStatus(group.status),
    product_count: group.product_count ?? 0,
  }
}

async function isDuplicateGroupName(name?: string, currentId?: number): Promise<boolean> {
  if (!sql) throw new Error("Database not initialized")

  const query = sql as any
  const cleaned = String(name || "").trim().toLowerCase()
  if (!cleaned) return false

  const existing = await query`
    SELECT id
    FROM item_groups
    WHERE LOWER(TRIM(group_name)) = ${cleaned}      AND status <> 3      AND (${currentId ?? 0} = 0 OR id <> ${currentId})
    LIMIT 1
  `

  return existing.length > 0
}

async function ensureUniqueGroupCode(code?: string, currentId?: number): Promise<string> {
  if (!sql) throw new Error("Database not initialized")

  const query = sql as any
  const cleaned = normalizeGroupCode(code)
  if (cleaned) {
    const existing = await query`SELECT id FROM item_groups WHERE group_code = ${cleaned} AND status <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId})`
    if (existing.length === 0) return cleaned
  }

  const generated = await generateItemGroupNumber()
  const normalized = normalizeGroupCode(generated)
  const existing = await query`SELECT id FROM item_groups WHERE group_code = ${normalized} AND status <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId})`
  if (existing.length === 0) return normalized

  return ensureUniqueGroupCode(normalized, currentId)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف المجموعة غير صالح" }, { status: 400 })
    }

    const rows: ItemGroupDB[] = await sql`
      SELECT id, group_code, group_name, description, status, created_at, updated_at
      FROM item_groups
      WHERE id = ${id}
        AND status <> 3
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(toItemGroup(rows[0]))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    const id = Number(params.id)
    const data = await request.json()

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف المجموعة غير صالح" }, { status: 400 })
    }

    if (await isDuplicateGroupName(data.group_name, id)) {
      return NextResponse.json({ error: "اسم المجموعة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const groupCode = await ensureUniqueGroupCode(data.group_code, id)
    const statusValue = toDbStatus(data.status)

    const rows: ItemGroupDB[] = await sql`
      UPDATE item_groups
      SET group_code = ${groupCode}, group_name = ${data.group_name}, description = ${data.description || ""}, status = ${statusValue}
      WHERE id = ${id}
      RETURNING id, group_code, group_name, description, status, created_at, updated_at
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(toItemGroup(rows[0]))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error updating item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف المجموعة غير صالح" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id, group_name, group_code
      FROM item_groups
      WHERE id = ${id}
      LIMIT 1
    `

    if (existing.length === 0) {
      return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 404 })
    }

    await sql`UPDATE item_groups SET status = 3 WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error deleting item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

