"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Camera,
  Scan,
  Package,
  Search,
  Settings,
  CheckCircle,
  AlertTriangle,
  X,
  Play,
  Pause,
  RotateCcw,
  Flashlight,
  FlashlightOff,
  Volume2,
  VolumeX,
} from "lucide-react"

interface BarcodeResult {
  code: string
  format: string
  timestamp: Date
}

interface Product {
  id: number
  product_code: string
  product_name: string
  barcode: string
  current_stock: number
  last_purchase_price: number
  main_unit: string
  status: string
}

interface ScannerSettings {
  autoSearch: boolean
  soundEnabled: boolean
  flashEnabled: boolean
  scanDelay: number
  cameraDevice: string
  scanFormats: string[]
}

export function BarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [state, setState] = useState({
    isScanning: false,
    isInitialized: false,
    lastScan: null as BarcodeResult | null,
    scanHistory: [] as BarcodeResult[],
    foundProduct: null as Product | null,
    error: null as string | null,
    successMessage: null as string | null,
    showSettings: false,
    availableCameras: [] as MediaDeviceInfo[],
    settings: {
      autoSearch: true,
      soundEnabled: true,
      flashEnabled: false,
      scanDelay: 1000,
      cameraDevice: "",
      scanFormats: ["CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E"],
    } as ScannerSettings,
    manualInput: "",
    loading: false,
  })

  // Initialize camera and get available devices
  const initializeCamera = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null, loading: true }))

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices.filter((device) => device.kind === "videoinput")

      if (cameras.length === 0) {
        throw new Error("لم يتم العثور على كاميرا متاحة")
      }

      setState((prev) => ({
        ...prev,
        availableCameras: cameras,
        settings: {
          ...prev.settings,
          cameraDevice: prev.settings.cameraDevice || cameras[0].deviceId,
        },
        isInitialized: true,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "فشل في تهيئة الكاميرا",
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: state.settings.cameraDevice ? { exact: state.settings.cameraDevice } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment", // Prefer back camera
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setState((prev) => ({ ...prev, isScanning: true, error: null }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "فشل في تشغيل الكاميرا",
      }))
    }
  }, [state.settings.cameraDevice])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }

    setState((prev) => ({ ...prev, isScanning: false }))
  }, [])

  // Simulate barcode detection (in real implementation, use a library like QuaggaJS or ZXing)
  const detectBarcode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext("2d")

    if (!context || video.videoWidth === 0) return

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // In a real implementation, you would use a barcode detection library here
    // For demo purposes, we'll simulate detection
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

    // Simulate barcode detection with random success
    if (Math.random() > 0.95) {
      // Simulate finding a barcode
      const simulatedBarcode = "1234567890123"
      handleBarcodeDetected(simulatedBarcode, "EAN_13")
    }
  }, [])

  // Handle detected barcode
  const handleBarcodeDetected = useCallback(
    async (code: string, format: string) => {
      const result: BarcodeResult = {
        code,
        format,
        timestamp: new Date(),
      }

      // Play sound if enabled
      if (state.settings.soundEnabled) {
        try {
          const audio = new Audio("/sounds/beep.mp3")
          audio.play().catch(() => {
            // Fallback to system beep
            const audioContext = new AudioContext()
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            oscillator.frequency.value = 800
            oscillator.type = "square"
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)

            oscillator.start()
            oscillator.stop(audioContext.currentTime + 0.1)
          })
        } catch (error) {
          console.log("Could not play sound")
        }
      }

      setState((prev) => ({
        ...prev,
        lastScan: result,
        scanHistory: [result, ...prev.scanHistory.slice(0, 9)], // Keep last 10 scans
        foundProduct: null,
      }))

      // Auto-search if enabled
      if (state.settings.autoSearch) {
        await searchProduct(code)
      }
    },
    [state.settings.soundEnabled, state.settings.autoSearch],
  )

  // Search for product by barcode
  const searchProduct = async (barcode: string) => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      const response = await fetch(`/api/inventory/products/search?barcode=${encodeURIComponent(barcode)}`)

      if (!response.ok) {
        throw new Error("فشل في البحث عن المنتج")
      }

      const products = await response.json()

      if (products.length > 0) {
        setState((prev) => ({
          ...prev,
          foundProduct: products[0],
          successMessage: `تم العثور على المنتج: ${products[0].product_name}`,
        }))

        setTimeout(() => {
          setState((prev) => ({ ...prev, successMessage: null }))
        }, 3000)
      } else {
        setState((prev) => ({
          ...prev,
          foundProduct: null,
          error: `لم يتم العثور على منتج بالباركود: ${barcode}`,
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "حدث خطأ أثناء البحث",
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  // Handle manual barcode input
  const handleManualSearch = async () => {
    if (!state.manualInput.trim()) return
    await searchProduct(state.manualInput.trim())
  }

  // Toggle flash (if supported)
  const toggleFlash = useCallback(async () => {
    try {
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0]
        const capabilities = track.getCapabilities()

        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: !state.settings.flashEnabled } as any],
          })

          setState((prev) => ({
            ...prev,
            settings: { ...prev.settings, flashEnabled: !prev.settings.flashEnabled },
          }))
        }
      }
    } catch (error) {
      console.error("Flash not supported:", error)
    }
  }, [state.settings.flashEnabled])

  // Start scanning interval
  useEffect(() => {
    if (state.isScanning && !scanIntervalRef.current) {
      scanIntervalRef.current = setInterval(detectBarcode, state.settings.scanDelay)
    } else if (!state.isScanning && scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
      }
    }
  }, [state.isScanning, state.settings.scanDelay, detectBarcode])

  // Initialize on mount
  useEffect(() => {
    initializeCamera()

    return () => {
      stopCamera()
    }
  }, [initializeCamera, stopCamera])

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir="rtl">
      {/* Success Message */}
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{state.successMessage}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto"
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
            className="mr-auto"
            onClick={() => setState((prev) => ({ ...prev, error: null }))}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Scan className="h-8 w-8 text-primary" />
            ماسح الباركود
          </h1>
          <p className="text-muted-foreground mt-1">مسح الباركود والبحث عن المنتجات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setState((prev) => ({ ...prev, showSettings: true }))}>
            <Settings className="h-4 w-4 ml-2" />
            الإعدادات
          </Button>
          {state.isInitialized && (
            <Button onClick={state.isScanning ? stopCamera : startCamera} className="bg-primary hover:bg-primary/90">
              {state.isScanning ? (
                <>
                  <Pause className="h-4 w-4 ml-2" />
                  إيقاف المسح
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 ml-2" />
                  بدء المسح
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera Scanner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              كاميرا المسح
            </CardTitle>
            <CardDescription>استخدم الكاميرا لمسح الباركود تلقائياً</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Camera View */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  style={{ display: state.isScanning ? "block" : "none" }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {!state.isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">الكاميرا متوقفة</p>
                      <p className="text-sm opacity-75">اضغط "بدء المسح" لتشغيل الكاميرا</p>
                    </div>
                  </div>
                )}

                {/* Scanning Overlay */}
                {state.isScanning && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-2 border-primary/30 rounded-lg">
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-32 border-2 border-primary rounded-lg">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              {state.isScanning && (
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleFlash}>
                    {state.settings.flashEnabled ? (
                      <FlashlightOff className="h-4 w-4" />
                    ) : (
                      <Flashlight className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setState((prev) => ({ ...prev, lastScan: null }))}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, soundEnabled: !prev.settings.soundEnabled },
                      }))
                    }
                  >
                    {state.settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {/* Manual Input */}
              <div className="space-y-2">
                <Label>إدخال الباركود يدوياً</Label>
                <div className="flex gap-2">
                  <Input
                    value={state.manualInput}
                    onChange={(e) => setState((prev) => ({ ...prev, manualInput: e.target.value }))}
                    placeholder="أدخل رقم الباركود"
                    onKeyPress={(e) => e.key === "Enter" && handleManualSearch()}
                  />
                  <Button onClick={handleManualSearch} disabled={state.loading || !state.manualInput.trim()}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results and History */}
        <div className="space-y-6">
          {/* Last Scan Result */}
          {state.lastScan && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  آخر مسح
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">الباركود:</span>
                    <span className="font-mono font-medium">{state.lastScan.code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">النوع:</span>
                    <Badge variant="outline">{state.lastScan.format}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">الوقت:</span>
                    <span className="text-sm">{state.lastScan.timestamp.toLocaleTimeString("en-GB")}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => searchProduct(state.lastScan!.code)}
                    disabled={state.loading}
                    className="w-full"
                  >
                    <Search className="h-4 w-4 ml-2" />
                    البحث عن المنتج
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Found Product */}
          {state.foundProduct && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <Package className="h-5 w-5" />
                  المنتج المطابق
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-green-900">{state.foundProduct.product_name}</h3>
                    <p className="text-sm text-green-700">كود المنتج: {state.foundProduct.product_code}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-green-600">المخزون الحالي:</span>
                      <span className="font-medium text-green-900 mr-2">
                        {state.foundProduct.current_stock} {state.foundProduct.main_unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-green-600">آخر سعر شراء:</span>
                      <span className="font-medium text-green-900 mr-2">
                        {state.foundProduct.last_purchase_price.toLocaleString("en-US")} ر.س
                      </span>
                    </div>
                  </div>
                  <Badge
                    className={
                      state.foundProduct.status === "نشط" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                    }
                  >
                    {state.foundProduct.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scan History */}
          {state.scanHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  سجل المسح
                </CardTitle>
                <CardDescription>آخر {state.scanHistory.length} عمليات مسح</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {state.scanHistory.map((scan, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div>
                        <span className="font-mono text-sm">{scan.code}</span>
                        <Badge variant="outline" className="mr-2 text-xs">
                          {scan.format}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{scan.timestamp.toLocaleTimeString("en-GB")}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={state.showSettings} onOpenChange={(open) => setState((prev) => ({ ...prev, showSettings: open }))}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              إعدادات ماسح الباركود
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>الكاميرا</Label>
                <Select
                  value={state.settings.cameraDevice}
                  onValueChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, cameraDevice: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الكاميرا" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.availableCameras.map((camera) => (
                      <SelectItem key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `كاميرا ${camera.deviceId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تأخير المسح (مللي ثانية)</Label>
                <Input
                  type="number"
                  min="100"
                  max="5000"
                  step="100"
                  value={state.settings.scanDelay}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, scanDelay: Number.parseInt(e.target.value) || 1000 },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>البحث التلقائي عن المنتجات</Label>
                <Switch
                  checked={state.settings.autoSearch}
                  onCheckedChange={(checked) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, autoSearch: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>تفعيل الصوت</Label>
                <Switch
                  checked={state.settings.soundEnabled}
                  onCheckedChange={(checked) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, soundEnabled: checked },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-4 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setState((prev) => ({ ...prev, showSettings: false }))}>
                إغلاق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
