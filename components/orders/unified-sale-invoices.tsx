"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
import * as wjcCore from '@grapecity/wijmo';
import { Toast } from 'primereact/toast';
import * as XLSX from "xlsx";
import { FlexGrid } from '@grapecity/wijmo.react.grid';
import {
  Plus,
  Trash2,
  Search,
  Calculator,
  User,
  Package,
  FileText,
  Percent,
  MessageSquare,
  TrendingUp,
  Currency,
} from "lucide-react"
import { useDocumentSettings } from "@/hooks/use-document-settings"
import { LotSelector } from "@/components/inventory/lot-selector"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import ProductSearchPopup from "../products/ProductSearchPopup"
import * as wjGrid from "@grapecity/wijmo.grid";
import DataGridView from "../common/DataGridView"
import Messages from "../common/Messages"
import Util from "../common/Util"
import UnitsSearchPopup from "../products/UnitsSearchPopup"
import StoresSearchPopup from "../products/StoresSearchPopup"
import { adjustStock } from "@/lib/inventory"
import { maxLength } from "zod/v4"
import CustomerSearchPopup from "../products/CustomerSearchPopup"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import OrderSearchPopup from "./OrderSearchPopup"
import ConfirmDialogYesNo from "../ui/ConfirmDialogYesNo"
import { stat } from "fs"
import { set } from "date-fns"
import React from "react"

