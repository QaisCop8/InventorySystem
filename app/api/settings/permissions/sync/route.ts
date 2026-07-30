import { NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { syncPermissionDefinitions } from "@/lib/permissions"

// يُستدعى مرة عند كل تحميل صفحة رئيسية (انظر نقطة الاستدعاء بـcomponents/auth/auth-context.tsx) —
// يزامن تعريفات الصلاحيات الجديدة من قاعدة الإدارة لهذه الشركة تلقائياً، بلا أي سكربت يدوي.
export async function POST() {
  try {
    const dbName = await resolveCurrentDbName()
    await syncPermissionDefinitions(dbName)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[permissions/sync] error:", error)
    return NextResponse.json({ error: "Failed to sync permission definitions" }, { status: 500 })
  }
}
