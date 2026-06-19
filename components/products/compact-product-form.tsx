"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Package, Save, X, Barcode, DollarSign, Warehouse, Truck, Info, Settings, Package2, Plus, Currency } from "lucide-react"
import { WarehouseInventoryTable } from "./warehouse-inventory-table"
import { BatchTrackingTable } from "./batch-tracking-table"
import { UNITS } from "@/lib/constants"
import DataGrid from "../common/DataGrid"
import * as wjcInput from '@grapecity/wijmo.input';
import * as wjGrid from "@grapecity/wijmo.grid";
import { readonly } from "zod/v4"
import ProductBarcodes from "./ProductBarcodes"
import { Toast } from 'primereact/toast';
import './compact-product-form.css'
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import ConfirmDialogYesNo from "../ui/ConfirmDialogYesNo"
import { useAuth } from "../auth/auth-context"
import ProductCodeInput from "./ProductCodeInput"
import Util from "../common/Util"


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

  manufacturer_company: string
  length: number
  width: number
  height: number
  density: number

  color: string
  size: string

  notes: string

  units?: UnitItem[],
  prices?: PriceItem[],
  stores?: StoreItem[],
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

  original_number: "",
  factory_number: "",
  location: "",

  expiry_tracking: false,
  batch_tracking: false,
  serial_tracking: false,
  status: 1,

  manufacturer_company: "",
  length: 0,
  width: 0,
  height: 0,
  density: 0,

  color: "",
  size: "",

  notes: "",

  units: [],
  prices: [],
  stores: []
};

