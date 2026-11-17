import sql from "@/lib/database"

/**
 * فئة السعر المطلوبة إن كانت موجودة، وإلا أول فئة فعّالة (أصغر رقم) — شاشات كثيرة تفترض الفئة 1، وقد تُحذف
 * (تصفير قوائم ترحيل الشامل مثلاً) فيظهر سعر كل صنف صفراً في بحث الأصناف (2026-11-17).
 */
export async function resolvePriceCategoryId(requested: number): Promise<number> {
  const rows = (await sql`
    SELECT id FROM (
      SELECT id, 0 AS rank FROM pricecategory WHERE id = ${requested}
      UNION ALL
      SELECT id, 1 AS rank FROM pricecategory WHERE COALESCE(status, 1) <> 3
    ) c ORDER BY rank, id LIMIT 1`) as any[]
  return rows[0] ? Number(rows[0].id) : requested
}
