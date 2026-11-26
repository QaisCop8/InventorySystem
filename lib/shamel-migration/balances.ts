import sql, { withTenantTransaction } from "@/lib/database"
import { ensureOpeningBalanceClearingAccount, type OpeningBalanceLine } from "@/lib/opening-balances"
import { AutoJournalLine, INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, getRateByDate } from "@/lib/auto-journals"
import { withYearOpened } from "@/lib/year-end-closing"
import { STOCK_IN_VCH_TYPE, STOCK_OUT_VCH_TYPE, applyStockMovement, applyVoucherStockEffect, regenerateVoucherCode, saveVoucherItems } from "@/app/api/stock-vouchers/_lib"
import { StepContext, insertRow, mapGet, num, text } from "@/lib/shamel-migration/core"
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

/**
 * يمنع تكرار القيد عند إعادة تشغيل الترحيل: كل سند أرصدة مُنفَّذ يُسجَّل بمفتاح (عملة الحسابات، أو مستودع واتجاه الكميات)
 * + رقمه، فإعادة التشغيل تقيّد فقط الأسطر غير الموجودة في سندات سابقة غير ملغاة — سطر فشل سابقاً (حساب/صنف لم يكن
 * مرحّلاً بعد) يُقيَّد لاحقاً، وما قُيِّد لا يتكرر. المفتاح القديم بلا رقم (prefix) مشمول أيضاً.
 */
async function postedVoucherIds(prefix: string): Promise<number[]> {
  const rows = await sql`
    SELECT m.web_id FROM shamel_migration_map m JOIN voucher_header_tbl h ON h.id = m.web_id AND COALESCE(h.status, 1) <> 3
    WHERE m.kind = 'posted' AND (m.shamel_key = ${prefix} OR m.shamel_key LIKE ${prefix + ":%"})`
  return rows.map((row: any) => Number(row.web_id))
}
const markPosted = (key: string, voucherId: number) =>
  sql`INSERT INTO shamel_migration_map (kind, shamel_key, web_id) VALUES ('posted', ${key}, ${voucherId}) ON CONFLICT DO NOTHING`


