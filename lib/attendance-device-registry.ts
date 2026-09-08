import managementSql, { ensureManagementTables } from "@/lib/management-db"

export interface AttendanceDeviceTenant {
  companyId: number
  dbName: string
  tenantDeviceId: number | null
}

let registryEnsured: Promise<void> | null = null

export const normalizeAttendanceSerial = (value: unknown) => String(value || "").trim().toUpperCase()

export function ensureAttendanceDeviceRegistry(): Promise<void> {
  if (!registryEnsured) {
    registryEnsured = (async () => {
      await ensureManagementTables()
      await managementSql`
        CREATE TABLE IF NOT EXISTS attendance_device_registry (
          id BIGSERIAL PRIMARY KEY,
          serial_number VARCHAR(100) NOT NULL UNIQUE,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          tenant_device_id INTEGER,
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_seen_at TIMESTAMP,
          last_ip VARCHAR(100),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `
      await managementSql`DROP INDEX IF EXISTS attendance_device_registry_company_device_unique`
      await managementSql`CREATE INDEX IF NOT EXISTS attendance_device_registry_company_device_idx ON attendance_device_registry(company_id, tenant_device_id) WHERE tenant_device_id IS NOT NULL`
      await managementSql`CREATE INDEX IF NOT EXISTS attendance_device_registry_company_idx ON attendance_device_registry(company_id)`
    })().catch((error) => {
      registryEnsured = null
      throw error
    })
  }
  return registryEnsured
}

export async function registerAttendanceDevice(input: {
  serialNumber: unknown
  dbName: string
  tenantDeviceId?: number | null
  isActive?: boolean
}) {
  await ensureAttendanceDeviceRegistry()
  const serialNumber = normalizeAttendanceSerial(input.serialNumber)
  if (!serialNumber) throw new Error("الرقم التسلسلي مطلوب")
  if (!/^[a-zA-Z0-9_]+$/.test(input.dbName)) throw new Error("قاعدة بيانات الشركة غير صالحة")

  const rows = await managementSql`
    INSERT INTO attendance_device_registry AS registry
      (serial_number, company_id, tenant_device_id, is_active)
    SELECT
      ${serialNumber}, company.id, ${input.tenantDeviceId ?? null}, ${input.isActive !== false}
    FROM companies company
    WHERE company.db_name = ${input.dbName}
      AND company.status = 'approved'
      AND (company.expiry_date IS NULL OR company.expiry_date > CURRENT_TIMESTAMP)
    ON CONFLICT (serial_number) DO UPDATE SET
      tenant_device_id = COALESCE(EXCLUDED.tenant_device_id, registry.tenant_device_id),
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP
    WHERE registry.company_id = EXCLUDED.company_id
    RETURNING id, company_id, tenant_device_id, serial_number, is_active
  `

  if (rows[0]) return rows[0]
  const company = (await managementSql`SELECT id,status,(expiry_date IS NULL OR expiry_date>CURRENT_TIMESTAMP) subscription_active FROM companies WHERE db_name=${input.dbName} LIMIT 1`)[0]
  if (!company) throw new Error("تعذر تحديد الشركة الحالية في قاعدة الإدارة")
  if (company.status !== "approved" || company.subscription_active !== true) throw new Error("الشركة غير فعالة ولا يمكن ربط جهاز ADMS")
  throw new Error("الرقم التسلسلي مسجل لشركة أخرى ولا يمكن ربط الجهاز")
}

export async function unregisterAttendanceDevice(input: {
  dbName: string
  serialNumber?: unknown
  tenantDeviceId?: number | null
}) {
  await ensureAttendanceDeviceRegistry()
  const serialNumber = normalizeAttendanceSerial(input.serialNumber)
  await managementSql`
    DELETE FROM attendance_device_registry registry
    USING companies company
    WHERE registry.company_id = company.id
      AND company.db_name = ${input.dbName}
      AND (${serialNumber} = '' OR registry.serial_number = ${serialNumber})
      AND (${input.tenantDeviceId ?? null}::integer IS NULL OR registry.tenant_device_id = ${input.tenantDeviceId ?? null})
  `
}

export async function resolveAttendanceDeviceTenant(serialValue: unknown): Promise<AttendanceDeviceTenant | null> {
  await ensureAttendanceDeviceRegistry()
  const serialNumber = normalizeAttendanceSerial(serialValue)
  if (!serialNumber) return null
  const row = (await managementSql`
    SELECT registry.company_id, registry.tenant_device_id, company.db_name
    FROM attendance_device_registry registry
    JOIN companies company ON company.id = registry.company_id
    WHERE registry.serial_number = ${serialNumber}
      AND registry.is_active = true
      AND company.status = 'approved'
      AND company.db_name IS NOT NULL
      AND (company.expiry_date IS NULL OR company.expiry_date > CURRENT_TIMESTAMP)
    LIMIT 1
  `)[0]
  return row
    ? { companyId: Number(row.company_id), dbName: String(row.db_name), tenantDeviceId: row.tenant_device_id == null ? null : Number(row.tenant_device_id) }
    : null
}

export async function markAttendanceDeviceSeen(serialValue: unknown, ipAddress?: string | null) {
  await ensureAttendanceDeviceRegistry()
  const serialNumber = normalizeAttendanceSerial(serialValue)
  if (!serialNumber) return
  await managementSql`
    UPDATE attendance_device_registry
    SET last_seen_at=CURRENT_TIMESTAMP, last_ip=${String(ipAddress || "").slice(0, 100) || null}, updated_at=CURRENT_TIMESTAMP
    WHERE serial_number=${serialNumber}
  `
}
