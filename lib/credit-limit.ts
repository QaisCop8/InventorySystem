import { amountFractionOptions } from "@/lib/decimals"
import sql from "@/lib/database"
import { hasNamedPermission } from "@/lib/permissions"
import { CREDIT_LIMIT_OVERRIDE_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY } from "@/lib/transaction-permission-definitions"

// حد الائتمان (حد الدين) للعميل = account_tbl.max_balance_amount (يُحفظ من شاشة العملاء "حد الائتمان"،
// وهو نفس السقف الذي يقرأه تقرير أعمار الذمم والملخص الصباحي). يُفحص فقط إن كان > 0: رصيد العميل
// الحالي (بعملة الأساس، بلا السند الجاري تعديله) + ما تضيفه الحركة الجديدة على ذمته يجب ألا يتجاوزه،
// إلا لمستخدم يملك صلاحية "السماح بتجاوز حد الدين".

export type CreditIncrease = { accountId: number; amount: number }

const round2 = (value: number) => Math.round(value * 100) / 100
const money = (value: number) => round2(value).toLocaleString("en-US", amountFractionOptions())

/** صافي ما يُضاف لذمة كل حساب من أسطر قيد (مدين − دائن) بعملة الأساس. */
export function creditIncreasesFromJournal(rows: any[]): CreditIncrease[] {
  return rows.map((row) => ({
    accountId: Number(row.account_id) || 0,
    amount: (Number(row.credit_debit) === 1 ? 1 : -1) * Number(row.base_curr_amount ?? Number(row.amount || 0) * (Number(row.rate) || 1)),
  }))
}

export async function validateCustomerCreditLimit({
  increases,
  excludeVoucherId = null,
  userId,
  branchId,
}: {
  increases: CreditIncrease[]
  excludeVoucherId?: number | null
  userId: string
  branchId?: number | null
}): Promise<string | null> {
  const totals = new Map<number, number>()
  for (const { accountId, amount } of increases) {
    if (accountId > 0 && Number.isFinite(amount)) totals.set(accountId, (totals.get(accountId) || 0) + amount)
  }
  const accountIds = [...totals].filter(([, amount]) => amount > 0.005).map(([accountId]) => accountId)
  if (!accountIds.length) return null

  const rows = await sql`
    SELECT a.id, a.name, COALESCE(a.max_balance_amount, 0)::float8 AS credit_limit,
           COALESCE((
             SELECT SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * COALESCE(vjd.base_curr_amount, vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1)))
             FROM voucher_journal_detail_tbl vjd
             JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id AND vh.status <> 3
             WHERE vjd.account_id = a.id AND vjd.voucher_id <> ${Number(excludeVoucherId) || 0}
           ), 0)::float8 AS balance
    FROM account_tbl a
    WHERE a.id = ANY(${accountIds}::int[])
      AND COALESCE(a.max_balance_amount, 0) > 0
      AND EXISTS (SELECT 1 FROM customers c WHERE c.account_id = a.id AND COALESCE(c.isDeleted, false) = false)
  `
  const exceeded = rows
    .map((row: any) => {
      const limit = Number(row.credit_limit)
      const balance = Number(row.balance)
      const after = balance + (totals.get(Number(row.id)) || 0)
      return { name: String(row.name || ""), limit, balance, after }
    })
    .filter((row: { limit: number; after: number }) => round2(row.after) > round2(row.limit))
  if (!exceeded.length) return null

  if (await hasNamedPermission(userId, CREDIT_LIMIT_OVERRIDE_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY, branchId)) return null

  const row = exceeded[0]
  return `تجاوز حد الائتمان للعميل "${row.name}": الحد ${money(row.limit)}، الرصيد الحالي ${money(row.balance)}، والرصيد بعد الحركة ${money(row.after)}. لا تملك صلاحية "${CREDIT_LIMIT_OVERRIDE_PERMISSION}".`
}
