import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"

// فحص مسبق لاستيراد الأصناف: أي أرقام الأصناف والباركودات موجودة مسبقاً في النظام — تُعرض كأخطاء
// بشاشة المراجعة قبل الحفظ بدل اكتشافها سطراً سطراً أثناء الاستيراد.
export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map((code: unknown) => String(code ?? "").trim()).filter(Boolean))] as string[]
    const barcodes = [...new Set((Array.isArray(body.barcodes) ? body.barcodes : []).map((code: unknown) => String(code ?? "").trim()).filter(Boolean))] as string[]
    const existingCodes = codes.length ? await sql`SELECT product_code FROM products WHERE product_code = ANY(${codes}::text[])` : []
    const barcodeTable = (await sql`SELECT to_regclass('product_unit_barcodes') IS NOT NULL AS ok`)[0]?.ok
    const existingBarcodes = barcodes.length && barcodeTable
      ? await sql`SELECT b.barcode, p.product_code FROM product_unit_barcodes b JOIN products p ON p.id = b.product_id WHERE b.barcode = ANY(${barcodes}::text[])`
      : []
    return NextResponse.json({
      codes: existingCodes.map((row: any) => String(row.product_code)),
      barcodes: Object.fromEntries(existingBarcodes.map((row: any) => [String(row.barcode), String(row.product_code)])),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر الفحص" }, { status: 500 })
  }
}
