// مراقبة المطعم: أنواع الحركات المعروضة (مشتركة بين app/api/reports/restaurant-monitor والشاشة).
// حركات الطلبات من restaurant_order_log_tbl، وحركات العهدة من restaurant_cash_movements_tbl.
export type RestaurantMonitorTone = "custody" | "danger" | "warning" | "info" | "success" | "neutral"

export const RESTAURANT_MONITOR_ACTIONS = [
  { key: "custody_open", label: "فتح عهدة", tone: "custody" },
  { key: "custody_receive", label: "استلام عهدة", tone: "custody" },
  { key: "custody_handover", label: "تسليم عهدة", tone: "custody" },
  { key: "cash_in", label: "إيداع نقدي في العهدة", tone: "custody" },
  { key: "cash_out", label: "سحب نقدي من العهدة", tone: "custody" },
  { key: "custody_close", label: "إغلاق عهدة", tone: "custody" },
  { key: "open", label: "فتح طاولة", tone: "info" },
  { key: "open_takeaway", label: "فتح طلب سفري", tone: "info" },
  { key: "add_items", label: "إضافة أصناف", tone: "success" },
  { key: "update_item", label: "تعديل صنف", tone: "neutral" },
  { key: "reduce_item", label: "تخفيض كمية صنف", tone: "danger" },
  { key: "remove_item", label: "حذف صنف", tone: "danger" },
  { key: "item_discount", label: "خصم صنف", tone: "warning" },
  { key: "order_discount", label: "خصم على الطلب", tone: "warning" },
  { key: "update_order", label: "تعديل بيانات الطلب", tone: "neutral" },
  { key: "transfer", label: "نقل طاولة", tone: "neutral" },
  { key: "merge", label: "دمج طاولات", tone: "neutral" },
  { key: "merged_into", label: "دمج في طلب آخر", tone: "neutral" },
  { key: "unmerge", label: "فك دمج طاولة", tone: "neutral" },
  { key: "split", label: "فصل أصناف", tone: "neutral" },
  { key: "print", label: "طباعة الفاتورة", tone: "neutral" },
  { key: "pay", label: "دفع فاتورة", tone: "success" },
  { key: "pay_partial", label: "دفعة جزئية", tone: "success" },
  { key: "close", label: "إغلاق طلب", tone: "success" },
  { key: "cancel", label: "إلغاء طلب", tone: "danger" },
] as const satisfies readonly { key: string; label: string; tone: RestaurantMonitorTone }[]

export type RestaurantMonitorAction = (typeof RESTAURANT_MONITOR_ACTIONS)[number]["key"]

export const RESTAURANT_MONITOR_LABEL: Record<string, string> = Object.fromEntries(RESTAURANT_MONITOR_ACTIONS.map((action) => [action.key, action.label]))
export const RESTAURANT_MONITOR_TONE: Record<string, RestaurantMonitorTone> = Object.fromEntries(RESTAURANT_MONITOR_ACTIONS.map((action) => [action.key, action.tone]))
