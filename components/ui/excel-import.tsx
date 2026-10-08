"use client"

import { useRef } from "react"
import { PartyImportDialog } from "@/components/import/customers-import"
import { ProductsImportDialog } from "@/components/import/products-import"

interface ExcelImportProps {
  entityType: "products" | "customers" | "suppliers" | "subscribers"
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

// غلاف توافق — الاستيراد نفسه أصبح بالمحرك الموحّد (components/import/excel-import-wizard.tsx).
// onImportComplete تُستدعى عند إغلاق النافذة بعد استيراد ناجح (لا فور انتهاء الحفظ) حتى يرى
// المستخدم نتيجة كل سطر قبل الإغلاق.
export function ExcelImport({ entityType, isOpen, onClose, onImportComplete }: ExcelImportProps) {
  const importedRef = useRef(false)
  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (importedRef.current) { importedRef.current = false; onImportComplete() } else onClose()
  }
  const markImported = () => { importedRef.current = true }
  if (entityType === "products") return <ProductsImportDialog open={isOpen} onOpenChange={handleOpenChange} onImported={markImported} />
  return <PartyImportDialog kind={entityType} open={isOpen} onOpenChange={handleOpenChange} onImported={markImported} />
}
