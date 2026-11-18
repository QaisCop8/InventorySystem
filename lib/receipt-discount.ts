import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { getSystemSettingValue } from "@/lib/system-settings"
import {
  ensureTables as ensureCreditNoteTables,
  buildCreditNoteJournalRows,
  saveJournalRows,
  CREDIT_NOTE_VCH_TYPE,
  getCreditNoteNumberSettings,
  buildVoucherCode,
  nextVoucherSequence,
  resolveVoucherBookName,
} from "@/app/api/credit-notes/_lib"

// خصم سند القبض (2026-11-18): مبلغ خصم يُدخل في سند القبض (لا يتجاوز مبلغ السند، ولمن يملك صلاحية إضافة إشعار دائن)،
// وعند الحفظ يُنشأ/يُحدَّث إشعار دائن على العميل: مدين حساب «خصم مسموح به» (إعدادات الحسابات الافتراضية)، دائن العميل.
// الربط بجدول receipt_discount_notes؛ حالة الإشعار تتبع السند، وحذف الخصم أو إلغاء السند يلغي الإشعار.

export const RECEIPT_VCH_TYPE = 4

export const ensureReceiptDiscountSchema = () => runSchemaOnce("lib/receipt-discount#schema-v1", async () => {
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS receipt_discount NUMERIC(18,4)`
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_discount_notes (
      receipt_id INTEGER PRIMARY KEY REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      credit_note_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE
    )`
})

const partyOf = (data: any) => Number(data.to_account_id || data.account_id) || 0

/** فحص قبل حفظ السند: يعيد رسالة خطأ أو null. */
export async function validateReceiptDiscount(request: NextRequest, data: any, branchId: number | null, receiptAmount: number): Promise<{ error: string; status: number } | null> {
  if (Number(data.vch_type) !== RECEIPT_VCH_TYPE) return null
  const discount = Number(data.receipt_discount || 0)
  if (!discount) return null
  if (!Number.isFinite(discount) || discount < 0) return { error: "مبلغ الخصم غير صالح", status: 400 }
  if (discount > receiptAmount + 0.0001) return { error: `الخصم (${discount}) أكبر من مبلغ السند (${receiptAmount})`, status: 400 }
  if (!partyOf(data)) return { error: "الخصم يحتاج اختيار العميل في السند", status: 400 }
  const permission = await authorizeTransaction(request, "credit_note", "create", branchId)
  if (!permission.ok) return { error: "لا تملك صلاحية إضافة إشعار دائن — لا يمكن إدخال خصم في سند القبض", status: 403 }
  const discountAccount = Number(await getSystemSettingValue<unknown>("default_allowed_discount_account", 0)) || 0
  if (!discountAccount) return { error: "عرّف «حساب خصم مسموح به» في الحسابات الافتراضية قبل إدخال خصم في سند القبض", status: 400 }
  return null
}

