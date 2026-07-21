import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables } from "../../voucher-book-permissions/_lib"

// دفتر السندات المتاح للمستخدم الحالي: مقيّد بصلاحياته على نوع السند (voucher_book_user_permissions_tbl).
// لا يوجد أي "رجوع لعرض كل الدفاتر" بعد الآن — إن لم تكن هناك صلاحيات مُعرّفة لهذا المستخدم/النوع
// (أو تعذّر تحديد المستخدم) تُرجع قائمة فارغة، وليس كل الدفاتر.
// user_id هنا هو المعرّف النصي (user_settings.user_id) القادم من useAuth() في الواجهة، وليس
// المفتاح الرقمي (user_settings.id) الذي يُشير إليه voucher_book_user_permissions_tbl.user_id —
// لذلك يُحلّ أولاً إلى المعرّف الرقمي.
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 0)
    const varcharUserId = searchParams.get("user_id")

    if (!varcharUserId || !vchType) {
      return NextResponse.json({ books: [], default_book_id: null })
    }

    const userRows = await sql`SELECT id FROM user_settings WHERE user_id = ${varcharUserId}`
    const resolvedUserId: number | null = userRows[0]?.id ?? null
    if (!resolvedUserId) {
      return NextResponse.json({ books: [], default_book_id: null })
    }

    const permissionRows = await sql`
      SELECT vch_book_id, is_default
      FROM voucher_book_user_permissions_tbl
      WHERE user_id = ${resolvedUserId} AND voucher_type_id = ${vchType}
    `

    if (permissionRows.length === 0) {
      return NextResponse.json({ books: [], default_book_id: null })
    }

    const allBooks = await sql`SELECT id, name FROM voucher_books_tbl ORDER BY name`
    const allowedIds = new Set(permissionRows.map((p: any) => Number(p.vch_book_id)))
    const defaultPermission = permissionRows.find((p: any) => Number(p.is_default) === 1)
    const books = allBooks.filter((b: any) => allowedIds.has(Number(b.id)))

    return NextResponse.json({
      books,
      default_book_id: defaultPermission ? Number(defaultPermission.vch_book_id) : null,
    })
  } catch (error) {
    console.error("Error fetching voucher books:", error)
    return NextResponse.json({ error: "Failed to fetch voucher books" }, { status: 500 })
  }
}
