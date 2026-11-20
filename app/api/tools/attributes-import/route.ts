import { type NextRequest, NextResponse } from "next/server"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { authorizeFile } from "@/lib/file-permissions"
import { AttributesImportError, saveAttributesImport, validateAttributesImport, type AttributesImportMode } from "@/lib/attributes-import"

// أدوات ⇐ استيراد المتغيرات والخصائص من اكسل. POST {action: "validate"|"save", mode: "merge"|"replace", rows}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const mode: AttributesImportMode = body.mode === "replace" ? "replace" : "merge"
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (body.action === "save") {
      const auth = await authorizeTransaction(request, "attributes_import", "update")
      if (!auth.ok) return auth.response
      // تعديل متغيرات الأصناف يتطلب أيضاً صلاحية "تعديل الأصناف" في صلاحيات الملفات
      const items = await authorizeFile(request, "items", "update")
      if (!items.ok) return items.response
      if (!rows.length) return NextResponse.json({ error: "لا توجد أسطر محددة للحفظ" }, { status: 400 })
      return NextResponse.json(await saveAttributesImport(rows, mode))
    }
    const auth = await authorizeTransaction(request, "attributes_import", "access", "")
    if (!auth.ok) return auth.response
    return NextResponse.json({ rows: await validateAttributesImport(rows, mode) })
  } catch (error: any) {
    const known = error instanceof AttributesImportError
    if (!known) console.error("[tools/attributes-import] POST", error)
    return NextResponse.json({ error: error?.message || "تعذر استيراد المتغيرات والخصائص" }, { status: known ? 400 : 500 })
  }
}
