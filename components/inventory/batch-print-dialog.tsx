"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Printer, Search, Package, Scan, AlertTriangle, Eye, Settings } from "lucide-react"

interface BatchDetails {
  lot_id: number
  lot_number: string
  product_code: string
  product_name: string
  color_code?: string
  color_name?: string
  model_name?: string
  purchase_date?: string
  manufacturing_date?: string
  expiry_date?: string
  initial_quantity: number
  current_quantity: number
  unit_cost: number
  warehouse_name?: string
  floor?: string
  shelf?: string
  location?: string
  supplier_name?: string
  status: "new" | "in_use" | "finished" | "damaged"
  status_display: string
  barcode?: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
  barcode?: string
}

interface ProductLot {
  lot_id: number
  lot_number: string
  current_quantity: number
  status: string
  expiry_date?: string
}

interface PrintSettings {
  default_printer?: string
  auto_print?: boolean
  print_copies?: number
}

export function BatchPrintDialog() {
  const [open, setOpen] = useState(false)
  const [searchMethod, setSearchMethod] = useState<"barcode" | "direct" | "product">("barcode")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [lotNumberInput, setLotNumberInput] = useState("")
  const [selectedProduct, setSelectedProduct] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [productLots, setProductLots] = useState<ProductLot[]>([])
  const [selectedLot, setSelectedLot] = useState("")
  const [batchDetails, setBatchDetails] = useState<BatchDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<BatchDetails[]>([])
  const [printSettings, setPrintSettings] = useState<PrintSettings>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      fetchProducts()
      fetchPrintSettings()
      // Focus on barcode input when dialog opens
      setTimeout(() => {
        if (barcodeInputRef.current && searchMethod === "barcode") {
          barcodeInputRef.current.focus()
        }
      }, 100)
    }
  }, [open, searchMethod])

  const fetchPrintSettings = async () => {
    try {
      const response = await fetch("/api/settings/print")
      if (response.ok) {
        const data = await response.json()
        setPrintSettings(data)
      }
    } catch (error) {
      console.error("Error fetching print settings:", error)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const fetchProductLots = async (productId: string) => {
    try {
      const response = await fetch(`/api/inventory/lots?product_id=${productId}`)
      if (response.ok) {
        const data = await response.json()
        setProductLots(data)
      }
    } catch (error) {
      console.error("Error fetching product lots:", error)
    }
  }

  const searchByBarcode = async () => {
    if (!barcodeInput.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/inventory/batch-details/search?barcode=${encodeURIComponent(barcodeInput)}`)
      if (!response.ok) {
        throw new Error("لم يتم العثور على باتش بهذا الباركود")
      }

      const data = await response.json()
      if (data.length === 0) {
        setError("لم يتم العثور على باتش بهذا الباركود")
        return
      }

      if (data.length === 1) {
        setBatchDetails(data[0])
        setSearchResults([])
      } else {
        setSearchResults(data)
        setBatchDetails(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ في البحث")
    } finally {
      setLoading(false)
    }
  }

  const searchByLotNumber = async () => {
    if (!lotNumberInput.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/inventory/batch-details/search?lot_number=${encodeURIComponent(lotNumberInput)}`,
      )
      if (!response.ok) {
        throw new Error("لم يتم العثور على باتش بهذا الرقم")
      }

      const data = await response.json()
      if (data.length === 0) {
        setError("لم يتم العثور على باتش بهذا الرقم")
        return
      }

      if (data.length === 1) {
        setBatchDetails(data[0])
        setSearchResults([])
      } else {
        setSearchResults(data)
        setBatchDetails(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ في البحث")
    } finally {
      setLoading(false)
    }
  }

  const fetchBatchDetails = async (lotId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/inventory/batch-details/${lotId}`)
      if (!response.ok) {
        throw new Error("فشل في تحميل تفاصيل الباتش")
      }

      const data = await response.json()
      setBatchDetails(data)
      setSearchResults([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ في تحميل التفاصيل")
    } finally {
      setLoading(false)
    }
  }

  const handleProductChange = (productId: string) => {
    setSelectedProduct(productId)
    setSelectedLot("")
    setBatchDetails(null)
    setSearchResults([])
    if (productId) {
      fetchProductLots(productId)
    } else {
      setProductLots([])
    }
  }

  const handleLotChange = (lotId: string) => {
    setSelectedLot(lotId)
    if (lotId) {
      fetchBatchDetails(lotId)
    } else {
      setBatchDetails(null)
    }
  }

  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchByBarcode()
    }
  }

  const handleLotNumberKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchByLotNumber()
    }
  }

  const printBatchLabel = (direct = false) => {
    if (!batchDetails) return

    const printContent = generatePrintContent()

    if (direct && printSettings.default_printer) {
      // Direct print to default printer
      try {
        const printWindow = window.open("", "_blank")
        if (!printWindow) return

        printWindow.document.write(printContent)
        printWindow.document.close()
        printWindow.focus()

        // Print immediately without showing print dialog
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
        }, 500)
      } catch (error) {
        console.error("Direct print failed:", error)
        // Fallback to regular print
        printBatchLabel(false)
      }
    } else {
      // Regular print with preview
      const printWindow = window.open("", "_blank")
      if (!printWindow) return

      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.focus()

      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 500)
    }
  }

  const showPrintPreview = () => {
    if (!batchDetails) return
    setPreviewOpen(true)
  }

  const generatePrintContent = () => {
    if (!batchDetails) return ""

    return `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>طباعة تفاصيل الباتش</title>
        <style>
          @page {
            size: 80mm 100mm;
            margin: 2mm;
          }
          
          body {
            font-family: 'Arial', sans-serif;
            font-size: 10px;
            line-height: 1.2;
            margin: 0;
            padding: 2mm;
            direction: rtl;
            text-align: right;
          }
          
          .label-container {
            width: 76mm;
            height: 96mm;
            border: 1px solid #000;
            padding: 2mm;
            box-sizing: border-box;
          }
          
          .header {
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 3mm;
            border-bottom: 1px solid #000;
            padding-bottom: 1mm;
          }
          
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1.5mm;
            font-size: 9px;
          }
          
          .info-label {
            font-weight: bold;
            min-width: 20mm;
          }
          
          .info-value {
            flex: 1;
            text-align: left;
          }
          
          .lot-number {
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin: 2mm 0;
            padding: 1mm;
            border: 2px solid #000;
          }
          
          .status-badge {
            display: inline-block;
            padding: 1mm 2mm;
            border-radius: 2mm;
            font-size: 8px;
            font-weight: bold;
            margin: 1mm 0;
          }
          
          .status-new { background-color: #e3f2fd; color: #1976d2; }
          .status-in_use { background-color: #e8f5e8; color: #2e7d32; }
          .status-finished { background-color: #f5f5f5; color: #616161; }
          .status-damaged { background-color: #ffebee; color: #c62828; }
          
          .separator {
            border-top: 1px dashed #666;
            margin: 2mm 0;
          }
          
          @media print {
            body { margin: 0; }
            .label-container { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="header">تفاصيل الباتش</div>
          
          <div class="lot-number">${batchDetails.lot_number}</div>
          
          <div class="info-row">
            <span class="info-label">رقم الصنف:</span>
            <span class="info-value">${batchDetails.product_code}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">اسم الصنف:</span>
            <span class="info-value">${batchDetails.product_name}</span>
          </div>
          
          ${
            batchDetails.color_code
              ? `
          <div class="info-row">
            <span class="info-label">رقم اللون:</span>
            <span class="info-value">${batchDetails.color_code}</span>
          </div>
          `
              : ""
          }
          
          ${
            batchDetails.model_name
              ? `
          <div class="info-row">
            <span class="info-label">اسم الموديل:</span>
            <span class="info-value">${batchDetails.model_name}</span>
          </div>
          `
              : ""
          }
          
          <div class="separator"></div>
          
          <div class="info-row">
            <span class="info-label">تاريخ الشراء:</span>
            <span class="info-value">${batchDetails.purchase_date || "غير محدد"}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">الكمية الأصلية:</span>
            <span class="info-value">${batchDetails.initial_quantity.toLocaleString("en-US")}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">الكمية الحالية:</span>
            <span class="info-value">${batchDetails.current_quantity.toLocaleString("en-US")}</span>
          </div>
          
          <div class="separator"></div>
          
          <div class="info-row">
            <span class="info-label">المستودع:</span>
            <span class="info-value">${batchDetails.warehouse_name || "غير محدد"}</span>
          </div>
          
          ${
            batchDetails.floor
              ? `
          <div class="info-row">
            <span class="info-label">الطابق:</span>
            <span class="info-value">${batchDetails.floor}</span>
          </div>
          `
              : ""
          }
          
          ${
            batchDetails.shelf
              ? `
          <div class="info-row">
            <span class="info-label">الرف:</span>
            <span class="info-value">${batchDetails.shelf}</span>
          </div>
          `
              : ""
          }
          
          <div class="separator"></div>
          
          <div style="text-align: center;">
            <span class="status-badge status-${batchDetails.status}">
              ${batchDetails.status_display}
            </span>
          </div>
          
          <div style="text-align: center; font-size: 8px; margin-top: 2mm; color: #666;">
            تاريخ الطباعة: ${new Date().toLocaleDateString("en-GB")}
          </div>
        </div>
      </body>
      </html>
    `
  }

  const resetForm = () => {
    setBarcodeInput("")
    setLotNumberInput("")
    setSelectedProduct("")
    setSelectedLot("")
    setBatchDetails(null)
    setSearchResults([])
    setError(null)
    setProductLots([])
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-100 text-blue-800">جديد</Badge>
      case "in_use":
        return <Badge className="bg-green-100 text-green-800">قيد الاستخدام</Badge>
      case "finished":
        return <Badge className="bg-gray-100 text-gray-800">منتهي</Badge>
      case "damaged":
        return <Badge className="bg-red-100 text-red-800">تالف/مغلق</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Printer className="ml-2 h-4 w-4" />
            طباعة تفاصيل باتش
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              طباعة تفاصيل باتش معين
            </DialogTitle>
            <DialogDescription>
              اختر الباتش المطلوب طباعة تفاصيله من خلال الباركود أو البحث المباشر أو اختيار المنتج
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Search Method Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">طريقة البحث</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <Button
                    variant={searchMethod === "barcode" ? "default" : "outline"}
                    onClick={() => {
                      setSearchMethod("barcode")
                      resetForm()
                    }}
                    className="h-20 flex-col gap-2"
                  >
                    <Scan className="h-6 w-6" />
                    قراءة الباركود
                  </Button>
                  <Button
                    variant={searchMethod === "direct" ? "default" : "outline"}
                    onClick={() => {
                      setSearchMethod("direct")
                      resetForm()
                    }}
                    className="h-20 flex-col gap-2"
                  >
                    <Search className="h-6 w-6" />
                    البحث المباشر
                  </Button>
                  <Button
                    variant={searchMethod === "product" ? "default" : "outline"}
                    onClick={() => {
                      setSearchMethod("product")
                      resetForm()
                    }}
                    className="h-20 flex-col gap-2"
                  >
                    <Package className="h-6 w-6" />
                    اختيار المنتج
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Search Forms */}
            {searchMethod === "barcode" && (
              <Card>
                <CardHeader>
                  <CardTitle>البحث بالباركود</CardTitle>
                  <CardDescription>امسح الباركود أو أدخله يدوياً</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      ref={barcodeInputRef}
                      placeholder="امسح الباركود أو أدخله هنا"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={handleBarcodeKeyPress}
                      className="flex-1"
                    />
                    <Button onClick={searchByBarcode} disabled={loading || !barcodeInput.trim()}>
                      {loading ? "جاري البحث..." : "بحث"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {searchMethod === "direct" && (
              <Card>
                <CardHeader>
                  <CardTitle>البحث المباشر</CardTitle>
                  <CardDescription>أدخل رقم الباتش للبحث عنه</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="أدخل رقم الباتش"
                      value={lotNumberInput}
                      onChange={(e) => setLotNumberInput(e.target.value)}
                      onKeyPress={handleLotNumberKeyPress}
                      className="flex-1"
                    />
                    <Button onClick={searchByLotNumber} disabled={loading || !lotNumberInput.trim()}>
                      {loading ? "جاري البحث..." : "بحث"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {searchMethod === "product" && (
              <Card>
                <CardHeader>
                  <CardTitle>اختيار المنتج والباتش</CardTitle>
                  <CardDescription>اختر المنتج أولاً ثم اختر الباتش المطلوب</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>المنتج</Label>
                      <Select value={selectedProduct} onValueChange={handleProductChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر المنتج" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.product_name} ({product.product_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>الباتش</Label>
                      <Select
                        value={selectedLot}
                        onValueChange={handleLotChange}
                        disabled={!selectedProduct || productLots.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الباتش" />
                        </SelectTrigger>
                        <SelectContent>
                          {productLots.map((lot) => (
                            <SelectItem key={lot.lot_id} value={lot.lot_id.toString()}>
                              {lot.lot_number} - الكمية: {lot.current_quantity}
                              {lot.expiry_date && ` - انتهاء: ${lot.expiry_date}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>نتائج البحث</CardTitle>
                  <CardDescription>تم العثور على {searchResults.length} باتش، اختر الباتش المطلوب</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {searchResults.map((batch) => (
                      <div
                        key={batch.lot_id}
                        className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                        onClick={() => setBatchDetails(batch)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{batch.lot_number}</div>
                            <div className="text-sm text-muted-foreground">
                              {batch.product_name} ({batch.product_code})
                            </div>
                            <div className="text-sm text-muted-foreground">
                              الكمية: {batch.current_quantity} - المستودع: {batch.warehouse_name || "غير محدد"}
                            </div>
                          </div>
                          {getStatusBadge(batch.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Batch Details */}
            {batchDetails && (
              <Card className="border-2 border-green-200 bg-green-50/30">
                <CardHeader className="bg-green-100/50">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-green-600" />
                      تفاصيل الباتش
                    </span>
                    <div className="flex gap-2">
                      {printSettings.default_printer && (
                        <Button
                          onClick={() => printBatchLabel(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white shadow-md animate-pulse"
                          size="sm"
                          title={`طباعة مباشرة على ${printSettings.default_printer}`}
                        >
                          <Printer className="ml-2 h-4 w-4" />
                          طباعة مباشرة
                        </Button>
                      )}
                      <Button
                        onClick={showPrintPreview}
                        variant="outline"
                        size="sm"
                        className="border-2 border-green-600 text-green-600 hover:bg-green-50 bg-white shadow-md animate-pulse"
                      >
                        <Eye className="ml-2 h-4 w-4" />
                        معاينة قبل الطباعة
                      </Button>
                    </div>
                  </CardTitle>
                  {printSettings.default_printer && (
                    <CardDescription className="flex items-center gap-2 text-blue-600">
                      <Settings className="h-4 w-4" />
                      الطابعة الافتراضية: {printSettings.default_printer}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">رقم الباتش</Label>
                        <div className="text-lg font-bold">{batchDetails.lot_number}</div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">رقم الصنف</Label>
                        <div className="font-medium">{batchDetails.product_code}</div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">اسم الصنف</Label>
                        <div className="font-medium">{batchDetails.product_name}</div>
                      </div>

                      {batchDetails.color_code && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">رقم اللون</Label>
                          <div className="font-medium">{batchDetails.color_code}</div>
                        </div>
                      )}

                      {batchDetails.model_name && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">اسم الموديل</Label>
                          <div className="font-medium">{batchDetails.model_name}</div>
                        </div>
                      )}

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">حالة الباتش</Label>
                        <div className="mt-1">{getStatusBadge(batchDetails.status)}</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">تاريخ الشراء</Label>
                        <div className="font-medium">{batchDetails.purchase_date || "غير محدد"}</div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">الكمية الأصلية</Label>
                        <div className="font-medium">{batchDetails.initial_quantity.toLocaleString("en-US")}</div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">الكمية الحالية</Label>
                        <div className="font-medium text-green-600">
                          {batchDetails.current_quantity.toLocaleString("en-US")}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">المستودع</Label>
                        <div className="font-medium">{batchDetails.warehouse_name || "غير محدد"}</div>
                      </div>

                      {batchDetails.floor && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">الطابق</Label>
                          <div className="font-medium">{batchDetails.floor}</div>
                        </div>
                      )}

                      {batchDetails.shelf && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">الرف</Label>
                          <div className="font-medium">{batchDetails.shelf}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Enhanced Print Options Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg border-2 border-dashed border-blue-300 shadow-inner">
                    <div className="text-center mb-4">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Printer className="h-6 w-6 text-blue-600 animate-bounce" />
                        <h3 className="text-xl font-bold text-gray-800">خيارات الطباعة</h3>
                        <Printer className="h-6 w-6 text-green-600 animate-bounce" />
                      </div>
                      <p className="text-sm text-gray-600 font-medium">اختر طريقة الطباعة المناسبة من الخيارات أدناه</p>
                    </div>

                    <div className="flex justify-center gap-4 flex-wrap">
                      {printSettings.default_printer && (
                        <Button
                          onClick={() => printBatchLabel(true)}
                          size="lg"
                          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-8 py-4 transform hover:scale-105"
                          title={`طباعة مباشرة على ${printSettings.default_printer}`}
                        >
                          <Printer className="ml-3 h-6 w-6" />
                          <div className="flex flex-col items-start">
                            <span className="font-bold text-lg">طباعة مباشرة</span>
                            <span className="text-sm opacity-90">على الطابعة الافتراضية</span>
                          </div>
                        </Button>
                      )}

                      <Button
                        onClick={showPrintPreview}
                        size="lg"
                        variant="outline"
                        className="border-3 border-green-600 text-green-600 hover:bg-green-50 bg-white shadow-lg hover:shadow-xl transition-all duration-200 px-8 py-4 transform hover:scale-105"
                      >
                        <Eye className="ml-3 h-6 w-6" />
                        <div className="flex flex-col items-start">
                          <span className="font-bold text-lg">معاينة قبل الطباعة</span>
                          <span className="text-sm opacity-75">مع إمكانية الطباعة</span>
                        </div>
                      </Button>

                      <Button
                        onClick={() => printBatchLabel(false)}
                        size="lg"
                        className="bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-8 py-4 transform hover:scale-105"
                      >
                        <Printer className="ml-3 h-6 w-6" />
                        <div className="flex flex-col items-start">
                          <span className="font-bold text-lg">طباعة عادية</span>
                          <span className="text-sm opacity-90">مع اختيار الطابعة</span>
                        </div>
                      </Button>
                    </div>

                    {/* Additional Print Info */}
                    <div className="mt-4 p-3 bg-white/70 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span>تأكد من أن الطابعة متصلة وجاهزة قبل الطباعة</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              معاينة طباعة بطاقة الباتش
            </DialogTitle>
            <DialogDescription>
              معاينة البطاقة قبل الطباعة - يمكنك الطباعة من هنا أو إغلاق النافذة للعودة
            </DialogDescription>
          </DialogHeader>

          {batchDetails && (
            <div className="space-y-4">
              {/* Print Preview */}
              <div className="border-2 border-dashed border-gray-300 p-4 bg-white">
                <div
                  className="mx-auto bg-white border border-gray-400 p-3 text-right"
                  style={{
                    width: "240px",
                    minHeight: "300px",
                    fontSize: "11px",
                    lineHeight: "1.3",
                    fontFamily: "Arial, sans-serif",
                  }}
                >
                  <div className="text-center font-bold text-sm mb-3 pb-1 border-b border-black">تفاصيل الباتش</div>

                  <div className="text-center font-bold text-base mb-2 p-1 border-2 border-black">
                    {batchDetails.lot_number}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold">رقم الصنف:</span>
                      <span>{batchDetails.product_code}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="font-bold">اسم الصنف:</span>
                      <span className="text-left">{batchDetails.product_name}</span>
                    </div>

                    {batchDetails.color_code && (
                      <div className="flex justify-between">
                        <span className="font-bold">رقم اللون:</span>
                        <span>{batchDetails.color_code}</span>
                      </div>
                    )}

                    {batchDetails.model_name && (
                      <div className="flex justify-between">
                        <span className="font-bold">اسم الموديل:</span>
                        <span className="text-left">{batchDetails.model_name}</span>
                      </div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="flex justify-between">
                      <span className="font-bold">تاريخ الشراء:</span>
                      <span>{batchDetails.purchase_date || "غير محدد"}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="font-bold">الكمية الأصلية:</span>
                      <span>{batchDetails.initial_quantity.toLocaleString("en-US")}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="font-bold">الكمية الحالية:</span>
                      <span>{batchDetails.current_quantity.toLocaleString("en-US")}</span>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="flex justify-between">
                      <span className="font-bold">المستودع:</span>
                      <span className="text-left">{batchDetails.warehouse_name || "غير محدد"}</span>
                    </div>

                    {batchDetails.floor && (
                      <div className="flex justify-between">
                        <span className="font-bold">الطابق:</span>
                        <span>{batchDetails.floor}</span>
                      </div>
                    )}

                    {batchDetails.shelf && (
                      <div className="flex justify-between">
                        <span className="font-bold">الرف:</span>
                        <span>{batchDetails.shelf}</span>
                      </div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2"></div>

                    <div className="text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                          batchDetails.status === "new"
                            ? "bg-blue-100 text-blue-800"
                            : batchDetails.status === "in_use"
                              ? "bg-green-100 text-green-800"
                              : batchDetails.status === "finished"
                                ? "bg-gray-100 text-gray-800"
                                : "bg-red-100 text-red-800"
                        }`}
                      >
                        {batchDetails.status_display}
                      </span>
                    </div>

                    <div className="text-center text-xs text-gray-600 mt-2">
                      تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Print Actions */}
              <div className="flex justify-center gap-3 pt-4 border-t">
                {printSettings.default_printer && (
                  <Button
                    onClick={() => {
                      printBatchLabel(true)
                      setPreviewOpen(false)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                  >
                    <Printer className="ml-2 h-4 w-4" />
                    طباعة مباشرة على {printSettings.default_printer}
                  </Button>
                )}

                <Button
                  onClick={() => {
                    printBatchLabel(false)
                    setPreviewOpen(false)
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                >
                  <Printer className="ml-2 h-4 w-4" />
                  طباعة مع اختيار الطابعة
                </Button>

                <Button onClick={() => setPreviewOpen(false)} variant="outline" className="shadow-md">
                  إغلاق المعاينة
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
