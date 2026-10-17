import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { sanitizeShortcuts } from "@/lib/page-shortcuts"

// اختصارات فتح الصفحات الخاصة بالمستخدم الحالي (شاشة "اختصارات الصفحات") — المستخدم من الجلسة فقط،
// فلا يستطيع أحد قراءة أو تعديل اختصارات مستخدم آخر.
let columnEnsured: Promise<void> | null = null
const ensureColumn = () => {
  if (!columnEnsured) {
    // sql`` من lib/database.ts قابل للانتظار (await) فقط — .then() عليه مباشرة لا يُرجع Promise
    columnEnsured = (async () => {
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS page_shortcuts JSONB NOT NULL DEFAULT '{}'::jsonb`
    })().catch((error: unknown) => { columnEnsured = null; throw error })
  }
  return columnEnsured
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureColumn()
    const [row] = await sql`SELECT page_shortcuts FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`
    return NextResponse.json({ shortcuts: sanitizeShortcuts(row?.page_shortcuts) })
  } catch (error) {
    console.error("[page-shortcuts] GET failed:", error)
    return NextResponse.json({ error: "تعذر تحميل الاختصارات" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureColumn()
    const body = await request.json().catch(() => null)
    const shortcuts = sanitizeShortcuts(body?.shortcuts)
    const result = await sql`
      UPDATE user_settings SET page_shortcuts = ${JSON.stringify(shortcuts)}::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${user.user_id}
      RETURNING page_shortcuts
    `
    if (!result.length) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 })
    return NextResponse.json({ shortcuts: sanitizeShortcuts(result[0].page_shortcuts) })
  } catch (error) {
    console.error("[page-shortcuts] PUT failed:", error)
    return NextResponse.json({ error: "تعذر حفظ الاختصارات" }, { status: 500 })
  }
}
