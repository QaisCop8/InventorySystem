import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import fs from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    // قراءة سكريبت مسح البيانات التجريبية
    const scriptPath = path.join(process.cwd(), "scripts", "cleanup-test-data.sql")
    const cleanupScript = fs.readFileSync(scriptPath, "utf8")

    // تنفيذ السكريبت
    await sql(cleanupScript)

    return NextResponse.json({
      success: true,
      message: "تم مسح البيانات التجريبية بنجاح",
    })
  } catch (error) {
    console.error("خطأ في مسح البيانات التجريبية:", error)
    return NextResponse.json({ error: "فشل في مسح البيانات التجريبية" }, { status: 500 })
  }
}
