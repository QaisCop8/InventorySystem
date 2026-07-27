import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const healthCheck = {
    timestamp: new Date().toISOString(),
    status: "healthy" as "healthy" | "degraded" | "unhealthy",
    version: "1.0.0",
    uptime: process.uptime(),
    checks: {} as Record<string, any>,
    performance: {} as Record<string, any>,
    errors: [] as string[],
  }

  try {
    // فحص قاعدة البيانات
    const dbStart = Date.now()
    try {
      const result = await sql`SELECT 1 as test, NOW() as server_time`
      healthCheck.checks.database = {
        status: "healthy",
        responseTime: Date.now() - dbStart,
        serverTime: result[0].server_time,
      }
    } catch (error) {
      healthCheck.checks.database = {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown database error",
        responseTime: Date.now() - dbStart,
      }
      healthCheck.status = "unhealthy"
      healthCheck.errors.push("Database connection failed")
    }

    // فحص الذاكرة
    const memoryUsage = process.memoryUsage()
    healthCheck.checks.memory = {
      status: memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9 ? "healthy" : "degraded",
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
    }

    // فحص متغيرات البيئة الحرجة
    const requiredEnvVars = ["DATABASE_URL", "NEXT_PUBLIC_STACK_PROJECT_ID"]
    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

    healthCheck.checks.environment = {
      status: missingEnvVars.length === 0 ? "healthy" : "unhealthy",
      missingVariables: missingEnvVars,
      totalRequired: requiredEnvVars.length,
      available: requiredEnvVars.length - missingEnvVars.length,
    }

    if (missingEnvVars.length > 0) {
      healthCheck.status = "unhealthy"
      healthCheck.errors.push(`Missing environment variables: ${missingEnvVars.join(", ")}`)
    }

    // فحص أداء النظام
    healthCheck.performance = {
      totalResponseTime: Date.now() - startTime,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    }

    // تحديد الحالة العامة
    if (healthCheck.status === "healthy" && healthCheck.checks.memory.status === "degraded") {
      healthCheck.status = "degraded"
    }

    return NextResponse.json(healthCheck, {
      status: healthCheck.status === "healthy" ? 200 : healthCheck.status === "degraded" ? 200 : 503,
    })
  } catch (error) {
    console.error("[v0] Health check failed:", error)
    return NextResponse.json(
      {
        ...healthCheck,
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        performance: {
          totalResponseTime: Date.now() - startTime,
        },
      },
      { status: 503 },
    )
  }
}
