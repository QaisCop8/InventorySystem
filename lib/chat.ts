import sql, { getPoolForDb } from "@/lib/database"

// دردشة داخلية بين مستخدمي نفس الشركة — العزل بين الشركات مضمون أصلاً عبر فصل قاعدة البيانات
// لكل تينانت (lib/database.ts)، فلا حاجة لعمود company_id هنا. يتبع نفس نمط المذاكرة لكل
// dbName المستخدم في lib/permissions.ts (وليس العلم الأحادي الخاطئ في ensureBranchColumn).
const ensuredTenants = new Map<string, Promise<void>>()

export function ensureChatTables(dbName: string): Promise<void> {
  let promise = ensuredTenants.get(dbName)
  if (!promise) {
    const client = getPoolForDb(dbName)
    promise = (async () => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          sender_id VARCHAR(255) NOT NULL,
          receiver_id VARCHAR(255) NOT NULL,
          body TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
      )
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
         ON chat_messages (sender_id, receiver_id, created_at)`,
        [],
      )
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
         ON chat_messages (receiver_id, is_read)`,
        [],
      )
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
  last_message: string | null
  last_message_at: string | null
  last_message_from_me: boolean
  unread_count: number
}

export async function getChatContacts(meId: string): Promise<ChatContact[]> {
  const rows = await sql`
    SELECT
      us.user_id,
      us.full_name,
      us.username,
      lm.body AS last_message,
      lm.created_at AS last_message_at,
      lm.sender_id AS last_message_sender_id,
      COALESCE(uc.unread_count, 0)::int AS unread_count
    FROM user_settings us
    LEFT JOIN LATERAL (
      SELECT body, created_at, sender_id
      FROM chat_messages
      WHERE (sender_id = us.user_id AND receiver_id = ${meId})
         OR (sender_id = ${meId} AND receiver_id = us.user_id)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN (
      SELECT sender_id, COUNT(*) AS unread_count
      FROM chat_messages
      WHERE receiver_id = ${meId} AND is_read = false
      GROUP BY sender_id
    ) uc ON uc.sender_id = us.user_id
    WHERE us.user_id != ${meId} AND us.is_active = true
    ORDER BY lm.created_at DESC NULLS LAST, us.full_name ASC
  `
  return rows.map((r: any) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    username: r.username,
    last_message: r.last_message,
    last_message_at: r.last_message_at,
    last_message_from_me: r.last_message_sender_id === meId,
    unread_count: r.unread_count,
  }))
}

export async function getUnreadChatCount(meId: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM chat_messages WHERE receiver_id = ${meId} AND is_read = false
  `
  return rows[0]?.count ?? 0
}

export interface LatestUnreadMessage {
  id: number
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

export async function getLatestUnreadMessage(meId: string): Promise<LatestUnreadMessage | null> {
  const rows = await sql`
    SELECT cm.id, cm.sender_id, cm.body, cm.created_at, us.full_name AS sender_name
    FROM chat_messages cm
    JOIN user_settings us ON us.user_id = cm.sender_id
    WHERE cm.receiver_id = ${meId} AND cm.is_read = false
    ORDER BY cm.created_at DESC, cm.id DESC
    LIMIT 1
  `
  return rows[0] ?? null
}
