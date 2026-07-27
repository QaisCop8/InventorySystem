import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// جميع أنواع السندات المدعومة
const DOCUMENT_TYPES = [
  { value: "sales-order", label: "طلبية مبيعات" },
  { value: "purchase-order", label: "طلبية مشتريات" },
  { value: "sales-invoice", label: "فاتورة مبيعات" },
  { value: "purchase-invoice", label: "فاتورة مشتريات" },
  { value: "receipt", label: "سند قبض" },
  { value: "payment", label: "سند دفع" },
  { value: "credit-note", label: "إشعار دائن" },
  { value: "debit-note", label: "إشعار مدين" },
]

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Verifying all document settings...")

    // التحقق من وجود الجدول
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_settings'
      )
    `

    if (!tableExists[0].exists) {
      return NextResponse.json({
        success: false,
        error: "جدول document_settings غير موجود",
        tableExists: false,
      })
    }

    // التحقق من إعدادات كل نوع سند
    const verificationResults = []

    for (const docType of DOCUMENT_TYPES) {
      const settings = await sql`
        SELECT 
          COUNT(*) as total_fields,
          COUNT(CASE WHEN show_in_screen THEN 1 END) as screen_fields,
          COUNT(CASE WHEN show_in_print THEN 1 END) as print_fields,
          COUNT(CASE WHEN is_required THEN 1 END) as required_fields
        FROM document_settings
        WHERE document_type = ${docType.value}
      `

      const batchSettings = await sql`
        SELECT * FROM batch_settings
        WHERE document_type = ${docType.value}
      `

      verificationResults.push({
        documentType: docType.value,
        documentLabel: docType.label,
        hasSettings: Number.parseInt(settings[0].total_fields) > 0,
        totalFields: Number.parseInt(settings[0].total_fields),
        screenFields: Number.parseInt(settings[0].screen_fields),
        printFields: Number.parseInt(settings[0].print_fields),
        requiredFields: Number.parseInt(settings[0].required_fields),
        hasBatchSettings: batchSettings.length > 0,
        batchSettings: batchSettings[0] || null,
      })
    }

    // حساب الإحصائيات الإجمالية
    const totalDocumentTypes = DOCUMENT_TYPES.length
    const configuredDocumentTypes = verificationResults.filter((r) => r.hasSettings).length
    const missingDocumentTypes = verificationResults.filter((r) => !r.hasSettings)

    return NextResponse.json({
      success: true,
      tableExists: true,
      summary: {
        totalDocumentTypes,
        configuredDocumentTypes,
        missingDocumentTypes: totalDocumentTypes - configuredDocumentTypes,
        completionPercentage: Math.round((configuredDocumentTypes / totalDocumentTypes) * 100),
      },
      documentTypes: verificationResults,
      missingTypes: missingDocumentTypes.map((d) => ({
        type: d.documentType,
        label: d.documentLabel,
      })),
    })
  } catch (error) {
    console.error("[v0] Error verifying document settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "فشل في التحقق من إعدادات السندات",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
