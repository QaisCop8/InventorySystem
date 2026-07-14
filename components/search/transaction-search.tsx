"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Search,
  Filter,
  X,
  FileText,
  Calendar,
  DollarSign,
  User,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface SalesOrder {
  id: number
  order_number: string
  order_date: string
  customer_name: string
  customer_id: number
  total_amount: number
  order_status: string
  financial_status: string
  currency_code?: string
  salesman?: string
  notes?: string
}

interface PurchaseOrder {
  id: number
  order_number: string
  order_date: string
  supplier_name: string
  supplier_id: number
  total_amount: number
  status: string
  currency_code?: string
  salesman?: string
  notes?: string
  expected_delivery_date?: string
}

interface StockMovement {
  id: number
  created_at: string
  product_name: string
  product_code: string
  transaction_type: string
  quantity: number
  unit_cost?: number
  reference_type?: string
  reference_id?: number
  created_by: string
  notes?: string
}

interface TransactionSearchProps {
  onSelectSalesOrder?: (order: SalesOrder) => void
  onSelectPurchaseOrder?: (order: PurchaseOrder) => void
  onSelectMovement?: (movement: StockMovement) => void
  onClose?: () => void
  isModal?: boolean
  defaultTab?: "sales" | "purchases" | "movements"
  searchType?: "sales" | "purchases" | "movements" | "all"
}

