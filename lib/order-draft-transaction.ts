import type { PoolClient } from "pg"
import { getVoucherNumberSettings, nextVoucherSequence, resolveVoucherBookName, RECEIPT_VCH_TYPE } from "@/app/api/receipts/_lib"
import { buildVoucherCode } from "@/lib/voucher-code"

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
    if (!Number.isInteger(Number(item.unit_id)) || Number(item.unit_id) <= 0) throw new DraftValidationError(`يجب تحديد وحدة للصنف ${item.product_name || ""}`)
    if (!(Number(item.store_id) > 0)) throw new DraftValidationError(`يجب تحديد المستودع للصنف ${item.product_name || ""}`)
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
  const accountResult = await client.query("SELECT id, name FROM account_tbl WHERE id=$1 AND type=2 AND COALESCE(status::text,'1') IN ('1','2','active','ACTIVE','نشط') LIMIT 1", [Number(data.account_id)])
  if (!accountResult.rowCount) throw new DraftValidationError("حساب العميل غير موجود أو ليس من النوع 2")
  const ids = [...new Set(data.items.map((item: any) => Number(item.product_id)))]
  const productsResult = await client.query("SELECT id, product_name, minimum_order_quantity FROM products WHERE id=ANY($1::int[])", [ids])
  const componentResult = await client.query("SELECT product_id,component_id FROM product_manufacturing_components WHERE product_id=ANY($1::int[])", [ids]).catch(() => ({ rows: [] as any[] }))
  const specificationProductIds = [...new Set([...ids, ...componentResult.rows.map((row: any) => Number(row.component_id))])]
  const attributeResult = specificationProductIds.length ? await client.query("SELECT product_id,attr_id,value_id FROM product_atrributes_values_tbl WHERE product_id=ANY($1::int[])", [specificationProductIds]).catch(() => ({ rows: [] as any[] })) : { rows: [] as any[] }
  const warehouseIds = [...new Set(data.items.map((item: any) => Number(item.store_id)).filter((id: number) => Number.isInteger(id) && id > 0))]
  const warehousesResult = await client.query("SELECT id, warehouse_name, status, is_active FROM warehouses WHERE id=ANY($1::int[])", [warehouseIds])
  const warehousesById = new Map(warehousesResult.rows.map((warehouse: any) => [Number(warehouse.id), warehouse]))
  for (const item of data.items) {
    const product = productsResult.rows.find((row: any) => Number(row.id) === Number(item.product_id))
    if (!product) throw new DraftValidationError("أحد الأصناف المحددة غير موجود")
    if (Number(item.quantity) < Number(product.minimum_order_quantity || 0)) throw new DraftValidationError(`الحد الأدنى لطلب ${product.product_name} هو ${product.minimum_order_quantity}`)
    const warehouse = warehousesById.get(Number(item.store_id))
    if (!warehouse || Number(warehouse.status) === 3) throw new DraftValidationError(`المستودع - ${warehouse?.warehouse_name || item.store_name || "غير معروف"} محذوف لا يمكن حفظ الحركة`)
    if (Number(warehouse.status) !== 1 || warehouse.is_active === false) throw new DraftValidationError(`المستودع - ${warehouse.warehouse_name} مجمد لا يمكن حفظ الحركة`)
    const components = componentResult.rows.filter((row: any) => Number(row.product_id) === Number(item.product_id))
    const productAttributes = attributeResult.rows.filter((row: any) => Number(row.product_id) === Number(item.product_id))
    const specifications = item.specifications && typeof item.specifications === "object" ? item.specifications : {}
    const selectedProduct = specifications.product || {}
    const selectedComponents = specifications.components || {}
    const requiredProductAttributes = [...new Set(productAttributes.map((row: any) => Number(row.attr_id)))]
    const productComplete = requiredProductAttributes.every((attributeId) => productAttributes.some((row: any) => Number(row.attr_id) === attributeId && Number(row.value_id) === Number(selectedProduct[attributeId])))
    const componentsComplete = components.every((component: any) => {
      const componentAttributes = attributeResult.rows.filter((row: any) => Number(row.product_id) === Number(component.component_id))
      const required = [...new Set(componentAttributes.map((row: any) => Number(row.attr_id)))]
      return required.every((attributeId) => componentAttributes.some((row: any) => Number(row.attr_id) === attributeId && Number(row.value_id) === Number(selectedComponents[component.component_id]?.[attributeId])))
    })
    if ((components.length || requiredProductAttributes.length) && (!specifications.reviewed || !productComplete || !componentsComplete)) throw new DraftValidationError("يجب تعبئة مواصفات الصنف - وذلك بالضغط على زر المواصفات")
  }
  return accountResult.rows[0]
}

