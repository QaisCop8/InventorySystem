import { NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import managementSql from "@/lib/management-db"
import { ensureLicenseTables } from "@/lib/company-license"
import { COMPANY_MODULES, isCompanyModule, type CompanyModule } from "@/lib/company-modules-shared"

// الوحدات المفعّلة لشركة الجلسة (أو لقاعدة محددة) من قاعدة الإدارة — شركة بلا صف بقاعدة الإدارة: لا وحدات.

export async function enabledModulesForDb(dbName: string): Promise<CompanyModule[]> {
  await ensureLicenseTables()
  const row = (await managementSql`SELECT COALESCE(enabled_modules, '{}') AS modules FROM companies WHERE db_name = ${dbName} LIMIT 1`)[0] as any
  return (Array.isArray(row?.modules) ? row.modules : []).filter(isCompanyModule)
}

export async function currentCompanyModules(): Promise<CompanyModule[]> {
  return enabledModulesForDb(await resolveCurrentDbName())
}

/** 403 إن لم تكن الوحدة مفعّلة لشركة الجلسة الحالية، وإلا null */
export async function moduleDeniedResponse(module: CompanyModule, dbName?: string): Promise<NextResponse | null> {
  const modules = dbName ? await enabledModulesForDb(dbName) : await currentCompanyModules()
  if (modules.includes(module)) return null
  return NextResponse.json({ error: `وحدة «${COMPANY_MODULES[module].label}» غير مفعّلة لهذه الشركة — تواصل مع إدارة النظام` }, { status: 403 })
}
