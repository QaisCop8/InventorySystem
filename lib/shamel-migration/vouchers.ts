import sql, { withTenantTransaction } from "@/lib/database"
import { INTERNAL_VOUCHER, getBaseCurrencyId, getRateByDate, JOURNAL_LINE_TYPE } from "@/lib/auto-journals"
import { NO_EXPIRY_SENTINEL_DATE, applyStockMovement } from "@/app/api/stock-vouchers/_lib"
import { MigrationRun, StepContext, date, insertRow, mapGet, num, text, toCode10 } from "@/lib/shamel-migration/core"
import { stageRows, voucherBookFor } from "@/lib/shamel-migration/balances"
import { withYearOpened } from "@/lib/year-end-closing"

// السندات: بادئة رقم السند بالشامل تحدد نوعه (voucher_types_tbl بالشامل ويب) ⇐ نوعه هنا. يُنقل كل سند مرحّلاً كما هو:
// الرأس (cpage/spage) + أسطر القيد (ctrans) كما قيّدها الشامل + أسطر الأصناف (strans) وحركة المخزون.
// أسطر الأصناف تُقرأ أولاً (voucher_items) وتُخزَّن مؤقتاً، ثم الرؤوس مع القيود (vouchers) مرتبة برقم السند —
// السند الأخير بكل دفعة قد يكمل بالدفعة التالية فيُؤجَّل لها.

type Row = Record<string, unknown>

export const SHAMEL_VOUCHER_TYPES: { prefix: string; vchType: number; title: string; stock?: "in" | "out" | "transfer"; kind: "sales" | "stock" | "finance" }[] = [
  { prefix: "I", vchType: 12, title: "فاتورة مبيعات", stock: "out", kind: "sales" },
  { prefix: "V", vchType: 13, title: "إرسالية مبيعات", stock: "out", kind: "sales" },
  { prefix: "K", vchType: 14, title: "إرسالية برسم البيع", stock: "out", kind: "sales" },
  { prefix: "F", vchType: 15, title: "مرتجع إرسالية برسم البيع", stock: "in", kind: "sales" },
  { prefix: "S", vchType: 16, title: "مردود مبيعات", stock: "in", kind: "sales" },
  { prefix: "H", vchType: 17, title: "فاتورة مشتريات", stock: "in", kind: "sales" },
  { prefix: "L", vchType: 18, title: "إرسالية مشتريات", stock: "in", kind: "sales" },
  { prefix: "M", vchType: 19, title: "مردودات مشتريات", stock: "out", kind: "sales" },
  { prefix: "A", vchType: 8, title: "سند إدخال بضاعة", stock: "in", kind: "stock" },
  { prefix: "B", vchType: 9, title: "سند إخراج بضاعة", stock: "out", kind: "stock" },
  { prefix: "U", vchType: 11, title: "سند استعمال", stock: "out", kind: "stock" },
  { prefix: "N", vchType: 10, title: "إرسالية داخلية", stock: "transfer", kind: "stock" },
  { prefix: "C", vchType: 6, title: "إشعار دائن", kind: "finance" },
  { prefix: "D", vchType: 7, title: "إشعار مدين", kind: "finance" },
  { prefix: "P", vchType: 5, title: "سند صرف", kind: "finance" },
  { prefix: "R", vchType: 4, title: "سند قبض", kind: "finance" },
  { prefix: "J", vchType: 3, title: "سند قيد", kind: "finance" },
]

const typeByPrefix = new Map(SHAMEL_VOUCHER_TYPES.map((type) => [type.prefix, type]))

/** أنواع التشغيل بعد التنقية — حروف بادئة معروفة فقط (تدخل نص الاستعلام) */
export const cleanVoucherTypes = (types: unknown): string[] =>
  (Array.isArray(types) ? types : []).map((value) => text(value).toUpperCase()).filter((prefix) => typeByPrefix.has(prefix))

const prefixFilter = (run: MigrationRun, column: string) => {
  const prefixes = cleanVoucherTypes(run.voucher_types)
  return prefixes.length ? `left(${column},1) in (${prefixes.map((prefix) => `'${prefix}'`).join(",")})` : "1=0"
}

