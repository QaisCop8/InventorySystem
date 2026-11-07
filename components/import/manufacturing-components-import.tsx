"use client"

import { tr } from "@/lib/i18n"
import { useMemo, useRef } from "react"
import { ExcelImportWizard, type ImportConfig, type ImportIssue } from "@/components/import/excel-import-wizard"

export type ImportedComponentUnit = { unit_id: number; unit_name: string; factor: number }
export type ImportedComponent = {
  id: number
  product_code: string
  product_name: string
  measurment_id: number
  barcode_unit_id: number | null
  units: ImportedComponentUnit[]
}
export type ImportedComponentLine = { product: ImportedComponent; unit: ImportedComponentUnit | null; quantity: number }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: number
  onLines: (lines: ImportedComponentLine[]) => void
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()

/** وحدة السطر: المكتوبة في الملف (بالاسم)، وإلا وحدة الباركود، وإلا الرئيسية. undefined = اسم وحدة غير موجود. */
const pickUnit = (product: ImportedComponent, unitText: unknown) => {
  const wanted = normalize(unitText)
  if (wanted) return product.units.find((unit) => normalize(unit.unit_name) === wanted)
  return product.units.find((unit) => unit.unit_id === product.barcode_unit_id) || product.units[0] || null
}

/** استيراد مكونات التصنيع من Excel: رقم الصنف + الوحدة + الكمية المطلوبة. */
export function ManufacturingComponentsImportDialog({ open, onOpenChange, productId, onLines }: Props) {
  // نتيجة البحث لكل رقم/باركود — لا يُعاد البحث مع كل تعديل في شاشة المراجعة
  const lookupCache = useRef(new Map<string, ImportedComponent | null>())
  const onLinesRef = useRef(onLines)
  onLinesRef.current = onLines

  const config = useMemo<ImportConfig>(() => {
    const lookup = async (codes: string[]) => {
      const pending = [...new Set(codes.filter((code) => code && !lookupCache.current.has(code)))]
      if (!pending.length) return
      const response = await fetch(`/api/inventory/products/${productId}/manufacturing-components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: pending }),
      })
      if (!response.ok) throw new Error(tr("تعذر البحث عن الأصناف"))
      const found: (ImportedComponent & { code: string })[] = await response.json()
      for (const code of pending) lookupCache.current.set(code, found.find((row) => row.code === code) || null)
    }
    return {
      title: tr("استيراد مكونات التصنيع من Excel"),
      description: tr("يُبحث عن المكوّن برقمه أو باركوده؛ الوحدة اختيارية (الرئيسية إن تُركت فارغة)، والمكوّن الموجود في الجدول تُستبدل كميته"),
      templateFileName: "نموذج-مكونات-التصنيع",
      importButtonLabel: tr("إضافة إلى مكونات التصنيع"),
      closeOnSuccess: true,
      fields: [
        { key: "code", label: tr("رقم الصنف"), required: true, aliases: ["barcode", "code", "الباركود", "باركود", "product_code", "كود الصنف", "رقم المكون"], example: "1001" },
        { key: "unit", label: tr("الوحدة"), aliases: ["unit", "unit_name", "وحدة"], description: tr("اسم الوحدة كما في تعريف الصنف"), example: tr("حبة") },
        { key: "quantity", label: tr("الكمية المطلوبة"), type: "number", required: true, min: 0, aliases: ["quantity", "qnty", "qty", "الكمية", "كمية"], example: 1 },
      ],
      validate: async (rows) => {
        const result = new Map<number, ImportIssue[]>()
        const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
        await lookup(rows.map((row) => String(row.data.code || "").trim()))
        const seen = new Map<number, number>()
        for (const row of rows) {
          const code = String(row.data.code || "").trim()
          const product = code ? lookupCache.current.get(code) : undefined
          if (code && !product) add(row.id, { field: "code", message: tr("الصنف {0} غير موجود", code) })
          if (product) {
            if (pickUnit(product, row.data.unit) === undefined) add(row.id, { field: "unit", message: tr("الوحدة {0} ليست من وحدات الصنف ({1})", String(row.data.unit), product.units.map((unit) => unit.unit_name).join("، ")) })
            if (seen.has(product.id)) add(row.id, { field: "code", message: tr("المكوّن مكرر في الملف (السطر {0})", seen.get(product.id)) })
            else seen.set(product.id, row.id)
          }
          if (row.data.quantity !== null && row.data.quantity !== undefined && Number(row.data.quantity) <= 0) add(row.id, { field: "quantity", message: tr("الكمية يجب أن تكون أكبر من صفر") })
        }
        return result
      },
      importRows: async (rows, _ctx, report) => {
        const lines: ImportedComponentLine[] = []
        const added: number[] = []
        for (const row of rows) {
          const product = lookupCache.current.get(String(row.data.code || "").trim())
          const unit = product ? pickUnit(product, row.data.unit) : undefined
          if (!product || unit === undefined) { report(row.id, { ok: false, message: tr("الصنف غير موجود") }); continue }
          lines.push({ product, unit, quantity: Number(row.data.quantity) })
          added.push(row.id)
        }
        if (lines.length) {
          try {
            onLinesRef.current(lines)
            added.forEach((id) => report(id, { ok: true }))
          } catch (error: any) {
            added.forEach((id) => report(id, { ok: false, message: error?.message || tr("تعذرت الإضافة") }))
          }
        }
      },
    }
  }, [productId])

  return <ExcelImportWizard open={open} onOpenChange={(value) => { if (!value) lookupCache.current.clear(); onOpenChange(value) }} config={config} />
}
