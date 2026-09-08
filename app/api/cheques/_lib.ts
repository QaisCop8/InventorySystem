import sql from "@/lib/database"

export type ChequeOperation = {
  code: string
  name: string
  type: 1 | 2
  allowed: number[]
  status: number | null
  needsDate?: boolean
  needsAccount?: boolean
  accountKind?: "bank" | "ledger"
  dateField?: "pay_date" | "return_date" | "hold_date" | "trans_date"
}

export const CHEQUE_OPERATIONS: ChequeOperation[] = [
  { code:"deposit",name:"إيداع الشيك",type:1,allowed:[1,2,3,8],status:4,needsAccount:true,accountKind:"bank",dateField:"pay_date" },
  { code:"postpone",name:"تغيير تاريخ الاستحقاق",type:1,allowed:[1,2,3,5,8],status:3,needsDate:true },
  { code:"return_source",name:"إرجاع الشيك للمصدر",type:1,allowed:[1,2,3,5,7,8],status:6,dateField:"return_date" },
  { code:"return_bank",name:"إرجاع الشيك من البنك",type:1,allowed:[4,8],status:5,dateField:"return_date" },
  { code:"endorse",name:"تحويل / تجيير الشيك",type:1,allowed:[1,3,5],status:7,needsAccount:true,accountKind:"ledger",dateField:"trans_date" },
  { code:"undo_endorse",name:"إرجاع شيك محول أو مجير",type:1,allowed:[7],status:1,dateField:"return_date" },
  { code:"retrieve_customer",name:"استرجاع الشيك من الزبون",type:1,allowed:[7],status:1,dateField:"return_date" },
  { code:"collection",name:"تحويل إلى حساب التحصيل",type:1,allowed:[1,2,3],status:8,needsAccount:true,accountKind:"bank",dateField:"trans_date" },
  { code:"cash",name:"سحب شيك الزبون نقداً",type:1,allowed:[1,2,3],status:4,dateField:"pay_date" },
  { code:"transfer_account",name:"تحويل الشيك إلى حساب آخر",type:1,allowed:[1,2,3,5,8],status:null,needsAccount:true,accountKind:"ledger",dateField:"trans_date" },
  { code:"clear_outgoing",name:"إخراج الشيك المستحق من البنك",type:2,allowed:[1,2,3,5],status:4,dateField:"pay_date" },
  { code:"bank_return_supplier",name:"إرجاع البنك الشيك إلى المورد",type:2,allowed:[4],status:5,dateField:"return_date" },
  { code:"retrieve_supplier",name:"استرجاع الشيك من المورد",type:2,allowed:[1,2,3],status:6,dateField:"return_date" },
  { code:"repay",name:"إعادة صرف الشيك المرتجع",type:2,allowed:[5],status:4,dateField:"pay_date" },
  { code:"postpone_outgoing",name:"تغيير تاريخ الاستحقاق",type:2,allowed:[1,2,3,5],status:3,needsDate:true },
]

export const withAllowedChequeOperations = (row: any) => ({
  ...row,
  allowed_operations: CHEQUE_OPERATIONS.filter(operation => operation.type === Number(row.cheq_type) && operation.allowed.includes(Number(row.status_id))),
})

export async function ensureChequeOperationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS cheque_operations_log_tbl (
      id SERIAL PRIMARY KEY,
      cheque_id INTEGER NOT NULL REFERENCES cheques_tbl(id) ON DELETE CASCADE,
      operation_code VARCHAR(40) NOT NULL,
      operation_name VARCHAR(100) NOT NULL,
      previous_status_id INTEGER,
      new_status_id INTEGER,
      operation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      new_due_date TIMESTAMP,
      account_id INTEGER,
      note TEXT,
      user_id VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS voucher_id INTEGER`
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_current_account_id INTEGER`
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_bank_account_id INTEGER`
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_due_date TIMESTAMP`
  await sql`ALTER TABLE cheque_operations_log_tbl ADD COLUMN IF NOT EXISTS previous_voucher_id INTEGER`
  await sql`CREATE INDEX IF NOT EXISTS idx_cheque_operations_log_cheque ON cheque_operations_log_tbl(cheque_id, operation_date DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_cheque_operations_log_voucher ON cheque_operations_log_tbl(voucher_id) WHERE status<>9`
}

