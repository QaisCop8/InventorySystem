"use client"

import { useEffect, useState } from "react"

// صندوق السيارة المقفل في الشاشات (السيرفر يفرضه أيضاً — lib/van-car.ts enforceVanCash):
//   useMyVan()            ⇐ مندوب المستخدم الحالي وسيارته (تعبئة المندوب والمستودع لسند جديد)
//   useVanCar(salesman, warehouses) ⇐ سيارة السند الحالي: حقل الصندوق يُقفل على صندوقها
export type VanCar = {
  id: number; car_code: string; name: string; salesman_id: number | null; salesman_name: string
  warehouse_id: number | null; warehouse_name: string; cash_account_id: number; cash_account_code: string; cash_account_name: string
}
export type MyVan = { salesman_id: number; salesman_name: string; car: VanCar | null }

let mine: Promise<MyVan | null> | null = null
let mineFor = ""
const currentUserKey = () => { try { return `${sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db") || ""}:${JSON.parse(sessionStorage.getItem("erp_user") || localStorage.getItem("erp_user") || "{}")?.id || ""}` } catch { return "" } }

export function loadMyVan(): Promise<MyVan | null> {
  const key = currentUserKey()
  if (!mine || mineFor !== key) {
    mineFor = key
    mine = fetch("/api/cash-van/car?mine=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((body) => body?.van || null).catch(() => null)
  }
  return mine
}

export function useMyVan(enabled = true) {
  const [van, setVan] = useState<MyVan | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void loadMyVan().then((value) => { if (alive) setVan(value) })
    return () => { alive = false }
  }, [enabled])
  return van
}

const cache = new Map<string, Promise<VanCar | null>>()
export function useVanCar(salesmanId: number | null | undefined, warehouseIds: (number | null | undefined)[], enabled = true) {
  const ids = [...new Set(warehouseIds.map(Number).filter((id) => id > 0))].sort((a, b) => a - b)
  const key = `${Number(salesmanId) || 0}|${ids.join(",")}`
  const [car, setCar] = useState<VanCar | null>(null)
  useEffect(() => {
    if (!enabled || key === "0|") { setCar(null); return }
    let alive = true
    let request = cache.get(key)
    if (!request) {
      request = fetch(`/api/cash-van/car?salesman_id=${Number(salesmanId) || 0}&warehouse_ids=${ids.join(",")}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null)).then((body) => body?.car || null).catch(() => null)
      cache.set(key, request)
      window.setTimeout(() => cache.delete(key), 60_000)
    }
    void request.then((value) => { if (alive) setCar(value) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return car
}
