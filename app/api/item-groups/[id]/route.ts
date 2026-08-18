import { type NextRequest, NextResponse } from "next/server"
import { generateItemGroupNumber } from "@/lib/number-generator"
import sql from "@/lib/database"

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
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف المجموعة غير صالح" }, { status: 400 })
    }

    const rows: ItemGroupDB[] = await sql`
      SELECT id, group_code, group_name, description, parent_id, status, created_at, updated_at
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
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
    await sql`ALTER TABLE item_groups ALTER COLUMN group_code TYPE VARCHAR(10)`
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
    const parentId = data.parent_id ? Number(data.parent_id) : null
    if (parentId === id) return NextResponse.json({ error: "لا يمكن أن تكون المجموعة أباً لنفسها" }, { status: 400 })
    if (parentId) {
      const invalidParent = await sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM item_groups WHERE parent_id = ${id} AND status <> 3
          UNION ALL
          SELECT child.id FROM item_groups child JOIN descendants d ON child.parent_id = d.id WHERE child.status <> 3
        ) SELECT id FROM descendants WHERE id = ${parentId} LIMIT 1
      `
      if (invalidParent.length) return NextResponse.json({ error: "لا يمكن اختيار مجموعة فرعية كمجموعة أب" }, { status: 400 })
      const parent = await sql`SELECT id FROM item_groups WHERE id = ${parentId} AND status <> 3 LIMIT 1`
      if (!parent.length) return NextResponse.json({ error: "المجموعة الأب غير صالحة" }, { status: 400 })
    }

    const rows: ItemGroupDB[] = await sql`
      UPDATE item_groups
      SET group_code = ${groupCode}, group_name = ${data.group_name}, description = ${data.description || ""}, parent_id = ${parentId}, status = ${statusValue}
      WHERE id = ${id}
      RETURNING id, group_code, group_name, description, parent_id, status, created_at, updated_at
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
    await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS parent_id INTEGER`
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

    const childGroup = await sql`SELECT id FROM item_groups WHERE parent_id = ${id} AND status <> 3 LIMIT 1`
    if (childGroup.length > 0) {
      return NextResponse.json({ error: "لا يمكن حذف مجموعة مرتبطة بمجموعات فرعية" }, { status: 409 })
    }

    // منع حذف مجموعة صنف مرتبطة بأصناف فعلية — عمود products.group_id قد لا يكون موجوداً في كل
    // قاعدة بيانات (لم يُضَف بعد لهذه الشركة)، فيُتحقَّق من وجوده أولاً عبر information_schema بدل
    // افتراض وجوده دوماً، تجنباً لخطأ "column does not exist" في الشركات التي لم تُنشئه بعد.
    const hasGroupIdColumn = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'group_id'
      ) AS has_column
    `
    if (hasGroupIdColumn[0]?.has_column) {
      const linkedProducts = await sql`
        SELECT id FROM products WHERE group_id = ${id} LIMIT 1
      `
      if (linkedProducts.length > 0) {
        return NextResponse.json(
          { error: "يوجد اصناف مرتبطة مع مجموعة الصنف المختارة لا يمكن الحذف" },
          { status: 409 }
        )
      }
    }

    await sql`UPDATE item_groups SET status = 3 WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error deleting item group:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

