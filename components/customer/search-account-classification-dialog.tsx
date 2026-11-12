"use client"

import { normalizeArabicSearch } from "@/lib/arabic-search"
import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "../common/DataGridView"

export interface AccountClassificationItem {
  id: number
  name: string
  classification_type_id: number
  classification_type_name: string
  created_at?: string
  updated_at?: string
}

interface SearchAccountClassificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: {
    id: number
    name: string
  }
  classifications: AccountClassificationItem[]
  onSelect?: (classification: AccountClassificationItem) => void
}

export default function SearchAccountClassificationDialog({ 
  open, 
  onOpenChange, 
  type, 
  classifications,
  onSelect 
}: SearchAccountClassificationDialogProps) {
  const [filter, setFilter] = useState("")
  const [selectedClassification, setSelectedClassification] = useState<AccountClassificationItem | null>(null)
  const gridRef = useRef<any>(null)

  useEffect(() => {
    if (!open) {
      setFilter("")
      setSelectedClassification(null)
    }
  }, [open])

  const filteredClassifications = useMemo(() => {
    if (!type) return []
    const filtered = classifications
      .filter((item) => item.classification_type_id === type.id)
      .filter((item) => normalizeArabicSearch(item.name).includes(normalizeArabicSearch(filter)))
    filtered.sort((a, b) => (a.id || 0) - (b.id || 0))
    return filtered
  }, [classifications, filter, type])

  const classificationScheme = useMemo(
    () => ({
      name: "SearchAccountClassificationScheme",
      columns: [
        { header: tr("الرقم"), name: "id", width: 80, isReadOnly: true },
        { header: tr("اسم التصنيف"), name: "name", width: "*", minWidth: 200, isReadOnly: true },
      ],
    }),
    [],
  )

  // Handle row double-click
  const handleRowDoubleClick = (classification: AccountClassificationItem) => {
    if (onSelect) {
      onSelect(classification)
    }
    onOpenChange(false)
  }

  // Handle row click/selection change
  const handleRowClick = (classification: AccountClassificationItem) => {
    setSelectedClassification(classification)
  }

  // Handle موافق button click
  const handleSelect = () => {
    if (selectedClassification && onSelect) {
      onSelect(selectedClassification)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto overflow-x-hidden p-4 w-[90vw]" dir={appDir()}>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">{tr("بحث التصنيفات")}</h2>
              <p className="text-sm text-slate-600">{tr("عرض التصنيفات المرتبطة بنوع التصنيف المحدد.")}</p>
            </div>
            <div>
              <span className="text-sm font-medium">{tr("النوع:")}</span>
              <span className="ms-2 text-sm">{type?.name || "-"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{tr("بحث باسم التصنيف")}</Label>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={tr("ابحث باسم التصنيف")}
              className="text-start"
            />
          </div>

          <div className="rounded-md border border-slate-300 overflow-hidden" dir={appDir()}>
            {filteredClassifications.length > 0 ? (
              <div className="h-[400px] min-h-[320px] overflow-auto">
                <DataGridView 
                  scheme={classificationScheme} 
                  dataSource={filteredClassifications}
                  innerRef={gridRef}
                  onRowDoubleClick={handleRowDoubleClick}
                  onRowClick={handleRowClick}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-slate-50">
                <p className="text-slate-500 text-sm">{tr("لا توجد تصنيفات لهذا النوع.")}</p>
              </div>
            )}
          </div>

          <div className="flex justify-center items-center gap-4 border-t pt-4">
            <Button 
              onClick={handleSelect}
              disabled={!selectedClassification}
              className="search-button"
            >
              {tr("موافق")}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">
              {tr("الغاء")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
