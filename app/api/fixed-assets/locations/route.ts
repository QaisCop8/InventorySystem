import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { handleFixedAssets } from "@/lib/fixed-assets/api"
import { LOCATION_TYPES } from "@/lib/fixed-assets/constants"
import { FixedAssetError } from "@/lib/fixed-assets/service"

async function payload(body: any, currentId: number | null) {
  const code = String(body.code ?? "").trim().slice(0, 30)
  const name = String(body.name ?? "").trim().slice(0, 150)
  if (!code || !name) throw new FixedAssetError("رمز الموقع واسمه مطلوبان")
  const parentId = Number(body.parent_id) > 0 ? Number(body.parent_id) : null
  if (parentId && currentId) {
    // Walk up from the new parent; reaching this location would create a cycle.
    let cursor: number | null = parentId
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === currentId) throw new FixedAssetError("لا يمكن جعل الموقع تابعاً لأحد فروعه")
      cursor = (await sql`SELECT parent_id FROM fa_locations_tbl WHERE id = ${cursor}`)[0]?.parent_id ?? null
    }
  }
  return {
    code, name, parentId,
    type: Object.keys(LOCATION_TYPES).includes(body.type) ? body.type : "OTHER",
    branchId: Number(body.branch_id) > 0 ? Number(body.branch_id) : null,
    status: Number(body.status) === 2 ? 2 : 1,
  }
}

export async function GET(request: NextRequest) {
  return handleFixedAssets(request, "view", async () => ({
    locations: await sql`
      SELECT l.*, (SELECT COUNT(*)::int FROM fa_assets_tbl a WHERE a.location_id = l.id) AS asset_count
      FROM fa_locations_tbl l ORDER BY l.code
    `,
  }))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async () => {
    const p = await payload(body, null)
    const row = (await sql`
      INSERT INTO fa_locations_tbl (code, name, parent_id, type, branch_id, status)
      VALUES (${p.code}, ${p.name}, ${p.parentId}, ${p.type}, ${p.branchId}, ${p.status}) RETURNING id
    `)[0]
    return { id: Number(row.id) }
  }, { fallback: "تعذر حفظ الموقع" })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async () => {
    const id = Number(body.id)
    if (!(await sql`SELECT 1 FROM fa_locations_tbl WHERE id = ${id}`).length) throw new FixedAssetError("الموقع غير موجود")
    const p = await payload(body, id)
    await sql`
      UPDATE fa_locations_tbl SET code = ${p.code}, name = ${p.name}, parent_id = ${p.parentId}, type = ${p.type},
        branch_id = ${p.branchId}, status = ${p.status} WHERE id = ${id}
    `
    return { id }
  }, { fallback: "تعذر تعديل الموقع" })
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"))
  return handleFixedAssets(request, "update", async () => {
    const used = (await sql`
      SELECT (SELECT COUNT(*) FROM fa_assets_tbl WHERE location_id = ${id})
        + (SELECT COUNT(*) FROM fa_locations_tbl WHERE parent_id = ${id})
        + (SELECT COUNT(*) FROM fa_transfers_tbl WHERE from_location_id = ${id} OR to_location_id = ${id}) AS count
    `)[0]
    if (Number(used.count) > 0) throw new FixedAssetError("الموقع مستخدم — أوقفه بدلاً من حذفه")
    await sql`DELETE FROM fa_locations_tbl WHERE id = ${id}`
    return { success: true }
  }, { fallback: "تعذر حذف الموقع" })
}
