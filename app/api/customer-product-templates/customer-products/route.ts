import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureCustomerProductTemplateTables } from "@/lib/customer-product-templates"
import { getSessionUser } from "@/lib/tenant-auth"

// أصناف العميل من "نماذج العملاء والأصناف": كل نموذج فعّال (غير مجمَّد/محذوف) يضم العميل وتاريخ الحركة
// ضمن فترة صلاحيته — يُستخدم من زر "من نموذج" في نافذة بحث الأصناف داخل الحركات.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const accountId = Number(request.nextUrl.searchParams.get("account_id") || 0)
    if (!Number.isInteger(accountId) || accountId <= 0) return NextResponse.json({ error: "العميل مطلوب" }, { status: 400 })
    const dateParam = request.nextUrl.searchParams.get("date") || ""
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10)
    await ensureCustomerProductTemplateTables()
    const rows = await sql`
      SELECT DISTINCT tp.product_id, t.template_code, t.name_ar
      FROM customer_product_templates_tbl t
      JOIN customer_product_template_customers_tbl tc ON tc.template_id = t.id AND tc.account_id = ${accountId}
      JOIN customer_product_template_products_tbl tp ON tp.template_id = t.id
      WHERE t.status = 1
        AND t.start_date <= ${date}::date
        AND (t.end_date IS NULL OR t.end_date >= ${date}::date)
    `
    const templates = new Map<string, string>()
    for (const row of rows as any[]) templates.set(String(row.template_code), String(row.name_ar || ""))
    return NextResponse.json({
      product_ids: [...new Set((rows as any[]).map(row => Number(row.product_id)))],
      templates: [...templates].map(([code, name]) => ({ code, name })),
    })
  } catch (error) {
    console.error("[customer-product-templates] customer-products failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل أصناف النموذج" }, { status: 500 })
  }
}
