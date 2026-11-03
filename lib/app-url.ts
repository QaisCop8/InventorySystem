// رابط النظام العام في رسائل البريد وروابط العودة: نطاق الشركة دائماً، لا عنوان الاستضافة الداخلي (onrender.com).
// APP_PUBLIC_URL/NEXT_PUBLIC_APP_URL يغيّرانه، لكن قيمة تشير إلى onrender.com تُستبدل بالنطاق الرسمي.
export const DEFAULT_PUBLIC_APP_URL = "https://noonerp.sabbahsoft.com"

export function publicAppUrl() {
  const configured = String(process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "")
  if (!configured || /\.onrender\.com$/i.test(configured.replace(/^https?:\/\//i, "").split("/")[0])) return DEFAULT_PUBLIC_APP_URL
  return configured
}
