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
  const filterQuery = new URLSearchParams({product_ids: productIds.join(","), warehouse_ids: warehouseIds.join(","), branch_ids: branchIds.join(",")}).toString()
  const controls = <>
    <ReportMultiChoice label="الصنف" options={meta.products} selected={productIds} onChange={setProductIds} placeholder="جميع الأصناف"/>
    <ReportMultiChoice label="المستودع" options={meta.warehouses} selected={warehouseIds} onChange={setWarehouseIds} placeholder="جميع المستودعات"/>
    <ReportMultiChoice label="الفرع" options={meta.branches} selected={branchIds} onChange={setBranchIds} placeholder="جميع الفروع"/>
  </>
  return { controls, filterQuery, loadingFilters, filterError }
}
