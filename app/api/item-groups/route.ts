import { type NextRequest, NextResponse } from "next/server"
import { generateItemGroupNumber } from "@/lib/number-generator"
import sql from "@/lib/database"

// ----------------- Types -----------------
interface ItemGroupDB {
  id: number
  group_code: string
  group_name: string
  description: string | null
  parent_id: number | null
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
  parent_id: number | null
  status: "نشط" | "غير نشط"
  product_count: number
  created_at: string
  updated_at: string
}

// ----------------- DB Client -----------------


// ----------------- API Handlers -----------------
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase()
    const query = sql as any

    if (code) {
      const normalizedCode = normalizeGroupCode(code)
      const rows: ItemGroupDB[] = await query`
        SELECT 
          id,
          group_code,
          group_name,
          description,
          parent_id,
          status,
          created_at,
          updated_at
        FROM item_groups
        WHERE group_code = ${normalizedCode}
          AND status <> 3
        LIMIT 1
      `

      if (rows.length === 0) {
        return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 404 })
      }

      return NextResponse.json({
        ...rows[0],
        status: toDisplayStatus(rows[0].status),
        product_count: 0,
      })
    }

    const itemGroups: ItemGroupDB[] = await query`
      SELECT 
        id,
        group_code,
        group_name,
        description,
        parent_id,
        status,
        created_at,
        updated_at
      FROM item_groups
      WHERE status <> 3
      ORDER BY id 
    `

    const formattedGroups: ItemGroup[] = itemGroups.map((group) => ({
      ...group,
      status: toDisplayStatus(group.status),
      product_count: 0,
    }))

    return NextResponse.json(formattedGroups)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching item groups:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
  const prefix = letters.slice(0, 10)

  if (!digits) return prefix.slice(0, 10)

  const paddingLength = Math.max(1, 10 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 10)
}

async function isDuplicateGroupName(name?: string, currentId?: number): Promise<boolean> {
  if (!sql) throw new Error("Database not initialized")

  const query = sql as any
  const cleaned = String(name || "").trim().toLowerCase()
  if (!cleaned) return false

  const existing = await query`
    SELECT id
    FROM item_groups
    WHERE LOWER(TRIM(group_name)) = ${cleaned}
      AND status <> 3
      AND (${currentId ?? 0} = 0 OR id <> ${currentId})
    LIMIT 1
  `

  return existing.length > 0
}

async function ensureUniqueGroupCode(code?: string, currentId?: number): Promise<string> {
  if (!sql) throw new Error("Database not initialized")

  const query = sql as any
  const cleaned = normalizeGroupCode(code)
  if (cleaned) {
    const existing: { id: number }[] = await query`
      SELECT id FROM item_groups WHERE group_code = ${cleaned} AND status <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId})
    `
    if (existing.length === 0) return cleaned
  }

  const generated = await generateItemGroupNumber()
  const normalized = normalizeGroupCode(generated)
  const existing: { id: number }[] = await query`
    SELECT id FROM item_groups WHERE group_code = ${normalized} AND status <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId})
  `
  if (existing.length === 0) return normalized

  return ensureUniqueGroupCode(normalized, currentId)
}

function isDuplicateInsertError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("duplicate") || message.includes("23505") || message.includes("unique")
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
    await sql`ALTER TABLE item_groups ALTER COLUMN group_code TYPE VARCHAR(10)`
    const data = await request.json()
    const statusValue = toDbStatus(data.status)
    const query = sql as any
    const parentId = data.parent_id ? Number(data.parent_id) : null
    if (parentId) {
      const parent = await query`SELECT id FROM item_groups WHERE id = ${parentId} AND status <> 3 LIMIT 1`
      if (!parent.length) return NextResponse.json({ error: "المجموعة الأب غير صالحة" }, { status: 400 })
    }

    if (await isDuplicateGroupName(data.group_name)) {
      return NextResponse.json({ error: "اسم المجموعة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    let groupCode = await ensureUniqueGroupCode(data.group_code)
    let result: ItemGroupDB[] = []

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await query`
          INSERT INTO item_groups (
            group_code, group_name, description, parent_id, status
          ) VALUES (
            ${groupCode}, ${data.group_name}, ${data.description || ""}, ${parentId}, ${statusValue}
          ) RETURNING id, group_code, group_name, description, parent_id, status, created_at, updated_at
        `
        break
      } catch (error: unknown) {
        if (attempt < 2 && isDuplicateInsertError(error)) {
          groupCode = await ensureUniqueGroupCode("")
          continue
        }
        throw error
      }
    }

    const formattedResult: ItemGroup = {
      ...result[0],
      status: toDisplayStatus(result[0].status),
      product_count: 0,
    }

    return NextResponse.json(formattedResult, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error creating item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
