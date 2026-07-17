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
import { Package, Save, X, Barcode, DollarSign, Warehouse, Truck, Info, Settings, Package2, Plus, Currency } from "lucide-react"
import { WarehouseInventoryTable } from "./warehouse-inventory-table"
import { BatchTrackingTable } from "./batch-tracking-table"
import { UNITS } from "@/lib/constants"
import DataGrid from "../common/DataGrid"
import DataGridView from "@/components/common/DataGridView"
import * as wjcInput from '@grapecity/wijmo.input';
import * as wjGrid from "@grapecity/wijmo.grid";
import { readonly } from "zod/v4"
import ProductBarcodes from "./ProductBarcodes"
import { Toast } from 'primereact/toast';
import { Dropdown as PrimeDropdown } from 'primereact/dropdown'
import SearchCostCenterDialog from "@/components/customer/search-cost-center-dialog"
import './compact-product-form.css'
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import ConfirmDialogYesNo from "../ui/ConfirmDialogYesNo"
import { useAuth } from "../auth/auth-context"
import ProductCodeInput from "./ProductCodeInput"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import Util from "../common/Util"
import sharedDropdownStyles from "../common/Dropdown.module.scss"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"


interface ProductCostCenterItem {
  id?: number
  product_id?: number
  cost_center_type_id: number | null
  required_in_transactions?: number | null
  default_cost_center_id?: number | null
  cost_center_type_name?: string
  cost_center_name?: string
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
  last_purchase_price: number

  currency_id: number
  tax_rate: number
  discount_rate: number

  original_number: string
  factory_number: string
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
  last_purchase_price: 0,

  currency_id: 0,
  tax_rate: 15,
  discount_rate: 0,

  tax_classification_id: 0,

