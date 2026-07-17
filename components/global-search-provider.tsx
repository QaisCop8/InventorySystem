"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProductSearch } from "@/components/search/product-search"
import { CustomerSupplierSearch } from "@/components/search/customer-supplier-search"

interface GlobalSearchContextType {
  openProductSearch: () => void
  openCustomerSupplierSearch: () => void
  closeSearch: () => void
}

const GlobalSearchContext = createContext<GlobalSearchContextType | undefined>(undefined)

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext)
  if (!context) {
    throw new Error("useGlobalSearch must be used within a GlobalSearchProvider")
  }
  return context
}

interface GlobalSearchProviderProps {
  children: ReactNode
}

export function GlobalSearchProvider({ children }: GlobalSearchProviderProps) {
  const [searchType, setSearchType] = useState<"products" | "customers-suppliers" | null>(null)

  const openProductSearch = () => setSearchType("products")
  const openCustomerSupplierSearch = () => setSearchType("customers-suppliers")
  const closeSearch = () => setSearchType(null)

  useEffect(() => {
    const handleOpenProductSearch = () => openProductSearch()
    const handleOpenCustomerSupplierSearch = () => openCustomerSupplierSearch()

    window.addEventListener("openProductSearch", handleOpenProductSearch)
    window.addEventListener("openCustomerSupplierSearch", handleOpenCustomerSupplierSearch)

    return () => {
      window.removeEventListener("openProductSearch", handleOpenProductSearch)
      window.removeEventListener("openCustomerSupplierSearch", handleOpenCustomerSupplierSearch)
    }
  }, [])

  const handleProductSelect = (product: any) => {
    // في البحث العام، نفتح صفحة تفاصيل الصنف
    window.open(`/products/${product.id}`, "_blank")
    closeSearch()
  }

  const handleCustomerSelect = (customer: any) => {
    // في البحث العام، نفتح صفحة تفاصيل العميل
    window.open(`/customers/${customer.id}`, "_blank")
    closeSearch()
  }

  const handleSupplierSelect = (supplier: any) => {
    // في البحث العام، نفتح صفحة تفاصيل المورد
    window.open(`/suppliers/${supplier.id}`, "_blank")
    closeSearch()
  }

  return (
    <GlobalSearchContext.Provider value={{ openProductSearch, openCustomerSupplierSearch, closeSearch }}>
      {children}

      {/* نافذة البحث عن الأصناف */}
      <Dialog open={searchType === "products"} onOpenChange={(open) => !open && closeSearch()}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-right">البحث عن الأصناف</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[75vh]">
            <ProductSearch onSelect={handleProductSelect} onClose={closeSearch} isModal={false} />
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة البحث عن العملاء والموردين */}
      <Dialog open={searchType === "customers-suppliers"} onOpenChange={(open) => !open && closeSearch()}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-right">البحث عن العملاء والموردين</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[75vh]">
            <CustomerSupplierSearch
              onSelectCustomer={handleCustomerSelect}
              onSelectSupplier={handleSupplierSelect}
              onClose={closeSearch}
              isModal={false}
              defaultTab="customers"
            />
          </div>
        </DialogContent>
      </Dialog>
    </GlobalSearchContext.Provider>
  )
}



