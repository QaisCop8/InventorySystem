"use client"

import { tr } from "@/lib/i18n"
import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"

interface Column {
  key: string
  label: string
  render?: (value: any, row: any) => React.ReactNode
}

interface ResponsiveTableProps {
  data: any[]
  columns: Column[]
  title?: string
  onRowClick?: (row: any) => void
}

export function ResponsiveTable({ data, columns, title, onRowClick }: ResponsiveTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  return (
    <div className="w-full">
      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card>
          {title && (
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    {columns.map((column) => (
                      <th key={column.key} className="text-start p-4 font-semibold">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => onRowClick?.(row)}
                    >
                      {columns.map((column) => (
                        <td key={column.key} className="p-4 text-start">
                          {column.render ? column.render(row[column.key], row) : row[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
        {data.map((row, index) => (
          <Card key={index} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="space-y-2">
                {/* Show first 2 columns by default */}
                {columns.slice(0, 2).map((column) => (
                  <div key={column.key} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{column.label}:</span>
                    <span className="font-medium">
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </span>
                  </div>
                ))}

                {/* Expandable section for remaining columns */}
                {columns.length > 2 && (
                  <>
                    {expandedRows.has(index) && (
                      <div className="space-y-2 pt-2 border-t">
                        {columns.slice(2).map((column) => (
                          <div key={column.key} className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{column.label}:</span>
                            <span className="font-medium">
                              {column.render ? column.render(row[column.key], row) : row[column.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => toggleRow(index)} className="w-full mt-2">
                      {expandedRows.has(index) ? (
                        <>
                          <ChevronUp className="h-4 w-4 me-2" />
                          {tr("إخفاء التفاصيل")}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 me-2" />
                          {tr("عرض التفاصيل")}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
