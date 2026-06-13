"use client"

import React, { useState, useRef, useEffect } from "react"
import * as XLSX from "xlsx"
import { useToast } from "@/hooks/use-toast"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import DataGridView from "@/components/common/DataGridView"
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react"

interface ExcelImportProps {
  entityType: "products" | "customers" | "suppliers"
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

interface ImportResult {
  success: number
  failed: number
  errors: string[]
  duplicates: number
}

// Generic Excel row type
interface ExcelRow {
  rowIndex: number
  errors: string[]
  isValid: boolean
  [key: string]: any
}

export function ExcelImport({ entityType, isOpen, onClose, onImportComplete }: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<ExcelRow[]>([])
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Definitions fetched from API (categories, warehouses, etc.)
  const [definitions, setDefinitions] = useState<any>({
    categories: [],
    warehouses: [],
    units: [],
    currencies: [],
    price_category: [],
    product_category: [],
    customer_category: [],
    supplier_category: [],
    cities: [],
    areas: [],
    salesmen: [],
  })
  const definitionsRef = useRef(definitions)

  const entityLabels = {
    products: "الأصناف",
    customers: "الزبائن",
    suppliers: "الموردين",
  }

  const templateColumns = {
    products: [
      { key: "product_code", label: "رقم الصنف" },
      { key: "product_name", label: "اسم الصنف" },
      { key: "description", label: "الوصف" },
      { key: "category", label: "الفئة" },
      { key: "main_unit", label: "الوحدة الأساسية" },
      { key: "secondary_unit", label: "الوحدة الثانوية" },
      { key: "conversion_factor", label: "معامل التحويل" },
      { key: "barcode", label: "الباركود" },
      { key: "last_purchase_price", label: "آخر سعر شراء" },
      { key: "currency", label: "العملة" },
    ],
    customers: [
      { key: "customer_code", label: "رقم الزبون" },
      { key: "customer_name", label: "اسم الزبون" },
      { key: "mobile1", label: "الجوال الأول" },
      { key: "mobile2", label: "الجوال الثاني" },
      { key: "whatsapp1", label: "واتساب الأول" },
      { key: "city", label: "المدينة" },
      { key: "address", label: "العنوان" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "classifications", label: "التصنيف" },
      { key: "priceClass", label: "فئة السعر" },
    ],
    suppliers: [
      { key: "customer_code", label: "رقم الزبون" },
      { key: "customer_name", label: "اسم الزبون" },
      { key: "mobile1", label: "الجوال الأول" },
      { key: "mobile2", label: "الجوال الثاني" },
      { key: "whatsapp1", label: "واتساب الأول" },
      { key: "city", label: "المدينة" },
      { key: "address", label: "العنوان" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "classifications", label: "التصنيف" },
      { key: "priceClass", label: "فئة السعر" },
    ],
  }

  const previewGridData = previewData.map((row) => ({
    ...row,
    errorsText: row.errors && row.errors.length > 0 ? row.errors.join(", ") : "-",
  }))

  const previewGridScheme = {
    isReport: true,
    columns: [
      ...templateColumns[entityType].map((col) => ({
        header: col.label,
        name: col.key,
        width: "*",
        isReadOnly: true,
      })),
      {
        header: "الأخطاء",
        name: "errorsText",
        width: "2*",
        isReadOnly: true,
      },
    ],
  }

  useEffect(() => {
    definitionsRef.current = definitions
  }, [definitions])

  // Fetch definitions from API
  const fetchDefinitions = async () => {
    setLoading(true)
    try {
      const resCategories = await fetch("/api/item-groups")
      const categories = resCategories.ok ? await resCategories.json() : []
      setDefinitions((prev: any) => ({ ...prev, categories }))
      definitionsRef.current.categories = categories

      const response = await fetch("/api/cities")
      if (response.ok) {
        const data = await response.json()
        setDefinitions((prev: any) => ({ ...prev, cities: data }))
        definitionsRef.current.cities = data
      }
      const cust_cat_response = await fetch("/api/customer-categories")

      if (cust_cat_response.ok) {
        const data = await cust_cat_response.json()
        setDefinitions((prev: any) => ({ ...prev, customer_category: data.categories }))
        definitionsRef.current.customer_category = data
      }
      const supp_cat_response = await fetch("/api/supplier-categories")
      if (supp_cat_response.ok) {
        const data = await supp_cat_response.json()
        setDefinitions((prev: any) => ({ ...prev, supplier_category: data.categories }))
        definitionsRef.current.supplier_category = data
      }
      const price_response = await fetch("/api/pricecategory")
      if (price_response.ok) {
        const data = await price_response.json()
        setDefinitions((prev: any) => ({ ...prev, price_category: data }))
        definitionsRef.current.price_category = data
      }
      console.log("definitionsRef ", definitionsRef)
    } catch (error) {
      console.error("Error fetching definitions:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDefinitions()
  }, [])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return
    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: "خطأ في نوع الملف",
        description: "يرجى اختيار ملف Excel (.xlsx أو .xls)",
        variant: "destructive",
      })
      return
    }
    setFile(selectedFile)
  }

  const downloadTemplate = () => {
    const columns = templateColumns[entityType]
    const headerRow = columns.map(col => col.label)
    const sampleRow = columns.map(() => "")
    const ws = XLSX.utils.aoa_to_sheet([headerRow, sampleRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `template_${entityLabels[entityType]}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Generic Excel processing function
  const processFile = async () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      let processedData: any[] = [];

      if (entityType === "products") {
        processedData = jsonData.map((row, index) => ({
          rowIndex: index + 2,
          errors: [],
          isValid: true,
          product_code: row["رقم الصنف"] || row["product_code"] || "",
          product_name: row["اسم الصنف"] || row["product_name"] || "",
          description: row["الوصف"] || row["description"] || "",
          category_id: Number(row["الفئة"] || row["category_id"]) || 0,
          main_unit: row["الوحدة الأساسية"] || row["main_unit"] || "",
          secondary_unit: row["الوحدة الثانوية"] || row["secondary_unit"] || "",
          conversion_factor: Number(row["معامل التحويل"] || row["conversion_factor"]) || 1,
          barcode: row["الباركود"] || row["barcode"] || "",
          last_purchase_price: Number(row["آخر سعر شراء"] || row["last_purchase_price"]) || 0,
          currency: row["العملة"] || row["currency"] || "",
        }));
      } else if (entityType === "customers" || entityType === "suppliers") {
        processedData = jsonData.map((row, index) => {
          const customer: any = {
            rowIndex: index + 2,
            errors: [],
            isValid: true,
            customer_code: row["رقم الزبون"] || row["customer_code"] || "",
            customer_name: row["اسم الزبون"] || row["customer_name"] || "",
            mobile1: row["الجوال الأول"] || row["mobile1"] || "",
            mobile2: row["الجوال الثاني"] || row["mobile2"] || "",
            whatsapp1: row["واتساب الأول"] || row["whatsapp1"] || "",
            city: row["المدينة"] || row["city"] || "",
            address: row["العنوان"] || row["address"] || "",
            email: row["البريد الإلكتروني"] || row["email"] || "",
            status: row["الحالة"] || row["status"] || "",
            classifications: row["التصنيف"] || row["classifications"] || "",
            priceClass: row["فئة السعر"] || row["priceClass"] || "",
          };

          // Validation
          if (!customer.customer_code.trim()) customer.errors.push("رقم الزبون مطلوب");
          if (!customer.customer_name.trim()) customer.errors.push("اسم الزبون مطلوب");

          // City validation if not empty
          if (customer.city.trim()) {
            const cityExists = definitionsRef.current.cities?.some(
              (c: any) => c.name === customer.city || c.name_en === customer.city
            );
            if (!cityExists) customer.errors.push(`المدينة "${customer.city}" غير موجودة`);
          }

          if (entityType === "customers") {
            if (customer.classifications.trim()) {
              const cityExists = definitionsRef.current.customer_category?.some(
                (c: any) => c.name === customer.classifications
              );
              if (!cityExists) customer.errors.push(`تصنيف "${customer.classifications}" غير موجود`);
            }
          }
          if (entityType === "suppliers") {
            if (customer.classifications.trim()) {
              const cityExists = definitionsRef.current.supplier_category?.some(
                (c: any) => c.name === customer.classifications
              );
              if (!cityExists) customer.errors.push(`تصنيف "${customer.classifications}" غير موجود`);
            }
          }
          if (customer.priceClass + '' ?.trim()) {
            console.log("customer.price_category ",customer.price_category)
            const priceCat = definitionsRef.current.price_category?.find(
              (c: any) => c.name === customer.priceClass || c.id === Number(customer.priceClass)
            );

            if (!priceCat) {
              customer.errors.push(`فئة السعر "${customer.priceClass}" غير موجودة`);
            } else {
              customer.priceClass = priceCat.id; // Replace name with ID
            }
          }
          // Optionally, you can add validations for email, classifications, priceClass, etc.
          if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) {
            customer.errors.push("صيغة البريد الإلكتروني غير صحيحة");
          }

          // Set isValid flag
          customer.isValid = customer.errors.length === 0;
          return customer;
        });
      }


      setPreviewData(processedData);
      setStep("preview");

      toast({
        title: `تم تحليل ملف ${entityLabels[entityType]} بنجاح`,
        description: `تم العثور على ${processedData.length} سجل`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ في معالجة الملف",
        description: error.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const confirmImport = async () => {
    setIsUploading(true);
    setProgress(0);

    try {
      // Annotate type and filter only valid records
      const typeValue = entityType === "suppliers" ? 2 : 1;

      const dataToSend = previewData
        .filter((item) => item.isValid)  // only valid records
        .map((item) => ({ ...item, type: typeValue }));
      console.log("dataToSend ", dataToSend)
      // For suppliers, the API endpoint still uses "customers"
      const apiEntityType = entityType === "suppliers" ? "customers" : entityType;

      const response = await fetch(`/api/import/${apiEntityType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataToSend }),
      });

      if (!response.ok) throw new Error("فشل في استيراد البيانات");

      const result = await response.json();
      setImportResult(result);
      setStep("result");

      //if (result.success > 0) onImportComplete();

      toast({
        title: "تم الاستيراد",
        description: `تم استيراد ${result.success} سجل بنجاح`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ في الاستيراد",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const resetImport = () => {
    setFile(null)
    setPreviewData([])
    setImportResult(null)
    setStep("upload")
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleClose = () => {
    resetImport()
    if(importResult && importResult.success >0) onImportComplete()
    else onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="excel-import-dialog max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6"
        dir="rtl"
        style={{ width: "96vw", maxWidth: "96vw" }}
      >
        <style>{`
          .excel-import-dialog .wj-flexgrid {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .excel-import-dialog .wj-flexgrid .wj-rowheaders {
            width: 0 !important;
            min-width: 0 !important;
            display: none !important;
          }

          .excel-import-dialog .wj-flexgrid .wj-cells {
            width: 100% !important;
          }
          .excel-import-dialog .wj-flexgrid .wj-cells .wj-cell {
            width: 100% !important;
          }
        `}</style>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            استيراد {entityLabels[entityType]} من Excel
          </DialogTitle>
        </DialogHeader>

        <ProgressSpinner loading={loading} />

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden" dir="rtl">
          {/* UPLOAD STEP */}
          {step === "upload" && (
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  يرجى تحميل ملف Excel يحتوي على البيانات المطلوبة. يمكنك تحميل نموذج فارغ للمساعدة في تنسيق البيانات.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <Label htmlFor="file-upload" className="text-lg font-semibold">اختيار ملف Excel</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <Input ref={fileInputRef} id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="mb-2">اختيار ملف</Button>
                    <p className="text-sm text-gray-500">{file ? file.name : "لم يتم اختيار ملف"}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-semibold">تحميل نموذج فارغ</Label>
                  <div className="border rounded-lg p-6 text-center">
                    <Download className="mx-auto h-12 w-12 text-blue-500 mb-4" />
                    <Button variant="outline" onClick={downloadTemplate}>
                      <Download className="ml-2 h-4 w-4" /> تحميل نموذج {entityLabels[entityType]}
                    </Button>
                    <p className="text-sm text-gray-500 mt-2">نموذج Excel جاهز للتعبئة</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>إلغاء</Button>
                <Button onClick={processFile} disabled={!file || isUploading}>معاينة البيانات</Button>
              </div>
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === "preview" && (
            <div className="space-y-6 min-w-0 w-full overflow-hidden">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  تم تحليل الملف بنجاح. يرجى مراجعة البيانات أدناه قبل الاستيراد النهائي.
                </AlertDescription>
              </Alert>

              <div className="w-full min-w-0 border rounded-lg overflow-hidden">
                <DataGridView
                  style={{ maxHeight: "70vh", minHeight: "50vh", width: "100%", overflowX: "hidden" }}
                  idProperty="rowIndex"
                  scheme={previewGridScheme}
                  dataSource={previewGridData}
                  showContextMenu={false}
                  copyItemStoreDown={true}
                  dontConvertToCards={true}
                  isReport={true}
                  hideSearch={true}
                  allowSorting={true}
                />
                {previewData.length > 10000 && (
                  <div className="p-3 bg-gray-50 text-center text-sm text-gray-600">
                    وعرض {previewData.length - 10000} سجل إضافي...
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetImport}>العودة</Button>
                <Button onClick={confirmImport} disabled={isUploading} className="bg-green-600 hover:bg-green-700">تأكيد الاستيراد</Button>
              </div>
            </div>
          )}

          {/* RESULT STEP */}
          {step === "result" && importResult && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-xl font-semibold mb-2">تم الاستيراد بنجاح!</h3>
              </div>

              <div className="grid grid-cols-3 gap-6 text-center">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold">نجاح</h4>
                  <p className="text-lg">{importResult.success}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold">فشل</h4>
                  <p className="text-lg">{importResult.failed}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold">تكرارات</h4>
                  <p className="text-lg">{importResult.duplicates}</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mt-4 p-4 border rounded-lg bg-red-50 text-red-700">
                  <h4 className="font-semibold mb-2">الأخطاء</h4>
                  <ul className="list-disc list-inside">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={handleClose}>إغلاق</Button>
                <Button onClick={resetImport}>استيراد آخر</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog >
  )
}
