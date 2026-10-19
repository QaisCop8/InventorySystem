import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

async function ensureRequestTable() {
  await ensureManagementTables()
  await managementSql`CREATE TABLE IF NOT EXISTS feature_requests (
    id BIGSERIAL PRIMARY KEY, company_id INTEGER, db_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(200) NOT NULL DEFAULT '', submitted_by VARCHAR(120) NOT NULL,
    submitted_by_name VARCHAR(200) NOT NULL DEFAULT '', request_type VARCHAR(40) NOT NULL,
    screen_name VARCHAR(200) NOT NULL, details TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(40) NOT NULL DEFAULT 'جديد',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
}

export async function GET() {
  const session = await getManagementSession()
  if (!session?.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 })
  try {
    await ensureRequestTable()
    const rows = await managementSql`SELECT id, company_id, db_name, company_name, submitted_by, submitted_by_name, request_type, screen_name, details,
      COALESCE((SELECT json_agg(json_build_object('name', attachment->>'name')) FROM jsonb_array_elements(feature_requests.attachments) AS files(attachment)), '[]'::json) AS attachments,
      status, created_at, updated_at
      FROM feature_requests ORDER BY created_at DESC LIMIT 1000`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management feature-requests GET]", error)
    return NextResponse.json({ error: "تعذر تحميل الرسائل" }, { status: 500 })
  }
}
