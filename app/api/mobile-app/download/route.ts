import { NextResponse } from "next/server"
import { resolveAndroidApk } from "@/lib/mobile-app"

// رابط ثابت لتنزيل APK: يحوّل إلى مكان الملف الفعلي (ANDROID_APK_URL أو /downloads/NoonERP-System.apk).
// Location نسبي للملف المحلي — خلف البروكسي قد لا يكون origin الطلب هو العنوان العام.
export async function GET() {
  const apk = resolveAndroidApk()
  if (!apk) return NextResponse.json({ error: "تطبيق أندرويد غير متوفر للتنزيل بعد" }, { status: 404 })
  return new Response(null, { status: 302, headers: { Location: apk.url, "Cache-Control": "no-store" } })
}
