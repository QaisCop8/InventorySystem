import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePortalTables } from "@/lib/customer-portal"
import { POST as createReceipt } from "@/app/api/receipts/route"
import { RECEIPT_VCH_TYPE, buildVoucherCode, ensureTables as ensureReceiptTables, getVoucherNumberSettings, nextVoucherSequence, resolveVoucherBookName } from "@/app/api/receipts/_lib"

// مراجعة دفعة من بوابة العملاء:
//   { action: "approve", cash_account_id, branch_id, vch_date?, post? } ⇒ سند قبض (المبلغ على حساب البنك/الصندوق المختار،
//     الطرف الدائن حساب العميل) عبر مسار سندات القبض نفسه (صلاحيات الفرع والترحيل، فحص عملة الحساب، الترقيم)، ثم تُعلَّم مقبولة.
//   { action: "reject", note } ⇒ مرفوضة مع السبب (يظهر للعميل في البوابة).
class ReviewError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    await ensureReceiptTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "دفعة غير صالحة" }, { status: 400 })
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "")
    const reviewer = user.full_name || user.username || user.user_id
    const reviewNote = String(body?.note || "").trim().slice(0, 500)

    const result = await withTenantTransaction(async () => {
      const [payment] = await sql`
        SELECT p.*, a.name account_name FROM customer_portal_payments_tbl p JOIN account_tbl a ON a.id=p.account_id
        WHERE p.id=${id} FOR UPDATE OF p`
      if (!payment) throw new ReviewError("الدفعة غير موجودة", 404)
      if (payment.status !== "pending") throw new ReviewError("تمت مراجعة هذه الدفعة مسبقاً", 409)

      if (action === "reject") {
        if (!reviewNote) throw new ReviewError("اكتب سبب الرفض — يظهر للعميل")
        await sql`UPDATE customer_portal_payments_tbl SET status='rejected', reviewed_by=${reviewer}, reviewed_at=NOW(), review_note=${reviewNote} WHERE id=${id}`
        return { status: "rejected" }
      }
      if (action !== "approve") throw new ReviewError("إجراء غير معروف")

      const cashAccountId = Number(body?.cash_account_id)
      const branchId = Number(body?.branch_id)
      if (!Number.isInteger(cashAccountId) || cashAccountId <= 0) throw new ReviewError("اختر حساب البنك/الصندوق الذي وصل إليه التحويل")
      if (!Number.isInteger(branchId) || branchId <= 0) throw new ReviewError("اختر الفرع")
      const vchDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.vch_date || "")) ? String(body.vch_date) : String(payment.transfer_date instanceof Date ? payment.transfer_date.toISOString().slice(0, 10) : payment.transfer_date).slice(0, 10)

      const [book] = await sql`
        SELECT p.vch_book_id FROM voucher_book_user_permissions_tbl p JOIN user_settings u ON u.id=p.user_id
        WHERE u.user_id::text=${String(user.user_id)} AND p.voucher_type_id=${RECEIPT_VCH_TYPE}
        ORDER BY CASE WHEN p.is_default=1 THEN 0 ELSE 1 END, p.vch_book_id LIMIT 1`
      const bookId = Number(book?.vch_book_id) || null
      if (!bookId) throw new ReviewError("يجب تعيين دفتر سندات قبض للمستخدم")
      const settings = await getVoucherNumberSettings(request.url, RECEIPT_VCH_TYPE)
      const bookName = await resolveVoucherBookName(bookId, branchId)
      const sequence = await nextVoucherSequence(RECEIPT_VCH_TYPE, `${settings.prefix}${bookName}`, settings.startNumber)
      const amount = Number(payment.amount)
      const details = [payment.reference ? `مرجع ${payment.reference}` : "", payment.bank_name ? String(payment.bank_name) : "", payment.payer_name ? `المحوِّل ${payment.payer_name}` : ""].filter(Boolean).join(" — ")

      const response = await createReceipt(new NextRequest(new URL("/api/receipts", request.url), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          vch_type: RECEIPT_VCH_TYPE,
          vch_code: buildVoucherCode(settings.prefix, bookName, sequence),
          vch_book_id: bookId,
          vch_date: vchDate,
          branch_id: branchId,
          currency_id: Number(payment.currency_id),
          rate: Number(payment.rate) || 1,
          account_id: Number(payment.account_id),
          to_account_id: Number(payment.account_id),
          customer_name: String(payment.account_name || ""),
          amount,
          cash_amount: amount,
          cash_account_id: cashAccountId,
          status: body?.post === false ? 1 : 2,
          note: `تحويل من بوابة العملاء${details ? ` (${details})` : ""}${reviewNote ? ` — ${reviewNote}` : ""}`,
        }),
      }))
      const receipt = await response.json()
      if (!response.ok) throw new ReviewError(String(receipt?.error || "تعذر إنشاء سند القبض"), response.status)
      await sql`
        UPDATE customer_portal_payments_tbl SET status='approved', reviewed_by=${reviewer}, reviewed_at=NOW(), review_note=${reviewNote || null}, receipt_voucher_id=${Number(receipt.id)}
        WHERE id=${id}`
      return { status: "approved", receipt_id: Number(receipt.id), receipt_code: String(receipt.vch_code || "") }
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("Customer portal review error:", error)
    return NextResponse.json({ error: "تعذرت مراجعة الدفعة" }, { status: 500 })
  }
}
