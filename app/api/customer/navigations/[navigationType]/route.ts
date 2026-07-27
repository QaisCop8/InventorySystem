import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// تصفّح سجلات الزبائن/الموردين (أول/سابق/تالي/آخر/برقم مُعيَّن) لشاشة components/products/customers.tsx —
// كلاهما مخزَّن في نفس جدول customers (يُميَّز بينهما بعمود type: 1=زبون، 2=مورد)، بنفس شكل
// الاستعلام المستخدَم في القائمة الرئيسية GET /api/customers (JOIN account_tbl لجلب حقول الحساب
// المرتبطة: father_id، finanical_list_id... التي تعتمد عليها شاشة التعديل مباشرة).
export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    const { navigationType } = params
    const typeParam = request.nextUrl.searchParams.get("type")
    const type = typeParam === "2" ? 2 : 1

    let rows: any[]

    switch (navigationType) {
      case "first":
        rows = await sql`
          SELECT c.*, acc.father_id, acc.finanical_list_id, acc.finanical_list_assests_id,
                 acc.finanical_list_liabilities_id, acc.finanical_list_income_id, acc.currency_id,
                 acc.allow_trans_with_diff_curr, acc.iscalc_curr_diff_rates, acc.level_no
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          WHERE c.isDeleted = false AND c.type = ${type}
          ORDER BY c.id ASC
          LIMIT 1
        `
        break

      case "last":
        rows = await sql`
          SELECT c.*, acc.father_id, acc.finanical_list_id, acc.finanical_list_assests_id,
                 acc.finanical_list_liabilities_id, acc.finanical_list_income_id, acc.currency_id,
                 acc.allow_trans_with_diff_curr, acc.iscalc_curr_diff_rates, acc.level_no
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          WHERE c.isDeleted = false AND c.type = ${type}
          ORDER BY c.id DESC
          LIMIT 1
        `
        break

      case "next": {
        const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
        rows = await sql`
          SELECT c.*, acc.father_id, acc.finanical_list_id, acc.finanical_list_assests_id,
                 acc.finanical_list_liabilities_id, acc.finanical_list_income_id, acc.currency_id,
                 acc.allow_trans_with_diff_curr, acc.iscalc_curr_diff_rates, acc.level_no
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          WHERE c.isDeleted = false AND c.type = ${type} AND c.id > ${currentId}
          ORDER BY c.id ASC
          LIMIT 1
        `
        break
      }

      case "previous": {
        const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
        rows = await sql`
          SELECT c.*, acc.father_id, acc.finanical_list_id, acc.finanical_list_assests_id,
                 acc.finanical_list_liabilities_id, acc.finanical_list_income_id, acc.currency_id,
                 acc.allow_trans_with_diff_curr, acc.iscalc_curr_diff_rates, acc.level_no
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          WHERE c.isDeleted = false AND c.type = ${type} AND c.id < ${currentId}
          ORDER BY c.id DESC
          LIMIT 1
        `
        break
      }

      case "ById": {
        const id = Number(request.nextUrl.searchParams.get("id") || 0)
        if (!id) {
          return NextResponse.json({ error: "المعرّف مطلوب" }, { status: 400 })
        }
        rows = await sql`
          SELECT c.*, acc.father_id, acc.finanical_list_id, acc.finanical_list_assests_id,
                 acc.finanical_list_liabilities_id, acc.finanical_list_income_id, acc.currency_id,
                 acc.allow_trans_with_diff_curr, acc.iscalc_curr_diff_rates, acc.level_no
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          WHERE c.isDeleted = false AND c.id = ${id}
        `
        break
      }

      default:
        return NextResponse.json({ error: "نوع تصفّح غير صالح" }, { status: 400 })
    }

    if (rows.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("[customer/navigations] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تصفّح السجلات" }, { status: 500 })
  }
}
