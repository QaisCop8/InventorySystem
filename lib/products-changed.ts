// إشارة "تغيّرت الأصناف" بين التبويبات: حفظ صنف (إضافة/تعديل/وحدة جديدة) في أي تبويب يُبلغ نوافذ
// بحث الأصناف المفتوحة (ProductSearchPopup) لتُحدّث قائمتها تلقائياً. BroadcastChannel مع بديل
// حدث storage للمتصفحات التي لا تدعمه، وحدث محلي للتبويب نفسه.
const CHANNEL = "noon-products-changed"
const STORAGE_KEY = "noon_products_changed_at"
const LOCAL_EVENT = "noon-products-changed"

export function notifyProductsChanged() {
  if (typeof window === "undefined") return
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL)
      channel.postMessage(Date.now())
      channel.close()
    } else {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    }
  } catch { /* storage/channel unavailable */ }
  window.dispatchEvent(new Event(LOCAL_EVENT))
}

export function onProductsChanged(listener: () => void) {
  if (typeof window === "undefined") return () => {}
  let channel: BroadcastChannel | null = null
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = () => listener()
    }
  } catch { channel = null }
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener() }
  window.addEventListener("storage", onStorage)
  window.addEventListener(LOCAL_EVENT, listener)
  return () => {
    channel?.close()
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(LOCAL_EVENT, listener)
  }
}