// إلغاء سند قبض العربون (حذف منطقي status=3 وحذف قيده) — عند تصفير العربون أو حذف المسودة. السند المُرحَّل لا يُلغى
// تلقائياً: يُرفض الإجراء برسالة واضحة بدل ترك قيد مرحّل لمسودة محذوفة.
export async function cancelDepositReceipt(client: PoolClient, receiptVoucherId: number | null | undefined, action: "حذف المسودة" | "تصفير العربون") {
  const receiptId = Number(receiptVoucherId || 0)
  if (!receiptId) return
  const current = await client.query("SELECT status, vch_code FROM voucher_header_tbl WHERE id=$1 FOR UPDATE", [receiptId])
  if (!current.rowCount || Number(current.rows[0].status) === 3) return
  if (Number(current.rows[0].status) === 2) throw new DraftValidationError(`سند قبض العربون ${current.rows[0].vch_code} مُرحّل — ألغِه من شاشة سند القبض أولاً ثم أعد ${action}`)
  await client.query("UPDATE voucher_header_tbl SET status=3, vch_status=1, amount=0, last_update_date=CURRENT_TIMESTAMP WHERE id=$1", [receiptId])
  await client.query("DELETE FROM voucher_journal_detail_tbl WHERE voucher_id=$1", [receiptId])
}

// دفتر سندات القبض الافتراضي للمستخدم (أو أول دفتر مسموح له) — نفس مصدر /api/receipts/voucher-books
async function defaultReceiptBookId(client: PoolClient, userId: number): Promise<number | null> {
  const rows = await client.query(
    `SELECT p.vch_book_id FROM voucher_book_user_permissions_tbl p JOIN user_settings u ON u.id = p.user_id
     WHERE u.user_id = $1 AND p.voucher_type_id = $2 ORDER BY CASE WHEN p.is_default = 1 THEN 0 ELSE 1 END, p.vch_book_id LIMIT 1`,
    [userId, RECEIPT_VCH_TYPE],
  ).catch(() => ({ rows: [] as any[] }))
  return Number(rows.rows[0]?.vch_book_id) || null
}

// رقم سند قبض بنفس ترقيم النظام: بادئة السند + رمز الفرع + رمز الدفتر + تسلسل (لا DEP-...)
async function nextReceiptCode(client: PoolClient, bookId: number | null, branchId: number | null): Promise<string> {
  const settings = await getVoucherNumberSettings("", RECEIPT_VCH_TYPE)
  const bookName = await resolveVoucherBookName(bookId, branchId)
  let sequence = await nextVoucherSequence(RECEIPT_VCH_TYPE, `${settings.prefix}${bookName}`, settings.startNumber)
  for (let attempt = 0; attempt < 20; attempt += 1, sequence += 1) {
    const code = buildVoucherCode(settings.prefix, bookName, sequence)
    const taken = await client.query("SELECT 1 FROM voucher_header_tbl WHERE vch_type=$1 AND vch_code=$2 LIMIT 1", [RECEIPT_VCH_TYPE, code])
    if (!taken.rowCount) return code
  }
  throw new DraftValidationError("تعذر توليد رقم سند قبض العربون")
}

