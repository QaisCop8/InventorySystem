import sql, { getPoolForDb } from "@/lib/database"

// دردشة داخلية بين مستخدمي نفس الشركة — العزل بين الشركات مضمون أصلاً عبر فصل قاعدة البيانات لكل تينانت.
// user_settings.user_id رقمي في بعض القواعد ونصّي في أخرى: كل المقارنات هنا ::text على الطرفين، والجداول الجديدة
// بلا FK (المفتاح الأجنبي كان يُفشل إنشاء الجدول في القواعد التي user_id فيها غير فريد/غير رقمي ⇒ "لا يوجد زملاء").
const ensuredTenants = new Map<string, Promise<void>>()

/** من فتح النظام خلال هذه المدة يُعرض "متصل" (الفقاعة تستطلع كل بضع ثوانٍ وتحدّث آخر ظهور). */
const ONLINE_WINDOW_SECONDS = 45

export function ensureChatTables(dbName: string): Promise<void> {
  let promise = ensuredTenants.get(dbName)
  if (!promise) {
    const client = getPoolForDb(dbName)
    promise = (async () => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          sender_id VARCHAR(50) NOT NULL,
          receiver_id VARCHAR(50) NOT NULL,
          body TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (sender_id, receiver_id, created_at)`, [])
      await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages (receiver_id, is_read)`, [])
      await client.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`, [])
      await client.query(`CREATE TABLE IF NOT EXISTS chat_presence (user_id VARCHAR(50) PRIMARY KEY, last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`, [])
    })().catch((error) => {
      ensuredTenants.delete(dbName)
      throw error
    })
    ensuredTenants.set(dbName, promise)
  }
  return promise
}

export interface ChatContact {
  user_id: string
  full_name: string
  username: string
  branch_name: string | null
  online: boolean
  last_seen_at: string | null
  last_message: string | null
  last_message_at: string | null
  last_message_from_me: boolean
  unread_count: number
}

export interface ChatMessage {
  id: number
  sender_id: string
  receiver_id: string
  body: string
  is_read: boolean
  created_at: string
}

export interface LatestUnreadMessage {
  id: number
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

const MESSAGE_COLUMNS = "id, sender_id::text AS sender_id, receiver_id::text AS receiver_id, body, is_read, created_at"

/** كل زملاء الشركة الفعّالين (غير المحذوفين/الموقوفين) مع آخر رسالة وعدد غير المقروء وحالة الاتصال. */
export async function getChatContacts(meId: string): Promise<ChatContact[]> {
  const me = String(meId)
  const rows = await sql`
    SELECT us.user_id::text AS user_id, COALESCE(NULLIF(us.full_name, ''), us.username, us.user_id::text) AS full_name, us.username,
           b.branch_name, p.last_seen_at,
           COALESCE(p.last_seen_at > CURRENT_TIMESTAMP - (${ONLINE_WINDOW_SECONDS} * INTERVAL '1 second'), false) AS online,
           lm.body AS last_message, lm.created_at AS last_message_at, lm.sender_id AS last_message_sender_id,
           COALESCE(uc.unread_count, 0)::int AS unread_count
    FROM user_settings us
    LEFT JOIN branches b ON b.id = us.branch_id
    LEFT JOIN chat_presence p ON p.user_id = us.user_id::text
    LEFT JOIN LATERAL (
      SELECT body, created_at, sender_id::text AS sender_id FROM chat_messages
      WHERE (sender_id::text = us.user_id::text AND receiver_id::text = ${me})
         OR (sender_id::text = ${me} AND receiver_id::text = us.user_id::text)
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) lm ON true
    LEFT JOIN (
      SELECT sender_id::text AS sender_id, COUNT(*) AS unread_count FROM chat_messages
      WHERE receiver_id::text = ${me} AND is_read = false GROUP BY sender_id::text
    ) uc ON uc.sender_id = us.user_id::text
    WHERE us.user_id::text <> ${me} AND COALESCE(us.is_deleted, false) = false AND COALESCE(us.is_active, true) = true
    ORDER BY lm.created_at DESC NULLS LAST, online DESC, full_name ASC`
  return rows.map((row: any) => ({
    user_id: String(row.user_id),
    full_name: row.full_name,
    username: row.username,
    branch_name: row.branch_name ?? null,
    online: Boolean(row.online),
    last_seen_at: row.last_seen_at ?? null,
    last_message: row.last_message,
    last_message_at: row.last_message_at,
    last_message_from_me: String(row.last_message_sender_id) === me,
    unread_count: Number(row.unread_count) || 0,
  }))
}

/** رسائل محادثة (آخر 200، أو الأحدث من afterId) — وفتحها يعلّم رسائل الطرف الآخر مقروءة. */
export async function getConversation(meId: string, withUserId: string, afterId: number | null): Promise<ChatMessage[]> {
  const me = String(meId), other = String(withUserId)
  const between = `((sender_id::text = $1 AND receiver_id::text = $2) OR (sender_id::text = $2 AND receiver_id::text = $1))`
  const rows: ChatMessage[] = afterId
    ? await sql.unsafe(`SELECT ${MESSAGE_COLUMNS} FROM chat_messages WHERE ${between} AND id > $3 ORDER BY id ASC`, [me, other, afterId])
    : (await sql.unsafe(`SELECT ${MESSAGE_COLUMNS} FROM chat_messages WHERE ${between} ORDER BY id DESC LIMIT 200`, [me, other])).reverse()
  await sql`UPDATE chat_messages SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE receiver_id::text = ${me} AND sender_id::text = ${other} AND is_read = false`
  return rows
}

/** آخر رسالة من رسائلي قرأها الطرف الآخر (لعلامة ✓✓ دون إعادة جلب المحادثة). */
export async function getLastReadOwnMessageId(meId: string, withUserId: string): Promise<number | null> {
  const rows = await sql`SELECT MAX(id) AS id FROM chat_messages WHERE sender_id::text = ${String(meId)} AND receiver_id::text = ${String(withUserId)} AND is_read = true`
  return rows[0]?.id ? Number(rows[0].id) : null
}

export async function sendChatMessage(meId: string, toUserId: string, body: string): Promise<ChatMessage | null> {
  const exists = await sql`
    SELECT 1 FROM user_settings WHERE user_id::text = ${String(toUserId)} AND COALESCE(is_deleted, false) = false AND COALESCE(is_active, true) = true LIMIT 1`
  if (!exists.length) return null
  const rows = await sql.unsafe(
    `INSERT INTO chat_messages (sender_id, receiver_id, body) VALUES ($1, $2, $3) RETURNING ${MESSAGE_COLUMNS}`,
    [String(meId), String(toUserId), body],
  )
  return rows[0] ?? null
}

/** نبضة الحضور (مع استطلاع غير المقروء) + الإجمالي + أحدث رسالة غير مقروءة للإشعار المنبثق. */
export async function chatHeartbeat(meId: string): Promise<{ count: number; latest: LatestUnreadMessage | null }> {
  const me = String(meId)
  const [, countRows, latestRows] = await Promise.all([
    sql`INSERT INTO chat_presence (user_id, last_seen_at) VALUES (${me}, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
    sql`SELECT COUNT(*)::int AS count FROM chat_messages WHERE receiver_id::text = ${me} AND is_read = false`,
    sql`
      SELECT cm.id, cm.sender_id::text AS sender_id, cm.body, cm.created_at, COALESCE(NULLIF(us.full_name, ''), us.username) AS sender_name
      FROM chat_messages cm JOIN user_settings us ON us.user_id::text = cm.sender_id::text
      WHERE cm.receiver_id::text = ${me} AND cm.is_read = false
      ORDER BY cm.created_at DESC, cm.id DESC LIMIT 1`,
  ])
  return { count: Number(countRows[0]?.count) || 0, latest: latestRows[0] ?? null }
}
