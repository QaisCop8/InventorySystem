"use client"
import { tr, appDir } from "@/lib/i18n"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarcodeScanner } from "./barcode-scanner"
import { BarcodeGenerator } from "./barcode-generator"
import { Scan, QrCode, Package } from "lucide-react"

export function BarcodeManagement() {
  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir={appDir()}>
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          {tr("إدارة الباركود")}
        </h1>
        <p className="text-muted-foreground mt-1">{tr("مسح وإنشاء وإدارة الباركود للمنتجات")}</p>
      </div>

      <Tabs defaultValue="scanner" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scanner" className="flex items-center gap-2">
            <Scan className="h-4 w-4" />
            {tr("ماسح الباركود")}
          </TabsTrigger>
          <TabsTrigger value="generator" className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            {tr("مولد الباركود")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="mt-6">
          <BarcodeScanner />
        </TabsContent>

        <TabsContent value="generator" className="mt-6">
          <BarcodeGenerator />
        </TabsContent>
      </Tabs>
    </div>
  )
}
