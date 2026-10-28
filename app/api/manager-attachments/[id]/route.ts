import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureManagerAttachmentsTable } from "@/lib/manager-attachments"

type Context = { params: Promise<{ id: string }> }

async function loadRow(id: number) {
  await ensureManagerAttachmentsTable()
  return (await sql`SELECT id, branch_id, sender_user_id FROM manager_attachments_tbl WHERE id = ${id} LIMIT 1`)[0] as any
}

// GET: الملف نفسه (تنزيل/معالجة) — لصاحب صلاحية بريد الرسائل على فرع الرسالة، أو لمرسلها
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const id = Number((await params).id)
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ error: "المرفق غير موجود (ربما حُذف)" }, { status: 404 })
    const auth = await authorizeTransaction(request, "manager_inbox", "view", row.branch_id)
    if (!auth.ok) {
      const sender = await authorizeTransaction(request, "manager_attachment", "create")
      if (!sender.ok || String(sender.userId) !== String(row.sender_user_id)) return auth.response
    } else {
      await sql`UPDATE manager_attachments_tbl SET read_at = COALESCE(read_at, NOW()), read_by = COALESCE(read_by, ${String(auth.userId)}) WHERE id = ${id}`
    }
    const file = (await sql`SELECT file_name, mime_type, file_data FROM manager_attachments_tbl WHERE id = ${id}`)[0] as any
    const body = new Uint8Array(file.file_data as Buffer)
    return new NextResponse(body, {
      headers: {
        "Content-Type": String(file.mime_type || "application/octet-stream"),
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(file.file_name || "attachment"))}`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error: any) {
    console.error("[manager-attachments/id] GET", error)
    return NextResponse.json({ error: error?.message || "تعذر تنزيل المرفق" }, { status: 500 })
  }
}

// PATCH {action: "processed"}: تعليم الرسالة "تمت المعالجة" بعد إرسالها للمساعد الذكي
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const id = Number((await params).id)
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
    const auth = await authorizeTransaction(request, "manager_inbox", "view", row.branch_id)
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => ({}))
    if (body?.action !== "processed") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    await sql`UPDATE manager_attachments_tbl SET processed_at = NOW(), processed_by = ${String(auth.userId)} WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر تحديث الرسالة" }, { status: 500 })
  }
}

// DELETE: حذف الرسالة ومرفقها من قاعدة البيانات نهائياً (يحرّر حجم الملف)
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const id = Number((await params).id)
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
    const auth = await authorizeTransaction(request, "manager_inbox", "delete", row.branch_id)
    if (!auth.ok) return auth.response
    await sql`DELETE FROM manager_attachments_tbl WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر حذف المرفق" }, { status: 500 })
  }
}
