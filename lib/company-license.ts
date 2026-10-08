import sql, { resolveCurrentDbName, withTenantDb } from "@/lib/database"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

// ترخيص الشركة: عدد المستخدمين والفروع المسموح بها (companies.number_of_users/number_of_branches
// بقاعدة الإدارة). إضافة مستخدم/فرع (أو إعادة تفعيل مستخدم) تُرفض عند بلوغ الحد، ويمكن للشركة إرسال
// طلب زيادة يوافق عليه مسؤول المنصة (فيُرفع الحد) أو يرفضه.

export type LicenseResource = "users" | "branches"
export const LICENSE_RESOURCE_LABELS: Record<LicenseResource, { plural: string; single: string }> = {
  users: { plural: "المستخدمين", single: "مستخدم" },
  branches: { plural: "الفروع", single: "فرع" },
}

export type LicenseUsage = { users: number; branches: number }
export type CompanyLicense = {
  companyId: number
  companyName: string
  limits: LicenseUsage
  usage: LicenseUsage
  pending: Array<{ id: number; resource: LicenseResource; quantity: number; created_at: string }>
}

export class LicenseLimitError extends Error {
  constructor(public resource: LicenseResource, public limit: number, public used: number, public pendingRequestId: number | null) {
    super(`تم الوصول للحد المرخّص من ${LICENSE_RESOURCE_LABELS[resource].plural} (${used} من ${limit}). يمكنك إرسال طلب زيادة الترخيص لاعتماده من إدارة النظام.`)
  }
  toJSON() {
    return { error: this.message, code: "LICENSE_LIMIT", resource: this.resource, limit: this.limit, used: this.used, pending_request_id: this.pendingRequestId }
  }
}

let licenseTablesEnsured: Promise<void> | null = null
export function ensureLicenseTables() {
  if (!licenseTablesEnsured) {
    licenseTablesEnsured = (async () => {
      await ensureManagementTables()
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_of_users INTEGER DEFAULT 1`
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_of_branches INTEGER DEFAULT 1`
      // false حتى أول فحص: يُرفع الحد حينها إلى الاستخدام الفعلي القائم (الشركات الحالية لا تُحجب فجأة).
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS license_initialized BOOLEAN DEFAULT false`
      await managementSql`
        CREATE TABLE IF NOT EXISTS company_license_requests (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          resource VARCHAR(20) NOT NULL,
          quantity INTEGER NOT NULL,
          approved_quantity INTEGER,
          limit_before INTEGER,
          used_at_request INTEGER,
          reason TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          requested_by_name VARCHAR(150),
          requested_by_email VARCHAR(150),
          tenant_user_id INTEGER,
          decided_by INTEGER REFERENCES users(id),
          decided_at TIMESTAMP,
          decision_note TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      await managementSql`CREATE INDEX IF NOT EXISTS idx_company_license_requests_status ON company_license_requests(status, company_id)`
    })().catch((error) => { licenseTablesEnsured = null; throw error })
  }
  return licenseTablesEnsured
}

/** الاستخدام الفعلي داخل قاعدة الشركة: المستخدمون النشطون والفروع غير المحذوفة. */
export async function countTenantUsage(dbName?: string): Promise<LicenseUsage> {
  const query = async () => {
    const [users] = await sql`SELECT COUNT(*)::int AS n FROM user_settings WHERE COALESCE(is_active, true) = true`
    const branchTable = await sql`SELECT to_regclass('branches') IS NOT NULL AS ok`
    const branches = branchTable[0]?.ok ? (await sql`SELECT COUNT(*)::int AS n FROM branches WHERE COALESCE(status, 1) <> 3`)[0] : { n: 0 }
    return { users: Number(users?.n || 0), branches: Number(branches?.n || 0) }
  }
  return dbName ? withTenantDb(dbName, query) : query()
}

async function companyForDb(dbName: string) {
  return (await managementSql`
    SELECT id, name, COALESCE(number_of_users, 1) AS number_of_users, COALESCE(number_of_branches, 1) AS number_of_branches,
           COALESCE(license_initialized, false) AS license_initialized
    FROM companies WHERE db_name = ${dbName} LIMIT 1`)[0]
}

/** ترخيص شركة الجلسة الحالية؛ null في بيئة بلا صف شركة بقاعدة الإدارة (بلا قيود). */
export async function getCurrentCompanyLicense(): Promise<CompanyLicense | null> {
  await ensureLicenseTables()
  const dbName = await resolveCurrentDbName()
  const company = await companyForDb(dbName)
  if (!company) return null
  const usage = await countTenantUsage()
  let limits = { users: Number(company.number_of_users), branches: Number(company.number_of_branches) }
  if (!company.license_initialized) {
    limits = { users: Math.max(limits.users, usage.users, 1), branches: Math.max(limits.branches, usage.branches, 1) }
    await managementSql`UPDATE companies SET number_of_users = ${limits.users}, number_of_branches = ${limits.branches}, license_initialized = true WHERE id = ${company.id}`
  }
  const pending = await managementSql`
    SELECT id, resource, quantity, created_at FROM company_license_requests
    WHERE company_id = ${company.id} AND status = 'pending' ORDER BY created_at DESC`
  return { companyId: Number(company.id), companyName: company.name, limits, usage, pending: pending.map((row: any) => ({ ...row, id: Number(row.id), quantity: Number(row.quantity) })) }
}

/** يرمي LicenseLimitError إن كانت إضافة `adding` من المورد ستتجاوز الحد المرخّص. */
export async function assertLicenseAllows(resource: LicenseResource, adding = 1) {
  const license = await getCurrentCompanyLicense()
  if (!license) return
  if (license.usage[resource] + adding <= license.limits[resource]) return
  const pending = license.pending.find((request) => request.resource === resource)
  throw new LicenseLimitError(resource, license.limits[resource], license.usage[resource], pending?.id ?? null)
}

export async function createLicenseRequest(input: { resource: LicenseResource; quantity: number; reason?: string; tenantUserId?: number; requestedByName?: string; requestedByEmail?: string }) {
  const license = await getCurrentCompanyLicense()
  if (!license) throw new Error("لا يوجد ترخيص مرتبط بهذه الشركة")
  const quantity = Math.floor(Number(input.quantity))
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000) throw new Error("العدد المطلوب يجب أن يكون بين 1 و1000")
  if (license.pending.some((request) => request.resource === input.resource)) throw new Error(`يوجد طلب زيادة ${LICENSE_RESOURCE_LABELS[input.resource].plural} بانتظار الاعتماد`)
  const [row] = await managementSql`
    INSERT INTO company_license_requests (company_id, resource, quantity, limit_before, used_at_request, reason, requested_by_name, requested_by_email, tenant_user_id)
    VALUES (${license.companyId}, ${input.resource}, ${quantity}, ${license.limits[input.resource]}, ${license.usage[input.resource]},
            ${String(input.reason || "").trim() || null}, ${input.requestedByName || null}, ${input.requestedByEmail || null}, ${input.tenantUserId || null})
    RETURNING id, resource, quantity, status, created_at`
  return { ...row, companyName: license.companyName }
}

export function licenseErrorResponseBody(error: unknown) {
  return error instanceof LicenseLimitError ? error.toJSON() : null
}