export async function processAccountBalances(rows: Row[], ctx: StepContext, last: boolean) {
  await stageRows(ctx.run.id, ctx.step, rows)
  ctx.stats.received += rows.length
  if (!last) return
  const all = await takeStaged(ctx.run.id, ctx.step)
  // سند الأرصدة الافتتاحية = «Start Balance» من جدول balances بالشامل في كل الأنماط (طلب المستخدم 2026-11-16):
  // الرصيد الحالي كان يُقيَّد في «التعريفات فقط» فتتكرر الحركات حين تُرحَّل السندات لاحقاً بـ«السندات فقط»
  const useStart = true
  const accounts = await mapGet("account", all.map((row) => text(row.code)))
  const parentIds = new Set(((await sql`SELECT DISTINCT father_id FROM account_tbl WHERE father_id IS NOT NULL`) as any[]).map((row) => Number(row.father_id)))
  const lines: OpeningBalanceLine[] = []
  const shamelRates = new Map<number, number>()
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
    // سعر الصرف الحالي بجدول الأرصدة بالشامل (Current Rate) — سعر سند قيد الأرصدة لهذه العملة
    const shamelRate = num(row.current_rate)
    if (shamelRate > 0 && !shamelRates.has(curr)) shamelRates.set(curr, shamelRate)
  }
  // سند قيد لكل عملة مقابل الحساب الوسيط (نفس lib/opening-balances.ts) — داخل معاملته مع فتح سنة التاريخ
  // مؤقتاً (تاريخ الأرصدة قد يسبق سنة العمل الحالية)
  const clearing = await ensureOpeningBalanceClearingAccount()
  const baseCurrencyId = await getBaseCurrencyId()
  const byCurrency = new Map<number, OpeningBalanceLine[]>()
  for (const line of lines) byCurrency.set(line.currencyId, [...(byCurrency.get(line.currencyId) || []), line])
  const vouchers: string[] = []
  for (let [currency, group] of byCurrency) {
    const postedPrefix = `${ctx.step}:${currency}`
    const previous = await postedVoucherIds(postedPrefix)
    if (previous.length) {
      // سند رُحِّل بسعر 1 لعملة أجنبية (لا سعر صرف بتاريخ الأرصدة هنا) ⇐ يُصحَّح بسعر الشامل
      if (currency !== Number(baseCurrencyId) && shamelRates.get(currency)) await fixOpeningJournalRate(previous, shamelRates.get(currency)!, clearing.id, Number(baseCurrencyId), ctx)
      // سندات سابقة طرف الوسيط فيها بعملة الأساس ⇐ يُحوَّل لعملة السند (المدين = الدائن بعملة السند)
      if (currency !== Number(baseCurrencyId)) await fixClearingLineCurrency(previous, clearing.id, ctx)
      const postedAccounts = new Set(((await sql`SELECT DISTINCT account_id FROM voucher_journal_detail_tbl WHERE voucher_id = ANY(${previous}::int[])`) as any[]).map((row) => Number(row.account_id)))
      const fresh = group.filter((line) => !postedAccounts.has(line.accountId))
      ctx.stats.skipped += group.length - fresh.length
      group = fresh
      if (!group.length) continue
    }
    try {
      const day = ctx.run.balance_date
      const journal = await withTenantTransaction(() => withYearOpened(Number(day.slice(0, 4)), async () => {
        const rate = currency === Number(baseCurrencyId) ? 1 : shamelRates.get(currency) ?? (await getRateByDate(currency, day, baseCurrencyId)) ?? 1
        // createAutoJournal يقرّب كل سطر لخانتين ويوازن بعملة الأساس سطراً سطراً — مئات الأسطر بعملة أجنبية تتراكم
        // فروق تقريبها، فطرف الحساب الوسيط بعملة الأساس = فرق نفس القيم المقرّبة (بالقروش، بلا فروق كسور)
        const journalLines: AutoJournalLine[] = group.map((line) => ({
          accountId: line.accountId, creditDebit: line.amount > 0 ? 1 : 2, amount: Math.round(Math.abs(line.amount) * 100) / 100, currencyId: currency, rate,
          note: `رصيد افتتاحي - ${line.label}`.slice(0, 70),
        }))
        // طرف الحساب الوسيط بنفس عملة السند (فرق المدين والدائن بالعملة) — ومبلغه بعملة الأساس صريحاً = فرق نفس القيم المقرّبة
        const netCents = journalLines.reduce((sum, line) => sum + (line.creditDebit === 1 ? 1 : -1) * Math.round(line.amount * rate * 100), 0)
        const netCurrencyCents = journalLines.reduce((sum, line) => sum + (line.creditDebit === 1 ? 1 : -1) * Math.round(line.amount * 100), 0)
        if (netCents !== 0 || netCurrencyCents !== 0) {
          const side = (netCurrencyCents || netCents) > 0 ? 2 : 1
          journalLines.push({
            accountId: clearing.id, creditDebit: side, amount: Math.abs(netCurrencyCents) / 100 || 0.01, currencyId: currency, rate,
            baseAmountOverride: Math.abs(netCents) / 100, note: "أرصدة افتتاحية - ترحيل من الشامل",
          })
        }
        return createAutoJournal({
          userId: ctx.run.created_by, branchId: ctx.run.branch_id, date: day, currencyId: currency, rate,
          note: "الأرصدة الافتتاحية - ترحيل من الشامل", internalVoucherId: INTERNAL_VOUCHER.OPENING_BALANCE, lines: journalLines,
        })
      }))
      await markPosted(`${postedPrefix}:${journal.id}`, journal.id)
      vouchers.push(journal.code)
      ctx.stats.created += group.length
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء سند القيد"
      for (const line of group) ctx.error(line.label, message)
    }
  }
  if (vouchers.length) ctx.info(`سندات قيد الأرصدة الافتتاحية: ${vouchers.join("، ")}`)
}

