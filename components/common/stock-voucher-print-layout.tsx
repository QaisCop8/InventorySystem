"use client"

import type { CSSProperties } from "react"

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

// طباعة سندات المخزون (ادخال/اخراج/ارسالية/استعمال): نفس نمط voucher-print-layout.tsx
// (مخفية دائماً على الشاشة، تظهر فقط عبر @media print عند استدعاء window.print())، لكن بأعمدة
// الأصناف (صنف/مستودع/وحدة/كمية/سعر/مبلغ) بدل أعمدة القيد المحاسبي (حساب/مدين/دائن).
export default function StockVoucherPrintLayout({ data }: { data: StockVoucherPrintData | null }) {
  if (!data) return null

  const totalQuantity = data.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  const totalAmount = data.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0)

  return (
    <div className="voucher-print-area" dir="rtl">
      <h2 style={{ textAlign: "center", marginBottom: 4 }}>{data.title}</h2>
      {data.copyLabel && (
        <p style={{ textAlign: "center", marginBottom: 8, fontWeight: "bold" }}>{data.copyLabel}</p>
      )}
      <table style={{ width: "100%", marginBottom: 16, fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: 4 }}><strong>رقم السند:</strong> {data.vch_code}</td>
            <td style={{ padding: 4 }}><strong>التاريخ:</strong> {data.vch_date?.slice(0, 10)}</td>
          </tr>
          {data.manual_voucher && (
            <tr>
              <td style={{ padding: 4 }} colSpan={2}><strong>سند يدوي:</strong> {data.manual_voucher}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={printCellStyle}>رقم الصنف</th>
            <th style={printCellStyle}>اسم الصنف</th>
            <th style={printCellStyle}>المستودع</th>
            <th style={printCellStyle}>الوحدة</th>
            <th style={printCellStyle}>الكمية</th>
            <th style={printCellStyle}>السعر</th>
            <th style={printCellStyle}>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={index}>
              <td style={printCellStyle}>{row.product_code || ""}</td>
              <td style={printCellStyle}>{row.product_name || ""}</td>
              <td style={printCellStyle}>{row.warehouse_name || ""}</td>
              <td style={printCellStyle}>{row.unit || ""}</td>
              <td style={printCellStyle}>{row.quantity ? Number(row.quantity).toLocaleString() : ""}</td>
              <td style={printCellStyle}>{row.unit_price ? Number(row.unit_price).toLocaleString() : ""}</td>
              <td style={printCellStyle}>{row.total_price ? Number(row.total_price).toLocaleString() : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={printCellStyle} colSpan={4}><strong>الإجمالي</strong></td>
            <td style={printCellStyle}><strong>{totalQuantity.toLocaleString()}</strong></td>
            <td style={printCellStyle} />
            <td style={printCellStyle}><strong>{totalAmount.toLocaleString()}</strong></td>
          </tr>
        </tfoot>
      </table>

      {data.note && (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <strong>ملاحظة:</strong> {data.note}
        </p>
      )}
    </div>
  )
}

const printCellStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "6px 8px",
  textAlign: "center",
}
