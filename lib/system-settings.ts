import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[system-settings] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            "",
          )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      sql = neon(dbUrl)
    }
  }
} catch (error) {
  console.error("[system-settings] Failed to initialize DB client:", error)
  sql = null
}

function deserializeSettingValue(value: unknown): unknown {
  if (value === null || value === undefined) return null

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return ""
    if (trimmed === "true") return true
    if (trimmed === "false") return false
    if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)

    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return value
}

export async function getSystemSettings(): Promise<Record<string, unknown>> {
  if (!sql) return {}

  try {
    const rows = await sql`
      SELECT id, value
      FROM system_settings
      ORDER BY id ASC
    `

    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      if (row.id) {
        settings[String(row.id)] = deserializeSettingValue(row.value)
      }
    }

    return settings
  } catch (error) {
    console.error("[system-settings] Failed to load settings:", error)
    return {}
  }
}

export async function getSystemSettingValue<T>(key: string, fallback: T): Promise<T> {
  const settings = await getSystemSettings()
  const value = settings[key]
  return value === undefined ? fallback : (value as T)
}
