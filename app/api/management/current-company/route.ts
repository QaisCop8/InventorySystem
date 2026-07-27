import { NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET() {
  try {
    await ensureManagementTables()
    const dbName = await resolveCurrentDbName()
    const rows = await managementSql`SELECT id, name FROM companies WHERE db_name = ${dbName}`
    return NextResponse.json({ id: rows[0]?.id ?? null, name: rows[0]?.name ?? null })
  } catch (error) {
    console.error("[management/current-company] error:", error)
    return NextResponse.json({ name: null })
  }
}
