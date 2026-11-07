import { type NextRequest, NextResponse } from "next/server"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { authorizeFile } from "@/lib/file-permissions"
import { BulkComponentsError, saveBulkComponents, validateBulkComponents, type BulkComponentMode } from "@/lib/manufacturing-components-bulk"

// أدوات ⇐ استيراد مكونات التصنيع من Excel. POST {action: "validate"|"save", mode: "add"|"update", rows}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const mode: BulkComponentMode = body.mode === "update" ? "update" : "add"
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (body.action === "save") {
      const auth = await authorizeTransaction(request, "manufacturing_components_import", "update")
      if (!auth.ok) return auth.response
      // تعديل مكونات الأصناف يتطلب أيضاً صلاحية "تعديل الأصناف" في صلاحيات الملفات
      const items = await authorizeFile(request, "items", "update")
      if (!items.ok) return items.response
      if (!rows.length) return NextResponse.json({ error: "لا توجد أسطر محددة للحفظ" }, { status: 400 })
      return NextResponse.json(await saveBulkComponents(rows, mode))
    }
    const auth = await authorizeTransaction(request, "manufacturing_components_import", "access", "")
    if (!auth.ok) return auth.response
    return NextResponse.json({ rows: await validateBulkComponents(rows, mode) })
  } catch (error: any) {
    const known = error instanceof BulkComponentsError || /الوحدة المختارة/.test(error?.message || "")
    if (!known) console.error("[tools/manufacturing-components-import] POST", error)
    return NextResponse.json({ error: error?.message || "تعذر استيراد مكونات التصنيع" }, { status: known ? 400 : 500 })
  }
}