  original_number: "",
  factory_number: "",
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
  cost_centers: []
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
  })

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
  });
  const unitGridRef = useRef<wjGrid.FlexGrid>(null);
  const [prices_data, setPricesData] = useState<PriceItem[]>([]);
  const [units_data, setUnitsData] = useState<UnitItem[]>([]);
  const [stores_data, setStoresData] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [costCenterTypes, setCostCenterTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [costCenters, setCostCenters] = useState<Array<{ id: number; name: string; cost_type_id?: number; parent_id?: number | null }>>([]);
  const [costCenterSearchOpen, setCostCenterSearchOpen] = useState(false)
  const [selectedCostCenterRowIndex, setSelectedCostCenterRowIndex] = useState<number | null>(null)
  const [selectedCostCenterType, setSelectedCostCenterType] = useState<{ id: number; name: string } | null>(null)

  const [unitCurrentRow, setUnitCurrentRow] = useState(0)
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [dialogUnitName, setDialogUnitName] = useState("");
  const [dialogBarcodes, setDialogBarcodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("units");
  const product_code = useRef<HTMLInputElement>(null);
  const product_name = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    // When the dialog opens or mode changes, default to the units tab
    if (visible) {
      setActiveTab("units");
    }
  }, [visible]);
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

    return true;
  }
  const handleSaveProduct = async () => {
    try {
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
          type: isService ? 2 : 1,
          service_type: isService ? 1 : 0,
        }),
      })

      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(responseData.error || "فشل في حفظ المنتج")
      }

      setSuccess(formData.id ? "تم تحديث المنتج بنجاح ✅" : "تم إنشاء المنتج بنجاح ✅")
      toast.current?.show({
        severity: 'success',
        summary: 'نجاح',
        detail: 'تمت العملية بنجاح ✅',
        life: 3000
      });
      await reset_fields()
      onSuccess?.()

    } catch (err) {
      console.error("[ProductDialog] Error saving product:", err)
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: 'فشلت العملية',
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
    setLoading(true)
    if (!formData.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'تنبيه',
        detail: 'لا يوجد صنف لحذفه',
        life: 3000
      });
      return;
    }

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

      reset_fields(); // clear form

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
    const res = await fetch("/api/utilities/getLastProductCode");
    const data = await res.json();
    const lastCode = data.lastCode;
    return lastCode.toString();
  };
  const [currentProductId, setCurrentProductId] = useState<number>(0);
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

      // Determine ID to use
      if (navigationType === "Byid" && productId) {
        url.searchParams.set("id", String(productId));
      } else if (navigationType === "previous" || navigationType === "next") {
        url.searchParams.set("currentId", currentProductId.toString());
      }

      const res = await fetch(url.toString());
      console.log("loadData response:", res);
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

      // Map units, prices, stores
      const unitsWithNames = (product.units ?? []).map((unit: any) => {
        const unitDef = definitions.units.find((u: any) => u.id === unit.unit_id);
        return { ...unit, unit_name: unitDef?.unit_name || "" };
      });

      const pricesWithNames = (product.prices ?? []).map((price: any) => {
        const unitDef = definitions.units.find((u: any) => u.id === price.unit_id);
        const priceCategoryDef = definitions.price_category.find((p: any) => p.id === price.price_category_id);
        const currencyDef = definitions.currencies.find((c: any) => c.id === price.currency_id);
        return {
          ...price,
          unit_name: unitDef?.unit_name || "",
          price_name: priceCategoryDef?.name || "",
          currency_name: currencyDef?.currency_name || "",
        };
      });

      const storesWithNames = (product.stores ?? []).map((store: any) => {
        const storeDef = definitions.warehouses.find((w: any) => w.id === store.warehouse_id);
        return {
          ...store,
          store_name: storeDef?.warehouse_name || "",
          store_id: storeDef?.id || 0,
        };
      });

      const costCenterRows = buildCostCenterRows(product.cost_centers ?? [], definitionsRef.current.cost_center_types, definitionsRef.current.cost_centers);

      const newFormData = {
        ...product,
        units: unitsWithNames,
        prices: pricesWithNames,
        stores: storesWithNames,
        cost_centers: costCenterRows,
        default_store: product.default_store ?? 0,
      };
      setFormData(newFormData);
      const currentHash = getFormDataHash(newFormData);
      initialHash.current = (currentHash);
      setCurrentProductId(product.id);
      setLoading(false)
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
    setUnitsData([]);
    setPricesData([]);
    setStoresData([]);

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

    const defaultProductAccounts = await loadProductAccountDefaults()

    let newFormData = {
      ...initialFormData,
      product_code: newCode,
      units: [newUnit],
      prices: [newPrice],
      stores: [newStore],
      cost_centers: costCenterRows,
      type: isService ? 2 : 1,
      service_type: isService ? 1 : 0,
      ...defaultProductAccounts,
      tax_classification_id: definitionsRef.current.tax_classifications?.[0]?.id || 0,
    };

    if (definitionsRef.current.currencies.length > 0) {
      newFormData.currency_id = definitionsRef.current.currencies[0].id;
    }

    setFormData(newFormData);
    setCurrentProductId(0);
    setActiveTab("units");

    const currentHash = getFormDataHash(newFormData);
    initialHash.current = currentHash;

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
    await reset_fields()
    setLoading(false)

  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const initFormData = async () => {
      setLoading(true)
      const result = await fetchDefinitions(); // now returns a single object

      if (editingProduct) {
        loadData("Byid", editingProduct.id);

      } else {
        // Populate from initial form data + first currency if available
        reset_fields()

      }
      setLoading(false)
    };

    initFormData();
  }, [editingProduct]);


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
    };

    window.addEventListener("keydown", handler, true); // ✅ capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [visible, onHideDialog, handleDeleteClick]);


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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    formData.units = units_data
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
    // يجب أن يكون الكود بحد أقصى 8 خانات ويحتوي على أرقام وحروف إنجليزية فقط
    const regex = /^[A-Za-z0-9]{1,8}$/
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


  const getUnitsEditor = () => {
    // Return a function to create Wijmo Input ComboBox for React
    return (cell: any) => {
      const editorHost = document.createElement("div");
      const combo = new wjcInput.ComboBox(editorHost, {
        itemsSource: definitions.units || [],
        displayMemberPath: "unit_name",
        selectedValuePath: "id",
      });
      return editorHost;
    };
  };
  const selectionChanged = (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => {
    setUnitCurrentRow(s.selection._row);
  }
  const cellEditEnded = (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => {
    const editedItem = s.rows[e.row]?.dataItem;
    const colName = s.columns[e.col]?.name;
    if (!editedItem || !colName) return;


    // Example: if unit_name changed, you can update to_main or other fields
    if (colName === "to_main_qnty") {
      // ensure types match

      if (e.row === 0) {
        editedItem.to_main_qnty = 1;
        setUnitsData((prev) => {
          const newData = [...prev];
          newData[e.row] = { ...editedItem }; // update only the edited row
          return newData;
        });
      }
    }
  };

  const getScheme = () => {
    let scheme = {
      name: 'UnitsScheme_Table',
      filter: true,
      showFooter: true,
      sortable: true,
      allowGrouping: false,
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
          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.unit_name || ""}
              onChange={(e) => {
                const newValue = e.target.value;

                // Find the selected unit from definitions
                const selectedUnit = definitions.units.find((u: any) => u.unit_name === newValue);

                // Update React state
                setUnitsData((prev: UnitItem[] = []) => {
                  const updated = [...prev];
                  const rowIndex = cell.row.index;

                  updated[rowIndex] = {
                    ...updated[rowIndex],
                    unit_name: newValue,
                    unit_id: selectedUnit ? selectedUnit.id : 0, // fallback
                  };

                  return updated;
                });

                // Optional: also update the grid's dataItem if required
                cell.row.dataItem.unit_name = newValue;
                cell.row.dataItem.unit_id = selectedUnit ? selectedUnit.id : 0;
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.units || []).map((u: any) => (
                <option key={u.id} value={u.unit_name}>
                  {u.unit_name}
                </option>
              ))}
            </select>
          ),
        },
        { header: "العلاقة بالرئيسية", name: "to_main_qnty", width: 150, visible: true },
        {
          header: "الباركود",
          name: "barcode",
          buttonBody: "button" as const,
          width: 100,
          iconType: "barcode",
          readonly: true,
          onClick: (item: { id: number }) => {
            handleBarcodeClick(item);
          }
        },

        {
          header: "barcodeList",
          name: "barcode_list",
          width: 100,
          iconType: "barcode",
          readonly: true,
          visible: false

        },
        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button" as const,
          iconType: "trash",
          onClick: (item: { ser: number }) => handleDeleteUnit(item.ser - 1)
        }
      ],
    }
    return scheme;
  }

  const getPricesScheme = () => {
    let scheme = {
      name: 'PricesScheme_Table',
      filter: true,
      showFooter: true,
      sortable: true,
      allowGrouping: false,
      responsiveColumnIndex: 2,
      columns: [
        { header: "##", name: "ser", width: 50 },
        { header: "رقم الفئة", name: "price_category_id", width: 150, visible: false },
        {
          header: "فئة السعر",
          name: "price_name",
          width: "*",
          minWidth: 180,
          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.price_name || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                cell.row.dataItem.price_name = newValue;
                const selectedPrice = definitions.price_category.find((u: any) => u.name === newValue);

                setFormData(prev => {
                  const updatedPrices = (prev.prices || []).map((row, i) =>
                    i === cell.row.index
                      ? { ...row, price_name: newValue, price_category_id: selectedPrice ? selectedPrice.id : 0 }
                      : row
                  );
                  return { ...prev, prices: updatedPrices };
                });
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.price_category || []).map((u: any) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          ),
        },
        { header: "رقم الوحدة", name: "unit_id", width: 150, visible: false },
        {
          header: "اسم الوحدة",
          name: "unit_name",
          width: "*",
          minWidth: 150,
          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.unit_name || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                cell.row.dataItem.unit_name = newValue;
                const selectedUnit = definitions.units.find((u: any) => u.unit_name === newValue);

                setFormData(prev => {
                  const updatedPrices = (prev.prices || []).map((row, i) =>
                    i === cell.row.index
                      ? { ...row, unit_name: newValue, unit_id: selectedUnit ? selectedUnit.id : 0 }
                      : row
                  );
                  return { ...prev, prices: updatedPrices };
                });
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.units || []).map((u: any) => (
                <option key={u.id} value={u.unit_name}>{u.unit_name}</option>
              ))}
            </select>
          ),
        },
        { header: "السعر شامل الضريبة", name: "price", width: 150 },
        { header: "رقم العملة", name: "currency_id", width: 150, visible: false },
        {
          header: "عملة البيع",
          name: "currency",
          width: 150,
          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.currency_name || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                cell.row.dataItem.currency_name = newValue;
                const selectedCurrency = definitions.currencies.find((u: any) => u.currency_name === newValue);

                setFormData(prev => {
                  const updatedPrices = (prev.prices || []).map((row, i) =>
                    i === cell.row.index
                      ? { ...row, currency_name: newValue, currency_id: selectedCurrency ? selectedCurrency.id : 0 }
                      : row
                  );
                  return { ...prev, prices: updatedPrices };
                });
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.currencies || []).map((u: any) => (
                <option key={u.id} value={u.currency_name}>{u.currency_name}</option>
              ))}
            </select>
          ),
        },
        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button" as const,
          iconType: "trash",
          onClick: (item: { ser: number }) => handleDeletePrice(item.ser - 1)
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
        name: "warehouse_id",
        header: "المستودع",
        width: "*",
        minWidth: 180,
        editor: (cell: any) => (
          <select
            value={cell.row.dataItem.store_name || ""}
            onChange={(e) => {
              const newValue = e.target.value;
              cell.row.dataItem.store_name = newValue;
              const selectedStore = definitions.warehouses.find((u: any) => u.warehouse_name === newValue);
              setFormData(prev => {
                const updatedstores = (prev.stores || []).map((row, i) =>
                  i === cell.row.index
                    ? {
                      ...row,
                      store_name: newValue,
                      store_id: selectedStore ? selectedStore.id : 0 // fallback
                    }
                    : row
                );

                return {
                  ...prev,
                  stores: updatedstores,
                };
              });
            }}
            className="px-2 py-1 w-full"
          >
            {(definitions.warehouses || []).map((u: any) => (
              <option key={u.id} value={u.warehouse_name}>
                {u.warehouse_name}
              </option>
            ))}
          </select>
        ),
      },
      { name: "shelf", header: "الرف", width: 120 },
      { name: "reorder_quantity", header: "كمية اعادة الطلب", width: 120 },
      { name: "min_quantity", header: "حد أدنى", width: 120 },
      { name: "max_quantity", header: "حد أقصى", width: 120 },
      {
        name: "actions",
        header: " ",
        buttonBody: "button" as const,
        iconType: "trash",
        width: 100,
        onClick: (item: { ser: number }) => handleDeleteStore(item.ser - 1)
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

          setFormData({
            ...product,
            units: unitsWithNames,
            prices: pricesWithNames,
            cost_centers: costCenterRows,

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
    const cleanValue = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)

    if (cleanValue !== value) {
      setProductCodeError("يُسمح بالأرقام والحروف الإنجليزية فقط (حد أقصى 8 خانات)")
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

  const fetchDefinitions = async () => {
    try {
      const definitionsObj: any = {}

      // Categories
      const categoriesResponse = await fetch("/api/item-groups")
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        definitionsObj.categoriesData = categoriesData
        definitionsRef.current.categories = categoriesData
        setDefinitions((prev) => ({ ...prev, categories: categoriesData }))
      }

      // Suppliers
      const suppliersResponse = await fetch("/api/suppliers")
      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        definitionsObj.suppliersData = suppliersData
        setDefinitions((prev) => ({ ...prev, suppliers: suppliersData }))
      }

      // Warehouses
      const warehousesResponse = await fetch("/api/warehouses")
      if (warehousesResponse.ok) {
        const warehousesData = await warehousesResponse.json()
        definitionsObj.warehousesData = warehousesData
        definitionsRef.current.warehouses = warehousesData
        setDefinitions((prev) => ({ ...prev, warehouses: warehousesData }))
      }

      // Units
      const unitsResponse = await fetch("/api/units")
      if (unitsResponse.ok) {
        const unitsData = await unitsResponse.json()
        definitionsObj.unitsData = unitsData
        definitionsRef.current.units = unitsData
        setDefinitions((prev) => ({ ...prev, units: unitsData }))
      }

      // Currencies
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

      // Tax classifications
      try {
        const taxResp = await fetch("/api/tax-classifications")
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

      const productCategoryResponse = await fetch("/api/product-categories")
      if (productCategoryResponse.ok) {
        const productCategory = await productCategoryResponse.json()
        definitionsObj.product_category = productCategory
        definitionsRef.current.product_category = productCategory.categories
        setDefinitions((prev) => ({ ...prev, product_category: productCategory.categories }))
      }

      const costCenterTypeResponse = await fetch("/api/cost-center-types")
      if (costCenterTypeResponse.ok) {
        const costCenterTypesData = await costCenterTypeResponse.json()
        definitionsObj.costCenterTypes = costCenterTypesData
        definitionsRef.current.cost_center_types = costCenterTypesData
        setCostCenterTypes(costCenterTypesData)
        setDefinitions((prev) => ({ ...prev, cost_center_types: costCenterTypesData }))
      }

      const costCentersResponse = await fetch("/api/cost-centers")
      if (costCentersResponse.ok) {
        const costCentersData = await costCentersResponse.json()
        definitionsObj.costCenters = costCentersData
        definitionsRef.current.cost_centers = costCentersData
        setCostCenters(costCentersData)
        setDefinitions((prev) => ({ ...prev, cost_centers: costCentersData }))
      }
      return definitionsObj
    } catch (error) {
      console.error("Error fetching definitions:", error)
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

  const costCenterScheme = useMemo(() => ({
    name: "ProductCostCenterScheme",
    columns: [
      { header: "نوع مركز التكلفة", name: "cost_center_type_name", width: 220, minWidth: 180, isReadOnly: true },
      {
        header: "الحالة",
        name: "required_label",
        width: 140,
        minWidth: 120,
        editor: (cell: any) => {
          const editorHost = document.createElement("div")
          const select = document.createElement("select")
          select.className = "w-full rounded border border-input bg-background px-2 py-1 text-sm"
          select.value = String(cell.row.dataItem.required_in_transactions ?? 1)

          costCenterStatusOptions.forEach((option) => {
            const optionEl = document.createElement("option")
            optionEl.value = String(option.value)
            optionEl.textContent = option.label
            select.appendChild(optionEl)
          })

          select.onchange = (event) => {
            const nextValue = Number((event.target as HTMLSelectElement).value || 1)
            const nextLabel = costCenterStatusOptions.find((option) => option.value === nextValue)?.label || "اختياري"
            cell.row.dataItem.required_in_transactions = nextValue
            cell.row.dataItem.required_label = nextLabel
            updateCostCenterRow(cell.row.index, "required_in_transactions", nextValue)
            updateCostCenterRow(cell.row.index, "required_label", nextLabel)
          }

          editorHost.appendChild(select)
          return editorHost
        },
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
        buttonBody: "button",
        align: "center",
        title: "بحث",
        iconType: "search",
        className: "btn-search",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          const rowIndex = ctx.row.index
          const row = formData.cost_centers?.[rowIndex]
          if (!row) return
          setSelectedCostCenterRowIndex(rowIndex)
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
        buttonBody: "button",
        align: "center",
        title: "حذف",
        iconType: "delete",
        className: "btn-delete",
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          const rowIndex = ctx.row.index
          updateCostCenterRow(rowIndex, "default_cost_center_id", null)
          updateCostCenterRow(rowIndex, "cost_center_name", "")
          updateCostCenterRow(rowIndex, "required_label", costCenterStatusOptions.find((option) => option.value === (formData.cost_centers?.[rowIndex]?.required_in_transactions ?? 1))?.label || "اختياري")
        },
        visible: true,
        visibleInColumnChooser: true,
      },
    ],
  }), [costCenterStatusOptions, formData.cost_centers])

  return (
    <div className="h-full min-h-[70vh] min-w-0 flex flex-col bg-background overflow-hidden text-lg compact-product-form-root" dir="rtl">
      {/* Universal Toolbar - Fixed at top */}
      <div className="flex-shrink-0">
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
          onPrint={() => console.log("Print product")}
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="mx-auto w-full max-w-full space-y-4 p-2 pb-8 sm:space-y-6 sm:p-4 sm:pb-10 lg:p-6 lg:pb-12">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                {/* الصف الأول: الأكواد والتعريف */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {/* Product Code - 2 columns */}


                  <div className="col-span-1 xl:col-span-2 w-full">
                    <ProductCodeInput
                      formData={formData}
                      handleProductCodeChange={(code) => setFormData((prev) => ({ ...prev, product_code: code }))}
                      onBlur={async () => {
                        const adjustedCode = adjustCode(formData.product_code || "")
                        setFormData((prev) => ({ ...prev, product_code: adjustedCode }))
                        await searchProductByCode(adjustedCode)
                      }}
                      onSelectProductId={(id) => {
                        setFormData((prev) => ({
                          ...prev,
                          id: Number(id), // convert string → number
                        }))
                        loadData("Byid", id)
                      }}
                      visible={true}
                      priceCategoryId={1}
                      productTypes={isService ? [2] : [1]}
                      codeLabel={isService ? "رقم الخدمة *" : "رقم الصنف *"}
                      searchTitle={isService ? "بحث الخدمات" : "بحث الأصناف"}
                    />
                  </div>
                  {/* Arabic Name - 5 columns */}
                  <div className="col-span-1 lg:col-span-5 xl:col-span-5">
                    <Label htmlFor="product_name" className="text-sm font-medium">
                      {isService ? "اسم الخدمة *" : "اسم الصنف *"}
                    </Label>
                    <Input
                      ref={product_name}
                      id="product_name"
                      value={formData.product_name}
                      onChange={(e) => {
                        updateFormData("product_name", e.target.value);
                        if (formData.product_name_en === '')
                          updateFormData("product_name_en", e.target.value)
                      }}
                      className="text-right"
                      placeholder="اسم الصنف باللغة العربية"
                      required
                    />
                  </div>

                  {/* English Name - 5 columns */}
                  <div className="col-span-1 lg:col-span-5 xl:col-span-5">
                    <Label htmlFor="product_name_en" className="text-sm font-medium">
                      {isService ? "اسم الخدمة بالإنجليزية" : "اسم الصنف بالإنجليزية"}
                    </Label>
                    <Input
                      id="product_name_en"
                      value={formData.product_name_en}
                      onChange={(e) => updateFormData("product_name_en", e.target.value)}
                      className="text-left"
                      placeholder="Product Name in English"
                    />
                  </div>
                </div>


                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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

                  <div className="xl:col-span-1">
                    <Label htmlFor="status" className="text-sm font-medium">
                      {isService ? "حالة الخدمة" : "حالة الصنف"}
                    </Label>
                    <div className={sharedDropdownStyles.dropDownWrapper}>
                      <PrimeDropdown
                        inputId="status"
                        value={formData.status != null ? Number(formData.status) : null}
                        options={[
                          { label: "نشط", value: 1 },
                          { label: "غير نشط", value: 2 },
                          { label: "متوقف", value: 3 },
                        ]}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="اختر الحالة"
                        className={`${sharedDropdownStyles.dropDown} w-full`}
                        panelClassName={sharedDropdownStyles.dropDownPanel}
                        appendTo="self"
                        onChange={(e: any) => updateFormData("status", Number(e.value) || 1)}
                        disabled={formData.id === 0}
                      />
                    </div>
                  </div>
                </div>

                {!isService && (
                  <div>
                    <Label htmlFor="description" className="text-sm font-medium">
                      وصف الصنف
                    </Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => updateFormData("description", e.target.value)}
                      className="text-right"
                      rows={2}
                      placeholder="وصف مفصل للصنف"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} dir="rtl">
              <TabsList className="h-auto w-full flex flex-wrap justify-start gap-2 overflow-x-auto rounded-xl bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 p-2 shadow-md border border-slate-200/60 backdrop-blur-sm" style={{ direction: "rtl" }}>
                <TabsTrigger value="units" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">الوحدات</TabsTrigger>
                <TabsTrigger value="prices" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">اسعار البيع</TabsTrigger>
                <TabsTrigger value="accounts" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">{isService ? 'الحسابات المحاسبية' : 'الحسابات'}</TabsTrigger>
                {isService ? null : (
                  <>
                    <TabsTrigger value="brand" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">العلامة التجارية</TabsTrigger>
                    <TabsTrigger value="measurements" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">القياسات</TabsTrigger>
                    <TabsTrigger value="pricing" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">سعر الشراء والضريبة</TabsTrigger>
                    <TabsTrigger value="additional" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">معلومات إضافية</TabsTrigger>
                    <TabsTrigger value="stores" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">تفاصيل المستودعات</TabsTrigger>
                    <TabsTrigger value="costcenters" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">مراكز التكلفة</TabsTrigger>
                    <TabsTrigger value="notes" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-600 data-[state=active]:to-slate-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">ملاحظات</TabsTrigger>
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
                          <DataGrid
                            ref={unitGridRef}
                            dataSource={formData.units ?? []}
                            scheme={getScheme()}
                            selectionChanged={selectionChanged}
                            cellEditEnded={(s: any, e: any) => cellEditEnded(s, e)}
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
                          <DataGrid dataSource={formData.prices ?? []}
                            scheme={getPricesScheme()}
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
                  <TabsContent value="brand">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Settings className="h-5 w-5 text-primary" />
                          العلامة التجارية
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                          <div>
                            <Label htmlFor="brand" className="text-sm font-medium">
                              العلامة التجارية
                            </Label>
                            <Input
                              id="brand"
                              value={formData.brand}
                              onChange={(e) => updateFormData("brand", e.target.value)}
                              className="text-right"
                              placeholder="اسم العلامة التجارية"
                            />
                          </div>
                          <div>
                            <Label htmlFor="model" className="text-sm font-medium">
                              الموديل
                            </Label>
                            <Input
                              id="model"
                              value={formData.model}
                              onChange={(e) => updateFormData("model", e.target.value)}
                              className="text-right"
                              placeholder="رقم أو اسم الموديل"
                            />
                          </div>
                          <div>
                            <Label htmlFor="manufacturer_company" className="text-sm font-medium">
                              الشركة المصنعة
                            </Label>
                            <Input
                              id="manufacturer_company"
                              value={formData.manufacturer_company}
                              onChange={(e) => updateFormData("manufacturer_company", e.target.value)}
                              className="text-right"
                              placeholder="اسم الشركة المصنعة"
                            />
                          </div>
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
                            <Label htmlFor="measurment_unit" className="text-sm font-medium">
                              نوع القياس
                            </Label>
                            <div className={sharedDropdownStyles.dropDownWrapper}>
                              <PrimeDropdown
                                inputId="measurment_unit"
                                value={formData?.measurment_unit != null ? Number(formData.measurment_unit) : null}
                                options={[
                                  { label: "عادي", value: 1 },
                                  { label: "مساحة", value: 2 },
                                  { label: "حجم", value: 3 },
                                  { label: "وزن", value: 4 },
                                  { label: "بروفيل", value: 5 },
                                ]}
                                optionLabel="label"
                                optionValue="value"
                                placeholder="اختر نوع القياس"
                                className={`${sharedDropdownStyles.dropDown} w-full`}
                                panelClassName={sharedDropdownStyles.dropDownPanel}
                                appendTo="self"
                                onChange={(e: any) => updateFormData("measurment_unit", Number(e.value) || 1)}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="original_number" className="text-sm font-medium">
                              الرقم الأصلي
                            </Label>
                            <Input
                              id="original_number"
                              type="number"
                              value={formData.original_number}
                              onChange={(e) => updateFormData("original_number", e.target.value)}
                              className="text-right"
                            />
                          </div>
                          <div>
                            <Label htmlFor="factory_number" className="text-sm font-medium">
                              رقم المصنع
                            </Label>
                            <Input
                              id="factory_number"
                              type="number"
                              value={formData.factory_number}
                              onChange={(e) => updateFormData("factory_number", e.target.value)}
                              className="text-right"
                            />
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
                                options={(() => {
                                  const options = [
                                    { label: "بلا تحديد", value: null },
                                    ...((definitions.warehouses || []).map((warehouse: any) => ({
                                      label: warehouse.warehouse_name,
                                      value: Number(warehouse.id),
                                    })))
                                  ]

                                  if (formData.default_store) {
                                    const selectedId = Number(formData.default_store)
                                    options.sort((a, b) => {
                                      if (a.value === selectedId) return -1
                                      if (b.value === selectedId) return 1
                                      return 0
                                    })
                                  }

                                  return options
                                })()}
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
                            <DataGrid dataSource={formData.stores ?? []} scheme={getStoresScheme()} />
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
                        <div className="overflow-hidden rounded-lg border">
                          <div className="h-[420px] min-h-[320px] overflow-auto">
                            <DataGridView
                              scheme={costCenterScheme}
                              dataSource={formData.cost_centers ?? []}
                              defaultRowHeight={44}
                            />
                          </div>
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
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </form>
        </div>
      </div>
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
    </div>
  )
}
