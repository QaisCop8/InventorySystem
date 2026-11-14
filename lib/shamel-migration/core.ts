import sql, { resolveCurrentDbName } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// ترحيل البيانات من الشامل (قاعدة Pervasive على جهاز العميل): برنامج «معالج الترحيل» (launchers/shamel-migration)
// يقرأ الجداول عبر ODBC ويرسلها دفعات إلى /api/shamel-migration/agent/* برمز تشغيل يُنشأ من شاشة «ترحيل من الشامل».
// الرمز = base64url(قاعدة الشركة) + "." + سر — يُخزَّن بصمته فقط (نفس أسلوب روابط بوابة العملاء).
// shamel_migration_map يربط كل رمز بالشامل (حساب/صنف/مستودع...) برقم السجل هنا، فإعادة التشغيل لا تُكرِّر شيئاً.

export type MigrationMode = "definitions" | "full"

export type MigrationRun = {
  id: number
  mode: MigrationMode
  voucher_types: string[]
  from_date: string | null
  balance_date: string
  branch_id: number
  created_by: string
  status: string
}

export async function ensureShamelMigrationTables() { return runSchemaOnce("lib/shamel-migration/core.ts#ensureShamelMigrationTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS shamel_migration_runs (
      id SERIAL PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      mode VARCHAR(20) NOT NULL DEFAULT 'definitions',
      voucher_types TEXT[] NOT NULL DEFAULT '{}',
      from_date DATE,
      balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
      branch_id INTEGER NOT NULL,
      created_by VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      current_step VARCHAR(60),
      progress JSONB NOT NULL DEFAULT '{}'::jsonb,
      message TEXT,
      last_seen_at TIMESTAMP,
      finished_at TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS shamel_migration_map (
      kind VARCHAR(40) NOT NULL,
      shamel_key VARCHAR(120) NOT NULL,
      web_id INTEGER NOT NULL,
      PRIMARY KEY (kind, shamel_key)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS shamel_migration_log (
      id BIGSERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL,
      step VARCHAR(60) NOT NULL,
      level VARCHAR(10) NOT NULL,
      ref VARCHAR(120),
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_shamel_migration_log_run ON shamel_migration_log(run_id, id DESC)`
}) }

// ---------- قيم الشامل ----------

/** نص الشامل: حقول CHAR مكمَّلة بمسافات، و null/undefined ⇐ "" */
export const text = (value: unknown) => (value == null ? "" : String(value).replace(/\u0000/g, "").trim())
export const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
/** تاريخ yyyy-mm-dd أو null (الشامل يضع 1990-01-01 لتاريخ فارغ) */
export const date = (value: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value))
  if (!match || match[1] <= "1990") return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * رقم بطول 10 (قاعدة أرقام الحسابات/العملاء/الأصناف هنا): بادئة حرفية + أرقام مكمَّلة بأصفار من اليسار
 * (C0000002 ⇐ C000000002). رقم حساب رقمي هرمي (11100000) يُكمَّل من اليمين لتبقى الشجرة مرتبة (1110000000)،
 * وإن بدأ بصفر يُكمَّل من اليسار. ما لا يطابق النمط يبقى كما هو.
 */
export function toCode10(raw: unknown, numericFill: "end" | "start" = "end") {
  const code = text(raw).toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!code || code.length >= 10) return code.slice(0, 50)
  const match = /^([A-Z]*)(\d+)$/.exec(code)
  if (!match) return code
  const [, prefix, digits] = match
  if (prefix) return prefix + digits.padStart(10 - prefix.length, "0")
  if (numericFill === "end" && !digits.startsWith("0")) return digits.padEnd(10, "0")
  return digits.padStart(10, "0")
}

// ---------- إدراج حسب أعمدة قاعدة الشركة ----------
// قواعد الشركات تختلف أعمدتها (القديمة ينقصها ما أُضيف لاحقاً، مثل products.last_purchase_date) — يُدرَج فقط ما
// هو موجود فعلاً بالجدول، والأعمدة الناقصة تُتجاوز بدل إفشال السجل.

const columnCache = new Map<string, Promise<Set<string>>>()

export async function tableColumns(table: string): Promise<Set<string>> {
  const key = `${await resolveCurrentDbName()}|${table}`
  if (!columnCache.has(key)) {
    const load = async () => {
      const rows = (await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table}`) as any[]
      return new Set(rows.map((row) => String(row.column_name)))
    }
    const promise = load()
    promise.catch(() => columnCache.delete(key))
    columnCache.set(key, promise)
  }
  return columnCache.get(key)!
}

