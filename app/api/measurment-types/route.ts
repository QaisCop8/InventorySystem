import { NextResponse } from "next/server"
import sql from "@/lib/database"

// جدول "أنواع القياس" (نوع القياس بتبويب القياسات في نموذج الصنف) — عشرة أنواع ثابتة (عادي، مساحة،
// حجم، وزن، بروفايل، محيط...) تُنشَأ وتُملأ هنا تلقائياً عند أول استدعاء إن لم يكن الجدول موجوداً/
// فارغاً بعد، بنفس نمط إنشاء/تعبئة units في app/api/units/route.ts.
async function ensureMeasurmentTypesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS measurment_types_tbl (
      id INTEGER PRIMARY KEY,
      code INTEGER,
      status INTEGER DEFAULT 1,
      name VARCHAR(100) NOT NULL
    )
  `

  const existing = await sql`SELECT COUNT(*) AS count FROM measurment_types_tbl`
  if (Number(existing[0]?.count || 0) === 0) {
    await sql`
      INSERT INTO measurment_types_tbl (id, code, status, name) VALUES
        (1, 1, 1, 'عادي'),
        (2, 2, 1, 'مساحة م2'),
        (3, 3, 1, 'حجم م3'),
        (4, 4, 1, 'وزن كغم'),
        (5, 5, 1, 'بروفايل'),
        (6, 6, 1, 'محيط'),
        (7, 7, 1, 'عدد فقط'),
        (8, 8, 1, 'مساحة + ارتفاع'),
        (9, 9, 1, 'اعمال زجاج'),
        (10, 10, 1, 'بروفايل متر')
      ON CONFLICT (id) DO NOTHING
    `
  }
}

export async function GET() {
  try {
    await ensureMeasurmentTypesTable()
    const rows = await sql`SELECT id, name FROM measurment_types_tbl WHERE status != 3 ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching measurment types:", error)
    return NextResponse.json({ error: "فشل جلب أنواع القياس" }, { status: 500 })
  }
}
