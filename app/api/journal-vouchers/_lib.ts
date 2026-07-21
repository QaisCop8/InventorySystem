import sql from "@/lib/database"
import { ensureTables as ensureVoucherTables, saveJournalRows, saveNoteRows, fetchDetails } from "../receipts/_lib"

// سند قيد يشارك نفس جداول سند القبض/الصرف (voucher_header_tbl / voucher_journal_detail_tbl /
// voucher_costcenter_tbl / voucher_notes_tbl) — الفرق الوحيد هنا: كل سطر في "الحسابات" هو
// طرف مدين أو دائن مباشرة (لا صناديق/شيكات/بطاقات)، ولا يوجد عميل/حساب مقابل منفصل.
export const ensureTables = ensureVoucherTables
export { saveJournalRows, saveNoteRows, fetchDetails }

// per voucher_types_tbl (7 = "سند قيد", مختلف عن سند القبض/الصرف 8/9).
export const JOURNAL_VCH_TYPE = 7

const VOUCHER_CODE_SEQUENCE_DIGITS = 6

export const getVoucherNumberSettings = async (
  requestUrl: string,
): Promise<{ prefix: string; startNumber: number }> => {
  const defaultPrefix = "J"
  try {
    const response = await fetch(new URL("/api/settings/system", requestUrl))
    if (!response.ok) return { prefix: defaultPrefix, startNumber: 1 }
    const settings = await response.json()
    const prefixRaw = String(settings?.journal_prefix || defaultPrefix).trim().toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(settings?.journal_start) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("Failed to load journal voucher numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export const buildVoucherCode = (prefix: string, bookName: string, sequence: number): string =>
  `${prefix}${bookName}${String(sequence).padStart(VOUCHER_CODE_SEQUENCE_DIGITS, "0")}`

export const nextVoucherSequence = async (codePrefix: string, startNumber: number): Promise<number> => {
  const rows = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND vch_code LIKE ${codePrefix + "%"}
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

// كل سطر مُدخَل في شبكة "الحسابات" (مدين أو دائن، وليس كلاهما) يصبح سطر journal_type_id=4
// مباشرة — القيد نفسه هو محتوى السند، بخلاف سند القبض/الصرف حيث الحسابات المقابلة تُكمّل
// طرفي نقدي/شيكات/بطاقات.
export interface JournalRow {
  journal_type_id: number
  account_id: number
  credit_debit: number
  amount: number
  note: string
  cost_centers: any[]
  order_no: number
  currency_id: number | null
  rate: number
  base_curr_amount: number
}

export const buildJournalRows = (data: any): JournalRow[] => {
  const currencyId = data.currency_id || null
  const rate = Number(data.rate || 1)

  const journalRows: any[] = (Array.isArray(data.journal) ? data.journal : []).filter(
    (row: any) => row?.account_id && Number(row?.debit || 0) + Number(row?.credit || 0) > 0,
  )

  return journalRows.map((row: any, index: number): JournalRow => {
    const debit = Number(row.debit || 0)
    const credit = Number(row.credit || 0)
    const amount = debit > 0 ? debit : credit
    return {
      journal_type_id: 4,
      account_id: Number(row.account_id),
      credit_debit: debit > 0 ? 1 : 2,
      amount,
      note: row.note || "",
      cost_centers: Array.isArray(row.cost_centers) ? row.cost_centers : [],
      order_no: index + 1,
      currency_id: currencyId,
      rate,
      base_curr_amount: Math.round(amount * rate * 100) / 100,
    }
  })
}
