"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { QrCode, Download, Copy, CheckCircle, AlertTriangle, X } from "lucide-react"

interface BarcodeOptions {
  format: string
  width: number
  height: number
  displayValue: boolean
  fontSize: number
  textAlign: string
  textPosition: string
  background: string
  lineColor: string
}

export function BarcodeGenerator() {
  const [state, setState] = useState({
    inputValue: "",
    generatedBarcode: null as string | null,
    error: null as string | null,
    successMessage: null as string | null,
    options: {
      format: "CODE128",
      width: 2,
      height: 100,
      displayValue: true,
      fontSize: 20,
      textAlign: "center",
      textPosition: "bottom",
      background: "#ffffff",
      lineColor: "#000000",
    } as BarcodeOptions,
    loading: false,
  })

  const barcodeFormats = [
    { value: "CODE128", label: "CODE 128" },
    { value: "CODE39", label: "CODE 39" },
    { value: "EAN13", label: "EAN-13" },
    { value: "EAN8", label: "EAN-8" },
    { value: "UPC", label: "UPC-A" },
    { value: "ITF14", label: "ITF-14" },
    { value: "MSI", label: "MSI" },
    { value: "pharmacode", label: "Pharmacode" },
  ]

  const generateBarcode = async () => {
    if (!state.inputValue.trim()) {
      setState((prev) => ({ ...prev, error: tr("يرجى إدخال قيمة الباركود") }))
      return
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      // In a real implementation, you would use a barcode generation library like JsBarcode
      // For demo purposes, we'll create a simple SVG representation
      const barcodeData = generateBarcodeSVG(state.inputValue, state.options)

      setState((prev) => ({
        ...prev,
        generatedBarcode: barcodeData,
        successMessage: tr("تم إنشاء الباركود بنجاح"),
      }))

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 3000)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : tr("فشل في إنشاء الباركود"),
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  const generateBarcodeSVG = (value: string, options: BarcodeOptions): string => {
    // Simple barcode pattern generation (for demo)
    const bars = value
      .split("")
      .map((char) => char.charCodeAt(0) % 2)
      .join("")

    const totalWidth = bars.length * options.width * 10
    const totalHeight = options.height + (options.displayValue ? options.fontSize + 10 : 0)

    let svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`
    svg += `<rect width="100%" height="100%" fill="${options.background}"/>`

    // Generate bars
    let x = 0
    for (let i = 0; i < bars.length; i++) {
      if (bars[i] === "1") {
        svg += `<rect x="${x}" y="0" width="${options.width * 5}" height="${options.height}" fill="${options.lineColor}"/>`
      }
      x += options.width * 5
    }

    // Add text if enabled
    if (options.displayValue) {
      const textY = options.textPosition === "top" ? options.fontSize : options.height + options.fontSize
      svg += `<text x="${totalWidth / 2}" y="${textY}" textAnchor="middle" fontFamily="monospace" fontSize="${options.fontSize}" fill="${options.lineColor}">${value}</text>`
    }

    svg += "</svg>"
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  const downloadBarcode = () => {
    if (!state.generatedBarcode) return

    const link = document.createElement("a")
    link.href = state.generatedBarcode
    link.download = `barcode-${state.inputValue}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const copyToClipboard = async () => {
    if (!state.generatedBarcode) return

    try {
      await navigator.clipboard.writeText(state.inputValue)
      setState((prev) => ({ ...prev, successMessage: tr("تم نسخ قيمة الباركود") }))

      setTimeout(() => {
        setState((prev) => ({ ...prev, successMessage: null }))
      }, 2000)
    } catch (error) {
      setState((prev) => ({ ...prev, error: tr("فشل في نسخ القيمة") }))
    }
  }

  const updateOption = (key: keyof BarcodeOptions, value: any) => {
    setState((prev) => ({
      ...prev,
      options: { ...prev.options, [key]: value },
    }))
  }

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir={appDir()}>
      {/* Success Message */}
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{state.successMessage}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto"
            onClick={() => setState((prev) => ({ ...prev, successMessage: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Error Message */}
      {state.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto"
            onClick={() => setState((prev) => ({ ...prev, error: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <QrCode className="h-8 w-8 text-primary" />
          {tr("مولد الباركود")}
        </h1>
        <p className="text-muted-foreground mt-1">{tr("إنشاء باركود مخصص للمنتجات")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generator Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{tr("إعدادات الباركود")}</CardTitle>
            <CardDescription>{tr("قم بتخصيص شكل ونوع الباركود")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input Value */}
            <div>
              <Label htmlFor="barcodeValue">{tr("قيمة الباركود")}</Label>
              <Input
                id="barcodeValue"
                value={state.inputValue}
                onChange={(e) => setState((prev) => ({ ...prev, inputValue: e.target.value }))}
                placeholder={tr("أدخل النص أو الرقم")}
                className="font-mono"
              />
            </div>

            {/* Format Selection */}
            <div>
              <Label>{tr("نوع الباركود")}</Label>
              <Select value={state.options.format} onValueChange={(value) => updateOption("format", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {barcodeFormats.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{tr("العرض")}</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={state.options.width}
                  onChange={(e) => updateOption("width", Number.parseInt(e.target.value) || 2)}
                />
              </div>
              <div>
                <Label>{tr("الارتفاع")}</Label>
                <Input
                  type="number"
                  min="50"
                  max="200"
                  value={state.options.height}
                  onChange={(e) => updateOption("height", Number.parseInt(e.target.value) || 100)}
                />
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{tr("لون الخلفية")}</Label>
                <Input
                  type="color"
                  value={state.options.background}
                  onChange={(e) => updateOption("background", e.target.value)}
                />
              </div>
              <div>
                <Label>{tr("لون الخطوط")}</Label>
                <Input
                  type="color"
                  value={state.options.lineColor}
                  onChange={(e) => updateOption("lineColor", e.target.value)}
                />
              </div>
            </div>

            {/* Text Options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{tr("عرض النص")}</Label>
                <input
                  type="checkbox"
                  checked={state.options.displayValue}
                  onChange={(e) => updateOption("displayValue", e.target.checked)}
                  className="rounded"
                />
              </div>
              {state.options.displayValue && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{tr("حجم الخط")}</Label>
                    <Input
                      type="number"
                      min="10"
                      max="30"
                      value={state.options.fontSize}
                      onChange={(e) => updateOption("fontSize", Number.parseInt(e.target.value) || 20)}
                    />
                  </div>
                  <div>
                    <Label>{tr("موضع النص")}</Label>
                    <Select
                      value={state.options.textPosition}
                      onValueChange={(value) => updateOption("textPosition", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top">{tr("أعلى")}</SelectItem>
                        <SelectItem value="bottom">{tr("أسفل")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <Button onClick={generateBarcode} disabled={state.loading || !state.inputValue.trim()} className="w-full">
              <QrCode className="h-4 w-4 me-2" />
              {state.loading ? tr("جاري الإنشاء...") : tr("إنشاء الباركود")}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Barcode */}
        <Card>
          <CardHeader>
            <CardTitle>{tr("الباركود المُنشأ")}</CardTitle>
            <CardDescription>{tr("معاينة وتحميل الباركود")}</CardDescription>
          </CardHeader>
          <CardContent>
            {state.generatedBarcode ? (
              <div className="space-y-4">
                {/* Barcode Preview */}
                <div className="flex justify-center p-4 bg-white border rounded-lg">
                  <img
                    src={state.generatedBarcode || "/placeholder.svg"}
                    alt="Generated Barcode"
                    className="max-w-full h-auto"
                  />
                </div>

                {/* Barcode Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("القيمة:")}</span>
                    <span className="font-mono">{state.inputValue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("النوع:")}</span>
                    <span>{barcodeFormats.find((f) => f.value === state.options.format)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("الأبعاد:")}</span>
                    <span>
                      {state.options.width} × {state.options.height}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button onClick={downloadBarcode} variant="outline" className="flex-1 bg-transparent">
                    <Download className="h-4 w-4 me-2" />
                    {tr("تحميل")}
                  </Button>
                  <Button onClick={copyToClipboard} variant="outline" className="flex-1 bg-transparent">
                    <Copy className="h-4 w-4 me-2" />
                    {tr("نسخ القيمة")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <QrCode className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{tr("لا يوجد باركود")}</h3>
                <p className="text-muted-foreground">{tr("أدخل قيمة واضغط \"إنشاء الباركود\"")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
