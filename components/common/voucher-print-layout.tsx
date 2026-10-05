"use client"

import { useVoucherPrinter } from "./use-voucher-printer"
import type { PrintDocument } from "@/lib/voucher-print/document"

export interface VoucherPrintRow {
  account_code?: string
  account_name?: string
  debit?: number | null
  credit?: number | null
  note?: string
}

export interface VoucherPrintData {
  title: string
  copyLabel?: string
  vch_code: string
  vch_date: string
  currency_name?: string
  amount?: number
  manual_voucher?: string
  note?: string
  rows: VoucherPrintRow[]
}

export function accountVoucherDocument(data: VoucherPrintData, voucherTypeId: number): PrintDocument {
  const totalDebit = data.rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)
  const totalCredit = data.rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)
  return {
    voucherTypeId,
    title: data.title,
    copyLabel: data.copyLabel,
    code: data.vch_code,
    date: data.vch_date,
    fields: [
      { label: "العملة", value: data.currency_name },
      { label: "المبلغ", value: data.amount === undefined ? "" : Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
      { label: "سند يدوي", value: data.manual_voucher },
    ],
    columns: [
      { key: "account_code", label: "رقم الحساب", weight: 0.9 },
      { key: "account_name", label: "اسم الحساب", weight: 2 },
      { key: "debit", label: "مدين", numeric: true },
      { key: "credit", label: "دائن", numeric: true },
      { key: "notes", label: "البيان", weight: 1.6 },
    ],
    rows: data.rows.map(row => ({
      account_code: row.account_code,
      account_name: row.account_name,
      debit: row.debit ? Number(row.debit) : "",
      credit: row.credit ? Number(row.credit) : "",
      notes: row.note,
    })),
    totals: [
      { label: "إجمالي المدين", value: totalDebit },
      { label: "إجمالي الدائن", value: totalCredit, strong: true },
    ],
    amount: data.amount ?? Math.max(totalDebit, totalCredit),
    currencyName: data.currency_name,
    notes: data.note,
  }
}

// Each new `data` object prints once through the shared engine (lib/voucher-print), using the
// print settings saved for `voucherTypeId`: direct to the default printer via CashierWinService on
// Windows, otherwise the browser print dialog.
const identity = (document: PrintDocument) => document

// Prints a ready-made document (built with a lib/voucher-print builder) once per new object.
export function VoucherDocumentPrinter({ document }: { document: PrintDocument | null }) {
  useVoucherPrinter(document, document?.voucherTypeId ?? 0, identity)
  return null
}

export default function VoucherPrintLayout({ data, voucherTypeId }: { data: VoucherPrintData | null; voucherTypeId: number }) {
  useVoucherPrinter(data, voucherTypeId, accountVoucherDocument)
  return null
}
