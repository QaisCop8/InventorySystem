"use client"

import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import { SearchModal } from "./search-modal"

interface SearchButtonProps {
  type: "products" | "customers" | "transactions" | "sales" | "purchases" | "movements"
  onSelect?: (item: any) => void
  onSelectProduct?: (product: any) => void
  onSelectCustomer?: (customer: any) => void
  onSelectSalesOrder?: (order: any) => void
  onSelectPurchaseOrder?: (order: any) => void
  onSelectMovement?: (movement: any) => void
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg"
  className?: string
}

export function SearchButton({
  type,
  onSelect,
  onSelectProduct,
  onSelectCustomer,
  onSelectSalesOrder,
  onSelectPurchaseOrder,
  onSelectMovement,
  variant = "outline",
  size = "default",
  className,
}: SearchButtonProps) {
  const getButtonText = () => {
    switch (type) {
      case "products":
        return tr("بحث عن صنف")
      case "customers":
        return tr("بحث عن عميل/مورد")
      case "transactions":
        return tr("بحث عن حركة")
      case "sales":
        return tr("بحث عن طلب بيع")
      case "purchases":
        return tr("بحث عن طلب شراء")
      case "movements":
        return tr("بحث عن حركة مخزون")
      default:
        return tr("بحث")
    }
  }

  return (
    <SearchModal
      type={type}
      onSelectProduct={onSelectProduct || onSelect}
      onSelectCustomer={onSelectCustomer || onSelect}
      onSelectSalesOrder={onSelectSalesOrder || onSelect}
      onSelectPurchaseOrder={onSelectPurchaseOrder || onSelect}
      onSelectMovement={onSelectMovement || onSelect}
      trigger={
        <Button variant={variant} size={size} className={`gap-2 search-button ${className}`}>
          <Search className="h-4 w-4" />
          {getButtonText()}
        </Button>
      }
    />
  )
}
