import sql, { withTenantDb } from "@/lib/database"
import { ensureTables as ensureSalesVoucherTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables } from "@/app/api/pos/_lib"
import { ensureRestaurantTables } from "@/lib/restaurant"
import { ensureBranchSymbolColumn } from "@/lib/branch-symbol"

// النسخة التجريبية تبدأ بنقطة بيع واحدة وموقع مطعم واحد جاهزين (app/api/management/companies/trial/route.ts):
// الفرع والمستودع والعملة الأساسية وفئة السعر الافتراضية، ودفتر "0" لفواتير البيع. الحسابات تُترك فارغة
// (تُستخدم حسابات المستخدم/الإعدادات الافتراضية)، وايميل مدير النظام والمسؤول = ايميل منشئ الشركة.
export async function seedTrialSalesPoints(dbName: string, ownerEmail: string) {
  return withTenantDb(dbName, async () => {
    await ensureSalesVoucherTables()
    await ensurePosTables()
    await ensureRestaurantTables()
    await ensureBranchSymbolColumn()

    const [branch] = await sql`SELECT id FROM branches WHERE COALESCE(status, 1) <> 3 AND NOT COALESCE(is_bank_branch, false) ORDER BY id LIMIT 1`
    const [warehouse] = await sql`SELECT id FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY id LIMIT 1`
    const [currency] = await sql`SELECT id FROM currency WHERE COALESCE(is_active, true) ORDER BY id LIMIT 1`
    const [book] = await sql`SELECT id FROM voucher_books_tbl ORDER BY (name = '0') DESC, id LIMIT 1`
    const [priceCategory] = await sql`SELECT id FROM pricecategory WHERE COALESCE(status, 1) = 1 ORDER BY id LIMIT 1`
    const [owner] = await sql`SELECT MIN(user_id) AS user_id FROM user_settings`
    if (!branch || !warehouse || !currency || !book || !priceCategory) {
      throw new Error("تعذر تجهيز نقطة البيع وموقع المطعم: إعدادات الشركة الأساسية ناقصة")
    }
    const email = String(ownerEmail || "").trim().toLowerCase().slice(0, 150) || null

    const [existingPoint] = await sql`SELECT id FROM pos_points_tbl WHERE COALESCE(status, 1) <> 3 LIMIT 1`
    if (!existingPoint) {
      const [point] = await sql`
        INSERT INTO pos_points_tbl (code, name, branch_id, main_warehouse_id, currency_id, sales_book_id, price_category_id, admin_email, manager_email, status)
        VALUES ('P000000001', 'نقطة بيع 1', ${branch.id}, ${warehouse.id}, ${currency.id}, ${book.id}, ${priceCategory.id}, ${email}, ${email}, 1)
        RETURNING id
      `
      if (owner?.user_id != null) {
        await sql`INSERT INTO pos_point_users_tbl (pos_point_id, user_id, is_default) VALUES (${point.id}, ${owner.user_id}, true) ON CONFLICT DO NOTHING`
      }
    }

    const [existingLocation] = await sql`SELECT id FROM restaurant_locations_tbl WHERE status <> 3 LIMIT 1`
    if (!existingLocation) {
      await sql`
        INSERT INTO restaurant_locations_tbl (code, name, branch_id, warehouse_id, currency_id, price_category_id, sales_book_id, admin_email, manager_email, status, created_by)
        VALUES ('L001', 'موقع مطعم 1', ${branch.id}, ${warehouse.id}, ${currency.id}, ${priceCategory.id}, ${book.id}, ${email}, ${email}, 1, ${owner?.user_id != null ? String(owner.user_id) : null})
      `
    }
  })
}
