import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import {
  MANAGER_ATTACHMENT_TYPES, MAX_MANAGER_ATTACHMENT_BYTES, MAX_MANAGER_ATTACHMENT_FILES,
  ensureManagerAttachmentsTable, isAllowedAttachmentMime, listManagerAttachments,
} from "@/lib/manager-attachments"

// GET: بريد الرسائل (صلاحية "بريد الرسائل - استعلام" على الفروع)، أو ?mine=1 = ما أرسله المستخدم (صلاحية الإرسال)
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const filter = { from: params.get("from") || "", to: params.get("to") || "", docType: params.get("doc_type") || "", status: params.get("status") || "" }
    if (params.get("mine") === "1") {
      const auth = await authorizeTransaction(request, "manager_attachment", "create")
      if (!auth.ok) return auth.response
      return NextResponse.json(await listManagerAttachments({ ...filter, senderUserId: String(auth.userId), limit: 30 }))
    }
    const auth = await authorizeTransaction(request, "manager_inbox", "view", "")
    if (!auth.ok) return auth.response
    return NextResponse.json(await listManagerAttachments({ ...filter, branchIds: auth.branchIds }))
  } catch (error: any) {
    console.error("[manager-attachments] GET", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل الرسائل" }, { status: 500 })
  }
}

// POST (multipart): doc_type + supplier_id = حساب مورد/عميل/مشترك (إلزامي) + note + files[] (صورة/PDF، إلزامي) ⇐ سطر لكل مرفق
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "manager_attachment", "create")
    if (!auth.ok) return auth.response
    await ensureManagerAttachmentsTable()
    // الجسم يُقرأ خاماً ثم يُحلَّل: إن فشل التحليل (حدث من الجوال على الخادم الحي) نعرض ما وصل فعلاً للتشخيص
    const contentType = request.headers.get("content-type") || ""
    const raw = await request.arrayBuffer()
    let form: FormData
    try {
      form = await new Response(raw, { headers: { "content-type": contentType } }).formData()
    } catch (parseError: any) {
      const diagnostics = {
        contentType: contentType.slice(0, 120),
        declared: request.headers.get("content-length"),
        received: raw.byteLength,
        transferEncoding: request.headers.get("transfer-encoding"),
        userAgent: (request.headers.get("user-agent") || "").slice(0, 160),
        head: Buffer.from(raw.slice(0, 160)).toString("latin1"),
      }
      console.error("[manager-attachments] formData parse failed", parseError?.message, diagnostics)
      return NextResponse.json({
        error: `تعذر قراءة المرفقات (وصل ${diagnostics.received} من ${diagnostics.declared ?? "?"} بايت، ${diagnostics.contentType.split(";")[0] || "بلا نوع"})`,
        diagnostics,
      }, { status: 400 })
    }
    const docType = String(form.get("doc_type") || "")
    if (!(docType in MANAGER_ATTACHMENT_TYPES)) return NextResponse.json({ error: "اختر نوع المستند (فاتورة مشتريات أو سند قبض)" }, { status: 400 })
    const supplierId = Number(form.get("supplier_id") || 0)
    if (!supplierId) return NextResponse.json({ error: "الحساب مطلوب (مورد أو عميل أو مشترك)" }, { status: 400 })
    const supplier = (await sql`SELECT id FROM account_tbl WHERE id = ${supplierId} AND type IN (2, 3, 5) AND COALESCE(status, 1) <> 3 LIMIT 1`)[0]
    if (!supplier) return NextResponse.json({ error: "الحساب غير موجود أو ليس مورداً/عميلاً/مشتركاً" }, { status: 400 })
    const note = String(form.get("note") || "").trim().slice(0, 500)
    const files = form.getAll("files").filter((value): value is File => typeof value === "object" && value !== null && "arrayBuffer" in value)
    if (!files.length) return NextResponse.json({ error: "المرفق مطلوب — أرفق صورة المستند" }, { status: 400 })
    if (files.length > MAX_MANAGER_ATTACHMENT_FILES) return NextResponse.json({ error: `الحد الأقصى ${MAX_MANAGER_ATTACHMENT_FILES} مرفقات في الرسالة` }, { status: 400 })
    for (const file of files) {
      if (!isAllowedAttachmentMime(file.type)) return NextResponse.json({ error: `نوع الملف غير مدعوم: ${file.name} (صور أو PDF فقط)` }, { status: 400 })
      if (file.size > MAX_MANAGER_ATTACHMENT_BYTES) return NextResponse.json({ error: `حجم الملف ${file.name} يتجاوز 8 ميغابايت` }, { status: 400 })
    }
    const ids: number[] = []
    for (const file of files) {
      const data = Buffer.from(await file.arrayBuffer())
      const row = (await sql`
        INSERT INTO manager_attachments_tbl (doc_type, supplier_id, note, file_name, mime_type, file_size, file_data, branch_id, sender_user_id)
        VALUES (${docType}, ${supplierId}, ${note || null}, ${file.name.slice(0, 255) || "attachment"}, ${file.type}, ${data.length}, ${data}, ${auth.branchId || null}, ${String(auth.userId)})
        RETURNING id
      `)[0] as any
      ids.push(Number(row.id))
    }
    return NextResponse.json({ ids }, { status: 201 })
  } catch (error: any) {
    console.error("[manager-attachments] POST", error)
    return NextResponse.json({ error: error?.message || "تعذر إرسال المرفقات" }, { status: 500 })
  }
}
