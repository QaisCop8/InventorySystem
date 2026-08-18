"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Download, X, Package, ArrowLeft } from "lucide-react"
import * as XLSX from "xlsx"
import DataGridView from "@/components/common/DataGridView"
import { ExcelImportHeader, ExcelImportProgress, ExcelImportStats, type ExcelImportStep } from "@/components/ui/excel-import-layout"

interface ExcelProduct {
  product_code: string
  product_name: string
  product_name_en?: string
  description?: string
  status?: string
  category_id: number
  main_stock_id: number
  brand?: string
  model?: string
  manufacturer_company?: string
  measurment_unit: number
  unit_1?: string
  unit_1_barcode?: string
  unit_2?: string
  unit_2_barcode?: string
  unit_2_to_main_qnty?: number
  weight?: number
  length?: number
  width?: number
  height?: number
  density?: number
  color?: string
  size?: string
  notes?: string
  expiry_tracking: boolean
  batch_tracking: boolean
  serial_tracking?: boolean
  store_id: number
  price_1?: number
  price_2?: number
  price_3?: number
  price_4?: number
  price_5?: number
  price_6?: number
  rowIndex?: number
  errors?: string[]
  isValid?: boolean
}

interface ExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

// حقول النظام التي يُبنى منها كل صنف مستورَد (مطابقة لحقول ExcelProduct أعلاه حرفياً) — تُعرَض
// كقائمة بخطوة "مطابقة الأعمدة" الجديدة بين رفع الملف والمعاينة، بدل افتراض أن أعمدة ملف المستخدم
// تحمل بالضبط أسماء المفاتيح هذه (product_code، product_name...) كما كان الحال سابقاً. required
// هنا للعرض فقط (تمييز بصري) — validateProductRow أدناه لا يزال المصدر الوحيد للتحقق الفعلي.
const PRODUCT_FIELD_DEFS: { key: string; label: string; required?: boolean }[] = [
  { key: "product_code", label: "رقم الصنف", required: true },
  { key: "product_name", label: "اسم الصنف", required: true },
  { key: "product_name_en", label: "اسم الصنف إنجليزي" },
  { key: "description", label: "الوصف" },
  { key: "category_id", label: "التصنيف (رقم)" },
  { key: "main_stock_id", label: "مجموعة الصنف (رقم)" },
  { key: "brand", label: "العلامة التجارية" },
  { key: "model", label: "الموديل" },
  { key: "manufacturer_company", label: "الشركة المصنعة" },
  { key: "measurment_unit", label: "وحدة القياس (رقم)" },
  { key: "unit_1", label: "الوحدة 1" },
  { key: "unit_1_barcode", label: "باركود الوحدة 1" },
  { key: "unit_2", label: "الوحدة 2" },
  { key: "unit_2_barcode", label: "باركود الوحدة 2" },
  { key: "unit_2_to_main_qnty", label: "معامل تحويل الوحدة 2" },
  { key: "weight", label: "الوزن" },
  { key: "length", label: "الطول" },
  { key: "width", label: "العرض" },
  { key: "height", label: "الارتفاع" },
  { key: "density", label: "الكثافة" },
  { key: "color", label: "اللون" },
  { key: "size", label: "المقاس" },
  { key: "notes", label: "ملاحظات" },
  { key: "expiry_tracking", label: "له تاريخ صلاحية" },
  { key: "batch_tracking", label: "له رقم تشغيلي" },
  { key: "serial_tracking", label: "له رقم متسلسل" },
  { key: "store_id", label: "المستودع (رقم)" },
  { key: "price_1", label: "السعر 1" },
  { key: "price_2", label: "السعر 2" },
  { key: "price_3", label: "السعر 3" },
  { key: "price_4", label: "السعر 4" },
  { key: "price_5", label: "السعر 5" },
  { key: "price_6", label: "السعر 6" },
]

// لا خيار مطابقة لهذا الحقل — يبقى بقيمته الافتراضية (فارغ/0/false) لكل صف.
const NO_MAPPING_VALUE = "__none__"

