import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import {
  backupDatabase, backupRetentionDays, backupStorageConfigured, backupTargets, deleteBackup, ensureBackupTables, managementDbName,
  restoreBackup, runScheduledBackups,
} from "@/lib/backups"

// النسخ الاحتياطي (لوحة مدير المنصة فقط): القائمة، نسخ الآن (قاعدة أو الكل)، الاستعادة، الحذف.
async function admin() {
  const session = await getManagementSession()
  return session?.is_platform_admin ? session : null
}
const fail = (error: unknown, status = 500) => NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status })

export async function GET(request: NextRequest) {
  try {
    if (!(await admin())) return fail("لا تملك صلاحية الوصول لهذه الصفحة", 403)
    await ensureBackupTables()
    const dbName = String(request.nextUrl.searchParams.get("db_name") || "").trim()
    const [backups, restores, targets] = await Promise.all([
      managementSql`
        SELECT id, company_id, company_name, db_name, kind, status, size_bytes, error, created_by, started_at, finished_at
        FROM db_backups WHERE (${dbName} = '' OR db_name = ${dbName}) ORDER BY started_at DESC, id DESC LIMIT 1000
      `,
      managementSql`SELECT * FROM db_restore_jobs ORDER BY id DESC LIMIT 50`,
      backupTargets(),
    ])
    return NextResponse.json({
      backups, restores,
      targets: targets.map((target) => ({ db_name: target.dbName, company_id: target.companyId, company_name: target.companyName })),
      configured: backupStorageConfigured(),
      retention_days: backupRetentionDays(),
      management_db: managementDbName(),
    })
  } catch (error) {
    console.error("backups GET", error)
    return fail(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await admin()
    if (!session) return fail("لا تملك صلاحية الوصول لهذه الصفحة", 403)
    await ensureBackupTables()
    const data = await request.json().catch(() => ({}))
    const by = session.full_name || session.email
    const action = String(data.action || "")

    if (action === "backup") {
      const target = (await backupTargets()).find((item) => item.dbName === String(data.db_name || ""))
      if (!target) return fail("القاعدة غير موجودة", 404)
      // في الخلفية: الواجهة تُحدّث القائمة وترى الحالة running ← done/failed
      void backupDatabase(target, "manual", by).catch((error) => console.error("[backups] manual", target.dbName, error))
      return NextResponse.json({ started: true })
    }
    if (action === "backup_all") {
      void runScheduledBackups(by).catch((error) => console.error("[backups] all", error))
      return NextResponse.json({ started: true })
    }
    if (action === "restore") {
      const backup = (await managementSql`SELECT db_name FROM db_backups WHERE id = ${Number(data.backup_id) || 0}`)[0]
      if (!backup) return fail("النسخة غير موجودة", 404)
      // تأكيد مكتوب: اسم القاعدة نفسها
      if (String(data.confirm || "").trim() !== String(backup.db_name)) return fail("اكتب اسم القاعدة كما هو لتأكيد الاستعادة", 400)
      const restart = data.restart !== false && process.env.NODE_ENV === "production"
      // بعد الاستعادة تبقى ذاكرة الخادم المؤقتة (جداول ensure* المُنشأة لكل قاعدة) قديمة ⇐ إعادة تشغيل العملية؛
      // Render يعيد تشغيل الخدمة تلقائياً عند خروجها.
      const jobId = await restoreBackup(Number(data.backup_id), by, restart ? () => setTimeout(() => process.exit(0), 3000) : undefined)
      return NextResponse.json({ job_id: jobId })
    }
    if (action === "delete") {
      if (!(await deleteBackup(Number(data.backup_id) || 0))) return fail("النسخة غير موجودة", 404)
      return NextResponse.json({ success: true })
    }
    return fail("عملية غير معروفة", 400)
  } catch (error) {
    console.error("backups POST", error)
    return fail(error, 400)
  }
}
