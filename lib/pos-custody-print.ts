"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { loadVoucherPrintSettings, printVoucherWithSettings, type PrintResult } from "@/lib/voucher-print/print"
import type { PrintDocument } from "@/lib/voucher-print/document"

// إيصال تسليم/إغلاق العهدة في الكاشير — بحجم إيصال الكاشير (80mm): عبر CashierWinService إن وُجدت على الجهاز،
// وإلا طباعة المتصفح (print_method "auto" في lib/voucher-print/print.ts). المبالغ من نافذة العهدة لحظة التأكيد.
type Currency = { currency_id: number; currency_code: string; currency_name: string; rate_to_point: number }
type TobaccoLine = { product_code: string; product_name: string; opening_qty: number; sold_qty: number; expected_qty: number; counted_qty: number | null }

export type CustodyPrintInput = {
  kind: "handover" | "close"
  pointName: string
  userName: string
  currencyCode: string
  session: Record<string, any>
  currencies: Currency[]
  amounts: Record<number, number>
  note?: string
  tobacco?: TobaccoLine[]
}

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", cheque: "شيكات", card: "بطاقات", account: "ذمم", gift_card: "بطاقات هدايا" }
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const pad = (value: number) => String(value).padStart(2, "0")
const stamp = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`

export async function printCustodyHandover(input: CustodyPrintInput): Promise<PrintResult> {
  const { session } = input
  const now = stamp(new Date())
  const expectedById = new Map<number, number>((session.currencies || []).map((row: any) => [Number(row.currency_id), Number(row.expected_amount || 0)]))
  const rateById = new Map<number, number>((session.currencies || []).map((row: any) => [Number(row.currency_id), Number(row.rate_to_point || 0)]))

  const currencyRows = input.currencies
    .map((currency) => {
      const expected = expectedById.get(currency.currency_id) ?? 0
      const counted = Number(input.amounts[currency.currency_id] ?? 0)
      const rate = rateById.get(currency.currency_id) || currency.rate_to_point || 1
      return { currency, expected, counted, rate }
    })
    .filter((row) => Math.abs(row.expected) > 0.0001 || Math.abs(row.counted) > 0.0001)
  const totalExpected = currencyRows.reduce((sum, row) => sum + row.expected * row.rate, 0)
  const totalCounted = currencyRows.reduce((sum, row) => sum + row.counted * row.rate, 0)
  const difference = totalCounted - totalExpected

  const payments = (session.payments || []).filter((row: any) => Math.abs(Number(row.amount || 0)) > 0.0001)
  const tobacco = (input.tobacco || []).filter((line) => line.opening_qty || line.sold_qty || line.counted_qty)
  const shift = String(session.shift_guid || session.id || "")

  const document: PrintDocument = {
    noAudit: true,
    voucherTypeId: 12,
    title: input.kind === "close" ? "إغلاق الوردية" : "تسليم العهدة",
    code: shift.slice(0, 8).toUpperCase(),
    date: now,
    fields: [
      { label: "نقطة البيع", value: input.pointName },
      { label: "الكاشير", value: input.userName },
      { label: "بداية الوردية", value: session.opened_at ? stamp(new Date(session.opened_at)) : "" },
      { label: "وقت التسليم", value: now },
      { label: "رصيد البداية", value: `${money(session.opening_cash)} ${input.currencyCode}` },
    ],
    columns: [
      { key: "currency", label: "العملة", weight: 1.1 },
      { key: "expected", label: "المطلوب", align: "end", weight: 1.2 },
      { key: "counted", label: "المسلَّم", align: "end", weight: 1.2 },
      { key: "diff", label: "الفرق", align: "end", weight: 1.1 },
    ],
    rows: currencyRows.map((row) => ({
      currency: row.currency.currency_code,
      expected: money(row.expected),
      counted: money(row.counted),
      diff: money(row.counted - row.expected),
    })),
    totals: [
      { label: `إجمالي المطلوب (${input.currencyCode})`, value: money(totalExpected) },
      { label: `إجمالي المسلَّم (${input.currencyCode})`, value: money(totalCounted), strong: true },
      { label: `الفرق (${input.currencyCode})`, value: `${difference > 0 ? "+" : ""}${money(difference)}`, strong: true },
    ],
    sections: [
      ...(payments.length ? [{
        title: "المبيعات حسب طريقة الدفع",
        columns: [{ key: "method", label: "الطريقة", weight: 1.5 }, { key: "amount", label: "المبلغ", align: "end" as const, weight: 1 }],
        rows: payments.map((row: any) => ({ method: PAYMENT_LABELS[row.payment_method] || row.payment_method, amount: money(row.amount) })),
      }] : []),
      ...(tobacco.length ? [{
        title: "عهدة الدخان (كميات)",
        columns: [
          { key: "name", label: "الصنف", weight: 2.2 },
          { key: "opening", label: "افتتاحي", align: "center" as const, weight: 0.9 },
          { key: "sold", label: "مباع", align: "center" as const, weight: 0.8 },
          { key: "counted", label: "مسلَّم", align: "center" as const, weight: 0.9 },
          { key: "diff", label: "فرق", align: "center" as const, weight: 0.8 },
        ],
        rows: tobacco.map((line) => ({
          name: line.product_name,
          opening: qty(line.opening_qty),
          sold: qty(line.sold_qty),
          counted: qty(line.counted_qty ?? 0),
          diff: qty(Number(line.counted_qty ?? 0) - Number(line.expected_qty || 0)),
        })),
      }] : []),
    ],
    notes: input.note?.trim() || "",
  }

  const { settings, company } = await loadVoucherPrintSettings(12)
  return printVoucherWithSettings(document, {
    ...settings,
    paper_size: "Receipt80" as const,
    orientation: "portrait" as const,
    print_method: settings.print_method === "browser" ? "browser" : "auto",
    copies: 1,
    copy_labels: "",
    header_text: "",
    show_fields: true,
    show_row_numbers: false,
    hidden_columns: [],
    show_totals: true,
    show_amount_in_words: false,
    show_notes: Boolean(input.note?.trim()),
    show_barcode: false,
    show_signatures: true,
    show_footer: false,
    show_page_numbers: false,
  }, company)
}
