import { tr } from "@/lib/i18n"

/** يقرأ ردّ الخادم كـ JSON بأمان: صفحة HTML (مهلة البوابة/إعادة تشغيل الخادم) تصبح رسالة مفهومة لا "Unexpected token <". */
export async function readJsonResponse(response: Response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch {
    throw new Error(response.status === 504 || response.status === 502 || response.status === 503
      ? tr("استغرق الخادم وقتاً طويلاً — جرّب فترة أقصر أو أعد المحاولة")
      : tr("استجابة غير متوقعة من الخادم — أعد المحاولة"))
  }
}
