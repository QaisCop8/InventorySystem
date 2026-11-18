"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState } from "react"
import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QuickSalesOrder } from "@/components/quick-sales-order"

// «طلبية سريعة» من قائمة المبيعات (نُقلت من أزرار الشاشة الرئيسية 2026-11-18): تفتح نافذة الطلبية فوراً، وزر لطلبية أخرى
export default function QuickSalesOrderPage() {
  const [open, setOpen] = useState(true)
  const [saved, setSaved] = useState(0)
  return (
    <div dir={appDir()} className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-600"><ShoppingCart className="h-7 w-7" /></span>
        <h2 className="text-lg font-black">{tr("طلبية سريعة")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{saved ? tr("تم حفظ {0} طلبية في هذه الجلسة", saved) : tr("إدخال طلبية مبيعات بسرعة")}</p>
        <Button className="mt-5 gap-2 bg-orange-600 hover:bg-orange-700" onClick={() => setOpen(true)}><ShoppingCart className="h-4 w-4" />{tr("طلبية جديدة")}</Button>
      </div>
      <QuickSalesOrder open={open} onOpenChange={setOpen} onOrderSaved={() => setSaved((count) => count + 1)} />
    </div>
  )
}
