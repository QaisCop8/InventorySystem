"use client"

import { appDir } from "@/lib/i18n"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import { SearchModal } from "./search-modal"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (item: any) => void
  searchType: "products" | "customers" | "transactions" | "sales" | "purchases" | "movements"
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
}

export function SearchInput({
  value,
  onChange,
  onSelect,
  searchType,
  placeholder,
  disabled,
  className,
  label,
}: SearchInputProps) {
  const [showSearch, setShowSearch] = useState(false)

  const handleSelect = (item: any) => {
    let selectedValue = ""

    switch (searchType) {
      case "products":
        selectedValue = item.product_code || item.barcode || ""
        break
      case "customers":
        selectedValue = item.customer_code || item.customer_name || ""
        break
      case "sales":
        selectedValue = item.order_number || ""
        break
      case "purchases":
        selectedValue = item.order_number || ""
        break
      case "movements":
        selectedValue = item.id?.toString() || ""
        break
      case "transactions":
        selectedValue = item.order_number || item.id?.toString() || ""
        break
    }

    onChange(selectedValue)
    if (onSelect) {
      onSelect(item)
    }
    setShowSearch(false)
  }

  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          dir={appDir()}
        />
        <SearchModal
          type={searchType}
          onSelectProduct={searchType === "products" ? handleSelect : undefined}
          onSelectCustomer={searchType === "customers" ? handleSelect : undefined}
          onSelectSalesOrder={searchType === "sales" ? handleSelect : undefined}
          onSelectPurchaseOrder={searchType === "purchases" ? handleSelect : undefined}
          onSelectMovement={searchType === "movements" ? handleSelect : undefined}
          trigger={
            <Button type="button" variant="outline" size="icon" disabled={disabled}>
              <Search className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    </div>
  )
}
