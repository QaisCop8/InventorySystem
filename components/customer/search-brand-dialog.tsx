"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "../common/DataGridView"

export interface BrandItem {
  id: number
  name: string
  brand_type_id: number
  brand_type_name: string
  status: number
  created_at?: string
  updated_at?: string
}

interface SearchBrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: {
    id: number
    name: string
  }
  brands: BrandItem[]
  onSelect?: (brand: BrandItem) => void
}

export default function SearchBrandDialog({ open, onOpenChange, type, brands, onSelect }: SearchBrandDialogProps) {
  const [filter, setFilter] = useState("")
  const [selectedBrand, setSelectedBrand] = useState<BrandItem | null>(null)
  const gridRef = useRef<any>(null)

  useEffect(() => {
    if (!open) {
      setFilter("")
      setSelectedBrand(null)
    }
  }, [open])

  const filteredBrands = useMemo(() => {
    if (!type) return []
    const filtered = brands
      .filter((brand) => brand.brand_type_id === type.id)
      .filter((brand) => brand.name.toLowerCase().includes(filter.toLowerCase()))
    filtered.sort((a, b) => (a.id || 0) - (b.id || 0))
    return filtered
  }, [brands, filter, type])

  const brandScheme = useMemo(
    () => ({
      name: "SearchBrandScheme",
      columns: [
        { header: "الرقم", name: "id", width: 80, isReadOnly: true },
        { header: "اسم العلامة التجارية", name: "name", width: "*", minWidth: 200, isReadOnly: true },
      ],
    }),
    [],
  )

  const handleRowDoubleClick = (brand: BrandItem) => {
    if (onSelect) onSelect(brand)
    onOpenChange(false)
  }

  const handleRowClick = (brand: BrandItem) => {
    setSelectedBrand(brand)
  }

  const handleSelect = () => {
    if (selectedBrand && onSelect) {
      onSelect(selectedBrand)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto overflow-x-hidden p-4 w-[90vw]" dir="rtl">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">بحث العلامات التجارية</h2>
              <p className="text-sm text-slate-600">عرض العلامات التجارية المرتبطة بالنوع المحدد.</p>
            </div>
            <div>
              <span className="text-sm font-medium">النوع:</span>
              <span className="mr-2 text-sm">{type?.name || "-"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">بحث باسم العلامة التجارية</Label>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ابحث باسم العلامة التجارية"
              className="text-right"
            />
          </div>

          <div className="rounded-md border border-slate-300 overflow-hidden" dir="rtl">
            {filteredBrands.length > 0 ? (
              <div className="h-[400px] min-h-[320px] overflow-auto">
                <DataGridView
                  scheme={brandScheme}
                  dataSource={filteredBrands}
                  innerRef={gridRef}
                  onRowDoubleClick={handleRowDoubleClick}
                  onRowClick={handleRowClick}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-slate-50">
                <p className="text-slate-500 text-sm">لا توجد علامات تجارية لهذا النوع.</p>
              </div>
            )}
          </div>

          <div className="flex justify-center items-center gap-4 border-t pt-4">
            <Button onClick={handleSelect} disabled={!selectedBrand} className="search-button">
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