export const voucherItemsSql = (run: MigrationRun) => `select st."Voucher ID" as vch_code, st."Pos" as pos, st."SCode" as item_code, st."UnitNum" as unit_pos,
  st."Store" as store, st."Qnty" as qnty, st."Price" as price, st."Bonus" as bonus, st."Discount" as discount, st."Vat" as vat,
  st."Note" as note, st."Del Code" as delivery_code,
  case when st."Expiry date">'1990-01-01' then st."Expiry date" else '1990-01-01' end as expiry_date
  from "strans" st where st."Pos">=0 and ${prefixFilter(run, `st."Voucher ID"`)} order by st."Voucher ID", st."Pos"`

export const voucherLinesSql = (run: MigrationRun) => `select cp."VoucherID" as vch_code, cp."Date" as vch_date, cp."CS_code" as customer_code, cp."Name" as customer_name,
  cp."Curr" as currency_code, cp."Rate" as rate, cp."Balance" as amount, cp."SMan" as salesman_code, cp."ManualVch" as manual_vch, cp."Note" as note, cp."Printed" as printed, cp."Intern" as internal_status,
  sp."Vat" as vat, sp."Discount" as discount, sp."Vat_to_store" as to_store,
  ct."Pos" as line_pos, ct."Code" as line_account, ct."Curr" as line_currency, ct."Amount" as line_amount, ct."CrDr" as line_crdr,
  ct."Cost cent." as cc1, ct."CostCent21" as cc2, ct."CostCent22" as cc3, ct."CostCent23" as cc4, ct."CostCent24" as cc5, ct."CostCent25" as cc6,
  (select jn2.note from "jornotes" jn2 where jn2."vch. id"=cp."VoucherID" and jn2.pos=ct."Pos") as line_note,
  (select jn.note from "jornotes" jn where jn."vch. id"=cp."VoucherID" and jn.pos=-1) as note1
  from "cpage" cp
  left join "spage" sp on sp."Voucher ID"=cp."VoucherID"
  left join "ctrans" ct on ct."Vch. ID"=cp."VoucherID" and ct."Pos">=0
  where ${prefixFilter(run, `cp."VoucherID"`)}
  order by cp."VoucherID", ct."Pos"`

export async function processVoucherItems(rows: Row[], ctx: StepContext) {
  await sql`CREATE INDEX IF NOT EXISTS idx_shamel_migration_stage_ref ON shamel_migration_stage(run_id, step, (payload->>'vch_code'))`.catch(() => undefined)
  await stageRows(ctx.run.id, "voucher_items", rows)
  ctx.stats.received += rows.length
}

async function stagedItems(runId: number, codes: string[]) {
  if (!codes.length) return new Map<string, Row[]>()
  const rows = await sql`
    SELECT payload FROM shamel_migration_stage
    WHERE run_id = ${runId} AND step = 'voucher_items' AND payload->>'vch_code' = ANY(${codes}::text[])
    ORDER BY id`
  const byCode = new Map<string, Row[]>()
  for (const { payload } of rows as any[]) {
    const code = text(payload.vch_code)
    byCode.set(code, [...(byCode.get(code) || []), payload])
  }
  return byCode
}

/** ما يُحمَّل مرة واحدة لكل دفعة بدل استعلام لكل سند/سطر (كل رحلة للقاعدة البعيدة مكلفة) */
type BatchLookups = {
  baseCurrencyId: number | null
  books: Map<number, number | null>
  currencies: Map<string, number>
  accounts: Map<string, number>
  accountCurrency: Map<number, number | null>
  salesmen: Map<string, number>
  stores: Map<string, number>
  costCenters: Map<string, number>
  items: Map<string, number>
  units: Map<string, number>
  hasExpiry: Map<number, boolean>
  takenCodes: Set<string>
  rates: Map<string, number>
}

