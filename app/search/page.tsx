"use client"

import { useState } from "react"
import { Package, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ProductSearch from "@/components/search/product-search"
import CustomerSupplierSearch from "@/components/search/customer-supplier-search"

export default function SearchPage() {
  const [activeSearch, setActiveSearch] = useState<"products" | "customers" | null>(null)

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">البحث المتقدم</h1>
        <p className="text-muted-foreground">ابحث عن الأصناف والعملاء والموردين بسهولة وذكاء</p>
      </div>

      {!activeSearch && (
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
            onClick={() => setActiveSearch("products")}
          >
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>البحث عن الأصناف</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-4">
                ابحث عن الأصناف بالاسم، الرقم، الباركود، أو الملاحظة مع فلاتر متقدمة للمجموعات والمستودعات
              </p>
              <Button className="w-full">ابدأ البحث عن الأصناف</Button>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
            onClick={() => setActiveSearch("customers")}
          >
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-secondary" />
              </div>
              <CardTitle>البحث عن العملاء والموردين</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-4">
                ابحث عن العملاء والموردين بالاسم، الرقم، المدينة مع فلاتر للتصنيف والمندوب والحالة
              </p>
              <Button variant="secondary" className="w-full">
                ابدأ البحث عن العملاء والموردين
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSearch === "products" && (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => setActiveSearch(null)} className="mb-4">
            ← العودة للقائمة الرئيسية
          </Button>
          <ProductSearch />
        </div>
      )}

      {activeSearch === "customers" && (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => setActiveSearch(null)} className="mb-4">
            ← العودة للقائمة الرئيسية
          </Button>
          <CustomerSupplierSearch />
        </div>
      )}
    </div>
  )
}



