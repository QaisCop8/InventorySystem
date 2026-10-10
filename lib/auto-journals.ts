import sql from "@/lib/database"
import {
  JournalDefaultsError,
  accountDefaultCostCenters,
  mergeLineCostCenters,
  nextJournalVoucherCode,
  resolveUserDefaultJournalBook,
  type JournalBookContext,
} from "@/lib/journal-defaults"

// قيود آلية (قيود عمولة الفيزا، تحويل عملة، تحويل عملة حساب، فرق عملة) — منقولة من ShamelAPI
// (Features/Vouchers/*Journals). كل قيد يُحفَظ كسند قيد عادي (vch_type=3) مُرحَّل، مُعلَّم بـ
// internal_voucher_id بنفس قيم Shamel، فيظهر في شاشة سند القيد وكشوف الحسابات والتقارير كأي قيد.
//
// بخلاف saveJournalRows (receipts/_lib.ts) الذي يضع مبلغ الحساب = مبلغ السند دائماً (تبسيط v1)،
// هنا تُحسَب عملة الحساب وسعرها ومبلغه فعلياً — هذه القيود تحديداً تنقل أرصدة بين العملات، فمبلغ
// الحساب بعملته هو جوهرها لا تفصيلاً ثانوياً.

export const AUTO_JOURNAL_VCH_TYPE = 3
export const INTERNAL_VOUCHER = {
  CARD_COMMISSION: 2, // قيود عمولة بطاقة
  CURRENCY_CONVERT: 4, // قيود تحويل عملة
  ACCOUNT_CURRENCY_CONVERT: 5, // قيود تحويل عملة حساب
  CURRENCY_DIFFERENCE: 10, // قيود فرق العملة
} as const

// The journal voucher screen (receipts/_lib.ts fetchDetails) only loads lines of this type, and every
// other journal writer (manual journals, cheques, payroll) uses it — auto journals must too, or their
// lines are saved but invisible when the journal is opened.
export const JOURNAL_LINE_TYPE = 5
// Types previously written by auto journals; repaired to JOURNAL_LINE_TYPE in ensureAutoJournalTables.
const LEGACY_AUTO_LINE_TYPES = [1, 13]
// internal_voucher_id 30 = fixed assets (lib/fixed-assets/schema.ts), which also posts through here.
const AUTO_INTERNAL_VOUCHERS = [2, 4, 5, 10, 30]

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}
export const round2 = (value: number) => round(value, 2)

export const dateOnly = (value: unknown) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : new Date().toISOString().slice(0, 10)

// عملة الأساس = أصغر معرّف في جدول currency (نفس قاعدة /api/exchange-rates/lookup).
export async function getBaseCurrencyId(): Promise<number | null> {
  const rows = await sql`SELECT MIN(id) AS id FROM currency`
  return rows[0]?.id != null ? Number(rows[0].id) : null
}

// سعر صرف العملة بتاريخ معيّن: عملة الأساس = 1، وإلا آخر سعر فعّال بتاريخ <= التاريخ، وإلا null.
export async function getRateByDate(currencyId: number | null, date: string, baseCurrencyId?: number | null): Promise<number | null> {
  if (!currencyId) return null
  const base = baseCurrencyId === undefined ? await getBaseCurrencyId() : baseCurrencyId
  if (base != null && Number(currencyId) === Number(base)) return 1
  const rows = await sql`
    SELECT exchange_rate FROM exchange_rates
    WHERE currency_id = ${currencyId} AND rate_date <= ${date} AND COALESCE(is_active, true) = true
    ORDER BY rate_date DESC, created_at DESC
    LIMIT 1
  `
  const rate = Number(rows[0]?.exchange_rate)
  return rate > 0 ? rate : null
}

export type AutoJournalLine = {
  accountId: number
  creditDebit: 1 | 2
  amount: number
  currencyId: number
  rate: number
  note?: string
  // مراكز تكلفة صريحة (تتقدّم على افتراضي الحساب من نفس النوع)؛ بقية الأنواع من افتراضيات الحساب.
  costCenterIds?: number[]
  // مبلغ الحساب بعملته بدل الاحتساب التلقائي — قيد فرق العملة يغيّر قيمة الرصيد بعملة الأساس فقط
  // دون أي أثر على رصيد الحساب بعملته (0).
  accountAmountOverride?: number
}

export type AutoJournalInput = {
  userId: string
  branchId: number
  date: string
  currencyId: number
  rate: number
  note: string
  internalVoucherId: number
  manualVoucher?: string
  lines: AutoJournalLine[]
}

