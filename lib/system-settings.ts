import sql from "./database"

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
