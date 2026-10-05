"use client"

import { useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import type { PrintDocument } from "@/lib/voucher-print/document"
import { printVoucher } from "@/lib/voucher-print/print"

export function useVoucherPrinter<T>(data: T | null, voucherTypeId: number, toDocument: (data: T, voucherTypeId: number) => PrintDocument) {
  const { toast } = useToast()
  useEffect(() => {
    if (!data) return
    let cancelled = false
    printVoucher(toDocument(data, voucherTypeId))
      .then(result => {
        if (cancelled) return
        if (result.method === "service") toast({ title: "تم إرسال السند إلى الطابعة" })
        else if (result.warning) toast({ title: "تمت الطباعة عبر المتصفح", description: `خدمة الطباعة غير متاحة: ${result.warning}` })
      })
      .catch(error => {
        if (!cancelled) toast({ title: "تعذرت الطباعة", description: error instanceof Error ? error.message : "حدث خطأ أثناء الطباعة", variant: "destructive" })
      })
    return () => { cancelled = true }
    // toDocument is a stable module-level converter; printing must run once per new data object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, voucherTypeId])
}