/** تصحيح سعر سند قيد أرصدة افتتاحية رُحِّل بسعر 1: سعر الرأس والأسطر بعملته، مبلغ عملة الأساس، وطرف الحساب الوسيط */
async function fixOpeningJournalRate(voucherIds: number[], rate: number, clearingId: number, baseCurrencyId: number, ctx: StepContext) {
  const wrong = ((await sql`SELECT id FROM voucher_header_tbl WHERE id = ANY(${voucherIds}::int[]) AND COALESCE(rate, 1) = 1`) as any[]).map((row) => Number(row.id))
  for (const voucherId of wrong) {
    await withTenantTransaction(async () => {
      const day = String(((await sql`SELECT vch_date::date::text AS d FROM voucher_header_tbl WHERE id = ${voucherId}`)[0] as any)?.d || "")
      await withYearOpened(Number(day.slice(0, 4)) || new Date().getFullYear(), async () => {
        await sql`UPDATE voucher_header_tbl SET rate = ${rate} WHERE id = ${voucherId}`
        await sql`
          UPDATE voucher_journal_detail_tbl SET rate = ${rate}, base_curr_amount = ROUND((amount * ${rate})::numeric, 2),
            account_rate = CASE WHEN account_currency_id = currency_id THEN ${rate} ELSE account_rate END
          WHERE voucher_id = ${voucherId} AND account_id <> ${clearingId}`
        const [net] = (await sql`
          SELECT COALESCE(SUM(CASE WHEN credit_debit = 1 THEN base_curr_amount ELSE -base_curr_amount END), 0) AS net
          FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId} AND account_id <> ${clearingId}`) as any[]
        const netBase = Math.round(Number(net?.net || 0) * 100) / 100
        await sql`
          UPDATE voucher_journal_detail_tbl SET credit_debit = ${netBase > 0 ? 2 : 1}, amount = ${Math.abs(netBase)}, base_curr_amount = ${Math.abs(netBase)},
            account_amount = ${Math.abs(netBase)}, currency_id = ${baseCurrencyId}, rate = 1, account_rate = 1
          WHERE voucher_id = ${voucherId} AND account_id = ${clearingId}`
      })
    })
    ctx.info(`سند قيد الأرصدة الافتتاحية ${voucherId}: صُحِّح سعر الصرف إلى ${rate}`)
  }
}

/**
 * طرف الحساب الوسيط بسند أرصدة بعملة أجنبية كان يُقيَّد بعملة الأساس (109,444.12 ₪ بدل 32,266.09 $) فيظهر السند غير
 * متوازن بعملته. يُعاد بعملة السند وسعره: المبلغ = فرق مدين/دائن الأسطر الأخرى بالعملة، ومبلغ الأساس = فرقها بعملة الأساس.
 */
