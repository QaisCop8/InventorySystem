import sql, { withTenantTransaction } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { INTERNAL_VOUCHER, getBaseCurrencyId, getRateByDate, JOURNAL_LINE_TYPE } from "@/lib/auto-journals"
import { NO_EXPIRY_SENTINEL_DATE, applyStockMovement } from "@/app/api/stock-vouchers/_lib"
import { MigrationRun, StepContext, date, mapGet, mapSet, num, presentValues, tableColumns, text, toCode10 } from "@/lib/shamel-migration/core"
import { stageRows, voucherBookFor } from "@/lib/shamel-migration/balances"
import { withYearOpened } from "@/lib/year-end-closing"
import { ensureUsersCurrenciesDefaultTable } from "@/lib/users-currencies-default"
import { SHAMEL_ORDER_TYPES } from "@/lib/shamel-migration/orders"
import { JOURNAL_TYPE_CASH, JOURNAL_TYPE_CHEQUE, PAYMENT_VCH_TYPE, RECEIPT_VCH_TYPE } from "@/app/api/receipts/_lib"

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
  (Array.isArray(types) ? types : []).map((value) => text(value).toUpperCase()).filter((prefix) => typeByPrefix.has(prefix) || SHAMEL_ORDER_TYPES.some((type) => type.prefix === prefix))

const prefixFilter = (run: MigrationRun, column: string) => {
  // بادئات الطلبيات (O/T) ليست سندات cpage — خطوة الطلبيات المستقلة (orders.ts)
  const prefixes = cleanVoucherTypes(run.voucher_types).filter((prefix) => typeByPrefix.has(prefix))
  return prefixes.length ? `left(${column},1) in (${prefixes.map((prefix) => `'${prefix}'`).join(",")})` : "1=0"
}

export const voucherItemsSql = (run: MigrationRun) => `select st."Voucher ID" as vch_code, st."Pos" as pos, st."SCode" as item_code, st."UnitNum" as unit_pos,
  st."Store" as store, st."Qnty" as qnty, st."Price" as price, st."Bonus" as bonus, st."Discount" as discount, st."Vat" as vat,
  st."Note" as note, st."Del Code" as delivery_code, st."Stat" as strans_status, sp."Stat" as spage_status,
  case when st."Expiry date">'1990-01-01' then st."Expiry date" else '1990-01-01' end as expiry_date
  from "strans" st left join "spage" sp on sp."Voucher ID"=st."Voucher ID"
  where st."Pos">=0 and ${prefixFilter(run, `st."Voucher ID"`)} order by st."Voucher ID", st."Pos"`

export const voucherLinesSql = (run: MigrationRun) => `select cp."VoucherID" as vch_code, cp."Date" as vch_date, cp."CS_code" as customer_code, cp."Name" as customer_name,
  cp."Curr" as currency_code, cp."Rate" as rate, cp."Balance" as amount, cp."SMan" as salesman_code, cp."ManualVch" as manual_vch, cp."Note" as note, cp."Printed" as printed, cp."Intern" as internal_status,
  sp."Vat" as vat, sp."Discount" as discount, sp."Vat_to_store" as to_store,
  ct."Pos" as line_pos, ct."Code" as line_account, ct."Curr" as line_currency, ct."Amount" as line_amount, ct."CrDr" as line_crdr,
  ct."Cost cent." as cc1, ct."CostCent21" as cc2, ct."CostCent22" as cc3, ct."CostCent23" as cc4, ct."CostCent24" as cc5, ct."CostCent25" as cc6,
  (select jn2.note from "jornotes" jn2 where jn2."vch. id"=cp."VoucherID" and jn2.pos=ct."Pos") as line_note,
  (select jn.note from "jornotes" jn where jn."vch. id"=cp."VoucherID" and jn.pos=-1) as note1,
  (select sum(cq."Amount") from "cheques" cq where cq."Voucher ID"=cp."VoucherID") as cheq_total
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

// ربط الأسطر بمصدرها (نفس MigrateLinkVouchersF بالشامل API): spage.Stat حالة الصفحة — 11/14/15 فاتورة من إرسالية
// (مبيعات/مشتريات/إرسالية سيارة)، 12/13/21/22 فاتورة أو إرسالية من طلبية. strans."Del Code" رقم المصدر و strans.Stat
// موقع السطر فيه (≥ 1000 = غير مرتبط). المصدر قد يُرحَّل بعد الفاتورة (ترتيب الأرقام) فيُحفظ الرابط ويُحلّ بنهاية الترحيل.
const DELIVERY_SOURCED = new Set([11, 14, 15])
const ORDER_SOURCED = new Set([12, 13, 21, 22])
/** سندات تكون مصدراً لأسطر فواتير: إرساليات المبيعات/برسم البيع/المشتريات */
const LINK_SOURCE_TYPES = new Set([13, 14, 18])
type ItemLink = { kind: "delivery" | "order"; code: string; pos: number }
function linkOf(row: Row): ItemLink | null {
  const code = text(row.delivery_code)
  const pos = num(row.strans_status)
  if (!code || pos < 0 || pos >= 1000) return null
  const status = num(row.spage_status)
  if (DELIVERY_SOURCED.has(status)) return { kind: "delivery", code, pos }
  if (ORDER_SOURCED.has(status)) return { kind: "order", code, pos }
  return null
}

export const ensureShamelLinkTables = () => runSchemaOnce("lib/shamel-migration/vouchers.ts#ensureShamelLinkTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS shamel_migration_links (
      item_id INTEGER PRIMARY KEY,
      link_kind VARCHAR(10) NOT NULL,
      src_code VARCHAR(40) NOT NULL,
      src_pos INTEGER NOT NULL
    )`
})

