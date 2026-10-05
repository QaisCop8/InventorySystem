import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { handleFixedAssets } from "@/lib/fixed-assets/api"
import { FixedAssetError } from "@/lib/fixed-assets/service"

const ACCOUNT_FIELDS = [
  "asset_account_id", "accumulated_depreciation_account_id", "depreciation_expense_account_id",
  "gain_on_disposal_account_id", "loss_on_disposal_account_id", "revaluation_reserve_account_id", "impairment_loss_account_id",
] as const
const METHODS = ["STRAIGHT_LINE", "DECLINING_BALANCE", "NONE"]

async function payload(body: any, currentId: number | null) {
  const code = String(body.code ?? "").trim().slice(0, 30)
  const name = String(body.name ?? "").trim().slice(0, 150)
  if (!code || !name) throw new FixedAssetError("رمز التصنيف واسمه مطلوبان")
  const parentId = Number(body.parent_id) > 0 ? Number(body.parent_id) : null
  if (parentId && parentId === currentId) throw new FixedAssetError("لا يمكن أن يكون التصنيف أباً لنفسه")
  const accounts = Object.fromEntries(ACCOUNT_FIELDS.map(field => [field, Number(body[field]) > 0 ? Number(body[field]) : null])) as Record<(typeof ACCOUNT_FIELDS)[number], number | null>
  const ids = Object.values(accounts).filter(Boolean) as number[]
  if (ids.length) {
    const found = await sql`
      SELECT a.id FROM account_tbl a WHERE a.id = ANY(${ids}::int[]) AND COALESCE(a.status, 1) <> 3
        AND NOT EXISTS (SELECT 1 FROM account_tbl c WHERE c.father_id = a.id)
    `
    if (found.length !== new Set(ids).size) throw new FixedAssetError("أحد الحسابات المختارة غير موجود أو موقوف أو حساب أب")
  }
  const isDepreciable = body.is_depreciable !== false
  const life = Math.round(Number(body.default_useful_life_months) || 60)
  const residual = Number(body.default_residual_percentage) || 0
  const declining = body.default_declining_rate === "" || body.default_declining_rate == null ? null : Number(body.default_declining_rate)
  if (life <= 0 || life > 1200) throw new FixedAssetError("العمر الافتراضي يجب أن يكون بين 1 و 1200 شهر")
  if (residual < 0 || residual >= 100) throw new FixedAssetError("نسبة القيمة المتبقية يجب أن تكون بين 0 و 100")
  if (declining !== null && !(declining > 0 && declining <= 100)) throw new FixedAssetError("نسبة القسط المتناقص غير صالحة")
  if (isDepreciable && (!accounts.depreciation_expense_account_id || !accounts.accumulated_depreciation_account_id)) {
    throw new FixedAssetError("التصنيف القابل للإهلاك يحتاج حساب مصروف الإهلاك وحساب الإهلاك المتراكم")
  }
  if (!accounts.asset_account_id) throw new FixedAssetError("حساب الأصل مطلوب")
  return {
    code, name, parentId, accounts, isDepreciable, life, residual, declining,
    method: isDepreciable && METHODS.includes(body.default_depreciation_method) ? body.default_depreciation_method : isDepreciable ? "STRAIGHT_LINE" : "NONE",
    status: Number(body.status) === 2 ? 2 : 1,
  }
}

export async function GET(request: NextRequest) {
  return handleFixedAssets(request, "view", async () => ({
    categories: await sql`
      SELECT c.*, (SELECT COUNT(*)::int FROM fa_assets_tbl a WHERE a.category_id = c.id) AS asset_count
      FROM fa_categories_tbl c ORDER BY c.code
    `,
  }))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async () => {
    const p = await payload(body, null)
    const row = (await sql`
      INSERT INTO fa_categories_tbl (
        code, name, parent_id, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
        gain_on_disposal_account_id, loss_on_disposal_account_id, revaluation_reserve_account_id, impairment_loss_account_id,
        default_useful_life_months, default_depreciation_method, default_residual_percentage, default_declining_rate, is_depreciable, status
      ) VALUES (
        ${p.code}, ${p.name}, ${p.parentId}, ${p.accounts.asset_account_id}, ${p.accounts.accumulated_depreciation_account_id},
        ${p.accounts.depreciation_expense_account_id}, ${p.accounts.gain_on_disposal_account_id}, ${p.accounts.loss_on_disposal_account_id},
        ${p.accounts.revaluation_reserve_account_id}, ${p.accounts.impairment_loss_account_id},
        ${p.life}, ${p.method}, ${p.residual}, ${p.declining}, ${p.isDepreciable}, ${p.status}
      ) RETURNING id
    `)[0]
    return { id: Number(row.id) }
  }, { fallback: "تعذر حفظ التصنيف" })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async () => {
    const id = Number(body.id)
    const current = (await sql`SELECT * FROM fa_categories_tbl WHERE id = ${id} FOR UPDATE`)[0]
    if (!current) throw new FixedAssetError("التصنيف غير موجود")
    const p = await payload(body, id)
    const activated = (await sql`SELECT COUNT(*)::int AS count FROM fa_assets_tbl WHERE category_id = ${id} AND status NOT IN ('DRAFT', 'UNDER_CONSTRUCTION')`)[0]
    if (Number(activated.count) > 0 && (
      Number(current.asset_account_id || 0) !== Number(p.accounts.asset_account_id || 0) ||
      Number(current.accumulated_depreciation_account_id || 0) !== Number(p.accounts.accumulated_depreciation_account_id || 0)
    )) {
      throw new FixedAssetError("لا يمكن تغيير حساب الأصل أو الإهلاك المتراكم لتصنيف له أصول مفعّلة — أنشئ تصنيفاً جديداً وانقل الأصول")
    }
    await sql`
      UPDATE fa_categories_tbl SET
        code = ${p.code}, name = ${p.name}, parent_id = ${p.parentId},
        asset_account_id = ${p.accounts.asset_account_id}, accumulated_depreciation_account_id = ${p.accounts.accumulated_depreciation_account_id},
        depreciation_expense_account_id = ${p.accounts.depreciation_expense_account_id}, gain_on_disposal_account_id = ${p.accounts.gain_on_disposal_account_id},
        loss_on_disposal_account_id = ${p.accounts.loss_on_disposal_account_id}, revaluation_reserve_account_id = ${p.accounts.revaluation_reserve_account_id},
        impairment_loss_account_id = ${p.accounts.impairment_loss_account_id}, default_useful_life_months = ${p.life},
        default_depreciation_method = ${p.method}, default_residual_percentage = ${p.residual}, default_declining_rate = ${p.declining},
        is_depreciable = ${p.isDepreciable}, status = ${p.status}, updated_at = NOW()
      WHERE id = ${id}
    `
    return { id }
  }, { fallback: "تعذر تعديل التصنيف" })
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"))
  return handleFixedAssets(request, "update", async () => {
    const used = (await sql`
      SELECT (SELECT COUNT(*) FROM fa_assets_tbl WHERE category_id = ${id}) + (SELECT COUNT(*) FROM fa_categories_tbl WHERE parent_id = ${id}) AS count
    `)[0]
    if (Number(used.count) > 0) throw new FixedAssetError("التصنيف مستخدم في أصول أو تصنيفات فرعية — أوقفه بدلاً من حذفه")
    await sql`DELETE FROM fa_categories_tbl WHERE id = ${id}`
    return { success: true }
  }, { fallback: "تعذر حذف التصنيف" })
}