export type AutoJournalResult = { id: number; code: string }

export class AutoJournalError extends Error {}

type JournalContext = JournalBookContext

// المستخدم المنفّذ ودفتره الافتراضي لسند القيد — قاعدة مشتركة لكل القيود الآلية (lib/journal-defaults.ts).
export async function resolveJournalContext(userId: string): Promise<JournalContext> {
  try {
    return await resolveUserDefaultJournalBook(userId)
  } catch (error) {
    if (error instanceof JournalDefaultsError) throw new AutoJournalError(error.message)
    throw error
  }
}

// يجب استدعاؤها داخل withTenantTransaction (قفل الترقيم pg_advisory_xact_lock مرتبط بالمعاملة).
export async function createAutoJournal(input: AutoJournalInput, context?: JournalContext): Promise<AutoJournalResult> {
  const lines = input.lines
    .map((line) => ({ ...line, amount: round2(Math.abs(Number(line.amount) || 0)) }))
    .filter((line) => line.accountId > 0 && line.amount > 0)
  if (lines.length < 2) throw new AutoJournalError("القيد يحتاج طرفين على الأقل بمبلغ أكبر من صفر")

  // التوازن بعملة الأساس (أطراف القيد قد تكون بعملات مختلفة في قيد فرق العملة فقط بعملة الأساس).
  const baseOf = (line: AutoJournalLine) => round2(line.amount * line.rate)
  const debitBase = round2(lines.filter((l) => l.creditDebit === 1).reduce((s, l) => s + baseOf(l), 0))
  const creditBase = round2(lines.filter((l) => l.creditDebit === 2).reduce((s, l) => s + baseOf(l), 0))
  if (Math.abs(debitBase - creditBase) > 0.01) throw new AutoJournalError("القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن")

  const accountIds = Array.from(new Set(lines.map((line) => line.accountId)))
  const accounts = await sql`
    SELECT id, code, name, currency_id, COALESCE(status, 1) AS status,
      EXISTS(SELECT 1 FROM account_tbl child WHERE child.father_id = account_tbl.id) AS is_parent
    FROM account_tbl WHERE id = ANY(${accountIds}::int[])
  `
  const accountById = new Map(accounts.map((row: any) => [Number(row.id), row]))
  for (const accountId of accountIds) {
    const account: any = accountById.get(accountId)
    if (!account) throw new AutoJournalError(`الحساب ${accountId} غير موجود`)
    if (Number(account.status) === 3) throw new AutoJournalError(`الحساب ${account.code} - ${account.name} موقوف`)
    if (account.is_parent) throw new AutoJournalError(`الحساب ${account.code} - ${account.name} حساب أب ولا يقبل حركات`)
  }

  const ctx = context ?? (await resolveJournalContext(input.userId))
  const code = await nextJournalVoucherCode(ctx)
  const amount = round2(lines.filter((l) => l.creditDebit === 1).reduce((s, l) => s + (l.currencyId === input.currencyId ? l.amount : baseOf(l) / (input.rate || 1)), 0))
  const voucher = (await sql`
    INSERT INTO voucher_header_tbl (
      vch_type, vch_code, vch_date, manual_date, vch_book_id, branch_id, currency_id, rate, amount,
      manual_voucher, note, status, vch_status, is_printed, internal_voucher_id, insert_user, update_user
    ) VALUES (
      ${AUTO_JOURNAL_VCH_TYPE}, ${code}, ${input.date}, ${input.date}, ${ctx.bookId}, ${input.branchId}, ${input.currencyId}, ${input.rate || 1}, ${amount},
      ${String(input.manualVoucher || "").slice(0, 50)}, ${String(input.note || "").slice(0, 1000)}, 2, 2, 0, ${input.internalVoucherId}, ${ctx.userSettingId}, ${ctx.userSettingId}
    ) RETURNING id, vch_code
  `)[0]
  const voucherId = Number(voucher.id)

  const baseCurrencyId = await getBaseCurrencyId()
  const defaultCostCenters = await accountDefaultCostCenters(accountIds)
  const accountRateCache = new Map<number, number>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const account: any = accountById.get(line.accountId)
    const baseAmount = baseOf(line)
    const accountCurrencyId = account.currency_id != null ? Number(account.currency_id) : line.currencyId
    let accountRate = line.rate
    let accountAmount = line.amount
    if (accountCurrencyId !== line.currencyId) {
      if (!accountRateCache.has(accountCurrencyId)) {
        accountRateCache.set(accountCurrencyId, (await getRateByDate(accountCurrencyId, input.date, baseCurrencyId)) ?? 1)
      }
      accountRate = accountRateCache.get(accountCurrencyId)!
      accountAmount = round2(baseAmount / accountRate)
    }
    if (line.accountAmountOverride !== undefined) accountAmount = line.accountAmountOverride

    const inserted = (await sql`
      INSERT INTO voucher_journal_detail_tbl (
        voucher_id, order_no, journal_type_id, account_id, credit_debit,
        amount, currency_id, rate, base_curr_amount, account_currency_id, account_rate, account_amount, note
      ) VALUES (
        ${voucherId}, ${index + 1}, ${JOURNAL_LINE_TYPE}, ${line.accountId}, ${line.creditDebit},
        ${line.amount}, ${line.currencyId}, ${line.rate}, ${baseAmount}, ${accountCurrencyId}, ${accountRate}, ${accountAmount}, ${String(line.note || "").slice(0, 70)}
      ) RETURNING id
    `)[0]

    // الصريحة (كمركز تكلفة الأصل) تتقدّم على افتراضي الحساب من نفس النوع؛ بقية الأنواع من افتراضيات الحساب
    const costCenters = await mergeLineCostCenters(line.costCenterIds || [], defaultCostCenters.get(line.accountId) || [])
    for (const { cost_center_id: costCenterId } of costCenters) {
      await sql`INSERT INTO voucher_costcenter_tbl (voucher_journal_id, cost_center_id) VALUES (${Number(inserted.id)}, ${costCenterId})`
    }
  }

  return { id: voucherId, code: String(voucher.vch_code) }
}

