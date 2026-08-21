"use client"

import type React from "react"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Package, Save, X, Barcode, DollarSign, Warehouse, Truck, Info, Settings, Package2, Plus, Currency, SlidersHorizontal } from "lucide-react"
import { WarehouseInventoryTable } from "./warehouse-inventory-table"
import { BatchTrackingTable } from "./batch-tracking-table"
import { UNITS } from "@/lib/constants"
import DataGridView from "@/components/common/DataGridView"
import SimpleListPicker, { type SimpleListPickerItem } from "@/components/common/SimpleListPicker"
import * as wjGrid from "@grapecity/wijmo.grid";
import { readonly } from "zod/v4"
import ProductBarcodes from "./ProductBarcodes"
import ProductNumbers from "./ProductNumbers"
import { Toast } from 'primereact/toast';
import PrimeDropdown from '@/components/common/FocusDropdown'
import MultiSelect from '@/components/common/MultiSelect'
import SearchCostCenterDialog from "@/components/customer/search-cost-center-dialog"
import SearchBrandDialog from "@/components/customer/search-brand-dialog"
import './compact-product-form.css'
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import ConfirmDialogYesNo from "../ui/ConfirmDialogYesNo"
import { useAuth } from "../auth/auth-context"
import ProductCodeInput from "./ProductCodeInput"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import Util from "../common/Util"
import sharedDropdownStyles from "../common/Dropdown.module.scss"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AttachmentManager from "@/components/common/AttachmentManager"
import { ImageUploadField } from "@/components/common/ImageUploadField"
import { attachEnterAsTab } from "@/components/common/enterAsTab"

// ارتفاع موحَّد لكل شبكات DataGridView في هذه الشاشة (الوحدات/الأسعار/المستودعات/مراكز التكلفة) —
// يُمرَّر إلى DataGridView مباشرة (كخاصية style) لا إلى العنصر الملفوف، فيتولى Wijmo تمرير الصفوف
// داخلياً بشريط تمرير عمودي واحد فقط بدل شريطين متداخلين (الجدول + العنصر الملفوف معاً).
const TABS_GRID_HEIGHT = 260

interface ProductAttributeLine {
  name: string
  values: string[]
  value_images?: Record<string, string | null>
}

interface AttributeCatalogItem extends ProductAttributeLine {}

function AttributeNameInput({ value, catalog, onChange, onCreate }: { value: string; catalog: AttributeCatalogItem[]; onChange: (value: string) => void; onCreate: (name: string) => void }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => setQuery(value), [value])
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [value])
  const matches = catalog.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const exactMatch = catalog.some((item) => item.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase())
  return <div ref={rootRef} className="relative">
    <Input value={query} placeholder="ابحث أو اكتب متغيراً" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} />
    {open && <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
      {matches.map((item) => <button type="button" key={item.name} className="block w-full rounded px-3 py-2 text-right text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(item.name); setOpen(false); onChange(item.name) }}>{item.name}</button>)}
      {query.trim() && !exactMatch && <button type="button" className="block w-full rounded px-3 py-2 text-right text-sm font-semibold text-emerald-700 hover:bg-emerald-50" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); onCreate(query.trim()) }}>
        + إنشاء المتغير “{query.trim()}”
      </button>}
    </div>}
  </div>
}

