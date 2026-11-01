import { spawn } from "child_process"
import { createReadStream, createWriteStream, existsSync } from "fs"
import { stat, unlink } from "fs/promises"
import os from "os"
import path from "path"
import { pipeline } from "stream/promises"
import type { Readable } from "stream"
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import managementSql, { ensureManagementTables } from "./management-db"
import { getDatabaseNameFromUrl, withDatabaseName } from "./db-url"

// النسخ الاحتياطي لقواعد الشركات (co_xxx) وقاعدة الإدارة: pg_dump بصيغة custom → ملف مؤقت → تخزين كائنات متوافق مع
// S3 (Neon Object Storage افتراضياً، أو أي S3/R2). السجل في management.db_backups. الاستعادة تأخذ نسخة أمان أولاً،
// ثم تستبدل مخطط public كاملاً داخل معاملة واحدة (psql --single-transaction): أي خطأ ⇐ لا يتغيّر شيء.
export type BackupKind = "scheduled" | "manual" | "pre_restore"
export type BackupTarget = { dbName: string; companyId: number | null; companyName: string }

const env = (name: string) => (process.env[name] || "").trim()
export const backupRetentionDays = () => Math.max(1, Number(env("BACKUP_RETENTION_DAYS")) || 30)
export const managementDbName = () => getDatabaseNameFromUrl(env("DATABASE_URL"))

export function backupStorageConfigured() {
  return Boolean(env("BACKUP_S3_ENDPOINT") && env("BACKUP_S3_BUCKET") && env("BACKUP_S3_ACCESS_KEY_ID") && env("BACKUP_S3_SECRET_ACCESS_KEY"))
}

let s3: S3Client | null = null
function storage() {
  if (!backupStorageConfigured()) throw new Error("تخزين النسخ الاحتياطية غير مُعدّ: اضبط BACKUP_S3_ENDPOINT و BACKUP_S3_BUCKET و BACKUP_S3_ACCESS_KEY_ID و BACKUP_S3_SECRET_ACCESS_KEY")
  // Neon Object Storage يدعم العنونة path-style فقط
  s3 ??= new S3Client({
    endpoint: env("BACKUP_S3_ENDPOINT"),
    region: env("BACKUP_S3_REGION") || "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: env("BACKUP_S3_ACCESS_KEY_ID"), secretAccessKey: env("BACKUP_S3_SECRET_ACCESS_KEY") },
  })
  return { client: s3, bucket: env("BACKUP_S3_BUCKET") }
}

export async function ensureBackupTables() {
  await ensureManagementTables()
  await managementSql`
    CREATE TABLE IF NOT EXISTS db_backups (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      company_name VARCHAR(150),
      db_name VARCHAR(100) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      object_key TEXT,
      size_bytes BIGINT,
      error TEXT,
      created_by VARCHAR(150),
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP
    )
  `
  await managementSql`CREATE INDEX IF NOT EXISTS db_backups_db_idx ON db_backups (db_name, started_at DESC)`
  await managementSql`
    CREATE TABLE IF NOT EXISTS db_restore_jobs (
      id SERIAL PRIMARY KEY,
      backup_id INTEGER NOT NULL,
      safety_backup_id INTEGER,
      db_name VARCHAR(100) NOT NULL,
      company_name VARCHAR(150),
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      error TEXT,
      requested_by VARCHAR(150),
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP
    )
  `
}

/** pg_dump/pg_restore/psql: متغير <TOOL>_PATH، ثم مجلد PSQL_PATH، ثم تثبيت PostgreSQL على ويندوز، ثم PATH */
function pgTool(name: "pg_dump" | "pg_restore" | "psql") {
  const own = env(`${name.toUpperCase()}_PATH`)
  if (own) return own
  const psqlPath = env("PSQL_PATH")
  if (psqlPath) {
    const sibling = path.join(path.dirname(psqlPath), path.basename(psqlPath).replace(/^psql/i, name))
    if (existsSync(sibling)) return sibling
  }
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files"
    for (const version of ["18", "17", "16", "15"]) {
      const candidate = path.join(programFiles, "PostgreSQL", version, "bin", `${name}.exe`)
      if (existsSync(candidate)) return candidate
    }
  }
  return name
}

