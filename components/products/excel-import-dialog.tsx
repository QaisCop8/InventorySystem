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
  [key: string]: any
  product_code: string
  product_name: string
  product_name_en?: string
  description?: string
  category_id: number
  main_stock_group?: string
  unit_1?: string
  unit_1?: string
  main_stock_group?: string
  notes?: string
  expiry_tracking: boolean
  batch_tracking: boolean
  serial_tracking?: boolean
  factory_number_1?: string
  factory_number_2?: string
  factory_number_3?: string
  original_number_1?: string
  original_number_2?: string
  original_number_3?: string
  rowIndex?: number
  errors?: string[]
  isValid?: boolean
}

interface ExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

interface ExcelColumn {
  key: string
  label: string
  normalized: string
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
  { key: "main_stock_group", label: "رقم المجموعة" },
  { key: "unit_1", label: "الوحدة 1" },
  { key: "notes", label: "ملاحظات" },
  { key: "expiry_tracking", label: "له تاريخ صلاحية" },
  { key: "batch_tracking", label: "له رقم تشغيلي" },
  { key: "serial_tracking", label: "له رقم متسلسل" },
  { key: "factory_number_1", label: "رقم المصنع 1" },
  { key: "factory_number_2", label: "رقم المصنع 2" },
  { key: "factory_number_3", label: "رقم المصنع 3" },
  { key: "original_number_1", label: "الرقم الأصلي 1" },
  { key: "original_number_2", label: "الرقم الأصلي 2" },
  { key: "original_number_3", label: "الرقم الأصلي 3" },
]

for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
  if (unitNumber > 1) {
    PRODUCT_FIELD_DEFS.splice(
      PRODUCT_FIELD_DEFS.findIndex((field) => field.key === "notes"),
      0,
      { key: `unit_${unitNumber}`, label: `الوحدة ${unitNumber}` },
      { key: `unit_${unitNumber}_to_main_qnty`, label: `العلاقة بالوحدة الرئيسية ${unitNumber}` },
    )
  }
  for (let barcodeNumber = 1; barcodeNumber <= 6; barcodeNumber++) {
    PRODUCT_FIELD_DEFS.splice(
      PRODUCT_FIELD_DEFS.findIndex((field) => field.key === "notes"),
      0,
      { key: `unit_${unitNumber}_barcode_${barcodeNumber}`, label: `باركود الوحدة ${unitNumber} - ${barcodeNumber}` },
    )
  }
  PRODUCT_FIELD_DEFS.splice(
    PRODUCT_FIELD_DEFS.findIndex((field) => field.key === "notes"),
    0,
    { key: `unit_${unitNumber}_sale_price`, label: `سعر بيع الوحدة ${unitNumber}` },
  )
}

// لا خيار مطابقة لهذا الحقل — يبقى بقيمته الافتراضية (فارغ/0/false) لكل صف.
const NO_MAPPING_VALUE = "__none__"

