import { NextResponse } from "next/server"
import { resolveAndroidApk } from "@/lib/mobile-app"

// هل يتوفر تطبيق أندرويد للتنزيل؟ (تستخدمه الشاشة الرئيسية لإظهار زر "تطبيق أندرويد")
export async function GET() {
  const apk = resolveAndroidApk()
  return NextResponse.json({ android: apk ? { download: "/api/mobile-app/download", updatedAt: apk.updatedAt } : null })
}
