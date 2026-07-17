"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Filter, X, Users, MapPin, Phone, Mail, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Customer {
  id: number
  customer_code: string
  customer_name: string
  mobile1?: string
  mobile2?: string
  city?: string
  address?: string
  email?: string
  status: string
  business_nature?: string
  salesman?: string
  classifications?: string
}

interface Supplier {
  id: number
  supplier_code: string
  supplier_name: string
  mobile1?: string
  mobile2?: string
  city?: string
  address?: string
  email?: string
  status: string
  business_nature?: string
  salesman?: string
  classifications?: string
}

interface CustomerSupplierSearchProps {
  onSelectCustomer?: (customer: Customer) => void
  onSelectSupplier?: (supplier: Supplier) => void
  onClose?: () => void
  isModal?: boolean
  defaultTab?: "customers" | "suppliers"
}

function CustomerSupplierSearch({
  onSelectCustomer,
  onSelectSupplier,
  onClose,
  isModal = false,
  defaultTab = "customers",
}: CustomerSupplierSearchProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [searchTerm, setSearchTerm] = useState("")
  const [filters, setFilters] = useState({
    classification: "",
    representative: "",
    city: "",
    status: "",
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
      const [customersResponse, suppliersResponse] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/suppliers"),
      ])

      if (customersResponse.ok) {
        const customersData = await customersResponse.json()
        setCustomers(customersData.customers || customersData)
      }

      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        setSuppliers(suppliersData)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Smart search for customers
  const filteredCustomers = useMemo(() => {
    let filtered = customers

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((customer) => {
        const searchableFields = [
          customer.customer_name,
          customer.customer_code,
          customer.city,
          customer.address,
          customer.business_nature,
          customer.mobile1,
          customer.email,
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
    if (filters.classification) {
      filtered = filtered.filter((customer) => customer.classifications?.includes(filters.classification))
    }
    if (filters.representative) {
      filtered = filtered.filter((customer) => customer.salesman === filters.representative)
    }
    if (filters.city) {
      filtered = filtered.filter((customer) => customer.city === filters.city)
    }
    if (filters.status) {
      filtered = filtered.filter((customer) => customer.status === filters.status)
    }

    return filtered.slice(0, 50)
  }, [customers, debouncedSearchTerm, filters])

  // Smart search for suppliers
  const filteredSuppliers = useMemo(() => {
    let filtered = suppliers

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((supplier) => {
        const searchableFields = [
          supplier.supplier_name,
          supplier.supplier_code,
          supplier.city,
          supplier.address,
          supplier.business_nature,
          supplier.mobile1,
          supplier.email,
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
    if (filters.classification) {
      filtered = filtered.filter((supplier) => supplier.classifications?.includes(filters.classification))
    }
    if (filters.representative) {
      filtered = filtered.filter((supplier) => supplier.salesman === filters.representative)
    }
    if (filters.city) {
      filtered = filtered.filter((supplier) => supplier.city === filters.city)
    }
    if (filters.status) {
      filtered = filtered.filter((supplier) => supplier.status === filters.status)
    }

    return filtered.slice(0, 50)
  }, [suppliers, debouncedSearchTerm, filters])

  // Get unique values for filters
  const getUniqueValues = (data: any[], field: string) => {
    return [...new Set(data.map((item) => item[field]).filter(Boolean))].sort()
  }

  const cities = useMemo(() => {
    const allData = [...customers, ...suppliers]
    return getUniqueValues(allData, "city")
  }, [customers, suppliers])

  const representatives = useMemo(() => {
    const allData = [...customers, ...suppliers]
    return getUniqueValues(allData, "salesman")
  }, [customers, suppliers])

  const statuses = useMemo(() => {
    const allData = [...customers, ...suppliers]
    return getUniqueValues(allData, "status")
  }, [customers, suppliers])

  const handleCustomerSelect = (customer: Customer) => {
    if (onSelectCustomer) {
      onSelectCustomer(customer)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleSupplierSelect = (supplier: Supplier) => {
    if (onSelectSupplier) {
      onSelectSupplier(supplier)
    }
    if (onClose) {
      onClose()
    }
  }

  const clearFilters = () => {
    setFilters({ classification: "", representative: "", city: "", status: "" })
    setSearchTerm("")
  }

  const renderCustomerCard = (customer: Customer) => (
    <div key={customer.id} className="search-result-item" onClick={() => handleCustomerSelect(customer)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="search-result-title">{customer.customer_name}</h3>
            <Badge className={`search-badge ${customer.status === "نشط" ? "active" : "inactive"}`}>
              {customer.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">رقم العميل: {customer.customer_code}</span>
            </div>

            {customer.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">المدينة: {customer.city}</span>
              </div>
            )}

            {customer.mobile1 && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">الجوال: {customer.mobile1}</span>
              </div>
            )}

            {customer.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">البريد: {customer.email}</span>
              </div>
            )}
          </div>

          {customer.address && (
            <div className="flex items-start gap-2 mt-2">
              <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">{customer.address}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderSupplierCard = (supplier: Supplier) => (
    <div key={supplier.id} className="search-result-item" onClick={() => handleSupplierSelect(supplier)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="search-result-title">{supplier.supplier_name}</h3>
            <Badge className={`search-badge ${supplier.status === "نشط" ? "active" : "inactive"}`}>
              {supplier.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="search-result-subtitle">رقم المورد: {supplier.supplier_code}</span>
            </div>

            {supplier.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">المدينة: {supplier.city}</span>
              </div>
            )}

            {supplier.mobile1 && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">الجوال: {supplier.mobile1}</span>
              </div>
            )}

            {supplier.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="search-result-subtitle">البريد: {supplier.email}</span>
              </div>
            )}
          </div>

          {supplier.address && (
            <div className="flex items-start gap-2 mt-2">
              <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">{supplier.address}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const SearchContent = () => (
    <div className="search-container">
      <div className="search-header">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="search-title">البحث عن العملاء والموردين</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            فلاتر
          </Button>
          {isModal && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
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
          placeholder="ابحث بالاسم، الرقم، المدينة، أو العنوان..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input pr-10"
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
                <Label>التصنيف</Label>
                <Select
                  value={filters.classification}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, classification: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع التصنيفات</SelectItem>
                    <SelectItem value="vip">عميل مميز</SelectItem>
                    <SelectItem value="regular">عميل عادي</SelectItem>
                    <SelectItem value="wholesale">جملة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المندوب</Label>
                <Select
                  value={filters.representative}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, representative: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المندوب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المندوبين</SelectItem>
                    {representatives.map((rep) => (
                      <SelectItem key={rep} value={rep}>
                        {rep}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المدينة</Label>
                <Select
                  value={filters.city}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, city: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المدينة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المدن</SelectItem>
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
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
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={clearFilters} className="w-full bg-transparent">
                مسح الفلاتر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Customers and Suppliers */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="customers">العملاء</TabsTrigger>
          <TabsTrigger value="suppliers">الموردين</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? "جاري البحث..." : `تم العثور على ${filteredCustomers.length} عميل`}
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
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم يتم العثور على العملاء مطابقين</p>
              </div>
            ) : (
              filteredCustomers.map(renderCustomerCard)
            )}
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? "جاري البحث..." : `تم العثور على ${filteredSuppliers.length} مورد`}
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
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم يتم العثور على موردين مطابقين</p>
              </div>
            ) : (
              filteredSuppliers.map(renderSupplierCard)
            )}
          </div>
        </TabsContent>
      </Tabs>
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

export { CustomerSupplierSearch }
export default CustomerSupplierSearch