export function ExcelImportDialog({ open, onOpenChange, onImportComplete }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [products, setProducts] = useState<ExcelProduct[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [loading, setLoading] = useState(false);
  // خطوة مطابقة الأعمدة: rawRows/excelColumns تُملأ فور رفع الملف (processExcelFile)، ثم
  // buildProductsFromMapping تبني منها products الفعلية وفق ما اختاره المستخدم بـcolumnMapping.
  const [excelColumns, setExcelColumns] = useState<ExcelColumn[]>([])
  const [rawRows, setRawRows] = useState<any[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [showMapping, setShowMapping] = useState(false)
  const importAbortControllerRef = useRef<AbortController | null>(null)
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
    const templateData = [{
        product_code: "A000000001",
        product_name: "منتج تجريبي",
        product_name_en: "Sample Product",
        description: "وصف المنتج التفصيلي",
        category_id: 1,
        main_stock_group: "مجموعة تجريبية",
        notes: "منتج عالي الجودة مع ضمان شامل",
        expiry_tracking: false,
        batch_tracking: true,
        serial_tracking: false,
        factory_number_1: "FAC-001", factory_number_2: "", factory_number_3: "",
        original_number_1: "ORG-001", original_number_2: "", original_number_3: "",
      }, {
        product_code: "B000000002",
        product_name: "منتج غذائي",
        product_name_en: "Food Product",
        description: "منتج غذائي طبيعي",
        category_id: 2,
        main_stock_group: "مواد غذائية",
        notes: "يحفظ في مكان بارد وجاف",
        expiry_tracking: true,
        batch_tracking: true,
        serial_tracking: false,
        factory_number_1: "", factory_number_2: "", factory_number_3: "",
        original_number_1: "", original_number_2: "", original_number_3: "",
      }]

    for (const row of templateData) {
      for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
        row[`unit_${unitNumber}`] = unitNumber === 1 ? "حبة" : ""
        row[`unit_${unitNumber}_sale_price`] = unitNumber === 1 ? 100 : ""
        if (unitNumber > 1) row[`unit_${unitNumber}_to_main_qnty`] = ""
        for (let barcodeNumber = 1; barcodeNumber <= 6; barcodeNumber++) {
          row[`unit_${unitNumber}_barcode_${barcodeNumber}`] = barcodeNumber === 1 && unitNumber === 1 ? "123456" : ""
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = Object.keys(templateData[0]).map(() => ({ wch: 18 }));

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
    if (/^\d+$/.test(code)) return code.padStart(10, "0")
    const prefix = code.slice(0, 1)
    const suffix = code.slice(1)
    return prefix + suffix.padStart(10 - prefix.length, "0")
  }

  // يبني تخميناً أولياً للمطابقة (fieldKey → عنوان عمود بملف المستخدم) بمطابقة تامة (بلا حساسية
  // لحالة الأحرف/فراغات طرفية) بين مفتاح الحقل وعناوين أعمدة الملف الفعلية — يغطي حالة الاستخدام
  // الأكثر شيوعاً (ملء نموذجنا نفسه دون تغيير رؤوس الأعمدة) تلقائياً، ويترك البقية للمستخدم ليختارها
  // يدوياً بخطوة المطابقة إن اختلفت رؤوس عمود ملفه عن أسماء حقولنا.
  const guessColumnMapping = (columns: ExcelColumn[]): Record<string, string> => {
    const mapping: Record<string, string> = {}
    for (const field of PRODUCT_FIELD_DEFS) {
      const match = columns.find((column) => column.normalized === field.key.toLowerCase())
      mapping[field.key] = match ? match.key : NO_MAPPING_VALUE
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
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
      const headerRow = matrix[0] || [];
      const usedLabels: Record<string, number> = {}
      const columns: ExcelColumn[] = headerRow.map((header, index) => {
        const label = String(header ?? "").trim() || `عمود ${index + 1}`
        const occurrence = (usedLabels[label] || 0) + 1
        usedLabels[label] = occurrence
        return {
          key: `column_${index}`,
          label: occurrence === 1 ? label : `${label} (${occurrence})`,
          normalized: label.toLowerCase(),
        }
      })
      const jsonData = matrix.slice(1).map((row) =>
        columns.reduce<Record<string, any>>((record, column, index) => {
          record[column.key] = row[index]
          return record
        }, {}),
      )

      if (jsonData.length === 0 || columns.length === 0) {
        alert("الملف فارغ أو لا يحتوي على صف عناوين أعمدة صالح");
        return;
      }

      setRawRows(jsonData);
      setExcelColumns(columns);
      setColumnMapping(guessColumnMapping(columns));
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
  const buildProductsFromMapping = async () => {
    setIsProcessing(true)
    const readField = (row: any, key: string) => {
      const columnKey = columnMapping[key]
      if (!columnKey || columnKey === NO_MAPPING_VALUE) return undefined
      return row[columnKey]
    }
    // نصوص الملف قد تصل كأرقام (خلية Excel مُنسَّقة كرقم لا نص، كرقم صنف "12345" بلا صياغة نصية
    // صريحة) — XLSX.utils.sheet_to_json يُرجعها عندئذ number لا string، فيتحطّم أي .trim() لاحق
    // عليها مباشرة (Number.prototype لا يملك trim). كل حقل نصي هنا يُمرَّر عبر String(...) صراحة
    // بدل الاعتماد على || "" وحدها (لا تكفي لتحويل رقم فعلي إلى نص).
    const readText = (row: any, key: string) => {
      const value = readField(row, key)
      return value === undefined || value === null ? "" : String(value).trim()
    }

    const processedProducts: ExcelProduct[] = []
    const barcodeRows = new Map<string, number>()
    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index]
      const product: ExcelProduct = {
        product_code: adjustProductCodeTo10(readText(row, "product_code")),
        product_name: readText(row, "product_name"),
        product_name_en: readText(row, "product_name_en"),
        description: readText(row, "description"),
        category_id: Number(readField(row, "category_id")) || 0,
        main_stock_group: readText(row, "main_stock_group"),
        last_purchase_price: Number(readField(row, "last_purchase_price")) || 0,
        minimum_order_quantity: Number(readField(row, "minimum_order_quantity")) || 0,
        currency_id: Number(readField(row, "currency_id")) || 1,
        tax_rate: Number(readField(row, "tax_rate")) || 0,
        discount_rate: Number(readField(row, "discount_rate")) || 0,
        unit_1: readText(row, "unit_1"),
        notes: readText(row, "notes"),
        expiry_tracking: readField(row, "expiry_tracking") === true || String(readField(row, "expiry_tracking") ?? "").trim().toLowerCase() === "true" || String(readField(row, "expiry_tracking") ?? "").trim() === "1",
        batch_tracking: readField(row, "batch_tracking") === true || String(readField(row, "batch_tracking") ?? "").trim().toLowerCase() === "true" || String(readField(row, "batch_tracking") ?? "").trim() === "1",
        serial_tracking: readField(row, "serial_tracking") === true || String(readField(row, "serial_tracking") ?? "").trim().toLowerCase() === "true" || String(readField(row, "serial_tracking") ?? "").trim() === "1",
        default_store: Number(readField(row, "default_store")) || 0,
        status: Number(readField(row, "status")) || 1,
        type: Number(readField(row, "type")) || 1,
        service_type: Number(readField(row, "service_type")) || 0,
        product_type: 1,
        tax_classification_id: Number(readField(row, "tax_classification_id")) || 0,
        transaction_notes: readText(row, "transaction_notes"),
        entry_date: readText(row, "entry_date"),
        rowIndex: index + 2,
        errors: [],
      };

      for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
        product[`unit_${unitNumber}`] = readText(row, `unit_${unitNumber}`)
        product[`unit_${unitNumber}_to_main_qnty`] = unitNumber === 1 ? 1 : Number(readField(row, `unit_${unitNumber}_to_main_qnty`)) || 0
        product[`unit_${unitNumber}_sale_price`] = Number(readField(row, `unit_${unitNumber}_sale_price`)) || 0
        for (let barcodeNumber = 1; barcodeNumber <= 6; barcodeNumber++) {
          product[`unit_${unitNumber}_barcode_${barcodeNumber}`] = readText(row, `unit_${unitNumber}_barcode_${barcodeNumber}`)
        }
      }
      for (let numberIndex = 1; numberIndex <= 3; numberIndex++) {
        product[`factory_number_${numberIndex}`] = readText(row, `factory_number_${numberIndex}`)
        product[`original_number_${numberIndex}`] = readText(row, `original_number_${numberIndex}`)
      }

      const errors: string[] = [];
      const rowBarcodes = new Set<string>()
      for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
        for (let barcodeNumber = 1; barcodeNumber <= 6; barcodeNumber++) {
          const barcode = String(product[`unit_${unitNumber}_barcode_${barcodeNumber}`] || "").trim()
          if (!barcode) continue
          const normalizedBarcode = barcode.toLowerCase()
          if (rowBarcodes.has(normalizedBarcode)) {
            errors.push(`الباركود ${barcode} مكرر داخل نفس الصنف`)
          } else {
            rowBarcodes.add(normalizedBarcode)
          }
          const previousRow = barcodeRows.get(normalizedBarcode)
          if (previousRow !== undefined) {
            errors.push(`الباركود ${barcode} مكرر مع السطر ${previousRow}`)
          } else {
            barcodeRows.set(normalizedBarcode, index + 2)
          }
        }
      }
      if (!product.product_code.trim()) errors.push("رقم الصنف مطلوب");
      if (!product.product_name.trim()) errors.push("اسم الصنف مطلوب");
      if (!product.unit_1 || !String(product.unit_1).trim()) {
        errors.push("الوحدة الرئيسية مطلوبة");
      }
      if (product.default_store > 0) {
        const warehouseExists = definitionsRef.current.warehouses.some(w => w.id === product.default_store)
        if (!warehouseExists) errors.push(`المستودع (default_store: ${product.default_store}) غير موجود في النظام`)
      }
      if (product.category_id > 0) {
        const categoryExists = definitionsRef.current.product_category.some(w => w.id === product.category_id)
        if (!categoryExists) errors.push(`التصنيف (category_id: ${product.category_id}) غير موجود في النظام`)
      }
      for (let unitNumber = 2; unitNumber <= 6; unitNumber++) {
        if (product[`unit_${unitNumber}`] && Number(product[`unit_${unitNumber}_to_main_qnty`]) <= 0) {
          errors.push(`العلاقة بالوحدة الرئيسية ${unitNumber} يجب أن تكون أكبر من صفر`)
        }
      }
      for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
        if (Number(product[`unit_${unitNumber}_sale_price`]) < 0) {
          errors.push(`سعر بيع الوحدة ${unitNumber} يجب ألا يكون سالباً`)
        }
      }

      product.errors = errors;
      product.isValid = errors.length === 0;

      processedProducts.push(product)

      // Yield periodically so large files do not block the browser event loop.
      if (index > 0 && index % 250 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }

    setProducts(processedProducts);
    setShowMapping(false);
    setShowPreview(true);
    setIsProcessing(false)
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

    const abortController = new AbortController()
    importAbortControllerRef.current = abortController
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
        signal: abortController.signal,
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

    const resolveMainStockGroup = async (value: string): Promise<number | null> => {
      const text = String(value || "").trim()
      if (!text) return null
      const existing = definitionsRef.current.categories.find((group: any) =>
        String(group.group_name || "").trim().toLowerCase() === text.toLowerCase() ||
        String(group.group_code || "").trim().toLowerCase() === text.toLowerCase() ||
        String(group.id) === text,
      )
      if (existing) return existing.id
      const response = await fetch("/api/item-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ group_name: text, group_code: text, status: "نشط" }),
      })
      if (!response.ok) throw new Error(`فشل إنشاء مجموعة الصنف: ${text}`)
      const created = await response.json()
      definitionsRef.current.categories = [...definitionsRef.current.categories, created]
      return Number(created.id) || null
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validProducts.length });
    const results = { success: 0, failed: 0, errors: [] as string[] };
    const defaultItemAccounts = await loadDefaultItemAccounts();
    if (abortController.signal.aborted) {
      setIsImporting(false)
      return
    }

    for (let i = 0; i < validProducts.length && !abortController.signal.aborted; i++) {
      const product = validProducts[i];

      try {
        const mainStockId = await resolveMainStockGroup(product.main_stock_group)

        const unitEntries = new Map<number, { unit_id: number; to_main_qnty: number; barcode_list: string[] }>();
        const unitIdsByNumber = new Map<number, number>()

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

        for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
          const unitName = String(product[`unit_${unitNumber}`] || "").trim()
          if (!unitName) continue
          const unitId = await ensureUnitExists(unitName)
          if (!unitId) continue
          unitIdsByNumber.set(unitNumber, unitId)
          const barcodes = Array.from({ length: 6 }, (_, barcodeIndex) => product[`unit_${unitNumber}_barcode_${barcodeIndex + 1}`])
          addUnitEntry(unitId, Number(product[`unit_${unitNumber}_to_main_qnty`]) || 1, normalizeBarcodeList(barcodes))
        }

        const units = Array.from(unitEntries.values());

        const stores = product.default_store ? [{
          store_id: product.default_store,
          shelf: "",
          reorder_quantity: 0,
          max_quantity: 0,
          min_quantity: 0,
        }] : [];

        const prices: { price_category_id: number; unit_id: number; price: number; currency_id: number }[] = [];

        for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
          const priceValue = Number(product[`unit_${unitNumber}_sale_price`])
          const unitId = unitIdsByNumber.get(unitNumber)
          if (priceValue > 0 && unitId) {
            prices.push({ price_category_id: definitionsRef.current.price_category[0]?.id || 1, unit_id: unitId, price: priceValue, currency_id: 1 })
          }
        }

        const bodyData = {
          product_code: product.product_code,
          product_name: product.product_name,
          product_name_en: product.product_name_en,
          description: product.description,
          category_id: product.category_id || null,
          main_stock_id: mainStockId,
          factory_number: "",
          original_number: "",
          factory_numbers: [1, 2, 3].map((numberIndex) => product[`factory_number_${numberIndex}`]).filter(Boolean),
          original_numbers: [1, 2, 3].map((numberIndex) => product[`original_number_${numberIndex}`]).filter(Boolean),
          last_purchase_price: product.last_purchase_price,
          currency_id: product.currency_id,
          tax_rate: product.tax_rate,
          discount_rate: product.discount_rate,
          expiry_tracking: product.expiry_tracking,
          batch_tracking: product.batch_tracking,
          serial_tracking: product.serial_tracking,
          status: product.status,
          type: product.type,
          service_type: product.service_type,
          product_type: 1,
          tax_classification_id: product.tax_classification_id,
          minimum_order_quantity: product.minimum_order_quantity,
          entry_date: product.entry_date,
          notes: product.notes,
          transaction_notes: product.transaction_notes,
          units,
          stores,
          prices,
          ...defaultItemAccounts,
        };

        const response = await fetch("/api/inventory/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
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
        if (abortController.signal.aborted) break
        results.errors.push(`الصنف ${product.product_code}: خطأ غير متوقع`);
        results.failed++;
      }

      setImportProgress({ current: i + 1, total: validProducts.length });
    }

    if (abortController.signal.aborted) {
      setIsImporting(false)
      return
    }

    setImportResults(results);
    setIsImporting(false);
    importAbortControllerRef.current = null

    //if (results.success > 0) onImportComplete();
  };


  const resetDialog = () => {
    importAbortControllerRef.current?.abort()
    importAbortControllerRef.current = null
    setFile(null)
    setProducts([])
    setShowPreview(false)
    setShowMapping(false)
    setExcelColumns([])
    setRawRows([])
    setColumnMapping({})
    setImportResults(null)
    setImportProgress({ current: 0, total: 0 })
    setIsImporting(false)
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
    { header: "رقم المجموعة", name: "main_stock_group", width: 150, isReadOnly: true },
    { header: "آخر سعر شراء", name: "last_purchase_price", width: 130, isReadOnly: true, dataType: "Number" },
    { header: "الحد الأدنى للطلب", name: "minimum_order_quantity", width: 150, isReadOnly: true, dataType: "Number" },
    { header: "له صلاحية", name: "expiry_tracking_label", width: 100, isReadOnly: true },
    { header: "له تشغيله", name: "batch_tracking_label", width: 100, isReadOnly: true },
    { header: "له سيريال", name: "serial_tracking_label", width: 100, isReadOnly: true },
    { header: "المستودع", name: "store_name", width: 150, isReadOnly: true },
    { header: "الضريبة", name: "tax_rate", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "الخصم", name: "discount_rate", width: 100, isReadOnly: true, dataType: "Number" },
    { header: "ملاحظات", name: "notes", width: 200, isReadOnly: true },
    { header: "ملاحظات المعاملات", name: "transaction_notes", width: 200, isReadOnly: true },
    { header: "تاريخ الإدخال", name: "entry_date", width: 130, isReadOnly: true },
    { header: "الأخطاء", name: "errors_text", width: 240, isReadOnly: true },
  ]

