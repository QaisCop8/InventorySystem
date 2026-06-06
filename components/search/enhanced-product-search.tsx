"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Filter, X, Package, Barcode, Hash, FileText, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Product {
  id: number
  product_code: string
  product_name: string
  description?: string
  barcode?: string
  category?: string
  status: string
  last_purchase_price?: number
  currency?: string
  general_notes?: string
  main_unit?: string
}

interface EnhancedProductSearchProps {
  onSelect?: (product: Product) => void
  onClose?: () => void
  isModal?: boolean
  showPrices?: boolean
}

const EnhancedProductSearch = ({
  onSelect,
  onClose,
  isModal = false,
  showPrices = true,
}: EnhancedProductSearchProps) => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filters, setFilters] = useState({
    category: "all",
    status: "all",
    warehouse: "all",
  })
  const [showFilters, setShowFilters] = useState(false)

  // Debounced search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setLoading(false)
    }
  }

  // Smart search with fuzzy matching
  const filteredProducts = useMemo(() => {
    let filtered = products

    // Apply text search with fuzzy matching
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((product) => {
        const searchableFields = [
          product.product_name,
          product.product_code,
          product.barcode,
          product.description,
          product.general_notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        // Exact match gets highest priority
        if (searchableFields.includes(searchLower)) return true

        // Partial match
        const searchWords = searchLower.split(" ")
        return searchWords.some((word) => word.length > 1 && searchableFields.includes(word))
      })
    }

    // Apply filters
    if (filters.category !== "all") {
      filtered = filtered.filter((product) => product.category === filters.category)
    }
    if (filters.status !== "all") {
      filtered = filtered.filter((product) => product.status === filters.status)
    }
    if (filters.warehouse !== "all") {
      filtered = filtered.filter((product) => product.warehouse === filters.warehouse)
    }

    return filtered.slice(0, 50) // Limit results for performance
  }, [products, debouncedSearchTerm, filters])

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map((p) => p.category).filter(Boolean))]
    return uniqueCategories.sort()
  }, [products])

  const statuses = useMemo(() => {
    const uniqueStatuses = [...new Set(products.map((p) => p.status).filter(Boolean))]
    return uniqueStatuses.sort()
  }, [products])

  const handleProductSelect = (product: Product) => {
    if (onSelect) {
      onSelect(product)
    }
    if (onClose) {
      onClose()
    }
  }

  const clearFilters = () => {
    setFilters({ category: "all", status: "all", warehouse: "all" })
    setSearchTerm("")
  }

  const SearchContent = () => (
    <div className="search-container">
      <div className="search-header">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="search-title">البحث عن الأصناف</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 search-button"
          >
            <Filter className="h-4 w-4" />
            فلاتر
          </Button>
          {isModal && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="search-button">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="ابحث بالاسم، الرقم، الباركود، أو الملاحظة..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input pr-10"
          autoFocus={isModal}
        />
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">فلاتر البحث المتقدم</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="search-filters">
              <div className="space-y-2">
                <Label>مجموعة الأصناف</Label>
                <Select
                  value={filters.category}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المجموعات</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المستودع</Label>
                <Select
                  value={filters.warehouse}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, warehouse: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المستودع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المستودعات</SelectItem>
                    <SelectItem value="main">المستودع الرئيسي</SelectItem>
                    <SelectItem value="secondary">المستودع الفرعي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters} className="w-full bg-transparent search-button">
                  مسح الفلاتر
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {loading ? "جاري البحث..." : `تم العثور على ${filteredProducts.length} صنف`}
          </p>
          {debouncedSearchTerm && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Search className="h-3 w-3" />
              {debouncedSearchTerm}
            </Badge>
          )}
        </div>

        <div className="search-results">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لم يتم العثور على أصناف مطابقة</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className="search-result-item hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => handleProductSelect(product)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-orange-600" />
                      <h3 className="search-result-title">{product.product_name}</h3>
                      <Badge className={`search-badge ${product.status === "نشط" ? "active" : "inactive"}`}>
                        {product.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        <span className="search-result-subtitle">الرقم: {product.product_code}</span>
                      </div>

                      {product.barcode && (
                        <div className="flex items-center gap-2">
                          <Barcode className="h-3 w-3 text-muted-foreground" />
                          <span className="search-result-subtitle">الباركود: {product.barcode}</span>
                        </div>
                      )}

                      {product.category && (
                        <div className="flex items-center gap-2">
                          <Package className="h-3 w-3 text-muted-foreground" />
                          <span className="search-result-subtitle">المجموعة: {product.category}</span>
                        </div>
                      )}

                      {showPrices && product.last_purchase_price && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span className="search-result-subtitle">
                            السعر: {product.last_purchase_price} {product.currency || "ريال"}
                          </span>
                        </div>
                      )}
                    </div>

                    {product.description && (
                      <div className="flex items-start gap-2 mt-2">
                        <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
                        <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-primary">
                    اختيار
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <SearchContent />
        </div>
      </div>
    )
  }

  return <SearchContent />
}

export { EnhancedProductSearch }
export default EnhancedProductSearch