/** يحفظ روابط أسطر السند (للحل لاحقاً) وخريطة أسطر الإرساليات (موقع السطر بالشامل ⇐ رقم السطر هنا) */
async function recordItemLinks(shamelCode: string, vchType: number, meta: { row: Row; link: ItemLink | null }[], ids: number[]) {
  if (!ids.length) return
  await ensureShamelLinkTables()
  const links = meta.map((entry, index) => ({ ...entry, id: ids[index] })).filter((entry) => entry.link && entry.id)
  if (links.length) {
    await sql`
      INSERT INTO shamel_migration_links (item_id, link_kind, src_code, src_pos)
      SELECT * FROM unnest(${links.map((entry) => entry.id)}::int[], ${links.map((entry) => entry.link!.kind)}::text[],
        ${links.map((entry) => entry.link!.code)}::text[], ${links.map((entry) => entry.link!.pos)}::int[])
      ON CONFLICT (item_id) DO NOTHING`
  }
  if (LINK_SOURCE_TYPES.has(vchType)) {
    const keys = meta.map((entry) => `${shamelCode}|${num(entry.row.pos)}`)
    await sql`
      INSERT INTO shamel_migration_map (kind, shamel_key, web_id)
      SELECT 'voucher_item', k, id FROM unnest(${keys}::text[], ${ids}::int[]) AS s(k, id)
      ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id`
  }
}

/** recordItemLinks لعدة سندات بأمرين فقط */
async function recordItemLinksBulk(list: { code: string; vchType: number; meta: { row: Row; link: ItemLink | null }[]; ids: number[] }[]) {
  const links: { id: number; link: ItemLink }[] = []
  const mapKeys: string[] = [], mapIds: number[] = []
  for (const entry of list) {
    entry.meta.forEach((meta, index) => {
      const id = entry.ids[index]
      if (!id) return
      if (meta.link) links.push({ id, link: meta.link })
      if (LINK_SOURCE_TYPES.has(entry.vchType)) { mapKeys.push(`${entry.code}|${num(meta.row.pos)}`); mapIds.push(id) }
    })
  }
  if (links.length) {
    await sql`
      INSERT INTO shamel_migration_links (item_id, link_kind, src_code, src_pos)
      SELECT * FROM unnest(${links.map((entry) => entry.id)}::int[], ${links.map((entry) => entry.link.kind)}::text[],
        ${links.map((entry) => entry.link.code)}::text[], ${links.map((entry) => entry.link.pos)}::int[])
      ON CONFLICT (item_id) DO NOTHING`
  }
  if (mapKeys.length) {
    await sql`
      INSERT INTO shamel_migration_map (kind, shamel_key, web_id)
      SELECT 'voucher_item', k, id FROM unnest(${mapKeys}::text[], ${mapIds}::int[]) AS s(k, id)
      ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id`
  }
}

