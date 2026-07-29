"use client"

// حافظة نسخ/لصق سندات عابرة لنوع السند (Alt+C/Alt+V) — تسمح بنسخ سند مخزون (ادخال/اخراج/ارسالية/
// استعمال) للصقه في ارسالية مبيعات، والعكس، رغم اختلاف نموذجي البيانات (VoucherRecord بـ
// unified-stock-voucher.tsx مقابل SalesDeliveryRecord بـunified-sales-delivery.tsx). يُخزَّن فقط
// تقاطع الحقول المشتركة فعلياً بين النموذجين (رأس السند + بنود الصنف) — أي حقل خاص بنوع واحد فقط
// (كخصم/ضريبة السند بالمبيعات، أو from_store_id بالارسالية الداخلية) لا معنى لنسخه للنوع الآخر
// فيُستبعَد كلياً بدل تخمين قيمة له.
//
// localStorage (لا sessionStorage) عمداً: يجب أن يعمل النسخ/اللصق عبر شاشتين مختلفتين مفتوحتين
// بتبويبين مختلفين أو حتى بعد إغلاق شاشة المصدر تماماً وفتح شاشة الهدف لاحقاً بنفس الجلسة.
const STORAGE_KEY = "voucherClipboard:v1"

export interface VoucherClipboardUnit {
  unit_id: number
  unit_name: string
  price: number
  barcode: string
  to_main_qnty: number
}

export interface VoucherClipboardItem {
  product_id: number | null
  product_code: string
  product_name: string
  barcode: string
  warehouse_id: number | null
  warehouse_name: string
  unit: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  batch_number: string
  expiry_date: string
  note: string
  measurment_id: number | null
  product_length: number | null
  product_width: number | null
  product_density: number | null
  length: number | null
  width: number | null
  height: number | null
  count: number | null
  has_expiry?: boolean
  has_batch?: boolean
  units?: VoucherClipboardUnit[]
}

export interface VoucherClipboardHeader {
  currency_id: number | null
  rate: number
  account_id: number | null
  customer_name: string
  to_store_id: number | null
  note: string
}

export type VoucherClipboardSourceKind = "stock_voucher" | "sales_delivery"

export interface VoucherClipboardPayload {
  sourceKind: VoucherClipboardSourceKind
  // نوع السند الفعلي بمصدر النسخ (12/13/14/15 لسندات المخزون، 6 أو نحوه لارسالية المبيعات) —
  // للعرض فقط برسالة التأكيد، لا يُستخدَم في أي قرار منطقي عند اللصق.
  sourceVchType: number
  sourceVchCode: string
  copiedAt: string
  header: VoucherClipboardHeader
  items: VoucherClipboardItem[]
}

export function writeVoucherClipboard(payload: VoucherClipboardPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // فشل الحصة/التسلسل: يبقى النسخ بلا أثر (Alt+V لاحقاً سيقرأ null فيتجاهل الطلب بصمت).
  }
}

export function readVoucherClipboard(): VoucherClipboardPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.items)) return null
    return parsed as VoucherClipboardPayload
  } catch {
    return null
  }
}
