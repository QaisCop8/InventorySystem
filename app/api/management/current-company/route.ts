import { NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { getManagementSession } from "@/lib/management-auth"

export async function GET() {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ id: null, name: null }, { status: 401 })

    const dbName = await resolveCurrentDbName()
    const rows = await managementSql`
      SELECT c.id, c.name
      FROM companies c
      JOIN user_company uc ON uc.company_id = c.id
      WHERE c.db_name = ${dbName}
        AND uc.user_id = ${session.id}
        AND COALESCE(uc.is_active, true) = true
      LIMIT 1
    `
    return NextResponse.json({ id: rows[0]?.id ?? null, name: rows[0]?.name ?? null })
  } catch (error) {
    console.error("[management/current-company] error:", error)
    return NextResponse.json({ name: null })
  }
}
