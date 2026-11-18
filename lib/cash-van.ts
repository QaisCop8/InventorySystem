import sql, { withTenantTransaction } from "@/lib/database"
import { ensureCarsTable } from "@/app/api/cars/_lib"
import { getProductBalances } from "@/lib/item-inventory-reports"
import { createAutoJournal, getBaseCurrencyId, INTERNAL_VOUCHER } from "@/lib/auto-journals"

// البيع المتجول (2026-11-18): السيارة = مستودع متنقل + مندوب + صندوق + حسابات مصاريفها (cars).
// التحميل/التفريغ = ارسالية داخلية من/إلى مستودع السيارة، البيع من مستودع السيارة، والنقدية في صندوق السيارة.
// هنا: ملخص كل سيارة لفترة، وقيدا مصروف السيارة وتسليم النقدية.

export type CarExpenseKind = "insurance" | "fuel" | "maintenance"
export const CAR_EXPENSE_LABELS: Record<CarExpenseKind, string> = {
  insurance: "مصروف التامين والترخيص",
  fuel: "مصروف المحروقات",
  maintenance: "مصروف صيانة",
}
const EXPENSE_COLUMN: Record<CarExpenseKind, string> = { insurance: "insurance_account_id", fuel: "fuel_account_id", maintenance: "maintenance_account_id" }

const num = (value: unknown) => Number(value) || 0

async function loadCar(carId: number) {
  await ensureCarsTable()
  const [car] = (await sql`SELECT * FROM cars WHERE id = ${carId} AND COALESCE(status, 1) <> 3`) as any[]
  if (!car) throw new Error("السيارة غير موجودة")
  return car
}

/** ملخص السيارات المعرّف لها مستودع: المخزون، المبيعات والمرتجعات من مستودعها، حركة صندوقها، ومصاريفها في الفترة. */
export async function cashVanSummary(from: string, to: string) {
  await ensureCarsTable()
  const cars = (await sql`
    SELECT c.*, s.name AS salesman_name, w.warehouse_name, ca.code AS cash_account_code, ca.name AS cash_account_name
    FROM cars c
    LEFT JOIN salesmen s ON s.id = c.salesman_id
    LEFT JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN account_tbl ca ON ca.id = c.cash_account_id
    WHERE COALESCE(c.status, 1) <> 3
    ORDER BY c.car_code`) as any[]
  const rows = []
  for (const car of cars) {
    const warehouseId = Number(car.warehouse_id) || 0
    let stockQuantity = 0, stockValue = 0, itemsCount = 0
    if (warehouseId) {
      const balances = (await getProductBalances(0, to, 0, "", { warehouseIds: [warehouseId], includeUnposted: true })) as any[]
      for (const row of balances) {
        const balance = num(row.balance)
        if (Math.abs(balance) < 0.000001) continue
        itemsCount += 1
        stockQuantity += balance
        stockValue += balance * num(row.average_cost)
      }
    }
    // المبيعات/المرتجعات: سندات فيها سطر من مستودع السيارة (بعملة الأساس)
    const [sales] = warehouseId ? (await sql`
      SELECT
        COALESCE(SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1)) FILTER (WHERE h.vch_type IN (12, 13)), 0)::float AS sales,
        COALESCE(SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1)) FILTER (WHERE h.vch_type = 16), 0)::float AS returns,
        COUNT(*) FILTER (WHERE h.vch_type IN (12, 13))::int AS sales_count
      FROM voucher_header_tbl h
      WHERE h.vch_type IN (12, 13, 16) AND COALESCE(h.status, 1) <> 3
        AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
        AND EXISTS (SELECT 1 FROM voucher_items_tbl i WHERE i.voucher_id = h.id AND i.store_id = ${warehouseId})`) as any[] : [{}]
    const accountMovement = async (accountId: number | null) => {
      if (!accountId) return { debit: 0, credit: 0, balance: 0 }
      const [row] = (await sql`
        SELECT
          COALESCE(SUM(d.base_curr_amount) FILTER (WHERE d.credit_debit = 1 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date), 0)::float AS debit,
          COALESCE(SUM(d.base_curr_amount) FILTER (WHERE d.credit_debit = 2 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date), 0)::float AS credit,
          COALESCE(SUM(CASE WHEN d.credit_debit = 1 THEN d.base_curr_amount ELSE -d.base_curr_amount END) FILTER (WHERE h.vch_date::date <= ${to}::date), 0)::float AS balance
        FROM voucher_journal_detail_tbl d JOIN voucher_header_tbl h ON h.id = d.voucher_id
        WHERE d.account_id = ${accountId} AND COALESCE(h.status, 1) <> 3`) as any[]
      return { debit: num(row?.debit), credit: num(row?.credit), balance: num(row?.balance) }
    }
    const cash = await accountMovement(Number(car.cash_account_id) || null)
    const expenses: Record<CarExpenseKind, number> = { insurance: 0, fuel: 0, maintenance: 0 }
    for (const kind of Object.keys(EXPENSE_COLUMN) as CarExpenseKind[]) {
      const movement = await accountMovement(Number(car[EXPENSE_COLUMN[kind]]) || null)
      expenses[kind] = movement.debit - movement.credit
    }
    rows.push({
      id: Number(car.id), car_code: car.car_code, name: car.name, plate_number: car.plate_number,
      salesman_id: car.salesman_id, salesman_name: car.salesman_name || "", warehouse_id: car.warehouse_id, warehouse_name: car.warehouse_name || "",
      cash_account_id: car.cash_account_id, cash_account_name: car.cash_account_name ? `${car.cash_account_name} (${car.cash_account_code})` : "",
      insurance_account_id: car.insurance_account_id, fuel_account_id: car.fuel_account_id, maintenance_account_id: car.maintenance_account_id,
      items_count: itemsCount, stock_quantity: stockQuantity, stock_value: stockValue,
      sales: num(sales?.sales), returns: num(sales?.returns), sales_count: num(sales?.sales_count),
      cash_in: cash.debit, cash_out: cash.credit, cash_balance: cash.balance,
      expenses, expenses_total: expenses.insurance + expenses.fuel + expenses.maintenance,
      ready: Boolean(warehouseId && car.salesman_id && car.cash_account_id),
    })
  }
  return rows
}

