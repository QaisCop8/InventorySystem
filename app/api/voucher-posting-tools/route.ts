import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction, transactionFamilyForVoucherType, type TransactionFamily } from "@/lib/transaction-permissions"
import { ensureProductionTables } from "@/lib/production-vouchers"
import { getSessionUser } from "@/lib/tenant-auth"

export const dynamic = "force-dynamic"

const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
const intersect = (left: number[], right: number[]) => left.filter((id) => right.includes(id))

export async function GET(request: NextRequest) {
  try {
    const screenAccess = await authorizeTransaction(request, "voucher_posting_tools", "access")
    if (!screenAccess.ok) return screenAccess.response

    const params = request.nextUrl.searchParams
    const from = params.get("from_date")
    const to = params.get("to_date")
    if (!validDate(from) || !validDate(to) || String(from) > String(to)) {
      return NextResponse.json({ error: "حدد فترة تاريخ صحيحة" }, { status: 400 })
    }
    if (!(await getSessionUser(request))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    await ensureProductionTables()
    const typeRows = await sql`SELECT id, name FROM voucher_types_tbl WHERE COALESCE(status, 1) = 1 ORDER BY id`
    const allowedBranchesByFamily = new Map<TransactionFamily, number[]>()
    const allowedTypes: { id: number; name: string }[] = []
    const allowedBranchesByType = new Map<number, number[]>()

    for (const row of typeRows as any[]) {
      const typeId = Number(row.id)
      const family = transactionFamilyForVoucherType(typeId)
      if (!family) continue
      let branches = allowedBranchesByFamily.get(family)
      if (!branches) {
        const view = await authorizeTransaction(request, family, "view")
        const post = view.ok ? await authorizeTransaction(request, family, "post") : null
        branches = view.ok && post && post.ok ? intersect(view.branchIds, post.branchIds) : []
        allowedBranchesByFamily.set(family, branches)
      }
      if (branches.length) {
        allowedTypes.push({ id: typeId, name: String(row.name || `سند ${typeId}`) })
        allowedBranchesByType.set(typeId, branches)
      }
    }

    const productionView = await authorizeTransaction(request, "production", "view")
    const productionPost = productionView.ok ? await authorizeTransaction(request, "production", "post") : null
    const productionBranches = productionView.ok && productionPost && productionPost.ok
      ? intersect(productionView.branchIds, productionPost.branchIds)
      : []
    if (productionBranches.length) {
      allowedTypes.push({ id: 20, name: "سند إنتاج بضاعة" })
      allowedBranchesByType.set(20, productionBranches)
    }

    const selectedType = Number(params.get("vch_type")) || null
    const selectedTypes = allowedTypes.filter((type) => !selectedType || type.id === selectedType)
    if (selectedType && !selectedTypes.length) {
      return NextResponse.json({ error: "لا توجد صلاحية لترحيل هذا النوع من السندات" }, { status: 403 })
    }

    const headerTypes = selectedTypes.map((type) => type.id).filter((id) => id !== 20)
    let vouchers: any[] = []
    if (headerTypes.length) {
      const branchIds = [...new Set(headerTypes.flatMap((id) => allowedBranchesByType.get(id) || []))]
      const rows = await sql`
        SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date,
          vh.branch_id, b.branch_name, vh.amount, vh.status
        FROM voucher_header_tbl vh
        LEFT JOIN branches b ON b.id = vh.branch_id
        WHERE COALESCE(vh.status, 1) = 1
          AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day')
          AND vh.vch_type = ANY(${headerTypes}::int[])
          AND vh.branch_id = ANY(${branchIds}::int[])
          AND NOT EXISTS (
            SELECT 1 FROM production_vouchers_tbl p
            WHERE p.in_voucher_id = vh.id OR p.out_voucher_id = vh.id
          )
        ORDER BY vh.vch_date, vh.vch_type, vh.vch_code
        LIMIT 2000
      `
      vouchers = (rows as any[])
        .filter((row) => (allowedBranchesByType.get(Number(row.vch_type)) || []).includes(Number(row.branch_id)))
        .map((row) => ({ ...row, vch_type: Number(row.vch_type), id: Number(row.id), amount: Number(row.amount) || 0 }))
    }

    if (selectedTypes.some((type) => type.id === 20)) {
      const rows = await sql`
        SELECT p.id, p.code AS vch_code, p.vch_date::date::text AS vch_date, p.branch_id,
          b.branch_name, p.status,
          COALESCE((SELECT SUM(i.quantity * i.price) FROM production_voucher_items_tbl i WHERE i.production_id = p.id AND i.role = 1), 0) AS amount
        FROM production_vouchers_tbl p
        LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.status = 1 AND p.vch_date >= ${from}::date AND p.vch_date < (${to}::date + INTERVAL '1 day')
          AND p.branch_id = ANY(${productionBranches}::int[])
        ORDER BY p.vch_date, p.code
        LIMIT 1000
      `
      vouchers.push(...(rows as any[]).map((row) => ({ ...row, id: Number(row.id), vch_type: 20, amount: Number(row.amount) || 0 })))
    }

    vouchers.sort((a, b) => String(a.vch_date).localeCompare(String(b.vch_date)) || Number(a.vch_type) - Number(b.vch_type) || String(a.vch_code).localeCompare(String(b.vch_code)))
    return NextResponse.json({ types: allowedTypes, vouchers: vouchers.slice(0, 2000) })
  } catch (error) {
    console.error("[voucher-posting-tools] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل السندات غير المرحلة" }, { status: 500 })
  }
}
