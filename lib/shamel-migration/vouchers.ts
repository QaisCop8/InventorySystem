import sql, { withTenantTransaction } from "@/lib/database"
import { INTERNAL_VOUCHER, getBaseCurrencyId, getRateByDate, JOURNAL_LINE_TYPE } from "@/lib/auto-journals"
import { applyStockMovement, saveVoucherItems } from "@/app/api/stock-vouchers/_lib"
import { MigrationRun, StepContext, date, mapGet, mapOne, mapSet, num, text } from "@/lib/shamel-migration/core"
import { currencyId } from "@/lib/shamel-migration/definitions"
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
    groups.set(code, [...(groups.get(code) || []), row])
  }
  const codes = [...groups.keys()]
  if (!last && codes.length) {
    const tail = codes.pop()!
    await stageRows(ctx.run.id, "vouchers_carry", groups.get(tail)!)
    groups.delete(tail)
  }

  const existing = await mapGet("voucher", codes)
  const items = await stagedItems(ctx.run.id, codes)
  const baseCurrencyId = await getBaseCurrencyId()
  const books = new Map<number, number | null>()
  for (const code of codes) {
    ctx.stats.received++
    if (existing.has(code)) { ctx.stats.skipped++; continue }
    try {
      // سنة السند تُفتح مؤقتاً داخل معاملته (بيانات الشامل قد تمتد لسنوات سابقة لسنة العمل)
      const year = Number(text(groups.get(code)![0].vch_date).slice(0, 4)) || new Date().getFullYear()
      await withTenantTransaction(() => withYearOpened(year, () => saveVoucher(code, groups.get(code)!, items.get(code) || [], ctx, baseCurrencyId, books)))
      ctx.stats.created++
    } catch (error) {
      ctx.error(code, error instanceof Error ? error.message : String(error))
    }
  }
  if (last) await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step IN ('voucher_items', 'vouchers_carry')`.catch(() => undefined)
}

async function saveVoucher(code: string, lines: Row[], itemRows: Row[], ctx: StepContext, baseCurrencyId: number | null, books: Map<number, number | null>) {
  const header = lines[0]
  const type = typeByPrefix.get(code.charAt(0).toUpperCase())
  if (!type) throw new Error("نوع السند غير مدعوم")
  const vchDate = date(header.vch_date)
  if (!vchDate) throw new Error("تاريخ السند غير صالح")

  if (!books.has(type.vchType)) books.set(type.vchType, await voucherBookFor(ctx.run.created_by, type.vchType))
  const bookId = books.get(type.vchType) ?? null
  const currency = (await currencyId(header.currency_code)) || baseCurrencyId || 1
  const rate = currency === baseCurrencyId ? 1 : num(header.rate) || (await getRateByDate(currency, vchDate, baseCurrencyId)) || 1
  const partyAccount = text(header.customer_code) ? await mapOne("account", text(header.customer_code)) : null
  const salesmanId = text(header.salesman_code) ? await mapOne("salesman", text(header.salesman_code)) : null
  const toStore = type.stock === "transfer" ? await mapOne("store", String(num(header.to_store))) : null
  // Printed بالشامل حقل بتات: 8 = سند ملغى (يُنقل ملغى بلا أثر على الأرصدة والمخزون)، 4 = مطبوع
  const flags = num(header.printed)
  const cancelled = (flags & 8) !== 0
  // Intern 180 = قيد فرق عملة: يغيّر قيمة الرصيد بعملة الأساس فقط (مبلغ الحساب بعملته 0) — نفس قيود فرق العملة هنا
  const currencyDifference = num(header.internal_status) === 180
  let vchCode = code
  if ((await sql`SELECT 1 FROM voucher_header_tbl WHERE vch_type = ${type.vchType} AND vch_code = ${vchCode}`).length) vchCode = `S${code}`

  const voucher = (await sql`
    INSERT INTO voucher_header_tbl (
      vch_type, vch_code, vch_date, manual_date, vch_book_id, branch_id, currency_id, rate, amount, account_id, customer_name,
      salesman_id, manual_voucher, note, status, vch_status, is_printed, vat, discount, to_store_id, internal_voucher_id
    ) VALUES (
      ${type.vchType}, ${vchCode}, ${vchDate}, ${vchDate}, ${bookId}, ${ctx.run.branch_id}, ${currency}, ${rate}, ${Math.abs(num(header.amount))},
      ${type.kind === "stock" ? null : partyAccount}, ${text(header.customer_name).slice(0, 150) || null},
      ${salesmanId}, ${(text(header.manual_vch) || code).slice(0, 50)}, ${[text(header.note), text(header.note1)].filter(Boolean).join(" - ").slice(0, 1000) || null},
      ${cancelled ? 3 : 2}, ${cancelled ? 3 : 2}, ${(flags & 4) !== 0 ? 1 : 0}, ${num(header.vat) || null}, ${num(header.discount) || null}, ${toStore}, ${currencyDifference ? INTERNAL_VOUCHER.CURRENCY_DIFFERENCE : null}
    ) RETURNING id
  `)[0] as any
  const voucherId = Number(voucher.id)

  // أسطر القيد كما قيّدها الشامل (CrDr: 1 مدين، 2 دائن؛ 9/10 = نفسها لسطر آلي)
  const journalLines = lines.filter((line) => text(line.line_account) && Math.abs(num(line.line_amount)) > 0)
  const accounts = await mapGet("account", journalLines.map((line) => text(line.line_account)))
  const accountRows = accounts.size
    ? new Map(((await sql`SELECT id, currency_id FROM account_tbl WHERE id = ANY(${[...accounts.values()]}::int[])`) as any[]).map((row) => [Number(row.id), row]))
    : new Map()
  const rateCache = new Map<number, number>()
  const rateFor = async (currencyIdValue: number) => {
    if (currencyIdValue === baseCurrencyId) return 1
    if (currencyIdValue === currency) return rate
    if (!rateCache.has(currencyIdValue)) rateCache.set(currencyIdValue, (await getRateByDate(currencyIdValue, vchDate, baseCurrencyId)) || 1)
    return rateCache.get(currencyIdValue)!
  }
  let orderNo = 0
  for (const line of journalLines) {
    const accountIdValue = accounts.get(text(line.line_account))
    if (!accountIdValue) throw new Error(`الحساب ${text(line.line_account)} غير موجود`)
    let crdr = num(line.line_crdr)
    if (crdr === 9 || crdr === 10) crdr -= 8
    if (crdr !== 1 && crdr !== 2) throw new Error(`نوع سطر القيد غير معروف (${crdr})`)
    const lineCurrency = (await currencyId(line.line_currency)) || currency
    const lineRate = await rateFor(lineCurrency)
    const amount = Math.round(Math.abs(num(line.line_amount)) * 1000) / 1000
    const base = Math.round(amount * lineRate * 1000) / 1000
    const account: any = accountRows.get(accountIdValue)
    const accountCurrency = account?.currency_id != null ? Number(account.currency_id) : lineCurrency
    const accountRate = accountCurrency === lineCurrency ? lineRate : await rateFor(accountCurrency)
    const accountAmount = currencyDifference ? 0 : accountCurrency === lineCurrency ? amount : Math.round((base / accountRate) * 1000) / 1000
    const inserted = (await sql`
      INSERT INTO voucher_journal_detail_tbl (
        voucher_id, order_no, journal_type_id, account_id, credit_debit, amount, currency_id, rate, base_curr_amount,
        account_currency_id, account_rate, account_amount, note
      ) VALUES (
        ${voucherId}, ${++orderNo}, ${JOURNAL_LINE_TYPE}, ${accountIdValue}, ${crdr}, ${amount}, ${lineCurrency}, ${lineRate}, ${base},
        ${accountCurrency}, ${accountRate}, ${accountAmount}, ${text(line.line_note).slice(0, 70) || null}
      ) RETURNING id
    `)[0] as any
    // مراكز التكلفة: الحقل n بالشامل = نوع مركز التكلفة n-1
    for (let typePos = 0; typePos < 6; typePos++) {
      const costCode = text(line[`cc${typePos + 1}`])
      if (!costCode) continue
      const costCenterId = await mapOne("costcenter", `${typePos}-${costCode}`)
      if (costCenterId) await sql`INSERT INTO voucher_costcenter_tbl (voucher_journal_id, cost_center_id) VALUES (${Number(inserted.id)}, ${costCenterId})`
    }
  }

  // أسطر الأصناف وحركة المخزون
  if (itemRows.length && type.kind !== "finance") {
    const itemIds = await mapGet("item", itemRows.map((row) => text(row.item_code)))
    const units = await mapGet("item_unit", itemRows.map((row) => `${text(row.item_code)}|${num(row.unit_pos)}`))
    const stores = await mapGet("store", itemRows.map((row) => String(num(row.store))))
    const lines = []
    for (const row of itemRows) {
      const productId = itemIds.get(text(row.item_code))
      // أصل ثابت (نوع 7 بالشامل) أو صنف محذوف: القيد يُرحَّل كما هو بلا سطر الصنف
      if (!productId) { ctx.warn(code, `الصنف ${text(row.item_code)} غير موجود (قد يكون أصلاً ثابتاً) — رُحِّل قيد السند بدون هذا السطر`); continue }
      const qty = Math.abs(num(row.qnty))
      if (!(qty > 0)) continue
      lines.push({
        product_id: productId, unit_id: units.get(`${text(row.item_code)}|${num(row.unit_pos)}`) || null,
        quantity: qty, price: num(row.price), bonus: num(row.bonus), discount: num(row.discount), vat_amount: num(row.vat),
        store_id: stores.get(String(num(row.store))) || null, note: text(row.note).slice(0, 200),
        expiry_date: date(row.expiry_date), from_delivery: Boolean(text(row.delivery_code)),
      })
    }
    const saved = await saveVoucherItems(voucherId, lines)
    if (cancelled) { await mapSet("voucher", code, voucherId); return }
    // سطر فاتورة منقول من إرسالية: البضاعة تحركت مع الإرسالية نفسها
    const moving = saved.filter((line: any) => !line.from_delivery).map((line: any) => ({ ...line, quantity: line.quantity + (line.bonus || 0) }))
    const referenceType = type.kind === "sales" ? "sales_voucher" : "stock_voucher"
    if (type.stock === "transfer") {
      await applyStockMovement(moving, "out", voucherId, null, 1, referenceType)
      if (toStore) await applyStockMovement(moving, "in", voucherId, toStore, 1, referenceType)
    } else if (type.stock) {
      await applyStockMovement(moving, type.stock, voucherId, null, 1, referenceType)
    }
  }
  await mapSet("voucher", code, voucherId)
}
