// فتح شاشة على سجل جديد من رابط داخل التطبيق: /?section=<القسم>&new=1 (مثلاً أزرار "تعريف حساب/عميل" في
// نوافذ البحث تفتح تبويباً جديداً بالنظام كاملاً — القائمة والتنقل — لا صفحة إدارية منفصلة بملء الشاشة).
// يُستهلك المعامل مرة واحدة ويُحذف من الرابط حتى لا يعود فتح سجل جديد عند إعادة تركيب الشاشة.
export function consumeNewRecordParam(section: string): boolean {
  if (typeof window === "undefined") return false
  const url = new URL(window.location.href)
  if (url.searchParams.get("new") !== "1" || url.searchParams.get("section") !== section) return false
  url.searchParams.delete("new")
  try { window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`) } catch { /* ignore */ }
  return true
}

/** رابط التطبيق الذي يفتح القسم على سجل جديد. */
export const newRecordHref = (section: string) => `/?section=${encodeURIComponent(section)}&new=1`
