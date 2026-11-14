import { NextResponse } from "next/server"
import { currentCompanyModules } from "@/lib/company-modules"

// الوحدات الإضافية المفعّلة لشركة الجلسة — لإظهار شاشاتها في القائمة فقط (الخادم يفرضها في مساراتها).
export async function GET() {
  try {
    return NextResponse.json({ modules: await currentCompanyModules() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("company modules failed:", error)
    return NextResponse.json({ modules: [] })
  }
}