/**
 * يحل روابط الأسطر المعلّقة: سطر فاتورة ⇐ سطر إرساليته (delivery_item_id) أو سطر طلبيته (order_item_id)، ثم تُحدَّث
 * حالة تنفيذ الطلبيات المرتبطة. يُستدعى بنهاية كل ترحيل (والرابط الذي لم يُرحَّل مصدره بعد يبقى لترحيل لاحق).
 */
export async function resolveMigratedLinks() {
  await ensureShamelLinkTables()
  const delivered = await sql`
    UPDATE voucher_items_tbl vi SET delivery_item_id = m.web_id
    FROM shamel_migration_links l
    JOIN shamel_migration_map m ON m.kind = 'voucher_item' AND m.shamel_key = l.src_code || '|' || l.src_pos
    WHERE l.link_kind = 'delivery' AND vi.id = l.item_id
    RETURNING vi.id` as any[]
  const ordered = await sql`
    UPDATE voucher_items_tbl vi SET order_item_id = m.web_id
    FROM shamel_migration_links l
    JOIN shamel_migration_map m ON m.kind = 'order_item' AND m.shamel_key = l.src_code || '|' || l.src_pos
    WHERE l.link_kind = 'order' AND vi.id = l.item_id
    RETURNING vi.id, vi.order_item_id` as any[]
  const done = [...delivered, ...ordered].map((row) => Number(row.id))
  if (done.length) await sql`DELETE FROM shamel_migration_links WHERE item_id = ANY(${done}::int[])`
  const orderItemIds = [...new Set(ordered.map((row) => Number(row.order_item_id)))]
  if (orderItemIds.length) {
    const orderIds = ((await sql`SELECT DISTINCT order_id FROM order_items WHERE id = ANY(${orderItemIds}::int[])`) as any[]).map((row) => Number(row.order_id))
    const { refreshSalesOrderFulfillment } = await import("@/app/api/sales-vouchers/_lib")
    await refreshSalesOrderFulfillment(orderIds)
  }
  return { delivery: delivered.length, order: ordered.length }
}