const TransactionSearch = ({
  onSelectSalesOrder,
  onSelectPurchaseOrder,
  onSelectMovement,
  onClose,
  isModal = false,
  defaultTab = "sales",
  searchType = "all",
}: TransactionSearchProps) => {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [searchTerm, setSearchTerm] = useState("")
  const [filters, setFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
    salesman: "",
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
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const promises = []

      if (searchType === "sales" || searchType === "all") {
        promises.push(fetch("/api/sales-orders"))
      }

      if (searchType === "purchases" || searchType === "all") {
        promises.push(fetch("/api/purchase-orders"))
      }

      if (searchType === "movements" || searchType === "all") {
        promises.push(fetch("/api/inventory/stock-movements"))
      }

      const responses = await Promise.all(promises)

      let index = 0
      if (searchType === "sales" || searchType === "all") {
        if (responses[index]?.ok) {
          const data = await responses[index].json()
          setSalesOrders(Array.isArray(data) ? data : data.orders || [])
        }
        index++
      }

      if (searchType === "purchases" || searchType === "all") {
        if (responses[index]?.ok) {
          const data = await responses[index].json()
          setPurchaseOrders(Array.isArray(data) ? data : data.orders || [])
        }
        index++
      }

      if (searchType === "movements" || searchType === "all") {
        if (responses[index]?.ok) {
          const data = await responses[index].json()
          setMovements(Array.isArray(data) ? data : [])
        }
      }
    } catch (error) {
      console.error("Error fetching transactions:", error)
    } finally {
      setLoading(false)
    }
  }

  // Smart search for sales orders
  const filteredSalesOrders = useMemo(() => {
    let filtered = salesOrders

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((order) => {
        const searchableFields = [
          order.order_number,
          order.customer_name,
          order.salesman,
          order.notes,
          order.total_amount?.toString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return (
          searchableFields.includes(searchLower) ||
          searchLower.split(" ").some((word) => word.length > 1 && searchableFields.includes(word))
        )
      })
    }

    // Apply filters
    if (filters.status !== "all") {
      filtered = filtered.filter((order) => order.order_status === filters.status)
    }
    if (filters.salesman) {
      filtered = filtered.filter((order) => order.salesman === filters.salesman)
    }
    if (filters.dateFrom) {
      filtered = filtered.filter((order) => new Date(order.order_date) >= new Date(filters.dateFrom))
    }
    if (filters.dateTo) {
      filtered = filtered.filter((order) => new Date(order.order_date) <= new Date(filters.dateTo))
    }

    return filtered.slice(0, 50)
  }, [salesOrders, debouncedSearchTerm, filters])

  // Smart search for purchase orders
  const filteredPurchaseOrders = useMemo(() => {
    let filtered = purchaseOrders

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((order) => {
        const searchableFields = [
          order.order_number,
          order.supplier_name,
          order.salesman,
          order.notes,
          order.total_amount?.toString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return (
          searchableFields.includes(searchLower) ||
          searchLower.split(" ").some((word) => word.length > 1 && searchableFields.includes(word))
        )
      })
    }

    // Apply filters
    if (filters.status !== "all") {
      filtered = filtered.filter((order) => order.status === filters.status)
    }
    if (filters.salesman) {
      filtered = filtered.filter((order) => order.salesman === filters.salesman)
    }
    if (filters.dateFrom) {
      filtered = filtered.filter((order) => new Date(order.order_date) >= new Date(filters.dateFrom))
    }
    if (filters.dateTo) {
      filtered = filtered.filter((order) => new Date(order.order_date) <= new Date(filters.dateTo))
    }

    return filtered.slice(0, 50)
  }, [purchaseOrders, debouncedSearchTerm, filters])

  // Smart search for movements
  const filteredMovements = useMemo(() => {
    let filtered = movements

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((movement) => {
        const searchableFields = [
          movement.product_name,
          movement.product_code,
          movement.transaction_type,
          movement.created_by,
          movement.notes,
          movement.reference_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return (
          searchableFields.includes(searchLower) ||
          searchLower.split(" ").some((word) => word.length > 1 && searchableFields.includes(word))
        )
      })
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter((movement) => new Date(movement.created_at) >= new Date(filters.dateFrom))
    }
    if (filters.dateTo) {
      filtered = filtered.filter((movement) => new Date(movement.created_at) <= new Date(filters.dateTo))
    }

    return filtered.slice(0, 50)
  }, [movements, debouncedSearchTerm, filters])

  const handleSalesOrderSelect = (order: SalesOrder) => {
    if (onSelectSalesOrder) {
      onSelectSalesOrder(order)
    }
    if (onClose) {
      onClose()
    }
  }

  const handlePurchaseOrderSelect = (order: PurchaseOrder) => {
    if (onSelectPurchaseOrder) {
      onSelectPurchaseOrder(order)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleMovementSelect = (movement: StockMovement) => {
    if (onSelectMovement) {
      onSelectMovement(movement)
    }
    if (onClose) {
      onClose()
    }
  }

  const clearFilters = () => {
    setFilters({ status: "all", dateFrom: "", dateTo: "", salesman: "" })
    setSearchTerm("")
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" })
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "in":
      case "purchase":
        return <TrendingUp className="h-4 w-4 text-green-600" />
      case "out":
      case "sale":
        return <TrendingDown className="h-4 w-4 text-red-600" />
      case "adjustment":
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />
      case "transfer":
        return <ArrowRightLeft className="h-4 w-4 text-purple-600" />
      default:
        return <FileText className="h-4 w-4 text-gray-600" />
    }
  }

  const getMovementTypeDisplay = (type: string) => {
    const types: Record<string, string> = {
      in: "إدخال",
      out: "إخراج",
      purchase: "شراء",
      sale: "بيع",
      adjustment: "تسوية",
      transfer: "نقل",
      return: "مرتجع",
    }
    return types[type] || type
  }

  const renderSalesOrderCard = (order: SalesOrder) => (
    <div
      key={order.id}
      className="search-result-item hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => handleSalesOrderSelect(order)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <h3 className="search-result-title">{order.order_number}</h3>
            <Badge className="search-badge active">{order.order_status}</Badge>
            {order.financial_status && (
              <Badge variant="outline" className="text-xs">
                {order.financial_status}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">العميل: {order.customer_name}</span>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">التاريخ: {formatDate(order.order_date)}</span>
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle font-semibold text-green-600">
                {order.total_amount?.toLocaleString()} {order.currency_code || "ريال"}
              </span>
            </div>

            {order.salesman && (
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">المندوب: {order.salesman}</span>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="flex items-start gap-2 mt-2">
              <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">{order.notes}</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-primary">
          اختيار
        </Button>
      </div>
    </div>
  )

  const renderPurchaseOrderCard = (order: PurchaseOrder) => (
    <div
      key={order.id}
      className="search-result-item hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => handlePurchaseOrderSelect(order)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-green-600" />
            <h3 className="search-result-title">{order.order_number}</h3>
            <Badge className="search-badge active">{order.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">المورد: {order.supplier_name}</span>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">التاريخ: {formatDate(order.order_date)}</span>
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle font-semibold text-green-600">
                {order.total_amount?.toLocaleString()} {order.currency_code || "ريال"}
              </span>
            </div>

            {order.expected_delivery_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">التسليم: {formatDate(order.expected_delivery_date)}</span>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="flex items-start gap-2 mt-2">
              <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">{order.notes}</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-primary">
          اختيار
        </Button>
      </div>
    </div>
  )

  const renderMovementCard = (movement: StockMovement) => (
    <div
      key={movement.id}
      className="search-result-item hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => handleMovementSelect(movement)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {getMovementIcon(movement.transaction_type)}
            <h3 className="search-result-title">{movement.product_name}</h3>
            <Badge className="search-badge active">{getMovementTypeDisplay(movement.transaction_type)}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Package className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">الرقم: {movement.product_code}</span>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">التاريخ: {formatDate(movement.created_at)}</span>
            </div>

            <div className="flex items-center gap-2">
              <Package className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle font-semibold">
                الكمية: {movement.quantity?.toLocaleString()}
              </span>
            </div>

            {movement.unit_cost && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">السعر: {movement.unit_cost?.toLocaleString()}</span>
              </div>
            )}

            {movement.reference_type && movement.reference_id && (
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">
                  المرجع: {movement.reference_type} #{movement.reference_id}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">المستخدم: {movement.created_by}</span>
            </div>
          </div>

          {movement.notes && (
            <div className="flex items-start gap-2 mt-2">
              <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">{movement.notes}</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-primary">
          اختيار
        </Button>
      </div>
    </div>
  )

  const SearchContent = () => (
    <div className="search-container">
      <div className="search-header">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="search-title">البحث عن الحركات والمعاملات</h2>
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
          placeholder="ابحث برقم الطلب، اسم العميل/المورد، أو الصنف..."
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
                    <SelectItem value="قيد التنفيذ">قيد التنفيذ</SelectItem>
                    <SelectItem value="مكتمل">مكتمل</SelectItem>
                    <SelectItem value="ملغي">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>المندوب</Label>
                <Input
                  type="text"
                  placeholder="اسم المندوب"
                  value={filters.salesman}
                  onChange={(e) => setFilters((prev) => ({ ...prev, salesman: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={clearFilters} className="w-full bg-transparent search-button">
                مسح الفلاتر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different transaction types */}
      {searchType === "all" ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sales">طلبات البيع</TabsTrigger>
            <TabsTrigger value="purchases">طلبات الشراء</TabsTrigger>
            <TabsTrigger value="movements">حركات المخزون</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {loading ? "جاري البحث..." : `تم العثور على ${filteredSalesOrders.length} طلب بيع`}
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
              ) : filteredSalesOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على طلبات بيع مطابقة</p>
                </div>
              ) : (
                filteredSalesOrders.map(renderSalesOrderCard)
              )}
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {loading ? "جاري البحث..." : `تم العثور على ${filteredPurchaseOrders.length} طلب شراء`}
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
              ) : filteredPurchaseOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على طلبات شراء مطابقة</p>
                </div>
              ) : (
                filteredPurchaseOrders.map(renderPurchaseOrderCard)
              )}
            </div>
          </TabsContent>

          <TabsContent value="movements" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {loading ? "جاري البحث..." : `تم العثور على ${filteredMovements.length} حركة مخزون`}
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
              ) : filteredMovements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على حركات مخزون مطابقة</p>
                </div>
              ) : (
                filteredMovements.map(renderMovementCard)
              )}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        // Single type search
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading
                ? "جاري البحث..."
                : searchType === "sales"
                  ? `تم العثور على ${filteredSalesOrders.length} طلب بيع`
                  : searchType === "purchases"
                    ? `تم العثور على ${filteredPurchaseOrders.length} طلب شراء`
                    : `تم العثور على ${filteredMovements.length} حركة مخزون`}
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
            ) : searchType === "sales" ? (
              filteredSalesOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على نتائج مطابقة</p>
                </div>
              ) : (
                filteredSalesOrders.map(renderSalesOrderCard)
              )
            ) : searchType === "purchases" ? (
              filteredPurchaseOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على نتائج مطابقة</p>
                </div>
              ) : (
                filteredPurchaseOrders.map(renderPurchaseOrderCard)
              )
            ) : filteredMovements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم يتم العثور على نتائج مطابقة</p>
              </div>
            ) : (
              filteredMovements.map(renderMovementCard)
            )}
          </div>
        </div>
      )}
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

export { TransactionSearch }
export default TransactionSearch
