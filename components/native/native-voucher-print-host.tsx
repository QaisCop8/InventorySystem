"use client"

import { useEffect, useState } from "react"
import { PosPrintPreview } from "@/components/pos/pos-print-preview"

type VoucherPrintPreview = { title: string; html: string }

export function NativeVoucherPrintHost() {
  const [preview, setPreview] = useState<VoucherPrintPreview | null>(null)

  useEffect(() => {
    const onPrintPreview = (event: Event) => {
      const detail = (event as CustomEvent<VoucherPrintPreview>).detail
      if (detail?.html) setPreview(detail)
    }
    window.addEventListener("native-voucher-print-preview", onPrintPreview)
    return () => window.removeEventListener("native-voucher-print-preview", onPrintPreview)
  }, [])

  if (!preview) return null
  return <PosPrintPreview title={preview.title} html={preview.html} autoPrint={false} nativePrint onClose={() => setPreview(null)} />
}
