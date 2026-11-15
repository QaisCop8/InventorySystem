import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// الحسابات الافتراضية لكل مستخدم/فرع/عملة (صندوق، شيكات واردة/مرتجعة، بطاقات). الجدول كان يُنشأ في أكثر من مكان
// (نقطة البيع بلا branch_id) فيفشل أول استعلام يستخدم branch_id قبل فتح شاشة الإعدادات — تعريف واحد هنا لكل المستخدمين.
export const ensureUsersCurrenciesDefaultTable = () => runSchemaOnce("lib/users-currencies-default.ts#ensureUsersCurrenciesDefaultTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS users_currencies_default_account_tbl (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      currency_id INTEGER,
      account_id INTEGER,
      received_cheqs_account_id INTEGER,
      returned_cheqs_account_id INTEGER,
      cards_account_id INTEGER,
      branch_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS received_cheqs_account_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS returned_cheqs_account_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS cards_account_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS branch_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
})
