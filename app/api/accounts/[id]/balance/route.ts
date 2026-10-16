import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { hasNamedPermission } from "@/lib/permissions"
import { ACCOUNT_BALANCE_VIEW_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY } from "@/lib/transaction-permission-definitions"

// رصيد الحساب (عميل/مورد/أي حساب) لحقل "الرصيد" في شاشات الحركات — فقط لمن يملك صلاحية
// "السماح بمشاهدة رصيد الحساب في الحركات". بدون الصلاحية: { allowed: false } (يُخفى الرقم دون خطأ).
// الرصيد = كل السندات غير الملغاة (مرحّلة ومحفوظة) بعملة الحساب؛ حساب بلا عملة ⇐ بعملة الأساس (أصغر معرّف عملة).
// موجب = مدين، سالب = دائن.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "معرف الحساب غير صالح" }, { status: 400 })
    const branchId = Number(request.headers.get("x-branch-id")) || null
    const allowed = await hasNamedPermission(String(user.user_id), ACCOUNT_BALANCE_VIEW_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY, branchId)
    if (!allowed) return NextResponse.json({ allowed: false })

    const row = (await sql`
      SELECT a.id, a.currency_id,
        COALESCE(c.currency_code, (SELECT base.currency_code FROM currency base ORDER BY base.id LIMIT 1), '') currency_code,
        COALESCE(a.max_balance_amount, 0)::float8 credit_limit,
        COALESCE((
          SELECT SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * (
            CASE
              WHEN a.currency_id IS NULL THEN COALESCE(vjd.base_curr_amount, vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1))
              WHEN vjd.currency_id = a.currency_id THEN vjd.amount
              ELSE COALESCE(vjd.account_amount, vjd.base_curr_amount, vjd.amount)
            END))
          FROM voucher_journal_detail_tbl vjd
          JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id AND vh.status <> 3
          WHERE vjd.account_id = a.id
        ), 0)::float8 balance
      FROM account_tbl a
      LEFT JOIN currency c ON c.id = a.currency_id
      WHERE a.id = ${id}
    `)[0] as any
    if (!row) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    const balance = Math.round(Number(row.balance || 0) * 1000) / 1000
    return NextResponse.json({
      allowed: true,
      balance,
      side: balance > 0.0005 ? "مدين" : balance < -0.0005 ? "دائن" : "",
      currency_code: String(row.currency_code || ""),
      credit_limit: Number(row.credit_limit || 0),
    })
  } catch (error) {
    console.error("[accounts] balance failed", error)
    return NextResponse.json({ error: "تعذر حساب رصيد الحساب" }, { status: 500 })
  }
}
