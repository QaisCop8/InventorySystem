"use client"

import { useMemo, useRef } from "react"
import { ExcelImportWizard, type ImportConfig, type ImportIssue } from "@/components/import/excel-import-wizard"

type Props<P> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** فئة السعر الحالية للسند — للتحقق من وجود الصنف بنفس بحث الشاشة */
  priceCategoryId?: number | string | null
  /** جلب الصنف كما تفعل الشاشة (يشمل اختيار المتغيّر إن وُجد) */
  resolveProduct: (code: string) => Promise<P | null>
  /** إضافة الأصناف للشبكة دفعة واحدة */
  onLines: (products: P[]) => Promise<void> | void
  title?: string
}

/** استيراد أسطر سند (أصناف/كميات/أسعار) من Excel إلى شبكة السند — نفس محرك الاستيراد الموحّد. */
export function VoucherLinesImportDialog<P extends Record<string, any>>({ open, onOpenChange, priceCategoryId, resolveProduct, onLines, title }: Props<P>) {
  // نتيجة البحث عن كل رقم/باركود — حتى لا يُعاد البحث مع كل تعديل في شاشة المراجعة
  const existsCache = useRef(new Map<string, boolean>())
  const resolveRef = useRef(resolveProduct)
  resolveRef.current = resolveProduct
  const onLinesRef = useRef(onLines)
  onLinesRef.current = onLines

  const config = useMemo<ImportConfig>(() => ({
    title: title || "استيراد الأصناف من Excel",
    description: "يُبحث عن الصنف برقمه أو باركوده؛ الأسطر غير الموجودة تظهر كأخطاء لتصحيحها قبل الإضافة",
    templateFileName: "نموذج-أسطر-السند",
    importButtonLabel: "إضافة إلى السند",
    closeOnSuccess: true,
    fields: [
      { key: "code", label: "رقم الصنف", required: true, aliases: ["barcode", "code", "الباركود", "باركود", "product_code", "كود الصنف"], example: "1001" },
      { key: "qnty", label: "الكمية", type: "number", min: 0, aliases: ["quantity", "qnty", "qty", "كمية"], example: 1 },
      { key: "price", label: "السعر", type: "number", min: 0, aliases: ["price", "Price", "سعر"], description: "يُستخدم سعر الصنف إن تُرك فارغاً" },
      { key: "bonus", label: "البونص", type: "number", min: 0, aliases: ["bonus", "بونص"] },
      { key: "batch", label: "الرقم التشغيلي", aliases: ["batch"] },
    ],
    validate: async (rows) => {
      const result = new Map<number, ImportIssue[]>()
      const pending = [...new Set(rows.map((row) => String(row.data.code || "").trim()).filter((code) => code && !existsCache.current.has(code)))]
      const worker = async () => {
        for (let code = pending.shift(); code !== undefined; code = pending.shift()) {
          const response = await fetch(`/api/inventory/products/search?query=${encodeURIComponent(code)}&priceCategoryId=${encodeURIComponent(String(priceCategoryId ?? ""))}`).catch(() => null)
          const product = response?.ok ? await response.json().catch(() => null) : null
          existsCache.current.set(code, Boolean(product))
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      for (const row of rows) {
        const code = String(row.data.code || "").trim()
        if (code && existsCache.current.get(code) === false) result.set(row.id, [{ field: "code", message: `الصنف ${code} غير موجود` }])
        if (row.data.qnty === 0) result.set(row.id, [...(result.get(row.id) || []), { field: "qnty", message: "الكمية يجب أن تكون أكبر من صفر" }])
      }
      return result
    },
    importRows: async (rows, _ctx, report, signal) => {
      const products: P[] = []
      const added: number[] = []
      for (const row of rows) {
        if (signal.aborted) return
        const product = await resolveRef.current(String(row.data.code).trim())
        if (!product) { report(row.id, { ok: false, message: "الصنف غير موجود أو أُلغي اختياره" }); continue }
        const line: any = { ...product }
        if (row.data.price !== null && row.data.price !== undefined && row.data.price !== "") line.price = row.data.price
        line.qnty = row.data.qnty || 1
        line.bonus = row.data.bonus || 0
        line.batch = row.data.batch || ""
        products.push(line)
        added.push(row.id)
      }
      if (products.length) {
        try {
          await onLinesRef.current(products)
          added.forEach((id) => report(id, { ok: true }))
        } catch (error: any) {
          added.forEach((id) => report(id, { ok: false, message: error?.message || "تعذرت الإضافة" }))
        }
      }
    },
  }), [priceCategoryId, title])

  return <ExcelImportWizard open={open} onOpenChange={(value) => { if (!value) existsCache.current.clear(); onOpenChange(value) }} config={config} />
}
