import sql from "@/lib/database"

// Shared schema + persistence helpers for السائقين (drivers). Mirrors the lazy
// CREATE TABLE IF NOT EXISTS convention used across this codebase's simpler
// lookup-style entities (see app/api/item-groups, app/api/tax-classifications).

export interface DriverDB {
  id: number
  driver_code: string
  name: string
  phone: string | null
  licence_expiry: string | null
  license_type_id: number | null
  license_type_name: string | null
  status: number | null
  created_at: string
  updated_at: string
}

export interface Driver {
  id: number
  driver_code: string
  name: string
  phone: string | null
  licence_expiry: string | null
  license_type_id: number | null
  license_type_name: string | null
  status: "نشط" | "غير نشط"
  created_at: string
  updated_at: string
}

export const ensureDriversTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS license_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(30) NOT NULL UNIQUE,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      driver_code VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(30) NOT NULL,
      phone VARCHAR(30),
      licence_expiry DATE,
      license_type_id INTEGER REFERENCES license_types(id),
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS licence_expiry DATE`
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_type_id INTEGER REFERENCES license_types(id)`
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
}

export function toDisplayStatus(status: number | null | undefined): "نشط" | "غير نشط" {
  return status === 2 ? "غير نشط" : "نشط"
}

export function toDbStatus(status: string | undefined): number {
  return status === "غير نشط" ? 2 : 1
}

export function normalizeDriverCode(code?: string): string {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = (letters || "DR").slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
}

function adjustCodePlusOne(code: string, codeLen = 8): string {
  if (!code || !code.trim()) return ""
  const normalized = String(code).trim().toUpperCase()
  const match = normalized.match(/^([^\d]*)(\d+)$/)
  if (!match) return normalized

  const prefix = match[1] || ""
  const numericPart = match[2]
  const nextValue = (Number(numericPart) + 1).toString()
  const digitsLength = Math.max(1, codeLen - prefix.length)

  return `${prefix}${nextValue.padStart(digitsLength, "0")}`.slice(0, codeLen)
}

export async function generateDriverNumber(): Promise<string> {
  await ensureDriversTable()
  const prefix = "DR"

  const result: { code: string }[] = await sql`
    SELECT driver_code as code FROM drivers WHERE driver_code LIKE ${prefix + "%"} ORDER BY driver_code ASC
  `

  let nextCode = "0000001"
  if (result.length > 0) {
    const matchingCodes = result.map((row) => String(row?.code || "")).filter((code) => code.startsWith(prefix))
    if (matchingCodes.length > 0) {
      const parsed = matchingCodes
        .map((code) => {
          const match = code.match(/^([^\d]*)(\d+)$/)
          return match ? { code, value: Number(match[2]), width: match[2].length } : null
        })
        .filter(Boolean) as Array<{ code: string; value: number; width: number }>

      if (parsed.length > 0) {
        const maxEntry = parsed.reduce((best, current) => {
          if (current.value > best.value) return current
          if (current.value === best.value && current.width > best.width) return current
          return best
        }, parsed[0])
        nextCode = adjustCodePlusOne(maxEntry.code, 8)
      }
    }
  }

  return nextCode.startsWith(prefix) ? nextCode : `${prefix}${nextCode}`
}

export async function isDuplicateDriverName(name?: string, currentId?: number): Promise<boolean> {
  const cleaned = String(name || "").trim().toLowerCase()
  if (!cleaned) return false

  const existing = await sql`
    SELECT id FROM drivers
    WHERE LOWER(TRIM(name)) = ${cleaned}
      AND COALESCE(status, 1) <> 3
      AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
    LIMIT 1
  `

  return existing.length > 0
}

export async function ensureUniqueDriverCode(code?: string, currentId?: number): Promise<string> {
  const cleaned = normalizeDriverCode(code)
  if (cleaned) {
    const existing = await sql`
      SELECT id FROM drivers WHERE driver_code = ${cleaned} AND COALESCE(status, 1) <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
    `
    if (existing.length === 0) return cleaned
  }

  const generated = await generateDriverNumber()
  const normalized = normalizeDriverCode(generated)
  const existing = await sql`
    SELECT id FROM drivers WHERE driver_code = ${normalized} AND COALESCE(status, 1) <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
  `
  if (existing.length === 0) return normalized

  return ensureUniqueDriverCode(normalized, currentId)
}

export function toDriver(row: DriverDB): Driver {
  return {
    ...row,
    licence_expiry: row.licence_expiry ? String(row.licence_expiry).slice(0, 10) : null,
    status: toDisplayStatus(row.status),
  }
}

export function isDuplicateInsertError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("duplicate") || message.includes("23505") || message.includes("unique")
}

export default sql
