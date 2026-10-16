import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"
import { authorizeProductType } from "@/app/api/inventory/products/_permissions"
import type { PoolClient } from "pg"
import { validateLeafAccounts } from "@/lib/leaf-accounts"

const accountColumns = {
  selling_account_id: "selling_account_id",
  purchase_account_id: "purchase_account_id",
  selling_returns_account_id: "selling_returns_account_id",
  purchase_returns_account_id: "purchase_returns_account_id",
  stock_end_account_id: "stock_end_account_id",
  stock_start_account_id: "stock_start_account_id",
  production_account_id: "production_account_id",
  lsti3mal_account_id: "lsti3mal_account_id",
} as const

export async function POST(request: NextRequest) {
  const authorization = await authorizeProductType(request, 1, "update")
  if (!authorization.ok) return authorization.response

  let client: PoolClient | null = null

  try {
    const body = await request.json()
    const requestedField = typeof body?.field === "string" ? body.field : ""
    if (!Object.hasOwn(accountColumns, requestedField)) {
      return NextResponse.json({ error: "حقل الحساب غير صالح" }, { status: 400 })
    }
    const column = accountColumns[requestedField as keyof typeof accountColumns]
    // حساب فارغ (null/0) مسموح: يُفرَّغ الحساب في الأصناف التالية
    const rawAccount = body?.account_id
    const accountId = rawAccount === null || rawAccount === undefined || rawAccount === "" || Number(rawAccount) === 0 ? null : Number(rawAccount)
    if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
      return NextResponse.json({ error: "يجب اختيار حساب صالح قبل النسخ" }, { status: 400 })
    }
    const parentError = accountId !== null ? await validateLeafAccounts([accountId]) : null
    if (parentError) return NextResponse.json({ error: parentError }, { status: 400 })
    // النسخ إلى الأصناف التالية فقط (ترتيب التنقل حسب id)
    const afterProductId = Number(body?.after_product_id)
    if (!Number.isInteger(afterProductId) || afterProductId <= 0) {
      return NextResponse.json({ error: "يجب حفظ الصنف أولاً قبل النسخ إلى الأصناف التالية" }, { status: 400 })
    }

    const pool = await getTenantPool()
    client = await pool.connect()
    if (accountId !== null) {
      const account = await client.query("SELECT id FROM account_tbl WHERE id = $1::int LIMIT 1", [accountId])
      if (!account.rows.length) return NextResponse.json({ error: "الحساب المحدد غير موجود" }, { status: 404 })
    }

    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${column} INTEGER`)
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1")
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false")
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    const updated = await client.query(
      `UPDATE products
       SET ${column} = $1::int, updated_at = CURRENT_TIMESTAMP
       WHERE id > $2::int AND COALESCE(type, 1) = 1 AND COALESCE(deleted, false) = false`,
      [accountId, afterProductId],
    )
    return NextResponse.json({ success: true, updated_count: updated.rowCount ?? 0 })
  } catch (error) {
    console.error("Failed to copy product account to all items:", error)
    return NextResponse.json({ error: "تعذر نسخ الحساب إلى الأصناف" }, { status: 500 })
  } finally {
    client?.release()
  }
}
