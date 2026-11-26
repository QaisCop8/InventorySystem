import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// التذكيرات الشخصية (2026-11-26): يكتبها أي مستخدم لنفسه أو لمستخدم آخر، بموعد وتكرار اختياري.
// عند حلول الموعد: نافذة منبثقة (components/reminders/reminders-button.tsx يسأل كل دقيقة) + إشعار في الجرس مرة واحدة.
// «تم» يغلق التذكير — أو ينقله للموعد التالي إن كان متكرراً. «تأجيل» يضبط snoozed_until فقط.

export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly"
export const REMINDER_REPEATS: ReminderRepeat[] = ["none", "daily", "weekly", "monthly"]

export type Reminder = {
  id: number; title: string; note: string; remind_at: string; repeat: ReminderRepeat; status: "pending" | "done" | "cancelled"
  snoozed_until: string | null; due_at: string; created_by: number; created_by_name: string; assigned_to: number; assigned_to_name: string
  done_at: string | null; created_at: string
}

export class ReminderError extends Error { constructor(message: string, public status = 400) { super(message) } }

export function ensureRemindersTable() {
  return runSchemaOnce("lib/reminders.ts#ensureRemindersTable", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS reminders_tbl (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        remind_at TIMESTAMPTZ NOT NULL,
        repeat VARCHAR(10) NOT NULL DEFAULT 'none',
        status VARCHAR(10) NOT NULL DEFAULT 'pending',
        snoozed_until TIMESTAMPTZ,
        notified_at TIMESTAMPTZ,
        created_by INTEGER NOT NULL,
        assigned_to INTEGER NOT NULL,
        done_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await sql`CREATE INDEX IF NOT EXISTS reminders_assigned_due_idx ON reminders_tbl (assigned_to, status, remind_at)`
  })
}

// أعمدة ثابتة (نص بلا مدخلات) — تُدرج بـ sql.unsafe بدل تداخل قوالب sql
const COLUMNS = `r.id, r.title, r.note, r.remind_at, r.repeat, r.status, r.snoozed_until, COALESCE(r.snoozed_until, r.remind_at) AS due_at,
    r.created_by, COALESCE(NULLIF(c.full_name, ''), c.username, '') AS created_by_name,
    r.assigned_to, COALESCE(NULLIF(a.full_name, ''), a.username, '') AS assigned_to_name, r.done_at, r.created_at
  FROM reminders_tbl r
  LEFT JOIN user_settings c ON c.user_id = r.created_by
  LEFT JOIN user_settings a ON a.user_id = r.assigned_to`

/** تذكيراتي (المسندة لي أو التي كتبتها لغيري): view = pending | done | sent */
export async function listReminders(userId: number, view: string) {
  await ensureRemindersTable()
  const rows = view === "done"
    ? await sql`SELECT ${sql.unsafe(COLUMNS)} WHERE r.assigned_to = ${userId} AND r.status = 'done' ORDER BY r.done_at DESC NULLS LAST LIMIT 100`
    : view === "sent"
      ? await sql`SELECT ${sql.unsafe(COLUMNS)} WHERE r.created_by = ${userId} AND r.assigned_to <> ${userId} AND r.status <> 'cancelled' ORDER BY COALESCE(r.snoozed_until, r.remind_at) DESC LIMIT 100`
      : await sql`SELECT ${sql.unsafe(COLUMNS)} WHERE r.assigned_to = ${userId} AND r.status = 'pending' ORDER BY COALESCE(r.snoozed_until, r.remind_at)`
  return rows as unknown as Reminder[]
}

/** الحالّة الآن (للنافذة المنبثقة) — وأول مرة تحلّ: إشعار في الجرس */
export async function dueReminders(userId: number) {
  await ensureRemindersTable()
  const rows = (await sql`SELECT ${sql.unsafe(COLUMNS)} WHERE r.assigned_to = ${userId} AND r.status = 'pending' AND COALESCE(r.snoozed_until, r.remind_at) <= NOW() ORDER BY COALESCE(r.snoozed_until, r.remind_at)`) as unknown as Reminder[]
  const fresh = (await sql`
    UPDATE reminders_tbl SET notified_at = NOW()
    WHERE assigned_to = ${userId} AND status = 'pending' AND notified_at IS NULL AND remind_at <= NOW()
    RETURNING id, title, note`) as any[]
  for (const reminder of fresh) {
    try {
      await sql`
        INSERT INTO notifications (notification_type, title, message, recipient_user_id, priority_level)
        VALUES ('reminder', ${`⏰ ${reminder.title}`}, ${reminder.note || reminder.title}, ${userId}, 'high')`
    } catch { /* جدول الإشعارات غير موجود بهذه الشركة — النافذة المنبثقة تكفي */ }
  }
  return rows
}