export async function rollbackChequeOperationsForVoucher(voucherId: number): Promise<{ error?: string; restored: number }> {
  await ensureChequeOperationsTable()
  const cheques = await sql`
    SELECT c.id,c.cheq_num,c.status_id,c.old_status_id,c.last_voucher_id,
      latest.id latest_log_id,latest.voucher_id latest_log_voucher_id,latest.previous_status_id,
      latest.previous_current_account_id,latest.previous_bank_account_id,latest.previous_due_date,
      latest.previous_voucher_id latest_previous_voucher_id,
      previous.voucher_id prior_log_voucher_id,previous.previous_status_id previous_previous_status_id
    FROM cheques_tbl c
    LEFT JOIN LATERAL (
      SELECT l.id,l.voucher_id,l.previous_status_id,l.previous_current_account_id,l.previous_bank_account_id,l.previous_due_date,l.previous_voucher_id
      FROM cheque_operations_log_tbl l
      WHERE l.cheque_id=c.id AND COALESCE(l.status,1)<>9
      ORDER BY l.operation_date DESC,l.id DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT l.voucher_id,l.previous_status_id
      FROM cheque_operations_log_tbl l
      WHERE l.cheque_id=c.id AND COALESCE(l.status,1)<>9 AND l.id<>COALESCE(latest.id,0)
      ORDER BY l.operation_date DESC,l.id DESC LIMIT 1
    ) previous ON TRUE
    WHERE c.last_voucher_id=${voucherId}
       OR EXISTS (SELECT 1 FROM cheque_operations_log_tbl l WHERE l.cheque_id=c.id AND l.voucher_id=${voucherId} AND COALESCE(l.status,1)<>9)
       OR EXISTS (SELECT 1 FROM voucher_related_vch_tbl r WHERE r.voucher_id=${voucherId} AND r.related_vch_id=c.id)
    FOR UPDATE OF c
  `
  if (!cheques.length) return { restored:0 }

  for (const cheque of cheques) {
    if (Number(cheque.last_voucher_id || 0) !== voucherId) {
      return { error:`يوجد عملية أحدث على الشيك رقم ${cheque.cheq_num || cheque.id}، لا يمكن حذف سند القيد`,restored:0 }
    }
    if (cheque.latest_log_id && Number(cheque.latest_log_voucher_id || 0) !== voucherId) {
      return { error:`يوجد عملية أحدث على الشيك رقم ${cheque.cheq_num || cheque.id}، لا يمكن حذف سند القيد`,restored:0 }
    }
  }

  for (const cheque of cheques) {
    const previousStatus = Number(cheque.previous_status_id || cheque.old_status_id || 1)
    const previousVoucherId = Number(cheque.latest_previous_voucher_id || cheque.prior_log_voucher_id) > 0
      ? Number(cheque.latest_previous_voucher_id || cheque.prior_log_voucher_id)
      : null
    const previousOldStatus = Number(cheque.previous_previous_status_id) > 0 ? Number(cheque.previous_previous_status_id) : null
    await sql`
      UPDATE cheques_tbl SET status_id=${previousStatus},old_status_id=${previousOldStatus},
        current_account_id=CASE WHEN ${Boolean(cheque.latest_log_id)} THEN ${cheque.previous_current_account_id} ELSE current_account_id END,
        bank_account_id=CASE WHEN ${Boolean(cheque.latest_log_id)} THEN ${cheque.previous_bank_account_id} ELSE bank_account_id END,
        due_date=CASE WHEN ${Boolean(cheque.latest_log_id)} THEN ${cheque.previous_due_date} ELSE due_date END,
        last_voucher_id=${previousVoucherId},last_update_date=CURRENT_TIMESTAMP
      WHERE id=${Number(cheque.id)} AND last_voucher_id=${voucherId}
    `
    if (cheque.latest_log_id) {
      await sql`UPDATE cheque_operations_log_tbl SET status=9 WHERE id=${Number(cheque.latest_log_id)} AND voucher_id=${voucherId}`
    }
  }
  return { restored:cheques.length }
}
