import sql from "@/lib/database"
import { getSystemSettingValue } from "@/lib/system-settings"
import { INCOMING_VCH_TYPES, OUTGOING_VCH_TYPES, TRANSFER_VCH_TYPE, lotBalances } from "@/lib/stock-lots"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// منع الأرصدة السالبة (إعداد "السماح بكميات سالبة في ارصدة الاصناف" — allow_negative_item_balances في
// الإعدادات العامة للسندات، الافتراضي: مسموح). عند إيقافه يُفحص كل ما يغيّر المخزون قبل تنفيذه:
//   • حفظ سند جديد (إخراج/استعمال/إرسالية داخلية/مبيعات/مرتجع مشتريات...)
//   • تعديل سند (تقليل كمية، حذف سطر، تغيير صنف/وحدة/مستودع) — خاصة سندات الإدخال التي استُهلك منها
//   • حذف أو إلغاء سند (حذف سند إدخال/فاتورة مشتريات/مرتجع مبيعات استُهلكت كميته لاحقاً)
// الرصيد المعتمد: رصيد الصنف الحالي في المستودع بالوحدة الرئيسية من نفس دفتر الحركات (lib/stock-lots.ts،
// المحفوظ والمرحّل) مع استبعاد السند نفسه، ثم إضافة أثره الجديد. يُرفض التغيير فقط إن جعل الرصيد سالباً
// وأسوأ مما كان — فسند لا يمسّ صنفاً سالباً أصلاً (من قبل تفعيل الإعداد) لا يُمنع بسببه.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export async function negativeStockAllowed() {
  const value = await getSystemSettingValue<unknown>("allow_negative_item_balances", true)
  return !(value === false || value === "false" || value === 0 || value === "0")
}

type Delta = { productId: number; storeId: number; quantity: number; label: string }

const EPS = 1e-6

function signFor(vchType: number) {
  if (INCOMING_VCH_TYPES.includes(vchType)) return 1
  if (OUTGOING_VCH_TYPES.includes(vchType)) return -1
  return 0
}

/** أثر أسطر سند على المخزون (بالوحدة الرئيسية) لكل (صنف، مستودع). */
async function deltasOf(vchType: number, items: any[], header: { fromStoreId?: number | null; toStoreId?: number | null }): Promise<Delta[]> {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: Number(item.product_id ?? item.item_id) || 0,
      storeId: Number(item.warehouse_id ?? item.store_id) || 0,
      unitId: Number(item.unit_id ?? item.unitId) || null,
      unitName: String(item.unit || item.unit_name || "").trim(),
      quantity: Number(item.qnty ?? item.quantity ?? 0) + Number(item.bonus ?? item.bonus_quantity ?? 0),
      // فاتورة من إرسالية: الإرسالية نفسها هي حركة المخزون (نفس قاعدة lib/stock-lots.ts)
      fromDelivery: (vchType === 12 || vchType === 17) && Number(item.delivery_item_id) > 0,
      label: String(item.product_name || item.item_name || item.product_code || ""),
    }))
    .filter((row) => row.productId > 0 && row.quantity > 0 && !row.fromDelivery)
  if (!rows.length) return []

  const productIds = [...new Set(rows.map((row) => row.productId))]
  const [units, products] = await Promise.all([
    sql`SELECT pu.product_id, pu.unit_id, u.unit_name, pu.to_main_qnty FROM product_units pu LEFT JOIN units u ON u.id = pu.unit_id WHERE pu.product_id = ANY(${productIds}::int[])`,
    sql`SELECT id, product_name, COALESCE(type, 1) AS type FROM products WHERE id = ANY(${productIds}::int[])`,
  ])
  // الخدمات والأصناف غير المخزنية لا رصيد لها
  const stockProducts = new Map((products as any[]).filter((row) => Number(row.type) === 1).map((row) => [Number(row.id), String(row.product_name || "")]))
  const factorOf = (row: (typeof rows)[number]) => {
    const unit = (units as any[]).find((candidate) => Number(candidate.product_id) === row.productId
      && (row.unitId ? Number(candidate.unit_id) === row.unitId : String(candidate.unit_name || "").trim() === row.unitName))
    return Number(unit?.to_main_qnty) || 1
  }

  const deltas: Delta[] = []
  for (const row of rows) {
    if (!stockProducts.has(row.productId)) continue
    const main = row.quantity * factorOf(row)
    const label = row.label || stockProducts.get(row.productId) || `#${row.productId}`
    if (vchType === TRANSFER_VCH_TYPE) {
      const from = Number(header.fromStoreId) || 0
      const to = Number(header.toStoreId) || 0
      if (from && from !== to) deltas.push({ productId: row.productId, storeId: from, quantity: -main, label })
      if (to && from !== to) deltas.push({ productId: row.productId, storeId: to, quantity: main, label })
      continue
    }
    const sign = signFor(vchType)
    const storeId = row.storeId || Number(sign > 0 ? header.toStoreId : header.fromStoreId) || Number(header.toStoreId ?? header.fromStoreId) || 0
    if (sign && storeId) deltas.push({ productId: row.productId, storeId, quantity: sign * main, label })
  }
  return deltas
}

