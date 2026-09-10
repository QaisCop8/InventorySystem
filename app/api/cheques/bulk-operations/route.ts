import {NextRequest,NextResponse} from "next/server"
import sql,{withTenantTransaction} from "@/lib/database"
import {getSessionUser} from "@/lib/tenant-auth"
import {authorizeTransaction} from "@/lib/transaction-permissions"
import {ensureTables as ensureVoucherTables} from "@/app/api/receipts/_lib"
import {ensureTables as ensureVoucherBookTables} from "@/app/api/voucher-book-permissions/_lib"
import {CHEQUE_OPERATIONS,ensureChequeOperationsTable,isChequeOperationAllowed} from "@/app/api/cheques/_lib"
import {createChequeOperationJournal} from "@/app/api/cheques/_journal"

const supported={deposit:{type:1,name:"إيداع الشيكات الواردة"},endorse:{type:1,name:"تجيير الشيكات"},clear_outgoing:{type:2,name:"إخراج الشيكات الصادرة"}} as const
const dateValue=(value:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))?String(value):new Date().toISOString().slice(0,10)

export async function POST(request:NextRequest){
 try{
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"يجب تسجيل الدخول"},{status:401})
  await ensureVoucherTables();await ensureVoucherBookTables();await ensureChequeOperationsTable()
  const body=await request.json(),code=String(body.operation_code||"") as keyof typeof supported,config=supported[code]
  const ids=Array.from(new Set((Array.isArray(body.cheque_ids)?body.cheque_ids:[]).map(Number).filter((id:number)=>Number.isInteger(id)&&id>0))) as number[]
  if(!config||!ids.length)return NextResponse.json({error:"اختر شيكاً واحداً على الأقل"},{status:400})
  if(ids.length>500)return NextResponse.json({error:"الحد الأقصى للعملية الواحدة 500 شيك"},{status:400})
  const operation=CHEQUE_OPERATIONS.find(item=>item.code===code)!
  const operationDate=dateValue(body.operation_date),requestedAccountId=Number(body.account_id||0)||null,note=String(body.note||"").trim().slice(0,1000)
  return await withTenantTransaction(async()=>{
   const cheques=await sql`
    SELECT c.*,c.due_date::date::text due_date,source.branch_id source_branch_id,source.account_id source_account_id,CURRENT_DATE::text business_date,
      EXISTS(SELECT 1 FROM cheque_operations_log_tbl l WHERE l.cheque_id=c.id AND COALESCE(l.status,1)<>9) has_operations
    FROM cheques_tbl c LEFT JOIN voucher_header_tbl source ON source.id=c.voucher_id
    WHERE c.id=ANY(${ids}::int[]) FOR UPDATE OF c
   `
   if(cheques.length!==ids.length)return NextResponse.json({error:"أحد الشيكات المحددة غير موجود"},{status:409})
   const branchIds=Array.from(new Set<number>(cheques.map((x:any)=>Number(x.source_branch_id)).filter(Boolean))),currencyIds=Array.from(new Set<number>(cheques.map((x:any)=>Number(x.currency_id)||0)))
   if(cheques.some((cheque:any)=>!Number(cheque.source_branch_id)))return NextResponse.json({error:"Missing voucher branch"},{status:400})
   if(currencyIds.length!==1)return NextResponse.json({error:"يجب أن تكون جميع الشيكات من نفس العملة"},{status:400})
   for(const branchId of branchIds){const createAuth=await authorizeTransaction(request,"journal","create",branchId);if(!createAuth.ok)return createAuth.response;const postAuth=await authorizeTransaction(request,"journal","post",branchId);if(!postAuth.ok)return postAuth.response}
   for(const cheque of cheques){const businessDate=String(cheque.business_date);if(Number(cheque.cheq_type)!==config.type)return NextResponse.json({error:`نوع الشيك ${cheque.cheq_num} لا يناسب العملية`},{status:409});if(!isChequeOperationAllowed(operation,cheque,businessDate))return NextResponse.json({error:`الحالة الحالية للشيك ${cheque.cheq_num} لا تسمح بالعملية`},{status:409})}
   let targetAccountId:number|null=null,targetBankAccountId:number|null=null
   if(code==="deposit"){
    if(!requestedAccountId)return NextResponse.json({error:"اختر حساب البنك"},{status:400});const bank=(await sql`SELECT id,jary_account_id FROM bank_accounts WHERE id=${requestedAccountId} AND currency_id=${currencyIds[0]} AND COALESCE(status,1)<>3`)[0];if(!bank?.jary_account_id)return NextResponse.json({error:"الحساب الجاري غير معرّف في حساب البنك"},{status:400});targetAccountId=Number(bank.jary_account_id);targetBankAccountId=Number(bank.id)
   }else if(code==="endorse"){
    if(!requestedAccountId)return NextResponse.json({error:"اختر حساب المستفيد من التجيير"},{status:400});const account=(await sql`SELECT id FROM account_tbl WHERE id=${requestedAccountId} AND type>1 AND COALESCE(status,1)<>3`)[0];if(!account)return NextResponse.json({error:"حساب المستفيد غير موجود أو غير فعال"},{status:400});targetAccountId=Number(account.id)
   }
  const journals:{id:number;code:string}[]=[]
  for(const cheque of cheques){const current=Number(cheque.current_account_id||cheque.rec_cheq_account_id),rate=Number(cheque.rate||1),amount=Number(cheque.amount||0),currencyId=Number(cheque.currency_id)||null;if(!current||amount<=0)return NextResponse.json({error:`تعذر تحديد حساب أو قيمة الشيك ${cheque.cheq_num}`},{status:400})
   let debitAccountId:number,creditAccountId:number
   if(code==="deposit"||code==="endorse"){debitAccountId=Number(targetAccountId);creditAccountId=current}
   else{const bankId=Number(cheque.bank_account_id);if(!bankId)return NextResponse.json({error:`لا يوجد حساب بنك مرتبط بالشيك ${cheque.cheq_num}`},{status:400});const bank=(await sql`SELECT jary_account_id FROM bank_accounts WHERE id=${bankId} AND COALESCE(status,1)<>3`)[0];if(!bank?.jary_account_id)return NextResponse.json({error:`الحساب الجاري غير معرّف للشيك ${cheque.cheq_num}`},{status:400});cheque.target_account_id=Number(bank.jary_account_id);debitAccountId=current;creditAccountId=Number(bank.jary_account_id)}
   const journal=await createChequeOperationJournal({userId:String(user.user_id),branchId:Number(cheque.source_branch_id),chequeNumber:String(cheque.cheq_num),operationName:config.name,operationDate,debitAccountId,creditAccountId,amount,currencyId,rate,note:note||config.name})
   if(!journal.ok)throw new Error(journal.error)
   journals.push({id:journal.id,code:journal.code})
   const newCurrent=code==="clear_outgoing"?Number(cheque.target_account_id):Number(targetAccountId),newStatus=code==="endorse"?7:4,accountId=newCurrent,bankId=code==="deposit"?targetBankAccountId:(Number(cheque.bank_account_id)||null)
    await sql`UPDATE cheques_tbl SET old_status_id=status_id,status_id=${newStatus},current_account_id=${newCurrent},bank_account_id=${bankId},pay_date=CASE WHEN ${code!=="endorse"} THEN ${operationDate}::date ELSE pay_date END,trans_date=CASE WHEN ${code==="endorse"} THEN ${operationDate}::date ELSE trans_date END,last_voucher_id=${journal.id},update_user_id=${Number(user.user_id)||null},last_update_date=NOW() WHERE id=${Number(cheque.id)}`
    await sql`INSERT INTO cheque_operations_log_tbl(cheque_id,voucher_id,operation_code,operation_name,previous_status_id,new_status_id,operation_date,account_id,note,user_id,previous_current_account_id,previous_rec_cheq_account_id,previous_bank_account_id,previous_due_date,previous_voucher_id) VALUES(${Number(cheque.id)},${journal.id},${code},${config.name},${Number(cheque.status_id)},${newStatus},${operationDate}::date,${accountId},${note},${String(user.user_id)},${cheque.current_account_id||null},${cheque.rec_cheq_account_id||null},${cheque.bank_account_id||null},${cheque.due_date||null},${cheque.last_voucher_id||null})`
   }
  return NextResponse.json({message:`تم تنفيذ ${config.name} لعدد ${ids.length} شيكات وإنشاء سند مستقل لكل شيك: ${journals.map(journal=>journal.code).join(", ")}`,count:ids.length,journal_voucher:journals[0],journal_vouchers:journals})
  })
 }catch(error){console.error("Bulk cheque operation error",error);return NextResponse.json({error:error instanceof Error?error.message:"تعذر تنفيذ عملية الشيكات الجماعية"},{status:500})}
}
