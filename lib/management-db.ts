import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { withDatabaseName } from "./db-url"

const MANAGEMENT_DB_NAME = "management"

function buildSqlClient(connectionUrl: string) {
  if (connectionUrl.includes("localhost") || connectionUrl.includes("127.0.0.1")) {
    const pool = new Pool({ connectionString: connectionUrl })
    const client: any = async (strings: TemplateStringsArray, ...values: any[]) => {
      const conn = await pool.connect()
      try {
        const query = strings.reduce((prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""), "")
        const result = await conn.query(query, values)
        return result.rows
      } finally {
        conn.release()
      }
    }
    // استعلام نصّي خام (بلا قالب) — تحتاجه lib/provisioning.ts لتنفيذ CREATE DATABASE، وهي عبارة
    // DDL لا يمكن تمرير اسمها كمعامل $1 مربوط عادي.
    client.unsafe = async (text: string, params: any[] = []) => {
      const conn = await pool.connect()
      try {
        const result = await conn.query(text, params)
        return result.rows
      } finally {
        conn.release()
      }
    }
    return client
  }
  return neon(connectionUrl)
}

const baseUrl = process.env.DATABASE_URL || ""
const managementUrl = baseUrl ? withDatabaseName(baseUrl, MANAGEMENT_DB_NAME) : ""

// اتصال ثابت بقاعدة "الإدارة" (management) — على عكس sql الافتراضي في lib/database.ts، هذا الاتصال
// لا يتبدّل أبداً بحسب الشركة/الجلسة الحالية؛ يبقى دوماً نفس قاعدة الإدارة بصرف النظر عن أي كوكي
// tenant_db مضبوط، لأنها تخزّن حسابات المستخدمين والشركات نفسها لا بيانات شركة بعينها.
const sql: any = managementUrl ? buildSqlClient(managementUrl) : null

export default sql

let managementDbEnsured: Promise<void> | null = null

// تُنشئ قاعدة "management" نفسها إن لم تكن موجودة بعد (بالاتصال بقاعدة inventory_system الأساسية
// المؤكَّد وجودها دوماً، إذ لا يمكن الاتصال بقاعدة غير موجودة أصلاً لإنشائها)، ثم تُنشئ جداولها.
async function ensureManagementDatabaseExists() {
  if (!baseUrl) return
  const pool = new Pool({ connectionString: baseUrl })
  try {
    const existing = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [MANAGEMENT_DB_NAME])
    if (existing.rows.length === 0) {
      await pool.query(`CREATE DATABASE "${MANAGEMENT_DB_NAME}"`)
    }
  } finally {
    await pool.end()
  }
}

export function ensureManagementTables(): Promise<void> {
  if (!managementDbEnsured) {
    managementDbEnsured = (async () => {
      await ensureManagementDatabaseExists()
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(150) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email_verified BOOLEAN DEFAULT false,
          email_verification_token VARCHAR(255),
          is_platform_admin BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS companies (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          db_name VARCHAR(100) UNIQUE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_by INTEGER REFERENCES users(id),
          approved_by INTEGER REFERENCES users(id),
          approved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS user_company (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          company_id INTEGER REFERENCES companies(id),
          role VARCHAR(20) DEFAULT 'owner',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, company_id)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS management_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
    })().catch((error) => {
      managementDbEnsured = null
      throw error
    })
  }
  return managementDbEnsured
}
