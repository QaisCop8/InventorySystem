import sql, { resolveCurrentDbName } from "@/lib/database"

// دوال ensure* (إنشاء/ترقية الجداول) كانت تُنفَّذ كاملة مع كل طلب — ensureTables لسندات القبض وحدها ~150
// أمراً متتالياً، منها تحديثات تمسح جداول كاملة. محلياً لا يُلاحَظ ذلك، أما مع قاعدة بعيدة (Neon من
// Cloudflare) فكل أمر رحلة شبكة ← ثوانٍ لكل طلب، وكل نسخة (isolate) جديدة تُعيدها من البداية.
//
// runSchemaOnce يُشغّل جسم الدالة مرة واحدة لكل قاعدة شركة ولكل نسخة من كود الدالة، ويُسجّل ذلك في
// app_schema_state بالقاعدة نفسها: أي نسخة خادم لاحقة تقرأ الجدول مرة واحدة (استعلام واحد) وتتخطّى ما
// طُبِّق. تعديل كود الدالة يغيّر بصمتها فتُعاد مرة واحدة تلقائياً. ارفع SCHEMA_ONCE_EPOCH لإجبار إعادة
// تشغيل كل الدوال (مثلاً بعد تعديل ثابت أو دالة مساعدة تستدعيها دالة ensure دون تغيّر نصّها).
const SCHEMA_ONCE_EPOCH = 1

const appliedByDb = new Map<string, Promise<Map<string, string>>>()
const inFlight = new Map<string, Promise<void>>()
const versionByFn = new WeakMap<() => Promise<unknown>, string>()

function fingerprint(text: string): string {
  // FNV-1a 32-bit — يكفي لكشف تغيّر نص الدالة
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${SCHEMA_ONCE_EPOCH}:${(hash >>> 0).toString(16)}:${text.length}`
}

function loadApplied(dbName: string): Promise<Map<string, string>> {
  let pending = appliedByDb.get(dbName)
  if (!pending) {
    pending = (async () => {
      try {
        const rows = await sql`SELECT key, version FROM app_schema_state`
        return new Map<string, string>(rows.map((row: { key: string; version: string }) => [row.key, row.version]))
      } catch {
        return new Map<string, string>() // الجدول غير موجود بعد ← لم يُطبَّق شيء
      }
    })()
    appliedByDb.set(dbName, pending)
  }
  return pending
}

export async function runSchemaOnce(key: string, body: () => Promise<unknown>): Promise<void> {
  let version = versionByFn.get(body)
  if (!version) {
    version = fingerprint(body.toString())
    versionByFn.set(body, version)
  }
  const dbName = await resolveCurrentDbName()
  const applied = await loadApplied(dbName)
  if (applied.get(key) === version) return

  const flightKey = `${dbName}\u0000${key}`
  let pending = inFlight.get(flightKey)
  if (!pending) {
    pending = (async () => {
      await body()
      await sql`
        CREATE TABLE IF NOT EXISTS app_schema_state (
          key TEXT PRIMARY KEY,
          version TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`
        INSERT INTO app_schema_state (key, version, applied_at) VALUES (${key}, ${version}, NOW())
        ON CONFLICT (key) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW()
      `
      applied.set(key, version!)
    })().finally(() => inFlight.delete(flightKey))
    inFlight.set(flightKey, pending)
  }
  await pending
}