async function loadLookups(groups: Map<string, Row[]>, items: Map<string, Row[]>): Promise<BatchLookups> {
  const lines = [...groups.values()].flat()
  const itemRows = [...items.values()].flat()
  const headers = [...groups.values()].map((rows) => rows[0])
  const accounts = await mapGet("account", [...headers.map((row) => text(row.customer_code)), ...lines.map((row) => text(row.line_account))])
  const accountIds = [...new Set(accounts.values())]
  const accountCurrency = new Map<number, number | null>(
    accountIds.length
      ? ((await sql`SELECT id, currency_id FROM account_tbl WHERE id = ANY(${accountIds}::int[])`) as any[]).map((row) => [Number(row.id), row.currency_id == null ? null : Number(row.currency_id)])
      : [],
  )
  const costKeys: string[] = []
  for (const line of lines) for (let typePos = 0; typePos < 6; typePos++) { const code = text(line[`cc${typePos + 1}`]); if (code) costKeys.push(`${typePos}-${code}`) }
  const itemIds = await mapGet("item", itemRows.map((row) => text(row.item_code)))
  const productIds = [...new Set(itemIds.values())]
  const hasExpiry = new Map<number, boolean>(
    productIds.length ? ((await sql`SELECT id, has_expiry_date FROM products WHERE id = ANY(${productIds}::int[])`) as any[]).map((row) => [Number(row.id), Boolean(row.has_expiry_date)]) : [],
  )
  const codes = [...groups.keys()]
  const taken = new Set<string>(
    ((await sql`SELECT vch_type, vch_code FROM voucher_header_tbl WHERE vch_code = ANY(${codes.flatMap((code) => [toCode10(code), toCode10(`S${code}`)])}::text[])`) as any[]).map((row) => `${row.vch_type}|${row.vch_code}`),
  )
  return {
    baseCurrencyId: await getBaseCurrencyId(),
    books: new Map(),
    currencies: new Map(((await sql`SELECT shamel_key, web_id FROM shamel_migration_map WHERE kind = 'currency'`) as any[]).map((row) => [String(row.shamel_key), Number(row.web_id)])),
    accounts,
    accountCurrency,
    salesmen: await mapGet("salesman", headers.map((row) => text(row.salesman_code))),
    stores: await mapGet("store", [...headers.map((row) => String(num(row.to_store))), ...itemRows.map((row) => String(num(row.store)))]),
    costCenters: await mapGet("costcenter", costKeys),
    items: itemIds,
    units: await mapGet("item_unit", itemRows.map((row) => `${text(row.item_code)}|${num(row.unit_pos)}`)),
    hasExpiry,
    takenCodes: taken,
    rates: new Map(),
  }
}

async function rateOn(lookups: BatchLookups, currency: number, day: string) {
  if (currency === lookups.baseCurrencyId) return 1
  const key = `${currency}|${day}`
  if (!lookups.rates.has(key)) lookups.rates.set(key, (await getRateByDate(currency, day, lookups.baseCurrencyId)) || 1)
  return lookups.rates.get(key)!
}

const currencyOf = (lookups: BatchLookups, code: unknown) => lookups.currencies.get(text(code).toUpperCase()) ?? null