/** INSERT ... RETURNING id بالأعمدة الموجودة فقط من values */
export async function insertRow(table: string, values: Record<string, unknown>): Promise<number> {
  const columns = await tableColumns(table)
  const present = Object.entries(values).filter(([column, value]) => columns.has(column) && value !== undefined)
  if (!present.length) throw new Error(`لا توجد أعمدة صالحة للجدول ${table}`)
  const rows = await sql.unsafe(
    `INSERT INTO ${table} (${present.map(([column]) => `"${column}"`).join(", ")}) VALUES (${present.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
    present.map(([, value]) => value),
  )
  return Number((rows as any[])[0]?.id)
}

/** UPDATE ... WHERE id بالأعمدة الموجودة فقط */
export async function updateRow(table: string, id: number, values: Record<string, unknown>) {
  const columns = await tableColumns(table)
  const present = Object.entries(values).filter(([column, value]) => columns.has(column) && value !== undefined)
  if (!present.length) return
  await sql.unsafe(
    `UPDATE ${table} SET ${present.map(([column], index) => `"${column}" = $${index + 1}`).join(", ")} WHERE id = $${present.length + 1}`,
    [...present.map(([, value]) => value), id],
  )
}

// ---------- خريطة رموز الشامل ⇐ سجلات النظام ----------

export async function mapGet(kind: string, keys: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await sql`SELECT shamel_key, web_id FROM shamel_migration_map WHERE kind = ${kind} AND shamel_key = ANY(${unique}::text[])`
  return new Map(rows.map((row: any) => [String(row.shamel_key), Number(row.web_id)]))
}

export async function mapOne(kind: string, key: string): Promise<number | null> {
  if (!key) return null
  return (await mapGet(kind, [key])).get(key) ?? null
}

export async function mapSet(kind: string, key: string, webId: number) {
  if (!key || !(webId > 0)) return
  await sql`
    INSERT INTO shamel_migration_map (kind, shamel_key, web_id) VALUES (${kind}, ${key}, ${webId})
    ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id
  `
}

// ---------- السجل والتقدم ----------

export type StepStats = { received: number; created: number; updated: number; skipped: number; failed: number }

export class StepContext {
  stats: StepStats = { received: 0, created: 0, updated: 0, skipped: 0, failed: 0 }
  private logs: { level: string; ref: string; message: string }[] = []
  constructor(readonly run: MigrationRun, readonly step: string) {}
  error(ref: unknown, message: string) { this.stats.failed++; this.logs.push({ level: "error", ref: text(ref), message }) }
  warn(ref: unknown, message: string) { this.logs.push({ level: "warn", ref: text(ref), message }) }
  info(message: string) { this.logs.push({ level: "info", ref: "", message }) }
  async flush() {
    if (!this.logs.length) return
    const rows = this.logs.splice(0)
    await sql`
      INSERT INTO shamel_migration_log (run_id, step, level, ref, message)
      SELECT ${this.run.id}, ${this.step}, level, ref, message
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(level text, ref text, message text)
    `
  }
}

export async function addStepProgress(runId: number, step: string, stats: StepStats, done: boolean) {
  await sql`
    UPDATE shamel_migration_runs SET
      status = CASE WHEN status IN ('pending', 'running') THEN 'running' ELSE status END,
      current_step = ${step},
      last_seen_at = NOW(),
      progress = jsonb_set(progress, ARRAY[${step}]::text[], jsonb_build_object(
        'received', COALESCE((progress->${step}::text->>'received')::int, 0) + ${stats.received}::int,
        'created', COALESCE((progress->${step}::text->>'created')::int, 0) + ${stats.created}::int,
        'updated', COALESCE((progress->${step}::text->>'updated')::int, 0) + ${stats.updated}::int,
        'skipped', COALESCE((progress->${step}::text->>'skipped')::int, 0) + ${stats.skipped}::int,
        'failed', COALESCE((progress->${step}::text->>'failed')::int, 0) + ${stats.failed}::int,
        'done', ${done}::boolean
      ), true)
    WHERE id = ${runId}
  `
}

export const runFromRow = (row: any): MigrationRun => ({
  id: Number(row.id),
  mode: row.mode === "full" ? "full" : "definitions",
  voucher_types: Array.isArray(row.voucher_types) ? row.voucher_types.map(String) : [],
  from_date: row.from_date ? String(row.from_date instanceof Date ? row.from_date.toISOString() : row.from_date).slice(0, 10) : null,
  balance_date: String(row.balance_date instanceof Date ? row.balance_date.toISOString() : row.balance_date).slice(0, 10),
  branch_id: Number(row.branch_id),
  created_by: String(row.created_by),
  status: String(row.status),
})
