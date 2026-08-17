import type { PoolClient } from "pg"

export class DraftValidationError extends Error {}

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))

export function validateDraftPayload(data: any) {
  if (!Number.isInteger(Number(data.account_id)) || Number(data.account_id) <= 0) throw new DraftValidationError("حساب العميل مطلوب")
  if (!validDate(data.order_date)) throw new DraftValidationError("تاريخ الطلب مطلوب وغير صالح")
  if (!validDate(data.requested_delivery_date)) throw new DraftValidationError("تاريخ التسليم مطلوب وغير صالح")
  if (String(data.requested_delivery_date) < String(data.order_date)) throw new DraftValidationError("تاريخ التسليم لا يمكن أن يسبق تاريخ الطلب")
  const deposit = Number(data.deposit_amount)
  if (!Number.isFinite(deposit) || deposit < 0) throw new DraftValidationError("مبلغ العربون يجب أن يكون صفراً أو أكبر")
  if (!Array.isArray(data.items) || data.items.length === 0) throw new DraftValidationError("يجب إدخال صنف واحد على الأقل")
  for (const item of data.items) {
    const quantity = Number(item.quantity), price = Number(item.price), discount = Number(item.discount)
    if (!Number.isInteger(Number(item.product_id)) || Number(item.product_id) <= 0 || !Number.isFinite(quantity) || quantity <= 0) throw new DraftValidationError("بيانات الصنف أو الكمية غير صالحة")
    if (!Number.isFinite(price) || price < 0) throw new DraftValidationError(`سعر الصنف ${item.product_name || ""} غير صالح`)
    if (!Number.isFinite(discount) || discount < 0 || discount > quantity * price) throw new DraftValidationError(`خصم الصنف ${item.product_name || ""} غير صالح`)
  }
  const orderTotal = data.items.reduce((sum: number, item: any) => sum + Number(item.quantity) * Number(item.price) - Number(item.discount), 0)
  if (deposit > orderTotal) throw new DraftValidationError("مبلغ العربون لا يمكن أن يتجاوز إجمالي الطلبية")
  const attachments = Array.isArray(data.attachments) ? data.attachments : []
  if (attachments.some((a: any) => !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(String(a.type || "")) || Number(a.size || 0) > 5 * 1024 * 1024 || String(a.data || "").length > 7_000_000)) throw new DraftValidationError("المرفقات المسموحة صور أو PDF وبحد أقصى 5MB للملف")
  if (deposit > 0 && (!Number.isInteger(Number(data.created_by)) || Number(data.created_by) <= 0)) throw new DraftValidationError("تعذر تحديد المستخدم لإنشاء سند قبض العربون")
  return { deposit, attachments }
}

export async function validateDraftReferences(client: PoolClient, data: any) {
  const accountResult = await client.query("SELECT id, name FROM account_tbl WHERE id=$1 AND type=2 AND COALESCE(status,1) IN (1,2) LIMIT 1", [Number(data.account_id)])
  if (!accountResult.rowCount) throw new DraftValidationError("حساب العميل غير موجود أو ليس من النوع 2")
  const ids = [...new Set(data.items.map((item: any) => Number(item.product_id)))]
  const productsResult = await client.query("SELECT id, product_name, minimum_order_quantity FROM products WHERE id=ANY($1::int[])", [ids])
  for (const item of data.items) {
    const product = productsResult.rows.find((row: any) => Number(row.id) === Number(item.product_id))
    if (!product) throw new DraftValidationError("أحد الأصناف المحددة غير موجود")
    if (Number(item.quantity) < Number(product.minimum_order_quantity || 0)) throw new DraftValidationError(`الحد الأدنى لطلب ${product.product_name} هو ${product.minimum_order_quantity}`)
  }
  return accountResult.rows[0]
}

export async function syncDepositReceipt(client: PoolClient, args: { draftId: number; draftNumber: string; receiptVoucherId?: number | null; accountId: number; customerName: string; orderDate: string; deposit: number; userId: number }) {
  const { draftId, draftNumber, accountId, customerName, orderDate, deposit, userId } = args
  let receiptId = Number(args.receiptVoucherId || 0) || null
  if (deposit <= 0) {
    if (receiptId) await client.query("UPDATE voucher_header_tbl SET status=3, vch_status=1, amount=0, cash_amount=0, last_update_date=CURRENT_TIMESTAMP WHERE id=$1 AND status<>2", [receiptId])
    return receiptId
  }
  const defaults = await client.query(`SELECT u.currency_id,u.account_id AS cash_account_id FROM users_currencies_default_account_tbl u JOIN account_tbl a ON a.id=u.account_id WHERE u.user_id=$1 AND u.currency_id IS NOT NULL AND COALESCE(a.status,1) IN (1,2) ORDER BY u.currency_id LIMIT 1`, [userId])
  if (!defaults.rowCount) throw new DraftValidationError("يجب تعريف حساب النقدية والعملة الافتراضية للمستخدم قبل حفظ عربون")
  const { currency_id: currencyId, cash_account_id: cashAccountId } = defaults.rows[0]
  const note = `عربون مسودة طلبية ${draftNumber}`
  if (receiptId) {
    const updated = await client.query(`UPDATE voucher_header_tbl SET vch_date=$2,currency_id=$3,rate=1,account_id=$4,customer_name=$5,to_account_id=$4,cash_amount=$6,cash_account_id=$7,check_amount=0,credit_card_amount=0,amount=$6,note=$8,status=1,vch_status=1,draft_code=$9,last_update_date=CURRENT_TIMESTAMP WHERE id=$1 AND status<>2 RETURNING id`, [receiptId, orderDate, currencyId, accountId, customerName, deposit, cashAccountId, note, draftNumber])
    if (!updated.rowCount) throw new DraftValidationError("سند العربون مُرحّل ولا يمكن تعديل المسودة")
  } else {
    const code = `DEP-${draftNumber}`.slice(0, 30)
    const inserted = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,currency_id,rate,account_id,customer_name,to_account_id,cash_amount,cash_account_id,check_amount,credit_card_amount,amount,note,status,vch_status,is_printed,insert_user,draft_code) VALUES (4,$1,$2,$3,1,$4,$5,$4,$6,$7,0,0,$6,$8,1,1,0,$9,$10) RETURNING id`, [code, orderDate, currencyId, accountId, customerName, deposit, cashAccountId, note, userId, draftNumber])
    receiptId = inserted.rows[0].id
    await client.query("UPDATE sales_order_drafts SET receipt_voucher_id=$1 WHERE id=$2", [receiptId, draftId])
  }
  await client.query("DELETE FROM voucher_journal_detail_tbl WHERE voucher_id=$1", [receiptId])
  await client.query(`INSERT INTO voucher_journal_detail_tbl (voucher_id,order_no,journal_type_id,account_id,credit_debit,amount,currency_id,rate,base_curr_amount,note) VALUES ($1,1,2,$2,1,$3,$4,1,$3,'نقدي'),($1,2,5,$5,2,$3,$4,1,$3,'عربون طلبية')`, [receiptId, cashAccountId, deposit, currencyId, accountId])
  return receiptId
}