// Inject CSS styles for dropdown visibility fix
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    .invoice-inline-labels .space-y-2:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle),
    .invoice-inline-labels .grid > div:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) {
      display: grid !important;
      grid-template-columns: clamp(78px, 10vw, 108px) minmax(0, 1fr);
      align-items: center;
      gap: 0.45rem 0.2rem;
    }

    .invoice-inline-labels .space-y-2:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) > label,
    .invoice-inline-labels .grid > div:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) > label {
      margin: 0 !important;
      white-space: nowrap;
      line-height: 1.2;
    }

    .invoice-inline-labels .space-y-2:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) > .flex,
    .invoice-inline-labels .grid > div:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) > .flex {
      width: 100%;
    }

    .invoice-inline-labels .invoice-offset-toggle {
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      position: relative;
    }

    .invoice-inline-labels .invoice-offset-toggle input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .invoice-inline-labels .invoice-offset-toggle-track {
      width: 2.75rem;
      height: 1.5rem;
      border-radius: 9999px;
      background: rgb(203 213 225);
      position: relative;
      transition: background-color 0.2s ease;
      flex-shrink: 0;
    }

    .invoice-inline-labels .invoice-offset-toggle-thumb {
      position: absolute;
      top: 0.2rem;
      left: 0.2rem;
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 9999px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
      transition: transform 0.2s ease;
    }

    .invoice-inline-labels .invoice-offset-toggle input:checked + .invoice-offset-toggle-track {
      background: #16a34a;
    }

    .invoice-inline-labels .invoice-offset-toggle input:checked + .invoice-offset-toggle-track .invoice-offset-toggle-thumb {
      transform: translateX(1.25rem);
    }

    @media (max-width: 768px) {
      .invoice-inline-labels .space-y-2:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle),
      .invoice-inline-labels .grid > div:has(> label):has(> input, > textarea, > .p-dropdown, > .flex, > .invoice-offset-toggle) {
        grid-template-columns: 84px minmax(0, 1fr);
      }
    }

    .invoice-currency-dropdown-wrap {
      overflow: visible !important;
      position: relative;
    }

    .invoice-inline-labels input,
    .invoice-inline-labels textarea,
    .invoice-inline-labels .p-dropdown,
    .invoice-inline-labels .p-inputtext,
    .invoice-inline-labels [role="combobox"] {
      background-color: #ecfdf5 !important;
    }

    .invoice-inline-labels input:disabled,
    .invoice-inline-labels textarea:disabled,
    .invoice-inline-labels .p-disabled {
      background-color: #d1fae5 !important;
    }

    .invoice-currency-dropdown-panel {
      z-index: 9999 !important;
      position: absolute !important;
      top: 100% !important;
      left: 0 !important;
    }
    .p-dropdown-panel {
      z-index: 9999 !important;
    }
  `
  document.head.appendChild(styleSheet)
}
const InlineProductSearch = ({ onSelect, onClose, products }: any) => {
  const [searchTerm, setSearchTerm] = useState("")

  const safeProducts = Array.isArray(products) ? products : []

  const filteredProducts = safeProducts.filter(
    (product: any) =>
      product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()),
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
                {product.product_code} - {product.main_unit} - {product.selling_price || product.last_purchase_price}
                ر.س
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

interface SalesOrder {
  id: number
  order_number: string
  order_date: string
  reference_number_date?: string
  customer_name: string
  customer_id: number
  order_status: number
  order_status2: number
  financial_status: string
  total_amount: number
  salesman: string
  delivery_date: string
  workflow_sequence_id: number
  currency_id: number
  exchange_rate: number
  notes: string
  created_at: string
  updated_at: string
  printed: number
  is_exported: number
  exported_sales?: boolean
  items?: OrderItem[] // Assuming order items are nested
}

interface UnifiedSalesOrderProps {
  order?: any // Assuming 'order' is the data for an existing order
  allOrders?: SalesOrder[] // إضافة prop جديد لجميع الطلبيات
  onOrderSaved?: (data: any) => void
  onCancel: () => void
  setEditingOrder?: (order: any | null) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  vch_type?: number
  fromSearch?: boolean
}

interface Customer {
  id: number
  customer_code: string
  customer_name: string
  email?: string
  mobile1?: string
  address?: string
  tax_number?: string
  credit_limit?: number
  payment_terms?: string
}
interface Unit {
  unit_id: string;
  unit_name: string;
  price: number;
  barcode: string;
  to_main_qnty: number;
}
interface Product {
  id: number
  product_code: string
  name: string
  main_unit: string
  last_purchase_price: number
  selling_price?: number
  current_stock: number
  first_barcode?: string
  units?: []
}

interface OrderItem {
  ser: number,
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
  vat_percent: number
  vat_amount: number
  total_price: number
  expiry_date: string
  batch_number: string
  notes: string
  // New fields for lot selection
  lot_id?: number | null
  lotAllocations?: any[] // To store detailed lot allocations
}

interface OrderFormData {
  id?: number
  order_number: string | null
  order_date: string | null
  invoice_number: string | null
  reference_number: string | null
  reference_number_date: string | null
  customer_id: number | null
  customer_name: string | null
  customer_code: string | null
  customer_address: string | null
  customer_tax_number: string | null
  salesman: string | null
  sales_representative: string | null
  currency_id: number
  currency_name: string
  exchange_rate: number
  payment_terms: string | null
  delivery_date: string | null
  delivery_address: string | null
  delivery_notes: string | null
  order_status: number
  financial_status: string
  order_status2: number
  source: string
  general_notes: string | null
  internal_notes: string | null
  discount_type: string
  discount_amount: number
  vat_percent: number
  vat_amount: number
  shipping_cost: number
  other_charges: number
  total_before_discount: number
  total_after_discount: number
  total_tax: number
  grand_total: number
  // New fields from updates
  customer_number?: string | null
  customer_phone?: string | null
  order_source: string,
  vch_book: string
  received_by?: string | null,
  customer_order_no?: string | null,
  printed: number | null,
  is_exported: number | null,
  exported_sales: boolean,
  tax_classification: number | null,
  invoice_type: number | null,
  is_offset: boolean,
  offset_code: number | null,
  invoice_source_type: string,

}

const initialFormData: OrderFormData = {
  id: 0,
  order_number: "",
  order_date: new Date().toISOString().split("T")[0],
  invoice_number: "",
  reference_number: "",
  reference_number_date: new Date().toISOString().split("T")[0],
  customer_id: 0,
  customer_name: "",
  customer_code: "",
  customer_address: "",
  customer_tax_number: "",
  salesman: "-1",
  sales_representative: "",
  currency_id: 1,
  currency_name: "",
  exchange_rate: 1.0,
  payment_terms: "نقدي",
  delivery_date: new Date().toISOString().split("T")[0],
  delivery_address: "",
  delivery_notes: "",
  order_status: 1,
  order_status2: 1,
  financial_status: "unpaid",
  source: "مباشر",
  general_notes: "",
  internal_notes: "",
  discount_type: "percentage",
  discount_amount: 0,
  vat_percent: 0,
  vat_amount: 0,
  shipping_cost: 0,
  other_charges: 0,
  total_before_discount: 0,
  total_after_discount: 0,
  total_tax: 0,
  grand_total: 0,
  // New fields from updates
  customer_number: "",
  customer_phone: "",
  order_source: "manual",
  vch_book: "R",
  received_by: "",
  customer_order_no: "",
  printed: 0,
  is_exported: 0,
  exported_sales: false,
  tax_classification: 1,
  invoice_type: 1,
  is_offset: false,
  offset_code: null,
  invoice_source_type: "normal",
}


function UnifiedSaleInvoices({
  order,
  allOrders = [],
  onOrderSaved,
  onCancel,
  setEditingOrder,
  open = true,
  onOpenChange,
  vch_type,
  fromSearch = false,
}: UnifiedSalesOrderProps) {
  const {
    settings,
    loading: settingsLoading,
    isFieldVisible,
    getFieldDisplayName,
    getVisibleFields,
  } = useDocumentSettings("sales-order")

  const [state, setState] = useState({
    isSubmitting: false,
    customers: [] as Customer[],
    products: [] as Product[],
    formData: order ? { ...initialFormData, ...order } : initialFormData,
    FormDataBackup: null as OrderFormData | null,
    customerSearch: "",
    productSearch: "",
    showCustomerDropdown: false,
    showProductDropdown: false,
    activeTab: "items", // Changed default tab to items for faster data entry
    // New state from updates
    showCustomerSearch: false,
    showProductSearch: false,
    activeItemId: null as string | null,
    showLotSelector: false,
    selectedProductForLots: null as any,
    selectedItemIdForLots: null as string | null,
    // new state for navigation
    currentRecordId: order?.id || null,
    totalRecords: allOrders?.length || 0,
    isSaving: false,
    isDeleting: false,
  })
  const isSaving = useRef(false)
  const isHandlingSave = useRef(false)
  const isDeleting = useRef(false)
  const lastVchBook = useRef<string | null>(null)
  const doHotKeys = useRef(true)
  const toast = useRef<Toast | null>(null);
  const message = useRef(Messages);
  const [loading, setLoading] = useState(false);
  const [voucherBookLocked, setVoucherBookLocked] = useState(false)
  const setFromExcelRef = useRef(false);
  const priceCategoryIdRef = useRef(1)
  const [definitions, setDefinitions] = useState({
    categories: [] as Array<{ id: number; group_name: string }>,
    suppliers: [] as Array<{ id: number; name: string; code?: string }>,
    warehouses: [] as Array<{ id: number; warehouse_name: string }>,
    units: [] as Array<{ id: number; unit_name: string }>,
    currencies: [] as Array<{ id: number; currency_name: string }>,
    price_category: [] as Array<{ id: number; name: string }>,
    product_category: [] as Array<{ id: number; name: string }>,
  })
  const definitionsRef = useRef({
    categories: [] as Array<{ id: number; group_name: string }>,
    suppliers: [] as Array<{ id: number; name: string; code?: string }>,
    warehouses: [] as Array<{ id: number; code: String, warehouse_name: string }>,
    units: [] as Array<{ id: number; unit_name: string }>,
    currencies: [] as Array<{ currency_id: number; currency_name: string }>,
    price_category: [] as Array<{ id: number; name: string }>,
    product_category: [] as Array<{ id: number; name: string }>,
  });
  const [showReport, setShowReport] = useState(false)
  interface Salesman {
    id: number
    name: string
    department?: string
    is_active: boolean
  }
  type OrderStatus = {
    id: number;
    name: string;
  };
  const [salesmen, setSalesmen] = useState<Salesman[]>([])
  const [showItemSearch, setItemSearch] = useState(false)
  const searchTextRef = useRef("")
  const [showUnitsSearch, setUnitsSearch] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [orderStatusList, setOrderStatusList] = useState<OrderStatus[]>([]);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [selectedProductForUnits, setSelectedProductForUnits] = useState<Product | null>(null);
  const [showStoresSearch, setStoresSearch] = useState(false)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showOrderSearch, setShowOrderSearch] = useState(false);
  const gridRef = useRef<wjGrid.FlexGrid | null>(null);
  const fromBlurRef = useRef(false);
  const orderNumberRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const referenceNumberRef = useRef<HTMLInputElement>(null);
  const customerSelectHandledRef = useRef(false);
  const [lastFilledRow, setLastFilledRow] = useState(null);
  const normalizedCurrencies = useMemo(
    () =>
      (definitionsRef.current.currencies ?? []).map((currency: any) => ({
        currency_id: Number(currency.currency_id ?? currency.id ?? 0),
        currency_name: currency.currency_name ?? currency.name ?? "",
      })),
    [definitions.currencies],
  )
  const taxClassificationOptions = useMemo(
    () => [
      { label: "ضريبية", value: 1 },
      { label: "معفاه", value: 2 },
      { label: "صفرية", value: 3 },
    ],
    [],
  )
  const invoiceTypeOptions = useMemo(
    () => [
      { label: "للتجارة", value: 1 },
      { label: "خدمات", value: 2 },
      { label: "أصول", value: 3 },
    ],
    [],
  )
  const offsetCodeOptions = useMemo(
    () => [
      { label: "تجارية", value: 1 },
      { label: "أصول", value: 2 },
      { label: "خدمات", value: 3 },
    ],
    [],
  )
  const voucherTypeOptions = useMemo(
    () => [
      { label: "عادية", value: "normal" },
      { label: "من طلبية", value: "from_order" },
      { label: "من ارسالية", value: "from_delivery" },
      { label: "من عرض سعر", value: "from_quotation" },
    ],
    [],
  )
  const voucherBookOptions = useMemo(
    () => "LMPR".split("").map((book) => ({ label: book, value: book })),
    [],
  )
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [nextFunction, setNextFunction] = useState<(() => void) | null>(null);
  const [showPrintRefConfirm, setShowPrintRefConfirm] = useState(false);
  const [showDuplicateRefConfirm, setShowDuplicateRefConfirm] = useState(false);
  const [isDuplicateRefConfirmed, setIsDuplicateRefConfirmed] = useState(false);
  const duplicateRefDismissedValueRef = useRef<string>("");
  const skipNextEnterRef = useRef(false)
  const suppressEnterUntilRef = useRef(0)
  const [data, setData] = useState([{
    ser: 1, unit_id: 0, unit_name: '', units: [], name: '', discount: 0, batch: '', expiry_date: '1900-01-01', item_status: 1,
    barcode: '', id: 0, code: '', price: 0, qnty: 0, bonus: 0, amount: 0, to_main_unit_qty: 0, store_id: 0, store_name: ''
  }]);
  const [CollectionView] = useState(() => new wjcCore.CollectionView(data));
  const CollectionViewBackupRef = useRef(null as any);
  const createNewOrder = (): SalesOrder => ({
    id: 0,

    order_number: "",

    // keep ISO format for filtering/sorting
    order_date: new Date().toISOString(),

    customer_id: 0,
    customer_name: "",

    order_status: 1, // default: غير جاهزة
    order_status2: 1,
    financial_status: "pending",

    total_amount: 0,

    salesman: "",

    delivery_date: "",

    workflow_sequence_id: 0,

    currency_id: 1, // default currency id
    exchange_rate: 1,

    notes: "",

    printed: 0,
    is_exported: 0,
    exported_sales: false,
    reference_number_date: new Date().toISOString().split("T")[0],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    items: [],
  });


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

  /*useEffect(() => {
    setState((prev) => ({
      ...prev,
      totalRecords: allOrders?.length || 0,
      currentRecordId: currentRecord?.id || null,
    }))
  }, [currentRecord, allOrders])

  useEffect(() => {
    console.log("currentRecord ",currentRecord)
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
  }, [currentRecord, state.formData.id])*/



  useEffect(() => {
    const { vch_book } = state.formData;

    // Optional: only generate if vch_book has a value
    console.log("vch_book changed999999:", vch_book, "fromBlurRef:", fromBlurRef.current, "fromSearch:", fromSearch)
    if (vch_book != null && !fromBlurRef.current && !fromSearch) {
      generateOrderNumber();
    }
    fromSearch = false
  }, [state.formData.vch_book]);
  const currencies = [
    { code: "SAR", name: "ريال سعودي" },
    { code: "USD", name: "دولار أمريكي" },
    { code: "EUR", name: "يورو" },
    { code: "ILS", name: "شيكل إسرائيلي" },
  ]

  const paymentTerms = ["نقدي", "آجل 30 يوم", "آجل 60 يوم", "آجل 90 يوم", "تقسيط"]
  const priorities = ["عادي", "عاجل", "مستعجل جداً"]
  const sources = ["مباشر", "هاتف", "إيميل", "موقع إلكتروني", "تطبيق جوال"]
  const warehouses = ["المستودع الرئيسي", "مستودع فرعي 1", "مستودع فرعي 2"]

  useEffect(() => {
    if (order) {

    }
  }, [order])

  useEffect(() => {
    if (!open) return;
    const init = async () => {
      try {
        setLoading(true);

        // Wait for definitions to load
        await fetchDefinitions();
        await checkVoucherBookLock();

        // Set order statuses
        setOrderStatusList([
          { id: 1, name: 'غير جاهز' },
          { id: 2, name: 'جاهز' },
          { id: 3, name: 'مرسلة جزئيا' },
          { id: 4, name: 'مرسلة كليا' },
          { id: 5, name: 'ملغي' }
        ]);

        // Initialize new record
        if (order) {
          loadOrderData("Byid", order.id)
          //fromSearch = false
        }
        else reset_order();
      } catch (error) {
        console.error("Failed to fetch definitions:", error);
      } finally {
        // Stop loading regardless of success/failure
        setLoading(false);
      }
    };

    init();

  }, [open]);

  const fetchDefinitions = async () => {
    const definitionsObj: any = {}
    const warehousesResponse = await fetch("/api/warehouses")
    if (warehousesResponse.ok) {
      const warehousesData = await warehousesResponse.json()
      definitionsObj.warehousesData = warehousesData
      definitionsRef.current.warehouses = warehousesData
      setDefinitions((prev) => ({ ...prev, warehouses: warehousesData }))
    }
    const currenciesResponse = await fetch("/api/exchange-rates")
    if (currenciesResponse.ok) {
      const currenciesData = await currenciesResponse.json()
      definitionsObj.currenciesData = currenciesData.rates
      definitionsRef.current.currencies = currenciesData.rates
      setDefinitions((prev) => ({ ...prev, currencies: currenciesData.rates }))
    }

    // Price categories
    const pricesResponse = await fetch("/api/pricecategory")
    if (pricesResponse.ok) {
      const pricesData = await pricesResponse.json()
      definitionsObj.pricesData = pricesData
      definitionsRef.current.price_category = pricesData
      setDefinitions((prev) => ({ ...prev, price_category: pricesData }))
    }
    const salesmanResponse = await fetch("/api/salesmen");
    if (salesmanResponse.ok) {
      const json = await salesmanResponse.json();
      setSalesmen(Array.isArray(json.data) ? json.data : []);
    }

    return definitionsObj
  }

  const checkVoucherBookLock = async () => {
    try {
      const response = await fetch("/api/settings/check-transactions")
      if (!response.ok) return
      const data = await response.json()
      setVoucherBookLocked(Boolean(data?.locks?.invoice))
    } catch (error) {
      console.error("Failed to check voucher book lock:", error)
    }
  }
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 for customer search
      if (e.key === "F2" && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setState((prev) => ({ ...prev, showCustomerSearch: true }))
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
          showCustomerSearch: false,
          showProductSearch: false,
          activeItemId: null,
          showLotSelector: false,
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
  }, [state.showCustomerSearch, state.showProductSearch, state.activeItemId, state.showLotSelector])

  const fetchCustomers = async () => {
    try {
      console.log("[v0] Calling customers API...")
      const response = await fetch("/api/orders/customers")
      console.log("[v0] Customers API response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Customers data received:", data.length, "records")
        console.log("[v0] First customer:", data[0])
        setState((prev) => ({ ...prev, customers: Array.isArray(data) ? data : [] }))
      } else {
        console.error("[v0] Customers API failed with status:", response.status)
      }
    } catch (error) {
      console.error("[v0] Error fetching customers:", error)
    }
  }

  const fetchProducts = async () => {
    try {
      console.log("[v0] Calling products API...")
      const response = await fetch("/api/inventory/products")
      console.log("[v0] Products API response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Products data received:", data.length, "records")
        setState((prev) => ({ ...prev, products: Array.isArray(data) ? data : [] }))
      } else {
        console.error("[v0] Products API failed with status:", response.status)
      }
    } catch (error) {
      console.error("[v0] Error fetching products:", error)
    }
  }

  const generateOrderNumber = async (bookOverride?: string) => {
    try {
      const vchBook = String(bookOverride ?? state.formData.vch_book ?? "R").trim().toUpperCase();
      const response = await fetch(
        `/api/vouchers/generate-number?vch_book=${encodeURIComponent(vchBook)}&vch_type=${encodeURIComponent(vch_type ?? 5)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to generate order number");
      }

      const data = await response.json();

      console.log("[Order number generation]:", data);

      // Manual numbering
      if (data.autoNumbering === false) {
        setState((prev) => ({
          ...prev,
          formData: { ...prev.formData, order_number: "" },
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        formData: { ...prev.formData, order_number: data.orderNumber },
      }));
      return data.orderNumber
    } catch (error) {
      console.error("Error generating order number:", error);

      // Fallback
      const now = new Date();
      const lastSeven = now.getTime().toString().slice(-7).padStart(7, "0");

      setState((prev) => ({
        ...prev,
        formData: { ...prev.formData, order_number: `I${lastSeven}` },
      }));
    }
  };


  const adjustCode = (code: string, codeLen: number = 8): string => {
    if (!code || !code.trim()) return '';

    code = code.trim().toUpperCase();

    // Separate prefix (letters) and numeric part
    const match = code.match(/^([A-Z]*)(\d*)$/);
    if (!match) return code; // invalid pattern (contains symbols)

    let [, prefix, numPart] = match;
    const padLen = Math.max(codeLen - prefix.length, 0);
    const paddedNum = numPart.padStart(padLen, '0');

    return `${prefix}${paddedNum}`;
  };
  const handleReferenceNumberBlur = async () => {
    const refNum = state.formData.reference_number?.trim();

    // Skip check if reference number is empty
    if (!refNum) return;

    try {
      // Build query params based on whether it's purchase or sale order
      const params = new URLSearchParams({
        reference_number: refNum,
        order_id: state.formData.id?.toString() || "0", // Exclude current order
        is_purchase: vch_type === 2 ? "true" : "false",
      });

      // Add customer filter if it's a purchase order
      if (vch_type === 2 && state.formData.customer_id) {
        params.append("customer_id", state.formData.customer_id.toString());
      }

      const response = await fetch(`/api/vouchers/check-reference-duplicate?${params.toString()}`);
      const data = await response.json();

      if (
        data.exists &&
        !isDuplicateRefConfirmed &&
        duplicateRefDismissedValueRef.current !== refNum
      ) {
        // Show confirmation dialog for duplicate
        popupHasCalled();
        setShowDuplicateRefConfirm(true);
      }
    } catch (error) {
      console.error("Error checking reference number:", error);
    }
  };

  const handleOrderCodeBlur = async () => {
    const { order_number } = state.formData;

    const cleaned = (order_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const book = String(state.formData.vch_book || "R").trim().toUpperCase();
    const basePrefix = vch_type === 1 ? "ORD" : vch_type === 2 ? "PUR" : "INV";
    const prefix = `${basePrefix}${book}`;
    const seqMatch = cleaned.match(/(\d+)$/);
    const seq = (seqMatch?.[1] || "1").slice(-5).padStart(5, "0");
    const order_num = `${prefix}${seq}`;


    console.log("order_num ", order_num);
    fromBlurRef.current = true
    // Update state
    setState((prev) => ({
      ...prev,
      formData: {
        ...prev.formData,
        order_number: order_num,
      },
    }));

    const params = new URLSearchParams({
      order_number: order_num,
    });

    try {
      const res = await fetch(`/api/vouchers/getorderbycode?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        reset_order()
      }
      else {
        if (!data) reset_order()
        else {
          if (data.deleted === true) {
            Util.showErrorMessage(message, 'الفاتورة محذوفة لا يمكن عرضها')
            reset_order();
            return
          }

          loadOrderData('Byid', data.id)
        }
      }
    } finally {
      fromBlurRef.current = false
    }
  };


  const getCurrencyRate = async (
    currencyId: number,
    rateDate?: string
  ): Promise<number> => {
    // ✅ Base currency
    if (currencyId === 1) return 1;

    try {
      const params = new URLSearchParams({
        currency_id: String(currencyId),
      });

      if (rateDate) {
        params.append("rate_date", rateDate);
      }

      const res = await fetch(`/api/exchangeRateByCurrency?${params.toString()}`);

      if (!res.ok) {
        console.error("Failed to fetch currency rate");
        return 1;
      }

      const data = await res.json();
      return Number(data.rate ?? 1);
    } catch (error) {
      console.error("Currency rate error:", error);
      return 1;
    }
  };


  const deleteCurrentRow = async () => {

    const grid = gridRef.current?.flex;
    const selectedIndex = grid?.selection?.row;
    CollectionView.sourceCollection.splice(selectedIndex, 1);
    CollectionView.refresh();

    if (CollectionView.items.length === 0) {
      CollectionView.sourceCollection.push({ ser: 1 });
      CollectionView.refresh();
    }
    CollectionView.sourceCollection.forEach((item, index) => {
      item.ser = index + 1;
    });
    grid.refresh();

    setTimeout(async () => {
      const lastRowIndex = CollectionView.items.length - 1;
      const itemNoColIndex = grid.columns.findIndex((col: { binding: string }) => col.binding === 'code');
      if (lastRowIndex >= 0 && itemNoColIndex >= 0) {
        grid.select(new wjGrid.CellRange(lastRowIndex, itemNoColIndex));
      }
    }, 10);
  }




  const FillItem = async (items: any[]) => {
    // Prevent edits if batch is frozen
    const grid = gridRef.current?.flex;
    if (!grid) return;

    let selectedIndexL = grid?.selection?.row;
    const lastRowIndex = CollectionView.items.length - 1;
    if (setFromExcelRef.current) {
      selectedIndexL = lastRowIndex;
    }
    for (let i = 0; i < items.length; i++) {
      const ii = items[i];
      console.log("ii ", ii)
      const index = selectedIndexL + i; // new row index
      let item = CollectionView.items[index];

      const response = await fetch(`/api/products/${ii.id}/units`);
      if (!response.ok) throw new Error("Failed to fetch units");
      const units: Unit[] = await response.json();

      // Validate price

      if (!item) {
        // Add new item
        item = {
          ser: index + 1,
          id: ii.id,
          code: ii.product_code,
          name: ii.product_name,
          barcode: ii.barcode || ii.first_barcode,
          price: (() => {
            const p = ii.price ? ii.price / state.formData.exchange_rate : NaN;
            const fallback = ii.first_price ? ii.first_price / state.formData.exchange_rate : NaN;
            return isNaN(p) ? (isNaN(fallback) ? 0 : fallback) : p;
          })(),
          unit_id: ii.unit_id,
          unit_name: ii.first_unit || ii.unit_name || ii.main_unit,
          store_id: ii.store_id ?? definitionsRef.current?.warehouses?.[0]?.id,
          store_name: ii.store_name || definitionsRef.current?.warehouses?.[0]?.warehouse_name,
          to_main_unit_qty: ii.to_main_unit_qty ?? 1,
          units: units,
          has_batch_number: ii.has_batch_number,
          batch: '',
          qnty: items.length > 1 ? 1 : '',
          bonus: '',
          amount: items.length > 1 ? (() => {
            const p = ii.price ? ii.price / state.formData.exchange_rate : NaN;
            const fallback = ii.first_price ? ii.first_price / state.formData.exchange_rate : NaN;
            return isNaN(p) ? (isNaN(fallback) ? 0 : fallback) : p;
          })() : ''

        };
        if (setFromExcelRef.current) {
          item.qnty = ii.qnty;
          item.bonus = ii.bonus;
          item.batch = ii.batch + '';
          item.price = ii.price;
          item.amount = ii.price * ii.qnty;
        }
        CollectionView.sourceCollection.push(item);
      } else {
        // Update existing item
        CollectionView.editItem(item);
        item.code = ii.product_code;
        item.ser = index + 1;
        item.id = ii.id;
        item.name = ii.product_name;
        item.unit_id = ii.unit_id;
        item.unit_name = ii.first_unit || ii.unit_name || ii.main_unit;
        item.price = setFromExcelRef.current ? ii.price : (() => {
          const p = ii.price ? ii.price / state.formData.exchange_rate : NaN;
          const fallback = ii.first_price ? ii.first_price / state.formData.exchange_rate : NaN;
          return isNaN(p) ? (isNaN(fallback) ? 0 : fallback) : p;
        })();
        item.qnty = setFromExcelRef.current ? ii.qnty : '';
        item.bonus = setFromExcelRef.current ? ii.bonus : '';
        item.store_id = ii.store_id ?? definitionsRef.current?.warehouses?.[0]?.id;
        item.store_name = ii.store_name ?? definitionsRef.current?.warehouses?.[0]?.warehouse_name;
        item.barcode = ii.barcode || ii.first_barcode;
        item.to_main_unit_qty = ii.to_main_unit_qty ?? 1;
        item.units = units;
        item.has_batch_number = ii.has_batch_number;
        item.batch = setFromExcelRef.current ? ii.batch + '' : '';
        item.qnty = setFromExcelRef.current ? ii.qnty : items.length > 1 ? 1 : '';
        item.amount = setFromExcelRef.current ? ii.qnty * ii.price : items.length > 1 ? (() => {
          const p = ii.price ? ii.price / state.formData.exchange_rate : NaN;
          const fallback = ii.first_price ? ii.first_price / state.formData.exchange_rate : NaN;
          return isNaN(p) ? (isNaN(fallback) ? 0 : fallback) : p;
        })() : ''
          , CollectionView.commitEdit();
      }
    }


    // Ensure last row is empty for new entry

    CollectionView.refresh();
    grid.refresh();
    if (setFromExcelRef.current) {
      setFromExcelRef.current = false;
    }
    // Focus last row
    setTimeout(async () => {
      //await recalculate_invoice(false);
      let lastRowIndex = selectedIndexL
      if (items.length > 1) lastRowIndex = CollectionView.items.length - 1;
      let itemNoColIndex = grid.columns.findIndex((col: { binding: string }) => col.binding === 'name');
      if (itemNoColIndex < 0) {
        itemNoColIndex = grid.columns.findIndex((col: { binding: string }) => col.binding === 'store_name');
      }
      if (itemNoColIndex < 0) {
        itemNoColIndex = grid.columns.findIndex((col: { binding: string }) => col.binding === 'qnty');
      }
      if (lastRowIndex >= 0 && itemNoColIndex >= 0) {
        grid.focus()
        grid.select(new wjGrid.CellRange(lastRowIndex, itemNoColIndex));
      }
    }, 0);
  };

  const cellEditEnded = (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => {
    const editedItem = s.rows[e.row]?.dataItem;
    const colName = s.columns[e.col]?.name;
    if (!editedItem || !colName) return;


  };



  const validateAddNewRow = (currentRow: number, grid: { focus: () => { (): any; new(): any; select: { (arg0: number, arg1: string): void; new(): any } } } | undefined) => {
    console.log("currentRow ", currentRow)
    if (currentRow >= 0) {
      const item = CollectionView.items[currentRow];
      const itemValid = item?.id;
      console.log("itemValid itemValid ", itemValid)
      if (!itemValid || (itemValid + '').trim() === '' || (itemValid + '').trim() === '0') {
        Util.showErrorToast(toast.current, 'يجب ادخال رقم الصنف');
        grid.focus();
        grid.select(currentRow, 'code');
        return false;
      }

      let quantityValid = item?.qnty;
      let bonusValid = item?.bonus;
      if (quantityValid === undefined || quantityValid === null || (quantityValid + '').trim() === '' || (quantityValid + '').trim() === '0') {
        if (bonusValid === undefined || bonusValid === null || (bonusValid + '').trim() === '' || (bonusValid + '').trim() === '0') {
          let msg = 'يجب ادخال الكمية او البونص' + ' ' + item.name;
          Util.showErrorToast(toast.current, msg);
          grid.focus();
          grid.select(currentRow, 'quantity');
          return false;
        }
      }
      let has_batch_number = item?.has_batch_number;
      if (has_batch_number === true && item?.batch + '' === '' && vch_type === 2) {
        let msg = 'يجب ادخال الرقم التشغيلي' + ' ' + data[currentRow].name;
        Util.showErrorToast(toast.current, msg);
        gridRef.current?.focus();
        gridRef.current?.select(currentRow, 'batch');
        return false;
      }
    }
    return true;
  };
  const fetchProductByCodeOrBarcode = async (value: string): Promise<Product | null> => {
    if (!value) return null;
    try {
      console.log("priceCategoryId priceCategoryId ", priceCategoryIdRef.current)
      const res = await fetch(
        `/api/inventory/products/search?query=${encodeURIComponent(value)}&priceCategoryId=${priceCategoryIdRef.current}`
      );
      console.log("res res res res res ", res)
      if (!res.ok) throw new Error('Failed to fetch product');
      const product: Product | null = await res.json();
      return product;
    } catch (err) {
      console.error('Error fetching product:', err);
      return null;
    }
  };
  const onCellEditEnded = async (grid: any, e: { row: any; col: any; data: any }) => {
    if (!grid || !grid.selection) return;
    const row = e.row;
    const col = e.col;
    const colName = grid.columns[col].binding;
    const editedValue = grid.getCellData(row, col, false);
    const oldValue = e.data;
    const price = grid.getCellData(row, 'price', false) ?? 0;
    const discount = grid.getCellData(row, 'discount', false) ?? 0;
    const qnty = grid.getCellData(row, 'qnty', false) ?? 0;
    const amount = grid.getCellData(row, 'amount', false) ?? 0;
    console.log(" row  row ", row)
    setSelectedIndex(row)
    if (colName === 'code' || colName === 'barcode') {
      console.log("value value ", editedValue)
      let code = editedValue;

      if (colName === "code") {
        code = String(editedValue);
        code = Util.adjustCode(code, 8).toUpperCase();
      }
      const product = await fetchProductByCodeOrBarcode(code);

      if (product) {
        FillItem([product])
      } else {
        Util.showErrorToast(toast.current, `لا يوجد صنف بهذا الرقم أو الباركود: ${editedValue}`);
        if (grid.activeEditor) grid.activeEditor.value = '';
        const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'code');
        grid.setCellData(row, ColIndex, oldValue, false);
        grid.focus()
        grid.select(row, 'code');
        return;
      }
    }
    if (colName === 'qnty' || colName === 'bonus') {
      if (isNaN(editedValue)) {
        Util.showErrorToast(toast.current, `يجب ادخال ارقام فقط `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        return;
      }
      if (parseFloat(editedValue) <= 0.0001) {
        Util.showErrorToast(toast.current, `يجب ادخال ارقام فقط `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        return;
      }

      /*const amount = parseFloat(editedValue) * parseFloat(price) - parseFloat(discount) - parseFloat(campaign_discount);
      const old_amount = parseFloat(oldValue) * parseFloat(price) - parseFloat(discount) - parseFloat(campaign_discount);
      if (batchNetRef.current + amount - old_amount < 0) {
        Util.showErrorToast(toastRef.current, $.strings.cashier.delete_row_error_qnty);
        s.setCellData(row, col, oldValue);
        s.refresh(true);
        return;
      }*/
      //await recalculate_invoice(false/*, discountAmountRef.current*/);
      const amount = parseFloat(editedValue) * parseFloat(price) - parseFloat(discount)
      const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'amount');
      grid.setCellData(row, ColIndex, amount);
      grid.refresh(true);
    }
    if (colName === 'price') {
      if (isNaN(editedValue)) {
        Util.showErrorToast(toast.current, `يجب ادخال ارقام فقط `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        return;
      }
      const amount = parseFloat(editedValue) * parseFloat(qnty) - parseFloat(discount)
      const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'amount');
      grid.setCellData(row, ColIndex, amount);
      grid.refresh(true);
    }
    if (colName === 'discount') {
      if (isNaN(editedValue)) {
        Util.showErrorToast(toast.current, `يجب ادخال ارقام فقط `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        return;
      }
      if (parseFloat(editedValue) > parseFloat(amount)) {
        Util.showErrorToast(toast.current, `لا يمكن ادخال خصم اكبر من المبلغ `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'discount');
        grid.setCellData(row, ColIndex, oldValue, false);
        return;
      }
      const amountVal = parseFloat(price) * parseFloat(qnty) - parseFloat(editedValue)
      const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'amount');
      grid.setCellData(row, ColIndex, amountVal, false);
      //grid.refresh(true);
    }
    if (colName === 'amount') {
      if (isNaN(editedValue)) {
        Util.showErrorToast(toast.current, `يجب ادخال ارقام فقط `);
        if (grid.activeEditor) grid.activeEditor.value = '';
        return;
      }
      if (parseFloat(qnty) > 0) {
        const price = parseFloat(editedValue) / parseFloat(qnty) - parseFloat(discount)
        const ColIndex = grid.columns.findIndex((coll: { binding: string }) => coll.binding === 'price');
        grid.setCellData(row, ColIndex, price);
        grid.refresh(true);
      }
    }

  }

  const onKeyDownGrid = (grid: any, e: KeyboardEvent) => {
    // Make sure grid and selection exist
    if (!grid || !grid.selection) return;
    if (doHotKeys.current === false) return;
    if (e.keyCode === 113) {
      e.preventDefault(); // Prevent FlexGrid from opening the editor
      return;
    }
    const sel = grid.selection;
    const row = sel.row;
    const col = sel.col;
    // Make sure row and col are valid
    if (row < 0 || col < 0) return;

    const colName = grid.columns[col]?.binding;
    const activeEditor = grid.activeEditor;
    const value = activeEditor ? activeEditor.value : '';

    const item = grid.collectionView?.items?.[row];
    const item_id = item?.id;

    if (
      colName !== 'code' &&
      colName !== 'barcode' &&
      e.keyCode !== Util.keyboardKeys.Tab &&
      e.keyCode !== Util.keyboardKeys.Enter &&
      e.keyCode !== Util.keyboardKeys.DownArrow &&
      e.keyCode !== Util.keyboardKeys.UpArrow &&
      e.keyCode !== Util.keyboardKeys.LeftArrow &&
      e.keyCode !== Util.keyboardKeys.RightArrow &&
      e.keyCode !== Util.keyboardKeys.F3 &&
      e.keyCode !== Util.keyboardKeys.Ctrl &&
      e.keyCode !== Util.keyboardKeys.F5 &&
      e.keyCode !== Util.keyboardKeys.Esc

    ) {

      if (!item_id || item_id + '' === '0') {
        toast.current?.show({
          severity: 'error',
          summary: 'خطأ',
          detail: 'يجب ادخال رقم الصنف',
          life: 1500
        });
        grid.focus();
        e.preventDefault();
      }
    }
    if (['qnty', 'bonus', 'amount', 'price', 'discount'].includes(colName)) {
      if (e.key.length === 1 && !/[0-9.]/.test(e.key)) {
        e.preventDefault();
        return;
      }
    }
    if (colName === 'amount' && parseFloat(item?.qnty) === 0) {
      e.preventDefault();
    }
    switch (e.keyCode) {
      case 121: // F10
        setSelectedIndex(row)
        if (colName === 'barcode' || colName === 'code') {
          e.preventDefault();
          popupHasCalled()
          setItemSearch(true);

        }
        if (colName === 'store_name' || colName === 'btnSearchStores') {
          e.preventDefault();
          popupHasCalled()
          setStoresSearch(true);

        }
        if (colName === 'units_name') {
          e.preventDefault();
          popupHasCalled()
          setUnitsSearch(true);

        }
        break;

      case Util.keyboardKeys.Enter:
      case Util.keyboardKeys.Tab: {
        if (row === grid.rows.length - 1 && (colName === 'amount')) {
          if (validateAddNewRow(row, grid)/* && this.state.dataObject.vch_status_id + '' !== '2' && this.state.dataObject.status !== 3*/) {
            grid.collectionView.addNew({});
            grid.collectionView.commitNew();
            grid.finishEditing(true);
            CollectionView.items[grid.rows.length - 1].ser = grid.rows.length;
            //setData(newData);

            if (grid) grid.focus();
            if (Util.getVoucherSettingScreenData(vch_type, 'barcode')) grid.select(grid.rows.length - 1, 'barcode');
            else if (Util.getVoucherSettingScreenData(vch_type, 'code')) grid.select(grid.rows.length - 1, 'code');

            e.preventDefault();
            return;
          }
          else {
            if (grid) grid.focus();
            grid.select(row, 'amount');
            e.preventDefault();
            return;
          }
        } else {
          if (grid) grid.focus();
          if (colName === 'amount') {
            if (validateAddNewRow(col)) {
              grid.select(row + 1, 'barcode');
            }
            else {
              if (grid) grid.focus();
              grid.select(row, 'amount');
              e.preventDefault();
              return;
            }

          } else if (colName === 'code') {
            if (!item_id || item_id + '' === '0') {
              e.preventDefault();
              popupHasCalled()
              searchTextRef.current = value
              setItemSearch(true);
              if (grid) grid.focus();
            }
            else grid.select(row, 'qnty');
          } else if (colName === 'store_name' || colName === 'btnSearchStores') {
            grid.select(row, 'qnty');
          }
          else {
            const colIndex = grid.columns.indexOf(grid.columns.getColumn(colName));
            moveToNextVisibleColumn(grid, row, colIndex);
          }
          e.preventDefault();
          break;
        }
      }
    }
  };

  const moveToNextVisibleColumn = (grid: { columns: any; select: (arg0: any, arg1: number) => void; focus: () => void }, row: number, colIndex: number) => {
    const cols = grid.columns;

    for (let i = colIndex + 1; i < cols.length; i++) {
      if (cols[i].visible && !cols[i].isReadOnly) {
        grid.select(row, i);
        grid.focus();
        return;
      }
    }

    // Optional: move to first visible column in next row
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].visible && !cols[i].isReadOnly) {
        grid.select(row + 1, i);
        grid.focus();
        return;
      }
    }
  };

  const getScheme = () => {
    let scheme = {
      name: 'UnitsScheme_Table',
      filter: false,
      showFooter: false,
      sortable: true,
      allowGrouping: false,
      responsiveColumnIndex: 2,
      columns: [
        {
          header: "##", name: "ser", width: 65, visible: Util.getVoucherSettingScreenData(vch_type, 'ser')
        },

        {
          header: "الحالة", name: "item_status", width: 100, visible: false,
        },
        {
          header: "الباركود", name: "barcode", width: 120, visible: Util.getVoucherSettingScreenData(vch_type, 'barcode')
        },
        {
          header: "رقم الصنف", name: "code", width: 120, maxLength: 8, visible: Util.getVoucherSettingScreenData(vch_type, 'code')
        },

        { header: "id", name: "id", width: 150, visible: false },
        {
          name: 'btnSearch',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: '',
          iconType: 'search',
          className: '',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setSelectedIndex(ctx.row.index)
            popupHasCalled()
            setItemSearch(true)
          },
          visible: true,
          visibleInColumnChooser: true
        },

        {
          header: "اسم الصنف", name: "name", width: "*", minWidth: 150, maxLength: 100
        },
        { header: "رقم المستودع", name: "store_id", width: 150, visible: false },
        { header: "المستودع", name: "store_name", width: 100, visible: Util.getVoucherSettingScreenData(vch_type, 'store') },
        {
          name: 'btnSearchStores',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: '',
          iconType: 'search',
          className: '',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setSelectedIndex(ctx.row.index)
            const rowData = ctx.item as Product;  // get the row object
            if (!rowData) return;
            popupHasCalled()
            setStoresSearch(true);                // show popup
          },
          visible: Util.getVoucherSettingScreenData(vch_type, 'store'),
          visibleInColumnChooser: true
        },
        { header: "الكمية", name: "qnty", width: 80, visible: true, maxLength: 10 },
        { header: "البونص", name: "bonus", width: 80, maxLength: 10, visible: Util.getVoucherSettingScreenData(vch_type, 'bonus') },
        { header: "الرقم التشغيلي", name: "batch", width: 150, maxLength: 30, visible: Util.getVoucherSettingScreenData(vch_type, 'batch') },
        { header: "رقم الوحدة", name: "unit_id", width: 150, visible: false },
        { header: "الوحدة", name: "unit_name", width: 80, visible: Util.getVoucherSettingScreenData(vch_type, 'unit') },
        { header: "وحدات الصنف", name: "units", width: 150, visible: false },
        { header: "العلاقة", name: "to_main_unit_qty", width: 150, visible: false },

        {
          name: 'btnSearchUnits',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: '',
          iconType: 'search',
          className: '',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            console.log("ctx ", ctx.row.index)
            setSelectedIndex(ctx.row.index)
            const rowData = ctx.item as Product;  // get the row object
            if (!rowData) return;
            setSelectedProductForUnits(rowData)
            popupHasCalled()
            setUnitsSearch(true);                // show popup
          },
          visible: true,
          visibleInColumnChooser: true
        },
        { header: "السعر", name: "price", width: 80, maxLength: 10, visible: Util.getVoucherSettingScreenData(vch_type, 'price') },
        { header: "الخصم", name: "discount", width: 80, maxLength: 10, visible: Util.getVoucherSettingScreenData(vch_type, 'discount') },
        { header: "المبلغ", name: "amount", width: 80, visible: true, maxLength: 15 },
        { header: "تاريخ الصلاحية", name: "expiry_date", width: 120, visible: false },
        { header: "has_batch_number", name: "has_batch_number", width: 150, visible: false },
        {
          name: 'btnDelete',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: '',
          iconType: 'delete',
          className: '',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => { deleteCurrentRow() },
          visible: true,
          visibleInColumnChooser: true
        },
      ],
    }
    return scheme;
  }

  const updateOrderItem = (id: string, field: keyof OrderItem, value: any) => {
    setState((prev) => ({
      ...prev,
      orderItems: prev.orderItems.map((item: { id: string }) => {
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
            updatedItem.vat_amount = (afterDiscount * updatedItem.tax_percentage) / 100
            updatedItem.total_price = afterDiscount + updatedItem.tax_amount
          }

          return updatedItem
        }
        return item
      }),
    }))
  }

  const handleCustomerSelect = (customer: any) => {
    const allowedVoucherBooks = ["L", "P", "M", "R"]
    const customerVoucherBook = customer.vch_book?.toString().trim().toUpperCase()
    const book = allowedVoucherBooks.includes(customerVoucherBook)
      ? customerVoucherBook
      : state.formData.vch_book

    setState((prev) => ({
      ...prev,
      formData: {
        ...prev.formData,
        customer_id: customer.id,
        customer_name: customer.customer_name || customer.name,
        customer_code: customer.customer_code,
        customer_address: customer.address || "",
        customer_tax_number: customer.tax_number || "",
        payment_terms: customer.payment_terms || "نقدي",
        customer_phone: customer.mobile1 || "",
        vch_book: book,
      },
      customerSearch: customer.customer_name || customer.name,
      showCustomerDropdown: false,
    }))
  }

  const handleProductSelect = (product: any, itemId: string) => {
    updateOrderItem(itemId, "product_id", product.id)
    updateOrderItem(itemId, "product_code", product.product_code)
    updateOrderItem(itemId, "product_name", product.product_name)
    updateOrderItem(itemId, "barcode", product.barcode || "")
    updateOrderItem(itemId, "unit", product.main_unit)
    updateOrderItem(itemId, "unit_price", product.selling_price || product.last_purchase_price)
    setState((prev) => ({ ...prev, showProductSearch: false, activeItemId: null }))
  }

  const selectCustomer = (customer: Customer) => {
    const allowedVoucherBooks = ["L", "P", "M", "R"]
    const customerVoucherBook = (customer as any).vch_book?.toString().trim().toUpperCase()
    const book = allowedVoucherBooks.includes(customerVoucherBook)
      ? customerVoucherBook
      : undefined

    setState((prev) => ({
      ...prev,
      formData: {
        ...prev.formData,
        customer_id: customer.id,
        customer_name: customer.customer_name,
        customer_code: customer.customer_code,
        customer_address: customer.address || "",
        customer_tax_number: customer.tax_number || "",
        payment_terms: customer.payment_terms || "نقدي",
        customer_phone: customer.mobile1 || "",
        ...(book ? { vch_book: book } : {}),
      },
      customerSearch: customer.customer_name,
      showCustomerDropdown: false,
    }))
  }

  const selectProduct = (product: Product, itemId: string) => {
    updateOrderItem(itemId, "product_id", product.id)
    updateOrderItem(itemId, "product_code", product.product_code)
    updateOrderItem(itemId, "product_name", product.product_name)
    updateOrderItem(itemId, "barcode", product.barcode || "")
    updateOrderItem(itemId, "unit", product.main_unit)
    updateOrderItem(itemId, "unit_price", product.selling_price || product.last_purchase_price)

    setState((prev) => ({ ...prev, showProductDropdown: false }))
  }

  const [cvVersion, setCvVersion] = useState(0);
  useEffect(() => {
    if (!CollectionView) return;

    const onChanged = () => {
      setCvVersion(v => v + 1); // 🔥 force React re-render
    };

    CollectionView.collectionChanged.addHandler(onChanged);

    return () => {
      CollectionView.collectionChanged.removeHandler(onChanged);
    };
  }, [CollectionView]);

  const calculateItemTotal = (item: OrderItem) => {
    const subtotal = item.quantity * item.unit_price
    const discountAmount = (subtotal * item.discount_percentage) / 100
    const afterDiscount = subtotal - discountAmount
    const taxAmount = (afterDiscount * item.vat_percent) / 100
    return afterDiscount + taxAmount
  }
  type OrderItemType = {
    qnty: number;
    price: number;
    discount: number;
    [key: string]: any; // allow other props
  };
  const totals = useMemo(() => {
    // Safely get items from CollectionView
    const items: OrderItemType[] = (CollectionView?.items as OrderItemType[]) ?? [];

    // Calculate subtotal
    const subtotal = items.reduce((sum: number, item: OrderItemType) => {
      const quantity = Number(item.qnty ?? 0);
      const price = Number(item.price ?? 0);
      const discount = Number(item.discount ?? 0);
      return sum + quantity * price - discount;
    }, 0);
    if (!state.formData.discount_amount) state.formData.discount_amount = 0.0;
    // Calculate discount
    const discountValue = parseFloat(state.formData.discount_amount ?? 0);
    const discount =
      state.formData.discount_type === "percentage"
        ? (subtotal * discountValue) / 100
        : discountValue;
    // Calculate tax
    const taxPercentage = parseFloat(state.formData.vat_percent ?? 0);
    const tax = ((subtotal - discount) * taxPercentage) / 100;
    // Shipping and other charges
    const shippingCost = parseFloat(state.formData.shipping_cost ?? 0);
    const otherCharges = parseFloat(state.formData.other_charges ?? 0);
    // Calculate total
    const total = subtotal - discount + tax + shippingCost + otherCharges;

    return {
      subtotal,
      discount,
      tax,
      total,
    };
  }, [
    cvVersion,
    state.formData.discount_type,
    state.formData.discount_amount,
    state.formData.vat_percent,
    state.formData.shipping_cost,
    state.formData.other_charges,
    CollectionView?.items,
  ]);


  const validateOrder = () => {
    message.current?.clear()
    console.log("state.formData ", state.formData)
    if (!state.formData.order_number) {
      Util.showErrorMessage(message, 'رقم الفاتورة فارغ لا يمكن الاستمرار')
      return false
    }
    if (state.formData.currency_id === 0) {
      Util.showErrorMessage(message, 'يجب تحديد العملة')
      return false
    }
    if (state.formData.exchange_rate <= 0) {
      Util.showErrorMessage(message, 'يجب ادخال سعر الصرف')
      return false
    }

    if (state.formData.customer_id === 0) {
      Util.showErrorMessage(message, 'يجب ادخال الزبون')
      return false
    }
    if (!state.formData.customer_name.trim()) {
      Util.showErrorMessage(message, 'يجب ادخال اسم الزبون')
      return false
    }
    if (CollectionView.items.length === 0 || !CollectionView?.items[0]?.id) {
      Util.showErrorMessage(message, 'يجب ادخال صنف واحد على الأقل')
      return false
    }
    if (Number(totals.total) < 0) {
      Util.showErrorMessage(message, 'مجموع الفاتورة غير منطقي يرجى التأكد من المدخلات')
      return false
    }
    // Assuming collectionView is your CollectionView instance
    const items = CollectionView.items;
    const usedBatches = new Set<string>();
    let isValid = true;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Skip items with id <= 0
      if (!item.id || item.id && item.id <= 0) continue;
      // Check quantity or bonus
      const qty = Number(item.qnty) || 0;
      const bonus = Number(item.bonus) || 0;
      if (qty <= 0 && bonus <= 0) {
        Util.showErrorMessage(message, 'يوجد اصناف لم يتم ادخال الكمية او البونص لها')
        return false
      }

      // Check discount not greater than amount
      const amount = Number(item.amount) || 0;
      const discount = Number(item.discount) || 0;
      if (discount > amount) {
        Util.showErrorMessage(message, 'مبلغ الخصم اكبر من مبلغ الصنف ' + item.name)
        return false
      }
      if (item.has_batch_number && (!item.batch || item.batch === '') && vch_type === 2) {
        Util.showErrorMessage(message, 'يجب ادخال الرقم التشغيلي للصنف ' + item.name)
        return false
      }

      if (item.has_batch_number && item.batch) {
        const batchNo = item.batch.toString().trim();

        if (usedBatches.has(batchNo)) {
          Util.showErrorMessage(
            message,
            'يوجد رقم تشغيلي مكرر مع اكثر من صنف : ' + batchNo
          );
          return false;
        }

        usedBatches.add(batchNo);
      }
    }

    return true;
  }
  interface PrintSettings {
    pageType?: "custom" | "A4";
    width?: string;   // e.g., '210mm'
    height?: string;  // e.g., '297mm'
  }

  const printOrder = async (order: any, items: any[], settings: PrintSettings = {}, showMsg = false) => {

    if (showMsg) {

      // Build query params based on whether it's purchase or sale order
      const params = new URLSearchParams({

        order_id: state.formData.id?.toString() || "0",
      });


      const response = await fetch(`/api/vouchers/check-printed-order?${params.toString()}`);
      const data = await response.json();

      if (data.exists) {
        // Show confirmation dialog for duplicate
        setShowPrintRefConfirm(true)
        return;
      }



    }

    setLoading(true)
    const { pageType = "custom", width = "120mm", height = "100mm" } = settings;

    const html = `
    <html>
      <head>
        <title>Order ${order.order_number}</title>
        <style>
          @media print {
            @page {
              margin: 0; /* remove browser header/footer */
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
            }
            .order-page {
              page-break-after: always;
            }
          }

          .order-page {
            width: ${pageType === "custom" ? width : "120mm"};
            min-height: ${pageType === "custom" ? height : "100mm"};
            padding: 20px;
            box-sizing: border-box;
          }

          .header {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 16px;
            font-weight: bold;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            border: 3px solid black;
          }

          th, td {
            border: 2px solid black;
            padding: 6px 8px;
            font-size: 20px;
          }

          th {
            text-align: left;
          }

          /* column widths */
          .col-index { width: 10%; }
          .col-item { width: 70%; }
          .col-quantity { width: 20%; text-align: center; }

          .notes {
            margin-top: 20px;
            font-size: 16px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="order-page">
          <div class="header">
            <div>Reference: ${order.reference_number}</div>
            <div></div>
          </div>
          <div class="header">
          <div>Date: ${order.order_date}</div>
            <div>Order No: ${order.customer_order_no}</div>
            
          </div>
          <div class="header">
            <div>Name: ${order.customer_name}</div>
            <div>Received By: ${order.received_by || ""}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="col-index">#</th>
                <th class="col-item">Item & No.</th>
                <th class="col-quantity">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, idx) => `
                <tr>
                  <td class="col-index">${idx + 1}</td>
                  <td class="col-item">${item.name}</td>
                  <td class="col-quantity">${item.quantity + (item.bonus || 0)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="notes">
            Notes: ${order.general_notes || ""}
          </div>
        </div>
      </body>
    </html>
  `;

    // Get saved user
    const savedUser = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user");
    if (!savedUser) return;
    const user = JSON.parse(savedUser);
    if (!user?.id) return;

    // Update printed status in backend
    console.log("order order ", order)
    await fetch(`/api/vouchers/sales/${order.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
      },
      body: JSON.stringify({ printed: 1 }),
    });

    // Use iframe to print without opening about:blank
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    document.body.removeChild(iframe);
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, printed: 1 },
    }))
    setLoading(false)
    setTimeout(() => {
      referenceNumberRef.current?.focus();
    }, 1000)
  };

  async function handleSaveOrder(orderToSave: any, isNewRecord: boolean): Promise<void> {

    // ✅ HARD LOCK FIRST
    if (isSaving.current) return;
    isSaving.current = true;

    try {
      console.log("[v0] Starting save process...");

      if (!validateOrder()) return;

      const savedUser =
        localStorage.getItem("erp_user") ||
        sessionStorage.getItem("erp_user");

      if (!savedUser) {
        Util.showErrorMessage(message, "المستخدم غير معرف يرجى تسجيل الدخول من جديد");
        return;
      }

      const user = JSON.parse(savedUser);

      if (!user?.id) {
        Util.showErrorMessage(message, "المستخدم غير معرف يرجى تسجيل الدخول من جديد");
        return;
      }

      const orderData = {
        id: state.formData.id,
        order_number: state.formData.order_number,
        order_date: state.formData.order_date,
        customer_id: state.formData.customer_id,
        customer_name: state.formData.customer_name,
        customer_phone: state.formData.customer_phone,
        salesman_id: state.formData.salesman || null,
        currency_id: state.formData.currency_id || 0,
        exchange_rate: state.formData.exchange_rate || 1.0,
        delivery_date: state.formData.delivery_date
          ? new Date(state.formData.delivery_date).toISOString()
          : null,
        discount_amount: totals.discount,
        discount_type: state.formData.discount_type === "percentage" ? 1 : 2,
        vat_amount: totals.tax,
        vat_percent: state.formData.vat_percent,
        total_amount: totals.total,
        order_type: vch_type ?? 5,
        reference_number: state.formData.reference_number,
        reference_number_date: state.formData.reference_number_date
          ? new Date(state.formData.reference_number_date).toISOString()
          : (state.formData.order_date ? new Date(state.formData.order_date).toISOString() : null),
        order_status: state.formData.order_status || 1,
        order_status2: state.formData.order_status2 || 1,
        delivery_address: state.formData.delivery_address || "",
        shipping_cost: state.formData.shipping_cost || 0,
        other_charges: state.formData.other_charges || 0,
        general_notes: state.formData.general_notes || "",
        internal_notes: state.formData.internal_notes || "",
        delivery_notes: state.formData.delivery_notes || "",
        received_by: state.formData.received_by || "",
        customer_order_no: state.formData.customer_order_no || "",
        tax_classification: Number(state.formData.tax_classification || 1),
        invoice_type: Number(state.formData.invoice_type || 1),
        exported_sales: !!state.formData.exported_sales,
        is_offset: !!state.formData.is_offset,
        offset_code: state.formData.is_offset
          ? Number(state.formData.offset_code || 1)
          : null,
        user_id: user.id,
      };

      const items = CollectionView.items.map((item) => ({
        product_id: item.id,
        product_name: item.name,
        quantity: Number(item.qnty) || 0,
        price: Number(item.price) || 0,
        bonus: Number(item.bonus) || 0,
        discount: Number(item.discount) || 0,
        barcode: item.barcode || null,
        unit_id: item.unit_id,
        store_id: item.store_id,
        delivered_quantity: 0,
        expiry_date: item.expiry_date || null,
        batch_number: item.batch || null,
        item_status: item.item_status,
        name: item.name,
      }));

      const response = await fetch("/api/vouchers/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ orderData, items }),
      });

      if (!response.ok) {
        const responseText = await response.text();

        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: `HTTP ${response.status}: ${responseText}` };
        }

        Util.showErrorMessage(
          message,
          errorData.error || "فشل في حفظ فاتورة المبيعات"
        );
        return;
      }

      const result = await response.json();

      const id = result.id;

      const orderDataBackup = {
        ...state.formData,
        id,
      };

      const itemsBackup = items.map((item) => ({ ...item }));

      Util.showSuccessMessage(message);
      lastVchBook.current = state.formData.vch_book;
      popupHasCalled();
      setAlertMessage("هل تريد طباعة الفاتورة؟");

      setState((prev) => ({
        ...prev,
        FormDataBackup: orderDataBackup,
      }));

      CollectionViewBackupRef.current = itemsBackup;
      setShowAlert(true);

      reset_order();

    } finally {
      // ✅ ALWAYS RELEASE LOCK
      isSaving.current = false;
    }
  }

  const handleDeleteClick = (checkUnsaved: any) => {
    let newFormData = {
      order_date: state.formData.order_date,
      customer_id: state.formData.customer_id,
      customer_name: state.formData.customer_name,

      currency_id: state.formData.currency_id,
      exchange_rate: state.formData.exchange_rate,
      //total: totals.total,
    };
    const currentHash = getFormDataHash(newFormData);
    if (checkUnsaved === true && currentHash !== initialHash.current) {
      setShowUnsaved(true)
      return
    }

    if (!state.formData.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'تنبيه',
        detail: 'لا توجد فاتورة لحذفها',
        life: 3000
      });
      return;
    }
    message.current?.clear();
    if (state.formData.is_exported) {
      Util.showErrorMessage(message, "الفاتورة مرحلة الى النظام المحاسبي لن تتم عملية الحذف");

      //Util.showInfoToast(toast.current, "الطلبية مرحلة الى النظام المحاسبي لن تتم عملية الحفظ");
      return;
    }
    setShowConfirm(true);
    popupHasCalled()
  };

  const confirmDelete = React.useCallback(async () => {
    console.log("CONFIRM CLICKED");

    setShowConfirm(false);
    popupHasClosed();

    if (isDeleting.current) return;
    isDeleting.current = true;

    try {
      await handleDeleteOrder(state.formData);
    } finally {
      isDeleting.current = false;
    }
  }, [state.formData]);
  async function handleDeleteOrder(orderToDelete: SalesOrder): Promise<void> {
    if (!state.formData || !state.formData.id) {
      throw new Error("لا توجد فاتورة محددة للحذف")
    }
    const savedUser = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user")
    if (!savedUser) {
      Util.showErrorMessage(message, 'المستخدم غير معرف يرجى تسجيل الدخول من جديد')
      return
    }
    const user = JSON.parse(savedUser)
    if (!user || !user.id) {
      Util.showErrorMessage(message, 'المستخدم غير معرف يرجى تسجيل الدخول من جديد')
      return
    }
    setLoading(true)

    const response = await fetch(`/api/vouchers/sales/${state.formData.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id, // <-- هنا تمرر user_id
      },
    });
    if (!response.ok) {
      setLoading(false)
      throw new Error("فشل في حذف الفاتورة")
    }
    Util.showSuccessMessage(message, 'تم حذف الفاتورة بنجاح ✅')
    reset_order()
    setLoading(false)


  }

  // Handle navigation for UniversalToolbar
  const handleNavigate = (direction: "first" | "previous" | "next" | "last") => {
    switch (direction) {
      case "first":
        goToFirst()
        break
      case "previous":
        goToPrevious()
        break
      case "next":
        goToNext()
        break
      case "last":
        goToLast()
        break
      default:
        break
    }
  }


  const handleSave = async () => {
    if (isHandlingSave.current) return;
    isHandlingSave.current = true;
    message.current?.clear();

    if (state.formData.is_exported) {
      Util.showErrorMessage(message, "الفاتورة مرحلة الى النظام المحاسبي لن تتم عملية الحفظ");

      //Util.showInfoToast(toast.current, "الطلبية مرحلة الى النظام المحاسبي لن تتم عملية الحفظ");
      return;
    }
    setState((prev) => ({ ...prev, isSaving: true }))
    try {
      // Check if it's an existing order or a new one
      const isNewRecord = !state.formData.id

      // Call the saveRecord from useRecordNavigation hook
      // We need to construct a minimal SalesOrder object for saveRecord
      const currentOrderForNavigation = {
        ...createNewOrder(), // Start with a fresh object
        id: state.formData.id || 0, // Use current ID if exists, otherwise 0
        order_number: state.formData.order_number,
        order_date: state.formData.order_date,
        customer_name: state.formData.customer_name,
        customer_id: state.formData.customer_id || 0,
        total_amount: totals.total,
        order_status: state.formData.order_status,
        order_status2: state.formData.order_status2,
        financial_status: state.formData.financial_status,
        delivery_date: state.formData.delivery_date ? new Date(state.formData.delivery_date) : new Date(),
        salesman: state.formData.salesman,
        currency_id: state.formData.currency_id,
        exchange_rate: state.formData.exchange_rate,
        notes: state.formData.notes,
        // Add other relevant fields if needed by useRecordNavigation for its save logic
      }

      await handleSaveOrder(currentOrderForNavigation, isNewRecord)
      //alert("تم حفظ الطلبية بنجاح")

      // After successful save, update the state with the latest data if it was a new record
      /*if (isNewRecord) {
        // If the save operation returns the saved data, update formData accordingly
        // For now, we assume saveRecord implicitly updates the navigation state and potentially returns the saved data.
        // If not, we might need to re-fetch or update state based on API response.
        // A common pattern is that saveRecord might return the saved item, which then needs to be used to update state.
        // For simplicity here, we'll rely on the onOrderSaved callback.
        if (onOpenChange) {
          onOpenChange(false)
        } else {
          onCancel()
        }
      } else {
        // If it was an existing record, we might want to keep the dialog open or refresh data.
        // For now, we assume the onOrderSaved callback handles further actions.
      }*/
    } catch (err: any) {
      console.error("Error saving sales order:", err)
      alert(err.message || "حدث خطأ أثناء حفظ البيانات")
    } finally {
      setState((prev) => ({ ...prev, isSaving: false }))
      isHandlingSave.current = false;
    } 
  }
  

  const handleDelete = async () => {
    message.current?.clear();
    if (state.formData.is_exported) {
      Util.showErrorMessage(message, "الفاتورة مرحلة الى النظام المحاسبي لن تتم عملية الحذف");

      //Util.showInfoToast(toast.current, "الطلبية مرحلة الى النظام المحاسبي لن تتم عملية الحفظ");
      return;
    }
    setState((prev) => ({ ...prev, isDeleting: true }))
    try {
      // The deleteRecord from useRecordNavigation hook handles the deletion logic
      // It expects the currentRecord to be passed or it uses the internally tracked current record.
      await deleteRecord()
      alert("تم حذف الفاتورة بنجاح")

      // Close the dialog after deletion
      if (onOpenChange) {
        onOpenChange(false)
      } else {
        onCancel()
      }
    } catch (err: any) {
      console.error("Error deleting sales order:", err)
      alert(err.message || "حدث خطأ أثناء حذف البيانات")
    } finally {
      setState((prev) => ({ ...prev, isDeleting: false }))
    }
  }

  const handleClone = async () => {
    if (!state.formData) return;

    setLoading(true);
    const order_num = await generateOrderNumber()
    try {
      // 1️⃣ Clone the form data
      const clonedFormData = {
        ...state.formData,
        id: 0, // reset ID to insert as new order
        order_number: order_num, // generate new number
        order_date: new Date().toISOString().split("T")[0], // today
        delivery_date: new Date().toISOString().split("T")[0], // today
        reference_number_date: new Date().toISOString().split("T")[0], // today
        printed: 0,
        is_exported: 0,
        exported_sales: false,
      };

      // 2️⃣ Reset any collection views/items if needed
      // For example: clonedFormData.items = [];

      // 3️⃣ Update state
      setState((prev) => ({
        ...prev,
        formData: clonedFormData,
      }));

      // 4️⃣ Focus on first input (order date)
      setTimeout(() => referenceNumberRef.current?.focus(), 50)
    } catch (err) {
      console.error("Failed to clone order:", err);
    } finally {
      setLoading(false);
    }
  };

  const popupHasCalled = () => {
    doHotKeys.current = false
  };
  const popupHasClosed = () => {
    doHotKeys.current = true

  };

  const closeCustomerSearchPopup = (focusCustomerName = true) => {
    const grid: any = gridRef.current;

    try {
      if (grid?.finishEditing) {
        grid.finishEditing(false);
      }
    } catch (error) {
      console.error("Failed to finish grid editing before closing customer search:", error);
    }

    popupHasClosed();
    setShowCustomerSearch(false);

    if (focusCustomerName) {
      setTimeout(() => {
        customerNameRef.current?.focus();
      }, 0);
    }
  };

  const openOrderSearchPopup = () => {
    popupHasCalled()
    setShowOrderSearch(true)
  }

  const openCustomerSearchPopup = () => {
    popupHasCalled()
    setShowCustomerSearch(true)
  }

  const selectedCustomerBalance = useMemo(() => {
    const selectedCustomer = state.customers.find((customer) =>
      Number(customer.id) === Number(state.formData.customer_id),
    )
    return Number(selectedCustomer?.credit_limit ?? 0)
  }, [state.customers, state.formData.customer_id])

  const refocusDropdownInput = (inputId: string) => {
    setTimeout(() => {
      const element = document.getElementById(inputId) as HTMLElement | null
      element?.focus()
    }, 0)
  }

  const focusReferenceThenNext = () => {
    setTimeout(() => {
      const current = referenceNumberRef.current
      if (!current) return

      current.focus()
      current.select?.()

      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null)

      const index = focusable.indexOf(current)
      if (index !== -1) {
        const next = focusable[index + 1] || focusable[0]
        next.focus()
        if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
          next.select()
        }
      }
    }, 50)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!doHotKeys.current) return;

      if (e.key === "Enter" && skipNextEnterRef.current) {
        e.preventDefault();
        e.stopPropagation();
        skipNextEnterRef.current = false;
        return;
      }

      if (e.key === "Enter" && Date.now() < suppressEnterUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (e.key === "Enter") {
        // Allow Enter in textarea
        if (tag === "TEXTAREA") return;

        e.preventDefault();

        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>(
            'input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null); // visible only

        const index = focusable.indexOf(document.activeElement as HTMLElement);

        if (index !== -1) {
          const next = focusable[index + 1] || focusable[0]; // 🔁 loop
          next.focus();
          next.select?.(); // auto-select text if input
        }
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();

        // Blur the active element to commit any input changes
        (document.activeElement as HTMLElement)?.blur();

        // Now state has the latest values from all inputs
        handleSave();
      }

      if (e.key === "F4") {
        e.preventDefault();
        handleDelete();
      }

      if (e.key === "ESC") {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "F12" && e.ctrlKey) {


        e.preventDefault();
        importOrderFromExcel(true);
        // Create a hidden input element to open file picker

      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [doHotKeys, handleSave, handleDelete, close]);

  const importOrderFromExcel = (checkUnsaved = true) => {

    let newFormData = {
      order_date: state.formData.order_date,
      customer_id: state.formData.customer_id,
      customer_name: state.formData.customer_name,
      delivery_date: state.formData.delivery_date,
      currency_id: state.formData.currency_id,
      exchange_rate: state.formData.exchange_rate,
      //total: totals.total,
    };
    const currentHash = getFormDataHash(newFormData);
    if (checkUnsaved && currentHash !== initialHash.current && initialHash.current != 0) {
      setShowUnsaved(true);
      setNextFunction(() =>
        () => importOrderFromExcel(false)
      );
      return;
    }
    reset_order();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls"; // Only Excel files
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        handleImportExcel(file); // Your function to read Excel and populate collectionView
      }
    };
    input.click();
  }
  const handleImportExcel = async (file: File) => {
    try {
      setLoading(true);
      setFromExcelRef.current = true
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows || rows.length === 0) {
        alert("الملف فارغ أو لا يحتوي على بيانات صالحة");
        return;
      }

      const importedProducts = await Promise.all(
        rows.map(async (row) => {
          const codeOrBarcode = row["رقم الصنف"] || row["barcode"] || row["code"];
          if (!codeOrBarcode) return null;

          const product = await fetchProductByCodeOrBarcode(codeOrBarcode);
          if (!product) {
            console.warn(`المنتج غير موجود: ${codeOrBarcode}`);
            return null;
          }

          // Update fields from Excel
          product.price = row["السعر"] || row["price"] || row["Price"] || product.price;
          product.qnty = row["الكمية"] || row["quantity"] || row["qnty"] || 1;
          product.bonus = row["البونص"] || row["بونص"] || row["bonus"] || 0;
          product.batch = row["الرقم التشغيلي"] || row["batch"] || '';
          return product;
        })
      );

      // Filter out nulls (products not found)
      const validProducts = importedProducts.filter((p): p is Product => p !== null);
      // Fill items into CollectionView
      if (validProducts.length > 0) {
        FillItem(validProducts);

      }
      // Update CollectionView
      //collectionView.sourceCollection = products;

    } catch (err) {
      console.error("خطأ أثناء استيراد Excel:", err);
      alert("حدث خطأ أثناء قراءة ملف Excel.");
    }
    finally {
      setLoading(false);

    }
  };
  const filteredCustomers = state.customers.filter(
    (customer) =>
      customer.customer_name.toLowerCase().includes(state.customerSearch.toLowerCase()) ||
      customer.customer_code.toLowerCase().includes(state.customerSearch.toLowerCase()),
  )
  const initialHash = useRef(0);
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  };
  const getFormDataHash = (data: any) => {
    return hashCode(JSON.stringify(data));
  };
  const [currentOrderId, setCurrentOrderId] = useState<number>(0);
  const loadOrderData = async (
    navigationType: "first" | "previous" | "next" | "last" | "Byid" | "ByCode",
    orderId?: number,
    orderCode?: string,
    checkUnsaved: boolean = true
  ) => {
    setLoading(true)
    let newFormData = {
      order_date: state.formData.order_date,
      customer_id: state.formData.customer_id,
      customer_name: state.formData.customer_name,
      delivery_date: state.formData.delivery_date,
      currency_id: state.formData.currency_id,
      exchange_rate: state.formData.exchange_rate,
      //total: totals.total,
    };
    const currentHash = getFormDataHash(newFormData);
    console.log("loadOrderData currentHash ", currentHash, " initialHash ", initialHash.current)
    if (checkUnsaved && currentHash !== initialHash.current && initialHash.current != 0) {
      setShowUnsaved(true);
      setNextFunction(() =>
        () => loadOrderData(navigationType, orderId, orderCode, false)
      );
      return;
    }

    try {
      /*if (!hasPermission("orders-view")) {
        toast.current?.show({
          severity: "error",
          detail: "لا يوجد لديك صلاحية عرض الطلبيات",
          life: 3000,
        });
        return;
      }*/

      const url = new URL(
        `/api/vouchers/navigation/${navigationType}`,
        location.origin
      );
      url.searchParams.set("currentId", state.formData.order_number.toString());
      url.searchParams.set("vch_book", state.formData.vch_book.toString());
      url.searchParams.set("order_type", vch_type?.toString() ?? "3");
      // ---- navigation params ----
      if (navigationType === "Byid" && orderId) {
        url.searchParams.set("id", String(orderId));
      }

      if (navigationType === "ByCode" && orderCode) {
        url.searchParams.set("order_number", orderCode);
      }


      const res = await fetch(url.toString());
      const order = await res.json();
      if (!order?.id || order.id === currentOrderId) {
        const isStartBoundary = navigationType === "previous" || navigationType === "first"
        const boundaryText = isStartBoundary ? "بداية السجلات" : "نهاية السجلات"
        const boundaryHint = isStartBoundary ? "لا توجد فواتير أقدم" : "لا توجد فواتير أحدث"

        toast.current?.show({
          severity: "warn",
          summary: boundaryText,
          detail: boundaryHint,
          life: 2600,
          className: "!border-0 !shadow-xl !rounded-xl !bg-gradient-to-l !from-amber-50 !to-orange-50",
        })

        setLoading(false)
        return;
      }

      // ---- map items, payments, etc if needed ----
      const mappedOrder = {
        ...order,
        items: order.items ?? [],
        payments: order.payments ?? [],
      };
      console.log("order ", order)
      function toLocalDateString(dateStr: string) {
        const date = new Date(dateStr);
        const offset = date.getTimezoneOffset() * 60000; // convert offset to ms
        const localDate = new Date(date.getTime());
        return localDate.toISOString().split("T")[0]; // "YYYY-MM-DD"
      }

      // Usage
      const onlyOrderDate = toLocalDateString(order.order_date);
      const onlyDeliveryDate = toLocalDateString(order.delivery_date);
      const onlyReferenceNumberDate = order.reference_number_date
        ? toLocalDateString(order.reference_number_date)
        : onlyOrderDate;

      setState((prev) => ({
        ...prev,
        formData: {
          ...prev.formData,
          ...order,
          order_date: onlyOrderDate, // only date part
          delivery_date: onlyDeliveryDate,
          reference_number_date: onlyReferenceNumberDate,
          exported_sales: Boolean(order.exported_sales),
          vch_book: mappedOrder.vch_book || prev.formData.vch_book || "R",
          salesman: mappedOrder.salesman_id ? mappedOrder.salesman_id : "-1",
          discount_type: mappedOrder.discount_type === 1 ? "percentage" : "amount",
          discount_amount: mappedOrder.discount_type === 1 ? Number(mappedOrder.discount_amount) * 100 / (Number(mappedOrder.total_amount) + Number(mappedOrder.discount_amount) - Number(mappedOrder.vat_amount)) : mappedOrder.discount_amount
        },

      }));
      priceCategoryIdRef.current = mappedOrder.pricecategory

      if (mappedOrder.items?.length) {
        let ser = 1;
        const updatedItems = mappedOrder.items.map((item: any) => ({
          ...item,
          id: item.product_id,
          item_id: item.product_id,
          name: item.product_name,
          price: item.price,
          discount: item.discount,
          qnty: item.quantity,
          bonus: item.bonus,
          ser: ser++,
          unit_name: item.unit_name, // you might want actual unit name instead of ID
          amount: item.quantity * item.price - item.discount,
          batch: item.batch_number,
          unit_id: item.unit_id,
          store_id: item.store_id,
          store_name: item.store_name,
          units: item.units
        }));

        CollectionView.sourceCollection = updatedItems;
        CollectionView.refresh();
      }


      let newFormData = {
        order_date: mappedOrder.order_date,
        customer_id: mappedOrder.customer_id,
        customer_name: mappedOrder.customer_name,
        delivery_date: mappedOrder.delivery_date,
        currency_id: mappedOrder.currency_id,
        exchange_rate: mappedOrder.exchange_rate,
        //total: Number(mappedOrder.total_amount),
      };
      const newHash = getFormDataHash(newFormData);
      console.log("newFormData ", newFormData)
      initialHash.current = newHash;

      setCurrentOrderId(order.id);
    } catch (err) {
      console.error("loadOrderData error:", err);
    }
    finally {
      setLoading(false)
      setTimeout(() => {
        referenceNumberRef.current?.focus();
      }, 50)

    }
  };

  // Redefine handleNew to match the expected signature for UniversalToolbar
  const handleNewRecord = (checkUnsaved: any) => {

    let newFormData = {
      order_date: state.formData.order_date,
      customer_id: state.formData.customer_id,
      customer_name: state.formData.customer_name,
      delivery_date: state.formData.delivery_date,
      currency_id: state.formData.currency_id,
      exchange_rate: state.formData.exchange_rate,
      //total: totals.total,
    };
    const currentHash = getFormDataHash(newFormData);
    if (checkUnsaved === true && currentHash !== initialHash.current) {
      setShowUnsaved(true)
      setNextFunction(() => () => reset_order());
      return
    }
    setEditingOrder?.(null)
    // Reset form state to initial values for a new order
    reset_order()
  }

  const reset_order = () => {
    setLoading(true)
    setState((prev) => ({
      ...prev, // Keep existing states like customers, products etc.
      formData: { ...initialFormData, vch_book: lastVchBook.current || initialFormData.vch_book },
      customerSearch: "",
      activeTab: "basic", // Reset to basic tab
      showCustomerSearch: false,
      showProductSearch: false,
      activeItemId: null,
      showLotSelector: false,
      selectedProductForLots: null,
      selectedItemIdForLots: null,
    }))
    CollectionView.sourceCollection.splice(0);
    CollectionView.refresh();
    const newRow = { ser: 1 };
    CollectionView.sourceCollection.push(newRow);
    CollectionView.refresh();
    setTimeout(() => {
      focusGrid()
    }, 10)
    console.log("initialFormData before reset ", initialFormData)
    generateOrderNumber()
    setLoading(false)
    const orderDate = new Date(initialFormData.order_date ?? new Date());

    console.log("initialFormData ", initialFormData)
    let newFormData = {
      order_date: initialFormData.order_date,
      customer_id: initialFormData.customer_id,
      customer_name: initialFormData.customer_name,
      delivery_date: initialFormData.delivery_date,
      currency_id: initialFormData.currency_id,
      exchange_rate: initialFormData.exchange_rate,
      //total: 0
    };
    const currentHash = getFormDataHash(newFormData);
    initialHash.current = currentHash;

    setTimeout(() => {
      referenceNumberRef.current?.focus();
    }, 50)
    setCurrentOrderId(0)
    priceCategoryIdRef.current = 1
  }
  const focusGrid = () => {
    const grid = gridRef.current?.flex;
    if (!grid) return;
    setTimeout(() => {
      const lastRowIndex = CollectionView.items.length - 1;
      const itemNoColIndex = grid.columns.findIndex((col: { binding: string }) => col.binding === 'code');
      if (lastRowIndex >= 0 && itemNoColIndex >= 0) {
        grid.select(new wjGrid.CellRange(lastRowIndex, itemNoColIndex));
      }
    }, 100);
  }
  const handleCancel = () => {
    // Reset form state
    setState((prev) => ({
      ...prev, // Keep existing states like customers, products etc.
      formData: initialFormData,
      customerSearch: "",
      activeTab: "basic", // Reset to basic tab
    }))

    if (onOpenChange) {
      onOpenChange(false)
    } else {
      onCancel()
    }
  }

  const handleLotSelection = (itemId: string, productId: number, productName: string, quantity: number) => {
    const product = state.products.find((p) => p.id === productId)
    if (!product) return

    setState((prev) => ({
      ...prev,
      showLotSelector: true,
      selectedProductForLots: product,
      selectedItemIdForLots: itemId,
    }))
  }

  const handleLotsSelected = (selectedLots: any[]) => {
    if (!state.selectedItemIdForLots) return

    const itemId = state.selectedItemIdForLots

    // Update the item with lot information
    if (selectedLots.length > 0) {
      const firstLot = selectedLots[0]
      updateOrderItem(itemId, "lot_id", firstLot.lot_id)
      updateOrderItem(itemId, "expiry_date", firstLot.expiry_date || "")
      updateOrderItem(itemId, "batch_number", firstLot.lot_number || "")
      updateOrderItem(itemId, "unit_price", firstLot.unit_cost || 0)

      // If multiple lots, store the allocation info
      if (selectedLots.length > 1) {
        updateOrderItem(itemId, "notes", `متعدد الدفعات: ${selectedLots.map((l) => l.lot_number).join(", ")}`)
      }

      // Store lot allocation data for later use
      setState((prev) => ({
        ...prev,
        orderItems: prev.orderItems.map((item: { id: string }) =>
          item.id === itemId ? { ...item, lotAllocations: selectedLots } : item,
        ),
      }))
    }

    setState((prev) => ({
      ...prev,
      showLotSelector: false,
      selectedProductForLots: null,
      selectedItemIdForLots: null,
    }))
  }

  const handleReport = () => {
    setShowReport(true)
  }

  const handleExportExcel = async () => {
    setShowReport(true)
  }

  const handlePrint = (showMsg = true) => {
    printOrder(state.formData, CollectionView.items, {}, showMsg)
  }

  const reportColumns = [
    { key: "order_number", label: "رقم الفاتورة", width: "120px" },
    { key: "order_date", label: "التاريخ", width: "100px" },
    { key: "customer_name", label: "اسم الزبون", width: "200px" },

    { key: "total_amount", label: "المبلغ", width: "100px" },
    { key: "salesman", label: "المندوب", width: "120px" },
    { key: "delivery_date", label: "تاريخ التسليم", width: "120px" },
  ]



  return (
    <Dialog open={open} onOpenChange={onOpenChange || handleCancel}>
      <DialogContent className="
          invoice-inline-labels
          w-full
          max-w-[95vw]
          sm:max-w-[90vw]
          md:max-w-[80vw]
          lg:max-w-[135vh]
          h-[95vh]
          max-h-[95vh]
          p-0
          gap-0
          flex
          flex-col
        "
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => { if (!doHotKeys.current) event.preventDefault() }}

      >

        <div className="flex-shrink-0">
          <UniversalToolbar
            currentRecord={currentIndex}
            totalRecords={navTotalRecords}
            onFirst={async () => { await loadOrderData('first') }}
            onPrevious={async () => { await loadOrderData('previous') }}
            onNext={async () => { await loadOrderData('next') }}
            onLast={async () => { await loadOrderData('last') }}
            onNew={() => handleNewRecord(true)}
            onSave={handleSave}
            onDelete={() => { handleDeleteClick(false) }}
            onReport={handleReport}
            onExportExcel={handleExportExcel}
            onPrint={handlePrint}
            isLoading={navLoading}
            isSaving={state.isSaving}
            canSave={canSave}
            canPrint={state.formData.id > 0 ? true : false}
            canDelete={state.formData.id > 0 ? true : false}
            canClone={state.formData.id > 0 ? true : false}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
            onClone={handleClone}
          />
          <Messages innerRef={message} />
        </div>

        <div className="flex-1 overflow-y-auto">

          <div className="p-6 space-y-6">
            <Toast ref={toast} position={'top-left'} className="erp-toast-host" style={{ top: 100, whiteSpace: 'pre-line' }} />
            <ProgressSpinner loading={loading} />

            <ProductSearchPopup
              visible={showItemSearch}
              onClose={() => { setItemSearch(false); searchTextRef.current = ""; popupHasClosed() }}
              onSelect={(obj) => { setItemSearch(false); searchTextRef.current = ""; popupHasClosed(); FillItem(obj) }}
              priceCategoryId={priceCategoryIdRef.current}
              ShowSelect={true}
              searchText={searchTextRef.current}
            />
            <UnitsSearchPopup
              visible={showUnitsSearch}
              product={selectedProductForUnits!}      // selected row from your main grid
              units={selectedProductForUnits?.units ?? []} // units from that row
              onClose={() => {
                setUnitsSearch(false)
                popupHasClosed()
                gridRef.current?.focus()
                gridRef.current?.select(selectedIndex, 'price');
              }}
              onSelect={(obj) => {

                console.log("selectedIndex ", selectedIndex)
                if (!CollectionView || selectedIndex < 0) return;

                const item = CollectionView.items[selectedIndex];
                console.log("item ", item)
                if (!item) return;

                // ✅ Now it's safe to mutate
                item.unit_id = obj.selected_unit.unit_id;
                item.unit_name = obj.selected_unit.unit_name;
                item.price = obj.selected_unit.price;
                item.to_main_unit_qty = obj.selected_unit.to_main_qnty;

                // Refresh grid
                CollectionView.refresh();
                popupHasClosed()
                setUnitsSearch(false);
                gridRef.current?.focus()
                gridRef.current?.select(selectedIndex, 'price');
                //FillItem([obj]);
              }}
            />
            <CustomerSearchPopup
              visible={showCustomerSearch}
              type={-1}
              vch_type={vch_type ?? 5}
              onClose={() => {
                if (customerSelectHandledRef.current) {
                  customerSelectHandledRef.current = false
                  return
                }

                closeCustomerSearchPopup(true)
              }
              }
              onSelect={(customer) => {   // customer: Customer
                customerSelectHandledRef.current = true
                const allowedVoucherBooks = ["L", "P", "M", "R"]
                const customerVoucherBook = customer.vch_book?.toString().trim().toUpperCase()
                const book = allowedVoucherBooks.includes(customerVoucherBook)
                  ? customerVoucherBook
                  : state.formData.vch_book

                setState((prev) => ({
                  ...prev,
                  formData: {
                    ...prev.formData,
                    customer_id: customer.id,
                    customer_code: customer.customer_code,
                    customer_name: customer.name,
                    customer_phone: customer.mobile1,
                    vch_book: book,
                  },
                }))
                priceCategoryIdRef.current = customer.pricecategory
                closeCustomerSearchPopup(true)
              }}
            />
            <ConfirmDialogYesNo
              visible={showUnsaved}
              onConfirm={() => { setShowUnsaved(false); handleSave() }}
              onCancel={async () => {
                setShowUnsaved(false); popupHasClosed();
                if (nextFunction) {
                  nextFunction();
                  setNextFunction(null);

                }
              }}
              message="تم تعديل السجل هل تريد الحفظ؟"
              onBack={() => { setShowUnsaved(false); popupHasClosed(); setLoading(false) }}
              showBack={true}
            />
            <ConfirmDialogYesNo
              visible={showConfirm}
              onConfirm={confirmDelete}
              onCancel={() => { setShowConfirm(false); popupHasClosed() }}
              message="هل أنت متأكد من حذف السجل؟"
            />
            <ConfirmDialogYesNo
              visible={showAlert}
              onConfirm={async () => {
                await printOrder(state.FormDataBackup, CollectionViewBackupRef.current, {}, true); setShowAlert(false); popupHasClosed();
                setTimeout(() => referenceNumberRef.current?.focus(), 50)
              }}
              onCancel={() => { setShowAlert(false); popupHasClosed(); setTimeout(() => referenceNumberRef.current?.focus(), 50) }}
              message={alertMessage}
            />
            <ConfirmDialogYesNo
              visible={showPrintRefConfirm}
              onConfirm={() => { setShowPrintRefConfirm(false); popupHasClosed(); handlePrint(false); setTimeout(() => referenceNumberRef.current?.focus(), 50) }}
              onCancel={() => { setShowPrintRefConfirm(false); popupHasClosed(); setTimeout(() => referenceNumberRef.current?.focus(), 50) }}
              message="تمت طباعة السند مسبقا هل تريد الطباعة مرة أخرى؟"
            />
            <ConfirmDialogYesNo
              visible={showDuplicateRefConfirm}
              onConfirm={() => {
                setIsDuplicateRefConfirmed(true)
                duplicateRefDismissedValueRef.current = ""
                setShowDuplicateRefConfirm(false)
                popupHasClosed()
                focusReferenceThenNext()
              }}
              onCancel={() => {
                setIsDuplicateRefConfirmed(false)
                duplicateRefDismissedValueRef.current = ""
                skipNextEnterRef.current = true
                suppressEnterUntilRef.current = Date.now() + 700
                setState((prev) => ({
                  ...prev,
                  formData: { ...prev.formData, reference_number: "" },
                }))
                setShowDuplicateRefConfirm(false)
                popupHasCalled()
                setTimeout(() => {
                  referenceNumberRef.current?.focus()
                  referenceNumberRef.current?.select?.()
                }, 80)
                setTimeout(() => {
                  referenceNumberRef.current?.focus()
                  referenceNumberRef.current?.select?.()
                  popupHasClosed()
                }, 220)
              }}
              message="رقم السند اليدوي مستخدم مسبقا، هل تريد المتابعة؟"
            />
            <OrderSearchPopup
              visible={showOrderSearch}
              type={vch_type ?? 5}

              onClose={() => { popupHasCalled(); setShowOrderSearch(false); setTimeout(() => referenceNumberRef.current?.focus(), 50) }}
              onSelect={(order) => {
                setState((prev) => ({
                  ...prev,
                  formData: {
                    ...prev.formData,
                    id: order.id,
                  },
                }));
                popupHasClosed()
                setTimeout(() => referenceNumberRef.current?.focus(), 50)
                fromBlurRef.current = true
                loadOrderData('Byid', order.id);
              }}

            />
            <StoresSearchPopup
              visible={showStoresSearch}
              stores={(definitionsRef.current.warehouses ?? [])}// your array of stores
              onClose={() => {
                setStoresSearch(false)
                popupHasClosed()
                gridRef.current?.focus()
                gridRef.current?.select(selectedIndex, 'qnty');
              }
              }
              onSelect={(store) => {

                if (!CollectionView || selectedIndex < 0) return;

                const item = CollectionView.items[selectedIndex];
                if (!item) return;

                // Update the item with selected store
                item.store_id = store.id;
                item.store_name = store.warehouse_name;

                // Refresh grid
                CollectionView.refresh();
                popupHasClosed()
                setStoresSearch(false);
                gridRef.current?.focus()
                gridRef.current?.select(selectedIndex, 'qnty');
              }}
            />
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 sticky top-0 z-40 shadow-md">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">ملخص الفاتورة</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">المجموع الفرعي</span>
                      <span className="font-semibold">{totals.subtotal.toFixed(2)} </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الخصم</span>
                      <span className="font-semibold text-red-600">-{totals.discount.toFixed(2)} </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الضريبة</span>
                      <span className="font-semibold">{totals.tax.toFixed(2)} </span>
                    </div>
                    <Separator orientation="vertical" className="h-10 hidden md:block" />
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">الإجمالي</span>
                      <span className="text-lg font-bold text-primary">{totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-6" dir="rtl">

              {/* ===================== */}
              {/* معلومات الفاتورة (يمين) */}
              {/* ===================== */}
              <Card className="h-full">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    معلومات الفاتورة الأساسية
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-10">

                  {/* الصف الأول */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* دفتر السندات */}
                    <div className="invoice-currency-dropdown-wrap">
                      <Label>دفتر السندات</Label>
                      <PrimeDropdown
                        inputId="vch_book"
                        value={String(state.formData.vch_book ?? "R")}
                        options={voucherBookOptions}
                        optionLabel="label"
                        optionValue="value"
                        className="invoice-currency-dropdown"
                        style={{ width: "100%" }}
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        panelStyle={{ zIndex: 10000 }}
                        disabled={voucherBookLocked}
                        onChange={(e: any) => {
                          const value = e.value
                          const normalized = String(value).trim().toUpperCase()
                          setState(prev => ({
                            ...prev,
                            formData: { ...prev.formData, vch_book: normalized }
                          }))
                          fromBlurRef.current = false
                          generateOrderNumber(normalized)
                          refocusDropdownInput("vch_book")
                        }}
                      />
                    </div>

                    {/* رقم الفاتورة */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {"رقم الفاتورة"} <span className="text-red-500 mr-1">*</span>
                      </Label>

                      <div className="flex flex-row-reverse gap-2 items-center">
                        <Button type="button" size="sm" onClick={openOrderSearchPopup}>
                          🔍
                        </Button>
                        <Input
                          ref={orderNumberRef}
                          value={state.formData.order_number ?? ""}
                          onKeyDown={(e) => {
                            // Allow Enter
                            if (e.key === "F10") {
                              openOrderSearchPopup()
                              return;
                            }
                          }
                          }
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, order_number: e.target.value },
                            }))
                          }
                          className="text-right font-medium text-sm h-9"
                          dir="rtl"
                          placeholder={""}
                          onBlur={handleOrderCodeBlur}
                          maxLength={9}
                        />
                      </div>
                    </div>

                    {/* تاريخ الفاتورة */}
                    <div>
                      <Label>تاريخ الفاتورة</Label>
                      <Input
                        type="date"
                        value={state.formData.order_date ?? ""}
                        onChange={async (e) => {
                          const newDate = e.target.value
                          if (!newDate) return

                          let rate = state.formData.exchange_rate
                          if (state.formData.currency_id !== 1) {
                            rate = await getCurrencyRate(state.formData.currency_id, newDate)
                          }

                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, order_date: newDate, exchange_rate: rate },
                          }))
                        }}
                        className="h-11"
                      />
                    </div>

                    <div className="invoice-currency-dropdown-wrap">
                      <Label>نوع الفاتورة</Label>
                      <PrimeDropdown
                        inputId="invoice_source_type"
                        value={state.formData.invoice_source_type || "normal"}
                        options={voucherTypeOptions}
                        optionLabel="label"
                        optionValue="value"
                        className="invoice-currency-dropdown h-11"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        baseZIndex={10000}
                        panelStyle={{ zIndex: 10000 }}
                        onChange={(e: any) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, invoice_source_type: e.value || "normal" },
                          }))
                        }
                        onHide={() => refocusDropdownInput("invoice_source_type")}
                      />
                    </div>

                  </div>

                  {/* الصف الثاني */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                    {/* العملة */}
                    <div className="invoice-currency-dropdown-wrap">
                      <Label>العملة</Label>
                      <PrimeDropdown
                        id="currency_id"
                        inputId="currency_id"
                        value={state.formData.currency_id ? Number(state.formData.currency_id) : null}
                        options={normalizedCurrencies}
                        optionLabel="currency_name"
                        optionValue="currency_id"
                        placeholder="اختر العملة"
                        filter={true}
                        className="invoice-currency-dropdown"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        baseZIndex={10000}
                        panelStyle={{ zIndex: 10000 }}
                        filterInputAutoFocus={true}
                        onShow={() => {
                          setTimeout(() => {
                            const filterInput = document.querySelector(
                              ".invoice-currency-dropdown-panel .p-dropdown-filter",
                            ) as HTMLInputElement | null
                            filterInput?.focus()
                            filterInput?.select()
                          }, 0)
                        }}
                        onChange={async (e: any) => {
                          const nextCurrencyId = Number(e.value ?? 0)
                          const selected = normalizedCurrencies.find(
                            (c) => c.currency_id === nextCurrencyId,
                          )

                          if (!selected) return

                          setState((prev) => ({
                            ...prev,
                            formData: {
                              ...prev.formData,
                              currency_id: nextCurrencyId,
                              currency_name: selected.currency_name,
                              exchange_rate: nextCurrencyId === 1 ? 1 : prev.formData.exchange_rate,
                            },
                          }))

                          let rate = 1
                          if (nextCurrencyId !== 1) {
                            rate = await getCurrencyRate(nextCurrencyId, state.formData.order_date)
                          }

                          setState((prev) => ({
                            ...prev,
                            formData: {
                              ...prev.formData,
                              currency_id: nextCurrencyId,
                              currency_name: selected.currency_name,
                              exchange_rate: rate,
                            },
                          }))
                          refocusDropdownInput("currency_id")
                        }}
                      />
                    </div>

                    {/* سعر الصرف */}
                    <div>
                      <Label>سعر الصرف</Label>
                      <Input
                        value={state.formData.exchange_rate ?? 1}
                        disabled={state.formData.currency_id === 1}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">{"السند اليدوي"}</Label>
                      <Input
                        ref={referenceNumberRef}
                        value={state.formData.reference_number ?? ""}
                        onChange={(e) => {
                          setIsDuplicateRefConfirmed(false)
                          duplicateRefDismissedValueRef.current = ""
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, reference_number: e.target.value },
                          }))
                        }}
                        onBlur={handleReferenceNumberBlur}
                        className="text-right h-11"
                        dir="rtl"
                        maxLength={7}
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">{"تاريخ السند اليدوي"}</Label>
                      <Input
                        type="date"
                        value={state.formData.reference_number_date ?? state.formData.order_date ?? ""}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            formData: { ...prev.formData, reference_number_date: e.target.value },
                          }))
                        }
                        className="text-right h-11"
                        dir="rtl"
                      />
                    </div>

                  </div>

                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" dir="rtl">
                {/* ===================== */}
                {/* معلومات الزبون (يمين) */}
                {/* ===================== */}
                <Card className="h-full">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      معلومات الزبون
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-6">

                    <div className="grid grid-cols-12 gap-4">

                      {/* رقم الزبون */}
                      <div className="col-span-12 md:col-span-5">
                        <Label htmlFor="customer_code" className="text-sm font-medium">
                          {'رقم الزبون *'}
                        </Label>
                        <div className="flex gap-2">
                          <Input

                            id="customer_code"
                            value={state.formData.customer_code}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                formData: { ...prev.formData, customer_code: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              // Allow Enter
                              if (e.key === "F10") {
                                e.preventDefault();
                                openCustomerSearchPopup()
                                return;
                              }
                            }
                            }
                            className="text-right h-11 text-base font-medium"
                            placeholder={''}

                          />
                          <Button type="button" onClick={openCustomerSearchPopup}>
                            🔍
                          </Button>
                        </div>
                      </div>


                      {/* اسم الزبون */}
                      <div className="col-span-7">
                        <Label>اسم الزبون *</Label>
                        <Input
                          ref={customerNameRef}
                          value={state.formData.customer_name ?? ""}
                          onChange={(e) =>
                            setState(prev => ({
                              ...prev,
                              formData: { ...prev.formData, customer_name: e.target.value }
                            }))
                          }
                        />
                      </div>

                      {/* هاتف */}
                      <div className="col-span-12 md:col-span-6">
                        <Label>هاتف الزبون</Label>
                        <Input
                          value={state.formData.customer_phone ?? ""}
                          maxLength={15}
                          onChange={(e) =>
                            setState(prev => ({
                              ...prev,
                              formData: { ...prev.formData, customer_phone: e.target.value }
                            }))
                          }
                        />
                      </div>

                      <div className="col-span-12 md:col-span-6">
                        <Label>رصيده</Label>
                        <Input
                          value={selectedCustomerBalance.toFixed(2)}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>

                  </CardContent>
                </Card>

                <Card className="h-full">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Percent className="h-5 w-5 text-primary" />
                      معلومات الضريبة
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 min-h-[180px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="invoice-currency-dropdown-wrap">
                        <Label>التصنيف الضريبي</Label>
                        <PrimeDropdown
                          inputId="tax_classification"
                          value={state.formData.tax_classification || 1}
                          options={taxClassificationOptions}
                          optionLabel="label"
                          optionValue="value"
                          className="invoice-currency-dropdown"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          baseZIndex={10000}
                          panelStyle={{ zIndex: 10000 }}
                          onChange={(e: any) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, tax_classification: Number(e.value) || 1 },
                            }))
                          }
                          onHide={() => refocusDropdownInput("tax_classification")}
                        />
                      </div>

                      <div className="invoice-currency-dropdown-wrap">
                        <Label>النوع</Label>
                        <PrimeDropdown
                          inputId="invoice_type"
                          value={state.formData.invoice_type || 1}
                          options={invoiceTypeOptions}
                          optionLabel="label"
                          optionValue="value"
                          className="invoice-currency-dropdown"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          baseZIndex={10000}
                          panelStyle={{ zIndex: 10000 }}
                          onChange={(e: any) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, invoice_type: Number(e.value) || 1 },
                            }))
                          }
                          onHide={() => refocusDropdownInput("invoice_type")}
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">{"تاريخ التسديد"}</Label>
                        <Input
                          type="date"
                          value={state.formData.delivery_date ?? ""}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, delivery_date: e.target.value },
                            }))
                          }
                          className="text-right h-11"
                          dir="rtl"
                        />
                      </div>

                      <div>
                        <Label>مقاصة</Label>
                        <label className="invoice-offset-toggle" htmlFor="is_offset">
                          <span className="invoice-offset-toggle-text">
                            {state.formData.is_offset ? "مفعلة" : "غير مفعلة"}
                          </span>
                          <input
                            id="is_offset"
                            type="checkbox"
                            checked={!!state.formData.is_offset}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                formData: {
                                  ...prev.formData,
                                  is_offset: e.target.checked,
                                  offset_code: e.target.checked
                                    ? (prev.formData.offset_code || 1)
                                    : null,
                                },
                              }))
                            }
                          />
                          <span className="invoice-offset-toggle-track">
                            <span className="invoice-offset-toggle-thumb" />
                          </span>
                        </label>
                      </div>

                      <div className="invoice-currency-dropdown-wrap">
                        <Label>كود المقاصة</Label>
                        <PrimeDropdown
                          inputId="offset_code"
                          value={state.formData.offset_code}
                          options={offsetCodeOptions}
                          optionLabel="label"
                          optionValue="value"
                          className="invoice-currency-dropdown"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          baseZIndex={10000}
                          panelStyle={{ zIndex: 10000 }}
                          onChange={(e: any) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, offset_code: Number(e.value) || null },
                            }))
                          }
                          disabled={!state.formData.is_offset}
                          placeholder="اختر"
                          onHide={() => refocusDropdownInput("offset_code")}
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">مبيعات مصدرة</Label>
                        <label className="invoice-offset-toggle" htmlFor="exported_sales_toggle">
                          <span className="invoice-offset-toggle-text">
                            {state.formData.exported_sales ? "مفعلة" : "غير مفعلة"}
                          </span>
                          <input
                            id="exported_sales_toggle"
                            type="checkbox"
                            checked={!!state.formData.exported_sales}
                            onChange={(e) =>
                              setState((prev) => ({
                                ...prev,
                                formData: {
                                  ...prev.formData,
                                  exported_sales: e.target.checked,
                                },
                              }))
                            }
                          />
                          <span className="invoice-offset-toggle-track">
                            <span className="invoice-offset-toggle-thumb" />
                          </span>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
            {state.formData?.id > 0 && state.formData?.printed === 1 && (
              <div className="px-6 py-2 bg-green-100 text-green-800 font-semibold rounded-b-lg text-center text-xl">
                تمت الطباعة
              </div>

            )}
            {state.formData?.is_exported === 1 && (
              <div className="px-6 py-2 bg-green-100 text-blue-800 font-semibold rounded-b-lg text-center text-xl">
                مرحلة
              </div>

            )}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    أصناف الفاتورة
                  </CardTitle>

                </div>
              </CardHeader>
              <CardContent>
                <DataGridView
                  style={{ maxHeight: '280px' }}
                  ref={gridRef}
                  idProperty="ser"
                  scheme={getScheme()}
                  dataSource={CollectionView}
                  onKeyDown={(s: any, e: any) => onKeyDownGrid(s, e)}
                  cellEditEnded={(s: any, e: any) => onCellEditEnded(s, e)}
                  showContextMenu={false}
                  copyItemStoreDown={true}
                  dontConvertToCards={true}
                  isReport={false}
                  hideSearch={true}
                  allowSorting={false}
                  keyActionEnter="None"
                />

              </CardContent>
            </Card>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="notes" className="border rounded-lg">
                <Card className="border-0">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline bg-primary/10 text-primary rounded-t-lg border-b border-primary/20">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      الملاحظات
                    </CardTitle>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <CardContent className="space-y-6 pt-0">

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">ملاحظة عامة</Label>
                        <Textarea
                          value={state.formData.general_notes ?? ""}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              formData: { ...prev.formData, general_notes: e.target.value },
                            }))
                          }
                          className="text-right min-h-[90px] resize-none"
                          rows={3}
                          placeholder="ملاحظة عامة على الفاتورة"
                          dir="rtl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">ملاحظات داخلية</Label>
                        <Textarea
                          value={state.formData.internal_notes ?? ""}
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
                          value={state.formData.delivery_notes ?? ""}
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
                        value={state.formData.discount_type || "percentage"}
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
                        value={state.formData.discount_amount || 0}
                        onChange={(e) => {
                          let value = Number.parseFloat(e.target.value) || 0;

                          if (state.formData.discount_type === "percentage") {
                            // percentage → max 100
                            value = Math.min(Math.max(value, 0), 100);
                          } else {
                            // amount → max subtotal
                            value = Math.min(Math.max(value, 0), totals.subtotal);
                          }

                          setState((prev) => ({
                            ...prev,
                            formData: {
                              ...prev.formData,
                              discount_amount: value,
                            },
                          }));
                        }}
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
                      value={state.formData.vat_percent || 0}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          formData: { ...prev.formData, vat_percent: Number.parseFloat(e.target.value) || 0 },
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
                        value={state.formData.shipping_cost || 0}
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
                        value={state.formData.other_charges || 0}
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
                      <span className="font-semibold text-lg">{totals.subtotal.toFixed(2)} </span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الخصم:</span>
                      <span className="font-semibold text-lg text-red-600">-{totals.discount.toFixed(2)} </span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الضريبة:</span>
                      <span className="font-semibold text-lg">{totals.tax.toFixed(2)} </span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">الشحن:</span>
                      <span className="font-semibold text-lg">{(Number(state.formData.shipping_cost) || 0).toFixed(2)} </span>
                    </div>
                    <div className="flex justify-between items-center text-base py-2">
                      <span className="text-muted-foreground">رسوم أخرى:</span>
                      <span className="font-semibold text-lg">{(Number(state.formData.other_charges) || 0).toFixed(2)} </span>
                    </div>
                    <Separator className="my-4" />
                    <div className="flex justify-between items-center bg-primary/10 p-4 rounded-lg border border-primary/20">
                      <span className="text-lg font-bold">المجموع الكلي:</span>
                      <span className="text-2xl font-bold text-primary">{(Number(totals.total) || 0).toFixed(2)} </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>


          </div>
        </div>



        {/* Search dialogs and other modals remain the same */}
        {state.showProductSearch && (
          <InlineProductSearch
            products={state.products}
            onSelect={(product: any) => handleProductSelect(product, state.activeItemId!)}
            onClose={() => setState((prev) => ({ ...prev, showProductSearch: false, activeItemId: null }))}
          />
        )}

        {state.showLotSelector && state.selectedProductForLots && (
          <LotSelector
            open={state.showLotSelector}
            onOpenChange={(open) => setState((prev) => ({ ...prev, showLotSelector: open }))}
            productId={state.selectedProductForLots.id}
            productName={state.selectedProductForLots.product_name}
            requestedQuantity={state.orderItems.find((item: { id: string | null }) => item.id === state.selectedItemIdForLots)?.quantity || 0}
            onLotsSelected={handleLotsSelected}
          />
        )}

        <ReportGenerator
          title={vch_type === 2 ? "تقرير فواتير المشتريات" : "تقرير فواتير المبيعات"}
          data={allOrders}
          columns={reportColumns}
          isOpen={showReport}
          onClose={() => setShowReport(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export { UnifiedSaleInvoices }
export default UnifiedSaleInvoices
