import sql from "@/lib/database"
import { ensureTables as ensureCreditCardTables } from "../credit-cards/_lib"

// Shared schema + persistence helpers for سند قبض / سند صرف (voucher_header_tbl and its
// related tables). Used by route.ts, [id]/route.ts and navigation/[navigationType]/route.ts
// so the three endpoints can never drift out of sync with each other.

export const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_header_tbl (
      id SERIAL PRIMARY KEY,
      vch_type INTEGER NOT NULL,
      vch_code VARCHAR(20) NOT NULL,
      vch_date DATE NOT NULL,
      currency_id INTEGER,
      rate DOUBLE PRECISION DEFAULT 1,
      cash_amount DOUBLE PRECISION DEFAULT 0,
      cash_account_id INTEGER,
      bank_amount DOUBLE PRECISION DEFAULT 0,
      bank_account_id INTEGER,
      amount DOUBLE PRECISION DEFAULT 0,
      note VARCHAR(200),
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (vch_type, vch_code)
    )
  `

  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vch_book_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS customer_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS to_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS check_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS check_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS credit_card_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS credit_card_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS payment_classification_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS salesman_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS manual_voucher VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS manual_date DATE`
  // Per-card fields moved to voucher_cards_detail_tbl (a voucher can carry more than one card).
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_type`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_code`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_expiry_date`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_type_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO voucher_journal_type_tbl (id, name) VALUES
      (1, 'نقدي'), (2, 'شيكات'), (3, 'بطاقات'), (4, 'حساب مقابل')
    ON CONFLICT (id) DO NOTHING
  `

  // voucher_journal_detail_tbl mirrors the real accounting schema: every voucher
  // must produce a balanced double-entry (sum(debit) == sum(credit), >= 2 rows).
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_detail_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      order_no INTEGER DEFAULT 1,
      journal_type_id INTEGER,
      account_id INTEGER NOT NULL,
      credit_debit INTEGER NOT NULL,
      amount DOUBLE PRECISION DEFAULT 0,
      currency_id INTEGER,
      rate DOUBLE PRECISION DEFAULT 1,
      base_curr_amount DOUBLE PRECISION DEFAULT 0,
      note VARCHAR(70)
    )
  `
  // account_currency_id/account_rate/account_amount: the account's own-currency view of the
  // line (distinct from currency_id/rate/base_curr_amount, which are the voucher's currency).
  // balance_id/contract_id: reserved for future budget/contract linking (per source schema).
  // Added via ALTER (not the CREATE above) since this table may already exist from before —
  // no FK here because the column may be backfilled against pre-existing rows.
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_currency_id INTEGER`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_rate DOUBLE PRECISION DEFAULT 1`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS balance_id INTEGER`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS contract_id INTEGER`
  // Cost centers now live in voucher_costcenter_tbl (a line can carry more than one).
  await sql`ALTER TABLE voucher_journal_detail_tbl DROP COLUMN IF EXISTS cost_center_id`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_costcenter_tbl (
      id SERIAL PRIMARY KEY,
      voucher_journal_id INTEGER NOT NULL REFERENCES voucher_journal_detail_tbl(id) ON DELETE CASCADE,
      cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_costcenter_tbl_journal ON voucher_costcenter_tbl(voucher_journal_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_notes_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      note VARCHAR(150),
      order_no INTEGER DEFAULT 1
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_related_vch_tbl (
      id SERIAL PRIMARY KEY,
      type INTEGER,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      related_vch_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_status_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(30)
    )
  `
  await sql`
    INSERT INTO voucher_status_tbl (id, name) VALUES (1, 'فعال'), (3, 'محذوف')
    ON CONFLICT (id) DO NOTHING
  `

  // voucher_types_tbl itself (the real one, migrated from legacy voucher_types) is owned by
  // app/api/voucher-book-permissions/_lib.ts — nothing here needs to join against it, only the
  // raw vch_type ints.
  // One-time migration: this table used to store 1 (قبض) / 2 (صرف) before vch_type was
  // aligned to voucher_types_tbl's real ids (8/9). No-op once already migrated.
  await sql`UPDATE voucher_header_tbl SET vch_type = ${RECEIPT_VCH_TYPE} WHERE vch_type = 1`
  await sql`UPDATE voucher_header_tbl SET vch_type = ${PAYMENT_VCH_TYPE} WHERE vch_type = 2`

  // Superseded by the real cheques_tbl below.
  await sql`DROP TABLE IF EXISTS voucher_cheques_tbl`

  await sql`
    CREATE TABLE IF NOT EXISTS cheques_type_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50),
      name_lang2 VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO cheques_type_tbl (id, name, name_lang2) VALUES
      (1, 'شيكات واردة', 'In Cheques'), (2, 'شيكات صادرة', 'Out Cheques')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cheque_status_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO cheque_status_tbl (id, name) VALUES
      (1, 'مستحق'), (2, 'غير مستحق'), (3, 'مؤجل'), (4, 'تم ايداعه'), (5, 'راجع'),
      (6, 'اعيد للمصدر'), (7, 'مجير'), (8, 'برسم التحصيل'), (9, 'ملغي')
    ON CONFLICT (id) DO NOTHING
  `

  // Full column set from the real cheques_tbl schema. Only the columns needed to record a
  // cheque on a سند قبض/سند صرف are populated here — the rest (return/hold/pay dates, log_id,
  // cheq_source_id, cheq_book_id, payment_order_id, attachments...) belong to future cheque
  // operation screens (deposit/return/transfer) and stay NULL/default until that's built.
  await sql`
    CREATE TABLE IF NOT EXISTS cheques_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE RESTRICT,
      cheq_type INTEGER REFERENCES cheques_type_tbl(id),
      bank_account VARCHAR(20),
      cheq_num VARCHAR(20),
      bank_id INTEGER REFERENCES banks(id),
      branch_id INTEGER REFERENCES branches(id),
      amount DOUBLE PRECISION,
      currency_id INTEGER,
      rate DOUBLE PRECISION,
      received_date TIMESTAMP,
      trans_date TIMESTAMP,
      due_date TIMESTAMP,
      pay_date TIMESTAMP,
      return_date TIMESTAMP,
      hold_date TIMESTAMP,
      first_due_date TIMESTAMP,
      customer_id INTEGER,
      rec_cheq_account_id INTEGER,
      current_account_id INTEGER,
      bank_account_id INTEGER,
      salesman_id INTEGER,
      log_id INTEGER,
      last_voucher_id INTEGER,
      cheq_source_id INTEGER,
      cheq_holder_id INTEGER,
      cheq_owner_name VARCHAR(70),
      status_id INTEGER REFERENCES cheque_status_tbl(id),
      cheq_book_id INTEGER,
      return_count INTEGER DEFAULT 0,
      previous_year INTEGER,
      manual_insert INTEGER DEFAULT 0,
      payment_order_id INTEGER,
      is_printed INTEGER DEFAULT 0,
      front_attach_id INTEGER,
      back_attach_id INTEGER,
      last_update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      update_user_id INTEGER,
      old_status_id INTEGER,
      order_no INTEGER DEFAULT 1
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_cheques_tbl_voucher_id ON cheques_tbl(voucher_id)`

  // credit_cards_types_tbl's real schema (بطاقات الائتمان admin screen) is owned there —
  // ensure it here too since سند قبض/سند صرف's card tab references it via FK.
  await ensureCreditCardTables()

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_cards_detail_tbl (
      id SERIAL PRIMARY KEY,
      card_type_id INTEGER REFERENCES credit_cards_types_tbl(id),
      card_no VARCHAR(50),
      expire_date TIMESTAMP,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      account_id INTEGER,
      amount DOUBLE PRECISION DEFAULT 0,
      bank_amount DOUBLE PRECISION DEFAULT 0,
      net_amount DOUBLE PRECISION DEFAULT 0,
      currency_id INTEGER,
      bank_currency_id INTEGER,
      card_currency_id INTEGER,
      fees_voucher_id INTEGER REFERENCES voucher_header_tbl(id),
      order_no INTEGER DEFAULT 1
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_cards_detail_tbl_voucher_id ON voucher_cards_detail_tbl(voucher_id)`
}

// vch_type values on voucher_header_tbl, per voucher_types_tbl.
export const RECEIPT_VCH_TYPE = 8
export const PAYMENT_VCH_TYPE = 9

const VOUCHER_CODE_SEQUENCE_DIGITS = 6

// رقم السند = بادئة (من إعدادات النظام) + رمز دفتر السندات + رقم تسلسلي مبطّن بأصفار
// (مثال: RE + F + 00001 = REF00001). يُقرأ عبر طلب داخلي لنفس منطق /api/settings/system
// بدل تكرار معالجة المخطط القديم/الجديد لجدول system_settings هناك.
export const getVoucherNumberSettings = async (
  requestUrl: string,
  vchType: number,
): Promise<{ prefix: string; startNumber: number }> => {
  const isReceipt = vchType === RECEIPT_VCH_TYPE
  const defaultPrefix = isReceipt ? "R" : "P"
  try {
    const response = await fetch(new URL("/api/settings/system", requestUrl))
    if (!response.ok) return { prefix: defaultPrefix, startNumber: 1 }
    const settings = await response.json()
    const prefixRaw = String(settings?.[isReceipt ? "receipt_prefix" : "payment_prefix"] || defaultPrefix).trim().toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(settings?.[isReceipt ? "receipt_start" : "payment_start"]) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("Failed to load voucher numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export const buildVoucherCode = (prefix: string, bookName: string, sequence: number): string =>
  `${prefix}${bookName}${String(sequence).padStart(VOUCHER_CODE_SEQUENCE_DIGITS, "0")}`

// الرقم التسلسلي التالي ضمن تركيبة (نوع السند + البادئة + رمز الدفتر) هذه تحديداً — تغيير
// الدفتر يبدّل رمزه ضمن الكود فيُعاد حساب الأقصى من جديد لتلك التركيبة، كما لو أنها ترقيم منفصل.
export const nextVoucherSequence = async (vchType: number, codePrefix: string, startNumber: number): Promise<number> => {
  const rows = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code LIKE ${codePrefix + "%"}
  `
  let maxNumber = 0
  for (const row of rows) {
    const numericPart = String(row.vch_code || "").slice(codePrefix.length)
    const value = Number(numericPart)
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value
  }
  return maxNumber >= startNumber ? maxNumber + 1 : startNumber
}

