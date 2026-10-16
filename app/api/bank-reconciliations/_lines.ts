import sql from "@/lib/database"

export type StatementLineInput = {
  txn_date: string
  description: string
  reference: string
  amount: number
  balance: number | null
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(String(value).replace(/,/g, "").trim())
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * أسطر الكشف من الواجهة (بعد معالج استيراد Excel): إما عمودا إيداع/سحب منفصلان أو مبلغ واحد بإشارة
 * (موجب = إيداع). أسطر بمبلغ صفر (أرصدة افتتاحية/عناوين) تُتجاهل. أسطر خارج فترة الكشف تُقبل مع تحذير.
 */
export function parseStatementLines(raw: unknown, from: string, to: string): { lines: StatementLineInput[]; warnings: string[] } | { error: string } {
  if (!Array.isArray(raw)) return { lines: [], warnings: [] }
  if (raw.length > 20000) return { error: "عدد أسطر الكشف كبير جداً (الحد 20000 سطر)" }
  const lines: StatementLineInput[] = []
  let outside = 0
  for (const [index, row] of raw.entries()) {
    const date = String((row as any)?.txn_date || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `السطر ${index + 1}: تاريخ الحركة غير صالح` }
    const deposit = num((row as any)?.deposit)
    const withdrawal = num((row as any)?.withdrawal)
    const signed = num((row as any)?.amount)
    const amount = deposit !== null || withdrawal !== null ? Math.abs(deposit || 0) - Math.abs(withdrawal || 0) : signed ?? 0
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.0005) continue
    if (date < from || date > to) outside++
    lines.push({
      txn_date: date,
      description: String((row as any)?.description || "").trim().slice(0, 1000),
      reference: String((row as any)?.reference || "").trim().slice(0, 120),
      amount: Math.round(amount * 1000) / 1000,
      balance: num((row as any)?.balance),
    })
  }
  const warnings = outside ? [`${outside} سطر بتاريخ خارج فترة الكشف — أُضيفت كما هي`] : []
  return { lines, warnings }
}

export async function insertStatementLines(reconciliationId: number, lines: StatementLineInput[], startNo: number) {
  if (!lines.length) return
  const column = <T,>(pick: (line: StatementLineInput, index: number) => T) => lines.map(pick)
  await sql`
    INSERT INTO bank_statement_lines_tbl (reconciliation_id, line_no, txn_date, description, reference, amount, balance)
    SELECT ${reconciliationId}, l.line_no, l.txn_date, l.description, l.reference, l.amount, l.balance
    FROM unnest(
      ${column((_, index) => startNo + index + 1)}::int[],
      ${column((line) => line.txn_date)}::date[],
      ${column((line) => line.description)}::text[],
      ${column((line) => line.reference)}::text[],
      ${column((line) => line.amount)}::numeric[],
      ${column((line) => line.balance)}::numeric[]
    ) AS l(line_no, txn_date, description, reference, amount, balance)
  `
}
