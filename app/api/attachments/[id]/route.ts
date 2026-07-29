import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import sql from "@/lib/database"
import { resolveStorageDir } from "../_lib"

// يُعيد محتوى الملف فعلياً — التنزيل يمر دائماً عبر هذا المسار (لا رابط ثابت مباشر تحت public/)،
// فيبقى محمياً بنفس عزل قاعدة بيانات المستأجر الحالية (resolveStorageDir يقرأ tenant_db الحالي،
// فسند/عميل/صنف من شركة أخرى لن يجد صف attachment_tbl أصلاً حتى لو خمّن الـid الصحيح).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) return NextResponse.json({ error: "معرف المرفق غير صالح" }, { status: 400 })

    const rows = await sql`SELECT * FROM attachment_tbl WHERE id = ${id}`
    if (rows.length === 0) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
    const attachment = rows[0]

    const dir = await resolveStorageDir(attachment.model_name, attachment.record_id)
    const filePath = `${dir}/${attachment.file_name}`
    const buffer = await fs.readFile(filePath)

    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"
    const encodedName = encodeURIComponent(attachment.original_name)
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mime_type || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("Error downloading attachment:", error)
    return NextResponse.json({ error: "تعذّر تنزيل المرفق" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) return NextResponse.json({ error: "معرف المرفق غير صالح" }, { status: 400 })

    const rows = await sql`SELECT * FROM attachment_tbl WHERE id = ${id}`
    if (rows.length === 0) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
    const attachment = rows[0]

    const dir = await resolveStorageDir(attachment.model_name, attachment.record_id)
    await fs.unlink(`${dir}/${attachment.file_name}`).catch(() => {})
    await sql`DELETE FROM attachment_tbl WHERE id = ${id}`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting attachment:", error)
    return NextResponse.json({ error: "تعذّر حذف المرفق" }, { status: 500 })
  }
}
