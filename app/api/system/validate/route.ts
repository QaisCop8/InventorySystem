import { authorizeUserAdmin } from "@/lib/user-admin-access"
import { type NextRequest, NextResponse } from "next/server"
import { validateSystemStability } from "@/lib/system-validator"

export async function GET(request: NextRequest) {
  // أداة إدارية/تطوير: للمسؤول فقط
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const result = await validateSystemStability()
    return NextResponse.json(result)
  } catch (error) {
    console.error("خطأ في فحص النظام:", error)
    return NextResponse.json({ error: "فشل في فحص النظام" }, { status: 500 })
  }
}
