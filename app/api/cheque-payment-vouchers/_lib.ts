import sql from "@/lib/database"
import { ensureTables as ensureReceiptTables } from "@/app/api/receipts/_lib"
import { ensureTables as ensureVoucherTypeTables } from "@/app/api/voucher-book-permissions/_lib"
import { ensureChequeOperationsTable } from "@/app/api/cheques/_lib"

export const CHEQUE_PAYMENT_VCH_TYPE = 21
export const ENDORSEMENT_STATUS_IDS = [1,3,5]

export async function ensureChequePaymentTables() {
  await ensureReceiptTables()
  await ensureVoucherTypeTables()
  await ensureChequeOperationsTable()
  await sql`INSERT INTO voucher_types_tbl(id,name,status) VALUES(${CHEQUE_PAYMENT_VCH_TYPE},'سند صرف شيكات',1) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=1`
  await sql`
    CREATE TABLE IF NOT EXISTS cheque_payment_voucher_items (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      cheque_id INTEGER NOT NULL REFERENCES cheques_tbl(id) ON DELETE RESTRICT,
      amount DOUBLE PRECISION NOT NULL,
      order_no INTEGER NOT NULL DEFAULT 1,
      UNIQUE(voucher_id,cheque_id)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_cheque_payment_items_cheque ON cheque_payment_voucher_items(cheque_id)`
}

export async function nextChequePaymentCode() {
  const rows=await sql`SELECT vch_code FROM voucher_header_tbl WHERE vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND vch_code LIKE 'CQ%'`
  let max=0
  for(const row of rows){const value=Number(String(row.vch_code||"").replace(/^CQ/i,""));if(Number.isFinite(value))max=Math.max(max,value)}
  return `CQ${String(max+1).padStart(8,"0")}`
}

export async function fetchChequePaymentVoucher(id:number) {
  const header=(await sql`SELECT vh.*,a.code account_code,a.name account_name,c.currency_code,c.currency_name,b.branch_name
    FROM voucher_header_tbl vh LEFT JOIN account_tbl a ON a.id=vh.account_id LEFT JOIN currency c ON c.id=vh.currency_id
    LEFT JOIN branches b ON b.id=vh.branch_id WHERE vh.id=${id} AND vh.vch_type=${CHEQUE_PAYMENT_VCH_TYPE}`)[0]
  if(!header)return null
  const cheques=await sql`SELECT c.id cheque_id,c.cheq_num,c.bank_account,c.cheq_owner_name,c.amount,c.due_date,c.status_id,
    cs.name status_name,cur.currency_code,bk.bank_name,br.branch_name,customer.name customer_name,customer.code customer_code
    FROM cheque_payment_voucher_items i JOIN cheques_tbl c ON c.id=i.cheque_id
    LEFT JOIN cheque_status_tbl cs ON cs.id=c.status_id LEFT JOIN currency cur ON cur.id=c.currency_id
    LEFT JOIN banks bk ON bk.id=c.bank_id LEFT JOIN branches br ON br.id=c.branch_id LEFT JOIN account_tbl customer ON customer.id=c.customer_id
    WHERE i.voucher_id=${id} ORDER BY i.order_no,i.id`
  return {...header,cheques}
}
