"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { ReportGenerator } from "@/components/ui/report-generator"
import { useRecordNavigation } from "@/hooks/use-record-navigation"
import TransactionBranchField from "@/components/common/transaction-branch-field"
import {
  Plus,
  Trash2,
  Search,
  Calculator,
  Package,
  FileText,
  Percent,
  MessageSquare,
  Truck,
  TrendingUp,
} from "lucide-react"
import { useDocumentSettings } from "@/hooks/use-document-settings"
import { OrderSearchDialog } from "@/components/search/order-search-dialog"
import { requestProductVariant } from "@/components/products/product-variant-service"

const InlineSupplierSearch = ({ onSelect, onClose, suppliers }: any) => {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredSuppliers = suppliers.filter(
    (supplier: any) =>
      supplier.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-4 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">بحث الموردين</h3>
        <input
          type="text"
          placeholder="ابحث عن مورد..."
          className="mb-4 p-2 border rounded w-full text-right"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          dir="rtl"
        />
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {filteredSuppliers.map((supplier: any) => (
            <button
              key={supplier.id}
              onClick={() => onSelect(supplier)}
              className="block w-full text-right p-2 hover:bg-gray-100 rounded"
            >
              {supplier.supplier_name} ({supplier.supplier_code})
            </button>
          ))}
          {filteredSuppliers.length === 0 && <div className="text-center text-gray-500 py-4">لا توجد نتائج</div>}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  )
}