/** INSERT متعدد الأسطر بأمر واحد */
async function insertMany(table: string, columns: string[], rows: unknown[][], returning = "") {
  if (!rows.length) return [] as any[]
  // حد معاملات Postgres 65535 لكل أمر ⇐ دفعات
  const perChunk = Math.max(1, Math.floor(60000 / Math.max(1, columns.length)))
  const result: any[] = []
  for (let offset = 0; offset < rows.length; offset += perChunk) {
    const chunk = rows.slice(offset, offset + perChunk)
    const params: unknown[] = []
    const values = chunk.map((row) => `(${row.map((value) => { params.push(value); return `$${params.length}` }).join(", ")})`)
    const out = (await sql.unsafe(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}${returning ? ` RETURNING ${returning}` : ""}`, params)) as any[]
    if (returning) result.push(...out)
  }
  return result
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
  await repairExistingVouchers(existing, groups, ctx)
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
      // التحضير بالذاكرة (خطأ التحقق يُسقط السند وحده)، ثم كتابة السنة كلها بأوامر مجمّعة؛ إن فشلت الكتابة المجمّعة
      // (قيد بالقاعدة مثلاً) تُعاد السندات واحداً واحداً داخل SAVEPOINT فيفشل السند المعطوب وحده كما كان
      const ready: PreparedVoucher[] = []
      for (const code of yearCodes) {
        try { ready.push(await prepareVoucher(code, pending.get(code)!, items.get(code) || [], ctx, lookups)) }
        catch (error) { ctx.error(code, error instanceof Error ? error.message : String(error)) }
      }
      await ensureShamelLinkTables()
      await withTenantTransaction(() => withYearOpened(year, async () => {
        const saved: [string, number][] = []
        let bulkDone = false
        if (ready.length > 1) {
          await sql`SAVEPOINT shamel_bulk`
          try {
            const written = await writeVouchers(ready)
            for (const voucher of ready) saved.push([voucher.code, written.get(voucher.code)!])
            await sql`RELEASE SAVEPOINT shamel_bulk`
            bulkDone = true
          } catch {
            await sql`ROLLBACK TO SAVEPOINT shamel_bulk`
            saved.length = 0
          }
        }
        if (!bulkDone) for (const voucher of ready) {
          await sql`SAVEPOINT shamel_voucher`
          try {
            saved.push([voucher.code, (await writeVouchers([voucher])).get(voucher.code)!])
            await sql`RELEASE SAVEPOINT shamel_voucher`
          } catch (error) {
            await sql`ROLLBACK TO SAVEPOINT shamel_voucher`
            ctx.error(voucher.code, error instanceof Error ? error.message : String(error))
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

// سند رُحِّل قبل ربط الأسطر: يُسجَّل ربط أسطره وخريطة أسطر الإرساليات، ويُضاف إخراج المخزون لأسطر فواتير الطلبيات
// الذي لم يُسجَّل حينها — مرة واحدة لكل سند (map voucher_relinked). الأسطر المرحّلة تطابق أسطر الشامل بالترتيب نفسه
// (نفس شروط التجاوز: صنف غير موجود أو كمية صفر).
async function repairExistingVouchers(existing: Map<string, number>, groups: Map<string, Row[]>, ctx: StepContext) {
  if (!existing.size) return
  const done = await mapGet("voucher_relinked", [...existing.keys()])
  const todo = [...existing.keys()].filter((code) => !done.has(code))
  if (!todo.length) return
  const items = await stagedItems(ctx.run.id, todo)
  const itemIds = await mapGet("item", [...items.values()].flat().map((row) => text(row.item_code)))
  const stores = await mapGet("store", [...items.values()].flat().map((row) => String(num(row.store))))
  for (const code of todo) {
    const type = typeByPrefix.get(code.charAt(0).toUpperCase())
    const voucherId = existing.get(code)!
    try {
      await withTenantTransaction(async () => {
        if (type && type.kind !== "finance") {
          const rows = (items.get(code) || []).filter((row) => itemIds.get(text(row.item_code)) && Math.abs(num(row.qnty)) > 0)
          const saved = ((await sql`SELECT id FROM voucher_items_tbl WHERE voucher_id = ${voucherId} ORDER BY id`) as any[]).map((row) => Number(row.id))
          if (rows.length === saved.length) {
            const meta = rows.map((row) => ({ row, link: linkOf(row) }))
            await recordItemLinks(code, type.vchType, meta, saved)
            const header = (await sql`SELECT status, to_store_id FROM voucher_header_tbl WHERE id = ${voucherId}`)[0] as any
            const missed = meta.filter((entry) => text(entry.row.delivery_code) && entry.link?.kind !== "delivery")
              .map((entry) => ({ product_id: itemIds.get(text(entry.row.item_code))!, quantity: Math.abs(num(entry.row.qnty)) + num(entry.row.bonus), store_id: stores.get(String(num(entry.row.store))) ?? null }))
            if (missed.length && type.stock && type.stock !== "transfer" && Number(header?.status) !== 3) {
              await applyStockMovement(missed, type.stock, voucherId, null, 1, type.kind === "sales" ? "sales_voucher" : "stock_voucher")
              ctx.info(`${code}: أُضيفت حركة مخزون ${missed.length} سطر من طلبية`)
            }
          } else if (rows.length) {
            ctx.warn(code, `تعذر ربط أسطر السند المرحّل سابقاً: ${saved.length} سطر مقابل ${rows.length} بالشامل`)
          }
        }
        await mapSet("voucher_relinked", code, voucherId)
      })
      ctx.stats.updated++
    } catch (error) {
      ctx.error(code, error instanceof Error ? error.message : String(error))
    }
  }
}

// سند قبض/صرف: شاشة السند تعرض طرف الدفع (مدين القبض / دائن الصرف) كحقول نقدي/شيكات وليس كأسطر «الحسابات» —
// أسطر القيد بالشامل كلها سواء، فيُصنَّف طرف الدفع: حساب مجموع أسطره = مجموع شيكات السند بالشامل ⇐ شيكات،
// والحساب الآخر ⇐ نقدي. حساب العميل/المورد (رأس السند) يبقى حساباً مقابلاً.
const crdrOf = (line: Row) => { const value = num(line.line_crdr); return value === 9 || value === 10 ? value - 8 : value }
function receiptLineTypes(vchType: number, lines: Row[], partyCode: string, chequeTotal: number) {
  const types = new Map<Row, number>()
  if (vchType !== RECEIPT_VCH_TYPE && vchType !== PAYMENT_VCH_TYPE) return types
  const paymentSide = vchType === RECEIPT_VCH_TYPE ? 1 : 2
  const byAccount = new Map<string, Row[]>()
  for (const line of lines) {
    const account = text(line.line_account)
    if (crdrOf(line) !== paymentSide || account === partyCode) continue
    byAccount.set(account, [...(byAccount.get(account) || []), line])
  }
  const sumOf = (rows: Row[]) => rows.reduce((sum, line) => sum + Math.abs(num(line.line_amount)), 0)
  let chequeAccount: string | null = null
  if (Math.abs(chequeTotal) > 0) {
    for (const [account, rows] of byAccount) if (Math.abs(sumOf(rows) - Math.abs(chequeTotal)) < 0.01) { chequeAccount = account; break }
  }
  let cashAccount: string | null = null
  for (const account of byAccount.keys()) if (account !== chequeAccount) { cashAccount = account; break }
  for (const [account, rows] of byAccount) {
    const journalType = account === chequeAccount ? JOURNAL_TYPE_CHEQUE : account === cashAccount ? JOURNAL_TYPE_CASH : null
    if (journalType) for (const line of rows) types.set(line, journalType)
  }
  return types
}

type PreparedVoucher = {
  code: string
  type: (typeof SHAMEL_VOUCHER_TYPES)[number]
  header: Record<string, unknown>
  /** أسطر القيد بلا voucher_id (يُضاف عند الكتابة) */
  journal: unknown[][]
  costCenters: [number, number][]
  items: unknown[][]
  itemMeta: { row: Row; link: ItemLink | null }[]
  moving: { product_id: number; quantity: number; store_id: number | null }[]
  toStore: number | null
  cancelled: boolean
}

/** يبني السند بالذاكرة (أخطاء التحقق تُرمى هنا فيفشل السند وحده) — الكتابة لاحقاً دفعة واحدة لعدة سندات */
async function prepareVoucher(code: string, lines: Row[], itemRows: Row[], ctx: StepContext, lookups: BatchLookups): Promise<PreparedVoucher> {
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

  // أسطر القيد كما قيّدها الشامل (CrDr: 1 مدين، 2 دائن؛ 9/10 = نفسها لسطر آلي)
  const journalLines = lines.filter((line) => text(line.line_account) && Math.abs(num(line.line_amount)) > 0)
  const lineTypes = receiptLineTypes(type.vchType, journalLines, text(header.customer_code), num(header.cheq_total))
  const rateFor = (currencyIdValue: number) => currencyIdValue === currency ? rate : rateOn(lookups, currencyIdValue, vchDate)
  const journal: unknown[][] = []
  const costCenters: [number, number][] = []
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
    const orderNo = journal.length + 1
    journal.push([orderNo, lineTypes.get(line) ?? JOURNAL_LINE_TYPE, accountIdValue, crdr, amount, lineCurrency, lineRate, base, accountCurrency, accountRate, accountAmount, text(line.line_note).slice(0, 70) || null])
    // مراكز التكلفة: الحقل n بالشامل = نوع مركز التكلفة n-1
    for (let typePos = 0; typePos < 6; typePos++) {
      const costCode = text(line[`cc${typePos + 1}`])
      const costCenterId = costCode ? lookups.costCenters.get(`${typePos}-${costCode}`) : null
      if (costCenterId) costCenters.push([orderNo, costCenterId])
    }
  }
  // رصيد السند بالشامل (Balance) صفر لسندات القيد: المبلغ = مجموع المدين بعملة السند
  let amount = Math.round(Math.abs(num(header.amount)) * 1000) / 1000
  if (!(amount > 0) && journal.length) {
    const debitBase = journal.reduce((sum, row) => sum + (row[3] === 1 ? Number(row[7]) || 0 : 0), 0)
    amount = Math.round((debitBase / (rate || 1)) * 1000) / 1000
  }

  const items: unknown[][] = []
  const itemMeta: { row: Row; link: ItemLink | null }[] = []
  const moving: { product_id: number; quantity: number; store_id: number | null }[] = []
  if (itemRows.length && type.kind !== "finance") {
    for (const row of itemRows) {
      const productId = lookups.items.get(text(row.item_code))
      // أصل ثابت (نوع 7 بالشامل) أو صنف محذوف: القيد يُرحَّل كما هو بلا سطر الصنف
      if (!productId) { ctx.warn(code, `الصنف ${text(row.item_code)} غير موجود (قد يكون أصلاً ثابتاً) — رُحِّل قيد السند بدون هذا السطر`); continue }
      const qty = Math.abs(num(row.qnty))
      if (!(qty > 0)) continue
      const storeId = lookups.stores.get(String(num(row.store))) ?? null
      const bonus = num(row.bonus)
      items.push([
        productId, "", lookups.units.get(`${text(row.item_code)}|${num(row.unit_pos)}`) ?? null, qty, bonus, num(row.discount),
        num(row.vat), num(row.price), text(row.note).slice(0, 200), 0, "",
        lookups.hasExpiry.get(productId) ? date(row.expiry_date) : NO_EXPIRY_SENTINEL_DATE, storeId,
      ])
      // سطر فاتورة منقول من إرسالية: البضاعة تحركت مع الإرسالية نفسها. سطر من طلبية يُخرج البضاعة
      const link = linkOf(row)
      itemMeta.push({ row, link })
      if (link?.kind !== "delivery") moving.push({ product_id: productId, quantity: qty + bonus, store_id: storeId })
    }
  }

  return {
    code, type, journal, costCenters, items, itemMeta, moving, toStore, cancelled,
    header: {
      vch_type: type.vchType, vch_code: vchCode, vch_date: vchDate, manual_date: vchDate, vch_book_id: bookId, branch_id: ctx.run.branch_id,
      currency_id: currency, rate, amount,
      account_id: type.kind === "stock" ? null : partyAccount, customer_name: text(header.customer_name).slice(0, 150) || null,
      salesman_id: salesmanId, manual_voucher: (text(header.manual_vch) || code).slice(0, 50),
      note: [text(header.note), text(header.note1)].filter(Boolean).join(" - ").slice(0, 1000) || null,
      status: cancelled ? 3 : 2, vch_status: cancelled ? 3 : 2, is_printed: (flags & 4) !== 0 ? 1 : 0,
      vat: num(header.vat) || null, discount: num(header.discount) || null, to_store_id: toStore,
      internal_voucher_id: currencyDifference ? INTERNAL_VOUCHER.CURRENCY_DIFFERENCE : null,
    },
  }
}

const JOURNAL_COLUMNS = ["voucher_id", "order_no", "journal_type_id", "account_id", "credit_debit", "amount", "currency_id", "rate", "base_curr_amount", "account_currency_id", "account_rate", "account_amount", "note"]
const ITEM_COLUMNS = ["voucher_id", "item_id", "item_name", "unit_id", "qnty", "bonus", "discount", "vat_amount", "price", "note", "cost_price", "barcode", "expiry_date", "store_id"]

/**
 * يكتب عدة سندات مُعدّة بأوامر مجمّعة: رؤوس، قيود، مراكز تكلفة، أصناف، روابط، وحركة مخزون — بضعة أوامر للدفعة كلها بدل
 * ~12 رحلة للقاعدة لكل سند (البطء الرئيسي مع قاعدة بعيدة). يُرجع رقم كل سند حسب رمز الشامل.
 */
async function writeVouchers(prepared: PreparedVoucher[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  if (!prepared.length) return ids
  // الرؤوس: نفس الأعمدة لكل السندات (الموجودة بقاعدة الشركة فقط)
  const headerColumnMax = await tableColumns("voucher_header_tbl")
  const present = (await presentValues("voucher_header_tbl", prepared[0].header)).map(([column]) => column)
  const headerRows = prepared.map((voucher) => present.map((column) => {
    const value = voucher.header[column]
    return typeof value === "string" && headerColumnMax.get(column) != null && value.length > headerColumnMax.get(column)! ? value.slice(0, headerColumnMax.get(column)!) : value
  }))
  const inserted = await insertMany("voucher_header_tbl", present.map((column) => `"${column}"`), headerRows, "id, vch_type, vch_code")
  const byKey = new Map(inserted.map((row: any) => [`${row.vch_type}|${row.vch_code}`, Number(row.id)]))
  for (const voucher of prepared) {
    const id = byKey.get(`${voucher.header.vch_type}|${voucher.header.vch_code}`)
    if (!id) throw new Error(`تعذر قراءة رقم السند ${voucher.code}`)
    ids.set(voucher.code, id)
  }

  // أسطر القيد ومراكز تكلفتها
  const journalRows = prepared.flatMap((voucher) => voucher.journal.map((row) => [ids.get(voucher.code), ...row]))
  const journalIds = await insertMany("voucher_journal_detail_tbl", JOURNAL_COLUMNS, journalRows, "id, voucher_id, order_no")
  const lineId = new Map(journalIds.map((row: any) => [`${row.voucher_id}|${row.order_no}`, Number(row.id)]))
  const costRows = prepared.flatMap((voucher) => voucher.costCenters.map(([orderNo, costCenterId]) => [lineId.get(`${ids.get(voucher.code)}|${orderNo}`), costCenterId]))
  await insertMany("voucher_costcenter_tbl", ["voucher_journal_id", "cost_center_id"], costRows)

  // أسطر الأصناف — أرقامها تصاعدية بترتيب الإدراج داخل كل سند فتطابق ترتيب itemMeta
  const withItems = prepared.filter((voucher) => voucher.items.length)
  const itemRows = withItems.flatMap((voucher) => voucher.items.map((row) => [ids.get(voucher.code), ...row]))
  const itemIds = await insertMany("voucher_items_tbl", ITEM_COLUMNS, itemRows, "id, voucher_id")
  const idsByVoucher = new Map<number, number[]>()
  for (const row of itemIds as any[]) idsByVoucher.set(Number(row.voucher_id), [...(idsByVoucher.get(Number(row.voucher_id)) || []), Number(row.id)])
  for (const list of idsByVoucher.values()) list.sort((a, b) => a - b)
  await recordItemLinksBulk(withItems.map((voucher) => ({ code: voucher.code, vchType: voucher.type.vchType, meta: voucher.itemMeta, ids: idsByVoucher.get(ids.get(voucher.code)!) || [] })))

  // حركة المخزون: رصيد كل صنف بأمر واحد، وسجل الحركات بأمر واحد (نفس applyStockMovement لكل السندات معاً)
  const movements: { productId: number; warehouseId: number | null; direction: "in" | "out"; quantity: number; referenceType: string; referenceId: number }[] = []
  for (const voucher of prepared) {
    if (voucher.cancelled || !voucher.type.stock || !voucher.moving.length) continue
    const referenceType = voucher.type.kind === "sales" ? "sales_voucher" : "stock_voucher"
    const voucherId = ids.get(voucher.code)!
    const push = (direction: "in" | "out", override: number | null) => {
      for (const item of voucher.moving) if (item.product_id && item.quantity > 0) movements.push({ productId: item.product_id, warehouseId: override ?? item.store_id ?? null, direction, quantity: item.quantity, referenceType, referenceId: voucherId })
    }
    if (voucher.type.stock === "transfer") { push("out", null); if (voucher.toStore) push("in", voucher.toStore) }
    else push(voucher.type.stock, null)
  }
  if (movements.length) {
    await sql`
      INSERT INTO product_stock (product_id, organization_id, current_stock)
      SELECT s.product_id, 1, SUM(s.quantity)
      FROM unnest(${movements.map((m) => m.productId)}::int[], ${movements.map((m) => (m.direction === "in" ? 1 : -1) * m.quantity)}::numeric[]) AS s(product_id, quantity)
      GROUP BY s.product_id
      ORDER BY s.product_id
      ON CONFLICT (product_id)
      DO UPDATE SET current_stock = product_stock.current_stock + EXCLUDED.current_stock, last_updated = CURRENT_TIMESTAMP`
    await sql`
      INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, organization_id)
      SELECT m.product_id, m.warehouse_id, m.direction, m.quantity, m.reference_type, m.reference_id, 1
      FROM unnest(${movements.map((m) => m.productId)}::int[], ${movements.map((m) => m.warehouseId)}::int[], ${movements.map((m) => m.direction)}::text[],
        ${movements.map((m) => m.quantity)}::numeric[], ${movements.map((m) => m.referenceType)}::text[], ${movements.map((m) => m.referenceId)}::int[])
        WITH ORDINALITY AS m(product_id, warehouse_id, direction, quantity, reference_type, reference_id, ord)
      ORDER BY m.ord`
  }
  return ids
}

// إصلاح السندات المرحّلة سابقاً: رقم السند إلى 10 خانات (JG007100 ⇐ JG00007100) إن لم يكن الرقم الجديد مستخدماً،
// والمبلغ الصفري (سندات القيد) = مجموع المدين بعملة الأساس ÷ سعر السند
export async function fixMigratedVouchers() {
  await ensureUsersCurrenciesDefaultTable()
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
  // قبض/صرف مرحّل قبل تصنيف طرف الدفع (كل أسطره «حسابات»): بيانات شيكات الشامل غير متاحة هنا، فحساب الشيكات
  // = حساب الشيكات الواردة بإعدادات المستخدمين (قبض) أو حساب الشيكات المدفوعة لحساب بنكي (صرف)، وغيره نقدي
  await sql`
    WITH migrated AS (
      SELECT h.id, h.vch_type, h.account_id AS party_id, CASE WHEN h.vch_type = ${RECEIPT_VCH_TYPE} THEN 1 ELSE 2 END AS payment_side
      FROM voucher_header_tbl h
      WHERE h.vch_type IN (${RECEIPT_VCH_TYPE}, ${PAYMENT_VCH_TYPE})
        AND h.id IN (SELECT web_id FROM shamel_migration_map WHERE kind = 'voucher')
        AND NOT EXISTS (SELECT 1 FROM voucher_journal_detail_tbl t WHERE t.voucher_id = h.id AND t.journal_type_id IN (${JOURNAL_TYPE_CASH}, ${JOURNAL_TYPE_CHEQUE}))
    ),
    cheque_accounts AS (
      SELECT received_cheqs_account_id AS account_id, ${RECEIPT_VCH_TYPE}::int AS vch_type FROM users_currencies_default_account_tbl WHERE received_cheqs_account_id IS NOT NULL
      UNION SELECT payed_checks_account_id, ${PAYMENT_VCH_TYPE}::int FROM bank_accounts WHERE payed_checks_account_id IS NOT NULL
    ),
    payment_lines AS (
      SELECT j.id, j.voucher_id, j.account_id,
        EXISTS (SELECT 1 FROM cheque_accounts ca WHERE ca.account_id = j.account_id AND ca.vch_type = m.vch_type) AS is_cheque
      FROM voucher_journal_detail_tbl j JOIN migrated m ON m.id = j.voucher_id
      WHERE j.credit_debit = m.payment_side AND j.account_id IS DISTINCT FROM m.party_id
    ),
    cash_account AS (
      SELECT DISTINCT ON (voucher_id) voucher_id, account_id FROM payment_lines WHERE NOT is_cheque ORDER BY voucher_id, id
    )
    UPDATE voucher_journal_detail_tbl j
    SET journal_type_id = CASE WHEN p.is_cheque THEN ${JOURNAL_TYPE_CHEQUE} ELSE ${JOURNAL_TYPE_CASH} END
    FROM payment_lines p
    LEFT JOIN cash_account c ON c.voucher_id = p.voucher_id
    WHERE j.id = p.id AND (p.is_cheque OR c.account_id = p.account_id)`.catch((error: unknown) => console.error("[shamel-migration] receipt line repair failed:", error))
  // مبلغ الرأس من الشامل عدد عشري طويل (36414.690650146375) ⇐ 3 خانات
  await sql`
    UPDATE voucher_header_tbl SET amount = ROUND(amount::numeric, 3)
    WHERE id IN (SELECT web_id FROM shamel_migration_map WHERE kind = 'voucher') AND amount IS NOT NULL AND amount::numeric <> ROUND(amount::numeric, 3)`
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
