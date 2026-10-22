import { authorizeCustomerType, authorizeStoredCustomer } from "@/app/api/customers/_permissions"
import { findAccountUsages, findUsages, usageMessage } from "@/lib/delete-guard"
import { type NextRequest, NextResponse } from "next/server"
import { generateCustomerNumber } from "@/lib/number-generator";
import sql from "@/lib/database"


export async function GET(req: NextRequest) {
  try {
    console.log("[v0] API: Starting number generation...");

    if (!process.env.DATABASE_URL) {
      console.error("[v0] API: DATABASE_URL not found");
      return NextResponse.json(
        { message: "خطأ في إعدادات قاعدة البيانات", error: "DATABASE_URL not configured" },
        { status: 500 }
      );
    }

    const isSupplier = req.nextUrl.searchParams.get("isSupplier") === "true";
    const isSalesman = req.nextUrl.searchParams.get("isSalesman") === "true";
    const permission = await authorizeCustomerType(req, isSupplier ? 2 : isSalesman ? 3 : 1, "create")
    if (!permission.ok) return permission.response

    const customerNumber = await generateCustomerNumber(isSupplier, isSalesman);
    console.log("[v0] API: Generated number:", customerNumber);

    return NextResponse.json({ customerNumber });
  } catch (error) {
    console.error("[v0] API: Error generating number:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        message: "فشل في توليد الرقم",
        error: errorMessage,
        details: "Database connection or query failed",
      },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}


// حذف عميل/مورد/مشترك (الملفات والتعريفات): يُرفض إن كان حسابه أو بطاقته مستخدماً في أي حركة أو تعريف آخر
// (سندات، قيود، شيكات، طلبيات، نماذج عملاء، دفعات البوابة…) — lib/delete-guard.ts. وإلا تُعلَّم البطاقة محذوفة
// (isdeleted) ويُعلَّم حسابها محذوفاً (status = 3) حتى لا يبقى حساب يتيم في الشجرة.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const permission = await authorizeStoredCustomer(req, id, "delete")
    if (!permission.ok) return permission.response
    const customer = (await sql`SELECT id, name, type, account_id FROM customers WHERE id = ${id} AND COALESCE(isdeleted, false) = false`)[0] as any
    if (!customer) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const kind = Number(customer.type) === 2 ? "المورد" : Number(customer.type) === 3 ? "المشترك" : "العميل"
    const accountId = Number(customer.account_id) || 0

    const own = ["customers", "customer_branches", "customer_users", "customer_portal_links_tbl", "customer_categories", "supplier_categories"]
    const usages = new Set<string>()
    if (accountId) {
      for (const usage of await findAccountUsages(accountId, own)) usages.add(usage)
      // أعمدة customer_id/supplier_id تحفظ حساب العميل (الطلبيات، الشيكات…)
      for (const usage of await findUsages(accountId, { idColumns: /^(customer_id|supplier_id|party_id|customer_account_id)$/, excludeTables: own })) usages.add(usage)
    }
    // ارتباطات ببطاقة العميل نفسها (نماذج العملاء والأصناف…)
    for (const usage of await findUsages(id, { idColumns: /^(customer_card_id|customers_id)$/, excludeTables: own })) usages.add(usage)
    if (usages.size) return NextResponse.json({ error: usageMessage(kind, String(customer.name || ""), [...usages]) }, { status: 400 })

    await sql`UPDATE customers SET isdeleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    if (accountId) await sql`UPDATE account_tbl SET status = 3, last_update_date = CURRENT_TIMESTAMP WHERE id = ${accountId}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[customers] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف السجل" }, { status: 500 })
  }
}
