import managementSql, { ensureManagementTables } from "@/lib/management-db"

// حضور المستخدمين لتقرير «سجل الدخول للموقع» في لوحة الإدارة: middleware.ts يستدعي touchPresence بعد كل طلب
// API بجلسة صالحة، ونكتب لقاعدة الإدارة مرة واحدة على الأكثر كل دقيقة لكل مستخدم (لا انتظار ولا كسر للطلب).
// «متصل الآن» = نشاط خلال ONLINE_WINDOW_MINUTES ولم يسجّل خروجه بعده.

export const ONLINE_WINDOW_MINUTES = 5
export const PRESENCE_TIME_ZONE = "Asia/Hebron"

const WRITE_EVERY_MS = 60_000
const lastWrite = new Map<string, number>()

function presenceKey(dbName: string, userId: number) {
  return `${dbName}\u0000${userId}`
}

export function touchPresence(dbName: string, rawUserId: string, ip: string | null) {
  const userId = Number(rawUserId)
  if (!dbName || !Number.isInteger(userId) || userId <= 0) return
  const key = presenceKey(dbName, userId)
  const now = Date.now()
  if ((lastWrite.get(key) ?? 0) + WRITE_EVERY_MS > now) return
  if (lastWrite.size >= 10_000) lastWrite.clear()
  lastWrite.set(key, now)

  void (async () => {
    await ensureManagementTables()
    await managementSql`
      WITH presence AS (
        INSERT INTO management_user_presence (db_name, tenant_user_id, last_seen_at, last_ip, logged_out_at)
        VALUES (${dbName}, ${userId}, CURRENT_TIMESTAMP, ${ip && ip !== "unknown" ? ip.slice(0, 64) : null}, NULL)
        ON CONFLICT (db_name, tenant_user_id) DO UPDATE
          SET last_seen_at = EXCLUDED.last_seen_at, last_ip = COALESCE(EXCLUDED.last_ip, management_user_presence.last_ip), logged_out_at = NULL
        RETURNING 1
      )
      INSERT INTO management_user_activity_daily (activity_date, db_name, tenant_user_id)
      VALUES ((CURRENT_TIMESTAMP AT TIME ZONE ${PRESENCE_TIME_ZONE})::date, ${dbName}, ${userId})
      ON CONFLICT (activity_date, db_name, tenant_user_id) DO UPDATE
        SET last_seen_at = CURRENT_TIMESTAMP, pings = management_user_activity_daily.pings + 1
    `
  })().catch((error) => {
    lastWrite.delete(key)
    console.error("[user-presence] touch failed:", error)
  })
}

export function markLoggedOut(dbName: string, rawUserId: string) {
  const userId = Number(rawUserId)
  if (!dbName || !Number.isInteger(userId) || userId <= 0) return
  lastWrite.delete(presenceKey(dbName, userId))
  void (async () => {
    await ensureManagementTables()
    await managementSql`
      UPDATE management_user_presence SET logged_out_at = CURRENT_TIMESTAMP
      WHERE db_name = ${dbName} AND tenant_user_id = ${userId}
    `
  })().catch((error) => console.error("[user-presence] logout mark failed:", error))
}
