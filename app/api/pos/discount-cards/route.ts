import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureDiscountCardTables, findDiscountCard, listDiscountCards } from "@/lib/pos-discount-cards"

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : NaN)

async function validate(data: any, id: number | null) {
  const accountId = Number(data.account_id)
  if (!Number.isInteger(accountId) || accountId <= 0) return "العميل مطلوب"
  const account = (await sql`SELECT id FROM account_tbl WHERE id = ${accountId} AND COALESCE(status, 1) <> 3`)[0]
  if (!account) return "العميل غير موجود"
  if (!validDate(data.start_date) || !validDate(data.end_date)) return "تاريخ البداية والنهاية مطلوبان"
  if (String(data.end_date) < String(data.start_date)) return "تاريخ النهاية يجب ألا يسبق تاريخ البداية"
  const percent = num(data.discount_percent)
  if (!(percent > 0 && percent <= 100)) return "نسبة الخصم يجب أن تكون بين 0 و100"
  for (const [field, label] of [["min_invoice_amount", "الحد الأدنى لمبلغ الفاتورة"], ["max_discount_amount", "الحد الأقصى للخصم"], ["max_uses", "عدد مرات الاستخدام"]] as const) {
    const value = num(data[field] ?? 0)
    if (!Number.isFinite(value) || value < 0) return `${label} يجب أن يكون صفراً أو أكبر`
  }
  if (data.branch_id) {
    const branch = (await sql`SELECT id FROM branches WHERE id = ${Number(data.branch_id)}`)[0]
    if (!branch) return "الفرع غير موجود"
  }
  const cardNumber = String(data.card_number || "").trim()
  if (cardNumber) {
    const duplicate = (await sql`SELECT id FROM pos_discount_cards_tbl WHERE LOWER(BTRIM(card_number)) = LOWER(${cardNumber}) AND id <> ${id ?? 0}`)[0]
    if (duplicate) return `رقم البطاقة ${cardNumber} مستخدم لبطاقة أخرى`
  }
  return null
}

async function nextCardNumber() {
  const rows = await sql`SELECT card_number FROM pos_discount_cards_tbl WHERE card_number ~ '^DC[0-9]+$'`
  const last = rows.reduce((max: number, row: any) => Math.max(max, Number(String(row.card_number).slice(2)) || 0), 0)
  return `DC${String(last + 1).padStart(6, "0")}`
}

const values = (data: any) => ({
  account_id: Number(data.account_id),
  start_date: String(data.start_date),
  end_date: String(data.end_date),
  discount_percent: Number(data.discount_percent),
  min_invoice_amount: Number(data.min_invoice_amount || 0),
  max_discount_amount: Number(data.max_discount_amount || 0),
  max_uses: Math.trunc(Number(data.max_uses || 0)),
  branch_id: Number(data.branch_id) > 0 ? Number(data.branch_id) : null,
  status: Number(data.status) === 2 ? 2 : 1,
  notes: String(data.notes || "").trim(),
})

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    if (request.nextUrl.searchParams.get("next-number") === "1") {
      await ensureDiscountCardTables()
      return NextResponse.json({ card_number: await nextCardNumber() })
    }
    return NextResponse.json(await listDiscountCards())
  } catch (error) {
    console.error("[pos/discount-cards] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل بطاقات الخصم" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    await ensureDiscountCardTables()
    const data = await request.json()
    const error = await validate(data, null)
    if (error) return NextResponse.json({ error }, { status: 400 })
    const v = values(data)
    const cardNumber = String(data.card_number || "").trim() || await nextCardNumber()
    const [row] = await sql`
      INSERT INTO pos_discount_cards_tbl (card_number, account_id, start_date, end_date, discount_percent, min_invoice_amount, max_discount_amount, max_uses, branch_id, status, notes, created_by)
      VALUES (${cardNumber}, ${v.account_id}, ${v.start_date}, ${v.end_date}, ${v.discount_percent}, ${v.min_invoice_amount}, ${v.max_discount_amount}, ${v.max_uses}, ${v.branch_id}, ${v.status}, ${v.notes}, ${Number(user.user_id) || null})
      RETURNING id
    `
    return NextResponse.json((await findDiscountCard({ id: Number(row.id) }))[0], { status: 201 })
  } catch (error) {
    console.error("[pos/discount-cards] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ بطاقة الخصم" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    await ensureDiscountCardTables()
    const data = await request.json()
    const id = Number(data.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رقم البطاقة غير صالح" }, { status: 400 })
    const error = await validate(data, id)
    if (error) return NextResponse.json({ error }, { status: 400 })
    const v = values(data)
    const cardNumber = String(data.card_number || "").trim()
    if (!cardNumber) return NextResponse.json({ error: "رقم البطاقة مطلوب" }, { status: 400 })
    const updated = await sql`
      UPDATE pos_discount_cards_tbl SET card_number = ${cardNumber}, account_id = ${v.account_id}, start_date = ${v.start_date}, end_date = ${v.end_date},
        discount_percent = ${v.discount_percent}, min_invoice_amount = ${v.min_invoice_amount}, max_discount_amount = ${v.max_discount_amount},
        max_uses = ${v.max_uses}, branch_id = ${v.branch_id}, status = ${v.status}, notes = ${v.notes}, updated_at = NOW()
      WHERE id = ${id} RETURNING id
    `
    if (!updated.length) return NextResponse.json({ error: "بطاقة الخصم غير موجودة" }, { status: 404 })
    return NextResponse.json((await findDiscountCard({ id }))[0])
  } catch (error) {
    console.error("[pos/discount-cards] PUT failed", error)
    return NextResponse.json({ error: "تعذر تعديل بطاقة الخصم" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    await ensureDiscountCardTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رقم البطاقة غير صالح" }, { status: 400 })
    // بطاقة استُخدمت في فواتير لا تُحذف (تبقى مرتبطة بها في التقارير) — تُوقف بدلاً من ذلك
    const used = (await sql`SELECT 1 FROM voucher_header_tbl WHERE discount_card_id = ${id} LIMIT 1`)[0]
    if (used) {
      await sql`UPDATE pos_discount_cards_tbl SET status = 2, updated_at = NOW() WHERE id = ${id}`
      return NextResponse.json({ success: true, deactivated: true, message: "البطاقة مستخدمة في فواتير، تم إيقافها بدل حذفها" })
    }
    await sql`DELETE FROM pos_discount_cards_tbl WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[pos/discount-cards] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف بطاقة الخصم" }, { status: 500 })
  }
}
