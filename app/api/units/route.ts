import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

async function ensureUnitsTable() { return runSchemaOnce("app/api/units/route.ts#ensureUnitsTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      unit_code VARCHAR(10) UNIQUE NOT NULL,
      unit_name VARCHAR(50) NOT NULL,
      unit_name_en VARCHAR(50),
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  // Older company bootstrap databases do not have unit_code even though the
  // current API contract returns it. Set up both reads and direct POST imports.
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_code VARCHAR(10)`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_name_en VARCHAR(50)`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`
    UPDATE units
    SET unit_code = 'U' || LPAD(id::text, 9, '0')
    WHERE unit_code IS NULL OR TRIM(unit_code) = ''
  `
}) }

async function lockUnitCreation() {
  // Old company tables do not have a unique constraint on unit names. Serialize
  // lookup and creation on the same connection to keep concurrent imports safe.
  await sql`SELECT pg_advisory_xact_lock(hashtext('units:create'))`
}

export async function GET() {
  try {
    await ensureUnitsTable()
    await withTenantTransaction(async () => {
      await lockUnitCreation()
      const existingUnits = await sql`SELECT COUNT(*) as count FROM units`

      if (Number(existingUnits[0]?.count || 0) === 0) {
        const defaultUnits = [
          { code: "PCS", name: "قطعة", name_en: "Piece" },
          { code: "KG", name: "كيلو", name_en: "Kilogram" },
          { code: "G", name: "جرام", name_en: "Gram" },
          { code: "L", name: "لتر", name_en: "Liter" },
          { code: "M", name: "متر", name_en: "Meter" },
          { code: "BOX", name: "صندوق", name_en: "Box" },
          { code: "CTN", name: "كرتون", name_en: "Carton" },
          { code: "CAN", name: "علبة", name_en: "Can" },
          { code: "BTL", name: "زجاجة", name_en: "Bottle" },
          { code: "BAG", name: "كيس", name_en: "Bag" },
          { code: "PKT", name: "باكيت", name_en: "Packet" },
          { code: "SET", name: "طقم", name_en: "Set" },
          { code: "ROLL", name: "لفة", name_en: "Roll" },
          { code: "SHEET", name: "ورقة", name_en: "Sheet" },
          { code: "PAIR", name: "زوج", name_en: "Pair" },
        ]

        for (const unit of defaultUnits) {
          await sql`
            INSERT INTO units (unit_code, unit_name, unit_name_en, is_active, status)
            VALUES (${unit.code}, ${unit.name}, ${unit.name_en}, true, 1)
          `
        }
      }
    })

    const units = await sql`
      SELECT 
        id,
        unit_code,
        unit_name,
        unit_name_en,
        description,
        is_active,
        status,
        created_at,
        updated_at
      FROM units
      WHERE COALESCE(status, 1) != 3
      ORDER BY unit_name
    `

    return NextResponse.json(units)
  } catch (error) {
    console.error("Error fetching units:", error)
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 })
  }
}

function toText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

async function findImportUnit(identifiers: string[], unitId: number | null, explicitUnitId: number | null) {
  const primaryIdentifier = identifiers[0] || ""
  // Match the dialog's name, English name, code, then id priority when aliases
  // collide. A caller supplying an explicit id can request that exact record.
  const rows = await sql`
    SELECT * FROM units
    WHERE LOWER(TRIM(unit_name)) = ANY(${identifiers}::text[])
       OR LOWER(TRIM(unit_name_en)) = ANY(${identifiers}::text[])
       OR LOWER(TRIM(unit_code)) = ANY(${identifiers}::text[])
       OR id = ${unitId}
    ORDER BY CASE WHEN COALESCE(status, 1) = 3 THEN 1 ELSE 0 END,
             CASE
               WHEN id = ${explicitUnitId} THEN 0
               WHEN LOWER(TRIM(unit_name)) = ${primaryIdentifier} THEN 1
               WHEN LOWER(TRIM(unit_name_en)) = ${primaryIdentifier} THEN 2
               WHEN LOWER(TRIM(unit_code)) = ${primaryIdentifier} THEN 3
               WHEN id = ${unitId} THEN 4
               WHEN LOWER(TRIM(unit_name)) = ANY(${identifiers}::text[]) THEN 5
               WHEN LOWER(TRIM(unit_name_en)) = ANY(${identifiers}::text[]) THEN 6
               WHEN LOWER(TRIM(unit_code)) = ANY(${identifiers}::text[]) THEN 7
               ELSE 8
             END,
             id
    LIMIT 1
  `
  return rows[0]
}

