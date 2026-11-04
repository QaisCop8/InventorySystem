import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { ONLINE_WINDOW_MINUTES, PRESENCE_TIME_ZONE } from "@/lib/user-presence"

// «سجل الدخول للموقع»: من متصل الآن ومن غير نشط (management_user_presence) + الزيارات اليومية
// (عمليات الدخول من management_login_audit والمستخدمون النشطون من management_user_activity_daily).

const validDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

export async function GET(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session?.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const rawCompanyId = Number(params.get("company_id"))
    const companyId = Number.isInteger(rawCompanyId) && rawCompanyId > 0 ? rawCompanyId : null
    const tz = PRESENCE_TIME_ZONE
    const onlineWindow = `${ONLINE_WINDOW_MINUTES} minutes`

    // الفترة الافتراضية آخر 30 يوماً بتوقيت فلسطين؛ لا تتجاوز سنة
    const [range] = await managementSql`
      WITH input AS (
        SELECT COALESCE(${validDate(params.get("to"))}::date, (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date) AS to_date
      )
      SELECT to_date::text AS to_date,
             GREATEST(COALESCE(${validDate(params.get("from"))}::date, to_date - 29), to_date - 365)::text AS from_date,
             (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date::text AS today
      FROM input
    `
    const fromDate: string = range.from_date
    const toDate: string = range.to_date

    const companyDb = companyId
      ? ((await managementSql`SELECT db_name FROM companies WHERE id = ${companyId}`)[0]?.db_name ?? "__none__")
      : null

    const [users, daily, summaryRows] = await Promise.all([
      managementSql`
        WITH known AS (
          SELECT db_name, tenant_user_id FROM management_user_presence
          UNION
          SELECT db_name, tenant_user_id FROM management_login_audit WHERE tenant_user_id IS NOT NULL AND db_name IS NOT NULL
        ),
        last_login AS (
          SELECT DISTINCT ON (db_name, tenant_user_id) db_name, tenant_user_id, user_email, user_name, logged_at, ip_address
          FROM management_login_audit
          WHERE tenant_user_id IS NOT NULL AND db_name IS NOT NULL
          ORDER BY db_name, tenant_user_id, logged_at DESC, id DESC
        ),
        range_logins AS (
          SELECT db_name, tenant_user_id, COUNT(*)::int AS logins
          FROM management_login_audit
          WHERE tenant_user_id IS NOT NULL
            AND (logged_at AT TIME ZONE ${tz})::date BETWEEN ${fromDate}::date AND ${toDate}::date
          GROUP BY db_name, tenant_user_id
        ),
        range_days AS (
          SELECT db_name, tenant_user_id, COUNT(*)::int AS active_days
          FROM management_user_activity_daily
          WHERE activity_date BETWEEN ${fromDate}::date AND ${toDate}::date
          GROUP BY db_name, tenant_user_id
        )
        SELECT k.db_name, k.tenant_user_id, c.id AS company_id, c.name AS company_name,
               l.user_email, l.user_name, l.logged_at AS last_login_at,
               p.last_seen_at, p.logged_out_at, COALESCE(p.last_ip, l.ip_address) AS ip_address,
               COALESCE(p.last_seen_at >= CURRENT_TIMESTAMP - ${onlineWindow}::interval AND p.logged_out_at IS NULL, false) AS is_online,
               COALESCE(r.logins, 0) AS logins_in_range, COALESCE(d.active_days, 0) AS active_days
        FROM known k
        LEFT JOIN management_user_presence p ON p.db_name = k.db_name AND p.tenant_user_id = k.tenant_user_id
        LEFT JOIN last_login l ON l.db_name = k.db_name AND l.tenant_user_id = k.tenant_user_id
        LEFT JOIN range_logins r ON r.db_name = k.db_name AND r.tenant_user_id = k.tenant_user_id
        LEFT JOIN range_days d ON d.db_name = k.db_name AND d.tenant_user_id = k.tenant_user_id
        LEFT JOIN companies c ON c.db_name = k.db_name
        WHERE (${companyDb}::text IS NULL OR k.db_name = ${companyDb})
        ORDER BY is_online DESC, GREATEST(p.last_seen_at, l.logged_at) DESC NULLS LAST
        LIMIT 1000
      `,
      managementSql`
        WITH days AS (
          SELECT generate_series(${fromDate}::date, ${toDate}::date, INTERVAL '1 day')::date AS day
        ),
        logins AS (
          SELECT (logged_at AT TIME ZONE ${tz})::date AS day, COUNT(*)::int AS visits, COUNT(DISTINCT LOWER(user_email))::int AS visitors
          FROM management_login_audit
          WHERE (logged_at AT TIME ZONE ${tz})::date BETWEEN ${fromDate}::date AND ${toDate}::date
            AND (${companyDb}::text IS NULL OR db_name = ${companyDb})
          GROUP BY 1
        ),
        active AS (
          SELECT activity_date AS day, COUNT(*)::int AS active_users
          FROM management_user_activity_daily
          WHERE activity_date BETWEEN ${fromDate}::date AND ${toDate}::date
            AND (${companyDb}::text IS NULL OR db_name = ${companyDb})
          GROUP BY 1
        )
        SELECT days.day::text AS day, COALESCE(logins.visits, 0) AS visits,
               COALESCE(logins.visitors, 0) AS visitors, COALESCE(active.active_users, 0) AS active_users
        FROM days
        LEFT JOIN logins ON logins.day = days.day
        LEFT JOIN active ON active.day = days.day
        ORDER BY days.day DESC
      `,
      managementSql`
        SELECT
          (SELECT COUNT(*)::int FROM management_user_presence
            WHERE last_seen_at >= CURRENT_TIMESTAMP - ${onlineWindow}::interval AND logged_out_at IS NULL
              AND (${companyDb}::text IS NULL OR db_name = ${companyDb})) AS online_now,
          (SELECT COUNT(*)::int FROM management_user_activity_daily
            WHERE activity_date = (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date
              AND (${companyDb}::text IS NULL OR db_name = ${companyDb})) AS active_today,
          (SELECT COUNT(*)::int FROM management_login_audit
            WHERE (logged_at AT TIME ZONE ${tz})::date = (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date
              AND (${companyDb}::text IS NULL OR db_name = ${companyDb})) AS visits_today
      `,
    ])

    return NextResponse.json({
      from: fromDate,
      to: toDate,
      today: range.today,
      online_window_minutes: ONLINE_WINDOW_MINUTES,
      summary: { ...summaryRows[0], known_users: users.length },
      users,
      daily,
    })
  } catch (error) {
    console.error("[management/admin/site-activity GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب سجل الدخول للموقع" }, { status: 500 })
  }
}
