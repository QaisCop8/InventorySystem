import sql from "@/lib/database"
import { getSystemSettingValue } from "@/lib/system-settings"
import { ITEM_LEVEL_VAT_SETTING, settingEnabled } from "@/lib/item-vat"

/** هل الضريبة على مستوى الصنف مفعّلة؟ (الإعدادات العامة) */
export async function itemLevelVatEnabled() {
  return settingEnabled(await getSystemSettingValue<unknown>(ITEM_LEVEL_VAT_SETTING, false))
}

/**
 * نسبة ضريبة كل صنف: التصنيف الضريبي للصنف (tax_classifications.tax_percent) ثم products.tax_rate؛
 * صنف بلا نسبة معرّفة ⇐ null (تُستخدم نسبة السند). products.tax_rate قيمته الافتراضية 0 لكل الأصناف فتُعدّ
 * "غير معرّفة" — الصنف المعفى يُعرَّف بتصنيف ضريبي نسبته 0.
 */
export async function itemVatRates(productIds: number[]): Promise<Map<number, number | null>> {
  const ids = [...new Set(productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  const result = new Map<number, number | null>()
  if (!ids.length) return result
  const rows = (await sql`
    SELECT p.id,
      COALESCE(
        (SELECT tc.tax_percent FROM tax_classifications tc WHERE tc.id = p.tax_classification_id AND COALESCE(tc.status, 1) <> 3),
        NULLIF(p.tax_rate, 0)
      )::float AS rate
    FROM products p WHERE p.id = ANY(${ids}::int[])
  `.catch(async () => sql`SELECT id, NULLIF(tax_rate, 0)::float AS rate FROM products WHERE id = ANY(${ids}::int[])`)) as any[]
  for (const row of rows) result.set(Number(row.id), row.rate == null ? null : Number(row.rate))
  return result
}
