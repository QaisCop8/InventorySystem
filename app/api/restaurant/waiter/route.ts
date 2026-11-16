import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeRestaurant, ensureRestaurantTables, errorStatus, restaurantPermissionsFor } from "@/lib/restaurant"
import { endWaiterSession, hasWaiterPin, setWaiterPin, startWaiterSession, WAITER_HEADER } from "@/lib/restaurant-waiters"

// النادل: رمز PIN الشخصي، تبديل المستخدم على الجهاز المشترك، وقائمة النوادل لتحويل الطاولة.
//   GET                      ⇐ هل للمستخدم الفعلي رمز PIN + النادل المبدَّل إليه حالياً
//   GET ?list=waiters        ⇐ المستخدمون الذين يدخلون شاشة المطعم على الفرع (لتحويل الطاولة)
//   POST {action:"set_pin", pin}      ⇐ يعيّن رمز المستخدم الفعلي لنفسه (pin فارغ = حذف)
//   POST {action:"switch", pin}       ⇐ يُصدر رمز عمل للنادل صاحب الرمز (يُرسل لاحقاً بالترويسة x-restaurant-waiter)
//   POST {action:"end"}               ⇐ ينهي جلسة النادل على الجهاز (قفل)

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRestaurant(request, [])
    if (!auth.ok) return auth.response
    if (request.nextUrl.searchParams.get("list") === "waiters") {
      const users = (await sql`
        SELECT us.user_id::text AS id, COALESCE(NULLIF(us.full_name, ''), us.username) AS name, jr.name AS role_name
        FROM user_settings us LEFT JOIN job_roles jr ON jr.id = us.job_role_id
        WHERE COALESCE(us.is_active, true)
          AND (NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id::text = us.user_id::text)
               OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id::text = us.user_id::text AND ub.branch_id = ${auth.branchId}))
        ORDER BY 2
      `) as any[]
      const allowed = []
      for (const user of users) if ((await restaurantPermissionsFor(user.id, auth.branchId)).access) allowed.push(user)
      return NextResponse.json({ waiters: allowed })
    }
    const name = (await sql`SELECT COALESCE(NULLIF(full_name, ''), username) AS name FROM user_settings WHERE user_id::text = ${auth.userId} LIMIT 1`)[0] as any
    return NextResponse.json({
      user: { id: auth.userId, name: String(name?.name || auth.userId) },
      switched: auth.userId !== auth.deviceUserId,
      has_pin: await hasWaiterPin(auth.userId),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر التحميل" }, { status: errorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureRestaurantTables()
    const data = await request.json().catch(() => ({}))
    const action = String(data?.action || "")
    if (action === "end") {
      await endWaiterSession(String(request.headers.get(WAITER_HEADER) || data?.token || ""))
      return NextResponse.json({ ok: true })
    }
    if (action === "switch") {
      const result = await startWaiterSession(String(sessionUser.user_id), String(data?.pin || "").trim())
      // صلاحية الدخول لشاشة المطعم للنادل على فرع الجهاز النشط
      const branchId = Number(request.headers.get("x-branch-id")) || Number((await sql`SELECT branch_id FROM user_settings WHERE user_id::text = ${result.user.id} LIMIT 1`)[0]?.branch_id) || 0
      if (branchId && !(await restaurantPermissionsFor(result.user.id, branchId)).access) {
        await endWaiterSession(result.token)
        return NextResponse.json({ error: `${result.user.name}: لا توجد صلاحية الدخول لشاشة المطعم على هذا الفرع` }, { status: 403 })
      }
      return NextResponse.json(result)
    }
    if (action === "set_pin") {
      // الرمز لنفس المستخدم الفعلي (النادل المبدَّل إليه أو مستخدم الجهاز) — لا يعيّن أحد رمز غيره من هنا
      const auth = await authorizeRestaurant(request, [])
      if (!auth.ok) return auth.response
      const pin = String(data?.pin ?? "").trim()
      await setWaiterPin(auth.userId, pin ? pin : null)
      return NextResponse.json({ ok: true, has_pin: Boolean(pin) })
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500) console.error("restaurant waiter POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status })
  }
}
