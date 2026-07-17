"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

const defaultDocumentFields = [
  {
    id: "sequence",
    name: "التسلسل",
    displayName: "م",
    order: 1,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "barcode",
    name: "الباركود",
    displayName: "الباركود",
    order: 2,
    showInScreen: true,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "product",
    name: "رقم الصنف واسمه",
    displayName: "الصنف",
    order: 3,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "unit",
    name: "الوحدة",
    displayName: "الوحدة",
    order: 4,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "quantity",
    name: "الكمية",
    displayName: "الكمية",
    order: 5,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "expiry_date",
    name: "تاريخ الصلاحية",
    displayName: "تاريخ الصلاحية",
    order: 6,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "batch_number",
    name: "رقم الباتش",
    displayName: "رقم الباتش",
    order: 7,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "bonus",
    name: "البونص",
    displayName: "البونص",
    order: 8,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "length",
    name: "الطول",
    displayName: "الطول",
    order: 9,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "width",
    name: "العرض",
    displayName: "العرض",
    order: 10,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "count",
    name: "العد",
    displayName: "العد",
    order: 11,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "color",
    name: "اللون",
    displayName: "اللون",
    order: 12,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "discount",
    name: "الخصم",
    displayName: "الخصم",
    order: 13,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "warehouse",
    name: "المستودع",
    displayName: "المستودع",
    order: 14,
    showInScreen: true,
    showInPrint: false,
    isRequired: false,
  },
  {
    id: "price",
    name: "السعر",
    displayName: "السعر",
    order: 15,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "total",
    name: "المبلغ",
    displayName: "المبلغ",
    order: 16,
    showInScreen: true,
    showInPrint: true,
    isRequired: true,
  },
  {
    id: "item_notes",
    name: "ملاحظة الصنف",
    displayName: "ملاحظة الصنف",
    order: 17,
    showInScreen: false,
    showInPrint: false,
    isRequired: false,
  },
]

