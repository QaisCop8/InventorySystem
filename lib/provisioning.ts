import crypto from "crypto"
import managementSql, { ensureManagementTables } from "./management-db"
import { getPoolForDb } from "./database"

function generateDbName(): string {
  return `co_${crypto.randomBytes(4).toString("hex")}`
}

async function generateUniqueDbName(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateDbName()
    const existing = await managementSql`SELECT id FROM companies WHERE db_name = ${candidate}`
    if (existing.length === 0) return candidate
  }
  throw new Error("تعذّر توليد معرّف فريد لقاعدة بيانات الشركة")
}

// إنشاء قاعدة بيانات فارغة مخصَّصة للشركة، ثم فقط جدول user_settings كافٍ لزرع مستخدم "admin" —
// بقية الجداول (الفروع، الأقسام، الأصناف، تتبع أوامر العمل...) تُنشئ نفسها ذاتياً (CREATE TABLE IF
// NOT EXISTS) أول مرة يزور فيها المسؤول الجديد كل صفحة، تماماً كأي تنصيب جديد للنظام حالياً.
export async function provisionCompanyDatabase(company: { id: number; name: string; requestedByEmail: string; requestedByFullName: string; requestedByPasswordHash: string }, approvedByUserId: number) {
  await ensureManagementTables()

  const dbName = await generateUniqueDbName()

  // CREATE DATABASE يجب أن يُنفَّذ خارج أي معاملة (transaction) — استعلام مستقل عبر اتصال قاعدة
  // الإدارة (management)، وهو ما يوفّره sql.unsafe هنا بلا BEGIN/COMMIT محيطة.
  await managementSql.unsafe(`CREATE DATABASE "${dbName}"`)

  const tenantClient = getPoolForDb(dbName)

  await tenantClient.query(
    `CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(150),
      password_hash VARCHAR(255),
      full_name VARCHAR(150),
      role VARCHAR(50),
      department VARCHAR(100),
      organization_id INTEGER DEFAULT 1,
      permissions JSONB DEFAULT '{}',
      branch_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      language VARCHAR(10) DEFAULT 'ar',
      timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
      date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
      time_format VARCHAR(10) DEFAULT '24h',
      notifications_enabled BOOLEAN DEFAULT true,
      email_notifications BOOLEAN DEFAULT true,
      sms_notifications BOOLEAN DEFAULT false,
      theme_preference VARCHAR(20) DEFAULT 'slate',
      sidebar_collapsed BOOLEAN DEFAULT false,
      dashboard_layout JSONB,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  )

  await tenantClient.query(
    `INSERT INTO user_settings (
      user_id, username, email, password_hash, full_name, role, department,
      organization_id, permissions, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      "1",
      "admin",
      company.requestedByEmail,
      company.requestedByPasswordHash,
      company.requestedByFullName,
      "مدير النظام",
      "الإدارة",
      1,
      JSON.stringify(["جميع الصلاحيات"]),
      true,
    ],
  )

  await managementSql`
    UPDATE companies
    SET db_name = ${dbName}, status = 'approved', approved_by = ${approvedByUserId}, approved_at = CURRENT_TIMESTAMP
    WHERE id = ${company.id}
  `

  return { dbName }
}
