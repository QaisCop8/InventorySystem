import managementSql, { ensureManagementTables } from "@/lib/management-db"

export type ManagementLoginAuditInput = {
  email: string
  name?: string | null
  managementUserId?: number | null
  tenantUserId?: number | string | null
  companyId?: number | null
  dbName?: string | null
  loginType: "management" | "tenant" | "company-switch"
  ipAddress?: string | null
  userAgent?: string | null
}

/** Record a successful sign-in centrally so platform admins can filter it by user/company/date. */
export async function recordManagementLogin(input: ManagementLoginAuditInput) {
  await ensureManagementTables()

  const email = String(input.email || "").trim().toLowerCase()
  if (!email) return

  const [companyRows, userRows] = await Promise.all([
    input.companyId
      ? managementSql`SELECT id, name, db_name FROM companies WHERE id = ${input.companyId} LIMIT 1`
      : input.dbName
        ? managementSql`SELECT id, name, db_name FROM companies WHERE db_name = ${input.dbName} LIMIT 1`
        : Promise.resolve([]),
    input.managementUserId
      ? Promise.resolve([{ id: input.managementUserId }])
      : managementSql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`,
  ])

  const company = companyRows[0]
  const managementUserId = userRows[0]?.id ?? null
  const tenantUserId = Number(input.tenantUserId) || null

  await managementSql`
    INSERT INTO management_login_audit (
      management_user_id, tenant_user_id, user_email, user_name,
      company_id, company_name, db_name, login_type, ip_address, user_agent
    ) VALUES (
      ${managementUserId}, ${tenantUserId}, ${email}, ${input.name || null},
      ${company?.id ?? null}, ${company?.name ?? null}, ${company?.db_name ?? input.dbName ?? null},
      ${input.loginType}, ${input.ipAddress?.slice(0, 64) || null}, ${input.userAgent?.slice(0, 1000) || null}
    )
  `
}