export function ExcelImportDialog({ open, onOpenChange, onImportComplete }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [products, setProducts] = useState<ExcelProduct[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [loading, setLoading] = useState(false);
  // خطوة مطابقة الأعمدة: rawRows/excelHeaders تُملأ فور رفع الملف (processExcelFile)، ثم
  // buildProductsFromMapping تبني منها products الفعلية وفق ما اختاره المستخدم بـcolumnMapping.
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<any[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [showMapping, setShowMapping] = useState(false)
  const [importResults, setImportResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
  const [showPreview, setShowPreview] = useState(false)

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
  useEffect(() => {
    fetchDefinitions()
  }, [])

  const downloadTemplate = () => {
    const templateData = [
      {
        product_code: "A000000001",
        product_name: "منتج تجريبي",
        product_name_en: "Sample Product",
        description: "وصف المنتج التفصيلي",
        category_id: 1,
        main_stock_id: 1,
        brand: "سامسونج",
        model: "Galaxy S24",
        manufacturer_company: "Samsung Electronics",
        measurment_unit: 1,
        unit_1: "حبة",
        unit_1_barcode: "123456",
        unit_2: "كرتونة",
        unit_2_barcode: "111222",
        unit_2_to_main_qnty: 12,
        weight: 0.2,
        length: 15,
        width: 7,
        height: 0.8,
        density: 0,
        color: "أسود",
        size: "متوسط",
        notes: "منتج عالي الجودة مع ضمان شامل",
        expiry_tracking: false,
        batch_tracking: true,
        serial_tracking: false,
        store_id: 1,
        price_1: 100,
        price_2: 200,
        price_3: 300,
        price_4: 400,
        price_5: 500,
        price_6: 600
      },
      {
        product_code: "B000000002",
        product_name: "منتج غذائي",
        product_name_en: "Food Product",
        description: "منتج غذائي طبيعي",
        category_id: 2,
        main_stock_id: 2,
        brand: "الطبيعة",
        model: "",
        manufacturer_company: "مصنع الأغذية الطبيعية",
        measurment_unit: 1,
        unit_1: "حبة",
        unit_1_barcode: "123456",
        unit_2: "كرتونة",
        unit_2_barcode: "111222",
        unit_2_to_main_qnty: 12,
        weight: 0.4,
        length: 10,
        width: 10,
        height: 5,
        density: 0,
        color: "",
        size: "400 جرام",
        notes: "يحفظ في مكان بارد وجاف",
        expiry_tracking: true,
        batch_tracking: true,
        serial_tracking: false,
        store_id: 1,
        price_1: 100,
        price_2: 200,
        price_3: 300,
        price_4: 400,
        price_5: 500,
        price_6: 600
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const colWidths = [
      { wch: 12 }, // product_code
      { wch: 25 }, // product_name
      { wch: 25 }, // product_name_en
      { wch: 30 }, // description
      { wch: 12 }, // category_id
      { wch: 12 }, // main_stock_id
      { wch: 15 }, // brand
      { wch: 15 }, // model
      { wch: 20 }, // manufacturer_company
      { wch: 12 }, // measurment_unit
      { wch: 15 }, // unit_1
      { wch: 15 }, // unit_1_barcode
      { wch: 15 }, // unit_2
      { wch: 15 }, // unit_2_barcode
      { wch: 15 }, // unit_2_to_main_qnty
      { wch: 10 }, // weight
      { wch: 10 }, // length
      { wch: 10 }, // width
      { wch: 10 }, // height
      { wch: 10 }, // density
      { wch: 10 }, // color
      { wch: 10 }, // size
      { wch: 30 }, // notes
      { wch: 12 }, // expiry_tracking
      { wch: 12 }, // batch_tracking
      { wch: 12 }, // serial_tracking
      { wch: 12 }, // store_id
      { wch: 10 }, // price_1
      { wch: 10 }, // price_2
      { wch: 10 }, // price_3
      { wch: 10 }, // price_4
      { wch: 10 }, // price_5
      { wch: 10 }  // price_6
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products Template");

    try {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading template:", error);
      alert("حدث خطأ في تحميل النموذج. يرجى المحاولة مرة أخرى.");
    }
  };



  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      processExcelFile(selectedFile)
    }
  }

  // رقم الصنف يجب أن يكون 10 خانات (بادئة حرف واحد + 9 أرقام، مطابقاً لطول التوليد التلقائي بـ
  // app/api/utilities/getLastProductCode) — أكواد أقصر بملف المستخدم (بيانات قديمة أو مكتوبة يدوياً
  // بالنمط القديم 8 خانات) تُوسَّع بأصفار بادئة بعد الحرف الأول لتصل 10 خانات عند تعبئة جدول
  // المعاينة، بدل رفضها أو تركها بطول مختلف عن بقية الأصناف بالنظام.
  const adjustProductCodeTo10 = (rawCode: string): string => {
    const code = String(rawCode || "").trim()
    if (!code || code.length >= 10) return code
    const prefix = code.slice(0, 1)
    const suffix = code.slice(1)
    return prefix + suffix.padStart(10 - prefix.length, "0")
  }

  // يبني تخميناً أولياً للمطابقة (fieldKey → عنوان عمود بملف المستخدم) بمطابقة تامة (بلا حساسية
  // لحالة الأحرف/فراغات طرفية) بين مفتاح الحقل وعناوين أعمدة الملف الفعلية — يغطي حالة الاستخدام
  // الأكثر شيوعاً (ملء نموذجنا نفسه دون تغيير رؤوس الأعمدة) تلقائياً، ويترك البقية للمستخدم ليختارها
  // يدوياً بخطوة المطابقة إن اختلفت رؤوس عمود ملفه عن أسماء حقولنا.
  const guessColumnMapping = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {}
    const normalizedHeaders = headers.map((h) => ({ raw: h, normalized: String(h ?? "").trim().toLowerCase() }))
    for (const field of PRODUCT_FIELD_DEFS) {
      const match = normalizedHeaders.find((h) => h.normalized === field.key.toLowerCase())
      mapping[field.key] = match ? match.raw : NO_MAPPING_VALUE
    }
    return mapping
  }

  const processExcelFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
      const headerRow = (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as any[]) || [];
      const headers = headerRow.map((h) => String(h ?? "").trim()).filter((h) => h.length > 0);

      if (jsonData.length === 0 || headers.length === 0) {
        alert("الملف فارغ أو لا يحتوي على صف عناوين أعمدة صالح");
        return;
      }

      setRawRows(jsonData);
      setExcelHeaders(headers);
      setColumnMapping(guessColumnMapping(headers));
      setShowMapping(true);
    } catch (error) {
      console.error("Error processing Excel file:", error);
      alert("حدث خطأ في معالجة ملف Excel. تأكد من أن الملف يحتوي على البيانات الصحيحة.");
    } finally {
      setIsProcessing(false);
    }
  };

  // يبني products الفعلية من rawRows بحسب مطابقة الأعمدة التي أكّدها/عدّلها المستخدم بخطوة
  // المطابقة — نفس منطق بناء/تحقق كل صف الذي كان سابقاً بجسم processExcelFile مباشرة، فقط يقرأ كل
  // حقل عبر columnMapping[key] (عنوان عمود ملف المستخدم) بدل افتراض أنه يطابق key حرفياً.
  const buildProductsFromMapping = () => {
    const readField = (row: any, key: string) => {
      const header = columnMapping[key]
      if (!header || header === NO_MAPPING_VALUE) return undefined
      return row[header]
    }
    // نصوص الملف قد تصل كأرقام (خلية Excel مُنسَّقة كرقم لا نص، كرقم صنف "12345" بلا صياغة نصية
    // صريحة) — XLSX.utils.sheet_to_json يُرجعها عندئذ number لا string، فيتحطّم أي .trim() لاحق
    // عليها مباشرة (Number.prototype لا يملك trim). كل حقل نصي هنا يُمرَّر عبر String(...) صراحة
    // بدل الاعتماد على || "" وحدها (لا تكفي لتحويل رقم فعلي إلى نص).
    const readText = (row: any, key: string) => {
      const value = readField(row, key)
      return value === undefined || value === null ? "" : String(value).trim()
    }

    const processedProducts: ExcelProduct[] = rawRows.map((row, index) => {
      const product: ExcelProduct = {
        product_code: adjustProductCodeTo10(readText(row, "product_code")),
        product_name: readText(row, "product_name"),
        product_name_en: readText(row, "product_name_en"),
        description: readText(row, "description"),
        category_id: Number(readField(row, "category_id")) || 0,
        main_stock_id: Number(readField(row, "main_stock_id")) || 0,
        brand: readText(row, "brand"),
        model: readText(row, "model"),
        manufacturer_company: readText(row, "manufacturer_company"),
        measurment_unit: readField(row, "measurment_unit") || 1,
        unit_1: readText(row, "unit_1"),
        unit_1_barcode: readText(row, "unit_1_barcode"),
        unit_2: readText(row, "unit_2"),
        unit_2_barcode: readText(row, "unit_2_barcode"),
        unit_2_to_main_qnty: Number(readField(row, "unit_2_to_main_qnty")) || 1,
        weight: Number(readField(row, "weight")) || 0,
        length: Number(readField(row, "length")) || 0,
        width: Number(readField(row, "width")) || 0,
        height: Number(readField(row, "height")) || 0,
        density: Number(readField(row, "density")) || 0,
        color: readText(row, "color"),
        size: readText(row, "size"),
        notes: readText(row, "notes"),
        expiry_tracking: false,
        batch_tracking: false,
        serial_tracking: false,
        store_id: Number(readField(row, "store_id")) || 0,
        price_1: Number(readField(row, "price_1")) || 0,
        price_2: Number(readField(row, "price_2")) || 0,
        price_3: Number(readField(row, "price_3")) || 0,
        price_4: Number(readField(row, "price_4")) || 0,
        price_5: Number(readField(row, "price_5")) || 0,
        price_6: Number(readField(row, "price_6")) || 0,
        rowIndex: index + 2,
        errors: [],
      };

      const errors: string[] = [];
      if (!product.product_code.trim()) errors.push("رقم الصنف مطلوب");
      if (!product.product_name.trim()) errors.push("اسم الصنف مطلوب");
      if (!product.unit_1 || !String(product.unit_1).trim()) {
        errors.push("الوحدة الرئيسية مطلوبة");
      }
      if (product.store_id > 0) {
        const warehouseExists = definitionsRef.current.warehouses.some(w => w.id === product.store_id)
        if (!warehouseExists) errors.push(`المستودع (store_id: ${product.store_id}) غير موجود في النظام`)
      }
      if (product.category_id > 0) {
        const categoryExists = definitionsRef.current.product_category.some(w => w.id === product.category_id)
        if (!categoryExists) errors.push(`التصنيف (category_id: ${product.category_id}) غير موجود في النظام`)
      }
      if (product.main_stock_id > 0) {
        const mainExists = definitionsRef.current.categories.some(w => w.id === product.main_stock_id)
        if (!mainExists) errors.push(`مجموعة الصنف (main_stock_id: ${product.main_stock_id}) غير موجود في النظام`)
      }
      for (let i = 1; i <= 6; i++) {
        const priceValue = Number(product[`price_${i}` as keyof typeof product]);

        if (priceValue > 0) {
          const priceCategory = definitionsRef.current.price_category.length > i - 1;

          if (!priceCategory) {
            errors.push(`فئة السعر رقم ${i} غير موجودة في النظام`);
          }
        }
      }

      product.errors = errors;
      product.isValid = errors.length === 0;

      return product;
    });

    setProducts(processedProducts);
    setShowMapping(false);
    setShowPreview(true);
  };

  // نفس حسابات الأصناف الافتراضية (تبويب "الحسابات الافتراضية للاصناف" بإعدادات النظام) التي
  // تُطبَّق تلقائياً عند إضافة صنف واحد يدوياً عبر compact-product-form.tsx (loadProductAccountDefaults
  // هناك) — نموذج استيراد Excel لا يحوي أعمدة حسابات إطلاقاً (طُلِب صراحةً عدم إضافتها كأعمدة)، فبلا
  // هذا يبقى كل صنف مستورَد بلا أي حساب مرتبط أصلاً. تُحمَّل مرة واحدة قبل حلقة الاستيراد (لا لكل
  // سطر) وتُطبَّق على كل الأصناف المستورَدة بنفس القيم.
  const loadDefaultItemAccounts = async () => {
    const defaults: Record<string, number | string> = {}
    try {
      const response = await fetch("/api/settings/system")
      if (!response.ok) return defaults
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

      await Promise.all(
        accountKeys.map(async ({ setting, idKey, codeKey }) => {
          const accountId = Number(settings[setting])
          if (!Number.isInteger(accountId) || accountId <= 0) return
          try {
            const accountResponse = await fetch(`/api/accounts/${accountId}`)
            if (!accountResponse.ok) return
            const account = await accountResponse.json()
            defaults[idKey] = account.id
            defaults[codeKey] = account.code
          } catch {
            // يُتابَع بلا هذا الحساب تحديداً — لا يُوقِف تحميل بقية الحسابات الافتراضية.
          }
        }),
      )
    } catch (error) {
      console.error("Failed to load default item accounts:", error)
    }
    return defaults
  }

  const importProducts = async () => {
    const validProducts = products.filter(p => p.isValid);
    if (validProducts.length === 0) {
      alert("لا توجد منتجات صالحة للاستيراد");
      return;
    }

    const normalizeBarcodeList = (value: string | string[] | undefined): string[] => {
      const raw = Array.isArray(value) ? value : String(value ?? "").split(/[\r\n;,]+/)
      return Array.from(
        new Set(
          raw
            .map((item) => String(item ?? "").trim())
            .filter((item) => item.length > 0),
        ),
      )
    }

    const ensureUnitExists = async (unitName: string): Promise<number | null> => {
      const value = String(unitName || "").trim();
      if (!value) return null;

      const existingUnit = definitionsRef.current.units.find(
        (u) => String(u.unit_name || "").trim().toLowerCase() === value.toLowerCase(),
      );
      if (existingUnit) return existingUnit.id;

      const response = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_name: value,
          unit_name_en: value,
          description: "",
          is_active: true,
          status: 1,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || `فشل إنشاء الوحدة: ${value}`);
      }

      const createdUnit = await response.json();
      const createdUnitId = Number(createdUnit?.id ?? 0);
      if (!createdUnitId) {
        throw new Error(`لم يتم إرجاع معرف الوحدة الجديدة: ${value}`);
      }

      const nextUnits = [...definitionsRef.current.units, { id: createdUnitId, unit_name: value }];
      definitionsRef.current.units = nextUnits;
      setDefinitions((prev) => ({ ...prev, units: nextUnits }));
      return createdUnitId;
    };

    setIsImporting(true);
    setImportProgress({ current: 0, total: validProducts.length });
    const results = { success: 0, failed: 0, errors: [] as string[] };
    const defaultItemAccounts = await loadDefaultItemAccounts();

    for (let i = 0; i < validProducts.length; i++) {
      const product = validProducts[i];

      try {
        const mainUnitId = product.unit_1 ? await ensureUnitExists(product.unit_1) : null;
        const secondaryUnitId = product.unit_2 ? await ensureUnitExists(product.unit_2) : null;

        const unitEntries = new Map<number, { unit_id: number; to_main_qnty: number; barcode_list: string[] }>();

        const addUnitEntry = (unitId: number | null, multiplier: number, barcodes: string[]) => {
          if (!unitId || !Number.isFinite(unitId)) return;
          const existing = unitEntries.get(unitId);
          const nextBarcodes = normalizeBarcodeList([...((existing?.barcode_list ?? []) || []), ...barcodes]);

          unitEntries.set(unitId, {
            unit_id: unitId,
            to_main_qnty: existing?.to_main_qnty ? existing.to_main_qnty : multiplier,
            barcode_list: nextBarcodes,
          });
        };

        if (mainUnitId) {
          addUnitEntry(mainUnitId, 1, normalizeBarcodeList(product.unit_1_barcode));
        }

        if (secondaryUnitId) {
          addUnitEntry(secondaryUnitId, Number(product.unit_2_to_main_qnty) || 1, normalizeBarcodeList(product.unit_2_barcode));
        }

        const units = Array.from(unitEntries.values());

        const stores = product.store_id ? [{
          store_id: product.store_id,
          shelf: "",
          reorder_quantity: 0,
          max_quantity: 0,
          min_quantity: 0,
        }] : [];

        const prices: { price_category_id: number; unit_id: number; price: number; currency_id: number }[] = [];
        const priceUnitIds = units.map((unit) => unit.unit_id);

        for (let p = 1; p <= 6; p++) {
          const rawValue = product[`price_${p}` as keyof typeof product];
          const priceValue = Number(rawValue);

          if (!isNaN(priceValue) && priceValue > 0) {
            const priceCategory = definitionsRef.current.price_category.find(pc => pc.id === p);
            if (!priceCategory) continue;

            for (const selectedUnitId of priceUnitIds) {
              prices.push({
                price_category_id: priceCategory.id,
                unit_id: selectedUnitId,
                price: priceValue,
                currency_id: 1,
              });
            }
          }
        }

        const bodyData = {
          product_code: product.product_code,
          product_name: product.product_name,
          product_name_en: product.product_name_en,
          description: product.description,
          category_id: product.category_id || null,
          main_stock_id: product.main_stock_id || null,
          brand: product.brand,
          model: product.model,
          factory_number: "",
          original_number: "",
          measurment_unit: 1,
          last_purchase_price: 0,
          currency_id: 1,
          tax_rate: 16,
          discount_rate: 0,
          expiry_tracking: false,
          batch_tracking: false,
          serial_tracking: false,
          status: 1,
          length: product.length,
          width: product.width,
          height: product.height,
          density: product.weight,
          color: product.color,
          size: product.size,
          notes: product.notes,
          manufacturer_company: product.manufacturer_company,
          units,
          stores,
          prices,
          ...defaultItemAccounts,
        };

        const response = await fetch("/api/inventory/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
          const error = await response.json();
          results.errors.push(`الصنف ${product.product_code}: ${error.message || "خطأ في حفظ الصنف"}`);
          results.failed++;
          setImportProgress({ current: i + 1, total: validProducts.length });
          continue;
        }

        const createdProduct = await response.json();

        results.success++;
      } catch (error) {
        results.errors.push(`الصنف ${product.product_code}: خطأ غير متوقع`);
        results.failed++;
      }

      setImportProgress({ current: i + 1, total: validProducts.length });
    }

    setImportResults(results);
    setIsImporting(false);

    //if (results.success > 0) onImportComplete();
  };


  const resetDialog = () => {
    setFile(null)
    setProducts([])
    setShowPreview(false)
    setShowMapping(false)
    setExcelHeaders([])
    setRawRows([])
    setColumnMapping({})
    setImportResults(null)
    setImportProgress({ current: 0, total: 0 })
  }

  const validProductsCount = products.filter((p) => p.isValid).length
  const invalidProductsCount = products.length - validProductsCount

  // شبكة معاينة عبر DataGridView بدل جدول HTML خام — نفس تصميم استيراد الحسابات من اكسل
  // (components/accounts.tsx: excelGridScheme/DataGridView) بدلاً منه هنا.
  const productsGridColumns = [
    { header: "#", name: "rowNumber", width: 60, isReadOnly: true },
    { header: "رقم الصنف", name: "product_code", width: 140, isReadOnly: true },
    { header: "اسم الصنف", name: "product_name", width: 200, isReadOnly: true },
    { header: "اسم الصنف إنجليزي", name: "product_name_en", width: 200, isReadOnly: true },
    { header: "الوصف", name: "description", width: 250, isReadOnly: true },
    { header: "التصنيف", name: "category_id", width: 130, isReadOnly: true },
    { header: "المخزون الرئيسي", name: "main_stock_id", width: 150, isReadOnly: true },
    { header: "العلامة التجارية", name: "brand", width: 150, isReadOnly: true },
    { header: "الموديل", name: "model", width: 120, isReadOnly: true },
    { header: "الشركة المصنعة", name: "manufacturer_company", width: 180, isReadOnly: true },
    { header: "الوحدة 1", name: "unit_1", width: 120, isReadOnly: true },
    { header: "باركود الوحدة 1", name: "unit_1_barcode", width: 150, isReadOnly: true },
    { header: "الوحدة 2", name: "unit_2", width: 120, isReadOnly: true },
    { header: "باركود الوحدة 2", name: "unit_2_barcode", width: 150, isReadOnly: true },
    { header: "معامل تحويل 2", name: "unit_2_to_main_qnty", width: 120, isReadOnly: true },
    { header: "الوزن", name: "weight", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "الطول", name: "length", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "العرض", name: "width", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "الارتفاع", name: "height", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "اللون", name: "color", width: 120, isReadOnly: true },
    { header: "المقاس", name: "size", width: 120, isReadOnly: true },
    { header: "له صلاحية", name: "expiry_tracking_label", width: 100, isReadOnly: true },
    { header: "له تشغيله", name: "batch_tracking_label", width: 100, isReadOnly: true },
    { header: "له سيريال", name: "serial_tracking_label", width: 100, isReadOnly: true },
    { header: "المستودع", name: "store_name", width: 150, isReadOnly: true },
    { header: "ملاحظات", name: "notes", width: 200, isReadOnly: true },
    { header: "السعر 1", name: "price_1", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "السعر 2", name: "price_2", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "السعر 3", name: "price_3", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "السعر 4", name: "price_4", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "السعر 5", name: "price_5", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "السعر 6", name: "price_6", width: 120, isReadOnly: true, dataType: "Number" },
    { header: "الأخطاء", name: "errors_text", width: 240, isReadOnly: true },
  ]

  const productsGridScheme = { isReport: true, columns: productsGridColumns }

  const buildProductGridRow = (product: ExcelProduct, index: number) => ({
    ...product,
    rowNumber: index + 1,
    expiry_tracking_label: product.expiry_tracking ? "نعم" : "لا",
    batch_tracking_label: product.batch_tracking ? "نعم" : "لا",
    serial_tracking_label: product.serial_tracking ? "نعم" : "لا",
    store_name: product.store_id
      ? definitionsRef.current.warehouses.find((w) => w.id === product.store_id)?.warehouse_name || "غير محدد"
      : "غير محدد",
    errors_text: product.errors?.length ? product.errors.join(", ") : "",
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) resetDialog()
      }}
    modal
    >
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()}>
        {/* Hide default close button */}
        <style>
          {`
      [data-radix-dialog-overlay] [aria-label="Close"] {
        display: none;
      }
    `}
        </style>
        <ExcelImportHeader title="استيراد الأصناف من Excel" description="ارفع الملف، طابق الأعمدة، راجع الأصناف، ثم ابدأ الاستيراد." step={(importResults ? "result" : showPreview ? "preview" : showMapping ? "mapping" : "upload") as ExcelImportStep} />

        <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          {!showMapping && !showPreview && !importResults && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">رفع ملف Excel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={downloadTemplate}
                      className="flex items-center gap-2 bg-transparent"
                    >
                      <Download className="h-4 w-4" />
                      تحميل النموذج
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      قم بتحميل النموذج أولاً لمعرفة تنسيق البيانات المطلوب
                    </span>
                  </div>

                  <div>
                    <Label htmlFor="excel-file">اختر ملف Excel</Label>
                    <Input
                      id="excel-file"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      disabled={isProcessing}
                    />
                  </div>

                  {isProcessing && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-sm">جاري معالجة الملف...</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <strong>تعليمات الاستيراد:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    <li>قم بتحميل النموذج الذي يحتوي على جميع حقول الصنف (أكثر من 40 حقل)</li>
                    <li>املأ البيانات الأساسية: كود الصنف الاسم، الفئة، وسعر الشراء (مطلوبة)</li>
                    <li>يمكن ملء الحقول الاختيارية مثل: الأسعار المختلفة، المقاسات، الألوان، والمواصفات</li>

                    <li>جميع الحقول المالية والكميات يجب أن تكون أرقام صحيحة</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </>
          )}

          {showMapping && (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">مطابقة الأعمدة</h3>
                  <p className="text-sm text-muted-foreground">
                    اختر لكل حقل من حقول النظام العمود المقابل له في ملفك ({rawRows.length} صف). الحقول المميّزة بـ * مطلوبة.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetDialog}>
                    <X className="h-4 w-4 mr-2" /> إلغاء
                  </Button>
                  <Button
                    onClick={buildProductsFromMapping}
                    disabled={PRODUCT_FIELD_DEFS.some(
                      (f) => f.required && (!columnMapping[f.key] || columnMapping[f.key] === NO_MAPPING_VALUE),
                    )}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2 rotate-180" /> متابعة للمعاينة
                  </Button>
                </div>
              </div>

              <div className="grid max-h-[520px] grid-cols-1 gap-3 overflow-y-auto rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
                {PRODUCT_FIELD_DEFS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-red-600"> *</span>}
                    </Label>
                    <Select
                      value={columnMapping[field.key] || NO_MAPPING_VALUE}
                      onValueChange={(value) => setColumnMapping((prev) => ({ ...prev, [field.key]: value }))}
                    >
                      <SelectTrigger className="text-right" dir="rtl">
                        <SelectValue placeholder="اختر العمود" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value={NO_MAPPING_VALUE}>بدون مطابقة</SelectItem>
                        {excelHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showPreview && !importResults && (
            <div className="flex min-w-0 flex-col gap-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-semibold">معاينة البيانات</h3>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      صحيح: {validProductsCount}
                    </Badge>
                    {invalidProductsCount > 0 && (
                      <Badge variant="destructive">غير صحيح: {invalidProductsCount}</Badge>
                    )}
                  </div>

                  <Button variant="outline" disabled={isImporting} onClick={resetDialog}>
                    <X className="h-4 w-4 mr-2" /> إلغاء
                  </Button>
                  <Button
                    onClick={importProducts}
                    disabled={validProductsCount === 0 || isImporting}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    استيراد ({validProductsCount}) صنف
                  </Button>
                </div>
              </div>

              {/* الشريط الأفقي (لعرض 33 عموداً أوسع من الحوار) يجب أن يظهر داخل الشبكة نفسها هنا فقط
                  (overflow-x-auto)، لا على مستوى الحوار كاملاً — DialogContent أعلاه لذلك بلا
                  overflow-x إطلاقاً (overflow-x-hidden)، وmin-w-0 بكل سلف flex بينهما يمنع محتوى
                  الشبكة العريض من توسيع تلك الأسلاف بدل التمرير داخل حدوده الخاصة فقط. */}
              <div className="w-full min-w-0 h-[520px] overflow-x-auto overflow-y-hidden rounded-lg border" dir="rtl">
                <DataGridView
                  style={{ height: "100%", width: "100%" }}
                  idProperty="rowNumber"
                  scheme={productsGridScheme}
                  dataSource={products.map(buildProductGridRow)}
                  showContextMenu={false}
                  copyItemStoreDown={true}
                  dontConvertToCards={true}
                  isReport={true}
                  hideSearch={true}
                  allowSorting={true}
                />
              </div>
            </div>

          )}


          {isImporting && importProgress.total > 0 && (
            <ExcelImportProgress current={importProgress.current} total={importProgress.total} />
          )}


          {importResults && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">نتائج الاستيراد</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ExcelImportStats success={importResults.success} failed={importResults.failed} />

                  {importResults.errors.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">الأخطاء:</h4>
                      <div className="max-h-32 overflow-auto space-y-1">
                        {importResults.errors.map((error, index) => (
                          <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            {error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetDialog}>
                      استيراد ملف آخر
                    </Button>
                    <Button onClick={() => onOpenChange(false)}>إغلاق</Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