const InlineProductSearch = ({ onSelect, onClose, products }: any) => {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredProducts = products.filter(
    (product: any) =>
      product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-4 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">بحث المنتجات</h3>
        <input
          type="text"
          placeholder="ابحث عن منتج..."
          className="mb-4 p-2 border rounded w-full text-right"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          dir="rtl"
        />
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {filteredProducts.map((product: any) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="block w-full text-right p-2 hover:bg-gray-100 rounded"
            >
              <div className="font-medium">{product.product_name}</div>
              <div className="text-sm text-gray-500">
                {product.product_code} - {product.main_unit} - {product.last_purchase_price} ر.س
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && <div className="text-center text-gray-500 py-4">لا توجد نتائج</div>}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  )
}

interface PurchaseOrder {
  id: number
  order_number: string
  order_date: string
  supplier_name: string
  supplier_id: number
  workflow_status: string
  total_amount: number
  salesman: string
  expected_delivery_date: string
  currency_code: string
  exchange_rate: number
  notes: string
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

interface UnifiedPurchaseOrderProps {
  order?: any
  allOrders?: PurchaseOrder[] // Added allOrders prop for navigation
  onOrderSaved?: (data: any) => void
  onCancel: () => void
  setEditingOrder?: (order: any | null) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface Supplier {
  id: number
  supplier_code: string
  supplier_name: string
  email?: string
  mobile1?: string
  address?: string
  tax_number?: string
  credit_limit?: number
  payment_terms?: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
  main_unit: string
  last_purchase_price: number
  current_stock: number
  barcode?: string
}

interface OrderItem {
  id: string
  product_id: number | null
  product_code: string
  product_name: string
  barcode: string
  warehouse: string
  quantity: number
  bonus_quantity: number
  unit: string
  unit_price: number
  discount_percentage: number
  discount_amount: number
  tax_percentage: number
  tax_amount: number
  total_price: number
  expiry_date: string
  batch_number: string
  notes: string
}

interface OrderFormData {
  id?: number
  branch_id?: number | null
  order_number: string
  order_date: string
  supplier_id: number | null
  supplier_name: string
  supplier_code: string
  supplier_address: string
  supplier_tax_number: string
  salesman: string
  currency_code: string
  currency_name: string
  exchange_rate: number
  payment_terms: string
  expected_delivery_date: string
  delivery_address: string
  delivery_notes: string
  workflow_status: string
  priority: string
  source: string
  notes: string
  internal_notes: string
  discount_type: string
  discount_value: number
  discount_amount: number
  tax_percentage: number
  tax_amount: number
  shipping_cost: number
  other_charges: number
  total_before_discount: number
  total_after_discount: number
  total_tax: number
  grand_total: number
  manual_document: string
  supplier_number?: string
  supplier_phone?: string
}

const initialFormData: OrderFormData = {
  branch_id: null,
  order_number: "",
  order_date: new Date().toISOString().split("T")[0],
  supplier_id: null,
  supplier_name: "",
  supplier_code: "",
  supplier_address: "",
  supplier_tax_number: "",
  salesman: "",
  currency_code: "SAR",
  currency_name: "ريال سعودي",
  exchange_rate: 1.0,
  payment_terms: "نقدي",
  expected_delivery_date: "",
  delivery_address: "",
  delivery_notes: "",
  workflow_status: "pending",
  priority: "عادي",
  source: "مباشر",
  notes: "",
  internal_notes: "",
  discount_type: "percentage",
  discount_value: 0,
  discount_amount: 0,
  tax_percentage: 15,
  tax_amount: 0,
  shipping_cost: 0,
  other_charges: 0,
  total_before_discount: 0,
  total_after_discount: 0,
  total_tax: 0,
  grand_total: 0,
  manual_document: "",
  supplier_number: "",
  supplier_phone: "",
}

const initialOrderItem: OrderItem = {
  id: "",
  product_id: null,
  product_code: "",
  product_name: "",
  barcode: "",
  warehouse: "المستودع الرئيسي",
  quantity: 1,
  bonus_quantity: 0,
  unit: "قطعة",
  unit_price: 0,
  discount_percentage: 0,
  discount_amount: 0,
  tax_percentage: 15,
  tax_amount: 0,
  total_price: 0,
  expiry_date: "",
  batch_number: "",
  notes: "",
}

function UnifiedPurchaseOrder({
  order,
  allOrders = [], // Added allOrders parameter
  onOrderSaved,
  onCancel,
  setEditingOrder,
  open = true,
  onOpenChange,
}: UnifiedPurchaseOrderProps) {
  const {
    settings,
    loading: settingsLoading,
    isFieldVisible,
    getFieldDisplayName,
    getVisibleFields,
  } = useDocumentSettings("purchase-order")

  const [state, setState] = useState({
    isSubmitting: false,
    suppliers: [] as Supplier[],
    products: [] as Product[],
    formData: order ? { ...initialFormData, ...order } : initialFormData,
    orderItems:
      order && order.items
        ? order.items.map((item: any) => ({ ...initialOrderItem, ...item, id: item.id || Date.now().toString() }))
        : [{ ...initialOrderItem, id: "1" }],
    supplierSearch: "",
    productSearch: "",
    showSupplierDropdown: false,
    showProductDropdown: false,
    activeItemId: null as string | null,
    showSupplierSearch: false,
    showProductSearch: false,
    showOrderSearch: false,
    currentRecordId: order?.id || null,
    totalRecords: allOrders?.length || 0,
    isSaving: false,
    isDeleting: false,
  })

  const [showReport, setShowReport] = useState(false)

  const createNewOrder = (): PurchaseOrder => ({
    id: 0,
    order_number: "",
    order_date: new Date().toISOString().split("T")[0],
    supplier_name: "",
    supplier_id: 0,
    workflow_status: "pending",
    total_amount: 0,
    salesman: "",
    expected_delivery_date: "",
    currency_code: "SAR",
    exchange_rate: 1,
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const {
    currentRecord,
    currentIndex,
    isNew,
    isLoading: navLoading,
    totalRecords: navTotalRecords,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    createNew,
    saveRecord,
    deleteRecord,
    updateRecord,
    canSave,
    canDelete,
    isFirstRecord,
    isLastRecord,
  } = useRecordNavigation({
    data: allOrders,
    onSave: handleSaveOrder,
    onDelete: handleDeleteOrder,
    createNewRecord: createNewOrder,
  })

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      totalRecords: allOrders?.length || 0,
      currentRecordId: currentRecord?.id || null,
    }))
  }, [currentRecord, allOrders])

  useEffect(() => {
    if (currentRecord && currentRecord.id !== state.formData.id) {
      setState((prev) => ({
        ...prev,
        formData: { ...initialFormData, ...currentRecord },
        orderItems: currentRecord.items
          ? currentRecord.items.map((item: any) => ({
              ...initialOrderItem,
              ...item,
              id: item.id || Date.now().toString(),
            }))
          : [{ ...initialOrderItem, id: "1" }],
      }))
    }
  }, [currentRecord])

  useEffect(() => {
    fetchSuppliers()
    fetchProducts()
    generateOrderNumber()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 for supplier search
      if (e.key === "F2" && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setState((prev) => ({ ...prev, showSupplierSearch: true }))
      }
      // F3 for product search in focused row
      if (e.key === "F3" && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const activeElement = document.activeElement as HTMLElement
        if (activeElement?.closest("[data-product-row]")) {
          const rowId = activeElement.closest("[data-product-row]")?.getAttribute("data-product-row")
          if (rowId) {
            setState((prev) => ({ ...prev, showProductSearch: true, activeItemId: rowId }))
          }
        }
      }
      // Escape to close search
      if (e.key === "Escape") {
        setState((prev) => ({
          ...prev,
          showSupplierSearch: false,
          showProductSearch: false,
          activeItemId: null,
          showOrderSearch: false,
        }))
      }
      // Ctrl+S for save
      if (e.key === "s" && e.ctrlKey) {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [state.showSupplierSearch, state.showProductSearch, state.activeItemId, state.showOrderSearch])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch("/api/suppliers")
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, suppliers: Array.isArray(data) ? data : [] }))
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, products: Array.isArray(data) ? data : [] }))
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const generateOrderNumber = async () => {
    try {
      const response = await fetch("/api/purchase-orders/generate-number")
      if (!response.ok) {
        throw new Error("Failed to generate order number")
      }
      const data = await response.json()

      console.log("[v0] Purchase order number generation response:", data)

      // If auto numbering is disabled, leave field empty for manual entry
      if (data.autoNumbering === false) {
        setState((prev) => ({
          ...prev,
          formData: { ...prev.formData, order_number: "" },
        }))
        return
      }

      setState((prev) => ({
        ...prev,
        formData: { ...prev.formData, order_number: data.orderNumber },
      }))
    } catch (error) {
      console.error("Error generating order number:", error)
      // Fallback to timestamp-based number
      const now = new Date()
      const timestamp = now.getTime().toString()
      const lastSeven = timestamp.slice(-7).padStart(7, "0")
      const orderNumber = `P${lastSeven}`
      setState((prev) => ({
        ...prev,
        formData: { ...prev.formData, order_number: orderNumber },
      }))
    }
  }

  const addOrderItem = () => {
    const newItem: OrderItem = {
      ...initialOrderItem,
      id: Date.now().toString(),
    }
    setState((prev) => ({
      ...prev,
      orderItems: [...prev.orderItems, newItem],
    }))
  }

  const removeOrderItem = (id: string) => {
    if (state.orderItems.length > 1) {
      setState((prev) => ({
        ...prev,
        orderItems: prev.orderItems.filter((item) => item.id !== id),
      }))
    }
  }

  const updateOrderItem = (id: string, field: keyof OrderItem, value: any) => {
    setState((prev) => ({
      ...prev,
      orderItems: prev.orderItems.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-calculate amounts when quantity or price changes
          if (
            field === "quantity" ||
            field === "unit_price" ||
            field === "discount_percentage" ||
            field === "tax_percentage"
          ) {
            const subtotal = updatedItem.quantity * updatedItem.unit_price
            updatedItem.discount_amount = (subtotal * updatedItem.discount_percentage) / 100
            const afterDiscount = subtotal - updatedItem.discount_amount
            updatedItem.tax_amount = (afterDiscount * updatedItem.tax_percentage) / 100
            updatedItem.total_price = afterDiscount + updatedItem.tax_amount
          }

          return updatedItem
        }
        return item
      }),
    }))
  }

  const handleSupplierSelect = (supplier: any) => {
    setState((prev) => ({
      ...prev,
      formData: {
        ...prev.formData,
        supplier_id: supplier.id,
        supplier_code: supplier.supplier_code,
        supplier_name: supplier.supplier_name,
        supplier_address: supplier.address || "",
        supplier_tax_number: supplier.tax_number || "",
        payment_terms: supplier.payment_terms || "نقدي",
        supplier_phone: supplier.mobile1 || "",
      },
      supplierSearch: supplier.supplier_name,
      showSupplierSearch: false,
    }))
  }

  const handleProductSelect = async (product: any, itemId: string) => {
    product = await requestProductVariant(product)
    if (!product) return
    updateOrderItem(itemId, "product_id", product.id)
    updateOrderItem(itemId, "product_code", product.product_code)
    updateOrderItem(itemId, "product_name", product.product_name)
    updateOrderItem(itemId, "barcode", product.barcode || "")
    updateOrderItem(itemId, "unit", product.main_unit)
    updateOrderItem(itemId, "unit_price", product.last_purchase_price)
    setState((prev) => ({ ...prev, showProductSearch: false, activeItemId: null }))
  }

  const calculateItemTotal = (item: OrderItem) => {
    const subtotal = item.quantity * item.unit_price
    const discountAmount = (subtotal * item.discount_percentage) / 100
    const afterDiscount = subtotal - discountAmount
    const taxAmount = (afterDiscount * item.tax_percentage) / 100
    return afterDiscount + taxAmount
  }

  const totals = useMemo(() => {
    const subtotal = state.orderItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
    let discount = 0
    if (state.formData.discount_type === "percentage") {
      discount = (subtotal * state.formData.discount_value) / 100
    } else {
      discount = state.formData.discount_value
    }
    const tax = (subtotal - discount) * (state.formData.tax_percentage / 100)
    const total = subtotal - discount + tax + state.formData.shipping_cost + state.formData.other_charges

    return {
      subtotal,
      discount,
      tax,
      total,
    }
  }, [
    state.orderItems,
    state.formData.discount_type,
    state.formData.discount_value,
    state.formData.tax_percentage,
    state.formData.shipping_cost,
    state.formData.other_charges,
  ])

  const createLotForPurchaseItem = async (item: OrderItem, orderId: number) => {
    if (!item.expiry_date || !item.batch_number) return null

    try {
      const response = await fetch("/api/inventory/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: item.product_id,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          initial_quantity: item.quantity,
          current_quantity: item.quantity,
          supplier_id: state.formData.supplier_id,
          purchase_order_id: orderId,
          warehouse: item.warehouse || "المستودع الرئيسي",
          unit_cost: item.unit_price,
          notes: item.notes,
        }),
      })

      if (response.ok) {
        const lot = await response.json()
        return lot.id
      }
    } catch (error) {
      console.error("[v0] Error creating lot:", error)
    }
    return null
  }

  async function handleSaveOrder(orderToSave: PurchaseOrder, isNewRecord: boolean): Promise<void> {
    console.log("[v0] Starting save process...")

    // Validation
    if (!state.formData.supplier_name.trim()) {
      throw new Error("اسم المورد مطلوب")
    }

    if (state.orderItems.length === 0 || state.orderItems.every((item) => !item.product_name)) {
      throw new Error("يجب إضافة صنف واحد على الأقل")
    }

    // Validate required fields based on settings
    const requiredFields = settings.filter((s) => s.is_required)
    for (const fieldSetting of requiredFields) {
      const fieldName = fieldSetting.field_name
      if (fieldName === "order_number" && state.formData.order_number.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "order_date" && state.formData.order_date === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "expected_delivery_date" && state.formData.expected_delivery_date === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "priority" && state.formData.priority === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "manual_document" && state.formData.manual_document.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "salesman" && state.formData.salesman.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "workflow_status" && state.formData.workflow_status === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "supplier_number" && state.formData.supplier_number.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "supplier_name" && state.formData.supplier_name.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "supplier_phone" && state.formData.supplier_phone.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
      if (fieldName === "delivery_address" && state.formData.delivery_address.trim() === "") {
        throw new Error(`${getFieldDisplayName(fieldName) || fieldName} مطلوب`)
      }
    }

    const orderData = {
      id: state.formData.id,
      branch_id: state.formData.branch_id,
      order_number: state.formData.order_number,
      order_date: state.formData.order_date,
      supplier_id: state.formData.supplier_id,
      supplier_name: state.formData.supplier_name,
      salesman: state.formData.salesman || "",
      total_amount: totals.total,
      currency_code: state.formData.currency_code || "SAR",
      currency_name: state.formData.currency_name || "ريال سعودي",
      exchange_rate: state.formData.exchange_rate || 1.0,
      workflow_status: state.formData.workflow_status || "pending",
      expected_delivery_date: state.formData.expected_delivery_date
        ? new Date(state.formData.expected_delivery_date).toISOString()
        : null,
      manual_document: state.formData.manual_document || null,
      notes: state.formData.notes || null,
    }

    const items = state.orderItems
      .filter((item) => item.product_name && item.quantity > 0)
      .map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount_percentage: Number(item.discount_percentage) || 0,
        total_price: Number(item.total_price),
        notes: item.notes || null,
        barcode: item.barcode || null,
        unit: item.unit || "قطعة",
        warehouse: item.warehouse || "المستودع الرئيسي",
        bonus_quantity: Number(item.bonus_quantity) || 0,
        expiry_date: item.expiry_date || null,
        batch_number: item.batch_number || null,
        item_status: "pending",
      }))

    console.log("[v0] Sending order data:", orderData)
    console.log("[v0] Sending items data:", items)

    const method = isNewRecord ? "POST" : "PUT"
    const url = "/api/purchase-orders"

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ orderData, items }),
    })

    console.log("[v0] Response status:", response.status)

    if (!response.ok) {
      const responseText = await response.text()
      console.error("[v0] API Error Response Text:", responseText)

      let errorData
      try {
        errorData = JSON.parse(responseText)
      } catch {
        errorData = { error: `HTTP ${response.status}: ${responseText}` }
      }

      throw new Error(errorData.error || "فشل في حفظ طلبية الشراء")
    }

    const result = await response.json()
    console.log("[v0] Save successful:", result)

    if (result.id) {
      for (const item of state.orderItems) {
        if (item.expiry_date && item.batch_number && item.product_id) {
          await createLotForPurchaseItem(item, result.id)
        }
      }
    }

    if (onOrderSaved) {
      onOrderSaved(result)
    }
  }

  async function handleDeleteOrder(orderToDelete: PurchaseOrder): Promise<void> {
    if (!orderToDelete || !orderToDelete.id) {
      throw new Error("لا توجد طلبية محددة للحذف")
    }

    if (!confirm("هل أنت متأكد من حذف هذه الطلبية؟")) {
      throw new Error("تم إلغاء العملية")
    }

    const response = await fetch(`/api/purchase-orders?id=${orderToDelete.id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("فشل في حذف طلبية الشراء")
    }

    if (onOrderSaved) {
      onOrderSaved(null)
    }
  }

  const handleCancel = () => {
    // Reset form state
    setState((prev) => ({
      ...prev,
      formData: initialFormData,
      orderItems: [{ ...initialOrderItem, id: "1" }],
      supplierSearch: "",
      activeTab: "basic",
    }))

    if (onOpenChange) {
      onOpenChange(false)
    } else {
      onCancel()
    }
  }

  const handleOrderNumberSearch = () => {
    setState((prev) => ({ ...prev, showOrderSearch: true }))
  }

  const handleOrderSelect = (orderNumber: string) => {
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, order_number: orderNumber },
      showOrderSearch: false,
    }))
  }

  const onNew = () => {
    setEditingOrder?.(null)
    setState({
      ...state,
      formData: initialFormData,
      orderItems: [{ ...initialOrderItem, id: "1" }],
      supplierSearch: "",
      showSupplierSearch: false,
      showProductSearch: false,
      activeItemId: null,
      showOrderSearch: false,
    })
    generateOrderNumber()
  }

  const handleSave = async () => {
    setState((prev) => ({ ...prev, isSaving: true }))
    try {
      const isNewRecord = !state.formData.id

      const currentOrderForNavigation = {
        ...createNewOrder(),
        id: state.formData.id || 0,
        order_number: state.formData.order_number,
        order_date: state.formData.order_date,
        supplier_name: state.formData.supplier_name,
        supplier_id: state.formData.supplier_id || 0,
        total_amount: totals.total,
        workflow_status: state.formData.workflow_status,
        expected_delivery_date: state.formData.expected_delivery_date,
        salesman: state.formData.salesman,
        currency_code: state.formData.currency_code,
        exchange_rate: state.formData.exchange_rate,
        notes: state.formData.notes,
      }

      await saveRecord(currentOrderForNavigation, isNewRecord)
      alert("تم حفظ الطلبية بنجاح")

      if (isNewRecord) {
        if (onOpenChange) {
          onOpenChange(false)
        } else {
          onCancel()
        }
      }
    } catch (err: any) {
      console.error("Error saving purchase order:", err)
      alert(err.message || "حدث خطأ أثناء حفظ البيانات")
    } finally {
      setState((prev) => ({ ...prev, isSaving: false }))
    }
  }

  const handleDelete = async () => {
    setState((prev) => ({ ...prev, isDeleting: true }))
    try {
      await deleteRecord()
      alert("تم حذف الطلبية بنجاح")

      if (onOpenChange) {
        onOpenChange(false)
      } else {
        onCancel()
      }
    } catch (err: any) {
      console.error("Error deleting purchase order:", err)
      alert(err.message || "حدث خطأ أثناء حذف البيانات")
    } finally {
      setState((prev) => ({ ...prev, isDeleting: false }))
    }
  }

  const handleReport = () => {
    setShowReport(true)
  }

  const handleExportExcel = async () => {
    setShowReport(true)
  }

  const handlePrint = () => {
    setShowReport(true)
  }

  const reportColumns = [
    { key: "order_number", label: "رقم الطلبية", width: "120px" },
    { key: "order_date", label: "التاريخ", width: "100px" },
    { key: "supplier_name", label: "اسم المورد", width: "200px" },
    { key: "workflow_status", label: "الحالة", width: "100px" },
    { key: "total_amount", label: "المبلغ", width: "100px" },
    { key: "salesman", label: "المندوب", width: "120px" },
    { key: "expected_delivery_date", label: "تاريخ التسليم المتوقع", width: "140px" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange || handleCancel}>
      <DialogContent className="max-w-[98vw] w-full h-[95vh] p-0 gap-0 flex flex-col">
        <div className="sticky top-0 z-50 bg-background border-b px-6 py-4">
          <UniversalToolbar
            currentRecord={currentIndex}
            totalRecords={navTotalRecords}
            onFirst={goToFirst}
            onPrevious={goToPrevious}
            onNext={goToNext}
            onLast={goToLast}
            onNew={onNew}
            onSave={handleSave}
            onDelete={handleDelete}
            onReport={handleReport}
            onExportExcel={handleExportExcel}
            onPrint={handlePrint}
            isLoading={navLoading}
            isSaving={state.isSaving}
            canSave={canSave}
            canDelete={canDelete}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />
          <div className="pt-3">
            <TransactionBranchField
              family="purchase_order"
              action={state.formData.id ? "update" : "create"}
              value={state.formData.branch_id}
              onChange={(branchId) => setState((prev) => ({ ...prev, formData: { ...prev.formData, branch_id: branchId } }))}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 sticky top-0 z-40 shadow-md">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">ملخص الطلبية</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">المجموع الفرعي</span>
                      <span className="font-semibold">{totals.subtotal.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الخصم</span>
                      <span className="font-semibold text-red-600">-{totals.discount.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الضريبة</span>
                      <span className="font-semibold">{totals.tax.toFixed(2)} ر.س</span>
                    </div>
                    <Separator orientation="vertical" className="h-10 hidden md:block" />
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الإجمالي</span>
                      <span className="text-lg font-bold text-primary">{totals.total.toFixed(2)} ر.س</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* معلومات الطلبية الأساسية */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  معلومات الطلبية الأساسية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isFieldVisible("sequence") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {getFieldDisplayName("sequence")}
                        {settings.find((s) => s.field_name === "sequence")?.is_required && (
                          <span className="text-red-500 mr-1">*</span>
                        )}
                      </Label>
                      <div className="relative">
                        <Input
                          value={state.formData.order_number}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, order_number: e.target.value },
                            }))
                          }
                          className="text-right font-medium pr-12 h-11"
                          dir="rtl"
                          placeholder={state.formData.order_number === "" ? "أدخل الرقم يدوياً" : ""}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-9 w-9 p-0"
                          onClick={handleOrderNumberSearch}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {isFieldVisible("order_date") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {getFieldDisplayName("order_date") || "تاريخ الطلبية"}
                        {settings.find((s) => s.field_name === "order_date")?.is_required && (
                          <span className="text-red-500 mr-1">*</span>
                        )}
                      </Label>
                      <Input
                        type="date"
                        value={state.formData.order_date}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, order_date: e.target.value },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                  )}
                  {isFieldVisible("expected_delivery_date") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {getFieldDisplayName("expected_delivery_date") || "تاريخ التسليم المتوقع"}
                        {settings.find((s) => s.field_name === "expected_delivery_date")?.is_required && (
                          <span className="text-red-500 mr-1">*</span>
                        )}
                      </Label>
                      <Input
                        type="date"
                        value={state.formData.expected_delivery_date}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, expected_delivery_date: e.target.value },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                  )}
                  {isFieldVisible("workflow_status") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {getFieldDisplayName("workflow_status") || "حالة الطلبية"}
                        {settings.find((s) => s.field_name === "workflow_status")?.is_required && (
                          <span className="text-red-500 mr-1">*</span>
                        )}
                      </Label>
                      <Select
                        value={state.formData.workflow_status}
                        onValueChange={(value) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, workflow_status: value },
                          }))
                        }
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">قيد التنفيذ</SelectItem>
                          <SelectItem value="confirmed">مؤكدة</SelectItem>
                          <SelectItem value="shipped">تم الشحن</SelectItem>
                          <SelectItem value="delivered">تم التسليم</SelectItem>
                          <SelectItem value="cancelled">ملغاة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {isFieldVisible("salesman") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">المندوب</Label>
                      <Input
                        value={state.formData.salesman}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, salesman: e.target.value },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                  )}
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="additional-info" className="border rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-medium hover:no-underline">
                      معلومات إضافية
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isFieldVisible("manual_document") && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              {getFieldDisplayName("manual_document") || "رقم المستند اليدوي"}
                              {settings.find((s) => s.field_name === "manual_document")?.is_required && (
                                <span className="text-red-500 mr-1">*</span>
                              )}
                            </Label>
                            <Input
                              value={state.formData.manual_document}
                              onChange={(e) =>
                                setState((prev) => ({
                                  ...prev,
                                  formData: { ...prev.formData, manual_document: e.target.value },
                                }))
                              }
                              className="text-right h-11"
                              dir="rtl"
                            />
                          </div>
                        )}
                        {isFieldVisible("priority") && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              {getFieldDisplayName("priority") || "الأولوية"}
                              {settings.find((s) => s.field_name === "priority")?.is_required && (
                                <span className="text-red-500 mr-1">*</span>
                              )}
                            </Label>
                            <Select
                              value={state.formData.priority}
                              onValueChange={(value) =>
                                setState((prev) => ({
                                  ...prev,
                                  formData: { ...prev.formData, priority: value },
                                }))
                              }
                            >
                              <SelectTrigger className="h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="عادي">عادي</SelectItem>
                                <SelectItem value="عاجل">عاجل</SelectItem>
                                <SelectItem value="مستعجل جداً">مستعجل جداً</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* معلومات المورد */}
            {(isFieldVisible("supplier") || isFieldVisible("supplier_name") || isFieldVisible("supplier_phone")) && (
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    معلومات المورد
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isFieldVisible("supplier_number") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          {getFieldDisplayName("supplier_number") || "رقم المورد"}
                          {settings.find((s) => s.field_name === "supplier_number")?.is_required && (
                            <span className="text-red-500 mr-1">*</span>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            value={state.formData.supplier_number}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                formData: { ...prev.formData, supplier_number: e.target.value },
                              }))
                            }
                            className="text-right pr-12 h-11"
                            placeholder="S0000001"
                            dir="rtl"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-9 w-9 p-0"
                            onClick={() => setState((prev) => ({ ...prev, showSupplierSearch: true }))}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    {isFieldVisible("supplier_name") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          {getFieldDisplayName("supplier_name") || "اسم المورد"}
                          {settings.find((s) => s.field_name === "supplier_name")?.is_required && (
                            <span className="text-red-500 mr-1">*</span>
                          )}
                        </Label>
                        <Input
                          value={state.formData.supplier_name}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, supplier_name: e.target.value },
                            }))
                          }
                          className="text-right h-11"
                          dir="rtl"
                        />
                      </div>
                    )}
                    {isFieldVisible("supplier_phone") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          {getFieldDisplayName("supplier_phone") || "هاتف المورد"}
                          {settings.find((s) => s.field_name === "supplier_phone")?.is_required && (
                            <span className="text-red-500 mr-1">*</span>
                          )}
                        </Label>
                        <Input
                          value={state.formData.supplier_phone}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, supplier_phone: e.target.value },
                            }))
                          }
                          className="text-right h-11"
                          dir="rtl"
                        />
                      </div>
                    )}
                  </div>

                  {isFieldVisible("delivery_address") && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {getFieldDisplayName("delivery_address") || "عنوان التسليم"}
                        {settings.find((s) => s.field_name === "delivery_address")?.is_required && (
                          <span className="text-red-500 mr-1">*</span>
                        )}
                      </Label>
                      <Textarea
                        value={state.formData.delivery_address}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, delivery_address: e.target.value },
                          }))
                        }
                        className="text-right min-h-[100px] resize-none"
                        rows={3}
                        dir="rtl"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* أصناف الطلبية */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    أصناف الطلبية
                  </CardTitle>
                  <Button onClick={addOrderItem} size="sm" className="h-10 w-full sm:w-auto">
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة صنف
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-6 px-6">
                  <div className="inline-block min-w-full align-middle">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right w-16">م</TableHead>
                          {isFieldVisible("barcode") && (
                            <TableHead className="text-right min-w-[120px]">{getFieldDisplayName("barcode")}</TableHead>
                          )}
                          {isFieldVisible("product") && (
                            <>
                              <TableHead className="text-right min-w-[120px]">كود المنتج</TableHead>
                              <TableHead className="text-right min-w-[200px]">اسم المنتج</TableHead>
                            </>
                          )}
                          {isFieldVisible("unit") && (
                            <TableHead className="text-right min-w-[100px]">{getFieldDisplayName("unit")}</TableHead>
                          )}
                          {isFieldVisible("quantity") && (
                            <TableHead className="text-right min-w-[120px]">
                              {getFieldDisplayName("quantity")}
                            </TableHead>
                          )}
                          {isFieldVisible("unit_price") && (
                            <TableHead className="text-right min-w-[120px]">
                              {getFieldDisplayName("unit_price")}
                            </TableHead>
                          )}
                          {isFieldVisible("discount") && (
                            <TableHead className="text-right min-w-[100px]">
                              {getFieldDisplayName("discount")}
                            </TableHead>
                          )}
                          {isFieldVisible("tax") && (
                            <TableHead className="text-right min-w-[100px]">{getFieldDisplayName("tax")}</TableHead>
                          )}
                          {isFieldVisible("total") && (
                            <TableHead className="text-right min-w-[140px]">{getFieldDisplayName("total")}</TableHead>
                          )}
                          {isFieldVisible("warehouse") && (
                            <TableHead className="text-right min-w-[120px]">
                              {getFieldDisplayName("warehouse")}
                            </TableHead>
                          )}
                          {isFieldVisible("expiry_date") && (
                            <TableHead className="text-right min-w-[140px]">
                              {getFieldDisplayName("expiry_date")}
                            </TableHead>
                          )}
                          {isFieldVisible("batch_number") && (
                            <TableHead className="text-right min-w-[120px]">
                              {getFieldDisplayName("batch_number")}
                            </TableHead>
                          )}
                          {isFieldVisible("notes") && (
                            <TableHead className="text-right min-w-[150px]">{getFieldDisplayName("notes")}</TableHead>
                          )}
                          <TableHead className="text-right w-20 sticky left-0 bg-background">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.orderItems.map((item, index) => (
                          <TableRow key={item.id} data-product-row={item.id}>
                            <TableCell className="text-center font-medium">{index + 1}</TableCell>
                            {isFieldVisible("barcode") && (
                              <TableCell>
                                <Input
                                  value={item.barcode}
                                  onChange={(e) => updateOrderItem(item.id, "barcode", e.target.value)}
                                  className="text-right h-10"
                                  placeholder="باركود"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("product") && (
                              <>
                                <TableCell>
                                  <div className="relative">
                                    <Input
                                      value={item.product_code}
                                      onChange={(e) => updateOrderItem(item.id, "product_code", e.target.value)}
                                      className="text-right pr-10 h-10"
                                      placeholder="كود"
                                      dir="rtl"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                                      onClick={() =>
                                        setState((prev) => ({
                                          ...prev,
                                          showProductSearch: true,
                                          activeItemId: item.id,
                                        }))
                                      }
                                    >
                                      <Search className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item.product_name}
                                    onChange={(e) => updateOrderItem(item.id, "product_name", e.target.value)}
                                    className="text-right h-10"
                                    placeholder="اسم المنتج"
                                    dir="rtl"
                                  />
                                </TableCell>
                              </>
                            )}
                            {isFieldVisible("unit") && (
                              <TableCell>
                                <Input
                                  value={item.unit}
                                  onChange={(e) => updateOrderItem(item.id, "unit", e.target.value)}
                                  className="text-right h-10"
                                  placeholder="وحدة"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("quantity") && (
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateOrderItem(item.id, "quantity", Number.parseFloat(e.target.value) || 0)
                                  }
                                  className="text-right h-10"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("unit_price") && (
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unit_price}
                                  onChange={(e) =>
                                    updateOrderItem(item.id, "unit_price", Number.parseFloat(e.target.value) || 0)
                                  }
                                  className="text-right h-10"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("discount") && (
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.discount_percentage}
                                  onChange={(e) =>
                                    updateOrderItem(
                                      item.id,
                                      "discount_percentage",
                                      Number.parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="text-right h-10"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("tax") && (
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.tax_percentage}
                                  onChange={(e) =>
                                    updateOrderItem(item.id, "tax_percentage", Number.parseFloat(e.target.value) || 0)
                                  }
                                  className="text-right h-10"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("total") && (
                              <TableCell>
                                <div className="text-right font-semibold text-base" dir="rtl">
                                  {calculateItemTotal(item).toFixed(2)} ر.س
                                </div>
                              </TableCell>
                            )}
                            {isFieldVisible("warehouse") && (
                              <TableCell>
                                <Select
                                  value={item.warehouse}
                                  onValueChange={(value) => updateOrderItem(item.id, "warehouse", value)}
                                >
                                  <SelectTrigger className="h-10">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="المستودع الرئيسي">الرئيسي</SelectItem>
                                    <SelectItem value="مستودع فرعي 1">الفرعي</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                            {isFieldVisible("expiry_date") && (
                              <TableCell>
                                <Input
                                  type="date"
                                  value={item.expiry_date}
                                  onChange={(e) => updateOrderItem(item.id, "expiry_date", e.target.value)}
                                  className="text-right h-10"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("batch_number") && (
                              <TableCell>
                                <Input
                                  value={item.batch_number}
                                  onChange={(e) => updateOrderItem(item.id, "batch_number", e.target.value)}
                                  className="text-right h-10"
                                  placeholder="رقم الدفعة"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            {isFieldVisible("notes") && (
                              <TableCell>
                                <Input
                                  value={item.notes}
                                  onChange={(e) => updateOrderItem(item.id, "notes", e.target.value)}
                                  className="text-right h-10"
                                  placeholder="ملاحظات"
                                  dir="rtl"
                                />
                              </TableCell>
                            )}
                            <TableCell className="sticky left-0 bg-background">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeOrderItem(item.id)}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50 h-9 w-9 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* المعلومات المالية والحسابات */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Percent className="h-5 w-5 text-primary" />
                    الخصومات والضرائب
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">نوع الخصم</Label>
                      <Select
                        value={state.formData.discount_type}
                        onValueChange={(value) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, discount_type: value },
                          }))
                        }
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">نسبة مئوية</SelectItem>
                          <SelectItem value="amount">مبلغ ثابت</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">قيمة الخصم</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={state.formData.discount_value}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, discount_value: Number.parseFloat(e.target.value) || 0 },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">نسبة الضريبة (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={state.formData.tax_percentage}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          formData: { ...prev.formData, tax_percentage: Number.parseFloat(e.target.value) || 0 },
                        }))
                      }
                      className="text-right h-11"
                      dir="rtl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">تكلفة الشحن</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={state.formData.shipping_cost}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, shipping_cost: Number.parseFloat(e.target.value) || 0 },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">رسوم أخرى</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={state.formData.other_charges}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, other_charges: Number.parseFloat(e.target.value) || 0 },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    ملخص المبالغ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">المجموع الفرعي:</span>
                      <span className="font-semibold text-lg">{totals.subtotal.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الخصم:</span>
                      <span className="font-semibold text-lg text-red-600">-{totals.discount.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الضريبة:</span>
                      <span className="font-semibold text-lg">{totals.tax.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الشحن:</span>
                      <span className="font-semibold text-lg">{state.formData.shipping_cost.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">رسوم أخرى:</span>
                      <span className="font-semibold text-lg">{state.formData.other_charges.toFixed(2)} ر.س</span>
                    </div>
                    <Separator className="my-4" />
                    <div className="flex justify-between items-center bg-primary/10 p-4 rounded-lg border border-primary/20">
                      <span className="text-lg font-bold">المجموع الكلي:</span>
                      <span className="text-2xl font-bold text-primary">{totals.total.toFixed(2)} ر.س</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* الملاحظات */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="notes" className="border rounded-lg">
                <Card className="border-0">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      الملاحظات
                    </CardTitle>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="space-y-6 pt-0">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">ملاحظات عامة</Label>
                        <Textarea
                          value={state.formData.notes}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, notes: e.target.value },
                            }))
                          }
                          className="text-right min-h-[100px] resize-none"
                          rows={4}
                          placeholder="ملاحظات للمورد"
                          dir="rtl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">ملاحظات داخلية</Label>
                        <Textarea
                          value={state.formData.internal_notes}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, internal_notes: e.target.value },
                            }))
                          }
                          className="text-right min-h-[100px] resize-none"
                          rows={4}
                          placeholder="ملاحظات للاستخدام الداخلي فقط"
                          dir="rtl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">ملاحظات التسليم</Label>
                        <Textarea
                          value={state.formData.delivery_notes}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, delivery_notes: e.target.value },
                            }))
                          }
                          className="text-right min-h-[100px] resize-none"
                          rows={4}
                          placeholder="ملاحظات خاصة بالتسليم"
                          dir="rtl"
                        />
                      </div>
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        {/* شريط الاختصارات */}
        <div className="bg-muted/50 px-6 py-3 border-t">
          <div className="text-xs text-muted-foreground text-center">
            <span className="font-medium">الاختصارات:</span> F2 - بحث الموردين | F3 - بحث المنتجات | Ctrl+S - حفظ |
            Escape - إغلاق
          </div>
        </div>

        {/* نوافذ البحث */}
        {state.showSupplierSearch && (
          <InlineSupplierSearch
            suppliers={state.suppliers}
            onSelect={handleSupplierSelect}
            onClose={() => setState((prev) => ({ ...prev, showSupplierSearch: false }))}
          />
        )}

        {state.showProductSearch && (
          <InlineProductSearch
            products={state.products}
            onSelect={(product: any) => handleProductSelect(product, state.activeItemId!)}
            onClose={() => setState((prev) => ({ ...prev, showProductSearch: false, activeItemId: null }))}
          />
        )}

        <OrderSearchDialog
          open={state.showOrderSearch}
          onOpenChange={(open) => setState((prev) => ({ ...prev, showOrderSearch: open }))}
          onOrderSelect={handleOrderSelect}
          orderType="purchase"
        />

        <ReportGenerator
          title="تقرير طلبات الشراء"
          data={allOrders}
          columns={reportColumns}
          isOpen={showReport}
          onClose={() => setShowReport(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export { UnifiedPurchaseOrder }
export default UnifiedPurchaseOrder
