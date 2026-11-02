import { authorizeUserAdmin } from "@/lib/user-admin-access"
import { type NextRequest, NextResponse } from "next/server"
import { autoFixSystemIssues } from "@/lib/system-validator"

export async function POST(request: NextRequest) {
  // أداة إدارية/تطوير: للمسؤول فقط
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const fixes = await autoFixSystemIssues()
    return NextResponse.json({ success: true, fixes })
  } catch (error) {
    console.error("خطأ في الإصلاح التلقائي:", error)
    return NextResponse.json({ error: "فشل في الإصلاح التلقائي" }, { status: 500 })
  }
}
