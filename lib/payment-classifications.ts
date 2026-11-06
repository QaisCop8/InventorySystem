import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// جدول تصنيفات الدفعة (تصنيف الدفعة في سندات القبض/الصرف والقيود وإشعارات الدائن)، يُدار من التعريفات الأساسية.
export const ensurePaymentClassificationsTable = async () => { return runSchemaOnce("app/api/payment-classifications/route.ts#ensureTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS payment_classifications_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      status INTEGER DEFAULT 1
    )
  `
  await sql`
    INSERT INTO payment_classifications_tbl (name)
    VALUES ('نقدي'), ('آجل'), ('تحويل بنكي')
    ON CONFLICT (name) DO NOTHING
  `
}) }
