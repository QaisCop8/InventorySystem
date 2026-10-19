import { NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

const ensureRequestTable = async () => {
  await ensureManagementTables()
  await managementSql`CREATE TABLE IF NOT EXISTS feature_requests (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER,
    db_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(200) NOT NULL DEFAULT '',
    submitted_by VARCHAR(120) NOT NULL,
    submitted_by_name VARCHAR(200) NOT NULL DEFAULT '',
    request_type VARCHAR(40) NOT NULL,
    screen_name VARCHAR(200) NOT NULL,
    details TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'جديد',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
  await managementSql`CREATE INDEX IF NOT EXISTS feature_requests_db_created_idx ON feature_requests(db_name, created_at DESC)`
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    await ensureRequestTable()
    const dbName = await resolveCurrentDbName()
    const rows = await managementSql`SELECT id, company_name, submitted_by_name, request_type, screen_name, details,
      COALESCE((SELECT json_agg(json_build_object('name', attachment->>'name')) FROM jsonb_array_elements(feature_requests.attachments) AS files(attachment)), '[]'::json) AS attachments,
      status, created_at, updated_at FROM feature_requests WHERE db_name=${dbName} ORDER BY created_at DESC LIMIT 500`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[feature-requests GET]", error)
    return NextResponse.json({ error: "تعذر تحميل الرسائل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    const body = await request.json()
    const requestType = String(body.request_type || "").trim()
    const screenName = String(body.screen_name || "").trim()
    const details = String(body.details || "").trim()
    const validTypes = ["مشكلة", "تعديل", "تطوير جديد"]
    if (!validTypes.includes(requestType)) return NextResponse.json({ error: "اختر نوع الرسالة" }, { status: 400 })
    if (!screenName || screenName.length > 200) return NextResponse.json({ error: "اختر الشاشة" }, { status: 400 })
    if (details.length < 5 || details.length > 10000) return NextResponse.json({ error: "اكتب التفاصيل (5 إلى 10000 حرف)" }, { status: 400 })
    const attachments = Array.isArray(body.attachments) ? body.attachments : []
    if (attachments.length > 8 || attachments.some((file: any) => !file || typeof file.name !== "string" || file.name.length > 200 || !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(String(file.data || "")) || String(file.data).length > 7_000_000)) {
      return NextResponse.json({ error: "المرفقات المسموحة صور PNG/JPG/WebP أو PDF، بحد أقصى 8 ملفات وحجم 5MB للملف" }, { status: 400 })
    }
    await ensureRequestTable()
    const dbName = await resolveCurrentDbName()
    const company = (await managementSql`SELECT id, name FROM companies WHERE db_name=${dbName} LIMIT 1`)[0]
    const rows = await managementSql`INSERT INTO feature_requests (company_id, db_name, company_name, submitted_by, submitted_by_name, request_type, screen_name, details, attachments)
      VALUES (${company?.id ?? null}, ${dbName}, ${company?.name || dbName}, ${user.user_id}, ${user.full_name || user.username}, ${requestType}, ${screenName}, ${details}, ${JSON.stringify(attachments)}::jsonb)
      RETURNING id, company_name, submitted_by_name, request_type, screen_name, details, attachments, status, created_at, updated_at`
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error) {
    console.error("[feature-requests POST]", error)
    return NextResponse.json({ error: "تعذر إرسال الرسالة" }, { status: 500 })
  }
}
