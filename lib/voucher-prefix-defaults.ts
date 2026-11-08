import sql, { resolveCurrentDbName } from "@/lib/database"

// بادئات افتراضية جديدة (2026-11-08) بدل INV المشتركة: فاتورة مشتريات PU، مرتجع مبيعات RIN، إرسالية برسم البيع CSL،
// ومرتجعها RCS. الشركات القائمة حُفظت فيها INV (تأسيس الشركة لفاتورة المشتريات، وحفظ شاشة إعدادات النظام لكل البادئات)
// ⇐ تُحوَّل مرة واحدة لكل شركة ما بقيت INV فقط؛ علامة voucher_prefix_defaults_v1 تمنع إعادتها (اختيار INV لاحقاً يبقى).
const PREFIX_DEFAULTS: [key: string, prefix: string][] = [
  ["purchase_invoice_prefix", "PU"],
  ["return_sell_prefix", "RIN"],
  ["delivery_consignment_sale_prefix", "CSL"],
  ["return_delivery_consignment_sale_prefix", "RCS"],
]
const MARKER = "voucher_prefix_defaults_v1"
const doneByDb = new Map<string, Promise<void>>()

export function ensureVoucherPrefixDefaults(): Promise<void> {
  return resolveCurrentDbName().then((dbName) => {
    let done = doneByDb.get(dbName)
    if (!done) {
      done = (async () => {
        const marked = await sql`SELECT 1 FROM system_settings WHERE id::text = ${MARKER} OR description = ${MARKER} LIMIT 1`
        if (marked.length) return
        for (const [key, prefix] of PREFIX_DEFAULTS) {
          await sql`UPDATE system_settings SET value = ${prefix} WHERE (id::text = ${key} OR description = ${key}) AND UPPER(BTRIM(COALESCE(value, ''))) = 'INV'`
        }
        await sql`INSERT INTO system_settings (id, description, value) VALUES (${MARKER}, ${MARKER}, '1') ON CONFLICT DO NOTHING`
      })().catch((error) => {
        // قاعدة بلا جدول system_settings (42P01): لا شيء لتحويله — لا تُعاد المحاولة مع كل طلب
        if ((error as { code?: string })?.code === "42P01") return
        doneByDb.delete(dbName)
        console.error("[voucher-prefix-defaults] failed", error)
      })
      doneByDb.set(dbName, done)
    }
    return done
  })
}