/** INSERT متعدد الأسطر بأمر واحد */
async function insertMany(table: string, columns: string[], rows: unknown[][], returning = "") {
  if (!rows.length) return [] as any[]
  const params: unknown[] = []
  const values = rows.map((row) => `(${row.map((value) => { params.push(value); return `$${params.length}` }).join(", ")})`)
  return (await sql.unsafe(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}${returning ? ` RETURNING ${returning}` : ""}`, params)) as any[]
}

export async function processVoucherLines(rows: Row[], ctx: StepContext, last: boolean) {
  // السند الأخير غير المكتمل من الدفعة السابقة يُضاف أول هذه الدفعة
  const carried = (await sql`
    SELECT payload FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step = 'vouchers_carry' ORDER BY id
  `.catch(() => [])) as any[]
  await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step = 'vouchers_carry'`.catch(() => undefined)
  const all = [...carried.map((row) => row.payload as Row), ...rows]

  const groups = new Map<string, Row[]>()
  for (const row of all) {
    const code = text(row.vch_code)
    if (!code) continue
    const group = groups.get(code)
    if (group) group.push(row)
    else groups.set(code, [row])
  }
  const codes = [...groups.keys()]
  if (!last && codes.length) {
    const tail = codes.pop()!
    await stageRows(ctx.run.id, "vouchers_carry", groups.get(tail)!)
    groups.delete(tail)
  }

  const existing = await mapGet("voucher", codes)
  const pending = new Map<string, Row[]>()
  for (const code of codes) {
    ctx.stats.received++
    if (existing.has(code)) ctx.stats.skipped++
    else pending.set(code, groups.get(code)!)
  }
  if (pending.size) {
    const items = await stagedItems(ctx.run.id, [...pending.keys()])
    const lookups = await loadLookups(pending, items)
    // سنة السند تُفتح مؤقتاً (بيانات الشامل قد تمتد لسنوات سابقة لسنة العمل) — معاملة واحدة لكل سنة بالدفعة،
    // وكل سند داخل SAVEPOINT خاص فيفشل وحده دون إلغاء باقي السندات
    const byYear = new Map<number, string[]>()
    for (const [code, lines] of pending) {
      const year = Number(text(lines[0].vch_date).slice(0, 4)) || new Date().getFullYear()
      byYear.set(year, [...(byYear.get(year) || []), code])
    }
    for (const [year, yearCodes] of byYear) {
      let created = 0
      await withTenantTransaction(() => withYearOpened(year, async () => {
        const saved: [string, number][] = []
        for (const code of yearCodes) {
          await sql`SAVEPOINT shamel_voucher`
          try {
            saved.push([code, await saveVoucher(code, pending.get(code)!, items.get(code) || [], ctx, lookups)])
            await sql`RELEASE SAVEPOINT shamel_voucher`
          } catch (error) {
            await sql`ROLLBACK TO SAVEPOINT shamel_voucher`
            ctx.error(code, error instanceof Error ? error.message : String(error))
          }
        }
        if (saved.length) {
          await sql`
            INSERT INTO shamel_migration_map (kind, shamel_key, web_id)
            SELECT 'voucher', s.key, s.id FROM unnest(${saved.map(([key]) => key)}::text[], ${saved.map(([, id]) => id)}::int[]) AS s(key, id)
            ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id`
        }
        created = saved.length
      }))
      ctx.stats.created += created
    }
  }
  if (last) await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step IN ('voucher_items', 'vouchers_carry')`.catch(() => undefined)
}

async function saveVoucher(code: string, lines: Row[], itemRows: Row[], ctx: StepContext, lookups: BatchLookups): Promise<number> {
  const header = lines[0]
  const type = typeByPrefix.get(code.charAt(0).toUpperCase())
  if (!type) throw new Error("نوع السند غير مدعوم")
  const vchDate = date(header.vch_date)
  if (!vchDate) throw new Error("تاريخ السند غير صالح")

  if (!lookups.books.has(type.vchType)) lookups.books.set(type.vchType, await voucherBookFor(ctx.run.created_by, type.vchType))
  const bookId = lookups.books.get(type.vchType) ?? null
  const { baseCurrencyId } = lookups
  const currency = currencyOf(lookups, header.currency_code) || baseCurrencyId || 1
  const rate = currency === baseCurrencyId ? 1 : num(header.rate) || (await rateOn(lookups, currency, vchDate))
  const partyAccount = text(header.customer_code) ? lookups.accounts.get(text(header.customer_code)) ?? null : null
  const salesmanId = text(header.salesman_code) ? lookups.salesmen.get(text(header.salesman_code)) ?? null : null
  const toStore = type.stock === "transfer" ? lookups.stores.get(String(num(header.to_store))) ?? null : null
  // Printed بالشامل حقل بتات: 8 = سند ملغى (يُنقل ملغى بلا أثر على الأرصدة والمخزون)، 4 = مطبوع
  const flags = num(header.printed)
  const cancelled = (flags & 8) !== 0
  // Intern 180 = قيد فرق عملة: يغيّر قيمة الرصيد بعملة الأساس فقط (مبلغ الحساب بعملته 0) — نفس قيود فرق العملة هنا
  const currencyDifference = num(header.internal_status) === 180
  // أرقام السندات بنون 10 خانات: JG007100 ⇐ JG00007100 (رقم الشامل الأصلي يبقى في manual_voucher)
  const vchCode = lookups.takenCodes.has(`${type.vchType}|${toCode10(code)}`) ? toCode10(`S${code}`) : toCode10(code)

  const voucherId = await insertRow("voucher_header_tbl", {
    vch_type: type.vchType, vch_code: vchCode, vch_date: vchDate, manual_date: vchDate, vch_book_id: bookId, branch_id: ctx.run.branch_id,
    currency_id: currency, rate, amount: Math.abs(num(header.amount)),
    account_id: type.kind === "stock" ? null : partyAccount, customer_name: text(header.customer_name).slice(0, 150) || null,
    salesman_id: salesmanId, manual_voucher: (text(header.manual_vch) || code).slice(0, 50),
    note: [text(header.note), text(header.note1)].filter(Boolean).join(" - ").slice(0, 1000) || null,
    status: cancelled ? 3 : 2, vch_status: cancelled ? 3 : 2, is_printed: (flags & 4) !== 0 ? 1 : 0,
    vat: num(header.vat) || null, discount: num(header.discount) || null, to_store_id: toStore,
    internal_voucher_id: currencyDifference ? INTERNAL_VOUCHER.CURRENCY_DIFFERENCE : null,
  })

  // أسطر القيد كما قيّدها الشامل (CrDr: 1 مدين، 2 دائن؛ 9/10 = نفسها لسطر آلي) — أمر INSERT واحد لكل الأسطر
  const journalLines = lines.filter((line) => text(line.line_account) && Math.abs(num(line.line_amount)) > 0)
  const rateFor = (currencyIdValue: number) => currencyIdValue === currency ? rate : rateOn(lookups, currencyIdValue, vchDate)
  const journalRows: unknown[][] = []
  const costCenterLinks: [number, number][] = []
  for (const line of journalLines) {
    const accountIdValue = lookups.accounts.get(text(line.line_account))
    if (!accountIdValue) throw new Error(`الحساب ${text(line.line_account)} غير موجود`)
    let crdr = num(line.line_crdr)
    if (crdr === 9 || crdr === 10) crdr -= 8
    if (crdr !== 1 && crdr !== 2) throw new Error(`نوع سطر القيد غير معروف (${crdr})`)
    const lineCurrency = currencyOf(lookups, line.line_currency) || currency
    const lineRate = await rateFor(lineCurrency)
    const amount = Math.round(Math.abs(num(line.line_amount)) * 1000) / 1000
    const base = Math.round(amount * lineRate * 1000) / 1000
    const accountCurrency = lookups.accountCurrency.get(accountIdValue) ?? lineCurrency
    const accountRate = accountCurrency === lineCurrency ? lineRate : await rateFor(accountCurrency)
    const accountAmount = currencyDifference ? 0 : accountCurrency === lineCurrency ? amount : Math.round((base / accountRate) * 1000) / 1000
    const orderNo = journalRows.length + 1
    journalRows.push([voucherId, orderNo, JOURNAL_LINE_TYPE, accountIdValue, crdr, amount, lineCurrency, lineRate, base, accountCurrency, accountRate, accountAmount, text(line.line_note).slice(0, 70) || null])
    // مراكز التكلفة: الحقل n بالشامل = نوع مركز التكلفة n-1
    for (let typePos = 0; typePos < 6; typePos++) {
      const costCode = text(line[`cc${typePos + 1}`])
      const costCenterId = costCode ? lookups.costCenters.get(`${typePos}-${costCode}`) : null
      if (costCenterId) costCenterLinks.push([orderNo, costCenterId])
    }
  }
  const inserted = await insertMany(
    "voucher_journal_detail_tbl",
    ["voucher_id", "order_no", "journal_type_id", "account_id", "credit_debit", "amount", "currency_id", "rate", "base_curr_amount", "account_currency_id", "account_rate", "account_amount", "note"],
    journalRows,
    "id, order_no",
  )
  // رصيد السند بالشامل (Balance) صفر لسندات القيد: المبلغ = مجموع المدين بعملة السند
  if (!(Math.abs(num(header.amount)) > 0) && journalRows.length) {
    const debitBase = journalRows.reduce((sum, row) => sum + (row[4] === 1 ? Number(row[8]) || 0 : 0), 0)
    const headerAmount = Math.round((debitBase / (rate || 1)) * 1000) / 1000
    if (headerAmount > 0) await sql`UPDATE voucher_header_tbl SET amount = ${headerAmount} WHERE id = ${voucherId}`
  }
  if (costCenterLinks.length) {
    const lineIds = new Map(inserted.map((row) => [Number(row.order_no), Number(row.id)]))
    await insertMany("voucher_costcenter_tbl", ["voucher_journal_id", "cost_center_id"], costCenterLinks.map(([orderNo, costCenterId]) => [lineIds.get(orderNo), costCenterId]))
  }

  // أسطر الأصناف وحركة المخزون
  if (itemRows.length && type.kind !== "finance") {
    const moving: { product_id: number; quantity: number; store_id: number | null }[] = []
    const itemValues: unknown[][] = []
    for (const row of itemRows) {
      const productId = lookups.items.get(text(row.item_code))
      // أصل ثابت (نوع 7 بالشامل) أو صنف محذوف: القيد يُرحَّل كما هو بلا سطر الصنف
      if (!productId) { ctx.warn(code, `الصنف ${text(row.item_code)} غير موجود (قد يكون أصلاً ثابتاً) — رُحِّل قيد السند بدون هذا السطر`); continue }
      const qty = Math.abs(num(row.qnty))
      if (!(qty > 0)) continue
      const storeId = lookups.stores.get(String(num(row.store))) ?? null
      const bonus = num(row.bonus)
      itemValues.push([
        voucherId, productId, "", lookups.units.get(`${text(row.item_code)}|${num(row.unit_pos)}`) ?? null, qty, bonus, num(row.discount),
        num(row.vat), num(row.price), text(row.note).slice(0, 200), 0, "",
        lookups.hasExpiry.get(productId) ? date(row.expiry_date) : NO_EXPIRY_SENTINEL_DATE, storeId,
      ])
      // سطر فاتورة منقول من إرسالية: البضاعة تحركت مع الإرسالية نفسها
      if (!text(row.delivery_code)) moving.push({ product_id: productId, quantity: qty + bonus, store_id: storeId })
    }
    await insertMany(
      "voucher_items_tbl",
      ["voucher_id", "item_id", "item_name", "unit_id", "qnty", "bonus", "discount", "vat_amount", "price", "note", "cost_price", "barcode", "expiry_date", "store_id"],
      itemValues,
    )
    if (!cancelled) {
      const referenceType = type.kind === "sales" ? "sales_voucher" : "stock_voucher"
      if (type.stock === "transfer") {
        await applyStockMovement(moving, "out", voucherId, null, 1, referenceType)
        if (toStore) await applyStockMovement(moving, "in", voucherId, toStore, 1, referenceType)
      } else if (type.stock) {
        await applyStockMovement(moving, type.stock, voucherId, null, 1, referenceType)
      }
    }
  }
  return voucherId
}

// إصلاح السندات المرحّلة سابقاً: رقم السند إلى 10 خانات (JG007100 ⇐ JG00007100) إن لم يكن الرقم الجديد مستخدماً،
// والمبلغ الصفري (سندات القيد) = مجموع المدين بعملة الأساس ÷ سعر السند
export async function fixMigratedVouchers() {
  await sql`
    WITH target AS (
      SELECT h.id, h.vch_type,
        substring(h.vch_code from '^[A-Z]+') || lpad(substring(h.vch_code from '[0-9]+$'), 10 - length(substring(h.vch_code from '^[A-Z]+')), '0') AS new_code
      FROM voucher_header_tbl h
      WHERE h.id IN (SELECT web_id FROM shamel_migration_map WHERE kind = 'voucher')
        AND h.vch_code ~ '^[A-Z]{1,9}[0-9]+$' AND length(h.vch_code) < 10
    )
    UPDATE voucher_header_tbl h SET vch_code = t.new_code
    FROM target t
    WHERE h.id = t.id
      AND NOT EXISTS (SELECT 1 FROM voucher_header_tbl o WHERE o.vch_type = t.vch_type AND o.vch_code = t.new_code AND o.id <> t.id)`
  await sql`
    UPDATE voucher_header_tbl h SET amount = ROUND((d.debit_base / COALESCE(NULLIF(h.rate, 0), 1))::numeric, 3)
    FROM (
      SELECT j.voucher_id, SUM(j.base_curr_amount) AS debit_base
      FROM voucher_journal_detail_tbl j
      WHERE j.credit_debit = 1 AND j.voucher_id IN (SELECT web_id FROM shamel_migration_map WHERE kind = 'voucher')
      GROUP BY j.voucher_id
    ) d
    WHERE h.id = d.voucher_id AND COALESCE(h.amount, 0) = 0 AND d.debit_base > 0`
}
