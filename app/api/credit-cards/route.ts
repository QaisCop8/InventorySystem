import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, saveHolidays } from "./_lib"

export async function GET() {
  try {
    await ensureTables()

    const rows = await sql`
      SELECT
        c.*,
        mt.name AS main_type_name,
        ct.name AS commission_type_name,
        b.bank_name,
        cur.currency_name,
        cur.currency_code
      FROM credit_cards_types_tbl c
      LEFT JOIN credit_card_main_types_tbl mt ON mt.id = c.main_type
      LEFT JOIN credit_card_commission_types_tbl ct ON ct.id = c.commission_type_id
      LEFT JOIN banks b ON b.id = c.bank_id
      LEFT JOIN currency cur ON cur.id = c.currency_id
      WHERE COALESCE(c.status, 1) != 3
      ORDER BY c.id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching credit card types:", error)
    return NextResponse.json({ error: "Failed to fetch credit card types" }, { status: 500 })
  }
}

const validate = (data: any): string | null => {
  if (!data.name || !String(data.name).trim()) return "اسم البطاقة (ar) مطلوب"
  if (!data.name_lang2 || !String(data.name_lang2).trim()) return "اسم البطاقة (en) مطلوب"
  if (!data.main_type) return "نوع البطاقة مطلوب"
  if (!data.currency_id) return "العملة مطلوبة"
  if (!data.bank_id) return "البنك مطلوب"
  if (!data.financial_account_id) return "الحساب محاسبي مطلوب"
  if (!data.waseet_account_id) return "حساب الوسيط مطلوب"
  if (!data.commission_type_id) return "نوع العمولة مطلوب"
  if (data.link_bank_machine && !data.machine_type_id && data.machine_type_id !== 0) return "نوع الماكينة مطلوب"
  return null
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    const validationError = validate(data)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const result = await sql`
      INSERT INTO credit_cards_types_tbl (
        main_type, name, name_lang2, currency_id, bank_id,
        commission_type_id, commission_value, commission_max_amount,
        financial_account_id, waseet_account_id, commission_account_id,
        insert_date, notes, status, link_bank_machine, machine_type_id
      ) VALUES (
        ${data.main_type}, ${data.name.trim()}, ${data.name_lang2.trim()}, ${data.currency_id}, ${data.bank_id},
        ${data.commission_type_id}, ${data.commission_value || 0}, ${data.commission_max_amount || 0},
        ${data.financial_account_id}, ${data.waseet_account_id}, ${data.commission_account_id || null},
        CURRENT_DATE, ${data.notes || ""}, ${Number(data.status || 1)}, ${Boolean(data.link_bank_machine)}, ${data.link_bank_machine ? data.machine_type_id : null}
      )
      RETURNING *
    `

    const record = result[0]
    await saveHolidays(record.id, data.holidays)

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error("Error creating credit card type:", error)
    return NextResponse.json({ error: "Failed to create credit card type" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    if (!data.id) return NextResponse.json({ error: "معرف البطاقة مطلوب" }, { status: 400 })

    const isSoftDelete = Number(data.status) === 3
    if (!isSoftDelete) {
      const validationError = validate(data)
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const result = await sql`
      UPDATE credit_cards_types_tbl
      SET
        main_type = ${data.main_type || null},
        name = ${data.name ? data.name.trim() : null},
        name_lang2 = ${data.name_lang2 ? data.name_lang2.trim() : null},
        currency_id = ${data.currency_id || null},
        bank_id = ${data.bank_id || null},
        commission_type_id = ${data.commission_type_id || null},
        commission_value = ${data.commission_value || 0},
        commission_max_amount = ${data.commission_max_amount || 0},
        financial_account_id = ${data.financial_account_id || null},
        waseet_account_id = ${data.waseet_account_id || null},
        commission_account_id = ${data.commission_account_id || null},
        notes = ${data.notes || ""},
        status = ${Number(data.status ?? 1)},
        link_bank_machine = ${Boolean(data.link_bank_machine)},
        machine_type_id = ${data.link_bank_machine ? data.machine_type_id : null}
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 })

    const record = result[0]
    if (!isSoftDelete) await saveHolidays(record.id, data.holidays)

    return NextResponse.json(record)
  } catch (error) {
    console.error("Error updating credit card type:", error)
    return NextResponse.json({ error: "Failed to update credit card type" }, { status: 500 })
  }
}
