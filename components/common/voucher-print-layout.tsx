"use client"

import type { CSSProperties } from "react"

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

// طباعة مبسّطة (قابلة للتطوير لاحقاً): مخفية دائماً على الشاشة، وتظهر فقط عبر CSS الخاص بـ
// @media print (انظر app/globals.css: .voucher-print-area) عند استدعاء window.print().
export default function VoucherPrintLayout({ data }: { data: VoucherPrintData | null }) {
  if (!data) return null

  const totalDebit = data.rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)
  const totalCredit = data.rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)

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
          <tr>
            <td style={{ padding: 4 }}><strong>العملة:</strong> {data.currency_name || ""}</td>
            <td style={{ padding: 4 }}><strong>المبلغ:</strong> {data.amount?.toLocaleString() ?? ""}</td>
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
            <th style={printCellStyle}>رقم الحساب</th>
            <th style={printCellStyle}>اسم الحساب</th>
            <th style={printCellStyle}>مدين</th>
            <th style={printCellStyle}>دائن</th>
            <th style={printCellStyle}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={index}>
              <td style={printCellStyle}>{row.account_code || ""}</td>
              <td style={printCellStyle}>{row.account_name || ""}</td>
              <td style={printCellStyle}>{row.debit ? Number(row.debit).toLocaleString() : ""}</td>
              <td style={printCellStyle}>{row.credit ? Number(row.credit).toLocaleString() : ""}</td>
              <td style={printCellStyle}>{row.note || ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={printCellStyle} colSpan={2}><strong>الإجمالي</strong></td>
            <td style={printCellStyle}><strong>{totalDebit.toLocaleString()}</strong></td>
            <td style={printCellStyle}><strong>{totalCredit.toLocaleString()}</strong></td>
            <td style={printCellStyle} />
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
