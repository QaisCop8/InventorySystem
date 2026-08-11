"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  Plus,
  Search,
  Download,
  Printer,
  Edit,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Save,
  AlertCircle,
} from "lucide-react"
import { useExchangeRates } from "@/hooks/use-swr-data"
import { LoadingCard, LoadingSpinner } from "@/components/ui/loading-spinner"
import { ErrorBoundary } from "@/components/error-boundary"
import Messages from "@/components/common/Messages"

interface ExchangeRate {
  id: number,
  currency_id: number,
  currency_name: string
  currency_code: string
  currency_symbol?: string
  buy_rate: number
  sell_rate: number
  exchange_rate: number
  rate_date?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
  change_amount?: number
  change_percent?: string
}

const MIN_EXCHANGE_RATE = 0.0001
const MAX_EXCHANGE_RATE = 10000

function ExchangeRatesContent() {
  const { rates: exchangeRates, isLoading, isError, refresh, updateRate } = useExchangeRates()

  const [selectedRate, setSelectedRate] = useState<ExchangeRate | null>(null)
  const [showRateDialog, setShowRateDialog] = useState(false)
  const [showNewRateDialog, setShowNewRateDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const messagesRef = useRef<any>(null)
  const rateDialogMessagesRef = useRef<any>(null)
  const newCurrencyMessagesRef = useRef<any>(null)
  const [editFormData, setEditFormData] = useState({
    type: 1,
    buyRate: 0,
    sellRate: 0,
    exchangeRate: 0,
  })

  const [newCurrencyForm, setNewCurrencyForm] = useState({
    currencyName: "",
    currencyCode: "",
    buyRate: 1,
    sellRate: 1,
    exchangeRate: 1,
  })

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
  })

  const handleSaveNewCurrency = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (submittingRef.current) return

    // Validation
    if (!newCurrencyForm.currencyName.trim() || !newCurrencyForm.currencyCode.trim()) {
      newCurrencyMessagesRef.current?.show?.([
        { severity: "error", summary: "", detail: "جميع الحقول مطلوبة", life: 4000 },
      ])
      return
    }
    const newRates = [newCurrencyForm.buyRate, newCurrencyForm.sellRate, newCurrencyForm.exchangeRate].map(Number)
    if (newRates.some((rate) => !Number.isFinite(rate) || rate < MIN_EXCHANGE_RATE || rate > MAX_EXCHANGE_RATE)) {
      newCurrencyMessagesRef.current?.show?.([
        {
          severity: "error",
          summary: "",
          detail: "سعر الشراء وسعر البيع وسعر الصرف يجب أن تكون بين 0.0001 و 10000",
          life: 5000,
        },
      ])
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      console.log("[v0] Creating new currency:", newCurrencyForm)
      const response = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currency_name: newCurrencyForm.currencyName,
          currency_code: newCurrencyForm.currencyCode,
          buy_rate: newCurrencyForm.buyRate,
          sell_rate: newCurrencyForm.sellRate,
          exchange_rate: newCurrencyForm.exchangeRate,
          is_active: true,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.error || "Failed to create new currency")
      }

      refresh() // Using SWR refresh instead of manual fetch
      setShowNewRateDialog(false)

      // Reset form
      setNewCurrencyForm({
        currencyName: "",
        currencyCode: "",
        buyRate: 1,
        sellRate: 1,
        exchangeRate: 1,
      })

      messagesRef.current?.show?.([
        { severity: "success", summary: "", detail: "تم إضافة العملة وسعر الصرف بنجاح", life: 4000 },
      ])
    } catch (err) {
      console.error("[v0] Error saving new currency:", err)
      newCurrencyMessagesRef.current?.show?.([
        {
          severity: "error",
          summary: "",
          detail: "حدث خطأ أثناء حفظ البيانات: " + (err instanceof Error ? err.message : "خطأ غير معروف"),
          life: 5000,
        },
      ])
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const exchangeRatesSummary = [
    {
      title: "العملات المتاحة",
      value: exchangeRates.length.toString(),
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100",
    },
    {
      title: "آخر تحديث",
      value: "اليوم",
      icon: Calendar,
      color: "text-green-600",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100",
    },
    {
      title: "أعلى سعر صرف",
      value:
        exchangeRates.length > 0
          ? (() => {
            const validRates = exchangeRates.filter(
              (r: { exchange_rate: number | string }) =>
                r && !isNaN(Number(r.exchange_rate))
            )
            return validRates.length > 0
              ? `${Math.max(
                ...validRates.map((r: { exchange_rate: number | string }) =>
                  Number(r.exchange_rate)
                )
              ).toFixed(3)} شيكل`
              : "0 شيكل"
          })()
          : "0 شيكل",
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-gradient-to-br from-purple-50 to-purple-100",
    },
    {
      title: "أقل سعر صرف",
      value:
        exchangeRates.length > 0
          ? (() => {
            const validRates = exchangeRates.filter(
              (r: { exchange_rate: number | string }) =>
                r && !isNaN(Number(r.exchange_rate))
            )
            return validRates.length > 0
              ? `${Math.min(
                ...validRates.map((r: { exchange_rate: number | string }) =>
                  Number(r.exchange_rate)
                )
              ).toFixed(3)} شيكل`
              : "0 شيكل"
          })()
          : "0 شيكل"
      ,
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-gradient-to-br from-red-50 to-red-100",
    },
  ]

  const handleEditRate = (rate: ExchangeRate) => {
    setSelectedRate(rate)
    setEditFormData({
      type: 2,
      buyRate: Number(rate.buy_rate),
      sellRate: Number(rate.sell_rate),
      exchangeRate: Number(rate.exchange_rate),
    })
    setShowRateDialog(true)
  }

  const handleAddRate = (rate: ExchangeRate) => {
    setSelectedRate(rate)
    setEditFormData({
      type: 1,
      buyRate: Number(rate.buy_rate),
      sellRate: Number(rate.sell_rate),
      exchangeRate: Number(rate.exchange_rate),
    })
    setShowRateDialog(true)
  }
  const handleInputChange = (field: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: Number.parseFloat(value) || 0,
    }))
  }


  const handleSaveRateChanges = async () => {
    if (!selectedRate || submittingRef.current) return
    if (
      Number(editFormData.buyRate) <= 0 ||
      Number(editFormData.sellRate) <= 0 ||
      Number(editFormData.exchangeRate) <= 0
    ) {
      rateDialogMessagesRef.current?.show?.([
        { severity: "error", summary: "", detail: "أسعار الشراء والبيع والصرف يجب أن تكون أكبر من صفر", life: 4000 },
      ])
      return
    }
    console.log("selectedRate ", selectedRate)
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      if (editFormData.type === 2) {
        await updateRate(selectedRate.id, {
          type: editFormData.type,
          buy_rate: editFormData.buyRate,
          sell_rate: editFormData.sellRate,
          exchange_rate: editFormData.exchangeRate,
        })
        setShowRateDialog(false)
        messagesRef.current?.show?.([
          { severity: "success", summary: "", detail: "تم تحديث سعر الصرف بنجاح", life: 4000 },
        ])
      }
      else {

        await updateRate(selectedRate.currency_id, {
          type: editFormData.type,
          currency_id: selectedRate.currency_id,
          buy_rate: editFormData.buyRate,
          sell_rate: editFormData.sellRate,
          exchange_rate: editFormData.exchangeRate,
          is_active: true,
        });
        setShowRateDialog(false)
        messagesRef.current?.show?.([
          { severity: "success", summary: "", detail: "تم إضافة سعر صرف جديد لليوم بنجاح", life: 4000 },
        ])
      }
    } catch (err) {
      console.error("[v0] Error saving rate changes:", err)
      rateDialogMessagesRef.current?.show?.([
        { severity: "error", summary: "", detail: "حدث خطأ أثناء حفظ التغييرات", life: 5000 },
      ])
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const updateAllRates = () => {

    refresh()
  }
  function printDiv(divId: string) {
  const printContents = document.getElementById(divId)?.innerHTML;
  const newWindow = window.open("", "_blank", "width=800,height=600");
  newWindow?.document.write(`<html><body>${printContents}</body></html>`);
  newWindow?.document.close();
  newWindow?.print();
}
  function exportToExcel(data: any[], fileName = "exchange_rates.xlsx") {
    // Map your data to clean columns for Excel
    const worksheetData = data.map(rate => ({
      "العملة": rate.currency_name || "غير محدد",
      "الرمز": rate.currency_code || "غير محدد",
      "سعر الشراء": Number(rate.buy_rate || 0).toFixed(3),
      "سعر البيع": Number(rate.sell_rate || 0).toFixed(3),
      "سعر الصرف": Number(rate.exchange_rate || 0).toFixed(3),
      "التغيير": rate.change_amount ? rate.change_amount.toFixed(3) : "0.000",
      "آخر تحديث": rate.rate_date || "غير محدد",
      "الحالة": rate.is_active ? "نشط" : "غير نشط",
    }))

    // Create a worksheet
    const worksheet = XLSX.utils.json_to_sheet(worksheetData)

    // Create a workbook
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Exchange Rates")

    // Write to buffer
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

    // Save file
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" })
    saveAs(blob, fileName)
  }

  const filteredRates = exchangeRates.filter((rate: { currency_name: string | string[]; currency_code: string | string[]; is_active: boolean }) => {
    if (
      filters.search &&
      !rate.currency_name.includes(filters.search) &&
      !rate.currency_code.includes(filters.search)
    ) {
      return false
    }
    if (filters.status !== "all" && (filters.status === "نشط") !== rate.is_active) {
      return false
    }
    return true
  })

  if (isLoading) {
    return <LoadingCard title="جاري تحميل أسعار الصرف..." description="يرجى الانتظار..." />
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4" dir="rtl">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h3 className="text-lg font-medium">خطأ في تحميل البيانات</h3>
        <p className="text-sm text-muted-foreground">حدث خطأ أثناء تحميل أسعار الصرف</p>
        <Button onClick={() => refresh()} variant="outline">
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-x-hidden lg:h-[calc(100vh-7rem)] lg:overflow-y-hidden" dir="rtl">
      <Messages innerRef={messagesRef} />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {exchangeRatesSummary.map((item, index) => (
          <Card key={index} className={`${item.bgColor} border-0 shadow-sm hover:shadow-md transition-shadow`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600 text-right">{item.title}</CardTitle>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold text-right ${item.color}`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <Button onClick={updateAllRates} className="bg-blue-600 hover:bg-blue-700 text-white">
                <TrendingUp className="h-4 w-4 mr-2" />
                تحديث الأسعار
              </Button>
              <Button
                onClick={() => {
                  setNewCurrencyForm({
                    currencyName: "",
                    currencyCode: "",
                    buyRate: 1,
                    sellRate: 1,
                    exchangeRate: 1,
                  })
                  setShowNewRateDialog(true)
                }}
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                عملة جديدة
              </Button>
              <Button variant="outline" onClick={() => exportToExcel(filteredRates)}>
                <Download className="h-4 w-4 mr-2" />
                تصدير
              </Button>
              <Button variant="outline" onClick={() => printDiv("printArea")}>
                <Printer className="h-4 w-4 mr-2" />
                طباعة
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="البحث في العملات..."
                  className="w-64 pr-10 text-right"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rates Table */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-sm">
        <CardHeader>
          <CardTitle className="text-right">أسعار الصرف اليومية</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full max-h-full overflow-x-hidden overflow-y-auto" id="printArea">
            <table className="w-full table-fixed border-collapse text-sm [&_td]:break-words [&_th]:break-words" dir="rtl">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b">
                  <th className="text-right p-3 font-semibold text-gray-700">العملة</th>
                  <th className="text-right p-3 font-semibold text-gray-700">الرمز</th>
                  <th className="text-right p-3 font-semibold text-gray-700">سعر الشراء</th>
                  <th className="text-right p-3 font-semibold text-gray-700">سعر البيع</th>
                  <th className="text-right p-3 font-semibold text-gray-700">سعر الصرف</th>
                  <th className="text-right p-3 font-semibold text-gray-700">التغيير</th>
                  <th className="text-right p-3 font-semibold text-gray-700">آخر تحديث</th>
                  <th className="text-right p-3 font-semibold text-gray-700">الحالة</th>
                  <th className="text-center p-3 font-semibold text-gray-700 justify-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((rate: ExchangeRate) => (
                  <tr key={rate.id} className="border-b hover:bg-gray-50">
                    <td className="font-medium text-right p-3">{rate.currency_name || "غير محدد"}</td>
                    <td className="font-mono text-right p-3">{rate.currency_code || "غير محدد"}</td>
                    <td className="text-right p-3">{Number(rate.buy_rate || 0).toFixed(3)} شيكل</td>
                    <td className="text-right p-3">{Number(rate.sell_rate || 0).toFixed(3)} شيكل</td>
                    <td className="font-medium text-blue-600 text-right p-3">
                      {Number(rate.exchange_rate || 0).toFixed(3)} شيكل
                    </td>
                    <td className="text-right p-3">
                      {rate.change_amount ? (
                        rate.change_amount > 0 ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />+{rate.change_amount.toFixed(3)}
                          </span>
                        ) : rate.change_amount < 0 ? (
                          <span className="text-red-600 flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" />
                            {rate.change_amount.toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0.00</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">0.00</span>
                      )}
                    </td>
                    <td className="text-sm text-muted-foreground text-right p-3">{rate.rate_date ? new Date(rate.rate_date).toLocaleDateString("en-CA") : "غير محدد"}</td>
                    <td className="text-right p-3">
                      <Badge variant={rate.is_active ? "secondary" : "outline"}>
                        {rate.is_active ? "نشط" : "غير نشط"}
                      </Badge>
                    </td>
                    <td className="text-right p-3">
                      <div className="flex gap-1 justify-center">
                        {rate && rate.currency_id !== 1 &&
                          <div className="flex flex-wrap justify-center gap-1">
                            <Button size="sm" variant="outline" onClick={() => { rate && rate.currency_id !== 1 ? handleAddRate(rate) : undefined; console.log("rate ", rate) }} className="text-xs">
                              <Edit className="h-3 w-1 ml-1" />
                              اضافة
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { rate && rate.currency_id !== 1 ? handleEditRate(rate) : undefined; console.log("rate ", rate) }} className="text-xs">
                              <Edit className="h-3 w-3 ml-1" />
                              تعديل
                            </Button>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Rate Dialog */}
      <Dialog
        open={showRateDialog}
        onOpenChange={(open) => {
          if (!open && submittingRef.current) return
          setShowRateDialog(open)
        }}
      >
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">تعديل سعر صرف {selectedRate?.currency_name}</DialogTitle>
          </DialogHeader>
          {selectedRate && (
            <div className="space-y-4">
              <Messages innerRef={rateDialogMessagesRef} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="buyRate" className="text-right block">
                    سعر الشراء *
                  </Label>
                  <Input
                    id="buyRate"
                    type="number"
                    step="0.001"
                    value={editFormData.buyRate}
                    onChange={(e) => handleInputChange("buyRate", e.target.value)}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="sellRate" className="text-right block">
                    سعر البيع *
                  </Label>
                  <Input
                    id="sellRate"
                    type="number"
                    step="0.001"
                    value={editFormData.sellRate}
                    onChange={(e) => handleInputChange("sellRate", e.target.value)}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <Label htmlFor="exchangeRate" className="text-right block">
                    سعر الصرف *
                  </Label>
                  <Input
                    id="exchangeRate"
                    type="number"
                    step="0.001"
                    value={editFormData.exchangeRate}
                    onChange={(e) => handleInputChange("exchangeRate", e.target.value)}
                    className="text-right"
                    dir="rtl"
                  />
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2 text-right">القيم الحالية:</h4>
                <div className="grid grid-cols-3 gap-4 text-sm text-right">
                  <div>سعر الشراء: {Number(selectedRate.buy_rate || 0).toFixed(3)} شيكل</div>
                  <div>سعر البيع: {Number(selectedRate.sell_rate || 0).toFixed(3)} شيكل</div>
                  <div>سعر الصرف: {Number(selectedRate.exchange_rate || 0).toFixed(3)} شيكل</div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowRateDialog(false)} disabled={isSubmitting}>
                  إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveRateChanges}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isSubmitting}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmitting ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Currency Dialog */}
      <Dialog
        open={showNewRateDialog}
        onOpenChange={(open) => {
          if (!open && submittingRef.current) return
          setShowNewRateDialog(open)
        }}
      >
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إضافة عملة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveNewCurrency} className="space-y-4" noValidate>
            <Messages innerRef={newCurrencyMessagesRef} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currencyCode" className="text-right block">
                  الرمز *
                </Label>
                <Input
                  id="currencyCode"
                  placeholder="مثال: USD"
                  className="text-right"
                  dir="rtl"
                  value={newCurrencyForm.currencyCode}
                  onChange={(e) => {
                    let value = e.target.value
                      .replace(/[^A-Za-z]/g, "")
                      .toUpperCase();
                    if (value.length > 10) value = value.slice(0, 10);

                    setNewCurrencyForm({ ...newCurrencyForm, currencyCode: value });
                  }}

                  required
                />
              </div>

              <div>
                <Label htmlFor="currencyName" className="text-right block">
                  اسم العملة *
                </Label>
                <Input
                  id="currencyName"
                  placeholder="مثال: دولار أمريكي"
                  className="text-right"
                  dir="rtl"
                  value={newCurrencyForm.currencyName}
                  onChange={(e) => setNewCurrencyForm({ ...newCurrencyForm, currencyName: e.target.value })}
                  required
                />
              </div>


              <div>
                <Label htmlFor="newBuyRate" className="text-right block">
                  سعر الشراء *
                </Label>
                <Input
                  id="newBuyRate"
                  type="number"
                  step="0.0001"
                  placeholder="0.0001"
                  className="text-right"
                  dir="rtl"
                  value={newCurrencyForm.buyRate}
                  disabled={exchangeRates.length === 0}
                  min={MIN_EXCHANGE_RATE}
                  max={MAX_EXCHANGE_RATE}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setNewCurrencyForm({ ...newCurrencyForm, buyRate: Number.parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="newSellRate" className="text-right block">
                  سعر البيع *
                </Label>
                <Input
                  id="newSellRate"
                  type="number"
                  step="0.0001"
                  placeholder="0.0001"
                  className="text-right"
                  dir="rtl"
                  value={newCurrencyForm.sellRate}
                  disabled={exchangeRates.length === 0}
                  min={MIN_EXCHANGE_RATE}
                  max={MAX_EXCHANGE_RATE}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setNewCurrencyForm({ ...newCurrencyForm, sellRate: Number.parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="newExchangeRate" className="text-right block">
                  سعر الصرف *
                </Label>
                <Input
                  id="newExchangeRate"
                  type="number"
                  step="0.0001"
                  placeholder="0.0001"
                  className="text-right"
                  dir="rtl"
                  value={newCurrencyForm.exchangeRate}
                  disabled={exchangeRates.length === 0}
                  min={MIN_EXCHANGE_RATE}
                  max={MAX_EXCHANGE_RATE}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setNewCurrencyForm({ ...newCurrencyForm, exchangeRate: Number.parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewRateDialog(false)}
                disabled={isSubmitting}
              >
                إلغاء
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    جاري الحفظ...
                  </>
                ) : (
                  "إضافة العملة"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ExchangeRates() {
  return (
    <ErrorBoundary>
      <ExchangeRatesContent />
    </ErrorBoundary>
  )
}
