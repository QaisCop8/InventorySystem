"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "../common/DataGridView"

export interface CostCenterItem {
  id: number
  name: string
  cost_type_id: number
  cost_type_name: string
  parent_id?: number | null
  parent_name?: string | null
  level: number
  status: number
  state_status?: string
  created_at?: string
  updated_at?: string
}

interface SearchCostCenterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: {
    id: number
    name: string
  }
  costCenters: CostCenterItem[]
  onSelect?: (center: CostCenterItem) => void
}

export default function SearchCostCenterDialog({ 
  open, 
  onOpenChange, 
  type, 
  costCenters,
  onSelect 
}: SearchCostCenterDialogProps) {
  const [filter, setFilter] = useState("")
  const [selectedCenter, setSelectedCenter] = useState<CostCenterItem | null>(null)
  const gridRef = useRef<any>(null)

  useEffect(() => {
    if (!open) {
      setFilter("")
      setSelectedCenter(null)
    }
  }, [open])

  const filteredCenters = useMemo(() => {
    if (!type) return []
    const filtered = costCenters
      .filter((center) => center.cost_type_id === type.id)
      .filter((center) => center.name.toLowerCase().includes(filter.toLowerCase()))
    // Sort by ID in ascending order
    filtered.sort((a, b) => (a.id || 0) - (b.id || 0))
    return filtered
  }, [costCenters, filter, type])

 

  const costCenterScheme = useMemo(
    () => ({
      name: "SearchCostCenterScheme",
      columns: [
        { header: "الرقم", name: "id", width: 80, isReadOnly: true },
        { header: "اسم مركز الكلفة", name: "name", width: "*", minWidth: 200, isReadOnly: true },
        { header: "المستوى", name: "level", width: 120, isReadOnly: true },
        { header: "المركز الرئيسي", name: "parent_name", width: 200, isReadOnly: true },
      ],
    }),
    [],
  )

  // Handle row double-click
  const handleRowDoubleClick = (center: CostCenterItem) => {
    if (onSelect) {
      onSelect(center)
    }
    onOpenChange(false)
  }

  // Handle row click/selection change
  const handleRowClick = (center: CostCenterItem) => {
    setSelectedCenter(center)
  }

  // Handle موافق button click
  const handleSelect = () => {
    if (selectedCenter && onSelect) {
      onSelect(selectedCenter)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto overflow-x-hidden p-4 w-[90vw]" dir="rtl">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">بحث مراكز التكلفة</h2>
              <p className="text-sm text-slate-600">عرض مراكز التكلفة المرتبطة بنوع المركز المحدد.</p>
            </div>
            <div>
              <span className="text-sm font-medium">النوع:</span>
              <span className="mr-2 text-sm">{type?.name || "-"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">بحث باسم المركز</Label>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ابحث باسم مركز التكلفة"
              className="text-right"
            />
          </div>

          <div className="rounded-md border border-slate-300 overflow-hidden" dir="rtl">
            {filteredCenters.length > 0 ? (
              <div className="h-[400px] min-h-[320px] overflow-auto">
                <DataGridView 
                  scheme={costCenterScheme} 
                  dataSource={filteredCenters}
                  innerRef={gridRef}
                  onRowDoubleClick={handleRowDoubleClick}
                  onRowClick={handleRowClick}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-slate-50">
                <p className="text-slate-500 text-sm">لا توجد مراكز تكلفة لهذا النوع.</p>
              </div>
            )}
          </div>

          <div className="flex justify-center items-center gap-4 border-t pt-4">
            <Button 
              onClick={handleSelect}
              disabled={!selectedCenter}
              className="search-button"
            >
              موافق
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">
              الغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