const keyOf = (productId: number, storeId: number) => `${productId}|${storeId}`

function sumDeltas(deltas: Delta[]) {
  const map = new Map<string, Delta>()
  for (const delta of deltas) {
    const key = keyOf(delta.productId, delta.storeId)
    const current = map.get(key)
    if (current) current.quantity += delta.quantity
    else map.set(key, { ...delta })
  }
  return map
}

/**
 * يُرجع رسالة خطأ إن كان التغيير سيجعل رصيد صنف سالباً (والإعداد لا يسمح)، وإلا null.
 * items = أسطر السند بعد التغيير ([] عند الحذف/الإلغاء)؛ voucherId = السند المحفوظ (يُستبعد أثره القديم).
 */
export async function validateNegativeStock(params: {
  vchType: number
  voucherId?: number | null
  items: any[]
  fromStoreId?: number | null
  toStoreId?: number | null
  action?: "save" | "delete"
}): Promise<string | null> {
  if (await negativeStockAllowed()) return null
  const vchType = Number(params.vchType)
  const voucherId = Number(params.voucherId) || null

  // الأثر القديم للسند المحفوظ (إن لم يكن ملغياً)
  let oldDeltas: Delta[] = []
  let header = { fromStoreId: params.fromStoreId ?? null, toStoreId: params.toStoreId ?? null }
  if (voucherId) {
    const saved = ((await sql`SELECT vch_type, status, from_store_id, to_store_id FROM voucher_header_tbl WHERE id = ${voucherId}`) as any[])[0]
    if (saved) {
      if (params.fromStoreId == null && params.toStoreId == null) header = { fromStoreId: saved.from_store_id, toStoreId: saved.to_store_id }
      if (Number(saved.status) !== 3) {
        const savedItems = (await sql`SELECT * FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`) as any[]
        oldDeltas = await deltasOf(Number(saved.vch_type) || vchType, savedItems, { fromStoreId: saved.from_store_id, toStoreId: saved.to_store_id })
      }
    }
  }
  const newDeltas = params.action === "delete" ? [] : await deltasOf(vchType, params.items, header)
  const oldMap = sumDeltas(oldDeltas)
  const newMap = sumDeltas(newDeltas)
  const keys = [...new Set([...oldMap.keys(), ...newMap.keys()])]
  if (!keys.length) return null

  // الرصيد الحالي دون هذا السند — لكل مستودع مرة واحدة
  const byStore = new Map<number, number[]>()
  for (const key of keys) {
    const [productId, storeId] = key.split("|").map(Number)
    byStore.set(storeId, [...(byStore.get(storeId) || []), productId])
  }
  const balances = new Map<string, number>()
  for (const [storeId, productIds] of byStore) {
    const lots = await lotBalances({ warehouseId: storeId, productIds, excludeVoucherId: voucherId, mode: "active" })
    for (const lot of lots) {
      const key = keyOf(lot.item_id, storeId)
      balances.set(key, (balances.get(key) || 0) + lot.quantity)
    }
  }

  const problems: { label: string; storeId: number; result: number }[] = []
  for (const key of keys) {
    const base = balances.get(key) || 0
    const before = base + (oldMap.get(key)?.quantity || 0)
    const after = base + (newMap.get(key)?.quantity || 0)
    if (after < -EPS && after < before - EPS) {
      const label = newMap.get(key)?.label || oldMap.get(key)?.label || ""
      problems.push({ label, storeId: Number(key.split("|")[1]), result: Math.round(after * 1000) / 1000 })
    }
  }
  if (!problems.length) return null

  const storeIds = [...new Set(problems.map((problem) => problem.storeId))]
  const stores = (await sql`SELECT id, warehouse_name FROM warehouses WHERE id = ANY(${storeIds}::int[])`) as any[]
  const storeName = (id: number) => String(stores.find((row) => Number(row.id) === id)?.warehouse_name || `#${id}`)
  const details = problems.slice(0, 5).map((problem) => `${problem.label} (${storeName(problem.storeId)}: ${problem.result})`).join("، ")
  const more = problems.length > 5 ? ` و${problems.length - 5} أصناف أخرى` : ""
  const verb = params.action === "delete" ? "لا يمكن حذف/إلغاء السند" : "لا يمكن حفظ السند"
  return `${verb}: الرصيد سيصبح سالباً للأصناف ${details}${more} — السماح بالأرصدة السالبة غير مفعّل في الإعدادات العامة للسندات`
}
