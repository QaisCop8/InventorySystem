import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/**
 * رقم الفرع (2026-11-19): فروع الشركة رقمها فريد بينها، وفروع البنوك رقمها فريد داخل البنك نفسه فقط —
 * رقم الفرع في الشامل (Branch ID) يتكرر بين البنوك (0480 لبنك القدس ولبنك فلسطين)، فكان القيد العام
 * branches_branch_code_key يجبر الترحيل على دمج رقم البنك مع رقم الفرع (00820480).
 * provisioning.ts يستخدم ON CONFLICT (branch_code) WHERE NOT COALESCE(is_bank_branch, false) — يطابق الفهرس الأول.
 */
export function ensureBranchCodeIndexes() {
  return runSchemaOnce("lib/branch-codes.ts#ensureBranchCodeIndexes", async () => {
    await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_bank_branch BOOLEAN DEFAULT false`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS branches_company_code_uq ON branches (branch_code) WHERE NOT COALESCE(is_bank_branch, false)`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS branches_bank_code_uq ON branches (bank_id, branch_code) WHERE COALESCE(is_bank_branch, false)`
    await sql`ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_branch_code_key`
  })
}
