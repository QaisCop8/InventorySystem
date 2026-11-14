import sql, { withTenantTransaction } from "@/lib/database"
import { ensureOpeningBalanceClearingAccount, type OpeningBalanceLine } from "@/lib/opening-balances"
import { AutoJournalLine, INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, getRateByDate } from "@/lib/auto-journals"
import { withYearOpened } from "@/lib/year-end-closing"
import { STOCK_IN_VCH_TYPE, STOCK_OUT_VCH_TYPE, applyVoucherStockEffect, regenerateVoucherCode, saveVoucherItems } from "@/app/api/stock-vouchers/_lib"
import { StepContext, mapGet, num, text } from "@/lib/shamel-migration/core"
import { currencyId } from "@/lib/shamel-migration/definitions"

// الأرصدة الافتتاحية: تُجمَع أسطر كل الدفعات (shamel_migration_stage) وتُقيَّد مرة واحدة مع الدفعة الأخيرة —
// الحسابات بسند قيد آلي لكل عملة (lib/opening-balances.ts)، والكميات بسند ادخال بضاعة (وسند اخراج للسالب) لكل مستودع.
// وضع «التعريفات فقط»: الرصيد/الكمية الحالية بالشامل؛ وضع «التعريفات والسندات»: رصيد أول المدة (والسندات تكمل الباقي).

type Row = Record<string, unknown>

export async function stageRows(runId: number, step: string, rows: Row[]) {
  await sql`CREATE TABLE IF NOT EXISTS shamel_migration_stage (id BIGSERIAL PRIMARY KEY, run_id INTEGER NOT NULL, step VARCHAR(60) NOT NULL, payload JSONB NOT NULL)`
  if (!rows.length) return
  await sql`INSERT INTO shamel_migration_stage (run_id, step, payload) SELECT ${runId}, ${step}, value FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb)`
}

