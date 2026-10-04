import { NextRequest } from "next/server"
import sql from "@/lib/database"
import { POST as createReceipt, PUT as updateReceipt } from "@/app/api/receipts/route"
import { PAYMENT_VCH_TYPE, RECEIPT_VCH_TYPE, buildVoucherCode, getVoucherNumberSettings, nextVoucherSequence } from "@/app/api/receipts/_lib"
import { groupPosReceiptPayments, isPosReceiptPayment, posReceiptAmounts, type PosReceiptPayment } from "@/lib/pos-receipt"

async function receiptResult(response: Response) {
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(String(data.error || "تعذر حفظ سند القبض المرتبط")), { status: response.status })
  return data
}

export async function createPosReceipt(request: NextRequest, invoice: any, point: any, userId: string, payments: PosReceiptPayment[]) {
  const receipts: any[] = []
  for (const group of groupPosReceiptPayments(payments, Number(invoice.currency_id), Number(invoice.rate))) {
    let receiptPoint = point
    if (group.currency_id !== Number(invoice.currency_id)) {
      const defaults = await sql`
        SELECT d.received_cheqs_account_id FROM users_currencies_default_account_tbl d
        JOIN user_settings u ON d.user_id=u.id
        WHERE u.user_id::text=${userId} AND d.currency_id=${group.currency_id}
          AND to_jsonb(d)->>'branch_id'=${String(point.branch_id)}
        ORDER BY d.id DESC LIMIT 1
      `
      receiptPoint = { ...point, cheque_account_id: Number(defaults[0]?.received_cheqs_account_id) || point.cheque_account_id }
    }
    receipts.push(await createPosReceiptGroup(request, { ...invoice, currency_id: group.currency_id, rate: group.rate }, receiptPoint, userId, group.payments))
  }
  const primary = receipts[0]
  if (!primary) throw new Error("لا توجد دفعات لإنشاء سند القبض")
  await sql`UPDATE voucher_header_tbl SET pos_receipt_voucher_id=${Number(primary.id)} WHERE id=${Number(invoice.id)}`
  return { ...primary, receipts }
}

export async function createPosReturnPayment(request: NextRequest, invoice: any, point: any, userId: string, payments: PosReceiptPayment[]) {
  const cashAmount = Math.round(payments
    .filter(payment => payment.payment_method === "cash")
    .reduce((total, payment) => total + Number(payment.amount || 0), 0) * 100) / 100
  if (cashAmount <= 0) return null

  const books = await sql`
    SELECT b.id,b.name FROM voucher_book_user_permissions_tbl p
    JOIN user_settings u ON u.id=p.user_id
    JOIN voucher_books_tbl b ON b.id=p.vch_book_id
    WHERE u.user_id=${userId} AND p.voucher_type_id=${PAYMENT_VCH_TYPE}
    ORDER BY p.is_default DESC,b.id LIMIT 1
  `
  const book = books[0]
  if (!book) throw Object.assign(new Error("يجب تعيين دفتر سند صرف للمستخدم لحفظ المردود النقدي"), { status: 400 })
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-payment-number:${book.id}`}))`
  const { prefix, startNumber } = await getVoucherNumberSettings(request.url, PAYMENT_VCH_TYPE)
  const sequence = await nextVoucherSequence(PAYMENT_VCH_TYPE, `${prefix}${book.name}`, startNumber)
  const customerAccountId = Number(invoice.account_id) || Number(point.walk_in_account_id)
  if (!customerAccountId || !Number(point.cash_account_id)) {
    throw Object.assign(new Error("يجب تعريف حساب العميل وحساب الصندوق لإنشاء سند صرف المردود"), { status: 400 })
  }

  const payment = await receiptResult(await createReceipt(new NextRequest(new URL("/api/receipts", request.url), {
    method: "POST", headers: request.headers, body: JSON.stringify({
      vch_type: PAYMENT_VCH_TYPE,
      vch_code: buildVoucherCode(prefix, book.name, sequence),
      vch_book_id: Number(book.id),
      vch_date: invoice.vch_date,
      branch_id: Number(point.branch_id),
      currency_id: Number(invoice.currency_id),
      rate: Number(invoice.rate),
      account_id: customerAccountId,
      to_account_id: customerAccountId,
      customer_name: invoice.customer_name,
      amount: cashAmount,
      cash_amount: cashAmount,
      cash_account_id: Number(point.cash_account_id),
      status: 2,
      insert_user: invoice.insert_user,
      salesman_id: invoice.salesman_id,
      note: `صرف مردود نقدي لفاتورة نقطة البيع ${invoice.vch_code}`,
    }),
  })))
  await sql`UPDATE voucher_header_tbl SET pos_invoice_voucher_id=${Number(invoice.id)} WHERE id=${Number(payment.id)}`
  return payment
}