function AttributeValueInput({ values, valueImages = {}, suggestions, disabled = false, onChange, onImageChange, onCreate }: { values: string[]; valueImages?: Record<string, string | null>; suggestions: string[]; disabled?: boolean; onChange: (values: string[]) => void; onImageChange: (value: string, image: string | null) => void; onCreate: (value: string) => void }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = suggestions.filter((value) => value.toLocaleLowerCase().includes(normalizedQuery) && !values.includes(value))
  const exactMatch = suggestions.find((value) => value.toLocaleLowerCase() === normalizedQuery)
  const addValue = (value: string) => {
    const text = value.trim()
    if (!text || values.some((item) => item.toLocaleLowerCase() === text.toLocaleLowerCase())) return
    onChange([...values, text])
    setQuery("")
    setOpen(false)
  }
  return <div ref={rootRef} className={`relative min-w-0 ${disabled ? "opacity-60" : ""}`}>
    <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1">
      {values.map((value) => <span key={value} className="inline-flex items-center gap-2 rounded-xl bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">
        <ImageUploadField value={valueImages[value]} onChange={(image) => onImageChange(value, image)} size={36} rounded="2xl" />
        <span>{value}</span><button type="button" title="إزالة القيمة" onClick={() => onChange(values.filter((item) => item !== value))}><X className="h-3 w-3" /></button>
      </span>)}
      <input disabled={disabled} className="h-7 min-w-[120px] flex-1 bg-transparent text-sm outline-none" value={query} placeholder={disabled ? "اختر متغيراً أولاً" : "ابحث أو اكتب قيمة"} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && query.trim()) { event.preventDefault(); addValue(exactMatch || query) }
      }} />
    </div>
    {open && !disabled && <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
      {filtered.map((value) => <button type="button" key={value} className="block w-full rounded px-3 py-2 text-right text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => addValue(value)}>{value}</button>)}
      {query.trim() && !exactMatch && <button type="button" className="block w-full rounded px-3 py-2 text-right text-sm font-semibold text-emerald-700 hover:bg-emerald-50" onMouseDown={(event) => event.preventDefault()} onClick={() => { addValue(query); onCreate(query.trim()) }}>+ إنشاء القيمة “{query.trim()}”</button>}
    </div>}
  </div>
}

interface ProductCostCenterItem {
  id?: number
  product_id?: number
  cost_center_type_id: number | null
  required_in_transactions?: number | null
  default_cost_center_id?: number | null
  cost_center_type_name?: string
  cost_center_name?: string
}

// صف واحد لكل نوع علامة تجارية (brand_types) — بنفس نمط ProductCostCenterItem أعلاه تماماً؛ قد
// يُسنَد له علامة تجارية (brands) محدَّدة أو يبقى بلا إسناد (brand_id فارغ).
interface ProductBrandItem {
  id?: number
  product_id?: number
  brand_type_id: number | null
  required_in_transactions?: number | null
  brand_id?: number | null
  brand_type_name?: string
  brand_name?: string
}

interface ProductFormData {
  id: number
  product_code: string
  product_name: string
  product_name_en: string
  description: string
  category_id: number
  main_stock_id: number
  default_store: number
  brand: string
  model: string
  measurment_unit: number
  measurment_id: number
  last_purchase_price: number
  minimum_order_quantity: number

  currency_id: number
  tax_rate: number
  discount_rate: number

  original_numbers: string[]
  factory_numbers: string[]
  location: string

  expiry_tracking: boolean
  batch_tracking: boolean
  serial_tracking: boolean
  status: number
  type: number
  service_type: number
  product_type: number
  tax_classification_id: number

  manufacturer_company: string
  length: number
  width: number
  height: number
  density: number

  color: string
  size: string

  notes: string
  transaction_notes: string
  entry_date: string
  selling_account_id: number
  selling_account_code: string
  purchase_account_id: number
  purchase_account_code: string
  selling_returns_account_id: number
  selling_returns_account_code: string
  purchase_returns_account_id: number
  purchase_returns_account_code: string
  stock_end_account_id: number
  stock_end_account_code: string
  stock_start_account_id: number
  stock_start_account_code: string
  production_account_id: number
  production_account_code: string
  municipality_service_account_id: number
  municipality_service_account_code: string
  lsti3mal_account_id: number
  lsti3mal_account_code: string

  units?: UnitItem[],
  prices?: PriceItem[],
  stores?: StoreItem[],
  cost_centers?: ProductCostCenterItem[],
  product_brands?: ProductBrandItem[],
  product_image?: string | null,
  // فروع تقييد ظهور الصنف بالبحث (اختياري) — مصفوفة فارغة = يظهر لكل الفروع (الافتراضي/الحالي)،
  // وإلا يظهر فقط لمستخدم فرعه أحد هذه المعرّفات (انظر product_branches بـapp/api/inventory/
  // products/route.ts وتصفية x-branch-id بـauth-context.tsx).
  branch_ids?: number[],
  attributes?: ProductAttributeLine[],
}
export const initialFormData: ProductFormData = {
  id: 0,
  product_code: "",
  product_name: "",
  product_name_en: "",
  description: "",
  category_id: 0,
  main_stock_id: 0,
  default_store: 0,
  brand: "",
  model: "",
  measurment_unit: 1,
  measurment_id: 1,
  last_purchase_price: 0,
  minimum_order_quantity: 0,

  currency_id: 0,
  tax_rate: 15,
  discount_rate: 0,

  tax_classification_id: 0,

  original_numbers: [],
  factory_numbers: [],
  location: "",

  expiry_tracking: false,
  batch_tracking: false,
  serial_tracking: false,
  status: 1,
  type: 1,
  service_type: 0,
  product_type: 1,

  manufacturer_company: "",
  length: 0,
  width: 0,
  height: 0,
  density: 0,

  color: "",
  size: "",

  notes: "",
  transaction_notes: "",
  entry_date: new Date().toISOString().split("T")[0],
  selling_account_id: 0,
  selling_account_code: "",
  purchase_account_id: 0,
  purchase_account_code: "",
  selling_returns_account_id: 0,
  selling_returns_account_code: "",
  purchase_returns_account_id: 0,
  purchase_returns_account_code: "",
  stock_end_account_id: 0,
  stock_end_account_code: "",
  stock_start_account_id: 0,
  stock_start_account_code: "",
  production_account_id: 0,
  production_account_code: "",
  municipality_service_account_id: 0,
  municipality_service_account_code: "",
  lsti3mal_account_id: 0,
  lsti3mal_account_code: "",

  units: [],
  prices: [],
  stores: [],
  cost_centers: [],
  product_brands: [],
  product_image: null,
  branch_ids: [],
  attributes: [],
};

export interface CompactProductFormProps {
  visible?: any,
  editingProduct?: any
  onHideDialog: (e: any) => void
  onSuccess?: () => void
  isSubmitting?: boolean
  entityType?: "products" | "services"
}
interface UnitItem {
  id: number;
  ser: number;
  unit_id: number;
  barcode_list: string[],

  [key: string]: any;
}

interface PriceItem {
  id: number;
  unit_id: number;
  price_category_id?: number;

  [key: string]: any;
}
interface StoreItem {
  id: number;
  store_id: number;
  [key: string]: any;
}
export function CompactProductForm({
  visible,
  editingProduct,
  onHideDialog,
  onSuccess,
  entityType = "products",
}: CompactProductFormProps) {
  const isService = entityType === "services"
  const toast = useRef<Toast>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData)
  const [isSearching, setIsSearching] = useState(false)
  const [productCodeError, setProductCodeError] = useState("")
  const [showConfirm, setShowConfirm] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [nextFunction, setNextFunction] = useState<(() => void) | null>(null);
  const [definitions, setDefinitions] = useState({
    categories: [] as Array<{ id: number; group_name: string }>,
    suppliers: [] as Array<{ id: number; name: string; code?: string }>,
    warehouses: [] as Array<{ id: number; warehouse_name: string }>,
    units: [] as Array<{ id: number; unit_name: string }>,
    currencies: [] as Array<{ id: number; currency_name: string }>,
    price_category: [] as Array<{ id: number; name: string }>,
    product_category: [] as Array<{ id: number; name: string }>,
    cost_center_types: [] as Array<{ id: number; name: string }>,
    cost_centers: [] as Array<{ id: number; name: string; cost_type_id?: number; parent_id?: number | null }>,
    tax_classifications: [] as Array<{ id: number; name: string }>,
    measurment_types: [] as Array<{ id: number; name: string }>,
    branches: [] as Array<{ id: number; branch_name: string }>,
    brand_types: [] as Array<{ id: number; name: string }>,
    brands: [] as Array<{ id: number; name: string; brand_type_id: number }>,
  })

  // تتبع تاريخ الصلاحية/الرقم التشغيلي/الرقم المتسلسل يفترض صنفاً بوحدات عد صحيحة بسيطة — نوع قياس
  // غير "عادي" (1) يحسب الكمية تلقائياً من أبعاد/عدد متغيّرَين لكل حركة (مساحة/حجم/وزن...)، فلا
  // معنى لربط دفعة/تسلسل واحد بكمية متغيّرة كهذه. يُفرَض التبادل بالاتجاهين: لا يمكن تفعيل أي من
  // الثلاث خانات إن كان نوع القياس غير عادي، ولا تغيير نوع القياس عن عادي إن كانت إحداها مُفعَّلة.
  const MEASUREMENT_TRACKING_CONFLICT_MSG =
    "لا يمكن تفعيل تاريخ صلاحية / له رقم تشغيلي / له رقم متسلسل لصنف نوع القياس غير عادي"
  // تُعطَّل هذه الخانات كلياً (لا تُعرَض هذه الرسالة إلا لتوضيح السبب عند محاولة تفعيلها من الشاشات
  // التي لا تُطبِّق disabled على العنصر نفسه) إن كان للصنف سطر واحد على الأقل بـvoucher_items_tbl
  // ضمن سند لم يُلغَ منطقياً — انظر isUsedInVouchers وGET /api/inventory/products/[id]/voucher-usage.
  const VOUCHER_USAGE_TRACKING_LOCK_MSG =
    "لا يمكن تغيير تاريخ الصلاحية / الرقم التشغيلي / الرقم المتسلسل لصنف له حركة مخزون فعلية"

  const PRODUCT_TYPE_OPTIONS = [
    { label: "بضاعة تجارية", value: 1 },
    { label: "مواد خام", value: 2 },
    { label: "لوازم إنتاج", value: 3 },
    { label: "تحت التصنيع", value: 4 },
    { label: "بضاعة مصنعة", value: 5 },
    { label: "مواد للاستهلاك", value: 6 },
  ]
  const definitionsRef = useRef({
    categories: [] as Array<{ id: number; group_name: string }>,
    suppliers: [] as Array<{ id: number; name: string; code?: string }>,
    warehouses: [] as Array<{ id: number; warehouse_name: string }>,
    units: [] as Array<{ id: number; unit_name: string }>,
    currencies: [] as Array<{ id: number; currency_name: string }>,
    price_category: [] as Array<{ id: number; name: string }>,
    product_category: [] as Array<{ id: number; name: string }>,
    cost_center_types: [] as Array<{ id: number; name: string }>,
    cost_centers: [] as Array<{ id: number; name: string; cost_type_id?: number; parent_id?: number | null }>,
    tax_classifications: [] as Array<{ id: number; name: string }>,
    measurment_types: [] as Array<{ id: number; name: string }>,
    branches: [] as Array<{ id: number; branch_name: string }>,
    brand_types: [] as Array<{ id: number; name: string }>,
    brands: [] as Array<{ id: number; name: string; brand_type_id: number }>,
  });
  const unitGridRef = useRef<wjGrid.FlexGrid>(null);
  const [loading, setLoading] = useState(false);
  const [costCenterTypes, setCostCenterTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [costCenters, setCostCenters] = useState<Array<{ id: number; name: string; cost_type_id?: number; parent_id?: number | null }>>([]);
  const [costCenterSearchOpen, setCostCenterSearchOpen] = useState(false)
  const [selectedCostCenterRowIndex, setSelectedCostCenterRowIndex] = useState<number | null>(null)
  const [selectedCostCenterType, setSelectedCostCenterType] = useState<{ id: number; name: string } | null>(null)
  // نفس نمط مراكز التكلفة أعلاه تماماً (costCenterTypes/costCenters/costCenterSearchOpen...) لكن
  // للعلامات التجارية — انظر تبويب "brand" وbrandScheme/buildBrandRows أدناه.
  const [brandTypes, setBrandTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: number; name: string; brand_type_id?: number }>>([]);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false)
  const [selectedBrandRowIndex, setSelectedBrandRowIndex] = useState<number | null>(null)
  const [selectedBrandType, setSelectedBrandType] = useState<{ id: number; name: string } | null>(null)
  // منتقيات SimpleListPicker لأعمدة الوحدات/الأسعار/المستودعات/حالة مركز التكلفة — بديل موحَّد عن
  // Column.editor المباشر (DataGridView الفعلي يتطلّب عنصر تحكم Wijmo حقيقياً لا JSX، انظر
  // editor?: Control | null في @grapecity/wijmo.react.grid/index.d.ts)، بنفس نمط أزرار البحث
  // الأخرى في شاشات السندات (بحث صنف/مستودع/وحدة/حساب).
  const [unitPickerOpen, setUnitPickerOpen] = useState(false)
  const [unitPickerRow, setUnitPickerRow] = useState<number | null>(null)
  const [pricesPickerOpen, setPricesPickerOpen] = useState(false)
  const [pricesPickerRow, setPricesPickerRow] = useState<number | null>(null)
  const [pricesPickerField, setPricesPickerField] = useState<"category" | "unit" | "currency">("category")
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  const [storePickerRow, setStorePickerRow] = useState<number | null>(null)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [statusPickerRow, setStatusPickerRow] = useState<number | null>(null)

  const [unitCurrentRow, setUnitCurrentRow] = useState(0)
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [originalNumbersDialogOpen, setOriginalNumbersDialogOpen] = useState(false);
  const [factoryNumbersDialogOpen, setFactoryNumbersDialogOpen] = useState(false);
  const [dialogUnitName, setDialogUnitName] = useState("");
  const [dialogBarcodes, setDialogBarcodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("units");
  const [attributeCatalog, setAttributeCatalog] = useState<AttributeCatalogItem[]>([])
  const product_code = useRef<HTMLInputElement>(null);
  const product_name = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    // When the dialog opens or mode changes, default to the units tab
    if (visible) {
      setActiveTab("units");
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || isService) return
    fetch("/api/product-attributes").then((response) => response.ok ? response.json() : []).then((data) => setAttributeCatalog(Array.isArray(data) ? data : [])).catch(() => setAttributeCatalog([]))
  }, [visible, isService])
  const createAttributeCatalogItem = async (name: string, value?: string) => {
    const cleanName = name.trim()
    const cleanValue = value?.trim() || ""
    if (!cleanName || (value !== undefined && !cleanValue)) return
    try {
      const response = await fetch("/api/product-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, value: cleanValue || undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "تعذر إنشاء المتغير")
      setAttributeCatalog((current) => {
        const existing = current.find((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())
        if (existing) return current.map((item) => item === existing && cleanValue && !item.values.includes(cleanValue) ? { ...item, values: [...item.values, cleanValue] } : item)
        return [...current, { name: cleanName, values: cleanValue ? [cleanValue] : [] }]
      })
      toast.current?.show({ severity: "success", summary: "نجاح", detail: "تم إنشاء المتغير أو القيمة", life: 1800 })
    } catch (error) {
      toast.current?.show({ severity: "error", summary: "خطأ", detail: error instanceof Error ? error.message : "تعذر الإنشاء", life: 2500 })
    }
  }
  const validateProduct = () => {
    if (formData.product_code === "") {
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: isService ? 'يجب ادخال رقم الخدمة' : 'يجب ادخال رقم الصنف',
        life: 1500
      });
      product_code.current?.focus();
      return false
    }
    if (formData.product_name === "") {
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: isService ? 'يجب ادخال اسم الخدمة' : 'يجب ادخال اسم الصنف',
        life: 1500
      });
      product_name.current?.focus();
      return false
    }
    if (!formData.units || formData.units.length === 0) {
      toast.current?.show({
        severity: "error",
        summary: "خطأ",
        detail: "يجب ادخال وحدة واحدة على الاقل",
        life: 1500,
      });
      product_name.current?.focus();
      return false;
    }
    if (!formData.prices || formData.prices.length === 0) {
      toast.current?.show({
        severity: "error",
        summary: "خطأ",
        detail: "يجب ادخال سعر بيع واحد على الاقل",
        life: 1500,
      });
      return false;
    }

    // حاجز أخير عند الحفظ (بمعزل عن منع التفعيل التفاعلي بالخانات/القائمة نفسها) — يلتقط أي حالة
    // وصلت لهذا التعارض بطريقة لم تمر عبر onCheckedChange/onChange (كصنف مُحمَّل من بيانات قديمة
    // سابقة لهذا القيد).
    if (
      Number(formData.measurment_id || 1) !== 1 &&
      (formData.expiry_tracking || formData.serial_tracking || formData.batch_tracking)
    ) {
      toast.current?.show({
        severity: "error",
        summary: "خطأ",
        detail: MEASUREMENT_TRACKING_CONFLICT_MSG,
        life: 3000,
      });
      return false;
    }

    const unitIds = new Set<number>();
    for (const unit of formData.units ?? []) {
      if (unitIds.has(unit.unit_id)) {
        toast.current?.show({
          severity: "error",
          summary: "خطأ",
          detail: `الوحدة ${unit.unit_name} مكررة`,
          life: 1500,
        });
        return false;
      }
      unitIds.add(unit.unit_id);
    }

    const storeIds = new Set<number>();
    for (const store of formData.stores ?? []) {
      if (storeIds.has(store.store_id)) {
        toast.current?.show({
          severity: "error",
          summary: "خطأ",
          detail: `المستودع ${store.store_name} مكرر`,
          life: 1500,
        });
        return false;
      }
      storeIds.add(store.store_id);
    }
    if (formData.prices && formData.prices.length > 0) {
      const priceKeys = new Set<string>();
      for (const price of formData.prices) {
        const key = `${price.unit_id}-${price.price_category_id}`;
        if (priceKeys.has(key)) {
          toast.current?.show({
            severity: "error",
            summary: "خطأ",
            detail: `الوحدة ${price.unit_name} مع الفئة ${price.price_name} مكررة`,
            life: 1500,
          });
          return false;
        }
        priceKeys.add(key);
      }
    }

    // Validate stores/warehouses
    if (formData.stores && formData.stores.length > 0) {
      const warehouseIds = new Set<number>();
      for (const store of formData.stores) {
        if (warehouseIds.has(store.store_id)) {
          toast.current?.show({
            severity: "error",
            summary: "خطأ",
            detail: `المستودع ${store.store_name} مكرر`,
            life: 1500,
          });
          return false;
        }
        warehouseIds.add(store.store_id);
      }
    }

    const attributeNames = new Set<string>()
    for (const attribute of formData.attributes || []) {
      const name = attribute.name.trim()
      if (!name || attribute.values.length === 0) {
        setActiveTab("attributes")
        toast.current?.show({ severity: "error", summary: "خطأ", detail: "يجب كتابة اسم الخاصية وإضافة قيمة واحدة على الأقل", life: 3000 })
        return false
      }
      const key = name.toLocaleLowerCase()
      if (attributeNames.has(key)) {
        setActiveTab("attributes")
        toast.current?.show({ severity: "error", summary: "خطأ", detail: `الخاصية ${name} مكررة`, life: 3000 })
        return false
      }
      attributeNames.add(key)
    }

    return true;
  }
  const handleSaveProduct = async () => {
    try {
      const productNameEn = formData.product_name_en.trim()
      let permission = 1
      if (formData.id > 0) permission = 2
      if (!Util.checkUserAccess(permission)) {
        toast.current?.show({
          severity: 'error',
          summary: '',
          detail: formData.id === 0 ? 'لا يوجد لديك صلاحية اضافة صنف ' : 'لا يوجد لديك صلاحية تعديل صنف',
          life: 3000
        });
        return
      }
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)

      const validateItem = validateProduct()
      if (!validateItem) {
        setIsSubmitting(false)
        return
      }

      const response = await fetch("/api/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          product_name_en: productNameEn,
          type: isService ? 2 : 1,
          service_type: isService ? 1 : 0,
        }),
      })

      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || "فشل في حفظ المنتج")
      }

      setSuccess(formData.id ? "تم تحديث المنتج بنجاح ✅" : "تم إنشاء المنتج بنجاح ✅")
      toast.current?.show({
        severity: 'success',
        summary: 'نجاح',
        detail: 'تمت العملية بنجاح ✅',
        life: 3000
      });
      onSuccess?.()
      await reset_fields()

    } catch (err) {
      console.error("[ProductDialog] Error saving product:", err)
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: err instanceof Error ? err.message : 'فشلت العملية',
        life: 5000
      });
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    setShowConfirm(false);
    popupHasClosed()
    await handleDeleteProduct(); // your existing function
  };

  const handleDeleteClick = (checkUnsaved: any) => {

    const currentHash = getFormDataHash(formData);
    if (checkUnsaved === true && currentHash !== initialHash.current) {
      setShowUnsaved(true)
      return
    }

    if (!formData.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'تنبيه',
        detail: 'لا يوجد صنف لحذفه',
        life: 3000
      });
      return;
    }

    if (!Util.checkUserAccess(3)) {
      toast.current?.show({
        severity: 'error',
        summary: '',
        detail: 'لا يوجد لديك صلاحية حذف صنف',
        life: 3000
      });
      return
    }

    setShowConfirm(true);
    popupHasCalled()
  };

  const handleDeleteProduct = async () => {
    if (!formData.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'تنبيه',
        detail: 'لا يوجد صنف لحذفه',
        life: 3000
      });
      return;
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/inventory/products?id=${formData.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "فشل في حذف الصنف");
      }

      toast.current?.show({
        severity: 'success',
        summary: 'نجاح',
        detail: 'تم حذف الصنف بنجاح ✅',
        life: 3000
      });

      await reset_fields(); // clear form

    } catch (err) {
      console.error("Error deleting product:", err);
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: 'فشلت العملية ❌',
        life: 5000
      });
    } finally {
      setLoading(false)
    }
  };


  const getNewProductCode = async (): Promise<string> => {
    try {
      const res = await fetch("/api/utilities/getLastProductCode");
      if (!res.ok) {
        throw new Error(`Product code request failed with status ${res.status}`)
      }
      const data = await res.json();
      if (data?.lastCode === undefined || data?.lastCode === null) {
        throw new Error("Product code response does not contain lastCode")
      }
      return data.lastCode.toString();
    } catch (error) {
      console.warn("Unable to generate a new product code:", error)
      toast.current?.show({
        severity: "warn",
        summary: "تنبيه",
        detail: "تعذر توليد رقم الصنف. تحقق من الاتصال ثم حاول مرة أخرى.",
        life: 4000,
      })
      return ""
    }
  };
  const [currentProductId, setCurrentProductId] = useState<number>(0);
  // true إن كان للصنف الحالي (بمعرّفه) سطر واحد على الأقل بـvoucher_items_tbl ضمن سند لم يُلغَ
  // منطقياً (status != 3) — يُعطِّل خانات "له تاريخ صلاحية"/"له رقم متسلسل"/"له رقم تشغيلي" أدناه
  // إذ تغييرها بأثر رجعي على صنف استُخدِم فعلياً يُناقض بيانات تلك السطور القائمة. يُعاد ضبطه false
  // عند فتح صنف جديد (reset_fields) وعند كل تحميل صنف موجود (loadData) قبل الفحص الفعلي.
  const [isUsedInVouchers, setIsUsedInVouchers] = useState(false);

  // يُطبَّق على أي صنف مُحمَّل بنجاح (تصفّح تسلسلي أو اختيار مباشر عبر البحث بـByid) — مُستخرَجة
  // كدالة مشتركة بدل تكرارها لكل مسار، بعد أن كانت مسارات النجاح المختلفة (لا الأخطاء فقط) تُكرِّر
  // نفس تحويل الوحدات/الأسعار/المستودعات وضبط formData/initialHash/currentProductId حرفياً.
  const applyLoadedProduct = async (product: any) => {
    // definitionsRef.current لا الحالة definitions — الحالة مُحدَّثة عبر setDefinitions (غير متزامنة،
    // تُطبَّق بالعرض التالي) بينما هذه الدالة تُستدعى من نفس تشغيلة useEffect التي استدعت
    // fetchDefinitions أصلاً (مرة واحدة فقط، محروسة بـinitialized.current)، فتبقى definitions هنا
    // دوماً بقيمتها الأولية الفارغة عند أول تحميل صنف — تماماً سبب ظهور اسم الوحدة/فئة السعر فارغين
    // بتبويب "أسعار البيع" عند فتح/حفظ صنف لأول مرة. نفس النمط الصحيح المُستخدَم أصلاً أدناه لـ
    // costCenterRows/brandRows.
    const unitsWithNames = (product.units ?? []).map((unit: any) => {
      const unitDef = definitionsRef.current.units.find((u: any) => u.id === unit.unit_id);
      return { ...unit, unit_name: unitDef?.unit_name || "" };
    });

    const pricesWithNames = (product.prices ?? []).map((price: any) => {
      const unitDef = definitionsRef.current.units.find((u: any) => u.id === price.unit_id);
      const priceCategoryDef = definitionsRef.current.price_category.find((p: any) => p.id === price.price_category_id);
      const currencyDef = definitionsRef.current.currencies.find((c: any) => c.id === price.currency_id);
      return {
        ...price,
        unit_name: unitDef?.unit_name || "",
        price_name: priceCategoryDef?.name || "",
        currency_name: currencyDef?.currency_name || "",
      };
    });

    const storesWithNames = (product.stores ?? []).map((store: any) => {
      const storeDef = definitionsRef.current.warehouses.find((w: any) => w.id === store.warehouse_id);
      return {
        ...store,
        store_name: storeDef?.warehouse_name || "",
        store_id: storeDef?.id || 0,
      };
    });

    const costCenterRows = buildCostCenterRows(product.cost_centers ?? [], definitionsRef.current.cost_center_types, definitionsRef.current.cost_centers);
    const brandRows = buildBrandRows(product.product_brands ?? [], definitionsRef.current.brand_types, definitionsRef.current.brands);

    const newFormData = {
      ...product,
      units: unitsWithNames,
      prices: pricesWithNames,
      stores: storesWithNames,
      cost_centers: costCenterRows,
      product_brands: brandRows,
      default_store: product.default_store ?? 0,
      notes: product.notes ?? "",
      transaction_notes: product.transaction_notes ?? "",
      original_numbers: Array.isArray(product.original_numbers) ? product.original_numbers : [],
      factory_numbers: Array.isArray(product.factory_numbers) ? product.factory_numbers : [],
      branch_ids: Array.isArray(product.branch_ids) ? product.branch_ids : [],
      // GET /api/inventory/ProductsNavigations/[navigationType] يُعيد "SELECT * FROM products"
      // خاماً — أعمدة الصلاحية/الدفعة الفعلية على الجدول هي has_expiry_date/has_batch_number لا
      // expiry_tracking/batch_tracking (المستخدَمان في formData وفي حفظ /api/inventory/products
      // POST)، فيُطابَق هنا صراحةً بدل الاعتماد على الانتشار الخام أعلاه (كان سيترك خانتي
      // "له تاريخ صلاحية"/"له رقم تشغيلي" غير مؤشَّرتين دوماً عند تعديل صنف قائم فعلياً يحملهما).
      expiry_tracking: Boolean(product.expiry_tracking ?? product.has_expiry_date ?? product.has_expiry ?? false),
      batch_tracking: Boolean(product.batch_tracking ?? product.has_batch_number ?? product.has_batch ?? false),
    };
    setFormData(newFormData);
    initialHash.current = getFormDataHash(newFormData);
    setCurrentProductId(product.id);
    setIsUsedInVouchers(false);
    fetch(`/api/inventory/products/${product.id}/voucher-usage`)
      .then((r) => (r.ok ? r.json() : { used: false }))
      .then((data) => setIsUsedInVouchers(Boolean(data?.used)))
      .catch(() => setIsUsedInVouchers(false));
    setLoading(false)
  };

  const loadData = async (
    navigationType: "first" | "previous" | "next" | "last" | "Byid",
    productId?: number, checkUnsaved?: any // explicitly pass ID when needed
  ) => {
    const currentHash = getFormDataHash(formData);
    if (checkUnsaved === undefined) checkUnsaved = true
    if (checkUnsaved === true && currentHash !== initialHash.current && initialHash.current !== 0) {
      setShowUnsaved(true)
      setNextFunction(() => () => loadData(navigationType, productId, false));
      return
    }
    try {
      if (!Util.checkUserAccess(10)) {
        toast.current?.show({
          severity: 'error',
          summary: '',
          detail: 'لا يوجد لديك استعلام صنف',
          life: 3000
        });
        return;
      }

      setLoading(true)
      let url = new URL(`/api/inventory/ProductsNavigations/${navigationType}`, location.origin);
      url.searchParams.set("type", isService ? "services" : "products");
      console.log("productId ",productId)
      // Determine ID to use
      if (navigationType === "Byid" && productId) {
        url.searchParams.set("id", String(productId));
      } else if (navigationType === "previous" || navigationType === "next") {
        url.searchParams.set("currentId", currentProductId.toString());
      }

      const res = await fetch(url.toString());
      console.log("loadData response:", res);

      // Byid (اختيار صنف من نافذة البحث) له معالجة أخطاء مستقلة عن رسائل حدود التصفّح
      // (بداية/نهاية السجلات) التي لا معنى لها هنا أصلاً — طلب صنف بعينه بمعرّفه، لا تنقّل تسلسلي.
      if (navigationType === "Byid") {
        if (!res.ok) {
          const errorBody = await res.json().catch(() => null)
          toast.current?.show({
            severity: 'error',
            summary: '',
            detail: errorBody?.error === "No product found" ? 'لم يتم العثور على الصنف' : (errorBody?.error || 'تعذّر تحميل الصنف'),
            life: 3000
          });
          setLoading(false)
          return;
        }
        const product = await res.json();
        if (!product?.id) {
          toast.current?.show({ severity: 'error', summary: '', detail: 'لم يتم العثور على الصنف', life: 3000 });
          setLoading(false)
          return;
        }
        await applyLoadedProduct(product)
        return
      }

      if (!res.ok) {
        toast.current?.show({
          severity: 'error',
          summary: '',
          detail: navigationType === "previous" || navigationType === "first"
            ? 'بداية السجلات'
            : 'نهاية السجلات',
          life: 3000
        });
        setLoading(false)
        return;
      }
      const product = await res.json();
      console.log("loadData product:", product);
      if (!product.id || product.id === currentProductId) {
        toast.current?.show({
          severity: 'error',
          summary: '',
          detail: navigationType === "previous" || navigationType === "first"
            ? 'بداية السجلات'
            : 'نهاية السجلات',
          life: 3000
        });
        setLoading(false)
        return;
      }

      await applyLoadedProduct(product)
    } catch (err) {
      console.error(err);
    }
  };


  const handleBarcodeClick = (item: any) => {
    setDialogUnitName(item.unit_name);
    const existingBarcodes = item.barcode_list || [];
    setDialogBarcodes([...existingBarcodes]);

    setBarcodeDialogOpen(true);
  };
  const handleCloseBarcodeDialog = () => {
    setFormData(prev => {
      if (!prev.units) return prev; // nothing to update

      const updatedUnits = [...prev.units];

      if (!updatedUnits[unitCurrentRow]) {
        console.error("No unit found at unitCurrentRow", unitCurrentRow);
        return prev; // prevent crash
      }

      updatedUnits[unitCurrentRow] = {
        ...updatedUnits[unitCurrentRow],
        barcode_list: [...dialogBarcodes], // update barcodes
      };

      return {
        ...prev,
        units: updatedUnits,
      };
    });

    setBarcodeDialogOpen(false);
  };
  const handleDeleteUnit = (index: number) => {
    setFormData(prev => {
      if (!prev.units) return prev; // nothing to delete

      const updatedUnits = prev.units
        .filter((_, i) => i !== index) // remove the unit at index
        .map((unit, i) => ({ ...unit, ser: i + 1 })); // reindex `ser`

      return {
        ...prev,
        units: updatedUnits,
      };
    });
  };

  const handleDeletePrice = (index: number) => {
    setFormData(prev => {
      if (!prev.prices) return prev; // nothing to delete

      const updatedPrices = prev.prices
        .filter((_, i) => i !== index) // remove the price at index
        .map((price, i) => ({ ...price, ser: i + 1 })); // reindex `ser`

      return {
        ...prev,
        prices: updatedPrices,
      };
    });
  };

  const handleDeleteStore = (index: number) => {
    setFormData(prev => {
      if (!prev.stores) return prev; // nothing to delete

      const updatedPrices = prev.stores
        .filter((_, i) => i !== index) // remove the price at index
        .map((store, i) => ({ ...store, ser: i + 1 })); // reindex `ser`

      return {
        ...prev,
        stores: updatedPrices,
      };
    });
  };

  const updateUnitRow = (index: number, patch: Partial<UnitItem>) => {
    setFormData((prev) => {
      const units = [...(prev.units ?? [])]
      if (!units[index]) return prev
      units[index] = { ...units[index], ...patch }
      return { ...prev, units }
    })
  }

  const updatePriceRow = (index: number, patch: Partial<PriceItem>) => {
    setFormData((prev) => {
      const prices = [...(prev.prices ?? [])]
      if (!prices[index]) return prev
      prices[index] = { ...prices[index], ...patch }
      return { ...prev, prices }
    })
  }

  const updateStoreRow = (index: number, patch: Partial<StoreItem>) => {
    setFormData((prev) => {
      const stores = [...(prev.stores ?? [])]
      if (!stores[index]) return prev
      stores[index] = { ...stores[index], ...patch }
      return { ...prev, stores }
    })
  }

  const countries = [
    "السعودية",
    "الإمارات",
    "الكويت",
    "قطر",
    "البحرين",
    "عمان",
    "الأردن",
    "لبنان",
    "سوريا",
    "العراق",
    "مصر",
    "المغرب",
    "تونس",
    "الجزائر",
    "أخرى",
  ]

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

  const stockStatuses = ["متوفر", "تحت الحد الأدنى", "نفد المخزون", "محجوز", "تالف"]
  const doHotKeys = useRef(true)
  const reset_fields = async (from_code = 0, code = "") => {
    
    let newCode = code;
    if (from_code === 0) newCode = await getNewProductCode();
    console.log("from_code ",from_code ," code ",code," newCode ",newCode)

    // --- Units ---
    const firstUnit = definitionsRef.current.units[0] || { id: 0, unit_name: "" };
    const newUnit: UnitItem = {
      id: 0,
      unit_id: firstUnit.id,
      unit_name: firstUnit.unit_name,
      to_main_qnty: 1,
      ser: 1,
      barcode_list: [],
    };

    // --- Prices ---
    const firstPriceCategory = definitionsRef.current.price_category[0] || { id: 0, name: "" };
    const firstCurrency = definitionsRef.current.currencies[0] || { id: 0, currency_name: "" };
    const newPrice: PriceItem = {
      id: 0,
      price_category_id: firstPriceCategory.id,
      price_name: firstPriceCategory.name,
      ser: 1,
      unit_id: firstUnit.id,
      unit_name: firstUnit.unit_name,
      currency_id: firstCurrency.id,
      currency_name: firstCurrency.currency_name,
    };

    // --- Stores ---
    const firstStore = definitionsRef.current.warehouses[0] || { id: 0, warehouse_name: "" };
    const newStore: StoreItem = {
      id: 0,
      ser: 1,
      store_id: firstStore.id,
      store_name: firstStore.warehouse_name,
      quantity: 0,
    };

    // --- Build new form data ---
    const costCenterRows = buildCostCenterRows([], definitionsRef.current.cost_center_types, definitionsRef.current.cost_centers);
    const brandRows = buildBrandRows([], definitionsRef.current.brand_types, definitionsRef.current.brands);

    const defaultProductAccounts = await loadProductAccountDefaults()

    let newFormData = {
      ...initialFormData,
      product_code: newCode,
      units: [newUnit],
      prices: [newPrice],
      stores: [newStore],
      cost_centers: costCenterRows,
      product_brands: brandRows,
      type: isService ? 2 : 1,
      service_type: isService ? 1 : 0,
      ...defaultProductAccounts,
      tax_classification_id: definitionsRef.current.tax_classifications?.[0]?.id || 0,
    };

    if (definitionsRef.current.currencies.length > 0) {
      newFormData.currency_id = definitionsRef.current.currencies[0].id;
    }

    setFormData(newFormData);
    initialHash.current = getFormDataHash(newFormData);
    setCurrentProductId(0);
    setIsUsedInVouchers(false);
    setActiveTab("units");

    product_name.current?.focus();
  };


  const onNew = async (checkUnsaved: any) => {
    const currentHash = getFormDataHash(formData);
    if (checkUnsaved === true && currentHash !== initialHash.current) {
      setShowUnsaved(true)
      setNextFunction(() => () => reset_fields());
      return
    }
    setLoading(true)
    try {
      await reset_fields()
    } finally {
      setLoading(false)
    }

  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const initFormData = async () => {
      setLoading(true)
      try {
        await fetchDefinitions();
        if (editingProduct) {
          await loadData("Byid", editingProduct.id);
        } else {
          // Populate from initial form data + first currency if available
          await reset_fields()
        }
      } catch (error) {
        console.warn("Unable to initialize compact product form:", error)
        toast.current?.show({
          severity: "error",
          summary: "خطأ في الاتصال",
          detail: "تعذر تحميل بيانات الصنف. تحقق من الاتصال ثم حاول مرة أخرى.",
          life: 5000,
        })
      } finally {
        setLoading(false)
      }
    };

    void initFormData();
  }, [editingProduct]);

  // يضمن ظهور مراكز التكلفة في الشبكة حتى لو اكتمل جلبها (fetchDefinitions) بعد استدعاء
  // reset_fields/loadData بلحظة — نفس مصدر البيانات المستخدَم في unified-accounts-refactored.tsx
  // (/api/cost-center-types و/api/cost-centers)، لكن هنا يُعاد بناء صفوف formData.cost_centers من
  // التعريفات فور توفّرها إن كانت الشبكة لا تزال فارغة رغم توفّر أنواع مراكز التكلفة.
  useEffect(() => {
    if (definitions.cost_center_types.length === 0) return
    if ((formData.cost_centers?.length ?? 0) > 0) return
    const costCenterRows = buildCostCenterRows(formData.cost_centers ?? [], definitions.cost_center_types, definitions.cost_centers)
    setFormData((prev) => ({ ...prev, cost_centers: costCenterRows }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions.cost_center_types, definitions.cost_centers])

  // نفس منطق تأثير مراكز التكلفة أعلاه تماماً لكن للعلامات التجارية
  useEffect(() => {
    if (definitions.brand_types.length === 0) return
    if ((formData.product_brands?.length ?? 0) > 0) return
    const brandRows = buildBrandRows(formData.product_brands ?? [], definitions.brand_types, definitions.brands)
    setFormData((prev) => ({ ...prev, product_brands: brandRows }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions.brand_types, definitions.brands])

  const popupHasCalled = () => {
    doHotKeys.current = false
  };
  const popupHasClosed = () => {
    doHotKeys.current = true

  };


  useEffect(() => {
    if (!visible) return; // attach only when dialog is open

    const handler = (e: KeyboardEvent) => {
      /*if (e.key === "Escape") {
        e.preventDefault();
        if (doHotKeys.current) onHideDialog(doHotKeys.current); // close only your nested popup
      }*/
      if (e.key === "F4") {
        e.preventDefault();
        if (doHotKeys.current) handleDeleteClick(true)
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (doHotKeys.current) handleSaveProduct()
      }
      if (e.key === "F5") {
        e.preventDefault();
        if (doHotKeys.current) onNew(true)
      }
    };

    window.addEventListener("keydown", handler, true); // ✅ capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [visible, onHideDialog, handleDeleteClick]);

  const formRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible || !formRootRef.current) return;
    return attachEnterAsTab(formRootRef.current, doHotKeys);
  }, [visible]);


  const adjustCode = (code: string, codeLen: number = 10): string => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSaveProduct()
  }

  const updateFormData = (field: keyof ProductFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const fetchAccountById = async (accountId: number) => {
    if (!Number.isInteger(accountId) || accountId <= 0) return null
    try {
      const response = await fetch(`/api/accounts/${accountId}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Failed to load account by id:", error)
      return null
    }
  }

  const loadProductAccountDefaults = async () => {
    try {
      const response = await fetch("/api/settings/system")
      if (!response.ok) return {}
      const settings = await response.json()
      const accountKeys = [
        { setting: "default_selling_account_id", idKey: "selling_account_id", codeKey: "selling_account_code" },
        { setting: "default_purchase_account_id", idKey: "purchase_account_id", codeKey: "purchase_account_code" },
        { setting: "default_selling_returns_account_id", idKey: "selling_returns_account_id", codeKey: "selling_returns_account_code" },
        { setting: "default_purchase_returns_account_id", idKey: "purchase_returns_account_id", codeKey: "purchase_returns_account_code" },
        { setting: "default_stock_end_account_id", idKey: "stock_end_account_id", codeKey: "stock_end_account_code" },
        { setting: "default_stock_start_account_id", idKey: "stock_start_account_id", codeKey: "stock_start_account_code" },
        { setting: "default_production_account_id", idKey: "production_account_id", codeKey: "production_account_code" },
        { setting: "default_municipality_service_account_id", idKey: "municipality_service_account_id", codeKey: "municipality_service_account_code" },
        { setting: "default_lsti3mal_account_id", idKey: "lsti3mal_account_id", codeKey: "lsti3mal_account_code" },
      ]

      const defaults: Partial<ProductFormData> = {}
      const accountPromises = accountKeys.map(async ({ setting, idKey, codeKey }) => {
        const accountId = Number(settings[setting])
        if (!Number.isInteger(accountId) || accountId <= 0) {
          return null
        }
        const account = await fetchAccountById(accountId)
        if (!account) return null
        defaults[idKey as keyof ProductFormData] = account.id
        defaults[codeKey as keyof ProductFormData] = account.code
        return null
      })
      await Promise.all(accountPromises)
      return defaults
    } catch (error) {
      console.error("Error loading product account defaults:", error)
      return {}
    }
  }

  const validateProductCode = (code: string): boolean => {
    // يجب أن يكون الكود بحد أقصى 10 خانات (كان 8 — طول التوليد التلقائي بـ
    // app/api/utilities/getLastProductCode أصبح 10 خانات) ويحتوي على أرقام وحروف إنجليزية فقط
    const regex = /^[A-Za-z0-9]{1,10}$/
    return regex.test(code)
  }
  const gridStyle = {
    maxHeight: '30vh',
    minHeight: '30vh',
    transition: 'all 0.3s ease-in-out',
  };
  const handleAddUnit = async () => {
    setFormData(prev => {
      const units = prev.units || [];
      const maxSer = units.reduce((max, row) => (row.ser > max ? row.ser : max), 0);

      const firstUnit = definitionsRef.current.units[0] || { id: 0, unit_name: "" }; // fallback

      const newUnit: UnitItem = {
        id: 0,                       // temporary unique id
        unit_id: firstUnit.id,       // first unit id
        unit_name: firstUnit.unit_name, // first unit name
        to_main_qnty: 1,                  // default value
        ser: maxSer + 1,
        barcode_list: [],
      };
      return {
        ...prev,
        units: [...units, newUnit],
      };
    });
  };


  const handleAddPriceRow = async () => {
    setFormData(prev => {
      const prevPrices = prev.prices || [];
      const maxSer = prevPrices.reduce((max, row) => (row.ser > max ? row.ser : max), 0);

      const firstPrice = definitionsRef.current.price_category[0] || { id: 0, name: "" };
      const firstUnit = definitionsRef.current.units[0] || { id: 0, unit_name: "" };
      const firstCurrency = definitionsRef.current.currencies[0] || { id: 0, currency_name: "" };

      const newPrice: PriceItem = {
        id: 0,
        price_category_id: firstPrice.id,
        price_name: firstPrice.name,
        ser: maxSer + 1,
        unit_id: firstUnit.id,
        unit_name: firstUnit.unit_name,
        currency_id: firstCurrency.id,
        currency_name: firstCurrency.currency_name,
      };

      return {
        ...prev,
        prices: [...prevPrices, newPrice],
      };
    });
  };


  const handleAddStoreRow = async () => {
    setFormData(prev => {
      const prevStores = prev.stores || [];
      const maxSer = prevStores.reduce((max, row) => (row.ser > max ? row.ser : max), 0);

      const firstStore = definitionsRef.current.warehouses[0] || { id: 0, warehouse_name: "" };

      const newStore: StoreItem = {
        id: 0,
        ser: maxSer + 1,
        store_id: firstStore.id,
        store_name: firstStore.warehouse_name,
        quantity: 0,
      };

      return {
        ...prev,
        stores: [...prevStores, newStore],
      };
    });
  };


  // تبويبات الوحدات/الأسعار/المستودعات/مراكز التكلفة تُصيَّر عبر <DataGridView> (نفس مكوّن سندات
  // الحركة/الاستلام لتوحيد الشكل) — أعمدة الاختيار (اسم الوحدة/فئة السعر/عملة البيع/المستودع/حالة
  // مركز التكلفة) للقراءة فقط بجانبها زر بحث يفتح SimpleListPicker، بدل Column.editor مباشرةً
  // (DataGridView الفعلي يتطلّب عنصر تحكم Wijmo حقيقياً واحداً ثابتاً للعمود بأكمله — انظر
  // editor?: Control | null في @grapecity/wijmo.react.grid/index.d.ts — لا دالة تُستدعى لكل خلية؛
  // محاولة سابقة بدالة تُعيد <div> فيه wjcInput.ComboBox مُنشأ يدوياً كانت تتحطّم فوراً عند فتح
  // "صنف جديد" بخطأ Wijmo الداخلي "Element is already hosting a control"). هذا النمط (نص + زر بحث)
  // مطابق تماماً لبقية أعمدة الاختيار في شاشات السندات (بحث صنف/مستودع/وحدة/حساب).
  const selectionChanged = (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => {
    setUnitCurrentRow(s.selection._row);
  }
  const cellEditEnded = (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => {
    const editedItem = s.rows[e.row]?.dataItem;
    const colName = s.columns[e.col]?.name;
    if (!editedItem || colName !== "to_main_qnty") return;
    const raw = Number(editedItem.to_main_qnty);
    const isValid = Number.isFinite(raw) && raw >= 0.000001 && raw <= 100000;
    const value = isValid ? raw : 1;
    if (!isValid) {
      toast.current?.show({
        severity: "error",
        summary: "خطأ",
        detail: "العلاقة بالوحدة الرئيسية يجب أن تكون رقماً بين 0.000001 و100000",
        life: 3000,
      });
    }
    editedItem.to_main_qnty = value;
    setFormData((prev) => {
      const units = [...(prev.units || [])];
      if (!units[e.row]) return prev;
      units[e.row] = { ...units[e.row], to_main_qnty: value };
      return { ...prev, units };
    });
  };

  const getScheme = () => {
    let scheme = {
      name: 'UnitsScheme_Table',
      responsiveColumnIndex: 2,
      columns: [
        {
          header: "##", name: "ser", width: 50
        },
        { header: "id", name: "id", width: 150, visible: false },
        { header: "رقم الوحدة", name: "unit_id", width: 150, visible: false },
        {
          header: "اسم الوحدة",
          name: "unit_name",
          width: "*",
          minWidth: 180,
          isReadOnly: true,
        },
        {
          name: "btnSearchUnit",
          header: " ",
          width: 56,
          buttonBody: "button" as const,
          align: "center" as const,
          title: "بحث",
          iconType: "search",
          isReadOnly: true,
          // ser (رقم تسلسلي مُخزَّن على الصف نفسه وقت البناء) لا ctx.row.index — هذه الشبكة
          // sortable/filter مُفعَّلان، فقد يختلف ترتيب العرض المرئي عن الفهرس الفعلي في formData.units.
          onClick: (e: any, ctx: any) => {
            setUnitPickerRow(Number(ctx.row.dataItem?.ser || 0) - 1)
            setUnitPickerOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        { header: "العلاقة بالرئيسية", name: "to_main_qnty", width: 150, dataType: "Number", visible: true },
        {
          header: "الباركود",
          name: "barcode",
          buttonBody: "button" as const,
          width: 100,
          iconType: "barcode",
          title: "باركود",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            handleBarcodeClick(ctx.row.dataItem);
          }
        },

        {
          header: "barcodeList",
          name: "barcode_list",
          width: 100,
          iconType: "barcode",
          isReadOnly: true,
          visible: false

        },
        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button" as const,
          iconType: "delete",
          title: "حذف",
          onClick: (e: any, ctx: any) => handleDeleteUnit(Number(ctx.row.dataItem?.ser || 0) - 1)
        }
      ],
    }
    return scheme;
  }

  const getPricesScheme = () => {
    let scheme = {
      name: 'PricesScheme_Table',
      responsiveColumnIndex: 2,
      columns: [
        { header: "##", name: "ser", width: 50 },
        { header: "رقم الفئة", name: "price_category_id", width: 150, visible: false },
        {
          header: "فئة السعر",
          name: "price_name",
          width: "*",
          minWidth: 180,
          isReadOnly: true,
        },
        {
          name: "btnSearchPriceCategory",
          header: " ",
          width: 56,
          buttonBody: "button" as const,
          align: "center" as const,
          title: "بحث",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setPricesPickerField("category")
            setPricesPickerRow(Number(ctx.row.dataItem?.ser || 0) - 1)
            setPricesPickerOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        { header: "رقم الوحدة", name: "unit_id", width: 150, visible: false },
        {
          header: "اسم الوحدة",
          name: "unit_name",
          width: "*",
          minWidth: 150,
          isReadOnly: true,
        },
        {
          name: "btnSearchPriceUnit",
          header: " ",
          width: 56,
          buttonBody: "button" as const,
          align: "center" as const,
          title: "بحث",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setPricesPickerField("unit")
            setPricesPickerRow(Number(ctx.row.dataItem?.ser || 0) - 1)
            setPricesPickerOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        { header: "السعر شامل الضريبة", name: "price", width: 150 },
        { header: "رقم العملة", name: "currency_id", width: 150, visible: false },
        {
          header: "عملة البيع",
          name: "currency_name",
          width: 150,
          isReadOnly: true,
        },
        {
          name: "btnSearchPriceCurrency",
          header: " ",
          width: 56,
          buttonBody: "button" as const,
          align: "center" as const,
          title: "بحث",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setPricesPickerField("currency")
            setPricesPickerRow(Number(ctx.row.dataItem?.ser || 0) - 1)
            setPricesPickerOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button" as const,
          iconType: "delete",
          title: "حذف",
          onClick: (e: any, ctx: any) => handleDeletePrice(Number(ctx.row.dataItem?.ser || 0) - 1)
        }
      ],
    };
    return scheme;
  };
  const getStoresScheme = () => ({
    name: "warehouseInventory",
    responsiveColumnIndex: 0,
    columns: [
      { header: "رقم الستودع", name: "store_id", width: 150, visible: false },
      {
        name: "store_name",
        header: "المستودع",
        width: "*",
        minWidth: 180,
        isReadOnly: true,
      },
      {
        name: "btnSearchStore",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "بحث",
        iconType: "search",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          setStorePickerRow(Number(ctx.row.dataItem?.ser || 0) - 1)
          setStorePickerOpen(true)
        },
        visible: true,
        visibleInColumnChooser: true,
      },
      { name: "shelf", header: "الرف", width: 120 },
      { name: "reorder_quantity", header: "كمية اعادة الطلب", width: 120 },
      { name: "min_quantity", header: "حد أدنى", width: 120 },
      { name: "max_quantity", header: "حد أقصى", width: 120 },
      {
        name: "actions",
        header: " ",
        buttonBody: "button" as const,
        iconType: "delete",
        className: "btn-delete",
        title: "حذف",
        width: 100,
        onClick: (e: any, ctx: any) => handleDeleteStore(Number(ctx.row.dataItem?.ser || 0) - 1)
      }
    ]
  });
  const searchProductByCode = async (code: string) => {
    if (!code || code.length === 0) return

    try {
      setIsSearching(true)
      setProductCodeError("")

      const response = await fetch(`/api/inventory/products/search?code=${encodeURIComponent(code)}`)
      if (response.ok) {
        const product = await response.json()
        if (product && product.id) {
          const isProductServiceType = Number(product.type) === 2
          if (isService && !isProductServiceType) {
            toast.current?.show({
              severity: 'error',
              summary: 'خطأ',
              detail: 'الرقم المدخل رقم صنف لا يمكن عرض تفاصيله',
              life: 2500,
            })
            await reset_fields()
            return
          }
          if (!isService && isProductServiceType) {
            toast.current?.show({
              severity: 'error',
              summary: 'خطأ',
              detail: 'الرقم المدخل رقم خدمة لا يمكن عرض التفاصيل',
              life: 2500,
            })
            await reset_fields()
            return
          }

          const unitsWithNames = (product.units ?? []).map((unit: any) => {
            const unitDef = definitions.units.find((u: any) => u.id === unit.unit_id);
            return {
              ...unit,
              unit_name: unitDef ? unitDef.unit_name : "", // fallback to empty string
            };
          });

          const pricesWithNames = (product.prices ?? []).map((price: any) => {
            const unitDef = definitions.units.find((u: any) => u.id === price.unit_id);
            const priceCategoryDef = definitions.price_category.find((p: any) => p.id === price.price_category_id);
            const currencyDef = definitions.currencies.find((c: any) => c.id === price.currency_id);

            return {
              ...price,
              unit_name: unitDef ? unitDef.unit_name : "",
              price_name: priceCategoryDef ? priceCategoryDef.name : "",
              currency_name: currencyDef ? currencyDef.currency_name : "",
            };
          });

          const costCenterRows = buildCostCenterRows(product.cost_centers ?? [], definitionsRef.current.cost_center_types, definitionsRef.current.cost_centers);
          const brandRows = buildBrandRows(product.product_brands ?? [], definitionsRef.current.brand_types, definitionsRef.current.brands);

          setFormData({
            ...product,
            units: unitsWithNames,
            prices: pricesWithNames,
            cost_centers: costCenterRows,
            product_brands: brandRows,
            notes: product.notes ?? "",
            transaction_notes: product.transaction_notes ?? "",
            original_numbers: Array.isArray(product.original_numbers) ? product.original_numbers : [],
            factory_numbers: Array.isArray(product.factory_numbers) ? product.factory_numbers : [],
            branch_ids: Array.isArray(product.branch_ids) ? product.branch_ids : [],

          });
          setCurrentProductId(product.id);
        }
      } else if (response.status === 403) {
        toast.current?.show({
          severity: 'error',
          summary: 'خطأ',
          detail: 'الصنف محذوف لا يمكن عرض بياناته',
          life: 1500
        });
        reset_fields()
      }
      else if (response.status === 404) {
        reset_fields(1, code)
      }
    } catch (error) {
      console.error("Error searching for product:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleProductCodeChange = (value: string) => {
    // تنظيف القيمة للسماح بالأرقام والحروف الإنجليزية فقط
    const cleanValue = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10)

    if (cleanValue !== value) {
      setProductCodeError("يُسمح بالأرقام والحروف الإنجليزية فقط (حد أقصى 10 خانات)")
    } else {
      setProductCodeError("")
    }

    updateFormData("product_code", cleanValue)
  }

  const handleProductCodeBlur = async () => {
    const adjustedCode = adjustCode(formData.product_code)
    updateFormData("product_code", adjustedCode)
    await searchProductByCode(adjustedCode)
  }

  const buildCostCenterRows = (assignedRows: any[] = [], types: any[] = [], centers: any[] = []) => {
    return (types || []).map((type: any) => {
      const assignment = (assignedRows || []).find((row: any) => Number(row?.cost_center_type_id) === Number(type.id))
      const selectedId = assignment?.default_cost_center_id != null ? Number(assignment.default_cost_center_id) : null
      const requiredValue = Number(assignment?.required_in_transactions ?? 1)
      const requiredLabel = costCenterStatusOptions.find((option) => option.value === requiredValue)?.label || "اختياري"
      return {
        id: assignment?.id ?? 0,
        product_id: assignment?.product_id ?? 0,
        cost_center_type_id: Number(type.id),
        cost_center_type_name: type.name || "",
        required_in_transactions: requiredValue,
        required_label: requiredLabel,
        default_cost_center_id: selectedId,
        cost_center_name: selectedId != null
          ? centers.find((center: any) => Number(center.id) === selectedId)?.name || ""
          : "",
      }
    })
  }

  const updateCostCenterRow = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const rows = [...(prev.cost_centers ?? [])]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, cost_centers: rows }
    })
  }

  // نفس منطق buildCostCenterRows أعلاه تماماً لكن للعلامات التجارية — صف واحد لكل نوع علامة تجارية
  // (brand_types)، مع إسناد اختياري لعلامة تجارية (brands) محدَّدة من نفس النوع.
  const buildBrandRows = (assignedRows: any[] = [], types: any[] = [], brandsList: any[] = []) => {
    return (types || []).map((type: any) => {
      const assignment = (assignedRows || []).find((row: any) => Number(row?.brand_type_id) === Number(type.id))
      const selectedId = assignment?.brand_id != null ? Number(assignment.brand_id) : null
      const requiredValue = Number(assignment?.required_in_transactions ?? 1)
      const requiredLabel = costCenterStatusOptions.find((option) => option.value === requiredValue)?.label || "اختياري"
      return {
        id: assignment?.id ?? 0,
        product_id: assignment?.product_id ?? 0,
        brand_type_id: Number(type.id),
        brand_type_name: type.name || "",
        required_in_transactions: requiredValue,
        required_label: requiredLabel,
        brand_id: selectedId,
        brand_name: selectedId != null
          ? brandsList.find((brand: any) => Number(brand.id) === selectedId)?.name || ""
          : "",
      }
    })
  }

  const updateBrandRow = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const rows = [...(prev.product_brands ?? [])]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, product_brands: rows }
    })
  }

  const fetchDefinitions = async () => {
    try {
      const definitionsObj: any = {}
      let failedRequests = 0
      const fetchDefinition = async (url: string): Promise<Response> => {
        try {
          return await fetch(url)
        } catch (error) {
          failedRequests += 1
          console.warn(`Unable to load product definition ${url}:`, error)
          return new Response(null, { status: 503, statusText: "Network request failed" })
        }
      }

      // Categories
      const categoriesResponse = await fetchDefinition("/api/item-groups")
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        definitionsObj.categoriesData = categoriesData
        definitionsRef.current.categories = categoriesData
        setDefinitions((prev) => ({ ...prev, categories: categoriesData }))
      }

      // Suppliers
      const suppliersResponse = await fetchDefinition("/api/suppliers")
      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        definitionsObj.suppliersData = suppliersData
        setDefinitions((prev) => ({ ...prev, suppliers: suppliersData }))
      }

      // Warehouses
      const warehousesResponse = await fetchDefinition("/api/warehouses")
      if (warehousesResponse.ok) {
        const warehousesData = await warehousesResponse.json()
        definitionsObj.warehousesData = warehousesData
        definitionsRef.current.warehouses = warehousesData
        setDefinitions((prev) => ({ ...prev, warehouses: warehousesData }))
      }

      // Units
      const unitsResponse = await fetchDefinition("/api/units")
      if (unitsResponse.ok) {
        const unitsData = await unitsResponse.json()
        definitionsObj.unitsData = unitsData
        definitionsRef.current.units = unitsData
        setDefinitions((prev) => ({ ...prev, units: unitsData }))
      }

      // Currencies
      const currenciesResponse = await fetchDefinition("/api/exchange-rates")
      if (currenciesResponse.ok) {
        const currenciesData = await currenciesResponse.json()
        definitionsObj.currenciesData = currenciesData.rates
        definitionsRef.current.currencies = currenciesData.rates
        setDefinitions((prev) => ({ ...prev, currencies: currenciesData.rates }))
      }

      // Price categories
      const pricesResponse = await fetchDefinition("/api/pricecategory")
      if (pricesResponse.ok) {
        const pricesData = await pricesResponse.json()
        definitionsObj.pricesData = pricesData
        definitionsRef.current.price_category = pricesData
        setDefinitions((prev) => ({ ...prev, price_category: pricesData }))
      }

      // Measurment types (نوع القياس)
      const measurmentTypesResponse = await fetchDefinition("/api/measurment-types")
      if (measurmentTypesResponse.ok) {
        const measurmentTypesData = await measurmentTypesResponse.json()
        definitionsObj.measurmentTypesData = measurmentTypesData
        definitionsRef.current.measurment_types = measurmentTypesData
        setDefinitions((prev) => ({ ...prev, measurment_types: measurmentTypesData }))
      }

      // فروع تقييد ظهور الصنف بالبحث (اختياري — انظر حقل "الفروع" أدناه بتبويب "عام")
      try {
        const branchesResp = await fetchDefinition("/api/branches")
        if (branchesResp.ok) {
          const branchesData = await branchesResp.json()
          const list = Array.isArray(branchesData) ? branchesData : []
          definitionsObj.branches = list
          definitionsRef.current.branches = list
          setDefinitions((prev) => ({ ...prev, branches: list }))
        }
      } catch (e) {
        console.warn("Failed to load branches", e)
      }

      // Tax classifications
      try {
        const taxResp = await fetchDefinition("/api/tax-classifications")
        if (taxResp.ok) {
          const taxData = await taxResp.json()
          // endpoint returns { categories }
          const list = taxData.categories || taxData || []
          definitionsObj.tax_classifications = list
          definitionsRef.current.tax_classifications = list
          setDefinitions((prev) => ({ ...prev, tax_classifications: list }))
        }
      } catch (e) {
        console.warn("Failed to load tax classifications", e)
      }

      const productCategoryResponse = await fetchDefinition("/api/product-categories")
      if (productCategoryResponse.ok) {
        const productCategory = await productCategoryResponse.json()
        definitionsObj.product_category = productCategory
        definitionsRef.current.product_category = productCategory.categories
        setDefinitions((prev) => ({ ...prev, product_category: productCategory.categories }))
      }

      const costCenterTypeResponse = await fetchDefinition("/api/cost-center-types")
      if (costCenterTypeResponse.ok) {
        const costCenterTypesData = (await costCenterTypeResponse.json()) as Array<{ id: number; name: string }>
        // مطابقاً لِـunified-accounts-refactored.tsx: ترتيب تصاعدي حسب الرقم — الاستجابة الخام غير
        // مُرتَّبة بالضرورة.
        costCenterTypesData.sort((a, b) => (a.id || 0) - (b.id || 0))
        definitionsObj.costCenterTypes = costCenterTypesData
        definitionsRef.current.cost_center_types = costCenterTypesData
        setCostCenterTypes(costCenterTypesData)
        setDefinitions((prev) => ({ ...prev, cost_center_types: costCenterTypesData }))
      }

      const costCentersResponse = await fetchDefinition("/api/cost-centers")
      if (costCentersResponse.ok) {
        const costCentersData = await costCentersResponse.json()
        definitionsObj.costCenters = costCentersData
        definitionsRef.current.cost_centers = costCentersData
        setCostCenters(costCentersData)
        setDefinitions((prev) => ({ ...prev, cost_centers: costCentersData }))
      }

      const brandTypesResponse = await fetchDefinition("/api/brand-types")
      if (brandTypesResponse.ok) {
        const brandTypesData = (await brandTypesResponse.json()) as Array<{ id: number; name: string }>
        brandTypesData.sort((a, b) => (a.id || 0) - (b.id || 0))
        definitionsObj.brandTypes = brandTypesData
        definitionsRef.current.brand_types = brandTypesData
        setBrandTypes(brandTypesData)
        setDefinitions((prev) => ({ ...prev, brand_types: brandTypesData }))
      }

      const brandsResponse = await fetchDefinition("/api/brands")
      if (brandsResponse.ok) {
        const brandsData = await brandsResponse.json()
        definitionsObj.brands = brandsData
        definitionsRef.current.brands = brandsData
        setBrands(brandsData)
        setDefinitions((prev) => ({ ...prev, brands: brandsData }))
      }
      if (failedRequests > 0) {
        toast.current?.show({
          severity: "warn",
          summary: "اتصال غير مستقر",
          detail: "تعذر تحميل بعض تعريفات الأصناف. يمكنك متابعة العمل أو إعادة المحاولة.",
          life: 4000,
        })
      }
      return definitionsObj
    } catch (error) {
      console.warn("Error fetching product definitions:", error)
      return {}
    }
  }




  const handleCategoryChange = (value: number) => {
    setFormData((prev) => ({
      ...prev,
      main_stock_id: value,
    }));
  }

  const costCenterStatusOptions = [
    { label: "اختياري", value: 1 },
    { label: "إجباري", value: 2 },
    { label: "ممنوع", value: 3 },
  ]

  // ترتيب ثابت بلا إعادة فرز حسب القيمة المُختارة حالياً — النسخة السابقة كانت تُعيد بناء المصفوفة
  // (بمرجع جديد) وتُقدِّم العنصر المُختار لأول القائمة في كل عرض، ما كان يُربك حالة Dropdown
  // الداخلية (فتح/تحديد) ويمنع فعلياً تغيير الخيار عند الضغط على عنصر آخر.
  const defaultStoreOptions = useMemo(
    () => [
      { label: "بلا تحديد", value: null as number | null },
      ...(definitions.warehouses || []).map((warehouse: any) => ({
        label: warehouse.warehouse_name,
        value: Number(warehouse.id),
      })),
    ],
    [definitions.warehouses],
  )

  const costCenterScheme = useMemo(() => ({
    name: "ProductCostCenterScheme",
    columns: [
      { header: "نوع مركز التكلفة", name: "cost_center_type_name", width: '*', minWidth: 100, isReadOnly: true },
      {
        header: "الحالة",
        name: "required_label",
        width: 140,
        minWidth: 120,
        isReadOnly: true,
      },
      {
        name: "btnStatus",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "تغيير الحالة",
        iconType: "edit",
        className: "btn-status",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          setStatusPickerRow(ctx.row.index)
          setStatusPickerOpen(true)
        },
        visible: true,
        visibleInColumnChooser: true,
      },
      {
        header: "مركز التكلفة",
        name: "cost_center_name",
        width: 260,
        minWidth: 220,
        isReadOnly: true,
      },
      {
        name: "btnSearch",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "بحث",
        iconType: "search",
        className: "btn-search",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          const row = ctx.row.dataItem
          if (!row) return
          setSelectedCostCenterRowIndex(ctx.row.index)
          setSelectedCostCenterType({ id: Number(row.cost_center_type_id), name: row.cost_center_type_name || "" })
          setCostCenterSearchOpen(true)
        },
        visible: true,
        visibleInColumnChooser: true,
      },
      {
        name: "btnDelete",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "حذف",
        iconType: "delete",
        className: "btn-delete",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          const rowIndex = ctx.row.index
          updateCostCenterRow(rowIndex, "default_cost_center_id", null)
          updateCostCenterRow(rowIndex, "cost_center_name", "")
        },
        visible: true,
        visibleInColumnChooser: true,
      },
    ],
  }), [costCenterStatusOptions, formData.cost_centers])

  // نفس نمط costCenterScheme أعلاه تماماً لكن للعلامات التجارية
  const brandScheme = useMemo(() => ({
    name: "ProductBrandScheme",
    columns: [
      { header: "نوع العلامة التجارية", name: "brand_type_name", width: '*', minWidth: 100, isReadOnly: true },
      {
        header: "العلامة التجارية",
        name: "brand_name",
        width: 260,
        minWidth: 220,
        isReadOnly: true,
      },
      {
        name: "btnSearch",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "بحث",
        iconType: "search",
        className: "btn-search",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          const row = ctx.row.dataItem
          if (!row) return
          setSelectedBrandRowIndex(ctx.row.index)
          setSelectedBrandType({ id: Number(row.brand_type_id), name: row.brand_type_name || "" })
          setBrandSearchOpen(true)
        },
        visible: true,
        visibleInColumnChooser: true,
      },
      {
        name: "btnDelete",
        header: " ",
        width: 56,
        buttonBody: "button" as const,
        align: "center" as const,
        title: "حذف",
        iconType: "delete",
        className: "btn-delete",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          const rowIndex = ctx.row.index
          updateBrandRow(rowIndex, "brand_id", null)
          updateBrandRow(rowIndex, "brand_name", "")
        },
        visible: true,
        visibleInColumnChooser: true,
      },
    ],
  }), [formData.product_brands])

  return (
    <div className="h-full min-h-[70vh] min-w-0 flex flex-col bg-background overflow-hidden text-lg compact-product-form-root" dir="rtl">
      {/* زر الإغلاق يطفو على الحافة اليسرى لشريط الأدوات في نفس الصف العلوي، كما في شاشات السندات. */}
      <div className="relative flex flex-shrink-0 items-center px-2 pt-2 sm:px-4 sm:pt-4" dir="rtl">
        <button
          type="button"
          onClick={(e) => onHideDialog(e)}
          className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg ring-1 ring-slate-200 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:left-5"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">إغلاق</span>
        </button>
        <UniversalToolbar
          currentRecord={1}
          totalRecords={1}
          onFirst={async () => { await loadData('first') }}
          onPrevious={async () => { await loadData('previous') }}
          onNext={async () => { await loadData('next') }}
          onLast={async () => { await loadData('last') }}
          onNew={() => onNew(true)}
          onSave={() => { handleSaveProduct(); }}
          onDelete={() => { handleDeleteClick(true) }}
          onReport={() => undefined}
          onExportExcel={() => undefined}
          isLoading={isSearching}
          isSaving={isSubmitting}
          canSave={true}
          canDelete={currentProductId > 0}
          isFirstRecord={true}
          isLastRecord={true}
        />
      </div>
      <ConfirmDialogYesNo
        visible={showConfirm}
        onConfirm={confirmDelete}
        onCancel={() => { setShowConfirm(false); popupHasClosed() }}
        message="هل تريد حذف هذا الصنف؟"
      />

      <ConfirmDialogYesNo
        visible={showUnsaved}
        onConfirm={() => { setShowUnsaved(false); handleSaveProduct() }}
        onCancel={async () => {
          setShowUnsaved(false); popupHasClosed();
          if (nextFunction) {
            nextFunction();
            setNextFunction(null);

          }
        }}
        message="تم تعديل السجل هل تريد الحفظ؟"
        onBack={() => { setShowUnsaved(false); popupHasClosed(); }}
        showBack={true}
      />

      <Toast ref={toast} position="top-left" className="custom-toast" />
      <ProgressSpinner loading={loading} />
      <div ref={formRootRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="mx-auto w-full max-w-full space-y-4 p-2 pb-8 sm:space-y-6 sm:p-4 sm:pb-10 lg:p-6 lg:pb-12">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-3 sm:text-2xl">
                <Package className="h-7 w-7 text-primary" />
                {isService ? (editingProduct ? "تعديل خدمة" : "خدمة جديدة") : (editingProduct ? "تعديل صنف" : "صنف جديد")}
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground sm:text-xl">المعلومات الأساسية والتعريف</h2>
            </div>
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-6">
                {/* نفس تصميم components/products/unified-customers.tsx: الصورة يساراً، وأكواد
                    التعريف (الرقم/الاسم العربي/الاسم الإنجليزي) يميناً — الرقم في سطره الخاص،
                    ثم كل اسم بسطر كامل العرض تحته. */}
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <ProductCodeInput
                          formData={formData}
                          handleProductCodeChange={(code) => setFormData((prev) => ({ ...prev, product_code: code }))}
                          onBlur={async () => {
                            const adjustedCode = adjustCode(formData.product_code || "")
                            setFormData((prev) => ({ ...prev, product_code: adjustedCode }))
                            await searchProductByCode(adjustedCode)
                          }}
                          onSelectProductId={(id) => {
                            // لا يُعدَّل formData.id هنا مباشرة قبل اكتمال التحميل — كان هذا يُخطئ
                            // مقارنة الهاش في loadData (تُحسَب من formData الحالي الذي أصبح يحمل
                            // معرّف الصنف الجديد بينما initialHash لا يزال لبيانات الصنف/النموذج
                            // السابق)، فتظهر رسالة تصفّح غير صحيحة بدل تحميل الصنف المختار فعلياً.
                            // loadData("Byid", ...) وحدها من تُحدِّث formData بالكامل عند النجاح.
                            loadData("Byid", id)
                          }}
                          visible={true}
                          priceCategoryId={1}
                          productTypes={isService ? [2] : [1]}
                          codeLabel={isService ? "رقم الخدمة *" : "رقم الصنف *"}
                          searchTitle={isService ? "بحث الخدمات" : "بحث الأصناف"}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="product_name" className="text-sm font-medium">
                          {isService ? "اسم الخدمة *" : "اسم الصنف *"}
                        </Label>
                        <Input
                          ref={product_name}
                          id="product_name"
                          value={formData.product_name}
                          onChange={(e) => updateFormData("product_name", e.target.value)}
                          className="text-right"
                          placeholder={isService ? "اسم الخدمة باللغة العربية" : "اسم الصنف باللغة العربية"}
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="product_name_en" className="text-sm font-medium">
                          {isService ? "اسم الخدمة بالإنجليزية" : "اسم الصنف بالإنجليزية"}
                        </Label>
                        <Input
                          id="product_name_en"
                          value={formData.product_name_en}
                          onChange={(e) => updateFormData("product_name_en", e.target.value)}
                          className="text-left"
                          placeholder={isService ? "اسم الخدمة بالإنجليزية" : "اسم الصنف بالإنجليزية"}
                        />
                      </div>
                    </div>
                  </div>

                  <ImageUploadField
                    value={formData.product_image}
                    onChange={(value) => updateFormData("product_image", value)}
                    label={isService ? "صورة الخدمة" : "صورة الصنف"}
                    size={160}
                  />
                </div>


                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  {!isService && (
                    <>
                      <div>
                        <Label htmlFor="category" className="text-sm font-medium">
                          التصنيف
                        </Label>
                        <div className={sharedDropdownStyles.dropDownWrapper}>
                          <PrimeDropdown
                            inputId="category_id"
                            value={formData.category_id ? Number(formData.category_id) : null}
                            options={[
                              { label: "بلا", value: null },
                              ...(definitions.product_category || []).map((category) => ({
                                label: category.name,
                                value: Number(category.id),
                              })),
                            ]}
                            optionLabel="label"
                            optionValue="value"
                            placeholder="اختر التصنيف"
                            className={`${sharedDropdownStyles.dropDown} w-full`}
                            panelClassName={sharedDropdownStyles.dropDownPanel}
                            appendTo="self"
                            onChange={(e: any) => updateFormData("category_id", Number(e.value) || 0)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="category" className="text-sm font-medium">
                          مجموعة الصنف
                        </Label>
                        <div className={sharedDropdownStyles.dropDownWrapper}>
                          <PrimeDropdown
                            inputId="main_stock_id"
                            value={formData.main_stock_id ? Number(formData.main_stock_id) : null}
                            options={[
                              { label: "بلا", value: null },
                              ...(definitions.categories || []).map((category) => ({
                                label: category.group_name,
                                value: Number(category.id),
                              })),
                            ]}
                            optionLabel="label"
                            optionValue="value"
                            placeholder="اختر المجموعة"
                            className={`${sharedDropdownStyles.dropDown} w-full`}
                            panelClassName={sharedDropdownStyles.dropDownPanel}
                            appendTo="self"
                            onChange={(e: any) => updateFormData("main_stock_id", Number(e.value) || 0)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="product_type" className="text-sm font-medium">
                          نوع الصنف
                        </Label>
                        <div className={sharedDropdownStyles.dropDownWrapper}>
                          <PrimeDropdown
                            inputId="product_type"
                            value={formData.product_type || null}
                            options={PRODUCT_TYPE_OPTIONS}
                            optionLabel="label"
                            optionValue="value"
                            placeholder="اختر نوع الصنف"
                            className={`${sharedDropdownStyles.dropDown} w-full`}
                            panelClassName={sharedDropdownStyles.dropDownPanel}
                            appendTo="self"
                            onChange={(e: any) => updateFormData("product_type", e.value || 1)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="tax_classification" className="text-sm font-medium">
                          التصنيف الضريبي
                        </Label>
                        <div className={sharedDropdownStyles.dropDownWrapper}>
                          <PrimeDropdown
                            inputId="tax_classification"
                            value={formData.tax_classification_id || null}
                            options={[
                              { label: "بلا", value: null },
                              ...(definitions.tax_classifications || []).map((t: any) => ({ label: t.name, value: Number(t.id) })),
                            ]}
                            optionLabel="label"
                            optionValue="value"
                            placeholder="اختر التصنيف الضريبي"
                            className={`${sharedDropdownStyles.dropDown} w-full`}
                            panelClassName={sharedDropdownStyles.dropDownPanel}
                            appendTo="self"
                            onChange={(e: any) => updateFormData("tax_classification_id", Number(e.value) || 0)}
                          />
                        </div>
                      </div>

                      <div>
                        {/* تقييد ظهور الصنف بفروع معيّنة (اختياري) — بلا أي فرع مُحدَّد هنا يبقى
                            الصنف ظاهراً لكل الفروع (السلوك الافتراضي/الحالي دون تغيير)؛ باختيار فرع
                            أو أكثر لا يظهر الصنف بنتائج البحث إلا لمستخدم فرعه النشط أحد هذه الفروع. */}
                        <MultiSelect
                          caption="الفروع (اختياري — بلا تحديد = كل الفروع)"
                          inputId="branch_ids"
                          value={formData.branch_ids || []}
                          options={definitions.branches}
                          optionLabel="branch_name"
                          optionValue="id"
                          placeholder="كل الفروع"
                          showFilter={true}
                          showCheck={true}
                          showMultiSelect={true}
                          onChange={(e: any) => updateFormData("branch_ids", Array.isArray(e.value) ? e.value.map(Number) : [])}
                        />
                      </div>
                    </>
                  )}

                  {isService && (
                    <div className="xl:col-span-2">
                      <Label className="text-sm font-medium">نوع الخدمة</Label>
                      <div className="mt-2 flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="service_type"
                            value="1"
                            checked={formData.service_type === 1}
                            onChange={() => updateFormData("service_type", 1)}
                          />
                          خدمة مقدمة
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="service_type"
                            value="0"
                            checked={formData.service_type === 0}
                            onChange={() => updateFormData("service_type", 0)}
                          />
                          خدمة متلقاة
                        </label>
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} dir="rtl" className="min-w-0">
              <TabsList className="flex h-auto w-full min-w-0 flex-nowrap justify-start gap-2 overflow-x-auto rounded-xl border border-slate-200/60 bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 p-2 shadow-md backdrop-blur-sm" style={{ direction: "rtl" }}>
                <TabsTrigger value="units" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">الوحدات</TabsTrigger>
                <TabsTrigger value="prices" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">اسعار البيع</TabsTrigger>
                <TabsTrigger value="accounts" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">{isService ? 'الحسابات المحاسبية' : 'الحسابات'}</TabsTrigger>
                {isService ? null : (
                  <>
                    <TabsTrigger value="attributes" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">المتغيرات والخصائص</TabsTrigger>
                    <TabsTrigger value="brand" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">العلامة التجارية</TabsTrigger>
                    <TabsTrigger value="measurements" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">القياسات</TabsTrigger>
                    <TabsTrigger value="pricing" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">سعر الشراء والضريبة</TabsTrigger>
                    <TabsTrigger value="additional" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">معلومات إضافية</TabsTrigger>
                    <TabsTrigger value="stores" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">تفاصيل المستودعات</TabsTrigger>
                    <TabsTrigger value="costcenters" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">مراكز التكلفة</TabsTrigger>
                    <TabsTrigger value="notes" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-600 data-[state=active]:to-slate-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">ملاحظات</TabsTrigger>
                    <TabsTrigger value="attachments" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-600 data-[state=active]:to-slate-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">المرفقات</TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="units">
                <Card>
                  <CardHeader className="pb-2 flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Package className="h-5 w-5 text-primary" />
                      الوحدات
                    </CardTitle>
                    {!isService && (
                      <button type="button"
                        className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded hover:bg-blue-600 transition"
                        onClick={() => handleAddUnit()}
                      >
                        <Plus className="h-4 w-4" />
                        إضافة
                      </button>
                    )}
                  </CardHeader>

                  <CardContent>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-12">
                        <div className="w-full overflow-x-auto">
                          <DataGridView
                            style={{ height: TABS_GRID_HEIGHT }}
                            dataSource={formData.units ?? []}
                            scheme={getScheme()}
                            selectionChanged={selectionChanged}
                            cellEditEnded={(s: any, e: any) => cellEditEnded(s, e)}
                            isReport={false}
                            showContextMenu={false}
                            dontConvertToCards={true}
                          />
                        </div>
                        <ProductBarcodes
                          open={barcodeDialogOpen}
                          onOpenChange={(open) => {
                            if (!open) handleCloseBarcodeDialog();
                            setBarcodeDialogOpen(open);
                          }}
                          unitName={dialogUnitName}
                          barcodes={dialogBarcodes}
                          onUpdateBarcodes={(newBarcodes) => setDialogBarcodes(newBarcodes)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="prices">
                <Card>
                  <CardHeader className="pb-2 flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Package className="h-5 w-5 text-primary" />
                      اسعار البيع
                    </CardTitle>
                    <button type="button"
                      className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded hover:bg-blue-600 transition"
                      onClick={() => handleAddPriceRow()}
                    >
                      <Plus className="h-4 w-4" />
                      إضافة
                    </button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-12">
                        <div className="w-full overflow-x-auto">
                          <DataGridView
                            style={{ height: TABS_GRID_HEIGHT }}
                            dataSource={formData.prices ?? []}
                            scheme={getPricesScheme()}
                            isReport={false}
                            showContextMenu={false}
                            dontConvertToCards={true}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="accounts">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Currency className="h-5 w-5 text-primary" />
                      الحسابات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      <div>
                        <AutoCompleteAccount
                          value={formData.selling_account_id ? String(formData.selling_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("selling_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("selling_account_id", account?.id ?? 0)}
                          label="حساب المبيعات"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.purchase_account_id ? String(formData.purchase_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("purchase_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("purchase_account_id", account?.id ?? 0)}
                          label="حساب المشتريات"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.selling_returns_account_id ? String(formData.selling_returns_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("selling_returns_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("selling_returns_account_id", account?.id ?? 0)}
                          label="حساب مرتجعات المبيعات"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.purchase_returns_account_id ? String(formData.purchase_returns_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("purchase_returns_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("purchase_returns_account_id", account?.id ?? 0)}
                          label="حساب مرتجعات المشتريات"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.stock_end_account_id ? String(formData.stock_end_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("stock_end_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("stock_end_account_id", account?.id ?? 0)}
                          label="حساب تقييم بضاعة آخر المدة"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.stock_start_account_id ? String(formData.stock_start_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("stock_start_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("stock_start_account_id", account?.id ?? 0)}
                          label="حساب تقييم بضاعة أول المدة"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      <div>
                        <AutoCompleteAccount
                          value={formData.production_account_id ? String(formData.production_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("production_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("production_account_id", account?.id ?? 0)}
                          label="حساب الإنتاج"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                      
                      <div>
                        <AutoCompleteAccount
                          value={formData.lsti3mal_account_id ? String(formData.lsti3mal_account_id) : ""}
                          valueMode="id"
                          onValueChange={(value) => updateFormData("lsti3mal_account_id", Number(value) || 0)}
                          onAccountSelect={(account) => updateFormData("lsti3mal_account_id", account?.id ?? 0)}
                          label="حساب المصروف في سند الاستعمال"
                          placeholder=""
                          showClearButton={true}
                          showSearchButton={true}
                          className="w-full"
                          showCostCenterButton={false}
                          leafOnly
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {!isService && (
                <>
                  <TabsContent value="attributes">
                    <Card>
                      <CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-lg"><SlidersHorizontal className="h-5 w-5 text-violet-600" />المتغيرات والخصائص</CardTitle><Button type="button" variant="outline" onClick={() => setFormData((previous) => ({ ...previous, attributes: [...(previous.attributes || []), { name: "", values: [] }] }))}><Plus className="ml-2 h-4 w-4" />إضافة متغير</Button></div></CardHeader>
                      <CardContent className="space-y-3">
                        {!(formData.attributes || []).length && <button type="button" onClick={() => setFormData((previous) => ({ ...previous, attributes: [{ name: "", values: [] }] }))} className="w-full rounded-xl border-2 border-dashed p-8 text-muted-foreground hover:border-violet-400 hover:text-violet-700">+ إضافة أول متغير للصنف</button>}
                        {(formData.attributes || []).map((attribute, index) => {
                          const normalizedName = attribute.name.trim().toLocaleLowerCase()
                          const catalogEntry = attributeCatalog.find((item) => item.name.toLocaleLowerCase() === normalizedName)
                          const updateAttribute = (patch: Partial<ProductAttributeLine>) => setFormData((previous) => ({ ...previous, attributes: (previous.attributes || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))
                          return <div key={index} className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(180px,.7fr)_minmax(260px,1.3fr)_44px]">
                            <div className="min-w-0"><Label>المتغير *</Label><div className="mt-1"><AttributeNameInput value={attribute.name} catalog={attributeCatalog} onChange={(name) => updateAttribute({ name })} onCreate={(name) => { updateAttribute({ name }); void createAttributeCatalogItem(name) }} /></div></div>
                            <div className="min-w-0"><Label>الخصائص *</Label><div className="mt-1"><AttributeValueInput disabled={!catalogEntry} values={attribute.values} valueImages={attribute.value_images} suggestions={catalogEntry?.values || []} onChange={(values) => updateAttribute({ values, value_images: Object.fromEntries(Object.entries(attribute.value_images || {}).filter(([value]) => values.includes(value))) })} onImageChange={(value, image) => updateAttribute({ value_images: { ...(attribute.value_images || {}), [value]: image } })} onCreate={(value) => void createAttributeCatalogItem(attribute.name, value)} /></div></div>
                            <Button type="button" size="icon" variant="ghost" className="self-end text-red-600" onClick={() => setFormData((previous) => ({ ...previous, attributes: (previous.attributes || []).filter((_, itemIndex) => itemIndex !== index) }))}><X className="h-4 w-4" /></Button>
                          </div>
                        })}
                        <p className="text-xs text-muted-foreground">يبقى هذا صنفاً واحداً؛ تُختار خصائص المتغير المطلوبة عند إضافته إلى أي حركة.</p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="brand">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Settings className="h-5 w-5 text-primary" />
                          العلامة التجارية
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* شبكة العلامات التجارية بنفس أسلوب تبويب "مراكز التكلفة" تماماً: صف واحد
                            لكل نوع علامة تجارية، بزر بحث يفتح SearchBrandDialog مقيَّداً بذلك النوع. */}
                        <div className="w-full overflow-x-auto rounded-lg border">
                          <DataGridView
                            style={{ height: TABS_GRID_HEIGHT }}
                            scheme={brandScheme}
                            dataSource={formData.product_brands ?? []}
                            isReport={false}
                            showContextMenu={false}
                            dontConvertToCards={true}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="measurements">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Package className="h-5 w-5 text-primary" />
                          القياسات
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                          <div>
                            <Label htmlFor="measurment_id" className="text-sm font-medium">
                              نوع القياس
                            </Label>
                            <div className={sharedDropdownStyles.dropDownWrapper}>
                              <PrimeDropdown
                                inputId="measurment_id"
                                value={formData?.measurment_id != null ? Number(formData.measurment_id) : null}
                                options={definitions.measurment_types}
                                optionLabel="name"
                                optionValue="id"
                                placeholder="اختر نوع القياس"
                                className={`${sharedDropdownStyles.dropDown} w-full`}
                                panelClassName={sharedDropdownStyles.dropDownPanel}
                                appendTo="self"
                                onChange={(e: any) => {
                                  const newValue = Number(e.value) || 1
                                  if (
                                    newValue !== 1 &&
                                    (formData.expiry_tracking || formData.serial_tracking || formData.batch_tracking)
                                  ) {
                                    toast.current?.show({
                                      severity: "error",
                                      summary: "خطأ",
                                      detail: MEASUREMENT_TRACKING_CONFLICT_MSG,
                                      life: 3000,
                                    })
                                    return
                                  }
                                  updateFormData("measurment_id", newValue)
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="length" className="text-sm font-medium">
                              الطول
                            </Label>
                            <Input
                              id="length"
                              type="number"
                              step="0.01"
                              value={formData.length}
                              onChange={(e) => updateFormData("length", Number.parseFloat(e.target.value) || 1)}
                              className="text-right"
                            />
                          </div>
                          <div>
                            <Label htmlFor="width" className="text-sm font-medium">
                              العرض
                            </Label>
                            <Input
                              id="width"
                              type="number"
                              step="0.01"
                              value={formData.width}
                              onChange={(e) => updateFormData("width", Number.parseFloat(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>
                          <div>
                            <Label htmlFor="height" className="text-sm font-medium">
                              الارتفاع
                            </Label>
                            <Input
                              id="height"
                              value={formData.height}
                              onChange={(e) => updateFormData("height", e.target.value)}
                              className="text-right"
                              placeholder=""
                            />
                          </div>
                          <div>
                            <Label htmlFor="density" className="text-sm font-medium">
                              الكثافة
                            </Label>
                            <Input
                              id="density"
                              value={formData.density}
                              onChange={(e) => updateFormData("density", e.target.value)}
                              className="text-right"
                              placeholder=""
                            />
                          </div>
                          <div>
                            <Label htmlFor="color" className="text-sm font-medium">
                              اللون
                            </Label>
                            <Input
                              id="color"
                              value={formData.color}
                              onChange={(e) => updateFormData("color", e.target.value)}
                              className="text-right"
                              placeholder="لون الصنف"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="pricing">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <DollarSign className="h-5 w-5 text-primary" />
                          سعر الشراء والضريبة
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                          <div>
                            <Label htmlFor="last_purchase_price" className="text-sm font-medium">
                              آخر سعر شراء
                            </Label>
                            <Input
                              id="last_purchase_price"
                              type="number"
                              step="0.01"
                              value={formData.last_purchase_price}
                              onChange={(e) => updateFormData("last_purchase_price", Number.parseFloat(e.target.value) || 0)}
                              className="text-right"
                              disabled
                            />
                          </div>
                          <div>
                            <Label htmlFor="minimum_order_quantity" className="text-sm font-medium">
                              أقل كمية للطلب
                            </Label>
                            <Input
                              id="minimum_order_quantity"
                              type="number"
                              min="0"
                              step="0.0001"
                              value={formData.minimum_order_quantity ?? 0}
                              onChange={(e) => updateFormData("minimum_order_quantity", Number.parseFloat(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>
                          <div>
                            <Label htmlFor="currency_id" className="text-sm font-medium">
                              عملة الشراء
                            </Label>
                            <div className={sharedDropdownStyles.dropDownWrapper}>
                              <PrimeDropdown
                                inputId="currency_id"
                                value={formData.currency_id ? Number(formData.currency_id) : null}
                                options={(definitions.currencies || []).map((currency) => ({
                                  label: currency.currency_name,
                                  value: Number(currency.id),
                                }))}
                                optionLabel="label"
                                optionValue="value"
                                placeholder="اختر العملة"
                                className={`${sharedDropdownStyles.dropDown} w-full`}
                                panelClassName={sharedDropdownStyles.dropDownPanel}
                                appendTo="self"
                                onChange={(e: any) => updateFormData("currency_id", Number(e.value) || 0)}
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="tax_rate" className="text-sm font-medium">
                              نسبة الضريبة (%)
                            </Label>
                            <Input
                              id="tax_rate"
                              type="number"
                              step="0.01"
                              value={formData.tax_rate}
                              onChange={(e) => updateFormData("tax_rate", Number.parseFloat(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>
                        </div>
                        <Separator className="my-4" />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="additional">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Warehouse className="h-5 w-5 text-primary" />
                          معلومات إضافية
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-sm font-medium">
                              الرقم الأصلي
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between text-right"
                              onClick={() => setOriginalNumbersDialogOpen(true)}
                            >
                              <span>
                                {formData.original_numbers.length > 0
                                  ? `${formData.original_numbers.length} رقم`
                                  : "اضافة"}
                              </span>
                            </Button>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">
                              رقم المصنع
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between text-right"
                              onClick={() => setFactoryNumbersDialogOpen(true)}
                            >
                              <span>
                                {formData.factory_numbers.length > 0
                                  ? `${formData.factory_numbers.length} رقم`
                                  : "اضافة"}
                              </span>
                            </Button>
                          </div>
                          <div>
                            <Label htmlFor="measurment_unit" className="text-sm font-medium">
                              وحدة عد كميات الصنف <span className="text-red-500">*</span>
                            </Label>
                            <div className={sharedDropdownStyles.dropDownWrapper}>
                              <PrimeDropdown
                                inputId="measurment_unit"
                                value={formData?.measurment_unit != null ? Number(formData.measurment_unit) : 1}
                                options={[
                                  { label: "عشري", value: 1 },
                                  { label: "عدد صحيح", value: 2 },
                                ]}
                                optionLabel="label"
                                optionValue="value"
                                placeholder="عشري"
                                className={`${sharedDropdownStyles.dropDown} w-full`}
                                panelClassName={sharedDropdownStyles.dropDownPanel}
                                appendTo="self"
                                onChange={(e: any) => updateFormData("measurment_unit", Number(e.value) || 1)}
                              />
                            </div>
                          </div>
                        </div>
                        <Separator className="my-4" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="expiry_tracking"
                              checked={formData.expiry_tracking}
                              disabled={isUsedInVouchers}
                              onCheckedChange={(checked) => {
                                if (isUsedInVouchers) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: VOUCHER_USAGE_TRACKING_LOCK_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                const isChecked = checked === true
                                if (isChecked && Number(formData.measurment_id || 1) !== 1) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: MEASUREMENT_TRACKING_CONFLICT_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                updateFormData("expiry_tracking", isChecked)
                              }}
                            />
                            <Label
                              htmlFor="expiry_tracking"
                              className={`text-sm font-medium ${isUsedInVouchers ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              له تاريخ صلاحية
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="serial_tracking"
                              checked={formData.serial_tracking}
                              disabled={isUsedInVouchers}
                              onCheckedChange={(checked) => {
                                if (isUsedInVouchers) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: VOUCHER_USAGE_TRACKING_LOCK_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                const isChecked = checked === true
                                if (isChecked && Number(formData.measurment_id || 1) !== 1) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: MEASUREMENT_TRACKING_CONFLICT_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                updateFormData("serial_tracking", isChecked)
                              }}
                            />
                            <Label
                              htmlFor="serial_tracking"
                              className={`text-sm font-medium ${isUsedInVouchers ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              له رقم متسلسل
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="batch_tracking"
                              checked={formData.batch_tracking}
                              disabled={isUsedInVouchers}
                              onCheckedChange={(checked) => {
                                if (isUsedInVouchers) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: VOUCHER_USAGE_TRACKING_LOCK_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                const isChecked = checked === true
                                if (isChecked && Number(formData.measurment_id || 1) !== 1) {
                                  toast.current?.show({
                                    severity: "error",
                                    summary: "خطأ",
                                    detail: MEASUREMENT_TRACKING_CONFLICT_MSG,
                                    life: 3000,
                                  })
                                  return
                                }
                                // تفعيل "له رقم تشغيلي" يُفعِّل "له تاريخ صلاحية" تلقائياً معه (دفعة
                                // بلا تاريخ صلاحية غير منطقية عملياً) — أما إلغاؤه فلا يُلغي تاريخ
                                // الصلاحية تلقائياً، لأنه قد يبقى مطلوباً بذاته دون تتبع دفعات.
                                setFormData((prev) => ({
                                  ...prev,
                                  batch_tracking: isChecked,
                                  expiry_tracking: isChecked ? true : prev.expiry_tracking,
                                }))
                              }}
                            />
                            <Label
                              htmlFor="batch_tracking"
                              className={`text-sm font-medium ${isUsedInVouchers ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              له رقم تشغيلي
                            </Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="stores">
                    <Card>
                      <CardHeader className="pb-2 flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Warehouse className="h-5 w-5 text-primary" />
                          تفاصيل المستودعات
                        </CardTitle>
                        <button type="button"
                          className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded hover:bg-blue-600 transition"
                          onClick={() => handleAddStoreRow()}
                        >
                          <Plus className="h-4 w-4" />
                          إضافة
                        </button>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <Label htmlFor="default_store" className="text-sm font-medium">
                              المستودع الافتراضي في الحركات
                            </Label>
                            <div className={sharedDropdownStyles.dropDownWrapper}>
                              <PrimeDropdown
                                inputId="default_store"
                                value={formData.default_store ? Number(formData.default_store) : null}
                                className={`${sharedDropdownStyles.dropDown} w-full`}
                                panelClassName={sharedDropdownStyles.dropDownPanel}
                                options={defaultStoreOptions}
                                optionLabel="label"
                                optionValue="value"
                                placeholder="اختر المستودع"
                                filter={true}
                                filterInputAutoFocus={true}
                                onChange={(e) => updateFormData("default_store", e.value ?? 0)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="w-full overflow-x-auto">
                            <DataGridView
                              style={{ height: TABS_GRID_HEIGHT }}
                              dataSource={formData.stores ?? []}
                              scheme={getStoresScheme()}
                              isReport={false}
                              showContextMenu={false}
                              dontConvertToCards={true}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="costcenters">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Settings className="h-5 w-5 text-primary" />
                          مراكز التكلفة
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {/* نفس الارتفاع الثابت المستخدَم في بقية تبويبات هذه الشاشة (TABS_GRID_HEIGHT)
                            — تمرَّر إلى DataGridView مباشرة (لا على العنصر الملفوف) ليتولى Wijmo
                            تمرير الصفوف داخلياً بشريط تمرير واحد بدل شريطين متداخلين. */}
                        <div className="w-full overflow-x-auto rounded-lg border">
                          <DataGridView
                            style={{ height: TABS_GRID_HEIGHT }}
                            scheme={costCenterScheme}
                            dataSource={formData.cost_centers ?? []}
                            isReport={false}
                            showContextMenu={false}
                            dontConvertToCards={true}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="notes">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">ملاحظات وتفاصيل إضافية</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div>
                          <Label htmlFor="notes" className="text-sm font-medium">
                            ملاحظات
                          </Label>
                          <Textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => updateFormData("notes", e.target.value)}
                            className="text-right"
                            rows={3}
                            placeholder="أي ملاحظات أو تفاصيل إضافية حول الصنف"
                          />
                          <Label htmlFor="transaction_notes" className="mt-4 block text-sm font-medium">
                            ملاحظات تظهر في الحركات
                          </Label>
                          <Textarea
                            id="transaction_notes"
                            value={formData.transaction_notes ?? ""}
                            maxLength={100}
                            onChange={(e) => updateFormData("transaction_notes", e.target.value.slice(0, 100))}
                            className="text-right"
                            rows={3}
                            placeholder="ملاحظة تظهر عند اختيار الصنف في الحركات"
                          />
                          <div className="mt-1 text-left text-xs text-muted-foreground">
                            {(formData.transaction_notes ?? "").length}/100
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="attachments">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">المرفقات</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AttachmentManager modelName="product" recordId={formData.id > 0 ? formData.id : null} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </form>
        </div>
      </div>
      {/* خارج <Tabs> عمداً — زرّا "اضافة" لهما في تبويب "معلومات إضافية"، بينما كانت هاتان
          النافذتان مُعشَّشتين سابقاً داخل TabsContent="units"؛ Radix Tabs لا يُبقي محتوى التبويبات
          غير النشطة في DOM افتراضياً، فكان الضغط على "اضافة" من تبويب آخر لا يُظهر شيئاً إطلاقاً
          لأن هاتين النافذتين لم تكونا موجودتين في DOM أصلاً حينها. */}
      <ProductNumbers
        open={originalNumbersDialogOpen}
        onOpenChange={setOriginalNumbersDialogOpen}
        title="الرقم الأصلي"
        numbers={formData.original_numbers}
        onUpdateNumbers={(newNumbers) => updateFormData("original_numbers", newNumbers)}
        numberType={1}
        excludeProductId={formData.id}
        currentProductName={formData.product_name}
        onDuplicateError={(message) => toast.current?.show({ severity: "error", summary: "", detail: message, life: 4000 })}
      />
      <ProductNumbers
        open={factoryNumbersDialogOpen}
        onOpenChange={setFactoryNumbersDialogOpen}
        title="رقم المصنع"
        numbers={formData.factory_numbers}
        onUpdateNumbers={(newNumbers) => updateFormData("factory_numbers", newNumbers)}
        numberType={2}
        excludeProductId={formData.id}
        currentProductName={formData.product_name}
        onDuplicateError={(message) => toast.current?.show({ severity: "error", summary: "", detail: message, life: 4000 })}
      />
      {costCenterSearchOpen && selectedCostCenterType && (
        <SearchCostCenterDialog
          open={costCenterSearchOpen}
          onOpenChange={(open) => {
            setCostCenterSearchOpen(open)
            if (!open) {
              setSelectedCostCenterRowIndex(null)
              setSelectedCostCenterType(null)
            }
          }}
          type={selectedCostCenterType}
          costCenters={costCenters as any}
          onSelect={(center) => {
            if (selectedCostCenterRowIndex == null) return
            updateCostCenterRow(selectedCostCenterRowIndex, "default_cost_center_id", Number(center.id))
            updateCostCenterRow(selectedCostCenterRowIndex, "cost_center_name", center.name || "")
            setSelectedCostCenterRowIndex(null)
            setSelectedCostCenterType(null)
            setCostCenterSearchOpen(false)
          }}
        />
      )}

      <SimpleListPicker
        open={unitPickerOpen}
        onOpenChange={setUnitPickerOpen}
        title="اختر الوحدة"
        items={(definitions.units || []).map((u: any): SimpleListPickerItem => ({ id: u.id, label: u.unit_name }))}
        onSelect={(item) => {
          if (unitPickerRow == null) return
          updateUnitRow(unitPickerRow, { unit_id: Number(item.id), unit_name: item.label })
        }}
      />

      <SimpleListPicker
        open={pricesPickerOpen}
        onOpenChange={setPricesPickerOpen}
        title={pricesPickerField === "category" ? "اختر فئة السعر" : pricesPickerField === "unit" ? "اختر الوحدة" : "اختر العملة"}
        items={
          pricesPickerField === "category"
            ? (definitions.price_category || []).map((c: any): SimpleListPickerItem => ({ id: c.id, label: c.name }))
            : pricesPickerField === "unit"
              ? (definitions.units || []).map((u: any): SimpleListPickerItem => ({ id: u.id, label: u.unit_name }))
              : (definitions.currencies || []).map((c: any): SimpleListPickerItem => ({ id: c.id, label: c.currency_name }))
        }
        onSelect={(item) => {
          if (pricesPickerRow == null) return
          if (pricesPickerField === "category") {
            updatePriceRow(pricesPickerRow, { price_category_id: Number(item.id), price_name: item.label })
          } else if (pricesPickerField === "unit") {
            updatePriceRow(pricesPickerRow, { unit_id: Number(item.id), unit_name: item.label })
          } else {
            updatePriceRow(pricesPickerRow, { currency_id: Number(item.id), currency_name: item.label })
          }
        }}
      />

      <SimpleListPicker
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        title="اختر المستودع"
        items={(definitions.warehouses || []).map((w: any): SimpleListPickerItem => ({ id: w.id, label: w.warehouse_name }))}
        onSelect={(item) => {
          if (storePickerRow == null) return
          updateStoreRow(storePickerRow, { store_id: Number(item.id), store_name: item.label })
        }}
      />

      <SimpleListPicker
        open={statusPickerOpen}
        onOpenChange={setStatusPickerOpen}
        title="حالة مركز التكلفة"
        items={costCenterStatusOptions.map((option): SimpleListPickerItem => ({ id: option.value, label: option.label }))}
        onSelect={(item) => {
          if (statusPickerRow == null) return
          updateCostCenterRow(statusPickerRow, "required_in_transactions", Number(item.id))
          updateCostCenterRow(statusPickerRow, "required_label", item.label)
        }}
      />

      {brandSearchOpen && selectedBrandType && (
        <SearchBrandDialog
          open={brandSearchOpen}
          onOpenChange={(open) => {
            setBrandSearchOpen(open)
            if (!open) {
              setSelectedBrandRowIndex(null)
              setSelectedBrandType(null)
            }
          }}
          type={selectedBrandType}
          brands={brands as any}
          onSelect={(brand) => {
            if (selectedBrandRowIndex == null) return
            updateBrandRow(selectedBrandRowIndex, "brand_id", Number(brand.id))
            updateBrandRow(selectedBrandRowIndex, "brand_name", brand.name || "")
            setSelectedBrandRowIndex(null)
            setSelectedBrandType(null)
            setBrandSearchOpen(false)
          }}
        />
      )}
    </div>
  )
}