/** بعد حفظ السند: إنشاء/تحديث/إلغاء إشعار الدائن المرتبط. يعيد رقم الإشعار (إن وُجد). */
export async function syncReceiptDiscountNote(request: NextRequest, receipt: any, data: any, userId: number | null): Promise<string | null> {
  if (Number(receipt.vch_type) !== RECEIPT_VCH_TYPE) return null
  await ensureReceiptDiscountSchema()
  await ensureCreditNoteTables()
  const status = Number(receipt.status || 1)
  const discount = status === 3 ? 0 : Math.max(0, Number(data.receipt_discount || 0))
  await sql`UPDATE voucher_header_tbl SET receipt_discount = ${discount || null} WHERE id = ${receipt.id}`
  const [link] = (await sql`
    SELECT l.credit_note_id, h.vch_code FROM receipt_discount_notes l JOIN voucher_header_tbl h ON h.id = l.credit_note_id
    WHERE l.receipt_id = ${receipt.id} AND COALESCE(h.status, 1) <> 3`) as any[]

  if (!discount) {
    if (link) await sql`UPDATE voucher_header_tbl SET status = 3, vch_status = 3 WHERE id = ${link.credit_note_id}`
    return null
  }

  const discountAccount = Number(await getSystemSettingValue<unknown>("default_allowed_discount_account", 0)) || 0
  const party = partyOf(receipt) || partyOf(data)
  const note = {
    vch_type: CREDIT_NOTE_VCH_TYPE, currency_id: receipt.currency_id || null, rate: Number(receipt.rate || 1),
    account_id: party, debit_account_id: discountAccount, amount: discount, amount_journal_type_8: discount, vat: 0,
  }
  const journalRows = buildCreditNoteJournalRows(note, CREDIT_NOTE_VCH_TYPE)
  const text = `خصم سند القبض ${receipt.vch_code}`
  const [party_row] = (await sql`SELECT name FROM account_tbl WHERE id = ${party}`) as any[]

  if (link) {
    await sql`
      UPDATE voucher_header_tbl SET vch_date = ${receipt.vch_date}, currency_id = ${note.currency_id}, rate = ${note.rate},
        account_id = ${party}, customer_name = ${party_row?.name || ""}, debit_account_id = ${discountAccount},
        amount = ${discount}, amount_journal_type_8 = ${discount}, status = ${status}, vch_status = ${status === 2 ? 2 : 1}, note = ${text}
      WHERE id = ${link.credit_note_id}`
    await saveJournalRows(Number(link.credit_note_id), journalRows)
    return String(link.vch_code)
  }

  const settings = await getCreditNoteNumberSettings(request.url, CREDIT_NOTE_VCH_TYPE)
  const book = (await sql`
    SELECT p.vch_book_id FROM voucher_book_user_permissions_tbl p
    LEFT JOIN user_settings us ON us.id = p.user_id
    WHERE p.voucher_type_id = ${CREDIT_NOTE_VCH_TYPE}
    ORDER BY (us.user_id = ${userId}) DESC, COALESCE(p.is_default, 0) DESC, p.vch_book_id LIMIT 1`.catch(() => []) as any[])[0]
  const bookId = book ? Number(book.vch_book_id) : null
  const bookName = await resolveVoucherBookName(bookId, receipt.branch_id ?? null)
  let created: any = null
  for (let attempt = 0; attempt < 10 && !created; attempt += 1) {
    const code = buildVoucherCode(settings.prefix, bookName, await nextVoucherSequence(CREDIT_NOTE_VCH_TYPE, `${settings.prefix}${bookName}`, settings.startNumber))
    try {
      created = (await sql`
        INSERT INTO voucher_header_tbl (
          vch_type, vch_code, vch_date, vch_book_id, branch_id, currency_id, rate, account_id, customer_name, debit_account_id,
          amount, amount_journal_type_8, vat, vat_percent, salesman_id, manual_voucher, note, status, vch_status, is_printed, insert_user
        ) VALUES (
          ${CREDIT_NOTE_VCH_TYPE}, ${code}, ${receipt.vch_date}, ${bookId}, ${receipt.branch_id ?? null}, ${note.currency_id}, ${note.rate}, ${party}, ${party_row?.name || ""}, ${discountAccount},
          ${discount}, ${discount}, 0, 0, ${receipt.salesman_id || null}, ${receipt.vch_code}, ${text}, ${status}, ${status === 2 ? 2 : 1}, 0, ${userId}
        ) RETURNING id, vch_code`)[0]
    } catch (error: any) {
      if (String(error?.code || "") !== "23505") throw error
    }
  }
  if (!created) throw new Error("تعذر توليد رقم إشعار دائن لخصم سند القبض")
  await saveJournalRows(Number(created.id), journalRows)
  await sql`INSERT INTO receipt_discount_notes (receipt_id, credit_note_id) VALUES (${receipt.id}, ${created.id})
    ON CONFLICT (receipt_id) DO UPDATE SET credit_note_id = EXCLUDED.credit_note_id`
  return String(created.vch_code)
}

/** رقم إشعار الدائن الفعّال المرتبط بخصم السند (للعرض)، وإلغاؤه عند حذف السند. */
export async function receiptDiscountNoteCode(receiptId: number): Promise<string | null> {
  await ensureReceiptDiscountSchema()
  const [row] = (await sql`
    SELECT h.vch_code FROM receipt_discount_notes l JOIN voucher_header_tbl h ON h.id = l.credit_note_id
    WHERE l.receipt_id = ${receiptId} AND COALESCE(h.status, 1) <> 3`) as any[]
  return row ? String(row.vch_code) : null
}

export async function cancelReceiptDiscountNote(receiptId: number) {
  await ensureReceiptDiscountSchema()
  await sql`
    UPDATE voucher_header_tbl h SET status = 3, vch_status = 3
    FROM receipt_discount_notes l WHERE l.receipt_id = ${receiptId} AND h.id = l.credit_note_id`
}
