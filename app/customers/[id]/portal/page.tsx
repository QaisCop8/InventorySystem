"use client"

import { useEffect, useState } from "react"
import { CustomerLayout } from "@/components/customer/customer-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Search, Package, DollarSign, Layers } from "lucide-react"

interface Product {
  id: number
  name: string
  description: string | null
  category: string | null
  price: number
  stock_quantity: number
}

export default function CustomerProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [canViewPrices, setCanViewPrices] = useState(false)
  const [canViewStock, setCanViewStock] = useState(false)

  useEffect(() => {
    checkPermissions()
    loadProducts()
  }, [])

  useEffect(() => {
    filterProducts()
  }, [searchTerm, products])

  const checkPermissions = async () => {
    try {
      const response = await fetch("/api/customer-auth/session")
      if (response.ok) {
        const data = await response.json()
        setCanViewPrices(data.session.permissions.can_view_prices)
        setCanViewStock(data.session.permissions.can_view_stock)
      }
    } catch (error) {
      console.error("Permission check error:", error)
    }
  }

  const loadProducts = async () => {
    try {
      const response = await fetch("/api/customer/products")

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || "حدث خطأ أثناء تحميل الأصناف")
        return
      }

      const data = await response.json()
      setProducts(data.products)
      setFilteredProducts(data.products)
    } catch (error) {
      console.error("Load products error:", error)
      setError("حدث خطأ أثناء تحميل الأصناف")
    } finally {
      setLoading(false)
    }
  }

  const filterProducts = () => {
    if (!searchTerm) {
      setFilteredProducts(products)
      return
    }

    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    setFilteredProducts(filtered)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) {
      return { label: "غير متوفر", color: "bg-red-100 text-red-800 border-red-300" }
    } else if (quantity < 10) {
      return { label: "كمية محدودة", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    } else {
      return { label: "متوفر", color: "bg-green-100 text-green-800 border-green-300" }
    }
  }

  const groupByCategory = () => {
    const grouped: Record<string, Product[]> = {}

    filteredProducts.forEach((product) => {
      const category = product.category || "غير مصنف"
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(product)
    })

    return grouped
  }

  const groupedProducts = groupByCategory()

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">الأصناف والمخزون</h1>
          <p className="text-muted-foreground mt-1">تصفح الأصناف المتوفرة والكميات</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث عن صنف أو فئة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Products */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لا توجد أصناف متاحة</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
              <div key={category}>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Layers className="h-6 w-6" />
                  {category}
                  <Badge variant="secondary" className="mr-2">
                    {categoryProducts.length}
                  </Badge>
                </h2>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock_quantity)

                    return (
                      <Card key={product.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{product.name}</CardTitle>
                              {product.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {canViewPrices && (
                            <div className="flex items-center gap-2 text-lg font-bold text-primary">
                              <DollarSign className="h-5 w-5" />
                              {formatCurrency(product.price)} ريال
                            </div>
                          )}

                          {canViewStock && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">الكمية المتوفرة</span>
                                <Badge variant="outline" className={stockStatus.color}>
                                  {stockStatus.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{product.stock_quantity} وحدة</span>
                              </div>
                            </div>
                          )}

                          {!canViewPrices && !canViewStock && (
                            <div className="text-sm text-muted-foreground text-center py-2">
                              اتصل بنا للاستفسار عن السعر والتوفر
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  )
}

