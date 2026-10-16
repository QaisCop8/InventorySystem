import sql, { withTenantTransaction } from "@/lib/database"
import { AutoJournalError, INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, getRateByDate, type AutoJournalLine } from "@/lib/auto-journals"

// الأرصدة الافتتاحية للعملاء/الموردين/المشتركين عند استيرادهم من Excel: سند قيد آلي (مرحّل) لكل (عملة، تاريخ)،
// كل حساب مقابل "حساب وسيط / إدخال الأرصدة الافتتاحية" — يُنشأ تلقائياً إن لم يوجد (مستوى أول، ميزانية).

export const OPENING_BALANCE_CLEARING_NAME = "حساب وسيط / إدخال الأرصدة الافتتاحية"

/** الحساب الوسيط: بالاسم (أو اسم قريب)، حساب فرعي غير محذوف؛ وإلا يُنشأ برقم 99999999xx غير مستخدم. */
export async function ensureOpeningBalanceClearingAccount(): Promise<{ id: number; code: string; name: string }> {
  const existing = (await sql`
    SELECT a.id, a.code, a.name FROM account_tbl a
    WHERE COALESCE(a.status, 1) <> 3
      AND (a.name = ${OPENING_BALANCE_CLEARING_NAME} OR (a.name LIKE '%وسيط%' AND (a.name LIKE '%الأرصدة الافتتاحية%' OR a.name LIKE '%الارصدة الافتتاحية%')))
      AND NOT EXISTS (SELECT 1 FROM account_tbl c WHERE c.father_id = a.id AND COALESCE(c.status, 1) <> 3)
    ORDER BY (a.name = ${OPENING_BALANCE_CLEARING_NAME}) DESC, a.id
    LIMIT 1
  `)[0] as any
  if (existing) return { id: Number(existing.id), code: String(existing.code), name: String(existing.name) }

  // رقم بجوار "حساب وسيط / تحويلات العملة" (9999999990): أول رقم متاح نزولاً من 9999999980
  const used = new Set((await sql`SELECT code FROM account_tbl WHERE code LIKE '99999999%'`).map((row: any) => String(row.code)))
  let code = ""
  for (let number = 9999999980; number >= 9999999000; number -= 10) if (!used.has(String(number))) { code = String(number); break }
  if (!code) throw new AutoJournalError("تعذر توليد رقم للحساب الوسيط للأرصدة الافتتاحية")
  const template = (await sql`SELECT company_id FROM account_tbl ORDER BY id LIMIT 1`)[0] as any
  const created = (await sql`
    INSERT INTO account_tbl (
      company_id, code, type, name, father_id, level_no, finanical_list_id, currency_id,
      allow_trans_with_diff_curr, iscalc_curr_diff_rates, transaction_type, transaction_type_action,
      max_transaction_amount, max_transaction_amount_action, max_balance_amount, notes, show_notes_in_transactions_soa, status, insert_date, last_update_date
    ) VALUES (
      ${Number(template?.company_id) || 1}, ${code}, 1, ${OPENING_BALANCE_CLEARING_NAME}, NULL, 1, 1, NULL,
      0, false, 0, 0,
      0, 0, 0, ${"أُنشئ تلقائياً عند استيراد أرصدة افتتاحية من Excel"}, false, 1, CURRENT_DATE, NOW()
    ) RETURNING id, code, name
  `)[0] as any
  return { id: Number(created.id), code: String(created.code), name: String(created.name) }
}

export type OpeningBalanceLine = { key: number; accountId: number; amount: number; currencyId: number; date: string; label: string }

/**
 * amount موجب = مدين حساب العميل (والوسيط دائن)، سالب = دائن. يعيد لكل مفتاح سطر رمز السند أو رسالة الخطأ.
 * كل (عملة، تاريخ) سند واحد داخل معاملة — فشل سند لا يترك قيداً ناقصاً.
 */
export async function postOpeningBalances(lines: OpeningBalanceLine[], context: { userId: string; branchId: number; note: string }) {
  const results = new Map<number, { ok: boolean; voucherCode?: string; error?: string }>()
  const valid = lines.filter((line) => line.accountId > 0 && Math.abs(line.amount) >= 0.0005)
  if (!valid.length) return results
  const clearing = await ensureOpeningBalanceClearingAccount()
  const baseCurrencyId = await getBaseCurrencyId()
  const groups = new Map<string, OpeningBalanceLine[]>()
  for (const line of valid) {
    const key = `${line.currencyId}|${line.date}`
    groups.set(key, [...(groups.get(key) || []), line])
  }
  for (const group of groups.values()) {
    const { currencyId, date } = group[0]
    try {
      const rate = currencyId === Number(baseCurrencyId) ? 1 : (await getRateByDate(currencyId, date, baseCurrencyId)) ?? 1
      const journalLines: AutoJournalLine[] = group.map((line) => ({
        accountId: line.accountId, creditDebit: line.amount > 0 ? 1 : 2, amount: Math.round(Math.abs(line.amount) * 1000) / 1000, currencyId, rate,
        note: `رصيد افتتاحي - ${line.label}`.slice(0, 70),
      }))
      const net = Math.round(group.reduce((sum, line) => sum + line.amount, 0) * 1000) / 1000
      if (Math.abs(net) >= 0.0005) {
        journalLines.push({ accountId: clearing.id, creditDebit: net > 0 ? 2 : 1, amount: Math.abs(net), currencyId, rate, note: "أرصدة افتتاحية - استيراد Excel" })
      }
      const journal = await withTenantTransaction(() => createAutoJournal({
        userId: context.userId, branchId: context.branchId, date, currencyId, rate,
        note: context.note, internalVoucherId: INTERNAL_VOUCHER.OPENING_BALANCE, lines: journalLines,
      }))
      for (const line of group) results.set(line.key, { ok: true, voucherCode: journal.code })
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء سند القيد"
      for (const line of group) results.set(line.key, { ok: false, error: message })
    }
  }
  return results
}
