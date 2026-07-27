import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
declare global {
  var diagnosticsCache: { data: any; timestamp: number } | undefined
}

export async function GET(request: NextRequest) {
  try {
    const cacheKey = "system-diagnostics"
    const cacheTime = 30000 // 30 seconds

    // Simple in-memory cache (in production, use Redis)
    const cached = global.diagnosticsCache as { data: any; timestamp: number } | undefined
    if (cached && Date.now() - cached.timestamp < cacheTime) {
      return NextResponse.json(cached.data)
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      database: {} as any,
      tables: {} as any,
      performance: {} as any,
      errors: [] as string[],
    }

    const dbStart = Date.now()

    const tableChecks = [
      "users",
      "organizations",
      "products",
      "customers",
      "suppliers",
      "sales_orders",
      "purchase_orders",
      "exchange_rates",
    ]

    const tablePromises = tableChecks.map(async (tableName) => {
      try {
        const [existsResult, recordResult] = await Promise.all([
          sql`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = ${tableName}`,
          sql.unsafe(`SELECT COUNT(*) as records FROM ${tableName}`).catch(() => [{ records: 0 }]),
        ])

        return {
          tableName,
          exists: existsResult[0].count > 0,
          records: Number.parseInt(recordResult[0].records),
        }
      } catch (error) {
        return {
          tableName,
          exists: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    })

    const tableResults = await Promise.all(tablePromises)

    for (const result of tableResults) {
      diagnostics.tables[result.tableName] = {
        exists: result.exists,
        records: result.records || 0,
      }

      if (!result.exists) {
        diagnostics.errors.push(`Table ${result.tableName} does not exist`)
      }
      if (result.error) {
        diagnostics.errors.push(`Error checking table ${result.tableName}: ${result.error}`)
      }
    }

    // إحصائيات قاعدة البيانات
    try {
      const dbStats = await sql`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes
        FROM pg_stat_user_tables
        ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC
        LIMIT 10
      `

      diagnostics.database = {
        responseTime: Date.now() - dbStart,
        activeConnections: "N/A", // يتطلب صلاحيات إضافية
        topTables: dbStats,
        totalTables: Object.keys(diagnostics.tables).length,
      }
    } catch (error) {
      diagnostics.database.error = error instanceof Error ? error.message : "Unknown error"
      diagnostics.errors.push("Failed to get database statistics")
    }

    // تشخيص الأداء
    const performanceStart = Date.now()

    // اختبار سرعة الاستعلام
    try {
      const queryStart = Date.now()
      await sql`SELECT 1`
      const simpleQueryTime = Date.now() - queryStart

      const complexQueryStart = Date.now()
      await sql`
        SELECT COUNT(*) as total_records
        FROM information_schema.columns
      `
      const complexQueryTime = Date.now() - complexQueryStart

      diagnostics.performance = {
        simpleQueryTime,
        complexQueryTime,
        totalDiagnosticTime: Date.now() - performanceStart,
      }
    } catch (error) {
      diagnostics.performance.error = error instanceof Error ? error.message : "Unknown error"
      diagnostics.errors.push("Performance testing failed")
    }

    global.diagnosticsCache = {
      data: diagnostics,
      timestamp: Date.now(),
    }

    return NextResponse.json(diagnostics)
  } catch (error) {
    console.error("[v0] Diagnostics failed:", error)
    return NextResponse.json(
      {
        error: "Diagnostics failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
