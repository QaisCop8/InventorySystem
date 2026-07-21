import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, saveChequeRows, resolveUserId, fetchBookWithJoins, generateNextCode } from "./_lib"

export async function GET() {
  try {
    await ensureTables()

    const rows = await sql`
      SELECT cb.*, ba.code AS bank_account_code, ba.name AS bank_account_name, ba.currency_id,
             cur.currency_name, cur.currency_code
      FROM cheque_books_tbl cb
      LEFT JOIN bank_accounts ba ON ba.id = cb.bank_account_id
      LEFT JOIN currency cur ON cur.id = ba.currency_id
      WHERE COALESCE(cb.status, 1) != 3
      ORDER BY cb.id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching cheque books:", error)
    return NextResponse.json({ error: "Failed to fetch cheque books" }, { status: 500 })
  }
}

const validate = (data: any): string | null => {
  if (!data.bank_account_id) return "رقم الحساب البنكي مطلوب"
  if (!data.code || !String(data.code).trim()) return "رقم الدفتر مطلوب"
  return null
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    const validationError = validate(data)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const currentUserId = await resolveUserId(data.user_id)

    // قد يفتح أكثر من مستخدم شاشة سند جديد بنفس اللحظة فيحملان نفس الرقم المولّد مسبقاً —
    // عند الحفظ الفعلي نتحقق ما إذا كان الرقم استُهلك بالفعل ونولّد رقماً جديداً عندها.
    const existingCode = await sql`SELECT id FROM cheque_books_tbl WHERE code = ${data.code.trim()}`
    const finalCode = existingCode.length > 0 ? await generateNextCode() : data.code.trim()

    const result = await sql`
      INSERT INTO cheque_books_tbl (company_id, code, bank_account_id, insert_date, notes, status)
      VALUES (1, ${finalCode}, ${data.bank_account_id}, ${data.insert_date || new Date().toISOString().slice(0, 10)}, ${data.notes || ""}, ${Number(data.status || 1)})
      RETURNING *
    `

    const book = result[0]
    await saveChequeRows(book.id, data.cheques, currentUserId)

    const full = await fetchBookWithJoins(book.id)
    return NextResponse.json(full, { status: 201 })
  } catch (error) {
    console.error("Error creating cheque book:", error)
    return NextResponse.json({ error: "Failed to create cheque book" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    if (!data.id) return NextResponse.json({ error: "معرف دفتر الشيكات مطلوب" }, { status: 400 })

    const isSoftDelete = Number(data.status) === 3
    if (!isSoftDelete) {
      const validationError = validate(data)
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    } else {
      // لا يمكن حذف دفتر يحتوي شيكات "غير متوفر" (3) — أي شيك منه استُخدم فعلياً في سند.
      const unavailable = await sql`
        SELECT id FROM cheque_book_cheque_tbl WHERE cheque_books_id = ${data.id} AND status = 3 LIMIT 1
      `
      if (unavailable.length > 0) {
        return NextResponse.json(
          { error: "لا يمكن حذف دفتر الشيكات لان بعض الشيكات حالتها غير متوفر" },
          { status: 400 },
        )
      }
    }

    const currentUserId = await resolveUserId(data.user_id)

    const result = await sql`
      UPDATE cheque_books_tbl
      SET
        code = ${data.code ? data.code.trim() : null},
        bank_account_id = ${data.bank_account_id || null},
        insert_date = ${data.insert_date || null},
        notes = ${data.notes || ""},
        status = ${Number(data.status ?? 1)}
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) return NextResponse.json({ error: "دفتر الشيكات غير موجود" }, { status: 404 })

    if (!isSoftDelete) await saveChequeRows(data.id, data.cheques, currentUserId)

    const full = await fetchBookWithJoins(data.id)
    return NextResponse.json(full)
  } catch (error) {
    console.error("Error updating cheque book:", error)
    return NextResponse.json({ error: "Failed to update cheque book" }, { status: 500 })
  }
}