export default function DocumentSettings() {
  const [selectedDocumentType, setSelectedDocumentType] = useState("sales-order")
  const [fields, setFields] = useState(defaultDocumentFields)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [batchSettings, setBatchSettings] = useState({
    mandatory_batch_selection: false,
    auto_select_fifo: true,
    allow_negative_stock: false,
    require_expiry_date: false,
  })
  const { toast } = useToast()

  useEffect(() => {
    loadDocumentSettings()
    loadBatchSettings()
  }, [selectedDocumentType])

  const loadDocumentSettings = async () => {
    try {
      setLoading(true)
      console.log("[v0] Loading document settings for:", selectedDocumentType)

      const response = await fetch(`/api/settings/document?document_type=${selectedDocumentType}`)
      if (response.ok) {
        const settings = await response.json()
        console.log("[v0] Loaded settings:", settings)

        if (settings.length > 0) {
          const mappedFields = settings.map((setting: any) => ({
            id: setting.field_name,
            name: setting.field_name,
            displayName: setting.display_name || "",
            order: setting.display_order || 0,
            showInScreen: setting.show_in_screen ?? true,
            showInPrint: setting.show_in_print ?? false,
            isRequired: setting.is_required ?? false,
          }))
          setFields(mappedFields)
        } else {
          // Use default fields if no settings found
          setFields(defaultDocumentFields)
        }
      }
    } catch (error) {
      console.error("[v0] Error loading document settings:", error)
      toast({
        title: "خطأ",
        description: "فشل في تحميل إعدادات السندات",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadBatchSettings = async () => {
    try {
      console.log("[v0] Loading batch settings for:", selectedDocumentType)
      const response = await fetch(`/api/settings/batch?document_type=${selectedDocumentType}`)
      if (response.ok) {
        const settings = await response.json()
        console.log("[v0] Loaded batch settings:", settings)
        if (settings) {
          setBatchSettings(settings)
        }
      }
    } catch (error) {
      console.error("[v0] Error loading batch settings:", error)
    }
  }

  const updateField = (id: string, property: string, value: any) => {
    setFields(fields.map((field) => (field.id === id ? { ...field, [property]: value } : field)))
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      console.log("[v0] Saving document settings:", { document_type: selectedDocumentType, fields })

      const response = await fetch("/api/settings/document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: selectedDocumentType,
          fields: fields,
        }),
      })

      const batchResponse = await fetch("/api/settings/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: selectedDocumentType,
          ...batchSettings,
        }),
      })

      if (response.ok && batchResponse.ok) {
        const result = await response.json()
        console.log("[v0] Settings saved successfully:", result)
        toast({
          title: "نجح الحفظ",
          description: "تم حفظ إعدادات السندات بنجاح",
        })
      } else {
        throw new Error("Failed to save settings")
      }
    } catch (error) {
      console.error("[v0] Error saving document settings:", error)
      toast({
        title: "خطأ",
        description: "فشل في حفظ إعدادات السندات",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleResetToDefault = () => {
    setFields(defaultDocumentFields)
    setBatchSettings({
      mandatory_batch_selection: false,
      auto_select_fifo: true,
      allow_negative_stock: false,
      require_expiry_date: false,
    })
    toast({
      title: "تم الإعادة",
      description: "تم إعادة الإعدادات إلى القيم الافتراضية",
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">إعدادات السندات</h1>

      <Card>
        <CardHeader>
          <CardTitle>تخصيص عرض السندات</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveSettings()
            }}
          >
            {/* Document Type Selection */}
            <div className="space-y-2">
              <Label>نوع السند</Label>
              <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales-order">طلبية مبيعات</SelectItem>
                  <SelectItem value="purchase-order">طلبية مشتريات</SelectItem>
                  <SelectItem value="sales-invoice">فاتورة مبيعات</SelectItem>
                  <SelectItem value="purchase-invoice">فاتورة مشتريات</SelectItem>
                  <SelectItem value="receipt">سند قبض</SelectItem>
                  <SelectItem value="payment">سند دفع</SelectItem>
                  <SelectItem value="credit-note">إشعار دائن</SelectItem>
                  <SelectItem value="debit-note">إشعار مدين</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center min-h-[200px]" dir="rtl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-muted-foreground">جاري تحميل الأصناف...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Batch Settings Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">إعدادات الباتش والدفعات</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input
                        type="checkbox"
                        id="mandatoryBatch"
                        className="rounded"
                        checked={batchSettings.mandatory_batch_selection}
                        onChange={(e) =>
                          setBatchSettings({ ...batchSettings, mandatory_batch_selection: e.target.checked })
                        }
                      />
                      <Label htmlFor="mandatoryBatch" className="font-medium">
                        الباتش إجباري في الحركة
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input
                        type="checkbox"
                        id="autoSelectFifo"
                        className="rounded"
                        checked={batchSettings.auto_select_fifo}
                        onChange={(e) => setBatchSettings({ ...batchSettings, auto_select_fifo: e.target.checked })}
                      />
                      <Label htmlFor="autoSelectFifo">اختيار تلقائي بنظام FIFO</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input
                        type="checkbox"
                        id="allowNegativeStock"
                        className="rounded"
                        checked={batchSettings.allow_negative_stock}
                        onChange={(e) => setBatchSettings({ ...batchSettings, allow_negative_stock: e.target.checked })}
                      />
                      <Label htmlFor="allowNegativeStock">السماح بالمخزون السالب</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input
                        type="checkbox"
                        id="requireExpiryDate"
                        className="rounded"
                        checked={batchSettings.require_expiry_date}
                        onChange={(e) => setBatchSettings({ ...batchSettings, require_expiry_date: e.target.checked })}
                      />
                      <Label htmlFor="requireExpiryDate">تاريخ الصلاحية مطلوب</Label>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded-lg">
                    <p>
                      <strong>ملاحظة:</strong>
                    </p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>إذا كان الباتش إجباري: سيتم طلب اختيار الباتش في كل حركة</li>
                      <li>إذا كان الباتش اختياري: سيتم الزيادة والنقصان على الكمية الكلية</li>
                      <li>نظام FIFO يختار الباتشات الأقدم في تاريخ الصلاحية أولاً</li>
                    </ul>
                  </div>
                </div>

                {/* Fields Display Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">الحقول التي تظهر في السند</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 p-2 text-right">عرض</th>
                          <th className="border border-gray-300 p-2 text-right">اسم الحقل</th>
                          <th className="border border-gray-300 p-2 text-right">العنوان المعروض</th>
                          <th className="border border-gray-300 p-2 text-right">ترتيب العرض</th>
                          <th className="border border-gray-300 p-2 text-right">عرض في الطباعة</th>
                          <th className="border border-gray-300 p-2 text-right">مطلوب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field) => (
                          <tr key={field.id}>
                            <td className="border border-gray-300 p-2 text-center">
                              <input
                                type="checkbox"
                                checked={field.showInScreen}
                                onChange={(e) => updateField(field.id, "showInScreen", e.target.checked)}
                                className="rounded"
                              />
                            </td>
                            <td className="border border-gray-300 p-2">{field.name}</td>
                            <td className="border border-gray-300 p-2">
                              <Input
                                value={field.displayName || ""}
                                onChange={(e) => updateField(field.id, "displayName", e.target.value)}
                                className="w-32 text-right"
                                dir="rtl"
                              />
                            </td>
                            <td className="border border-gray-300 p-2">
                              <Input
                                type="number"
                                value={field.order || 0}
                                onChange={(e) => updateField(field.id, "order", Number.parseInt(e.target.value) || 0)}
                                className="w-20 text-right"
                                dir="rtl"
                              />
                            </td>
                            <td className="border border-gray-300 p-2 text-center">
                              <input
                                type="checkbox"
                                checked={field.showInPrint}
                                onChange={(e) => updateField(field.id, "showInPrint", e.target.checked)}
                                className="rounded"
                              />
                            </td>
                            <td className="border border-gray-300 p-2 text-center">
                              <input
                                type="checkbox"
                                checked={field.isRequired}
                                onChange={(e) => updateField(field.id, "isRequired", e.target.checked)}
                                className="rounded"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Additional Display Options */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">خيارات العرض الإضافية</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input type="checkbox" id="showSalesman" className="rounded" defaultChecked />
                      <Label htmlFor="showSalesman">عرض اسم المندوب</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input type="checkbox" id="showEmployee" className="rounded" defaultChecked />
                      <Label htmlFor="showEmployee">عرض اسم الموظف</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input type="checkbox" id="showTotalQuantities" className="rounded" defaultChecked />
                      <Label htmlFor="showTotalQuantities">عرض مجموع الكميات</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input type="checkbox" id="showDocumentBarcode" className="rounded" />
                      <Label htmlFor="showDocumentBarcode">عرض باركود السند</Label>
                    </div>
                  </div>
                </div>

                {/* Print Sort Order */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">ترتيب الطباعة</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>ترتيب الطباعة حسب</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر ترتيب الطباعة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entry-sequence">تسلسل الإدخال</SelectItem>
                          <SelectItem value="product-number">رقم الصنف</SelectItem>
                          <SelectItem value="barcode">رقم الباركود</SelectItem>
                          <SelectItem value="product-name">اسم الصنف</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>نوع الترتيب</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر نوع الترتيب" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">تصاعدي (A-Z)</SelectItem>
                          <SelectItem value="desc">تنازلي (Z-A)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Preview Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">معاينة السند</h3>
                  <div className="border-2 border-gray-300 rounded-lg p-6 bg-white">
                    <div className="text-center mb-6">
                      <h4 className="text-xl font-bold text-emerald-600 mb-2">اسم الشركة</h4>
                      <p className="text-gray-600 mb-2">العنوان الكامل للشركة</p>
                      <h3 className="text-lg font-semibold">
                        {selectedDocumentType === "sales-order" && "طلبية مبيعات"}
                        {selectedDocumentType === "purchase-order" && "طلبية مشتريات"}
                        {selectedDocumentType === "sales-invoice" && "فاتورة مبيعات"}
                        {selectedDocumentType === "purchase-invoice" && "فاتورة مشتريات"}
                        {selectedDocumentType === "receipt" && "سند قبض"}
                        {selectedDocumentType === "payment" && "سند دفع"}
                        {selectedDocumentType === "credit-note" && "إشعار دائن"}
                        {selectedDocumentType === "debit-note" && "إشعار مدين"}
                      </h3>
                    </div>

                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          {fields
                            .filter((field) => field.showInScreen)
                            .sort((a, b) => a.order - b.order)
                            .map((field) => (
                              <th key={field.id} className="border border-gray-300 p-2">
                                {field.displayName}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {fields
                            .filter((field) => field.showInScreen)
                            .sort((a, b) => a.order - b.order)
                            .map((field) => (
                              <td key={field.id} className="border border-gray-300 p-2 text-center">
                                {field.id === "sequence" && "1"}
                                {field.id === "barcode" && "123456789"}
                                {field.id === "product" && "لابتوب ديل"}
                                {field.id === "unit" && "قطعة"}
                                {field.id === "quantity" && "2"}
                                {field.id === "expiry_date" && "2025-12-31"}
                                {field.id === "batch_number" && "B001"}
                                {field.id === "bonus" && "0"}
                                {field.id === "length" && "30"}
                                {field.id === "width" && "20"}
                                {field.id === "count" && "1"}
                                {field.id === "color" && "أسود"}
                                {field.id === "discount" && "5%"}
                                {field.id === "warehouse" && "المستودع الرئيسي"}
                                {field.id === "price" && "2,500"}
                                {field.id === "total" && "5,000"}
                                {field.id === "item_notes" && "ملاحظة تجريبية"}
                              </td>
                            ))}
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 font-semibold">
                          <td
                            colSpan={
                              fields.filter((f) => f.showInScreen && !["quantity", "total"].includes(f.id)).length
                            }
                            className="border border-gray-300 p-2 text-center"
                          >
                            الإجمالي
                          </td>
                          {fields.find((f) => f.id === "quantity" && f.showInScreen) && (
                            <td className="border border-gray-300 p-2 text-center">2</td>
                          )}
                          {fields.find((f) => f.id === "total" && f.showInScreen) && (
                            <td className="border border-gray-300 p-2 text-center">5,000</td>
                          )}
                        </tr>
                      </tfoot>
                    </table>

                    <div className="flex justify-between mt-6 text-sm">
                      <div>
                        <p>
                          <strong>المندوب:</strong> محمد أحمد
                        </p>
                        <p>
                          <strong>الموظف:</strong> أحمد علي
                        </p>
                      </div>
                      <div className="text-left">
                        <p>
                          <strong>مجموع الكميات:</strong> 2
                        </p>
                        <p>
                          <strong>إجمالي المبلغ:</strong> 5,000 شيكل
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </Button>
              <Button type="button" variant="outline">
                معاينة
              </Button>
              <Button type="button" variant="outline" onClick={handleResetToDefault}>
                استعادة الافتراضي
              </Button>
              <Button type="button" variant="outline" className="text-orange-600 hover:text-orange-700 bg-transparent">
                إعادة ترتيب الحقول
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
