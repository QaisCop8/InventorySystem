// إشارة "تغيّر تعريف" بين التبويبات (مثل lib/products-changed.ts لكن لأي نوع تعريف): حفظ بنك أو فرع
// بنك في تبويب يُبلغ الشاشات المفتوحة التي تعرضها كقوائم (مثل حسابات البنوك) لتعيد تحميلها.
// BroadcastChannel مع بديل حدث storage، وحدث محلي لتبويبات مساحة العمل في نفس الصفحة.
export type DefinitionTopic = "banks" | "bank-branches"

const CHANNEL = "noon-definitions-changed"
const STORAGE_KEY = "noon_definitions_changed"
const LOCAL_EVENT = "noon-definitions-changed"

export function notifyDefinitionsChanged(topic: DefinitionTopic) {
  if (typeof window === "undefined") return
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL)
      channel.postMessage(topic)
      channel.close()
    } else {
      localStorage.setItem(STORAGE_KEY, `${topic}:${Date.now()}`)
    }
  } catch { /* storage/channel unavailable */ }
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: topic }))
}

export function onDefinitionsChanged(topics: DefinitionTopic[], listener: (topic: DefinitionTopic) => void) {
  if (typeof window === "undefined") return () => {}
  const handle = (topic: unknown) => { if (topics.includes(topic as DefinitionTopic)) listener(topic as DefinitionTopic) }
  let channel: BroadcastChannel | null = null
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (event) => handle(event.data)
    }
  } catch { channel = null }
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY && event.newValue) handle(event.newValue.split(":")[0]) }
  const onLocal = (event: Event) => handle((event as CustomEvent).detail)
  window.addEventListener("storage", onStorage)
  window.addEventListener(LOCAL_EVENT, onLocal)
  return () => {
    channel?.close()
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(LOCAL_EVENT, onLocal)
  }
}
