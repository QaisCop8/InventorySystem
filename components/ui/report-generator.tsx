"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Download, Printer } from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"
import DataGridView from "@/components/common/DataGridView"

interface ReportGeneratorProps {
  title: string
  data: any[]
  columns: { key: string; label: string; width?: string }[]
  isOpen: boolean
  onClose: () => void
}

export function ReportGenerator({ title, data, columns, isOpen, onClose }: ReportGeneratorProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const gridScheme = {
    isReport: true,
    columns: columns.map((col) => ({
      header: col.label,
      name: col.key,
      width: col.width || "*",
      isReadOnly: true,
      filterable: true,
    })),
  }

  const exportToExcel = async () => {
    setIsExporting(true)
    try {
      const formatCellValue = (value: any) => {
        if (value === null || value === undefined) return ""
        if (value instanceof Date) return formatDateToBritish(value)
        if (typeof value === "object") return JSON.stringify(value)
        return value
      }

      const worksheetData = data.map((row) =>
        columns.reduce((acc, col) => {
          acc[col.label] = formatCellValue(row[col.key])
          return acc
        }, {} as Record<string, any>),
      )

      const worksheet = XLSX.utils.json_to_sheet(worksheetData)

      const columnWidths = columns.map((col) => {
        const values = data.map((row) => String(formatCellValue(row[col.key]) ?? ""))
        const longestValue = values.reduce((max, value) => Math.max(max, value.length), col.label.length)
        return { wch: Math.min(Math.max(longestValue + 2, 12), 40) }
      })

      worksheet["!cols"] = columnWidths
      if (worksheet["!ref"]) {
        worksheet["!autofilter"] = { ref: worksheet["!ref"] }
      }

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31) || "Report")

      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `${title}_${formatDateToBritish(new Date())}.xlsx`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting to Excel:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const printReport = () => {
    setIsPrinting(true)
    try {
      const printWindow = window.open("", "_blank")
      if (printWindow) {
        const htmlContent = `
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              h1 { text-align: center; color: #333; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f5f5f5; font-weight: bold; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .print-date { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            <table>
              <thead>
                <tr>
                  ${columns.map((col) => `<th>${col.label}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${data
                  .map(
                    (row) => `
                  <tr>
                    ${columns.map((col) => `<td>${row[col.key] || ""}</td>`).join("")}
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="print-date">
              تاريخ الطباعة: ${formatDateToBritish(new Date())}
            </div>
          </body>
          </html>
        `

        printWindow.document.write(htmlContent)
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
        printWindow.close()
      }
    } catch (error) {
      console.error("Error printing report:", error)
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportToExcel} disabled={isExporting}>
                <Download className="h-4 w-4 ml-2" />
                {isExporting ? "جاري التصدير..." : "تصدير إكسل"}
              </Button>
              <Button variant="outline" size="sm" onClick={printReport} disabled={isPrinting}>
                <Printer className="h-4 w-4 ml-2" />
                {isPrinting ? "جاري الطباعة..." : "طباعة"}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4">
          <div className="min-w-max">
            <DataGridView
              style={{ maxHeight: "100%", minHeight: "50vh" }}
              idProperty="ser"
              scheme={gridScheme}
              dataSource={data}
              showContextMenu={false}
              copyItemStoreDown={true}
              dontConvertToCards={true}
              isReport={true}
              hideSearch={true}
              allowSorting={true}
            />
          </div>

          {data.length === 0 && <div className="text-center py-8 text-muted-foreground">لا توجد بيانات للعرض</div>}
        </div>

        <div className="border-t pt-4 text-sm text-muted-foreground text-center">
          إجمالي السجلات: {data.length} | تاريخ التقرير: {formatDateToBritish(new Date())}
        </div>
      </DialogContent>
    </Dialog>
  )
}
