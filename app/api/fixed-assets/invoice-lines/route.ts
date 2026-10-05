import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { handleFixedAssets } from "@/lib/fixed-assets/api"
import { round2 } from "@/lib/fixed-assets/depreciation"
import { capitalizableInvoiceLines } from "@/lib/fixed-assets/queries"
import { activateAsset, createAsset, FixedAssetError } from "@/lib/fixed-assets/service"

export async function GET(request: NextRequest) {
  return handleFixedAssets(request, "view", async ({ branchIds }) =>
    capitalizableInvoiceLines(branchIds, String(request.nextUrl.searchParams.get("search") ?? "")),
  { fallback: "تعذر تحميل أسطر فواتير المشتريات" })
}

// Capitalises one purchase-invoice line into N assets (e.g. 5 laptops → FA-00001..FA-00005). The
// credit side of the acquisition journal reclassifies the amount out of the account the invoice line
// was posted to, unless that account already is the category's asset account.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const invoiceBranch = async () => {
    const row = (await sql`
      SELECT vh.branch_id FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id WHERE vi.id = ${Number(body?.line_id) || 0}
    `)[0]
    if (!row) throw new FixedAssetError("سطر الفاتورة غير موجود")
    return Number(row.branch_id)
  }
  return handleFixedAssets(request, body?.activate ? "post" : "create", async ({ userId, branchIds }) => {
    const { lines, supported } = await capitalizableInvoiceLines(branchIds, "")
    if (!supported) throw new FixedAssetError("هيكل فواتير المشتريات في هذه الشركة لا يدعم الرسملة من الفاتورة")
    const line = lines.find((row: any) => Number(row.line_id) === Number(body.line_id))
    if (!line) throw new FixedAssetError("سطر الفاتورة غير موجود أو تمت رسملته بالكامل")
    const count = Math.round(Number(body.count) || 1)
    if (count < 1 || count > 500) throw new FixedAssetError("عدد الأصول يجب أن يكون بين 1 و 500")
    const total = round2(Number(body.amount) > 0 ? Number(body.amount) : Number(line.remaining_amount))
    if (total - Number(line.remaining_amount) > 0.004) throw new FixedAssetError(`المبلغ أكبر من المتبقي غير المرسمل (${line.remaining_amount})`)
    const category = (await sql`SELECT asset_account_id FROM fa_categories_tbl WHERE id = ${Number(body.category_id)}`)[0]
    if (!category) throw new FixedAssetError("اختر تصنيف الأصل")
    const alreadyAssetAccount = Number(line.line_account_id) > 0 && Number(line.line_account_id) === Number(category.asset_account_id)
    const unit = round2(total / count)
    const created: { id: number; asset_no: string }[] = []
    for (let index = 0; index < count; index++) {
      const cost = index === count - 1 ? round2(total - unit * (count - 1)) : unit
      const asset = await createAsset({
        ...body,
        name: count > 1 ? `${body.name || line.item_name} (${index + 1}/${count})` : body.name || line.item_name,
        acquisition_source: "PURCHASE_INVOICE",
        acquisition_date: body.acquisition_date || line.vch_date,
        original_cost: cost,
        residual_value: body.residual_value === undefined || body.residual_value === "" ? undefined : round2(Number(body.residual_value) / count),
        supplier_account_id: line.supplier_account_id,
        credit_account_id: body.credit_account_id || line.line_account_id,
        post_acquisition_journal: body.post_acquisition_journal ?? !alreadyAssetAccount,
        purchase_invoice_id: line.invoice_id,
        purchase_invoice_line_id: line.line_id,
        asset_no: undefined,
        serial_number: Array.isArray(body.serial_numbers) ? body.serial_numbers[index] : undefined,
      }, Number(line.branch_id), userId)
      if (body.activate) await activateAsset(Number(asset.id), userId)
      created.push({ id: Number(asset.id), asset_no: String(asset.asset_no) })
    }
    return { created, alreadyAssetAccount }
  }, { branch: invoiceBranch, fallback: "تعذر رسملة سطر الفاتورة" })
}
