import { timingSafeEqual } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { runScheduledBackups } from "@/lib/backups"

// النسخ اليومي المجدول: يستدعيه GitHub Actions (.github/workflows/scheduled-backups.yml) بترويسة
// Authorization: Bearer <BACKUP_CRON_SECRET>. يعمل متزامناً حتى ينتهي كل شيء فيبقى الطلب مفتوحاً ولا ينام الخادم أثناء النسخ.
export const maxDuration = 3600

function authorized(request: NextRequest) {
  const secret = (process.env.BACKUP_CRON_SECRET || "").trim()
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!secret || secret.length < 16 || given.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    const result = await runScheduledBackups()
    const failed = result.results.filter((row) => !row.ok)
    return NextResponse.json({ ok: failed.length === 0, total: result.results.length, failed, pruned: result.pruned }, { status: failed.length ? 500 : 200 })
  } catch (error) {
    console.error("scheduled backups", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
