import { type NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "../../../lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

function getDatabaseErrorResponse() {
  return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })
}

async function ensurePriceCategorySchema() { return runSchemaOnce("app/api/pricecategory/route.ts#ensurePriceCategorySchema", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS pricecategory (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      name_en VARCHAR(50),
      description TEXT,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
  await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS name_en VARCHAR(50)`
  await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`
    DO $$
    BEGIN
      ALTER TABLE pricecategory
        ADD CONSTRAINT pricecategory_status_check CHECK (status IN (1, 2, 3));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$;
  `

  await sql`UPDATE pricecategory SET status = 1 WHERE status IS NULL`
}) }

// ✅ Named export for GET
export async function GET() {
  if (!sql) return getDatabaseErrorResponse()
  try {
    await ensurePriceCategorySchema()
    const prices = await sql`
      SELECT 
        id,
        name,
        name_en,
        description,
        COALESCE(status, 1) AS status,
        created_at,
        updated_at
      FROM pricecategory
      WHERE COALESCE(status, 1) != 3
      ORDER BY id
    `

    return NextResponse.json(prices)
  } catch (error) {
    console.error("Error fetching price categories:", error)
    return NextResponse.json({ error: "Failed to fetch price categories" }, { status: 500 })
  }
}

async function findReusableCategory(name: string, nameEn: string) {
  const normalizedName = name.toLowerCase()
  const normalizedNameEn = nameEn.toLowerCase()
  const rows = await sql`
    SELECT id, name, name_en, description, status, created_at, updated_at
    FROM pricecategory
    WHERE COALESCE(status, 1) <> 3
      AND (
        LOWER(TRIM(name)) = ${normalizedName}
        OR LOWER(TRIM(name_en)) = ${normalizedName}
        OR id::text = ${name}
        OR (${normalizedNameEn} <> '' AND LOWER(TRIM(name_en)) = ${normalizedNameEn})
      )
    ORDER BY CASE
      WHEN LOWER(TRIM(name)) = ${normalizedName} THEN 0
      WHEN LOWER(TRIM(name_en)) = ${normalizedName} THEN 1
      WHEN id::text = ${name} THEN 2
      ELSE 3
    END, id
    LIMIT 1
  `
  return rows[0]
}

async function hasDeletedCategoryName(name: string) {
  const rows = await sql`
    SELECT id FROM pricecategory
    WHERE status = 3 AND LOWER(TRIM(name)) = ${name.toLowerCase()}
    LIMIT 1
  `
  return rows.length > 0
}

function deletedCategoryResponse() {
  return NextResponse.json({ error: "توجد فئة أسعار محذوفة بهذا الاسم؛ استعد الفئة أو استخدم اسماً آخر" }, { status: 409 })
}

export async function POST(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  let reuseExisting = false
  let name = ""
  let nameEn = ""
  try {
    const data = await request.json()
    reuseExisting = data.reuse_existing === true
    name = String(data.name ?? "").trim()
    nameEn = String(data.name_en ?? "").trim() || name

    if (!name) {
      return NextResponse.json({ error: "اسم الفئة مطلوب" }, { status: 400 })
    }

    const status = Number(data.status)
    const normalizedStatus = status === 2 ? 2 : status === 3 ? 3 : 1

    const createCategory = async () => {
      if (reuseExisting) {
        // Names are not uniquely constrained in every company database.
        await sql`SELECT pg_advisory_xact_lock(hashtext('pricecategory:excel-import'))`
      }
      // Import can create categories even before the category screen has loaded.
      await ensurePriceCategorySchema()
      if (reuseExisting) {
        const existing = await findReusableCategory(name, nameEn)
        if (existing) return NextResponse.json(existing)
        if (await hasDeletedCategoryName(name)) return deletedCategoryResponse()
      } else {
        const existing = await sql`SELECT id FROM pricecategory WHERE name = ${name}`
        if (existing.length > 0) {
          return NextResponse.json({ error: "اسم الفئة موجود مسبقاً" }, { status: 400 })
        }
      }

      const result = await sql`
        INSERT INTO pricecategory (
          name, name_en, description, status
        ) VALUES (
          ${name}, ${nameEn}, ${data.description || ""}, ${normalizedStatus}
        ) RETURNING id, name, name_en, description, status, created_at, updated_at
      `
      return NextResponse.json(result[0], { status: 201 })
    }

    return reuseExisting ? await withTenantTransaction(createCategory) : await createCategory()
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
    const message = error instanceof Error ? error.message : String(error)
    if (reuseExisting && (code === "23505" || /duplicate|23505|unique/i.test(message))) {
      // The transaction has rolled back, so another writer's row is now visible.
      const existing = await findReusableCategory(name, nameEn)
      if (existing) return NextResponse.json(existing)
      if (await hasDeletedCategoryName(name)) return deletedCategoryResponse()
    }
    console.error("Error creating price category:", error)
    return NextResponse.json({ error: "Failed to create price category" }, { status: 500 })
  }
}