interface CompactProductFormProps {
  visible?: any,
  editingProduct?: any
  onHideDialog: (e: any) => void
  onSuccess?: () => void
  isSubmitting?: boolean
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
}: CompactProductFormProps) {
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
  })
  const definitionsRef = useRef({
    categories: [] as Array<{ id: number; group_name: string }>,
    suppliers: [] as Array<{ id: number; name: string; code?: string }>,
    warehouses: [] as Array<{ id: number; warehouse_name: string }>,
    units: [] as Array<{ id: number; unit_name: string }>,
    currencies: [] as Array<{ id: number; currency_name: string }>,
    price_category: [] as Array<{ id: number; name: string }>,
    product_category: [] as Array<{ id: number; name: string }>,
  });
  const unitGridRef = useRef<wjGrid.FlexGrid>(null);
  const [prices_data, setPricesData] = useState<PriceItem[]>([]);
  const [units_data, setUnitsData] = useState<UnitItem[]>([]);
  const [stores_data, setStoresData] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [unitCurrentRow, setUnitCurrentRow] = useState(0)
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [dialogUnitName, setDialogUnitName] = useState("");
  const [dialogBarcodes, setDialogBarcodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const product_code = useRef<HTMLInputElement>(null);
  const product_name = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const validateProduct = () => {
    if (formData.product_code === "") {
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: 'يجب ادخال رقم الصنف',
        life: 1500
      });
      product_code.current?.focus();
      return false
    }
    if (formData.product_name === "") {
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: 'يجب ادخال اسم الصنف',
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
        method: "POST", // ✅ always create new record
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(responseData.error || "فشل في حفظ المنتج")
      }

      setSuccess("تم إنشاء المنتج بنجاح ✅")
      toast.current?.show({
        severity: 'success',
        summary: 'نجاح',
        detail: 'تمت العملية بنجاح ✅',
        life: 3000
      });
      await reset_fields()

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

      // Determine ID to use
      if (navigationType === "Byid" && productId) {
        url.searchParams.set("id", String(productId));
      } else if (navigationType === "previous" || navigationType === "next") {
        url.searchParams.set("currentId", currentProductId.toString());
      }

      const res = await fetch(url.toString());
      const product = await res.json();
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

      const newFormData = {
        ...product,
        units: unitsWithNames,
        prices: pricesWithNames,
        stores: storesWithNames
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
    let newFormData = {
      ...initialFormData,
      product_code: newCode,
      units: [newUnit],
      prices: [newPrice],
      stores: [newStore],
      default_store: firstStore.id,
    };

    if (definitionsRef.current.currencies.length > 0) {
      newFormData.currency_id = definitionsRef.current.currencies[0].id;
    }

    setFormData(newFormData);
    setCurrentProductId(0);

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
          )

        },
        { header: "العلاقة بالرئيسية", name: "to_main_qnty", width: 150, visible: true },
        {
          header: "الباركود",
          name: "barcode",
          buttonBody: "button",
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
          buttonBody: "button",
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
        {
          header: "##", name: "ser", width: 50
        },
        { header: "رقم الفئة", name: "price_category_id", width: 150, visible: false },
        {
          header: "فئة السعر",
          name: "price_name",
          width: "*",
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
                      ? {
                        ...row,
                        price_name: newValue,
                        price_category_id: selectedPrice ? selectedPrice.id : 0
                      }
                      : row
                  );

                  return {
                    ...prev,
                    prices: updatedPrices,
                  };
                });
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.price_category || []).map((u: any) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          ),

        },
        { header: "رقم الوحدة", name: "unit_id", width: 150, visible: false },
        {
          header: "اسم الوحدة",
          name: "unit_name",
          width: "*",
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
                      ? {
                        ...row,
                        unit_name: newValue,
                        unit_id: selectedUnit ? selectedUnit.id : 0 // fallback to 0
                      }
                      : row
                  );

                  return {
                    ...prev,
                    prices: updatedPrices,
                  };
                });
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
        { header: "السعر شامل الضريبة", name: "price", width: 150 },
        { header: "رقم العملة", name: "currency_id", width: 150, visible: false },
        {
          header: "عملة البيع", name: "currency", width: 150,
          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.currency_name || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                cell.row.dataItem.currency_name = newValue;

                const selectedCurrency = definitions.currencies.find(
                  (u: any) => u.currency_name === newValue
                );

                setFormData(prev => {
                  const updatedPrices = (prev.prices || []).map((row, i) =>
                    i === cell.row.index
                      ? {
                        ...row,
                        currency_name: newValue,
                        currency_id: selectedCurrency ? selectedCurrency.id : 0 // fallback
                      }
                      : row
                  );

                  return {
                    ...prev,
                    prices: updatedPrices,
                  };
                });
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.currencies || []).map((u: any) => (
                <option key={u.id} value={u.currency_name}>
                  {u.currency_name}
                </option>
              ))}
            </select>
          ),

        },

        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button",
          iconType: "trash",
          onClick: (item: { ser: number }) => handleDeletePrice(item.ser - 1)
        }
      ],
    }
    return scheme;
  }
  const getStoresScheme = () => ({
    name: "warehouseInventory",
    responsiveColumnIndex: 0,
    columns: [
      { header: "رقم الستودع", name: "store_id", width: 150, visible: false },
      {
        name: "warehouse_id",
        header: "المستودع",
        width: '*',
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
        buttonBody: "button",
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

          setFormData({
            ...product,
            units: unitsWithNames,
            prices: pricesWithNames,
            default_store: Number(product.default_store ?? 0),

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

  const handleProductCodeBlur = () => {
    //if (formData.product_code && validateProductCode(formData.product_code)) {
    formData.product_code = adjustCode(formData.product_code)
    searchProductByCode(formData.product_code)
    // }
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

      const productCategoryResponse = await fetch("/api/product-categories")
      if (productCategoryResponse.ok) {
        const productCategory = await productCategoryResponse.json()
        definitionsObj.product_category = productCategory
        definitionsRef.current.product_category = productCategory.categories
        setDefinitions((prev) => ({ ...prev, product_category: productCategory.categories }))
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

  return (
    <div className="h-screen flex flex-col bg-background" dir="rtl">
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
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Package className="h-7 w-7 text-primary" />
                {editingProduct ? "تعديل " : "صنف جديد"}
              </h1>

            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* المعلومات الأساسية والتعريف */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-primary" />
                  المعلومات الأساسية والتعريف
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* الصف الأول: الأكواد والتعريف */}
                <div className="grid grid-cols-12 gap-4">
                  {/* Product Code - 2 columns */}


                  <ProductCodeInput
                    formData={formData}
                    handleProductCodeChange={(code) => setFormData((prev) => ({ ...prev, product_code: code }))}
                    onSelectProductId={(id) => {
                      setFormData((prev) => ({
                        ...prev,
                        id: Number(id), // convert string → number
                      }))
                      loadData("Byid", id);

                    }}
                    visible={true}
                  />
                  {/* Arabic Name - 5 columns */}
                  <div className="col-span-12 md:col-span-5">
                    <Label htmlFor="product_name" className="text-sm font-medium">
                      اسم الصنف *
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
                  <div className="col-span-12 md:col-span-5">
                    <Label htmlFor="product_name_en" className="text-sm font-medium">
                      اسم الصنف بالإنجليزية
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


                <div className="grid grid-cols-12 gap-4">
                  {/* Product Code - 2 columns */}
                  <div className="col-span-12 md:col-span-2">
                    <Label htmlFor="category" className="text-sm font-medium">
                      التصنيف
                    </Label>
                    <Select
                      value={formData?.category_id != null ? formData.category_id.toString() : ""} // convert number → string
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          category_id: Number(value), // convert string → number
                        }))
                      }
                    >

                      <SelectTrigger>
                        <SelectValue placeholder="اختر التصنيف" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">بلا</SelectItem>
                        {definitions.product_category.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                  </div>
                  <div className="col-span-12 md:col-span-2">
                    <Label htmlFor="category" className="text-sm font-medium">
                      مجموعة الصنف
                    </Label>
                    <Select
                      value={formData?.main_stock_id != null ? formData.main_stock_id.toString() : ""}
                      onValueChange={(value: string) => {
                        setFormData(prev => ({
                          ...prev,
                          main_stock_id:parseInt(value, 10) || 0,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المجموعة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">بلا</SelectItem>
                        {definitions.categories.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.group_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-12 md:col-span-2">
                    <Label htmlFor="status" className="text-sm font-medium">
                      حالة الصنف
                    </Label>
                    <Select disabled={formData.id === 0} value={formData?.status != null ? formData.status.toString() : "1"} onValueChange={(value) => updateFormData("status", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">نشط</SelectItem>
                        <SelectItem value="2">غير نشط</SelectItem>
                        <SelectItem value="3">متوقف</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* الوصف */}
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
              </CardContent>
            </Card>

            {/* التصنيف والعلامة التجارية */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5 text-primary" />
                  العلامة التجارية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

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

            {/* الوحدات والقياسات */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-primary" />
                  القياسات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div>
                    <Label htmlFor="main_unit" className="text-sm font-medium">
                      نوع القياس
                    </Label>
                    <Select value={formData?.measurment_unit != null ? formData.measurment_unit.toString() : '1'} onValueChange={(value) => updateFormData("measurment_unit", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>

                        <SelectItem value="1">عادي</SelectItem>
                        <SelectItem value="2">مساحة</SelectItem>
                        <SelectItem value="3">حجم</SelectItem>
                        <SelectItem value="4">وزن</SelectItem>
                        <SelectItem value="5">بروفيل</SelectItem>

                      </SelectContent>
                    </Select>
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
            <Card>
              <CardHeader className="pb-2 flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-primary" />
                  الوحدات
                </CardTitle>
                <button type="button"
                  className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded hover:bg-blue-600 transition"
                  onClick={() => handleAddUnit()}
                >
                  <Plus className="h-4 w-4" />
                  إضافة
                </button>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-12">
                    <DataGrid
                      ref={unitGridRef}
                      dataSource={formData.units ?? []}
                      scheme={getScheme()}
                      selectionChanged={selectionChanged}
                      cellEditEnded={(s: any, e: any) => cellEditEnded(s, e)}
                    />
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
                    <DataGrid dataSource={formData.prices ?? []}
                      scheme={getPricesScheme()}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* الأسعار والعملة */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-primary" />
                  سعر الشراء والضريبة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                    <Label htmlFor="currency" className="text-sm font-medium">
                      عملة الشراء
                    </Label>

                    <Select
                      value={formData.currency_id?.toString() || ""}
                      onValueChange={(value) => {
                        // value is string, convert to number
                        updateFormData("currency_id", Number(value));
                      }}
                    >
                      <SelectTrigger>
                        <span>
                          {definitions.currencies.find(c => c.id === formData.currency_id)?.currency_name || "اختر العملة"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {definitions.currencies.map((currency) => (
                          <SelectItem key={currency.id} value={currency.id.toString()}>
                            {currency.currency_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

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

            {/* إدارة المخزون */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Warehouse className="h-5 w-5 text-primary" />
                  معلومات إضافية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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

                  <div>
                    <Label htmlFor="default_store" className="text-sm font-medium">
                      المستودع الافتراضي في الحركات
                    </Label>
                    <Select
                      value={formData.default_store ? String(formData.default_store) : "__none__"}
                      onValueChange={(value) =>
                        updateFormData("default_store", value === "__none__" ? 0 : Number(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المستودع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">بلا</SelectItem>
                        {definitions.warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                            {warehouse.warehouse_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                </div>

                <Separator className="my-10" />

                {/* خيارات التتبع */}
                <div>
                  <Label className="text-sm font-medium mb-3 block"></Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id="expiry_tracking"
                        checked={formData.expiry_tracking}
                        onCheckedChange={(checked) => updateFormData("expiry_tracking", checked)}
                      />
                      <Label htmlFor="expiry_tracking" className="text-sm">
                        له تاريخ صلاحية
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id="batch_tracking"
                        checked={formData.batch_tracking}
                        onCheckedChange={(checked) => updateFormData("batch_tracking", checked)}
                      />
                      <Label htmlFor="batch_tracking" className="text-sm font-medium">
                        له رقم تشغيلي
                      </Label>

                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id="serial_tracking"
                        checked={formData.serial_tracking}
                        onCheckedChange={(checked) => updateFormData("serial_tracking", checked)}
                      />
                      <Label htmlFor="serial_tracking" className="text-sm">
                        له سيريال
                      </Label>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-primary" />
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
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-12">
                    <DataGrid dataSource={formData.stores ?? []}
                      scheme={getStoresScheme()}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* ملاحظات إضافية */}
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

            {/* أزرار الحفظ والإلغاء */}

          </form>
        </div>
      </div>
    </div >
  )
}