async function takeStaged(runId: number, step: string): Promise<Row[]> {
  await sql`CREATE TABLE IF NOT EXISTS shamel_migration_stage (id BIGSERIAL PRIMARY KEY, run_id INTEGER NOT NULL, step VARCHAR(60) NOT NULL, payload JSONB NOT NULL)`
  const rows = await sql`SELECT payload FROM shamel_migration_stage WHERE run_id = ${runId} AND step = ${step} ORDER BY id`
  await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${runId} AND step = ${step}`
  return rows.map((row: any) => row.payload as Row)
}

/** يمنع تكرار القيد عند إعادة تشغيل الترحيل: مفتاح لكل سند أرصدة مُنفَّذ (عملة الحسابات، مستودع واتجاه الكميات) */
async function alreadyPosted(key: string) {
  return (await sql`SELECT 1 FROM shamel_migration_map WHERE kind = 'posted' AND shamel_key = ${key} LIMIT 1`).length > 0
}
const markPosted = (key: string, voucherId: number) =>
  sql`INSERT INTO shamel_migration_map (kind, shamel_key, web_id) VALUES ('posted', ${key}, ${voucherId}) ON CONFLICT DO NOTHING`


export async function processAccountBalances(rows: Row[], ctx: StepContext, last: boolean) {
  await stageRows(ctx.run.id, ctx.step, rows)
  ctx.stats.received += rows.length
  if (!last) return
  const all = await takeStaged(ctx.run.id, ctx.step)
  const useStart = ctx.run.mode === "full"
  const accounts = await mapGet("account", all.map((row) => text(row.code)))
  const parentIds = new Set(((await sql`SELECT DISTINCT father_id FROM account_tbl WHERE father_id IS NOT NULL`) as any[]).map((row) => Number(row.father_id)))
  const lines: OpeningBalanceLine[] = []
  let key = 0
  for (const row of all) {
    const code = text(row.code)
    // الشامل: الرصيد الموجب دائن والسالب مدين؛ هنا الموجب مدين
    const balance = useStart ? num(row.start_balance) : num(row.current_balance)
    if (Math.abs(balance) < 0.0005) { ctx.stats.skipped++; continue }
    const accountIdValue = accounts.get(code)
    if (!accountIdValue) { ctx.error(code, "الحساب غير موجود — لم يُقيَّد رصيده الافتتاحي"); continue }
    if (parentIds.has(accountIdValue)) { ctx.warn(code, "حساب أب — رصيده مجموع أبنائه فلم يُقيَّد"); ctx.stats.skipped++; continue }
    const curr = await currencyId(row.balance_currency)
    if (!curr) { ctx.error(code, `عملة الرصيد ${text(row.balance_currency)} غير معرّفة`); continue }
    lines.push({ key: key++, accountId: accountIdValue, amount: -balance, currencyId: curr, date: ctx.run.balance_date, label: code })
  }
  // سند قيد لكل عملة مقابل الحساب الوسيط (نفس lib/opening-balances.ts) — داخل معاملته مع فتح سنة التاريخ
  // مؤقتاً (تاريخ الأرصدة قد يسبق سنة العمل الحالية)
  const clearing = await ensureOpeningBalanceClearingAccount()
  const baseCurrencyId = await getBaseCurrencyId()
  const byCurrency = new Map<number, OpeningBalanceLine[]>()
  for (const line of lines) byCurrency.set(line.currencyId, [...(byCurrency.get(line.currencyId) || []), line])
  const vouchers: string[] = []
  for (const [currency, group] of byCurrency) {
    const postedKey = `${ctx.step}:${currency}`
    if (await alreadyPosted(postedKey)) {
      ctx.warn("", `الأرصدة الافتتاحية بالعملة ${currency} قُيِّدت في ترحيل سابق — لم تُقيَّد مرة أخرى`)
      ctx.stats.skipped += group.length
      continue
    }
    try {
      const day = ctx.run.balance_date
      const journal = await withTenantTransaction(() => withYearOpened(Number(day.slice(0, 4)), async () => {
        const rate = currency === Number(baseCurrencyId) ? 1 : (await getRateByDate(currency, day, baseCurrencyId)) ?? 1
        // createAutoJournal يقرّب كل سطر لخانتين ويوازن بعملة الأساس سطراً سطراً — مئات الأسطر بعملة أجنبية تتراكم
        // فروق تقريبها، فطرف الحساب الوسيط بعملة الأساس = فرق نفس القيم المقرّبة (بالقروش، بلا فروق كسور)
        const journalLines: AutoJournalLine[] = group.map((line) => ({
          accountId: line.accountId, creditDebit: line.amount > 0 ? 1 : 2, amount: Math.round(Math.abs(line.amount) * 100) / 100, currencyId: currency, rate,
          note: `رصيد افتتاحي - ${line.label}`.slice(0, 70),
        }))
        const netCents = journalLines.reduce((sum, line) => sum + (line.creditDebit === 1 ? 1 : -1) * Math.round(line.amount * rate * 100), 0)
        if (netCents !== 0) journalLines.push({ accountId: clearing.id, creditDebit: netCents > 0 ? 2 : 1, amount: Math.abs(netCents) / 100, currencyId: Number(baseCurrencyId) || currency, rate: 1, note: "أرصدة افتتاحية - ترحيل من الشامل" })
        return createAutoJournal({
          userId: ctx.run.created_by, branchId: ctx.run.branch_id, date: day, currencyId: currency, rate,
          note: "الأرصدة الافتتاحية - ترحيل من الشامل", internalVoucherId: INTERNAL_VOUCHER.OPENING_BALANCE, lines: journalLines,
        })
      }))
      await markPosted(postedKey, journal.id)
      vouchers.push(journal.code)
      ctx.stats.created += group.length
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء سند القيد"
      for (const line of group) ctx.error(line.label, message)
    }
  }
  if (vouchers.length) ctx.info(`سندات قيد الأرصدة الافتتاحية: ${vouchers.join("، ")}`)
}

/** دفتر سندات للنوع: الافتراضي لمنشئ الترحيل، وإلا أول دفتر مسموح له، وإلا أول دفتر مرتبط بالنوع لأي مستخدم */
export async function voucherBookFor(userId: string, vchType: number): Promise<number | null> {
  const rows = await sql`
    SELECT p.vch_book_id, COALESCE(p.is_default, 0) AS is_default, (us.user_id::text = ${userId}) AS mine
    FROM voucher_book_user_permissions_tbl p
    JOIN voucher_books_tbl b ON b.id = p.vch_book_id
    LEFT JOIN user_settings us ON us.id = p.user_id
    WHERE p.voucher_type_id = ${vchType}
    ORDER BY (us.user_id::text = ${userId}) DESC, COALESCE(p.is_default, 0) DESC, p.vch_book_id
    LIMIT 1
  `
  return rows[0] ? Number((rows[0] as any).vch_book_id) : null
}

export async function processStockBalances(rows: Row[], ctx: StepContext, last: boolean) {
  await stageRows(ctx.run.id, ctx.step, rows)
  ctx.stats.received += rows.length
  if (!last) return
  const all = await takeStaged(ctx.run.id, ctx.step)
  const useStart = ctx.run.mode === "full"
  const items = await mapGet("item", all.map((row) => text(row.code)))
  const stores = await mapGet("store", all.map((row) => String(num(row.store_pos))))
  const units = new Map<number, number>(((await sql`
    SELECT DISTINCT ON (product_id) product_id, unit_id FROM product_units WHERE product_id = ANY(${[...items.values()]}::int[]) ORDER BY product_id, to_main_qnty, id
  `) as any[]).map((row) => [Number(row.product_id), Number(row.unit_id)]))

  // مستودع ⇐ (داخل، خارج)
  const groups = new Map<number, { in: any[]; out: any[] }>()
  for (const row of all) {
    const code = text(row.code)
    const qty = useStart ? num(row.start_balance) : num(row.qnty)
    if (Math.abs(qty) < 0.0000005) { ctx.stats.skipped++; continue }
    const productId = items.get(code)
    const storeId = stores.get(String(num(row.store_pos)))
    if (!productId) { ctx.error(code, "الصنف غير موجود — لم تُدخل كميته"); continue }
    if (!storeId) { ctx.error(code, `المستودع ${num(row.store_pos) + 1} غير موجود`); continue }
    const group = groups.get(storeId) || { in: [], out: [] }
    group[qty > 0 ? "in" : "out"].push({ product_id: productId, unit_id: units.get(productId) || null, quantity: Math.abs(qty), price: Math.max(0, num(row.cost)), store_id: storeId, note: code })
    groups.set(storeId, group)
  }

  const codes: string[] = []
  for (const [storeId, group] of groups) {
    for (const [direction, lines] of [["in", group.in], ["out", group.out]] as const) {
      if (!lines.length) continue
      const vchType = direction === "in" ? STOCK_IN_VCH_TYPE : STOCK_OUT_VCH_TYPE
      const postedKey = `${ctx.step}:${storeId}:${direction}`
      if (await alreadyPosted(postedKey)) {
        ctx.warn("", `كميات أول المدة للمستودع ${storeId} أُدخلت في ترحيل سابق — لم تُدخل مرة أخرى`)
        ctx.stats.skipped += lines.length
        continue
      }
      try {
        const bookId = await voucherBookFor(ctx.run.created_by, vchType)
        if (!bookId) throw new Error(`لا يوجد دفتر سندات لـ ${direction === "in" ? "سند ادخال بضاعة" : "سند اخراج بضاعة"} — عرّفه من صلاحيات دفاتر السندات`)
        const code = await withTenantTransaction(() => withYearOpened(Number(ctx.run.balance_date.slice(0, 4)), async () => {
          await sql`SELECT pg_advisory_xact_lock(hashtext(${`stock-voucher-number:${vchType}`}))`
          const vchCode = await regenerateVoucherCode("", vchType, bookId, ctx.run.branch_id)
          if (!vchCode) throw new Error("تعذر توليد رقم السند")
          const amount = lines.reduce((sum, line) => sum + line.quantity * line.price, 0)
          const voucher = (await sql`
            INSERT INTO voucher_header_tbl (
              vch_type, vch_code, vch_date, vch_book_id, branch_id, currency_id, rate, to_store_id, from_store_id,
              amount, manual_voucher, note, status, vch_status, is_printed
            ) VALUES (
              ${vchType}, ${vchCode}, ${ctx.run.balance_date}, ${bookId}, ${ctx.run.branch_id}, ${1}, 1,
              ${direction === "in" ? storeId : null}, ${direction === "out" ? storeId : null},
              ${Math.round(amount * 1000) / 1000}, 'SHAMEL', ${"كميات أول المدة - ترحيل من الشامل"}, 2, 2, 0
            ) RETURNING id
          `)[0] as any
          const saved = await saveVoucherItems(Number(voucher.id), lines)
          await applyVoucherStockEffect(vchType, Number(voucher.id), saved, direction === "out" ? storeId : null, direction === "in" ? storeId : null)
          await markPosted(postedKey, Number(voucher.id))
          return vchCode
        }))
        codes.push(code)
        ctx.stats.created += lines.length
      } catch (error) {
        for (const line of lines) ctx.error(line.note, error instanceof Error ? error.message : String(error))
      }
    }
  }
  if (codes.length) ctx.info(`سندات كميات أول المدة: ${codes.join("، ")}`)
}
