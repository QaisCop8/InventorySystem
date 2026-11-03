import { type NextRequest, NextResponse } from "next/server"
import { checkInventoryAndNotify } from "@/lib/whatsapp-scheduler"

// This endpoint can be called by Vercel Cron Jobs or external schedulers
// To set up: Add a cron job in vercel.json or use an external service like cron-job.org
export async function GET(request: NextRequest) {
  try {
    // Verify the request is from a trusted source (optional but recommended)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    // مسار عام (خارج بوابة الجلسة في middleware.ts): بلا CRON_SECRET مضبوط يُرفض دائماً
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Running scheduled inventory check...")
    const result = await checkInventoryAndNotify()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (error) {
    console.error("[v0] Error in cron job:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