export async function syncDepositReceipt(client: PoolClient, args: { draftId: number; draftNumber: string; receiptVoucherId?: number | null; accountId: number; customerName: string; orderDate: string; deposit: number; userId: number }) {
  const { draftId, draftNumber, accountId, customerName, orderDate, deposit, userId } = args
  let receiptId = Number(args.receiptVoucherId || 0) || null
  if (deposit <= 0) {
    await cancelDepositReceipt(client, receiptId, "تصفير العربون")
    return receiptId
  }
  const defaults = await client.query(`SELECT u.currency_id,u.account_id AS cash_account_id FROM users_currencies_default_account_tbl u JOIN account_tbl a ON a.id=u.account_id WHERE u.user_id=$1 AND (to_jsonb(u)->>'branch_id' IS NULL OR to_jsonb(u)->>'branch_id'=(SELECT branch_id::text FROM sales_order_drafts WHERE id=$2)) AND u.currency_id IS NOT NULL AND COALESCE(a.status::text,'1') IN ('1','2','active','ACTIVE','نشط') ORDER BY CASE WHEN to_jsonb(u)->>'branch_id' IS NOT NULL THEN 0 ELSE 1 END, u.currency_id LIMIT 1`, [userId, draftId])
  if (!defaults.rowCount) throw new DraftValidationError("يجب تعريف حساب النقدية والعملة الافتراضية للمستخدم قبل حفظ عربون")
  const { currency_id: currencyId, cash_account_id: cashAccountId } = defaults.rows[0]
  const note = `مبلغ عربون من مسودة طلبية رقم ${draftNumber}`
  // فرع المسودة ودفتر سندات القبض الافتراضي للمستخدم: بدونهما لا يظهر السند في قائمة سندات القبض (مُقيّدة بفروع
  // المستخدم) ولا يتبع ترقيم النظام
  const branchId = Number((await client.query("SELECT branch_id FROM sales_order_drafts WHERE id=$1", [draftId])).rows[0]?.branch_id) || null
  const bookId = await defaultReceiptBookId(client, userId)
  if (receiptId) {
    const updated = await client.query(`UPDATE voucher_header_tbl SET vch_date=$2,currency_id=$3,rate=1,account_id=$4,customer_name=$5,to_account_id=$4,amount=$6,note=$7,status=1,vch_status=1,draft_code=$8,branch_id=COALESCE(branch_id,$9),vch_book_id=COALESCE(vch_book_id,$10),last_update_date=CURRENT_TIMESTAMP WHERE id=$1 AND status<>2 RETURNING id`, [receiptId, orderDate, currencyId, accountId, customerName, deposit, note, draftNumber, branchId, bookId])
    if (!updated.rowCount) throw new DraftValidationError("سند العربون مُرحّل ولا يمكن تعديل المسودة")
  } else {
    const code = await nextReceiptCode(client, bookId, branchId)
    const inserted = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,account_id,customer_name,to_account_id,amount,note,status,vch_status,is_printed,insert_user,draft_code) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$7,$9,$10,1,1,0,$11,$12) RETURNING id`, [RECEIPT_VCH_TYPE, code, orderDate, bookId, branchId, currencyId, accountId, customerName, deposit, note, userId, draftNumber])
    receiptId = inserted.rows[0].id
    await client.query("UPDATE sales_order_drafts SET receipt_voucher_id=$1 WHERE id=$2", [receiptId, draftId])
  }
  await client.query("DELETE FROM voucher_journal_detail_tbl WHERE voucher_id=$1", [receiptId])
  await client.query(`INSERT INTO voucher_journal_detail_tbl (voucher_id,order_no,journal_type_id,account_id,credit_debit,amount,currency_id,rate,base_curr_amount,note) VALUES ($1,1,2,$2,1,$3,$4,1,$3,'نقدي'),($1,2,5,$5,2,$3,$4,1,$3,'عربون طلبية')`, [receiptId, cashAccountId, deposit, currencyId, accountId])
  return receiptId
}
