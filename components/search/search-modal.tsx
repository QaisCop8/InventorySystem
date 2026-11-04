"use client"

import { tr } from "@/lib/i18n"
import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import { EnhancedProductSearch } from "./enhanced-product-search"
import { UnifiedCustomerSupplierSearch } from "./unified-customer-supplier-search"
import { TransactionSearch } from "./transaction-search"

interface SearchModalProps {
  type: "products" | "customers" | "suppliers" | "both" | "transactions" | "sales" | "purchases" | "movements"
  onSelectProduct?: (product: any) => void
  onSelectCustomer?: (customer: any) => void
  onSelectSupplier?: (supplier: any) => void
  onSelectSalesOrder?: (order: any) => void
  onSelectPurchaseOrder?: (order: any) => void
  onSelectMovement?: (movement: any) => void
  trigger?: React.ReactNode
  showPrices?: boolean
}

export function SearchModal({
  type,
  onSelectProduct,
  onSelectCustomer,
  onSelectSupplier,
  onSelectSalesOrder,
  onSelectPurchaseOrder,
  onSelectMovement,
  trigger,
  showPrices = true,
}: SearchModalProps) {
  const [open, setOpen] = useState(false)

  const handleProductSelect = (product: any) => {
    onSelectProduct?.(product)
    setOpen(false)
  }

  const handleCustomerSelect = (customer: any) => {
    onSelectCustomer?.(customer)
    setOpen(false)
  }

  const handleSupplierSelect = (supplier: any) => {
    onSelectSupplier?.(supplier)
    setOpen(false)
  }

  const handleSalesOrderSelect = (order: any) => {
    onSelectSalesOrder?.(order)
    setOpen(false)
  }

  const handlePurchaseOrderSelect = (order: any) => {
    onSelectPurchaseOrder?.(order)
    setOpen(false)
  }

  const handleMovementSelect = (movement: any) => {
    onSelectMovement?.(movement)
    setOpen(false)
  }

  const getTitle = () => {
    switch (type) {
      case "products":
        return tr("البحث عن الأصناف")
      case "customers":
        return tr("البحث عن العملاء")
      case "suppliers":
        return tr("البحث عن الموردين")
      case "both":
        return tr("البحث عن العملاء والموردين")
      case "transactions":
        return tr("البحث عن الحركات والمعاملات")
      case "sales":
        return tr("البحث عن طلبات البيع")
      case "purchases":
        return tr("البحث عن طلبات الشراء")
      case "movements":
        return tr("البحث عن حركات المخزون")
      default:
        return tr("البحث")
    }
  }

  const getTriggerText = () => {
    switch (type) {
      case "products":
        return tr("البحث عن صنف")
      case "customers":
        return tr("البحث عن عميل")
      case "suppliers":
        return tr("البحث عن مورد")
      case "both":
        return tr("البحث عن عميل/مورد")
      case "transactions":
        return tr("البحث عن حركة")
      case "sales":
        return tr("البحث عن طلب بيع")
      case "purchases":
        return tr("البحث عن طلب شراء")
      case "movements":
        return tr("البحث عن حركة مخزون")
      default:
        return tr("بحث")
    }
  }

  const renderSearchComponent = () => {
    if (type === "products") {
      return <EnhancedProductSearch onSelect={handleProductSelect} showPrices={showPrices} />
    } else if (["transactions", "sales", "purchases", "movements"].includes(type)) {
      return (
        <TransactionSearch
          onSelectSalesOrder={handleSalesOrderSelect}
          onSelectPurchaseOrder={handlePurchaseOrderSelect}
          onSelectMovement={handleMovementSelect}
          searchType={type === "transactions" ? "all" : (type as "sales" | "purchases" | "movements")}
          defaultTab={type === "transactions" ? "sales" : (type as "sales" | "purchases" | "movements")}
        />
      )
    } else {
      return (
        <UnifiedCustomerSupplierSearch
          onSelectCustomer={handleCustomerSelect}
          onSelectSupplier={handleSupplierSelect}
          searchType={type === "both" ? "both" : type}
          defaultTab={type === "suppliers" ? "suppliers" : "customers"}
        />
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 bg-transparent search-button">
            <Search className="h-4 w-4" />
            {getTriggerText()}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto">{renderSearchComponent()}</div>
      </DialogContent>
    </Dialog>
  )
}



