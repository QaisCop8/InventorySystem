import { type NextRequest, NextResponse } from "next/server"
import { generateItemGroupNumber } from "@/lib/number-generator"
import sql, { withTenantTransaction } from "@/lib/database"

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
      SELECT id FROM item_groups WHERE group_code = ${cleaned} AND (${currentId ?? 0} = 0 OR id <> ${currentId})
    `
    if (existing.length === 0) return cleaned
  }

  const generated = await generateItemGroupNumber()
  const normalized = normalizeGroupCode(generated)
  const existing: { id: number }[] = await query`
    SELECT id FROM item_groups WHERE group_code = ${normalized} AND (${currentId ?? 0} = 0 OR id <> ${currentId})
  `
  if (existing.length === 0) return normalized

  // Legacy codes can exceed ten characters and normalize to the same code.
  // Advance from the normalized maximum instead of regenerating it recursively.
  const prefix = normalized.replace(/\d/g, "")
  const width = Math.max(1, 10 - prefix.length)
  const codes: { group_code: string }[] = await query`
    SELECT group_code FROM item_groups WHERE group_code LIKE ${prefix + "%"}
  `
  const maximum = codes.reduce((max, row) => {
    const candidate = normalizeGroupCode(row.group_code)
    const digits = candidate.slice(prefix.length)
    return candidate.startsWith(prefix) && /^\d+$/.test(digits) ? Math.max(max, Number(digits)) : max
  }, Number(normalized.slice(prefix.length)) || 0)
  const next = String(maximum + 1)
  if (next.length > width) throw new Error("تعذر توليد رمز مجموعة أصناف فريد ضمن الحد المسموح")
  return `${prefix}${next.padStart(width, "0")}`
}

function isDuplicateInsertError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return true
  const message = error instanceof Error ? error.message : String(error)
  return /duplicate|23505|unique/i.test(message)
}

async function findReusableGroup(name: string, code: string): Promise<ItemGroupDB | undefined> {
  const normalizedName = name.toLowerCase()
  const normalizedCode = normalizeGroupCode(code)
  const rows: ItemGroupDB[] = await sql`
    SELECT id, group_code, group_name, description, parent_id, status, created_at, updated_at
    FROM item_groups
    WHERE COALESCE(status, 1) <> 3
      AND (
        (${normalizedName} <> '' AND LOWER(TRIM(group_name)) = ${normalizedName})
        OR (${name} <> '' AND LOWER(TRIM(group_code)) = ${normalizedName})
        OR (${name} <> '' AND id::text = ${name})
        OR (${normalizedCode} <> '' AND group_code = ${normalizedCode})
      )
    ORDER BY CASE
      WHEN LOWER(TRIM(group_name)) = ${normalizedName} THEN 0
      WHEN LOWER(TRIM(group_code)) = ${normalizedName} THEN 1
      WHEN id::text = ${name} THEN 2
      ELSE 3
    END, id
    LIMIT 1
  `
  return rows[0]
}

function formatGroup(group: ItemGroupDB): ItemGroup {
  return { ...group, status: toDisplayStatus(group.status), product_count: 0 }
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
    const data = await request.json()
    const reuseExisting = data.reuse_existing === true
    const groupName = String(data.group_name ?? "").trim()
    const requestedCode = String(data.group_code ?? "").trim()
    const statusValue = toDbStatus(data.status)
    const query = sql as any
    const parentId = data.parent_id ? Number(data.parent_id) : null

    const createGroup = async () => {
      if (reuseExisting) {
        // Serialize import lookups and code generation within this company database.
        await query`SELECT pg_advisory_xact_lock(hashtext('item_groups:excel-import'))`
        const existing = await findReusableGroup(groupName, requestedCode)
        if (existing) return NextResponse.json(formatGroup(existing))
      }

      if (!groupName) return NextResponse.json({ error: "اسم المجموعة مطلوب" }, { status: 400 })
      if (parentId) {
        const parent = await query`SELECT id FROM item_groups WHERE id = ${parentId} AND status <> 3 LIMIT 1`
        if (!parent.length) return NextResponse.json({ error: "المجموعة الأب غير صالحة" }, { status: 400 })
      }

      if (await isDuplicateGroupName(groupName)) {
        return NextResponse.json({ error: "اسم المجموعة مكرر لا يمكن الاستمرار" }, { status: 409 })
      }

      const groupCode = await ensureUniqueGroupCode(requestedCode)
      const result: ItemGroupDB[] = await query`
        INSERT INTO item_groups (
          group_code, group_name, description, parent_id, status
        ) VALUES (
          ${groupCode}, ${groupName}, ${data.description || ""}, ${parentId}, ${statusValue}
        ) RETURNING id, group_code, group_name, description, parent_id, status, created_at, updated_at
      `
      return NextResponse.json(formatGroup(result[0]), { status: 201 })
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return reuseExisting ? await withTenantTransaction(createGroup) : await createGroup()
      } catch (error: unknown) {
        if (isDuplicateInsertError(error)) {
          // Re-read after a rollback if another writer created this group first.
          if (reuseExisting) {
            const existing = await findReusableGroup(groupName, requestedCode)
            if (existing) return NextResponse.json(formatGroup(existing))
            const constraint = typeof error === "object" && error !== null && "constraint" in error ? String(error.constraint) : ""
            const message = error instanceof Error ? error.message : String(error)
            if (/group_name/i.test(constraint + " " + message)) {
              const deleted = await query`
                SELECT id FROM item_groups
                WHERE status = 3 AND LOWER(TRIM(group_name)) = ${groupName.toLowerCase()}
                LIMIT 1
              `
              if (deleted.length) {
                return NextResponse.json({ error: "توجد مجموعة أصناف محذوفة بهذا الاسم؛ استعد المجموعة أو استخدم اسماً آخر" }, { status: 409 })
              }
            }
          }
          if (attempt < 2) continue
        }
        throw error
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error creating item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
