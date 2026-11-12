"use client"

import { normalizeArabicSearch } from "@/lib/arabic-search"
import { tr } from "@/lib/i18n"
import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Package, Barcode, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface Product {
  id: number
  product_code: string
  product_name: string
  barcode: string
  unit: string
  last_purchase_price: number
  selling_price: number
  available_quantity: number
  category: string
}

interface InlineProductSearchProps {
  value: string
  onSelect: (product: Product) => void
  placeholder?: string
  className?: string
}

export function InlineProductSearch({
  value,
  onSelect,
  placeholder = "ابحث عن الصنف...",
  className,
}: InlineProductSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value)
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Mock data - replace with actual API call
  const mockProducts: Product[] = [
    {
      id: 1,
      product_code: "P0000001",
      product_name: "لابتوب ديل انسبايرون 15",
      barcode: "1234567890123",
      unit: "قطعة",
      last_purchase_price: 2500.0,
      selling_price: 3000.0,
      available_quantity: 15,
      category: "أجهزة كمبيوتر",
    },
    {
      id: 2,
      product_code: "P0000002",
      product_name: "ماوس لاسلكي لوجيتك",
      barcode: "2345678901234",
      unit: "قطعة",
      last_purchase_price: 85.0,
      selling_price: 120.0,
      available_quantity: 50,
      category: "ملحقات كمبيوتر",
    },
    {
      id: 3,
      product_code: "P0000003",
      product_name: "كيبورد ميكانيكي",
      barcode: "3456789012345",
      unit: "قطعة",
      last_purchase_price: 150.0,
      selling_price: 200.0,
      available_quantity: 25,
      category: "ملحقات كمبيوتر",
    },
  ]

  useEffect(() => {
    setProducts(mockProducts)
  }, [])

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const filtered = products.filter(
        (product) =>
          normalizeArabicSearch(product.product_name).includes(normalizeArabicSearch(searchTerm)) ||
          product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.barcode.includes(searchTerm),
      )
      setFilteredProducts(filtered)
      setIsOpen(true)
    } else {
      setFilteredProducts([])
      setIsOpen(false)
    }
  }, [searchTerm, products])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleProductSelect = (product: Product) => {
    setSearchTerm(product.product_code)
    setIsOpen(false)
    onSelect(product)
  }

  return (
    <div ref={searchRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={placeholder}
          className="ps-10"
          onFocus={() => {
            if (searchTerm.length >= 2) setIsOpen(true)
          }}
        />
        <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {isOpen && filteredProducts.length > 0 && (
        <Card className="absolute top-full end-0 start-0 z-50 mt-1 max-h-80 overflow-auto shadow-lg">
          <CardContent className="p-0">
            {filteredProducts.map((product) => (
              <Button
                key={product.id}
                variant="ghost"
                className="w-full justify-start p-4 h-auto text-start hover:bg-muted"
                onClick={() => handleProductSelect(product)}
              >
                <div className="flex items-start gap-3 w-full">
                  <Package className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <div className="flex-1 text-start space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-foreground">{product.product_name}</span>
                      <span className="text-sm text-primary font-mono">{product.product_code}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Barcode className="h-3 w-3" />
                          {product.barcode}
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {product.selling_price.toFixed(2)}{tr(" ريال")}
                        </div>
                      </div>
                      <div className="text-xs">
                        {tr("متوفر: ")}{product.available_quantity} {product.unit}
                      </div>
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
