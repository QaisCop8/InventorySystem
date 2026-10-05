"use client"

import { useVoucherPrinter } from "./use-voucher-printer"
import type { PrintDocument } from "@/lib/voucher-print/document"

export interface StockVoucherPrintRow {
  product_code?: string
  product_name?: string
  warehouse_name?: string
  unit?: string
  quantity?: number | null
  unit_price?: number | null
  total_price?: number | null
}

export interface StockVoucherPrintData {
  title: string
  copyLabel?: string
  vch_code: string
  vch_date: string
  manual_voucher?: string
  note?: string
  rows: StockVoucherPrintRow[]
}

export function stockVoucherDocument(data: StockVoucherPrintData, voucherTypeId: number): PrintDocument {
  const totalQuantity = data.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  const totalAmount = data.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0)
  return {
    voucherTypeId,
    title: data.title,
    copyLabel: data.copyLabel,
    code: data.vch_code,
    date: data.vch_date,
    fields: [{ label: "سند يدوي", value: data.manual_voucher }],
    columns: [
      { key: "item_code", label: "رقم الصنف", weight: 0.9 },
      { key: "item_name", label: "اسم الصنف", weight: 2.2 },
      { key: "warehouse", label: "المستودع", weight: 1 },
      { key: "unit", label: "الوحدة", weight: 0.7, align: "center" },
      { key: "quantity", label: "الكمية", numeric: true, weight: 0.8 },
      { key: "price", label: "السعر", numeric: true, weight: 0.8 },
      { key: "total", label: "المبلغ", numeric: true },
    ],
    rows: data.rows.map(row => ({
      item_code: row.product_code,
      item_name: row.product_name,
      warehouse: row.warehouse_name,
      unit: row.unit,
      quantity: row.quantity ?? "",
      price: row.unit_price ?? "",
      total: row.total_price ?? "",
    })),
    totals: [
      { label: "إجمالي الكمية", value: totalQuantity },
      { label: "إجمالي المبلغ", value: totalAmount, strong: true },
    ],
    amount: totalAmount,
    notes: data.note,
  }
}

export default function StockVoucherPrintLayout({ data, voucherTypeId }: { data: StockVoucherPrintData | null; voucherTypeId: number }) {
  useVoucherPrinter(data, voucherTypeId, stockVoucherDocument)
  return null
}
