import { Readable } from "stream"
import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { ensureBackupTables, openBackupStream } from "@/lib/backups"

// تنزيل ملف نسخة (pg_dump بصيغة custom) — يُستعاد يدوياً بـ pg_restore عند كارثة تطال التخزين نفسه.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getManagementSession()
    if (!session?.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    await ensureBackupTables()
    const { id } = await params
    const backup = (await managementSql`SELECT * FROM db_backups WHERE id = ${Number(id) || 0} AND status = 'done'`)[0]
    if (!backup?.object_key) return NextResponse.json({ error: "النسخة غير موجودة" }, { status: 404 })
    const { body, size } = await openBackupStream(String(backup.object_key))
    const fileName = String(backup.object_key).split("/").pop() || `${backup.db_name}.dump`
    return new NextResponse(Readable.toWeb(body) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${backup.db_name}-${fileName}"`,
        ...(size ? { "Content-Length": String(size) } : {}),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("backup download", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنزيل النسخة" }, { status: 500 })
  }
}
