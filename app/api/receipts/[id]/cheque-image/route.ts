import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureChequeImagesTable } from "../../_lib"
import { authorizeStoredVoucher } from "@/lib/transaction-permissions"

export const dynamic = "force-dynamic"

// GET ?cheq_num=&bank_id= ⇐ صورتا وجه وظهر الشيك (base64) كما التقطهما قارئ الشيكات — بنفس صلاحية عرض السند
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    if (!id) return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    const authorization = await authorizeStoredVoucher(request, id, "view")
    if (!authorization.ok) return authorization.response
    await ensureChequeImagesTable()
    const cheqNum = String(request.nextUrl.searchParams.get("cheq_num") || "").trim()
    const bankId = Number(request.nextUrl.searchParams.get("bank_id")) || 0
    const rows = (await sql`
      SELECT front_image, back_image FROM cheque_images_tbl
      WHERE voucher_id = ${id} AND cheq_num = ${cheqNum} AND bank_id = ${bankId}
    `) as any[]
    if (!rows.length) return NextResponse.json({ error: "لا توجد صورة لهذا الشيك" }, { status: 404 })
    return NextResponse.json({ front_image: rows[0].front_image || "", back_image: rows[0].back_image || "" }, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("Error loading cheque image:", error)
    return NextResponse.json({ error: "تعذر تحميل صورة الشيك" }, { status: 500 })
  }
}