function existingUnitResponse(unit: any, reuseExisting: boolean, unitName: string) {
  if (Number(unit.status) === 3) {
    return NextResponse.json(
      { error: `الوحدة "${unit.unit_name}" محذوفة؛ استعد الوحدة أو استخدم اسماً آخر` },
      { status: 409 },
    )
  }
  if (reuseExisting) return NextResponse.json(unit)
  const duplicateName = toText(unit.unit_name).toLowerCase() === unitName.toLowerCase()
  return NextResponse.json(
    { error: duplicateName ? "اسم الوحدة موجود مسبقاً" : "رمز الوحدة موجود مسبقاً" },
    { status: 400 },
  )
}

function isDuplicateInsertError(error: unknown) {
  return (error as { code?: string })?.code === "23505"
    || /duplicate|23505|unique constraint/i.test(error instanceof Error ? error.message : String(error))
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const reuseExisting = data.reuse_existing === true
    const unitName = toText(data.unit_name)
    const suppliedNameEn = toText(data.unit_name_en ?? data.unit_name_e)
    const unitNameEn = suppliedNameEn || unitName
    const requestedCode = toText(data.unit_code)
    const suppliedId = data.id ?? data.unit_id
    const rawId = suppliedId ?? (/^\d+$/.test(unitName) ? unitName : null)
    const unitId = rawId !== null && Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0
      ? Number(rawId)
      : null
    const explicitUnitId = suppliedId !== undefined && suppliedId !== null ? unitId : null
    const identifiers = [...new Set([unitName, suppliedNameEn, requestedCode].filter(Boolean).map((value) => value.toLowerCase()))]

    if (!unitName && (!reuseExisting || (!identifiers.length && !unitId))) {
      return NextResponse.json({ error: "اسم الوحدة مطلوب" }, { status: 400 })
    }

    await ensureUnitsTable()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await withTenantTransaction(async () => {
          await lockUnitCreation()
          const existingUnit = reuseExisting
            ? await findImportUnit(identifiers, unitId, explicitUnitId)
            : (await sql`
              SELECT * FROM units
              WHERE LOWER(TRIM(unit_name)) = LOWER(${unitName})
                 OR (${requestedCode} <> '' AND LOWER(TRIM(unit_code)) = LOWER(${requestedCode}))
              ORDER BY CASE WHEN COALESCE(status, 1) = 3 THEN 1 ELSE 0 END, id
              LIMIT 1
            `)[0]

          if (existingUnit) return existingUnitResponse(existingUnit, reuseExisting, unitName)
          if (!unitName) {
            return NextResponse.json({ error: "الوحدة غير موجودة؛ اسم الوحدة مطلوب لإنشائها" }, { status: 400 })
          }
          if (requestedCode.length > 10) {
            return NextResponse.json({ error: "رمز الوحدة يجب ألا يتجاوز 10 أحرف" }, { status: 400 })
          }

          // Reserve the SERIAL id instead of deriving a code from MAX(id), which
          // races with simultaneous requests. The code fits the oldest schema.
          let nextId: number
          let unitCode: string
          do {
            const ids = await sql`SELECT nextval(pg_get_serial_sequence('units', 'id')) AS id`
            nextId = Number(ids[0]?.id)
            if (!Number.isSafeInteger(nextId) || nextId <= 0) throw new Error("Failed to generate unit id")
            const idCode = nextId <= 999999999 ? String(nextId) : nextId.toString(36).toUpperCase()
            unitCode = requestedCode || `U${idCode.padStart(9, "0")}`
            const existingCode = await sql`
              SELECT id FROM units WHERE LOWER(TRIM(unit_code)) = LOWER(${unitCode}) LIMIT 1
            `
            if (!existingCode.length) break
            if (requestedCode) {
              return NextResponse.json({ error: "رمز الوحدة موجود مسبقاً" }, { status: 400 })
            }
          } while (true)

          const newStatus = Number(data.status ?? 1)
          const result = await sql`
            INSERT INTO units (
              id, unit_code, unit_name, unit_name_en, description, is_active, status
            ) VALUES (
              ${nextId}, ${unitCode}, ${unitName}, ${unitNameEn}, ${toText(data.description)}, ${newStatus === 1}, ${newStatus}
            ) RETURNING *
          `
          return NextResponse.json(result[0], { status: 201 })
        })
      } catch (error) {
        if (!isDuplicateInsertError(error)) throw error
        // Re-read after the transaction rolls back: another writer may have
        // inserted this unit while the import was resolving its references.
        if (reuseExisting) {
          const existing = await findImportUnit(identifiers, unitId, explicitUnitId)
          if (existing) return existingUnitResponse(existing, true, unitName)
        }
        if (attempt === 2 || requestedCode) {
          return NextResponse.json({ error: "اسم الوحدة أو رمزها موجود مسبقاً" }, { status: 409 })
        }
      }
    }
    return NextResponse.json({ error: "فشل إنشاء الوحدة" }, { status: 500 })
  } catch (error) {
    console.error("Error creating unit:", error)
    return NextResponse.json({ error: "Failed to create unit" }, { status: 500 })
  }
}