for (let unitNumber = 1; unitNumber <= 6; unitNumber++) {
  productsGridColumns.push(
    { header: `الوحدة ${unitNumber}`, name: `unit_${unitNumber}`, width: 120, isReadOnly: true },
    { header: `العلاقة بالوحدة الرئيسية ${unitNumber}`, name: `unit_${unitNumber}_to_main_qnty`, width: 170, isReadOnly: true },
    { header: `سعر بيع الوحدة ${unitNumber}`, name: `unit_${unitNumber}_sale_price`, width: 150, isReadOnly: true, dataType: "Number" },
    ...Array.from({ length: 6 }, (_, barcodeIndex) => ({ header: `باركود الوحدة ${unitNumber} - ${barcodeIndex + 1}`, name: `unit_${unitNumber}_barcode_${barcodeIndex + 1}`, width: 170, isReadOnly: true })),
  )
}
productsGridColumns.push(
  { header: "رقم المصنع 1", name: "factory_number_1", width: 150, isReadOnly: true },
  { header: "رقم المصنع 2", name: "factory_number_2", width: 150, isReadOnly: true },
  { header: "رقم المصنع 3", name: "factory_number_3", width: 150, isReadOnly: true },
  { header: "الرقم الأصلي 1", name: "original_number_1", width: 150, isReadOnly: true },
  { header: "الرقم الأصلي 2", name: "original_number_2", width: 150, isReadOnly: true },
  { header: "الرقم الأصلي 3", name: "original_number_3", width: 150, isReadOnly: true },
)

  const productsGridScheme = { isReport: true, columns: productsGridColumns }
  const previewProducts = products.slice(0, 200)

  const buildProductGridRow = (product: ExcelProduct, index: number) => ({
    ...product,
    rowNumber: index + 1,
    expiry_tracking_label: product.expiry_tracking ? "نعم" : "لا",
    batch_tracking_label: product.batch_tracking ? "نعم" : "لا",
    serial_tracking_label: product.serial_tracking ? "نعم" : "لا",
    store_name: product.default_store
      ? definitionsRef.current.warehouses.find((w) => w.id === product.default_store)?.warehouse_name || "غير محدد"
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
                    <li>قم بتحميل النموذج ثم طابق أعمدته مع حقول الاستيراد قبل المعاينة.</li>
                    <li>الحقول المطلوبة هي: رقم الصنف، اسم الصنف، والوحدة الرئيسية.</li>
                    <li>يمكن إدخال مجموعة الصنف بالاسم أو الكود؛ إذا لم تكن موجودة فسيتم إنشاؤها تلقائياً.</li>
                    <li>يمكن إضافة حتى 6 وحدات، و6 باركودات لكل وحدة، وسعر بيع لكل وحدة ضمن أول فئة سعر.</li>
                    <li>عند إدخال وحدة إضافية، يجب أن تكون العلاقة بالوحدة الرئيسية أكبر من صفر، والباركودات المكررة مرفوضة.</li>
                    <li>يجب إدخال الأسعار والكميات وعلاقات التحويل كأرقام صحيحة أو عشرية صحيحة.</li>
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
                    disabled={
                      isProcessing ||
                      PRODUCT_FIELD_DEFS.some(
                        (f) => f.required && (!columnMapping[f.key] || columnMapping[f.key] === NO_MAPPING_VALUE),
                      )
                    }
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
                      <SelectContent className="z-[10000]" dir="rtl" side="top" sideOffset={4}>
                        <SelectItem value={NO_MAPPING_VALUE}>بدون مطابقة</SelectItem>
                        {excelColumns.map((column) => (
                          <SelectItem key={column.key} value={column.key}>
                            {column.label}
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
                  {products.length > previewProducts.length && (
                    <span className="text-sm text-muted-foreground">عرض أول {previewProducts.length} صفاً من أصل {products.length}</span>
                  )}
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      صحيح: {validProductsCount}
                    </Badge>
                    {invalidProductsCount > 0 && (
                      <Badge variant="destructive">غير صحيح: {invalidProductsCount}</Badge>
                    )}
                  </div>

                  <Button variant="outline" onClick={resetDialog}>
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
              <div className="excel-account-grid w-full min-w-0 h-[520px] overflow-x-hidden overflow-y-hidden rounded-lg border" dir="rtl">
                <div className="h-full min-w-[4700px]">
                  <DataGridView
                    containerStyle={{ height: "100%", width: "100%" }}
                    className="excel-product-grid"
                    idProperty="rowNumber"
                    scheme={productsGridScheme}
                    dataSource={previewProducts.map(buildProductGridRow)}
                    showContextMenu={false}
                    copyItemStoreDown={true}
                    dontConvertToCards={true}
                    isReport={true}
                    hideSearch={true}
                    allowSorting={true}
                  />
                </div>
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
