import sql, { resolveCurrentDbName } from "./database"
import { runSchemaOnce } from "@/lib/schema-once"

const orderColumnsReady = new Map<string, Promise<void>>()

/** Prepare columns used by order lists and navigation in older tenant databases. */
export async function ensureOrderReadColumns(): Promise<void> { return runSchemaOnce("lib/order-schema.ts#ensureOrderReadColumns", async () => {
  const databaseName = await resolveCurrentDbName()
  let ready = orderColumnsReady.get(databaseName)
  if (!ready) {
    ready = (async () => {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER`
      await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS workflow_id INTEGER`
      // رقم الطلبية 10 خانات (بادئة + دفتر + تسلسل، والمرحّلة من الشامل): قواعد قديمة فيها العمود أقصر فيُقصّ/يُرفض
      await sql.unsafe(`DO $$ BEGIN
        IF (SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'order_number') < 30 THEN
          ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(30);
        END IF;
      END $$`, [])
    })().catch((error: unknown) => {
      orderColumnsReady.delete(databaseName)
      throw error
    })
    orderColumnsReady.set(databaseName, ready)
  }
  await ready
}) }