// ربط سندين ببعضهما في الاتجاهين (قيدا تحويل العملة يُنشآن كزوج) — voucher_related_vch_tbl.type=1.
export async function linkRelatedVouchers(firstId: number, secondId: number) {
  await sql`
    INSERT INTO voucher_related_vch_tbl (type, voucher_id, related_vch_id)
    VALUES (1, ${firstId}, ${secondId}), (1, ${secondId}, ${firstId})
  `
}

export async function ensureAutoJournalTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_related_vch_tbl (
      id SERIAL PRIMARY KEY,
      type INTEGER,
      voucher_id INTEGER,
      related_vch_id INTEGER
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_related_vch_tbl_voucher_id ON voucher_related_vch_tbl(voucher_id)`
  await sql`ALTER TABLE voucher_cards_detail_tbl ADD COLUMN IF NOT EXISTS fees_voucher_id INTEGER`
  await sql`
    UPDATE voucher_journal_detail_tbl d SET journal_type_id = ${JOURNAL_LINE_TYPE}
    FROM voucher_header_tbl h
    WHERE h.id = d.voucher_id AND h.vch_type = ${AUTO_JOURNAL_VCH_TYPE}
      AND h.internal_voucher_id = ANY(${AUTO_INTERNAL_VOUCHERS}::int[])
      AND d.journal_type_id = ANY(${LEGACY_AUTO_LINE_TYPES}::int[])
  `
}

// عند إلغاء سند قيد آلي (status=3) من شاشة سند القيد: يُحرَّر ما ربطه، ويُلغى قيده المقترن في
// تحويل العملة (القيدان معاً يمثلان عملية واحدة؛ إلغاء أحدهما فقط يترك حساب التحويل غير مُصفّر).
export async function releaseAutoJournal(voucherId: number) {
  await sql`UPDATE voucher_cards_detail_tbl SET fees_voucher_id = NULL WHERE fees_voucher_id = ${voucherId}`
  const header = (await sql`SELECT internal_voucher_id FROM voucher_header_tbl WHERE id = ${voucherId}`)[0]
  const internal = Number(header?.internal_voucher_id || 0)
  if (internal !== INTERNAL_VOUCHER.CURRENCY_CONVERT && internal !== INTERNAL_VOUCHER.ACCOUNT_CURRENCY_CONVERT) return
  await sql`
    UPDATE voucher_header_tbl SET status = 3, vch_status = 1, last_update_date = CURRENT_TIMESTAMP
    WHERE id IN (SELECT related_vch_id FROM voucher_related_vch_tbl WHERE voucher_id = ${voucherId} AND type = 1)
      AND internal_voucher_id = ${internal} AND status <> 3
  `
}
