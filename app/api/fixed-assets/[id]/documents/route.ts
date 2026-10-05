import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { assetBranch, handleFixedAssets, routeId } from "@/lib/fixed-assets/api"
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/fixed-assets/constants"
import { dateOnly, FixedAssetError } from "@/lib/fixed-assets/service"

type Context = { params: Promise<{ id: string }> }

const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain",
])

export async function GET(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const documentId = Number(request.nextUrl.searchParams.get("document_id"))
  return handleFixedAssets(request, "view", async ({ branchIds }) => {
    const row = (await sql`
      SELECT d.file_name, d.mime_type, d.file_data FROM fa_documents_tbl d JOIN fa_assets_tbl a ON a.id = d.asset_id
      WHERE d.id = ${documentId} AND d.asset_id = ${id} AND a.branch_id = ANY(${branchIds}::int[])
    `)[0]
    if (!row) return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 })
    const data: Buffer = Buffer.isBuffer(row.file_data) ? row.file_data : Buffer.from(String(row.file_data).replace(/^\\x/, ""), "hex")
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": String(row.mime_type),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(row.file_name))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }, { fallback: "تعذر تحميل المستند" })
}

export async function POST(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async ({ userId }) => {
    const mime = String(body.mime_type ?? "")
    if (!ALLOWED_TYPES.has(mime)) throw new FixedAssetError("نوع الملف غير مسموح (PDF، صور، Word، Excel، نص)")
    const fileName = String(body.file_name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 255)
    if (!fileName) throw new FixedAssetError("اسم الملف مطلوب")
    const data = Buffer.from(String(body.data ?? ""), "base64")
    if (!data.length) throw new FixedAssetError("الملف فارغ")
    if (data.length > MAX_DOCUMENT_BYTES) throw new FixedAssetError("حجم الملف يتجاوز 5 ميجابايت")
    const type = Object.keys(DOCUMENT_TYPES).includes(body.document_type) ? body.document_type : "OTHER"
    const row = (await sql`
      INSERT INTO fa_documents_tbl (asset_id, document_type, file_name, mime_type, file_size, file_data, description, document_date, expiry_date, created_by)
      VALUES (${id}, ${type}, ${fileName}, ${mime}, ${data.length}, ${data}, ${String(body.description ?? "").trim().slice(0, 500) || null},
        ${dateOnly(body.document_date)}, ${dateOnly(body.expiry_date)}, ${userId})
      RETURNING id
    `)[0]
    return { id: Number(row.id) }
  }, { branch: () => assetBranch(id), fallback: "تعذر رفع المستند" })
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const documentId = Number(request.nextUrl.searchParams.get("document_id"))
  return handleFixedAssets(request, "update", async () => {
    await sql`DELETE FROM fa_documents_tbl WHERE id = ${documentId} AND asset_id = ${id}`
    return { success: true }
  }, { branch: () => assetBranch(id), fallback: "تعذر حذف المستند" })
}
