import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureAccountAccessTable } from "@/lib/account-access"

export const dynamic = "force-dynamic"

// صلاحيات المستخدمين على الحسابات (أدوات): GET ?meta=1 (المستخدمون/الفروع/أنواع الحسابات) ·
// GET ?user_id&branch_id&type&q (الحسابات مع حالة السماح) · PUT { user_id, branch_id, deny:[ids], allow:[ids] }.
// الجدول يحفظ المنع فقط (lib/account-access.ts) — branch_id 0 = كل الفروع.

const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "account_access", "view")
    if (!auth.ok) return auth.response
    await ensureAccountAccessTable()
    const params = request.nextUrl.searchParams

    if (params.get("meta") === "1") {
      const [users, branches, types] = await Promise.all([
        sql`SELECT user_id::text AS id, COALESCE(NULLIF(full_name, ''), NULLIF(username, ''), user_id::text) AS name, username AS code
            FROM user_settings WHERE COALESCE(is_active, true) = true ORDER BY user_id`,
        sql`SELECT id, branch_name AS name FROM branches WHERE COALESCE(status, 1) <> 3 AND bank_id IS NULL ORDER BY id`.catch(() =>
          sql`SELECT id, branch_name AS name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY id`),
        sql`SELECT id, name FROM account_classification_types WHERE COALESCE(status, 1) <> 3 ORDER BY id`.catch(() => []),
      ])
      // عدد الحسابات الممنوعة لكل مستخدم (لكل الفروع) — لعرضه بجانب اسمه
      const counts = await sql`SELECT user_id, COUNT(DISTINCT account_id)::int AS n FROM user_account_restrictions GROUP BY user_id`
      return NextResponse.json({ users, branches, types, restricted: Object.fromEntries((counts as any[]).map((row) => [row.user_id, row.n])) })
    }

    const userId = String(params.get("user_id") || "").trim()
    if (!userId) return NextResponse.json({ error: "اختر المستخدم" }, { status: 400 })
    const branchId = Math.max(0, Number(params.get("branch_id")) || 0)
    const typeIds = String(params.get("types") || "").split(",").map(Number).filter((id) => id > 0)
    const search = String(params.get("q") || "").trim()
    const rows = await sql`
      SELECT a.id, a.code, a.name, a.type, t.name AS type_name, a.father_id,
        EXISTS (SELECT 1 FROM account_tbl ch WHERE ch.father_id = a.id AND COALESCE(ch.status, 1) <> 3) AS has_children,
        EXISTS (SELECT 1 FROM user_account_restrictions r WHERE r.user_id = ${userId} AND r.account_id = a.id AND r.branch_id = ${branchId}) AS denied,
        EXISTS (SELECT 1 FROM user_account_restrictions r WHERE r.user_id = ${userId} AND r.account_id = a.id AND r.branch_id = 0) AS denied_all_branches,
        (SELECT array_agg(r.branch_id ORDER BY r.branch_id) FROM user_account_restrictions r WHERE r.user_id = ${userId} AND r.account_id = a.id AND r.branch_id > 0) AS denied_branch_ids
      FROM account_tbl a
      LEFT JOIN account_classification_types t ON t.id = a.type
      WHERE COALESCE(a.status, 1) <> 3
        AND (${typeIds.length} = 0 OR a.type = ANY(${typeIds}::int[]))
        AND (${search} = '' OR a.code ILIKE ${"%" + search + "%"} OR a.name ILIKE ${"%" + search + "%"})
      ORDER BY a.code
      LIMIT 5000
    `
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("account access GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الصلاحيات" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "account_access", "update")
    if (!auth.ok) return auth.response
    await ensureAccountAccessTable()
    const data = await request.json().catch(() => ({}))
    const userIds = [...new Set((Array.isArray(data.user_ids) ? data.user_ids : [data.user_id]).map((id: unknown) => String(id ?? "").trim()).filter(Boolean))] as string[]
    if (!userIds.length) return NextResponse.json({ error: "اختر المستخدم" }, { status: 400 })
    const branchId = Math.max(0, Number(data.branch_id) || 0)
    const deny = ids(data.deny)
    const allow = ids(data.allow)
    if (!deny.length && !allow.length) return NextResponse.json({ ok: true, changed: 0 })
    const known = (await sql`SELECT user_id::text AS id FROM user_settings WHERE user_id::text = ANY(${userIds}::text[])`) as any[]
    if (known.length !== userIds.length) return NextResponse.json({ error: "مستخدم غير موجود" }, { status: 400 })
    for (const userId of userIds) {
      if (deny.length) {
        await sql`
          INSERT INTO user_account_restrictions (user_id, account_id, branch_id, created_by)
          SELECT ${userId}, a.id, ${branchId}, ${auth.userId} FROM account_tbl a WHERE a.id = ANY(${deny}::int[])
          ON CONFLICT (user_id, account_id, branch_id) DO NOTHING`
      }
      if (allow.length) {
        // السماح على "كل الفروع" يرفع المنع عن الحساب في كل الفروع؛ وعلى فرع يرفع منع ذلك الفرع فقط
        if (branchId === 0) await sql`DELETE FROM user_account_restrictions WHERE user_id = ${userId} AND account_id = ANY(${allow}::int[])`
        else await sql`DELETE FROM user_account_restrictions WHERE user_id = ${userId} AND account_id = ANY(${allow}::int[]) AND branch_id = ${branchId}`
      }
    }
    return NextResponse.json({ ok: true, changed: (deny.length + allow.length) * userIds.length })
  } catch (error) {
    console.error("account access PUT", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الصلاحيات" }, { status: 500 })
  }
}
