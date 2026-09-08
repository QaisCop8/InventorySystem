import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { CHEQUE_OPERATIONS, ensureChequeOperationsTable, withAllowedChequeOperations } from "@/app/api/cheques/_lib"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error:"يجب تسجيل الدخول" },{status:401})
    await ensureVoucherTables(); await ensureChequeOperationsTable()
    const chequeId = Number(request.nextUrl.searchParams.get("cheque_id"))
    if (!Number.isInteger(chequeId) || chequeId <= 0) return NextResponse.json({ error:"رقم الشيك غير صحيح" },{status:400})
    const logs = await sql`
      SELECT l.*,old_status.name previous_status_name,new_status.name new_status_name,a.code account_code,a.name account_name,
             COALESCE(u.full_name,u.username,l.user_id) user_name
      FROM cheque_operations_log_tbl l
      LEFT JOIN cheque_status_tbl old_status ON old_status.id=l.previous_status_id
      LEFT JOIN cheque_status_tbl new_status ON new_status.id=l.new_status_id
      LEFT JOIN account_tbl a ON a.id=l.account_id
      LEFT JOIN user_settings u ON u.user_id::text=l.user_id
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
    await ensureVoucherTables(); await ensureChequeOperationsTable()
    const body = await request.json()
    const chequeId = Number(body.cheque_id)
    const operation = CHEQUE_OPERATIONS.find(item => item.code === body.operation_code)
    if (!Number.isInteger(chequeId) || chequeId <= 0 || !operation) return NextResponse.json({error:"بيانات العملية غير صحيحة"},{status:400})
    const chequeRows = await sql`SELECT * FROM cheques_tbl WHERE id=${chequeId}`
    if (!chequeRows.length) return NextResponse.json({error:"الشيك غير موجود"},{status:404})
    const cheque = chequeRows[0]
    if (Number(cheque.cheq_type)!==operation.type) return NextResponse.json({error:"العملية لا تتوافق مع نوع الشيك"},{status:400})
    if (!operation.allowed.includes(Number(cheque.status_id))) return NextResponse.json({error:"لا يمكن تنفيذ هذه العملية على حالة الشيك الحالية"},{status:409})

    const newDueDate = body.new_due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.new_due_date) ? body.new_due_date : null
    const requestedAccountId = Number(body.account_id) > 0 ? Number(body.account_id) : null
    if (operation.needsDate && !newDueDate) return NextResponse.json({error:"يجب إدخال تاريخ الاستحقاق الجديد"},{status:400})
    if (operation.needsAccount && !requestedAccountId) return NextResponse.json({error:"يجب اختيار الحساب الجديد"},{status:400})
    let accountId: number | null = requestedAccountId
    let bankAccountId: number | null = null
    if (requestedAccountId && operation.accountKind === "bank") {
      const bankAccount = await sql`SELECT id,jary_account_id,tahsil_account_id FROM bank_accounts WHERE id=${requestedAccountId} AND COALESCE(status,1)<>3`
      if (!bankAccount.length) return NextResponse.json({error:"حساب البنك المحدد غير موجود أو غير فعال"},{status:400})
      bankAccountId = Number(bankAccount[0].id)
      accountId = Number(operation.code === "collection" ? bankAccount[0].tahsil_account_id : bankAccount[0].jary_account_id) || null
      if (!accountId) return NextResponse.json({error:operation.code === "collection"?"حساب التحصيل غير معرّف في حساب البنك":"الحساب الجاري غير معرّف في حساب البنك"},{status:400})
    } else if (requestedAccountId) {
      const account = await sql`SELECT id FROM account_tbl WHERE id=${requestedAccountId} AND COALESCE(status,1)<>3`
      if (!account.length) return NextResponse.json({error:"الحساب المحدد غير موجود أو غير فعال"},{status:400})
    }

    const expected = body.last_update_date ? new Date(body.last_update_date) : new Date(cheque.last_update_date)
    if (Number.isNaN(expected.getTime())) return NextResponse.json({error:"تاريخ تعديل الشيك غير صحيح"},{status:400})
    const operationDate = body.operation_date && /^\d{4}-\d{2}-\d{2}$/.test(body.operation_date) ? body.operation_date : new Date().toISOString().slice(0,10)
    const newStatus = operation.status ?? Number(cheque.status_id)
    const note = String(body.note || "").trim().slice(0,1000)
    const markPay = operation.dateField === "pay_date"
    const markReturn = operation.dateField === "return_date"
    const markHold = operation.dateField === "hold_date"
    const markTransfer = operation.dateField === "trans_date"

    const result = await sql`
      WITH previous AS (
        SELECT id,status_id,current_account_id,bank_account_id,due_date,last_voucher_id FROM cheques_tbl WHERE id=${chequeId} AND last_update_date=${expected}
      ), updated AS (
        UPDATE cheques_tbl c SET
          old_status_id=c.status_id,status_id=${newStatus},
          due_date=CASE WHEN ${Boolean(operation.needsDate)} THEN ${newDueDate}::date ELSE c.due_date END,
          current_account_id=CASE WHEN ${Boolean(operation.needsAccount)} THEN ${accountId} ELSE c.current_account_id END,
          bank_account_id=CASE WHEN ${operation.accountKind === "bank"} THEN ${bankAccountId} ELSE c.bank_account_id END,
          pay_date=CASE WHEN ${markPay} THEN ${operationDate}::date ELSE c.pay_date END,
          return_date=CASE WHEN ${markReturn} THEN ${operationDate}::date ELSE c.return_date END,
          hold_date=CASE WHEN ${markHold} THEN ${operationDate}::date ELSE c.hold_date END,
          trans_date=CASE WHEN ${markTransfer} THEN ${operationDate}::date ELSE c.trans_date END,
          return_count=c.return_count + CASE WHEN ${markReturn} THEN 1 ELSE 0 END,
          update_user_id=${Number(user.user_id) || null},last_update_date=CURRENT_TIMESTAMP
        FROM previous p WHERE c.id=p.id RETURNING c.*
      ), logged AS (
        INSERT INTO cheque_operations_log_tbl
          (cheque_id,operation_code,operation_name,previous_status_id,new_status_id,operation_date,new_due_date,account_id,note,user_id,
           previous_current_account_id,previous_bank_account_id,previous_due_date,previous_voucher_id)
        SELECT u.id,${operation.code},${operation.name},p.status_id,u.status_id,${operationDate}::date,${newDueDate}::date,${accountId},${note},${String(user.user_id)},
          p.current_account_id,p.bank_account_id,p.due_date,p.last_voucher_id
        FROM updated u JOIN previous p ON p.id=u.id RETURNING id
      ) SELECT updated.* FROM updated JOIN logged ON TRUE
    `
    if (!result.length) return NextResponse.json({error:"تم تعديل الشيك بواسطة مستخدم آخر، حدّث البيانات وحاول مرة أخرى"},{status:409})
    return NextResponse.json({message:"تم تنفيذ عملية الشيك بنجاح",cheque:withAllowedChequeOperations(result[0])})
  } catch(error) {
    console.error("Save cheque operation error:",error)
    return NextResponse.json({error:"تعذر تنفيذ عملية الشيك"},{status:500})
  }
}