async function userBranch(userId: string): Promise<number> {
  const [row] = (await sql`SELECT branch_id FROM user_settings WHERE user_id::text = ${userId} LIMIT 1`) as any[]
  if (Number(row?.branch_id)) return Number(row.branch_id)
  const [first] = (await sql`SELECT id FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY id LIMIT 1`) as any[]
  return Number(first?.id) || 1
}

/** مصروف سيارة: مدين حساب المصروف المعرّف على السيارة، دائن الحساب المدفوع منه (افتراضياً صندوق السيارة). */
export async function recordCarExpense(input: { carId: number; kind: CarExpenseKind; amount: number; date: string; paidAccountId?: number | null; note?: string; userId: string }) {
  const car = await loadCar(input.carId)
  const expenseAccount = Number(car[EXPENSE_COLUMN[input.kind]]) || 0
  if (!expenseAccount) throw new Error(`عرّف «حساب ${CAR_EXPENSE_LABELS[input.kind]}» في تعريف السيارة ${car.name}`)
  const paidAccount = Number(input.paidAccountId) || Number(car.cash_account_id) || 0
  if (!paidAccount) throw new Error("اختر الحساب المدفوع منه (أو عرّف صندوق السيارة)")
  if (!(input.amount > 0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر")
  const currencyId = (await getBaseCurrencyId()) || 1
  const branchId = await userBranch(input.userId)
  const note = `${CAR_EXPENSE_LABELS[input.kind]} — ${car.name}${car.plate_number ? ` (${car.plate_number})` : ""}${input.note ? ` — ${input.note}` : ""}`
  return withTenantTransaction(() => createAutoJournal({
    userId: input.userId, branchId, date: input.date, currencyId, rate: 1, note, internalVoucherId: INTERNAL_VOUCHER.CAR_EXPENSE,
    manualVoucher: car.car_code,
    lines: [
      { accountId: expenseAccount, creditDebit: 1, amount: input.amount, currencyId, rate: 1, note },
      { accountId: paidAccount, creditDebit: 2, amount: input.amount, currencyId, rate: 1, note },
    ],
  }))
}

/** تسليم نقدية السيارة: مدين الصندوق المستلم، دائن صندوق السيارة. */
export async function handOverVanCash(input: { carId: number; amount: number; date: string; toAccountId: number; note?: string; userId: string }) {
  const car = await loadCar(input.carId)
  const vanCash = Number(car.cash_account_id) || 0
  if (!vanCash) throw new Error(`عرّف «صندوق السيارة» في تعريف السيارة ${car.name}`)
  if (!Number(input.toAccountId)) throw new Error("اختر الصندوق المستلم")
  if (Number(input.toAccountId) === vanCash) throw new Error("الصندوق المستلم هو صندوق السيارة نفسه")
  if (!(input.amount > 0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر")
  const currencyId = (await getBaseCurrencyId()) || 1
  const branchId = await userBranch(input.userId)
  const note = `تسليم نقدية سيارة ${car.name}${input.note ? ` — ${input.note}` : ""}`
  return withTenantTransaction(() => createAutoJournal({
    userId: input.userId, branchId, date: input.date, currencyId, rate: 1, note, internalVoucherId: INTERNAL_VOUCHER.VAN_CASH_HANDOVER,
    manualVoucher: car.car_code,
    lines: [
      { accountId: Number(input.toAccountId), creditDebit: 1, amount: input.amount, currencyId, rate: 1, note },
      { accountId: vanCash, creditDebit: 2, amount: input.amount, currencyId, rate: 1, note },
    ],
  }))
}
