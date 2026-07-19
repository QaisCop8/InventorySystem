import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { generateItemGroupNumber } from "@/lib/number-generator"

// ----------------- Types -----------------
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

// ----------------- DB Client -----------------
let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = (async (strings: TemplateStringsArray, ...values: any[]) => {
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
      }) as any
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export default sql

// ----------------- API Handlers -----------------
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
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
  const prefix = letters.slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
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
    const data = await request.json()
    const statusValue = toDbStatus(data.status)
    const query = sql as any

    if (await isDuplicateGroupName(data.group_name)) {
      return NextResponse.json({ error: "اسم المجموعة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    let groupCode = await ensureUniqueGroupCode(data.group_code)
    let result: ItemGroupDB[] = []

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await query`
          INSERT INTO item_groups (
            group_code, group_name, description, status
          ) VALUES (
            ${groupCode}, ${data.group_name}, ${data.description || ""}, ${statusValue}
          ) RETURNING id, group_code, group_name, description, status, created_at, updated_at
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