async function createPosReceiptGroup(request: NextRequest, invoice: any, point: any, userId: string, payments: PosReceiptPayment[]) {
  const books = await sql`
    SELECT b.id,b.name FROM voucher_book_user_permissions_tbl p
    JOIN user_settings u ON u.id=p.user_id
    JOIN voucher_books_tbl b ON b.id=p.vch_book_id
    WHERE u.user_id=${userId} AND p.voucher_type_id=${RECEIPT_VCH_TYPE}
    ORDER BY p.is_default DESC,b.id LIMIT 1
  `
  const book = books[0]
  if (!book) throw Object.assign(new Error("يجب تعيين دفتر سند قبض للمستخدم لحفظ الدفع النقدي مع الذمم أو الشيك أو البطاقة"), { status: 400 })
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-receipt-number:${book.id}`}))`
  const { prefix, startNumber } = await getVoucherNumberSettings(request.url, RECEIPT_VCH_TYPE)
  const sequence = await nextVoucherSequence(RECEIPT_VCH_TYPE, `${prefix}${book.name}`, startNumber)
  const totals = posReceiptAmounts(payments)
  const customerAccountId = Number(invoice.account_id) || null
  const settlementAccountId = customerAccountId || Number(point.cash_account_id)
  if (!settlementAccountId) throw Object.assign(new Error("يجب تعريف حساب الصندوق في نقطة البيع أو في حسابات المستخدم لعملة نقطة البيع"), { status: 400 })
  const receipt = await receiptResult(await createReceipt(new NextRequest(new URL("/api/receipts", request.url), {
    method: "POST", headers: request.headers, body: JSON.stringify({
      vch_type: RECEIPT_VCH_TYPE, vch_code: buildVoucherCode(prefix, book.name, sequence), vch_book_id: Number(book.id),
      vch_date: invoice.vch_date, branch_id: Number(point.branch_id), currency_id: Number(invoice.currency_id), rate: Number(invoice.rate),
      account_id: customerAccountId, to_account_id: settlementAccountId, customer_name: invoice.customer_name,
      ...totals, cash_account_id: Number(point.cash_account_id), check_account_id: Number(point.cheque_account_id), credit_card_account_id: Number(point.card_account_id),
      status: 2, insert_user: invoice.insert_user, salesman_id: invoice.salesman_id,
      note: `قبض فاتورة نقطة البيع ${invoice.vch_code}`,
      // Each cheque group is posted in its original currency and base exchange rate.
      cheques: payments.filter(row => row.payment_method === "cheque" && isPosReceiptPayment(row)).map(row => ({
        bank_account: row.cheque_account, cheq_num: row.reference, bank_id: row.bank_id, branch_id: row.branch_id,
        amount: row.amount, due_date: row.due_date, cheq_owner_name: invoice.customer_name,
      })),
      cards: payments.filter(row => row.payment_method === "card" && isPosReceiptPayment(row)).map(row => ({
        card_type_id: row.card_type_id, card_no: `****${String(row.reference || "").slice(-4)}`,
        expire_date: row.card_expiry ? `${row.card_expiry}-01` : null, account_id: Number(point.card_account_id),
        amount: Number(row.currency_amount ?? row.amount), currency_id: Number(row.currency_id || invoice.currency_id),
      })),
    }),
  })))
  const invoicePaymentNotes: Record<string, string> = {
    cash: "دفعة نقدية - نقطة البيع",
    cheque: "دفعة شيك - نقطة البيع",
    card: "دفعة بطاقة - نقطة البيع",
  }
  for (const payment of payments.filter(row => Number(row.amount) > 0)) {
    if (!isPosReceiptPayment(payment)) continue
    await sql`UPDATE voucher_journal_detail_tbl SET account_id=${settlementAccountId},note=${`فاتورة العميل ${invoice.vch_code}`}
      WHERE voucher_id=${Number(invoice.id)} AND note=${invoicePaymentNotes[payment.payment_method]}`
  }
  await sql`UPDATE voucher_header_tbl SET pos_invoice_voucher_id=${Number(invoice.id)} WHERE id=${Number(receipt.id)}`
  return receipt
}

export async function deletePosRelatedVouchers(request: NextRequest, invoiceId: number) {
  const rows = await sql`
    SELECT related.* FROM voucher_header_tbl invoice
    JOIN voucher_header_tbl related ON
      (related.vch_type=${RECEIPT_VCH_TYPE} AND (related.id=invoice.pos_receipt_voucher_id OR related.pos_invoice_voucher_id=invoice.id)) OR
      (related.vch_type=${PAYMENT_VCH_TYPE} AND related.pos_invoice_voucher_id=invoice.id)
    WHERE invoice.id=${invoiceId}
    FOR UPDATE OF related
  `
  for (const related of rows) {
    if (Number(related.vch_type) === RECEIPT_VCH_TYPE) {
      const cheques = await sql`SELECT id,cheq_num,last_voucher_id,log_id,status_id FROM cheques_tbl WHERE voucher_id=${Number(related.id)} FOR UPDATE`
      if (cheques.some((row:any) => row.last_voucher_id || row.log_id || ![1,2].includes(Number(row.status_id)))) {
      throw Object.assign(new Error("لا يمكن حذف الفاتورة قبل إلغاء الحركات اللاحقة على شيكات سند القبض"), { status: 409 })
      }
    }
    if (Number(related.status) !== 3) {
      await receiptResult(await updateReceipt(new NextRequest(new URL("/api/receipts", request.url), {
        method: "PUT", headers: request.headers, body: JSON.stringify({ ...related, status: 3 }),
      })))
    }
  }
}
