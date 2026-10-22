"use client"
import { useEffect, useState } from "react"
import { ReportMultiChoice, type ReportOption } from "./account-statement-report"

export function useInventoryFilters(endpoint: string) {
  const [meta, setMeta] = useState<{products: ReportOption[]; warehouses: ReportOption[]; branches: ReportOption[]}>({ products: [], warehouses: [], branches: [] })
  const [productIds, setProductIds] = useState<number[]>([]), [warehouseIds, setWarehouseIds] = useState<number[]>([]), [branchIds, setBranchIds] = useState<number[]>([])
  const [loadingFilters, setLoadingFilters] = useState(true), [filterError, setFilterError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${endpoint}?meta=1`, { signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الفلاتر")
      setMeta({ ...data, products: (data.products || []).map((p: any) => ({id: Number(p.id), code: p.product_code, name: p.product_name})) })
    }).catch(error => { if (!controller.signal.aborted) setFilterError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoadingFilters(false) })
    return () => controller.abort()
  }, [endpoint])
  // اختيار كل الأصناف (آلاف المعرّفات) كان يتجاوز حد طول الرابط فيعيد الخادم استجابة فارغة ("Unexpected end of JSON input"):
  // الكل محدد ⇐ بلا فلتر (= الكل)، وأكثر من النصف ⇐ تُرسل الأصناف غير المحددة فقط (product_ids_exclude).
  const compactIds = (selected: number[], options: ReportOption[]) => {
    if (!selected.length || selected.length >= options.length) return { include: "", exclude: "" }
    if (selected.length > options.length / 2) {
      const chosen = new Set(selected.map(Number))
      return { include: "", exclude: options.map((option) => Number(option.id)).filter((id) => !chosen.has(id)).join(",") }
    }
    return { include: selected.join(","), exclude: "" }
  }
  const productFilter = compactIds(productIds, meta.products)
  const filterQuery = new URLSearchParams({
    product_ids: productFilter.include, ...(productFilter.exclude ? { product_ids_exclude: productFilter.exclude } : {}),
    warehouse_ids: warehouseIds.length >= meta.warehouses.length ? "" : warehouseIds.join(","),
    branch_ids: branchIds.length >= meta.branches.length ? "" : branchIds.join(","),
  }).toString()
  const controls = <>
    <ReportMultiChoice label="الصنف" options={meta.products} selected={productIds} onChange={setProductIds} placeholder="جميع الأصناف"/>
    <ReportMultiChoice label="المستودع" options={meta.warehouses} selected={warehouseIds} onChange={setWarehouseIds} placeholder="جميع المستودعات"/>
    <ReportMultiChoice label="الفرع" options={meta.branches} selected={branchIds} onChange={setBranchIds} placeholder="جميع الفروع"/>
  </>
  return { controls, filterQuery, loadingFilters, filterError }
}