export async function pendingCount(userId: number) {
  await ensureRemindersTable()
  const [row] = (await sql`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE COALESCE(snoozed_until, remind_at) <= NOW())::int AS due
    FROM reminders_tbl WHERE assigned_to = ${userId} AND status = 'pending'`) as any[]
  return { total: Number(row?.total || 0), due: Number(row?.due || 0) }
}

function cleanInput(body: any) {
  const title = String(body?.title || "").trim().slice(0, 200)
  if (!title) throw new ReminderError("اكتب عنوان التذكير")
  const at = new Date(String(body?.remind_at || ""))
  if (Number.isNaN(at.getTime())) throw new ReminderError("موعد التذكير غير صالح")
  const repeat = REMINDER_REPEATS.includes(body?.repeat) ? body.repeat as ReminderRepeat : "none"
  return { title, note: String(body?.note || "").trim().slice(0, 2000), remindAt: at.toISOString(), repeat }
}

async function assertUser(userId: number) {
  const rows = (await sql`SELECT 1 FROM user_settings WHERE user_id = ${userId} AND COALESCE(is_active, true)`) as any[]
  if (!rows.length) throw new ReminderError("المستخدم المسند إليه غير موجود")
}

export async function createReminder(userId: number, body: any) {
  await ensureRemindersTable()
  const input = cleanInput(body)
  const assignedTo = Number(body?.assigned_to) > 0 ? Number(body.assigned_to) : userId
  if (assignedTo !== userId) await assertUser(assignedTo)
  const [row] = (await sql`
    INSERT INTO reminders_tbl (title, note, remind_at, repeat, created_by, assigned_to)
    VALUES (${input.title}, ${input.note}, ${input.remindAt}, ${input.repeat}, ${userId}, ${assignedTo}) RETURNING id`) as any[]
  return Number(row.id)
}

async function loadOwned(userId: number, id: number) {
  const [row] = (await sql`SELECT * FROM reminders_tbl WHERE id = ${id}`) as any[]
  if (!row) throw new ReminderError("التذكير غير موجود", 404)
  if (Number(row.assigned_to) !== userId && Number(row.created_by) !== userId) throw new ReminderError("لا يمكنك تعديل هذا التذكير", 403)
  return row
}

/** الموعد التالي لتذكير متكرر — بعد الآن (يتخطى ما فات إن غاب المستخدم أياماً) */
function nextOccurrence(from: Date, repeat: ReminderRepeat) {
  const next = new Date(from)
  const step = () => {
    if (repeat === "daily") next.setDate(next.getDate() + 1)
    else if (repeat === "weekly") next.setDate(next.getDate() + 7)
    else next.setMonth(next.getMonth() + 1)
  }
  const now = Date.now()
  do step(); while (next.getTime() <= now)
  return next
}

export async function updateReminder(userId: number, id: number, body: any) {
  await ensureRemindersTable()
  const row = await loadOwned(userId, id)
  const action = String(body?.action || "")
  if (action === "done") {
    if (row.repeat !== "none") {
      const next = nextOccurrence(new Date(row.remind_at), row.repeat)
      await sql`UPDATE reminders_tbl SET remind_at = ${next.toISOString()}, snoozed_until = NULL, notified_at = NULL WHERE id = ${id}`
    } else await sql`UPDATE reminders_tbl SET status = 'done', done_at = NOW(), snoozed_until = NULL WHERE id = ${id}`
  } else if (action === "snooze") {
    const minutes = Math.min(Math.max(Number(body?.minutes) || 10, 1), 60 * 24 * 30)
    await sql`UPDATE reminders_tbl SET snoozed_until = NOW() + (${minutes} * INTERVAL '1 minute') WHERE id = ${id}`
  } else if (action === "reopen") {
    await sql`UPDATE reminders_tbl SET status = 'pending', done_at = NULL, snoozed_until = NULL, notified_at = NULL WHERE id = ${id}`
  } else if (action === "edit") {
    const input = cleanInput(body)
    const assignedTo = Number(body?.assigned_to) > 0 ? Number(body.assigned_to) : Number(row.assigned_to)
    if (assignedTo !== userId && assignedTo !== Number(row.assigned_to)) await assertUser(assignedTo)
    await sql`
      UPDATE reminders_tbl SET title = ${input.title}, note = ${input.note}, remind_at = ${input.remindAt}, repeat = ${input.repeat},
        assigned_to = ${assignedTo}, snoozed_until = NULL, notified_at = NULL WHERE id = ${id}`
  } else throw new ReminderError("إجراء غير معروف")
}

export async function deleteReminder(userId: number, id: number) {
  await ensureRemindersTable()
  await loadOwned(userId, id)
  await sql`DELETE FROM reminders_tbl WHERE id = ${id}`
}

export async function reminderUsers() {
  return (await sql`
    SELECT user_id AS id, COALESCE(NULLIF(full_name, ''), username) AS name FROM user_settings
    WHERE COALESCE(is_active, true) ORDER BY 2`) as unknown as { id: number; name: string }[]
}
