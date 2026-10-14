import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { exchangeRateFor, PORTAL_MAX_PROOF_BYTES, PORTAL_PROOF_TYPES, PortalAccessError, withPortalLink } from "@/lib/customer-portal"

// العميل يرفع إشعار تحويل (المبلغ، العملة، التاريخ، المرجع + صورة/PDF الإشعار) — يبقى "بانتظار المراجعة" حتى يقبله
// موظف الشركة فيُنشأ سند القبض. لا يُنشأ أي قيد من هنا.
const MAX_PENDING_PER_LINK = 10

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const form = await request.formData()
    const amount = Math.round(Number(form.get("amount")) * 100) / 100
    const currencyId = Number(form.get("currency_id"))
    const transferDate = String(form.get("transfer_date") || "")
    const reference = String(form.get("reference") || "").trim().slice(0, 100)
    const payerName = String(form.get("payer_name") || "").trim().slice(0, 150)
    const bankName = String(form.get("bank_name") || "").trim().slice(0, 150)
    const note = String(form.get("note") || "").trim().slice(0, 1000)
    const proof = form.get("proof")

    if (!(amount > 0) || amount > 100_000_000) return NextResponse.json({ error: "أدخل مبلغاً صحيحاً" }, { status: 400 })
    if (!Number.isInteger(currencyId) || currencyId <= 0) return NextResponse.json({ error: "اختر العملة" }, { status: 400 })
    const today = new Date().toISOString().slice(0, 10)
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate) || transferDate < yearAgo || transferDate > tomorrow) return NextResponse.json({ error: "تاريخ التحويل غير صالح" }, { status: 400 })
    if (!(proof instanceof File) || proof.size === 0) return NextResponse.json({ error: "أرفق صورة إشعار التحويل" }, { status: 400 })
    if (proof.size > PORTAL_MAX_PROOF_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من 4 ميجابايت" }, { status: 400 })
    const mime = String(proof.type || "").toLowerCase()
    if (!PORTAL_PROOF_TYPES.includes(mime)) return NextResponse.json({ error: "نوع الملف غير مدعوم — صورة (JPG/PNG/WEBP) أو PDF" }, { status: 400 })
    const bytes = Buffer.from(await proof.arrayBuffer())

    return await withPortalLink(token, async (link) => {
      const [pending] = await sql`SELECT COUNT(*) count FROM customer_portal_payments_tbl WHERE link_id=${link.id} AND status='pending'`
      if (Number(pending?.count || 0) >= MAX_PENDING_PER_LINK) return NextResponse.json({ error: "لديك دفعات كثيرة بانتظار المراجعة — انتظر مراجعتها أولاً" }, { status: 429 })
      const rate = await exchangeRateFor(currencyId, transferDate <= today ? transferDate : today)
      if (rate === null) return NextResponse.json({ error: "العملة غير متاحة" }, { status: 400 })
      const [row] = await sql`
        INSERT INTO customer_portal_payments_tbl (account_id, link_id, amount, currency_id, rate, transfer_date, reference, payer_name, bank_name, note, proof_data, proof_mime, proof_name)
        VALUES (${link.account_id}, ${link.id}, ${amount}, ${currencyId}, ${rate}, ${transferDate}, ${reference || null}, ${payerName || null}, ${bankName || null}, ${note || null}, ${bytes}, ${mime}, ${String(proof.name || "proof").slice(0, 200)})
        RETURNING id`
      return NextResponse.json({ id: Number(row.id), status: "pending" }, { status: 201 })
    })
  } catch (error) {
    if (error instanceof PortalAccessError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error("Customer portal payment error:", error)
    return NextResponse.json({ error: "تعذر إرسال الدفعة" }, { status: 500 })
  }
}
