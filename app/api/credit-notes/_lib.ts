import sql from "@/lib/database"
import {
  ensureTables as ensureReceiptsTables,
  JOURNAL_TYPE_COUNTER_ACCOUNT,
  saveJournalRows,
  validateJournalAccountCurrencies,
  archiveAndDeleteVoucher,
  markVoucherPrinted,
  buildVoucherCode,
  nextVoucherSequence,
  resolveVoucherBookName,
} from "../receipts/_lib"
import { ensureTables as ensureVoucherTypesTable } from "../voucher-book-permissions/_lib"

// اشعار دائن (Credit Note) / اشعار مدين (Debit Note) — سند بثلاثة أسطر قيد ثابتة (ضريبة +
// حساب مدين/مقابل + حساب العميل)، وليس شبكة حسابات متعددة الأسطر كسند القيد، ولا نقدي/شيكات/
// بطاقات كسند القبض/الصرف. مبني على نفس voucher_header_tbl (عبر ensureReceiptsTables) بأعمدة
// إضافية خاصة به فقط.
export const CREDIT_NOTE_VCH_TYPE = 10
export const DEBIT_NOTE_VCH_TYPE = 11

// journal_type_id ثابتة حسب voucher_journal_type_caption_tbl (مطابقة تماماً لـ fillJournalsList
// في CreditNote.js الأصلي — الترقيم معكوس عمداً بين النوعين مقابل التسميات، وهذا مطابق للمرجع):
// 7=ضريبة المبيعات، 10=ضريبة المشتريات، 8=الخصم بالإشعار المدين، 11=الخصم المكتسب بالإشعار الدائن.
const VAT_JOURNAL_TYPE = { credit: 7, debit: 10 } as const
const CONTRA_JOURNAL_TYPE = { credit: 8, debit: 11 } as const

export const ensureTables = async () => {
  await ensureReceiptsTables()
  // يضمن وجود سجلي voucher_types_tbl (10/11) حتى عند استدعاء هذا الملف مباشرة قبل أي طلب لدفاتر
  // السندات (/api/receipts/voucher-books هو المسار الآخر الذي يستدعي هذا أيضاً).
  await ensureVoucherTypesTable()
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS debit_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS amount_journal_type_8 DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS debit_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS amount_journal_type_8 DOUBLE PRECISION`
}

// مطابق لـ fillJournalsList في CreditNote.js: 3 أسطر ثابتة بالترتيب (ضريبة، حساب مدين/مقابل،
// حساب العميل) — سطر الضريبة يُحذف إن كانت الضريبة صفراً، والباقي يُضاف دائماً.
export const buildCreditNoteJournalRows = (data: any, vchType: number) => {
  const isCredit = vchType === CREDIT_NOTE_VCH_TYPE
  const currencyId = data.currency_id || null
  const rate = Number(data.rate || 1)

  const vatAmount = Number(data.vat || 0)
  const netAmount = Number(data.amount_journal_type_8 || 0)
  const totalAmount = Number(data.amount || 0)

  const rows: any[] = []
  let orderNo = 1

  if (vatAmount > 0) {
    rows.push({
      order_no: orderNo++,
      journal_type_id: isCredit ? VAT_JOURNAL_TYPE.credit : VAT_JOURNAL_TYPE.debit,
      credit_debit: isCredit ? 1 : 2,
      amount: vatAmount,
      account_id: data.vat_account_id ? Number(data.vat_account_id) : null,
      note: "",
      cost_centers: [],
    })
  } else {
    orderNo++
  }

  rows.push({
    order_no: orderNo++,
    journal_type_id: isCredit ? CONTRA_JOURNAL_TYPE.credit : CONTRA_JOURNAL_TYPE.debit,
    credit_debit: isCredit ? 1 : 2,
    amount: netAmount,
    account_id: data.debit_account_id ? Number(data.debit_account_id) : null,
    note: "",
    cost_centers: [],
  })

  rows.push({
    order_no: orderNo++,
    journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT,
    credit_debit: isCredit ? 2 : 1,
    amount: totalAmount,
    account_id: data.account_id ? Number(data.account_id) : null,
    note: "",
    cost_centers: [],
  })

  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

export const fetchCreditNoteDetails = async (voucherId: number) => {
  const rows = await sql`
    SELECT vjd.*, acc.code AS account_code, acc.name AS account_name
    FROM voucher_journal_detail_tbl vjd
    LEFT JOIN account_tbl acc ON acc.id = vjd.account_id
    WHERE vjd.voucher_id = ${voucherId}
    ORDER BY vjd.order_no, vjd.id
  `
  const vatRow = rows.find((r: any) => Number(r.journal_type_id) === VAT_JOURNAL_TYPE.credit || Number(r.journal_type_id) === VAT_JOURNAL_TYPE.debit)
  const debitRow = rows.find(
    (r: any) => Number(r.journal_type_id) === CONTRA_JOURNAL_TYPE.credit || Number(r.journal_type_id) === CONTRA_JOURNAL_TYPE.debit,
  )
  const customerRow = rows.find((r: any) => Number(r.journal_type_id) === JOURNAL_TYPE_COUNTER_ACCOUNT)

  return {
    vat_account_code: vatRow?.account_code ?? "",
    vat_account_name: vatRow?.account_name ?? "",
    debit_account_code: debitRow?.account_code ?? "",
    debit_account_name: debitRow?.account_name ?? "",
    account_code: customerRow?.account_code ?? "",
    account_name: customerRow?.account_name ?? "",
  }
}

// رقم السند = بادئة (إعدادات النظام: بادئة الاشعار الدائن/المدين) + رمز دفتر السندات + رقم
// تسلسلي، بنفس منطق getVoucherNumberSettings في receipts/_lib.ts لكن بمفاتيح إعداد مختلفة.
export const getCreditNoteNumberSettings = async (
  requestUrl: string,
  vchType: number,
): Promise<{ prefix: string; startNumber: number }> => {
  const isCredit = vchType === CREDIT_NOTE_VCH_TYPE
  const defaultPrefix = isCredit ? "C" : "D"
  try {
    const response = await fetch(new URL("/api/settings/system", requestUrl))
    if (!response.ok) return { prefix: defaultPrefix, startNumber: 1 }
    const settings = await response.json()
    const prefixRaw = String(settings?.[isCredit ? "credit_note_prefix" : "debit_note_prefix"] || defaultPrefix)
      .trim()
      .toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(settings?.[isCredit ? "credit_note_start" : "debit_note_start"]) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("Failed to load credit/debit note numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export {
  saveJournalRows,
  validateJournalAccountCurrencies,
  archiveAndDeleteVoucher,
  markVoucherPrinted,
  buildVoucherCode,
  nextVoucherSequence,
  resolveVoucherBookName,
}
