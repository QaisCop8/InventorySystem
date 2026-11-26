import { NextResponse, type NextRequest } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { ReminderError, calendarReminders, createReminder, deleteReminder, dueReminders, listReminders, pendingCount, reminderUsers, updateReminder } from "@/lib/reminders"

export const dynamic = "force-dynamic"

// التذكيرات الشخصية — كل الطلبات بهوية الجلسة (لا user_id من العميل):
// GET ?view=pending|done|sent · ?from=&to= (التقويم) · ?due=1 (الحالّة للنافذة المنبثقة + العدّاد) · ?count=1 · ?users=1
// POST {title, note, remind_at, repeat, assigned_to} · PATCH {id, action: done|snooze|reopen|edit, ...} · DELETE ?id=
async function sessionUserId(request: NextRequest) {
  const user = await getSessionUser(request)
  return user ? Number(user.user_id) : 0
}

function failure(error: unknown) {
  if (error instanceof ReminderError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("Reminders error:", error)
  return NextResponse.json({ error: "تعذر تنفيذ العملية على التذكيرات" }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const headers = { "Cache-Control": "no-store" }
    if (params.get("users") === "1") return NextResponse.json({ users: await reminderUsers(), me: userId }, { headers })
    if (params.get("due") === "1") {
      const [due, count] = await Promise.all([dueReminders(userId), pendingCount(userId)])
      return NextResponse.json({ due, count }, { headers })
    }
    if (params.get("from") && params.get("to")) return NextResponse.json({ reminders: await calendarReminders(userId, params.get("from")!, params.get("to")!) }, { headers })
    if (params.get("count") === "1") return NextResponse.json({ count: await pendingCount(userId) }, { headers })
    return NextResponse.json({ reminders: await listReminders(userId, params.get("view") || "pending") }, { headers })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const id = await createReminder(userId, await request.json())
    return NextResponse.json({ id })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json()
    await updateReminder(userId, Number(body?.id), body)
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await deleteReminder(userId, Number(request.nextUrl.searchParams.get("id")))
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(error) }
}
