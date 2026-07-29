import sql from "@/lib/database"

// Shared schema + persistence helpers for السيارات (cars). Mirrors the lazy
// CREATE TABLE IF NOT EXISTS convention used across this codebase's simpler
// lookup-style entities (see app/api/item-groups, app/api/tax-classifications).

export interface CarDB {
  id: number
  car_code: string
  name: string
  plate_number: string | null
  model: string | null
  licence_expiry: string | null
  status: number | null
  created_at: string
  updated_at: string
}

export interface Car {
  id: number
  car_code: string
  name: string
  plate_number: string | null
  model: string | null
  licence_expiry: string | null
  status: "نشط" | "غير نشط"
  created_at: string
  updated_at: string
}

export const ensureCarsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cars (
      id SERIAL PRIMARY KEY,
      car_code VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(30) NOT NULL,
      plate_number VARCHAR(30),
      model VARCHAR(50),
      licence_expiry DATE,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE cars ADD COLUMN IF NOT EXISTS plate_number VARCHAR(30)`
  await sql`ALTER TABLE cars ADD COLUMN IF NOT EXISTS model VARCHAR(50)`
  await sql`ALTER TABLE cars ADD COLUMN IF NOT EXISTS licence_expiry DATE`
  await sql`ALTER TABLE cars ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
}

export function toDisplayStatus(status: number | null | undefined): "نشط" | "غير نشط" {
  return status === 2 ? "غير نشط" : "نشط"
}

export function toDbStatus(status: string | undefined): number {
  return status === "غير نشط" ? 2 : 1
}

export function normalizeCarCode(code?: string): string {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = (letters || "CR").slice(0, 8)

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

export async function generateCarNumber(): Promise<string> {
  await ensureCarsTable()
  const prefix = "CR"

  const result: { code: string }[] = await sql`
    SELECT car_code as code FROM cars WHERE car_code LIKE ${prefix + "%"} ORDER BY car_code ASC
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

export async function isDuplicateCarName(name?: string, currentId?: number): Promise<boolean> {
  const cleaned = String(name || "").trim().toLowerCase()
  if (!cleaned) return false

  const existing = await sql`
    SELECT id FROM cars
    WHERE LOWER(TRIM(name)) = ${cleaned}
      AND COALESCE(status, 1) <> 3
      AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
    LIMIT 1
  `

  return existing.length > 0
}

export async function ensureUniqueCarCode(code?: string, currentId?: number): Promise<string> {
  const cleaned = normalizeCarCode(code)
  if (cleaned) {
    const existing = await sql`
      SELECT id FROM cars WHERE car_code = ${cleaned} AND COALESCE(status, 1) <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
    `
    if (existing.length === 0) return cleaned
  }

  const generated = await generateCarNumber()
  const normalized = normalizeCarCode(generated)
  const existing = await sql`
    SELECT id FROM cars WHERE car_code = ${normalized} AND COALESCE(status, 1) <> 3 AND (${currentId ?? 0} = 0 OR id <> ${currentId ?? 0})
  `
  if (existing.length === 0) return normalized

  return ensureUniqueCarCode(normalized, currentId)
}

export function toCar(row: CarDB): Car {
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