/** بيئة الاتصال لأدوات Postgres. مضيف Neon المجمّع (-pooler) لا يناسب pg_dump/pg_restore ⇐ الاتصال المباشر. */
function pgEnv(dbName: string): NodeJS.ProcessEnv {
  const url = new URL(withDatabaseName(env("DATABASE_URL"), dbName))
  const result: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname.replace("-pooler.", "."),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: dbName,
  }
  const sslMode = url.searchParams.get("sslmode")
  if (sslMode) result.PGSSLMODE = sslMode
  const channelBinding = url.searchParams.get("channel_binding")
  if (channelBinding) result.PGCHANNELBINDING = channelBinding
  return result
}

type Proc = ReturnType<typeof spawn>
function waitFor(child: Proc, label: string) {
  let stderr = ""
  child.stderr?.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-4000) })
  return new Promise<void>((resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) => reject(new Error(`تعذّر تشغيل ${label}: ${error.message}${error.code === "ENOENT" ? " (ثبّت أدوات PostgreSQL أو اضبط PSQL_PATH)" : ""}`)))
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} فشل (${code}): ${stderr.trim()}`))))
  })
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
const tempFile = (dbName: string) => path.join(os.tmpdir(), `${dbName}-${stamp()}-${Math.random().toString(36).slice(2, 8)}.dump`)

// قاعدة واحدة لا تُنسخ/تُستعاد مرتين بنفس الوقت (نسخة خادم واحدة على Render)
const busy = new Set<string>()
async function exclusive<T>(dbName: string, work: () => Promise<T>) {
  if (busy.has(dbName)) throw new Error(`توجد عملية نسخ/استعادة جارية على ${dbName}`)
  busy.add(dbName)
  try { return await work() } finally { busy.delete(dbName) }
}

async function dumpAndUpload(target: BackupTarget, kind: BackupKind, by: string) {
  const { client, bucket } = storage()
  const row = (await managementSql`
    INSERT INTO db_backups (company_id, company_name, db_name, kind, created_by)
    VALUES (${target.companyId}, ${target.companyName}, ${target.dbName}, ${kind}, ${by}) RETURNING id
  `)[0]
  const id = Number(row.id)
  const file = tempFile(target.dbName)
  try {
    await waitFor(spawn(pgTool("pg_dump"), ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--file", file], { env: pgEnv(target.dbName), windowsHide: true }), "pg_dump")
    const { size } = await stat(file)
    const key = `backups/${target.dbName}/${stamp()}-${kind}-${id}.dump`
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: size, ContentType: "application/octet-stream" }))
    await managementSql`UPDATE db_backups SET status = 'done', object_key = ${key}, size_bytes = ${size}, finished_at = NOW() WHERE id = ${id}`
    return id
  } catch (error) {
    await managementSql`UPDATE db_backups SET status = 'failed', error = ${error instanceof Error ? error.message : String(error)}, finished_at = NOW() WHERE id = ${id}`
    throw error
  } finally {
    await unlink(file).catch(() => undefined)
  }
}

export function backupDatabase(target: BackupTarget, kind: BackupKind, by: string) {
  return exclusive(target.dbName, () => dumpAndUpload(target, kind, by))
}

/** كل الأهداف: قاعدة الإدارة + كل شركة لها قاعدة */
export async function backupTargets(): Promise<BackupTarget[]> {
  const companies = await managementSql`SELECT id, name, db_name FROM companies WHERE db_name IS NOT NULL AND db_name <> '' ORDER BY id`
  return [
    { dbName: managementDbName(), companyId: null, companyName: "قاعدة الإدارة" },
    ...companies.map((row: any) => ({ dbName: String(row.db_name), companyId: Number(row.id), companyName: String(row.name || row.db_name) })),
  ]
}

/** النسخ المجدول اليومي: كل القواعد بالتتابع ثم حذف ما تجاوز مدة الاحتفاظ */
export async function runScheduledBackups(by = "جدولة") {
  await ensureBackupTables()
  const results: { db_name: string; company_name: string; ok: boolean; backup_id?: number; error?: string }[] = []
  for (const target of await backupTargets()) {
    try {
      results.push({ db_name: target.dbName, company_name: target.companyName, ok: true, backup_id: await backupDatabase(target, "scheduled", by) })
    } catch (error) {
      results.push({ db_name: target.dbName, company_name: target.companyName, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { results, pruned: await pruneBackups() }
}

export async function deleteBackup(id: number) {
  const row = (await managementSql`SELECT * FROM db_backups WHERE id = ${id}`)[0]
  if (!row) return false
  if (row.object_key) {
    const { client, bucket } = storage()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(row.object_key) }))
  }
  await managementSql`DELETE FROM db_backups WHERE id = ${id}`
  return true
}

export async function pruneBackups() {
  const days = backupRetentionDays()
  const old = await managementSql`
    SELECT id FROM db_backups
    WHERE started_at < NOW() - make_interval(days => ${days}) AND status <> 'running'
    ORDER BY id
  `
  let removed = 0
  for (const row of old) {
    try { if (await deleteBackup(Number(row.id))) removed++ } catch (error) { console.error("[backups] prune", row.id, error) }
  }
  return removed
}

export async function openBackupStream(objectKey: string) {
  const { client, bucket } = storage()
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
  return { body: result.Body as Readable, size: Number(result.ContentLength) || undefined }
}

/**
 * استعادة نسخة إلى قاعدتها: نسخة أمان (pre_restore) أولاً، ثم pg_restore يحوّل الملف إلى SQL يُمرَّر لـ psql
 * بمعاملة واحدة تبدأ بحذف مخطط public وإعادة إنشائه. فشل أي أمر ⇐ ROLLBACK كامل وتبقى القاعدة كما كانت.
 */
export async function restoreBackup(backupId: number, by: string, onDone?: () => void) {
  await ensureBackupTables()
  const backup = (await managementSql`SELECT * FROM db_backups WHERE id = ${backupId} AND status = 'done'`)[0]
  if (!backup?.object_key) throw new Error("النسخة غير موجودة أو غير مكتملة")
  const dbName = String(backup.db_name)
  if (dbName === managementDbName()) throw new Error("استعادة قاعدة الإدارة تتم يدوياً (pg_restore) لأنها تحوي سجل النسخ نفسه")
  if (busy.has(dbName)) throw new Error(`توجد عملية نسخ/استعادة جارية على ${dbName}`)
  const job = (await managementSql`
    INSERT INTO db_restore_jobs (backup_id, db_name, company_name, requested_by) VALUES (${backupId}, ${dbName}, ${backup.company_name}, ${by}) RETURNING id
  `)[0]
  const jobId = Number(job.id)

  void exclusive(dbName, async () => {
    const file = tempFile(dbName)
    try {
      const safetyId = await dumpAndUpload({ dbName, companyId: backup.company_id === null ? null : Number(backup.company_id), companyName: String(backup.company_name || dbName) }, "pre_restore", by)
      await managementSql`UPDATE db_restore_jobs SET safety_backup_id = ${safetyId} WHERE id = ${jobId}`
      const { body } = await openBackupStream(String(backup.object_key))
      await pipeline(body, createWriteStream(file))

      const restore = spawn(pgTool("pg_restore"), ["--no-owner", "--no-privileges", "--file=-", file], { env: pgEnv(dbName), windowsHide: true })
      const psql = spawn(pgTool("psql"), ["--no-psqlrc", "--quiet", "--set", "ON_ERROR_STOP=1", "--single-transaction", "--dbname", dbName, "--file=-"], { env: pgEnv(dbName), windowsHide: true, stdio: ["pipe", "ignore", "pipe"] })
      psql.stdin!.write("DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n")
      restore.stdout!.pipe(psql.stdin!)
      await Promise.all([waitFor(restore, "pg_restore"), waitFor(psql, "psql")])
      await managementSql`UPDATE db_restore_jobs SET status = 'done', finished_at = NOW() WHERE id = ${jobId}`
      onDone?.()
    } catch (error) {
      await managementSql`UPDATE db_restore_jobs SET status = 'failed', error = ${error instanceof Error ? error.message : String(error)}, finished_at = NOW() WHERE id = ${jobId}`
    } finally {
      await unlink(file).catch(() => undefined)
    }
  }).catch(async (error) => {
    await managementSql`UPDATE db_restore_jobs SET status = 'failed', error = ${error instanceof Error ? error.message : String(error)}, finished_at = NOW() WHERE id = ${jobId}`
  })
  return jobId
}
