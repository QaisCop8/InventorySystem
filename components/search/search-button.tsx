"use client"

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
        return "بحث عن صنف"
      case "customers":
        return "بحث عن زبون/مورد"
      case "transactions":
        return "بحث عن حركة"
      case "sales":
        return "بحث عن طلب بيع"
      case "purchases":
        return "بحث عن طلب شراء"
      case "movements":
        return "بحث عن حركة مخزون"
      default:
        return "بحث"
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