async function fixClearingLineCurrency(voucherIds: number[], clearingId: number, ctx: StepContext) {
  const wrong = (await sql`
    SELECT h.id, h.currency_id, COALESCE(h.rate, 1) AS rate, h.vch_date::date::text AS day
    FROM voucher_header_tbl h
    JOIN voucher_journal_detail_tbl d ON d.voucher_id = h.id AND d.account_id = ${clearingId}
    WHERE h.id = ANY(${voucherIds}::int[]) AND d.currency_id IS DISTINCT FROM h.currency_id`) as any[]
  for (const voucher of wrong) {
    await withTenantTransaction(async () => {
      await withYearOpened(Number(String(voucher.day).slice(0, 4)) || new Date().getFullYear(), async () => {
        const [net] = (await sql`
          SELECT COALESCE(SUM(CASE WHEN credit_debit = 1 THEN amount ELSE -amount END), 0) AS cur,
                 COALESCE(SUM(CASE WHEN credit_debit = 1 THEN base_curr_amount ELSE -base_curr_amount END), 0) AS base
          FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucher.id} AND account_id <> ${clearingId}`) as any[]
        const netCur = Math.round(Number(net?.cur || 0) * 100) / 100
        const netBase = Math.round(Number(net?.base || 0) * 100) / 100
        await sql`
          UPDATE voucher_journal_detail_tbl SET credit_debit = ${(netCur || netBase) > 0 ? 2 : 1}, amount = ${Math.abs(netCur)},
            currency_id = ${voucher.currency_id}, rate = ${Number(voucher.rate)}, base_curr_amount = ${Math.abs(netBase)},
            account_amount = CASE WHEN account_currency_id = ${voucher.currency_id} THEN ${Math.abs(netCur)}
                                  ELSE ROUND((${Math.abs(netBase)} / NULLIF(COALESCE(account_rate, 1), 0))::numeric, 2) END
          WHERE voucher_id = ${voucher.id} AND account_id = ${clearingId}`
        await sql`
          UPDATE voucher_header_tbl SET amount = (SELECT COALESCE(SUM(amount), 0) FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucher.id} AND credit_debit = 1)
          WHERE id = ${voucher.id}`
      })
    })
    ctx.info(`سند قيد الأرصدة الافتتاحية ${voucher.id}: طرف الحساب الوسيط حُوِّل لعملة السند`)
  }
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

const STOCK_VOUCHER_MAX_LINES = 500

/**
 * كميات أول المدة رُحِّلت سابقاً بوضع «التعريفات فقط» بالكمية الحالية (Qnty)، ثم رُحِّلت السندات «السندات فقط» فتضاعفت
 * حركة السنة (مثال: الشامل 2320 والنظام 3835). عند ترحيل السندات تُصحَّح الأسطر المرحّلة إلى «St Qnty»: الكمية
 * تُعدَّل بالفرق مع حركة مخزون بالفرق، وسطر صارت كميته صفراً أو انعكست إشارته يُحذف (ويُعكس أثره) ليُضاف بالاتجاه الصحيح.
 * (2026-11-16)
 */
async function correctOpeningQuantities(previous: number[], direction: "in" | "out", lines: any[], ctx: StepContext) {
  const target = new Map<number, number>(lines.map((line) => [Number(line.product_id), Number(line.quantity)]))
  const posted = (await sql`
    SELECT vi.id, vi.voucher_id, vi.item_id, COALESCE(vi.qnty, 0)::float8 AS qnty, vi.store_id
    FROM voucher_items_tbl vi WHERE vi.voucher_id = ANY(${previous}::int[])`) as any[]
  let changed = 0
  for (const row of posted) {
    const wanted = target.get(Number(row.item_id)) ?? 0
    const delta = wanted - Number(row.qnty)
    if (Math.abs(delta) < 0.0000005) continue
    // سند إدخال: زيادة الكمية = إدخال بالفرق؛ سند إخراج: زيادة الكمية = إخراج بالفرق
    const grows = delta > 0
    const movement: "in" | "out" = (direction === "in") === grows ? "in" : "out"
    await withTenantTransaction(async () => {
      if (wanted > 0) await sql`UPDATE voucher_items_tbl SET qnty = ${wanted} WHERE id = ${row.id}`
      else await sql`DELETE FROM voucher_items_tbl WHERE id = ${row.id}`
      await applyStockMovement([{ product_id: Number(row.item_id), quantity: Math.abs(delta), store_id: row.store_id }], movement, Number(row.voucher_id))
    })
    changed++
  }
  if (changed) {
    await sql`
      UPDATE voucher_header_tbl h SET amount = ROUND(COALESCE((SELECT SUM(vi.qnty * vi.price) FROM voucher_items_tbl vi WHERE vi.voucher_id = h.id), 0)::numeric, 3)
      WHERE h.id = ANY(${previous}::int[])`
    ctx.info(`تصحيح ${changed} سطر من كميات أول المدة (${direction === "in" ? "إدخال" : "إخراج"}) إلى كمية بداية السنة St Qnty — كانت بالكمية الحالية فتضاعفت حركة السنة مع السندات`)
  }
}

export async function processStockBalances(rows: Row[], ctx: StepContext, last: boolean) {
  await stageRows(ctx.run.id, ctx.step, rows)
  ctx.stats.received += rows.length
  if (!last) return
  const all = await takeStaged(ctx.run.id, ctx.step)
  // مع ترحيل السندات (كامل أو «السندات فقط») تكون كمية أول المدة «St Qnty» — السندات المرحّلة تضيف حركة السنة.
  // «التعريفات فقط» وحده يرحّل الكمية الحالية «Qnty»
  const useStart = ctx.run.mode === "full" || ctx.run.mode === "transactions"
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
    for (let [direction, lines] of [["in", group.in], ["out", group.out]] as [("in" | "out"), any[]][]) {
      const vchType = direction === "in" ? STOCK_IN_VCH_TYPE : STOCK_OUT_VCH_TYPE
      const postedPrefix = `${ctx.step}:${storeId}:${direction}`
      const previous = await postedVoucherIds(postedPrefix)
      if (previous.length) {
        const postedItems = new Set(((await sql`SELECT DISTINCT item_id FROM voucher_items_tbl WHERE voucher_id = ANY(${previous}::int[])`) as any[]).map((row) => Number(row.item_id)))
        if (useStart) await correctOpeningQuantities(previous, direction, lines, ctx)
        const stillPosted = useStart
          ? new Set(((await sql`SELECT DISTINCT item_id FROM voucher_items_tbl WHERE voucher_id = ANY(${previous}::int[])`) as any[]).map((row) => Number(row.item_id)))
          : postedItems
        const fresh = lines.filter((line) => !stillPosted.has(Number(line.product_id)))
        // أسطر رُحِّلت سابقاً بسعر 0 (كان السعر من «Market price» الفارغ غالباً) ⇐ سعر التكلفة B.Price، ومجموع السند
        const priced = lines.filter((line) => postedItems.has(Number(line.product_id)) && line.price > 0)
        if (priced.length) {
          const updated = await sql`
            UPDATE voucher_items_tbl vi SET price = v.price
            FROM unnest(${priced.map((line) => Number(line.product_id))}::int[], ${priced.map((line) => line.price)}::float8[]) AS v(item_id, price)
            WHERE vi.voucher_id = ANY(${previous}::int[]) AND vi.item_id = v.item_id AND COALESCE(vi.price, 0) = 0
            RETURNING vi.id`
          if (updated.length) {
            await sql`
              UPDATE voucher_header_tbl h SET amount = COALESCE((SELECT SUM(vi.qnty * vi.price) FROM voucher_items_tbl vi WHERE vi.voucher_id = h.id), 0)
              WHERE h.id = ANY(${previous}::int[])`
            ctx.info(`تحديث سعر ${updated.length} سطر من كميات أول المدة المرحّلة سابقاً بسعر التكلفة (B.Price)`)
          }
        }
        ctx.stats.skipped += lines.length - fresh.length
        lines = fresh
      }
      if (!lines.length) continue
      // سند لكل 500 سطر: سند واحد بآلاف الأسطر (كل أصناف المستودع) بطيء الفتح والطباعة
      for (let start = 0; start < lines.length; start += STOCK_VOUCHER_MAX_LINES) {
      const chunk = lines.slice(start, start + STOCK_VOUCHER_MAX_LINES)
      try {
        const bookId = await voucherBookFor(ctx.run.created_by, vchType)
        if (!bookId) throw new Error(`لا يوجد دفتر سندات لـ ${direction === "in" ? "سند ادخال بضاعة" : "سند اخراج بضاعة"} — عرّفه من صلاحيات دفاتر السندات`)
        const code = await withTenantTransaction(() => withYearOpened(Number(ctx.run.balance_date.slice(0, 4)), async () => {
          await sql`SELECT pg_advisory_xact_lock(hashtext(${`stock-voucher-number:${vchType}`}))`
          const vchCode = await regenerateVoucherCode("", vchType, bookId, ctx.run.branch_id)
          if (!vchCode) throw new Error("تعذر توليد رقم السند")
          const amount = chunk.reduce((sum, line) => sum + line.quantity * line.price, 0)
          const voucher = { id: await insertRow("voucher_header_tbl", {
            vch_type: vchType, vch_code: vchCode, vch_date: ctx.run.balance_date, vch_book_id: bookId, branch_id: ctx.run.branch_id, currency_id: 1, rate: 1,
            to_store_id: direction === "in" ? storeId : null, from_store_id: direction === "out" ? storeId : null,
            amount: Math.round(amount * 1000) / 1000, manual_voucher: "SHAMEL", note: "كميات أول المدة - ترحيل من الشامل", status: 2, vch_status: 2, is_printed: 0,
          }) }
          const saved = await saveVoucherItems(Number(voucher.id), chunk)
          await applyVoucherStockEffect(vchType, Number(voucher.id), saved, direction === "out" ? storeId : null, direction === "in" ? storeId : null)
          await markPosted(`${postedPrefix}:${voucher.id}`, Number(voucher.id))
          return vchCode
        }))
        codes.push(code)
        ctx.stats.created += chunk.length
      } catch (error) {
        for (const line of chunk) ctx.error(line.note, error instanceof Error ? error.message : String(error))
      }
      }
    }
  }
  if (codes.length) ctx.info(`سندات كميات أول المدة: ${codes.join("، ")}`)
}
