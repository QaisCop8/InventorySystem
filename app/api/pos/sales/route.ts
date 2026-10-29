import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { POST as createSalesVoucher } from "@/app/api/sales-vouchers/route"
import { POST as createStockVoucher } from "@/app/api/stock-vouchers/route"
import { regenerateVoucherCode, STOCK_OUT_VCH_TYPE, ensureTables as ensureStockVoucherTables } from "@/app/api/stock-vouchers/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { ensureTables, generateSalesVoucherCode, SALES_INVOICE_VCH_TYPE, RETURN_SELL_VCH_TYPE } from "@/app/api/sales-vouchers/_lib"
import { canUsePosCashierPermission, posPermissionDenied, ensurePosTables, getOpenPosSession, getPosPoint, requestUserId } from "../_lib"
import { getPosCurrencies } from "@/lib/pos-currencies"
import { needsPosReceipt } from "@/lib/pos-receipt"
import { validatePosAccounts } from "@/lib/pos-account-validation"
import { resolvePosCashAccount } from "@/lib/pos-accounts"
import { createPosReceipt, createPosReturnPayment } from "../_receipts"
import { savePosSaleCore } from "../_sale-core"
import { loadStoredSettings } from "@/app/api/settings/system/route"
import { applyPosCampaigns, combinedDiscountPercent, type PosCampaignLine } from "@/lib/pos-campaigns"
import { getPosCampaigns, getPosCampaignUsage } from "@/lib/pos-campaign-storage"
import { discountCardAmount, discountCardProblem, ensureDiscountCardTables, findDiscountCard, localDate as discountCardDate } from "@/lib/pos-discount-cards"

const localDate = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const clientSaleId = String(data?.pos_client_sale_id || "").trim()
    if (!clientSaleId) return NextResponse.json({ error: "رقم عملية نقطة البيع مطلوب" }, { status: 400 })
    if (!Array.isArray(data?.items) || data.items.length === 0) {
      return NextResponse.json({ error: "السلة فارغة" }, { status: 400 })
    }

    // تهيئة الجداول قبل فتح المعاملة لا داخلها: أوامر ALTER/CREATE داخل المعاملة تحجز أقفالاً حصرية على الجداول
    // (system_settings، voucher_header_tbl...) حتى نهاية الحفظ فتنتظرها كل الصفحات الأخرى، وقد تنتظر المعاملةُ
    // نفسَها إن صدر أمر مماثل من اتصال آخر أثناء الحفظ. بعد أول تطبيق تُتخطّى كلها (runSchemaOnce) فالكلفة ضئيلة.
    await ensureTables(); await ensurePosTables(); await ensureVoucherTables(); await ensureStockVoucherTables(); await ensureDiscountCardTables()
    await loadStoredSettings()
    return await withTenantTransaction(async () => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-sale:${clientSaleId}`}))`

      const existing = await sql`SELECT * FROM voucher_header_tbl WHERE pos_client_sale_id = ${clientSaleId} LIMIT 1`
      if (existing[0]) return NextResponse.json({ ...existing[0], duplicate: true })

      const userId=requestUserId(request), pointId=Number(data.pos_point_id||0)
      if(!userId||!pointId)return NextResponse.json({error:"نقطة البيع والمستخدم مطلوبان"},{status:400})
      const point=await getPosPoint(pointId,userId);if(!point)return NextResponse.json({error:"نقطة البيع غير متاحة لهذا المستخدم"},{status:403})
      const operationPermission=data.cashier_action==="تعديل فاتورة"?"editInvoice":data.pos_mode==="return"?"return":data.pos_mode==="gift"?"gift":"sale"
      if(!await canUsePosCashierPermission(userId,Number(point.branch_id),operationPermission))return posPermissionDenied(operationPermission,"لا توجد لديك صلاحية تنفيذ هذه الحركة من الكاشير")
      if(Number(data.discount_value||0)>0&&!await canUsePosCashierPermission(userId,Number(point.branch_id),"invoiceDiscount"))return posPermissionDenied("invoiceDiscount","لا توجد لديك صلاحية إدخال خصم فاتورة من الكاشير")
      if(data.items.some((item:any)=>Number(item.discount_percent??item.discount??0)>0)&&!await canUsePosCashierPermission(userId,Number(point.branch_id),"itemDiscount"))return posPermissionDenied("itemDiscount","لا توجد لديك صلاحية إدخال خصم صنف من الكاشير")
      if(data.items.some((item:any)=>item.quantity_adjusted===true)&&!await canUsePosCashierPermission(userId,Number(point.branch_id),"editQuantity"))return posPermissionDenied("editQuantity","لا توجد لديك صلاحية تعديل كمية الصنف من الكاشير")
      const session=await getOpenPosSession(pointId,userId);if(!session)return NextResponse.json({error:"يجب فتح أو استلام عهدة قبل البيع"},{status:400})
      if(Number(data.pos_session_id)!==Number(session.id))return NextResponse.json({error:"جلسة العهدة تغيرت؛ حدّث الشاشة وحاول مرة أخرى"},{status:409})
      return savePosSaleCore(request,data,{userId,point,session,clientSaleId,discountOverride:{scope:"pos",allowed:()=>canUsePosCashierPermission(userId,Number(point.branch_id),"overrideDiscount")}})
    })
  } catch (error) {
    console.error("Error creating POS sale:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "فشل حفظ عملية البيع" }, { status: Number((error as {status?:number})?.status)||500 })
  }
}