export const resolveVoucherBookName = async (bookId: number | null): Promise<string> => {
  if (!bookId) return ""
  const rows = await sql`SELECT name FROM voucher_books_tbl WHERE id = ${bookId}`
  return rows[0]?.name || ""
}

// Debit (credit_debit=1) / Credit (credit_debit=2) — matches the reference C# system
// (VoucherJournalDetail: "case when credit_debit=1 then amount else 0 end as debit").
// سند قبض: cash/check/card accounts are debited, the counter account(s) are credited.
// سند صرف: the reverse.
export const buildJournalRows = (data: any, vchType: number) => {
  const isReceipt = vchType === RECEIPT_VCH_TYPE
  const paymentSide = isReceipt ? 1 : 2
  const counterSide = isReceipt ? 2 : 1
  const currencyId = data.currency_id || null
  const rate = Number(data.rate || 1)

  const rows: any[] = []
  let orderNo = 1

  const cashAmount = Number(data.cash_amount || 0)
  if (cashAmount > 0 && data.cash_account_id) {
    rows.push({
      journal_type_id: 1,
      account_id: Number(data.cash_account_id),
      credit_debit: paymentSide,
      amount: cashAmount,
      note: "نقدي",
      cost_centers: Array.isArray(data.cash_account_cost_centers) ? data.cash_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const checkAmount = Number(data.check_amount || 0)
  if (checkAmount > 0 && data.check_account_id) {
    rows.push({
      journal_type_id: 2,
      account_id: Number(data.check_account_id),
      credit_debit: paymentSide,
      amount: checkAmount,
      note: "شيكات",
      cost_centers: Array.isArray(data.check_account_cost_centers) ? data.check_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const creditCardAmount = Number(data.credit_card_amount || 0)
  if (creditCardAmount > 0 && data.credit_card_account_id) {
    rows.push({
      journal_type_id: 3,
      account_id: Number(data.credit_card_account_id),
      credit_debit: paymentSide,
      amount: creditCardAmount,
      note: "بطاقات",
      cost_centers: Array.isArray(data.credit_card_account_cost_centers) ? data.credit_card_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const journalRows = (Array.isArray(data.journal) ? data.journal : []).filter(
    (row: any) => row?.account_id && Number(row?.amount || 0) > 0,
  )

  if (journalRows.length > 0) {
    for (const row of journalRows) {
      rows.push({
        journal_type_id: 4,
        account_id: Number(row.account_id),
        credit_debit: counterSide,
        amount: Number(row.amount),
        note: row.note || "",
        cost_centers: Array.isArray(row.cost_centers) ? row.cost_centers : [],
        order_no: orderNo++,
      })
    }
  } else if (data.to_account_id) {
    rows.push({
      journal_type_id: 4,
      account_id: Number(data.to_account_id),
      credit_debit: counterSide,
      amount: Number(data.amount || 0),
      note: "",
      cost_centers: [],
      order_no: orderNo++,
    })
  }

  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

export const saveJournalRows = async (voucherId: number, journalRows: any[]) => {
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`

  const accountCurrencyCache = new Map<number, number | null>()

  for (const row of journalRows) {
    let accountCurrencyId = accountCurrencyCache.get(row.account_id)
    if (accountCurrencyId === undefined) {
      const accountRows = await sql`SELECT currency_id FROM account_tbl WHERE id = ${row.account_id}`
      const resolvedCurrencyId: number | null = accountRows[0]?.currency_id ?? null
      accountCurrencyId = resolvedCurrencyId
      accountCurrencyCache.set(row.account_id, resolvedCurrencyId)
    }

    // v1 simplification: no cross-rate table exists yet, so the account's own-currency
    // amount mirrors the voucher's amount/rate even when the account's currency differs.
    const resolvedAccountCurrencyId = accountCurrencyId ?? row.currency_id
    const accountRate = row.rate
    const accountAmount = row.amount

    const inserted = await sql`
      INSERT INTO voucher_journal_detail_tbl (
        voucher_id, order_no, journal_type_id, account_id, credit_debit,
        amount, currency_id, rate, base_curr_amount, account_currency_id, account_rate, account_amount, note
      ) VALUES (
        ${voucherId}, ${row.order_no}, ${row.journal_type_id}, ${row.account_id}, ${row.credit_debit},
        ${row.amount}, ${row.currency_id}, ${row.rate}, ${row.base_curr_amount},
        ${resolvedAccountCurrencyId}, ${accountRate}, ${accountAmount}, ${row.note || ""}
      )
      RETURNING id
    `
    const journalId = inserted[0].id

    for (const costCenter of row.cost_centers || []) {
      if (!costCenter?.cost_center_id) continue
      await sql`
        INSERT INTO voucher_costcenter_tbl (voucher_journal_id, cost_center_id)
        VALUES (${journalId}, ${Number(costCenter.cost_center_id)})
      `
    }
  }
}

interface ChequeContext {
  vchType: number
  currencyId: number | null
  rate: number
  vchDate: string
  checkAccountId: number | null
}

export const saveChequeRows = async (voucherId: number, cheques: any[], ctx: ChequeContext) => {
  await sql`DELETE FROM cheques_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheq_num || row?.bank_account)
  // cheques_type_tbl: 1 = شيكات واردة (in, سند قبض), 2 = شيكات صادرة (out, سند صرف)
  const cheqType = ctx.vchType === RECEIPT_VCH_TYPE ? 1 : 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    await sql`
      INSERT INTO cheques_tbl (
        voucher_id, cheq_type, bank_account, cheq_num, bank_id, branch_id, amount,
        currency_id, rate, received_date, trans_date, due_date, cheq_owner_name,
        rec_cheq_account_id, current_account_id, status_id, manual_insert, is_printed, order_no
      ) VALUES (
        ${voucherId}, ${cheqType}, ${row.bank_account || ""}, ${row.cheq_num || ""}, ${row.bank_id || null}, ${row.branch_id || null},
        ${Number(row.amount || 0)}, ${ctx.currencyId}, ${ctx.rate}, ${ctx.vchDate}, ${ctx.vchDate}, ${row.due_date || null},
        ${row.cheq_owner_name || ""}, ${ctx.checkAccountId}, ${ctx.checkAccountId}, 1, 1, 0, ${i + 1}
      )
    `
  }
}

export const saveCardRows = async (voucherId: number, cards: any[], defaultCurrencyId: number | null) => {
  await sql`DELETE FROM voucher_cards_detail_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(cards) ? cards : []).filter((row) => row?.card_no || Number(row?.amount || 0) > 0)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const amount = Number(row.amount || 0)
    const bankAmount = Number(row.bank_amount || 0)
    const netAmount = row.net_amount !== null && row.net_amount !== undefined && row.net_amount !== ""
      ? Number(row.net_amount)
      : amount - bankAmount
    // Each card has its own currency (drives which نوع البطاقة options are offered),
    // separate from the voucher header's currency.
    const cardCurrencyId = row.currency_id || defaultCurrencyId

    await sql`
      INSERT INTO voucher_cards_detail_tbl (
        voucher_id, card_type_id, card_no, expire_date, account_id, amount, bank_amount, net_amount,
        currency_id, bank_currency_id, card_currency_id, order_no
      ) VALUES (
        ${voucherId}, ${row.card_type_id || null}, ${row.card_no || ""}, ${row.expire_date || null}, ${row.account_id || null},
        ${amount}, ${bankAmount}, ${netAmount}, ${cardCurrencyId}, ${cardCurrencyId}, ${cardCurrencyId}, ${i + 1}
      )
    `
  }
}

export const saveNoteRows = async (voucherId: number, notes: any[]) => {
  await sql`DELETE FROM voucher_notes_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(notes) ? notes : []).filter((row) => row?.note && row.note.trim())
  for (let i = 0; i < rows.length; i++) {
    await sql`
      INSERT INTO voucher_notes_tbl (voucher_id, note, order_no)
      VALUES (${voucherId}, ${rows[i].note}, ${i + 1})
    `
  }
}

export const fetchDetails = async (voucherId: number) => {
  const [journalRaw, cashCheckCardRows, costCenterRows, cheques, notes, cards] = await Promise.all([
    // journal_type_id 1/2/3 (نقدي/شيكات/بطاقات) هي أسطر تركيبية تعكس حقول الرئيسية المخصصة
    // (cash_amount/check_amount/credit_card_amount) وليست جزءاً من تبويب "الحسابات" — فقط
    // النوع 4 (الحساب المقابل الفعلي الذي يُدخله المستخدم في تلك الشبكة) يجب أن يُعرض فيها،
    // وإلا تظهر أسطر نقدي/شيكات/بطاقات مكرَّرة مع سطر الحساب الحقيقي.
    // vjd.* لا يحمل رقم/اسم الحساب (voucher_journal_detail_tbl يخزّن account_id فقط) — لذا
    // يُنضمّ إلى account_tbl هنا، وإلا تظهر شبكة الحسابات فارغة الحقول عند عرض سند محفوظ سابقاً.
    sql`
      SELECT vjd.*, acc.code AS account_code, acc.name AS account_name
      FROM voucher_journal_detail_tbl vjd
      LEFT JOIN account_tbl acc ON acc.id = vjd.account_id
      WHERE vjd.voucher_id = ${voucherId} AND vjd.journal_type_id = 4
      ORDER BY vjd.order_no, vjd.id
    `,
    sql`SELECT id, journal_type_id FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId} AND journal_type_id IN (1, 2, 3)`,
    sql`
      SELECT vc.id, vc.voucher_journal_id, vc.cost_center_id, cc.cost_type_id AS cost_center_type_id, cc.name AS cost_center_name
      FROM voucher_costcenter_tbl vc
      INNER JOIN voucher_journal_detail_tbl vjd ON vjd.id = vc.voucher_journal_id
      LEFT JOIN cost_centers cc ON cc.id = vc.cost_center_id
      WHERE vjd.voucher_id = ${voucherId}
    `,
    sql`
      SELECT c.*, b.bank_code AS bank_no, b.bank_name, br.branch_code AS branch_no, br.branch_name
      FROM cheques_tbl c
      LEFT JOIN banks b ON b.id = c.bank_id
      LEFT JOIN branches br ON br.id = c.branch_id
      WHERE c.voucher_id = ${voucherId}
      ORDER BY c.order_no, c.id
    `,
    sql`SELECT * FROM voucher_notes_tbl WHERE voucher_id = ${voucherId} ORDER BY order_no, id`,
    sql`SELECT * FROM voucher_cards_detail_tbl WHERE voucher_id = ${voucherId} ORDER BY order_no, id`,
  ])

  const costCentersByJournalId = new Map<number, any[]>()
  for (const row of costCenterRows) {
    const list = costCentersByJournalId.get(row.voucher_journal_id) || []
    list.push({
      cost_center_id: row.cost_center_id,
      cost_center_type_id: row.cost_center_type_id,
      cost_center_name: row.cost_center_name,
    })
    costCentersByJournalId.set(row.voucher_journal_id, list)
  }

  const journal = journalRaw.map((row: any) => ({
    ...row,
    cost_centers: costCentersByJournalId.get(row.id) || [],
  }))

  // نقدي (1) / شيكات (2) / بطاقات (3) ليست أسطراً في تبويب "الحسابات" (انظر التعليق أعلاه)
  // لذا تُعاد مراكز تكلفتها كحقول مستقلة على مستوى السند بدل ضمن `journal`.
  const cashCheckCardCostCenters = new Map<number, any[]>()
  for (const row of cashCheckCardRows) {
    cashCheckCardCostCenters.set(row.journal_type_id, costCentersByJournalId.get(row.id) || [])
  }

  return {
    journal,
    cheques,
    notes,
    cards,
    cash_account_cost_centers: cashCheckCardCostCenters.get(1) || [],
    check_account_cost_centers: cashCheckCardCostCenters.get(2) || [],
    credit_card_account_cost_centers: cashCheckCardCostCenters.get(3) || [],
  }
}
