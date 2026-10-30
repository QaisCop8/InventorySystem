import { NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { syncPermissionDefinitions } from "@/lib/permissions"
import { runSchemaOnce } from "@/lib/schema-once"

// تصحيحات أسماء محفوظة في بيانات الشركة — مرة واحدة لكل قاعدة (runSchemaOnce يسجلها كمطبّقة).
// 2026-10-30: نوع السند 20 "طلب صناعة داخلي" ⇐ "طلب بضاعة داخلي" (يظهر في لوحة التحكم والتقارير وقوائم السندات).
const renameLegacyNames = () => runSchemaOnce("app/api/settings/permissions/sync#renameLegacyNames", async () => {
  const ready = await sql`SELECT to_regclass('voucher_types_tbl') IS NOT NULL AS ok`
  if (!(ready as any[])[0]?.ok) return
  await sql`UPDATE voucher_types_tbl SET name = 'طلب بضاعة داخلي' WHERE id = 20 AND name = 'طلب صناعة داخلي'`
})

// يُستدعى مرة عند كل تحميل صفحة رئيسية (انظر نقطة الاستدعاء بـcomponents/auth/auth-context.tsx) —
// يزامن تعريفات الصلاحيات الجديدة من قاعدة الإدارة لهذه الشركة تلقائياً، بلا أي سكربت يدوي.
export async function POST() {
  try {
    const dbName = await resolveCurrentDbName()
    await syncPermissionDefinitions(dbName)
    await renameLegacyNames().catch((error) => console.error("[permissions/sync] rename legacy names:", error))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[permissions/sync] error:", error)
    return NextResponse.json({ error: "Failed to sync permission definitions" }, { status: 500 })
  }
}
