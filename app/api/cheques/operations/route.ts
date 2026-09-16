import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { ensureTables as ensureVoucherBookTables } from "@/app/api/voucher-book-permissions/_lib"
import {
  CHEQUE_OPERATIONS,
  ensureChequeOperationsTable,
  isChequeOperationAllowed,
  withAllowedChequeOperations,
  type ChequeOperation,
} from "@/app/api/cheques/_lib"
import { createChequeOperationJournal } from "@/app/api/cheques/_journal"

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null
const today = () => new Date().toISOString().slice(0,10)

type AccountMovement = {
  nextCurrentAccountId: number | null
  nextReceivableChequeAccountId: number | null
  debitAccountId: number | null
  creditAccountId: number | null
}

function resolveAccountMovement(operation: ChequeOperation,cheque: any,selectedAccountId: number | null): AccountMovement {
  const current = Number(cheque.current_account_id) || null
  const receivable = Number(cheque.rec_cheq_account_id) || null
  const customer = Number(cheque.customer_id || cheque.source_account_id) || null
  let nextCurrentAccountId = current
  let nextReceivableChequeAccountId = receivable
  let debitAccountId: number | null = null
  let creditAccountId: number | null = null

  switch (operation.code) {
    case "deposit":
    case "collection":
    case "endorse":
    case "undo_endorse":
      nextCurrentAccountId = selectedAccountId
      debitAccountId = selectedAccountId
      creditAccountId = current
      break
    case "return_bank":
      nextCurrentAccountId = selectedAccountId
      nextReceivableChequeAccountId = selectedAccountId
      debitAccountId = selectedAccountId
      creditAccountId = current
      break
    case "return_source":
      nextCurrentAccountId = customer
      debitAccountId = customer
      creditAccountId = current || receivable
      break
    case "retrieve_customer":
      nextCurrentAccountId = selectedAccountId
      debitAccountId = selectedAccountId
      creditAccountId = current || customer
      break
    case "cash":
      nextCurrentAccountId = receivable || current
      debitAccountId = selectedAccountId
      creditAccountId = current || receivable
      break
    case "transfer_account":
      nextCurrentAccountId = selectedAccountId
      nextReceivableChequeAccountId = selectedAccountId
      debitAccountId = selectedAccountId
      creditAccountId = current || receivable
      break
    case "clear_outgoing":
      nextCurrentAccountId = selectedAccountId
      debitAccountId = current || receivable
      creditAccountId = selectedAccountId
      break
    case "bank_return_supplier":
      nextCurrentAccountId = receivable
      debitAccountId = current
      creditAccountId = receivable
      break
    case "retrieve_supplier":
      nextCurrentAccountId = customer
      debitAccountId = receivable
      creditAccountId = customer || current
      break
    case "repay":
      nextCurrentAccountId = receivable
      debitAccountId = receivable
      creditAccountId = customer || current
      break
  }
  return { nextCurrentAccountId,nextReceivableChequeAccountId,debitAccountId,creditAccountId }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error:"يجب تسجيل الدخول" },{status:401})
    await ensureVoucherTables(); await ensureChequeOperationsTable()
    const chequeId = Number(request.nextUrl.searchParams.get("cheque_id"))
    if (!Number.isInteger(chequeId) || chequeId <= 0) return NextResponse.json({ error:"رقم الشيك غير صحيح" },{status:400})
    const logs = await sql`
            SELECT l.*,old_status.name previous_status_name,new_status.name new_status_name,a.code account_code,a.name account_name,
              vh.vch_code journal_voucher_code,COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),l.user_id::text) user_name
      FROM cheque_operations_log_tbl l
      LEFT JOIN cheque_status_tbl old_status ON old_status.id=l.previous_status_id
      LEFT JOIN cheque_status_tbl new_status ON new_status.id=l.new_status_id
      LEFT JOIN account_tbl a ON a.id=l.account_id
      LEFT JOIN voucher_header_tbl vh ON vh.id=l.voucher_id
      LEFT JOIN user_settings u ON u.user_id=l.user_id
      WHERE l.cheque_id=${chequeId} AND COALESCE(l.status,1)<>9 ORDER BY l.operation_date DESC,l.id DESC`
    return NextResponse.json({ logs })
  } catch(error) {
    console.error("Cheque operations log error:",error)
    return NextResponse.json({error:"تعذر تحميل سجل عمليات الشيك"},{status:500})
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error:"يجب تسجيل الدخول" },{status:401})
    await ensureVoucherTables(); await ensureVoucherBookTables(); await ensureChequeOperationsTable()
    const body = await request.json()
    const chequeId = Number(body.cheque_id)
    const operation = CHEQUE_OPERATIONS.find(item => item.code === body.operation_code)
    if (!Number.isInteger(chequeId) || chequeId <= 0 || !operation) return NextResponse.json({error:"بيانات العملية غير صحيحة"},{status:400})

    return await withTenantTransaction(async () => {
      const cheque = (await sql`
        SELECT c.*,source.branch_id source_branch_id,source.account_id source_account_id,CURRENT_DATE::text business_date,
          EXISTS(SELECT 1 FROM cheque_operations_log_tbl log WHERE log.cheque_id=c.id AND COALESCE(log.status,1)<>9) has_operations
        FROM cheques_tbl c
        LEFT JOIN voucher_header_tbl source ON source.id=c.voucher_id
        WHERE c.id=${chequeId}
          AND COALESCE(source.status,1)<>3
        FOR UPDATE OF c
      `)[0]
      if (!cheque) return NextResponse.json({error:"الشيك غير موجود"},{status:404})
      if (Number(cheque.cheq_type)!==operation.type) return NextResponse.json({error:"العملية لا تتوافق مع نوع الشيك"},{status:400})
      const businessDate = String(cheque.business_date || today())
      if (operation.requiresDue && String(cheque.due_date || "").slice(0,10) > businessDate) {
        return NextResponse.json({error:`الشيك رقم ${cheque.cheq_num} غير مستحق ولا يمكن تنفيذ ${operation.name}`},{status:409})
      }
      if (!isChequeOperationAllowed(operation,cheque,businessDate)) {
        return NextResponse.json({error:`لا يمكن تنفيذ ${operation.name} على حالة الشيك الحالية`},{status:409})
      }

      const newDueDate = validDate(body.new_due_date)
      const operationDate = validDate(body.operation_date) || today()
      const requestedAccountId = Number(body.account_id) > 0 ? Number(body.account_id) : null
      if (operation.needsDate && !newDueDate) return NextResponse.json({error:"يجب إدخال تاريخ الاستحقاق الجديد"},{status:400})
      if (operation.needsAccount && !requestedAccountId) return NextResponse.json({error:"يجب اختيار الحساب الجديد"},{status:400})

      let accountId: number | null = requestedAccountId
      let bankAccountId: number | null = null
      if (requestedAccountId && operation.accountKind === "bank") {
        const bankAccount = (await sql`SELECT id,jary_account_id,tahsil_account_id FROM bank_accounts WHERE id=${requestedAccountId} AND COALESCE(status,1)<>3`)[0]
        if (!bankAccount) return NextResponse.json({error:"حساب البنك المحدد غير موجود أو غير فعال"},{status:400})
        bankAccountId = Number(bankAccount.id)
        accountId = Number(operation.code === "collection" ? bankAccount.tahsil_account_id : bankAccount.jary_account_id) || null
        if (!accountId) return NextResponse.json({error:operation.code === "collection"?"حساب التحصيل غير معرّف في حساب البنك":"الحساب الجاري غير معرّف في حساب البنك"},{status:400})
      } else if (requestedAccountId) {
        const account = await sql`SELECT id FROM account_tbl WHERE id=${requestedAccountId} AND COALESCE(status,1)<>3`
        if (!account.length) return NextResponse.json({error:"الحساب المحدد غير موجود أو غير فعال"},{status:400})
      }

      if (operation.code === "clear_outgoing") {
        const chequeBankAccountId = Number(cheque.bank_account_id) || null
        if (!chequeBankAccountId) return NextResponse.json({error:"لا يوجد حساب بنكي مرتبط بالشيك الصادر"},{status:400})
        const bankAccount = (await sql`SELECT id,jary_account_id FROM bank_accounts WHERE id=${chequeBankAccountId} AND COALESCE(status,1)<>3`)[0]
        if (!bankAccount?.jary_account_id) return NextResponse.json({error:"الحساب الجاري غير معرّف في حساب البنك المرتبط بالشيك"},{status:400})
        bankAccountId = Number(bankAccount.id)
        accountId = Number(bankAccount.jary_account_id)
      }

      const movement = resolveAccountMovement(operation,cheque,accountId)
      const branchId = Number(cheque.source_branch_id)
      if (!Number.isInteger(branchId) || branchId <= 0) return NextResponse.json({error:"تعذر تحديد فرع الشيك"},{status:400})
      const note = String(body.note || "").trim().slice(0,1000)
      let journal: { id:number;code:string } | null = null
      if (operation.createsJournal) {
        const createAuthorization = await authorizeTransaction(request,"journal","create",branchId)
        if (!createAuthorization.ok) return createAuthorization.response
        const postAuthorization = await authorizeTransaction(request,"journal","post",branchId)
        if (!postAuthorization.ok) return postAuthorization.response
        const journalResult = await createChequeOperationJournal({
          userId:String(user.user_id),branchId,chequeNumber:String(cheque.cheq_num || chequeId),
          operationName:operation.name,operationDate,
          debitAccountId:Number(movement.debitAccountId),creditAccountId:Number(movement.creditAccountId),
          amount:Number(cheque.amount || 0),currencyId:Number(cheque.currency_id) || null,
          rate:Number(cheque.rate || 1),note,
        })
        if (!journalResult.ok) return NextResponse.json({error:journalResult.error},{status:400})
        journal = { id:journalResult.id,code:journalResult.code }
      }

      let newStatus = operation.status ?? Number(cheque.status_id)
      if (["postpone","postpone_outgoing"].includes(operation.code) && [3,5,8].includes(Number(cheque.status_id))) {
        newStatus = Number(cheque.status_id)
      }
      const markPay = operation.dateField === "pay_date"
      const markReturn = operation.dateField === "return_date"
      const markHold = operation.dateField === "hold_date"
      const markTransfer = operation.dateField === "trans_date"
      const nextBankAccountId = operation.accountKind === "bank" ? bankAccountId : (bankAccountId || cheque.bank_account_id || null)
      const result = await sql`
        WITH previous AS (
          SELECT id,status_id,current_account_id,rec_cheq_account_id,bank_account_id,due_date,last_voucher_id
          FROM cheques_tbl WHERE id=${chequeId}
        ), updated AS (
          UPDATE cheques_tbl c SET
            old_status_id=c.status_id,status_id=${newStatus},
            due_date=CASE WHEN ${Boolean(operation.needsDate)} THEN ${newDueDate}::date ELSE c.due_date END,
            current_account_id=${movement.nextCurrentAccountId},
            rec_cheq_account_id=${movement.nextReceivableChequeAccountId},
            bank_account_id=${nextBankAccountId},
            pay_date=CASE WHEN ${markPay} THEN ${operationDate}::date ELSE c.pay_date END,
            return_date=CASE WHEN ${markReturn} THEN ${operationDate}::date ELSE c.return_date END,
            hold_date=CASE WHEN ${markHold} THEN ${operationDate}::date ELSE c.hold_date END,
            trans_date=CASE WHEN ${markTransfer} THEN ${operationDate}::date ELSE c.trans_date END,
            return_count=COALESCE(c.return_count,0) + CASE WHEN ${markReturn} THEN 1 ELSE 0 END,
            last_voucher_id=CASE WHEN ${Boolean(journal)} THEN ${journal?.id || null} ELSE c.last_voucher_id END,
            update_user_id=${Number(user.user_id) || null},last_update_date=CURRENT_TIMESTAMP
          FROM previous p WHERE c.id=p.id RETURNING c.*
        ), logged AS (
          INSERT INTO cheque_operations_log_tbl(
            cheque_id,voucher_id,operation_code,operation_name,previous_status_id,new_status_id,operation_date,new_due_date,account_id,note,user_id,
            previous_current_account_id,previous_rec_cheq_account_id,previous_bank_account_id,previous_due_date,previous_voucher_id
          )
          SELECT u.id,${journal?.id || null},${operation.code},${operation.name},p.status_id,u.status_id,${operationDate}::date,${newDueDate}::date,${accountId},${note},${String(user.user_id)},
            p.current_account_id,p.rec_cheq_account_id,p.bank_account_id,p.due_date,p.last_voucher_id
          FROM updated u JOIN previous p ON p.id=u.id RETURNING id
        ) SELECT updated.* FROM updated JOIN logged ON TRUE
      `
      if (!result.length) return NextResponse.json({error:"تعذر تحديث بيانات الشيك"},{status:409})
      const savedCheque = (await sql`
        SELECT c.*,cs.name status_name,cur.currency_code,cur.currency_name,
          bk.bank_name,br.branch_name,ba.code bank_account_code,ba.name bank_account_name,
          customer.code customer_code,customer.name customer_name,
          current_account.code current_account_code,current_account.name current_account_name,
          EXISTS(SELECT 1 FROM cheque_operations_log_tbl log WHERE log.cheque_id=c.id AND COALESCE(log.status,1)<>9) has_operations,
          CURRENT_DATE::text business_date
        FROM cheques_tbl c
        LEFT JOIN cheque_status_tbl cs ON cs.id=c.status_id
        LEFT JOIN currency cur ON cur.id=c.currency_id
        LEFT JOIN banks bk ON bk.id=c.bank_id
        LEFT JOIN branches br ON br.id=c.branch_id
        LEFT JOIN bank_accounts ba ON ba.id=c.bank_account_id
        LEFT JOIN account_tbl customer ON customer.id=c.customer_id
        LEFT JOIN account_tbl current_account ON current_account.id=c.current_account_id
        WHERE c.id=${chequeId}
      `)[0]
      const message = journal
        ? `تم تنفيذ عملية الشيك بنجاح وإنشاء سند القيد ${journal.code}`
        : "تم تنفيذ عملية الشيك بنجاح"
      return NextResponse.json({message,cheque:withAllowedChequeOperations(savedCheque,String(savedCheque.business_date)),journal_voucher:journal})
    })
  } catch(error) {
    console.error("Save cheque operation error:",error)
    return NextResponse.json({error:"تعذر تنفيذ عملية الشيك"},{status:500})
  }
}
