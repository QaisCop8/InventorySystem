import sql, { resolveCurrentDbName } from "./database"

const orderColumnsReady = new Map<string, Promise<void>>()

/** Prepare columns used by order lists and navigation in older tenant databases. */
export async function ensureOrderReadColumns(): Promise<void> {
  const databaseName = await resolveCurrentDbName()
  let ready = orderColumnsReady.get(databaseName)
  if (!ready) {
    ready = (async () => {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER`
      await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS workflow_id INTEGER`
    })().catch((error: unknown) => {
      orderColumnsReady.delete(databaseName)
      throw error
    })
    orderColumnsReady.set(databaseName, ready)
  }
  await ready
}
