import { NextResponse, type NextRequest } from "next/server"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { ensureTables as ensureVoucherBookTables } from "@/app/api/voucher-book-permissions/_lib"
import { ensureTables as ensureCreditCardTables } from "@/app/api/credit-cards/_lib"
import { AutoJournalError, ensureAutoJournalTables } from "@/lib/auto-journals"

export async function ensureAutoJournalSchema() {
  await ensureVoucherTables()
  await ensureVoucherBookTables()
  await ensureCreditCardTables()
  await ensureAutoJournalTables()
}

// القيود الآلية تُنشأ مُرحَّلة مباشرة — تتطلب صلاحيتي إدخال وترحيل سند القيد (كما في Shamel:
// EnterJournalVoucher) على الفرع المحدد.
export async function authorizeAutoJournal(request: NextRequest, branchValue?: unknown) {
  const create = await authorizeTransaction(request, "journal", "create", branchValue)
  if (!create.ok) return create
  const post = await authorizeTransaction(request, "journal", "post", create.branchId)
  if (!post.ok) return post
  return create
}

export function autoJournalErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AutoJournalError) return NextResponse.json({ error: error.message }, { status: 400 })
  console.error(fallback, error)
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}

export const positiveIds = (value: unknown): number[] =>
  Array.from(new Set((Array.isArray(value) ? value : String(value || "").split(",")).map(Number).filter((id) => Number.isInteger(id) && id > 0)))
