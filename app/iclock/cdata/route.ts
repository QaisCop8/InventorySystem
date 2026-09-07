import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureHrSchema } from "@/lib/hr-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const textResponse = (body: string, status = 200) => new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
const value = (row: Record<string, string>, ...keys: string[]) => keys.map(key => row[key]).find(item => item !== undefined && item !== "") || ""

const parseRecords = (body: string) => {
  const trimmed = body.trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) return JSON.parse(trimmed)
  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.map(line => {
    if (line.includes("\t")) {
      const [pin, punchTime, status, verify, workCode] = line.split("\t")
      return { employee_code: pin, device_user_id: pin, punch_time: punchTime, punch_type: status, verification_type: verify, work_code: workCode }
    }
    const params = new URLSearchParams(line)
    return Object.fromEntries(params.entries())
  })
}

const normalizeTime = (value: string) => value.replace("T", " ").replace(/Z$/, "")

export async function GET(request: NextRequest) {
  await ensureHrSchema()
  const serial = request.nextUrl.searchParams.get("SN") || request.nextUrl.searchParams.get("sn") || ""
  const device = serial ? (await sql`SELECT id FROM attendance_devices_tbl WHERE serial_number=${serial} AND is_active=true LIMIT 1`)[0] : null
  if (serial && !device) return textResponse("ERROR: Invalid device", 404)
  return textResponse("GET OPTION FROM: SN=\nStamp=0\nOpStamp=0\nErrorDelay=60\nDelay=30\nTransTimes=00:00;14:00\nTransInterval=1\nTransFlag=1000\nRealtime=1\nEncrypt=0\n")
}

export async function POST(request: NextRequest) {
  await ensureHrSchema()
  const serial = request.nextUrl.searchParams.get("SN") || request.nextUrl.searchParams.get("sn") || ""
  if (!serial) return textResponse("ERROR: SN is required", 400)
  const device = (await sql`SELECT id,jsonb_build_object('entry','I','exit','O','overtime_entry','OI','overtime_exit','OO') || COALESCE((SELECT jsonb_object_agg(symbol_key,symbol_value) FROM attendance_device_symbols_tbl WHERE device_id=attendance_devices_tbl.id),'{}'::jsonb) symbols FROM attendance_devices_tbl WHERE serial_number=${serial} AND is_active=true LIMIT 1`)[0]
  if (!device) return textResponse("ERROR: Invalid device", 404)
  const records = parseRecords(await request.text())
  let count = 0
  for (const record of records) {
    const employeeCode = String(value(record, "employee_code", "PIN", "pin", "user_id", "userid")).trim()
    const punchTime = normalizeTime(String(value(record, "punch_time", "DateTime", "datetime", "timestamp", "time")))
    if (!employeeCode || !punchTime) continue
    const employee = (await sql`SELECT id FROM employees_tbl WHERE employee_code=${employeeCode} OR device_user_id=${employeeCode} LIMIT 1`)[0]
    const rawType = value(record, "punch_type", "Status", "status") || "unknown"
    const symbols = device.symbols || {}
    const punchType = rawType === symbols.entry ? "in" : rawType === symbols.exit ? "out" : rawType === symbols.overtime_entry ? "overtime_in" : rawType === symbols.overtime_exit ? "overtime_out" : rawType
    await sql`INSERT INTO attendance_logs_tbl(device_id,employee_id,employee_code,device_user_id,punch_time,punch_type,verification_type,sync_status,raw_payload) VALUES(${device.id},${employee?.id || null},${employeeCode},${value(record, "device_user_id", "PIN", "pin") || employeeCode},${punchTime}::timestamp,${punchType},${value(record, "verification_type", "Verify", "verify") || "device"},'adms',${JSON.stringify({ ...record, raw_punch_type: rawType })}::jsonb) ON CONFLICT(device_id,device_user_id,punch_time) DO UPDATE SET employee_id=EXCLUDED.employee_id,punch_type=EXCLUDED.punch_type,verification_type=EXCLUDED.verification_type,sync_status='adms',raw_payload=EXCLUDED.raw_payload`
    count++
  }
  await sql`UPDATE attendance_devices_tbl SET last_sync_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=${device.id}`
  return textResponse(`OK: ${count}`)
}
