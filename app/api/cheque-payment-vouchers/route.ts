import { NextResponse,type NextRequest } from "next/server"
import sql,{withTenantTransaction} from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { CHEQUE_PAYMENT_VCH_TYPE,ENDORSEMENT_STATUS_IDS,ensureChequePaymentTables,fetchChequePaymentVoucher,nextChequePaymentCode } from "./_lib"

const ids=(value:unknown)=>Array.from(new Set((Array.isArray(value)?value:[]).map(Number).filter(id=>Number.isInteger(id)&&id>0))).slice(0,200)

class ChequePaymentConflict extends Error {}

export async function GET(request:NextRequest){
  try{
    await ensureChequePaymentTables()
    const p=request.nextUrl.searchParams
    const authorization=await authorizeTransaction(request,"cheque_payment","view",p.get("branch_id"))
    if(!authorization.ok)return authorization.response
    if(p.get("next_code")==="1")return NextResponse.json({code:await nextChequePaymentCode()})
    const id=Number(p.get("id"))
    if(id){const voucher=await fetchChequePaymentVoucher(id);return voucher?NextResponse.json(voucher):NextResponse.json({error:"السند غير موجود"},{status:404})}
    if(p.get("eligible")==="1"){
      const q=String(p.get("q")||"").trim().slice(0,100),currencyId=Number(p.get("currency_id"))||null
      const excluded=String(p.get("exclude")||"").split(",").map(Number).filter(Number.isFinite)
      const rows=await sql`SELECT c.id,c.cheq_num,c.bank_account,c.cheq_owner_name,c.amount,c.due_date,c.status_id,c.currency_id,c.current_account_id,c.last_update_date,
        cs.name status_name,cur.currency_code,cur.currency_name,bk.bank_name,br.branch_name,
        customer.code customer_code,customer.name customer_name,current_account.code current_account_code,current_account.name current_account_name
        FROM cheques_tbl c LEFT JOIN cheque_status_tbl cs ON cs.id=c.status_id LEFT JOIN currency cur ON cur.id=c.currency_id
        LEFT JOIN banks bk ON bk.id=c.bank_id LEFT JOIN branches br ON br.id=c.branch_id
        LEFT JOIN account_tbl customer ON customer.id=c.customer_id LEFT JOIN account_tbl current_account ON current_account.id=c.current_account_id
        LEFT JOIN voucher_header_tbl source ON source.id=c.voucher_id
        WHERE c.cheq_type=1 AND c.status_id=ANY(${ENDORSEMENT_STATUS_IDS}::int[]) AND c.current_account_id IS NOT NULL
          AND (${currencyId}::int IS NULL OR c.currency_id=${currencyId}) AND (${excluded.length===0} OR NOT(c.id=ANY(${excluded}::int[])))
          AND (${authorization.branchIds.length===0} OR source.branch_id=ANY(${authorization.branchIds}::int[]))
          AND (${q}='' OR CONCAT_WS(' ',c.cheq_num,c.bank_account,c.cheq_owner_name,customer.code,customer.name,bk.bank_name,br.branch_name) ILIKE ${`%${q}%`})
        ORDER BY c.due_date NULLS LAST,c.id DESC LIMIT 500`
      return NextResponse.json({rows})
    }
    const [rows,accounts,currencies,branches]=await Promise.all([
      sql`SELECT vh.id,vh.vch_code,vh.vch_date,vh.amount,vh.status,vh.account_id,vh.currency_id,vh.branch_id,vh.note,
        a.code account_code,a.name account_name,c.currency_code,b.branch_name,
        (SELECT COUNT(*)::int FROM cheque_payment_voucher_items i WHERE i.voucher_id=vh.id) cheque_count
        FROM voucher_header_tbl vh LEFT JOIN account_tbl a ON a.id=vh.account_id LEFT JOIN currency c ON c.id=vh.currency_id LEFT JOIN branches b ON b.id=vh.branch_id
        WHERE vh.vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND vh.status<>3 AND vh.branch_id=ANY(${authorization.branchIds}::int[]) ORDER BY vh.id DESC`,
      sql`SELECT id,code,name,type,level_no,currency_id,allow_trans_with_diff_curr,status FROM account_tbl WHERE COALESCE(status,1)<>3 ORDER BY code`,
      sql`SELECT id,currency_code,currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      sql`SELECT id,branch_code,branch_name FROM branches WHERE id=ANY(${authorization.branchIds}::int[]) AND COALESCE(status,1)<>3 ORDER BY branch_name`,
    ])
    return NextResponse.json({rows,meta:{accounts,currencies,branches}})
  }catch(error){console.error("Cheque payment voucher GET error:",error);return NextResponse.json({error:"تعذر تحميل سندات صرف الشيكات"},{status:500})}
}

export async function POST(request:NextRequest){
  try{
    await ensureChequePaymentTables()
    const data=await request.json(),chequeIds=ids(data.cheque_ids)
    const authorization=await authorizeTransaction(request,"cheque_payment","create",data.branch_id)
    if(!authorization.ok)return authorization.response
    const posting=await authorizeTransaction(request,"cheque_payment","post",authorization.branchId)
    if(!posting.ok)return posting.response
    const accountId=Number(data.account_id),vchDate=String(data.vch_date||"")
    if(!accountId||!/^\d{4}-\d{2}-\d{2}$/.test(vchDate)||!chequeIds.length)return NextResponse.json({error:"يجب إدخال الحساب والتاريخ واختيار شيك واحد على الأقل"},{status:400})
    return await withTenantTransaction(async()=>{
    const account=(await sql`SELECT id,currency_id,allow_trans_with_diff_curr FROM account_tbl WHERE id=${accountId} AND COALESCE(status,1)<>3`)[0]
    if(!account)return NextResponse.json({error:"الحساب المحدد غير موجود أو غير فعال"},{status:400})
    const chosen=await sql`SELECT * FROM cheques_tbl WHERE id=ANY(${chequeIds}::int[]) ORDER BY id FOR UPDATE`
    if(chosen.length!==chequeIds.length)return NextResponse.json({error:"أحد الشيكات المحددة غير موجود"},{status:409})
    const invalid=chosen.find((c:any)=>Number(c.cheq_type)!==1||!ENDORSEMENT_STATUS_IDS.includes(Number(c.status_id))||!c.current_account_id)
    if(invalid)return NextResponse.json({error:`الشيك رقم ${invalid.cheq_num} لم يعد متاحاً للتجيير، حدّث البحث`},{status:409})
    const currencies=new Set(chosen.map((c:any)=>Number(c.currency_id)))
    if(currencies.size!==1)return NextResponse.json({error:"يجب أن تكون جميع الشيكات المختارة من نفس العملة"},{status:400})
    const currencyId=Number(chosen[0].currency_id),rate=Number(chosen[0].rate||1)
    if(Number(account.currency_id)!==currencyId&&!Number(account.allow_trans_with_diff_curr))return NextResponse.json({error:"عملة الحساب تختلف عن عملة الشيكات ولا يسمح الحساب بالحركة بعملة مختلفة"},{status:400})
    const code=String(data.vch_code||await nextChequePaymentCode()).trim().toUpperCase()
    if(!/^CQ\d{8}$/.test(code))return NextResponse.json({error:"رقم السند يجب أن يكون بصيغة CQ متبوعة بثمانية أرقام"},{status:400})
    if((await sql`SELECT id FROM voucher_header_tbl WHERE vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND vch_code=${code}`).length)return NextResponse.json({error:"رقم السند مستخدم مسبقاً"},{status:409})
    const total=chosen.reduce((sum:number,c:any)=>sum+Number(c.amount||0),0),note=String(data.note||"").trim().slice(0,500)
    const header=(await sql`INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,branch_id,currency_id,rate,amount,check_amount,account_id,note,status,vch_status,internal_voucher_id,cheq_operation_id,insert_user)
      VALUES(${CHEQUE_PAYMENT_VCH_TYPE},${code},${vchDate},${authorization.branchId},${currencyId},${rate},${total},${total},${accountId},${note},2,2,1,6,${Number(authorization.userId)||null}) RETURNING *`)[0]
    await sql`INSERT INTO voucher_journal_detail_tbl(voucher_id,order_no,journal_type_id,account_id,credit_debit,amount,currency_id,rate,base_curr_amount,note)
      VALUES(${header.id},1,5,${accountId},1,${total},${currencyId},${rate},${total*rate},${note||"سند صرف شيكات"})`
    let order=2
    for(const cheque of chosen){
      await sql`INSERT INTO voucher_journal_detail_tbl(voucher_id,order_no,journal_type_id,account_id,credit_debit,amount,currency_id,rate,base_curr_amount,note)
        VALUES(${header.id},${order++},3,${Number(cheque.current_account_id)},2,${Number(cheque.amount)},${currencyId},${rate},${Number(cheque.amount)*rate},${`تجيير شيك ${cheque.cheq_num}`})`
      await sql`INSERT INTO cheque_payment_voucher_items(voucher_id,cheque_id,amount,order_no) VALUES(${header.id},${Number(cheque.id)},${Number(cheque.amount)},${order-2})`
      await sql`INSERT INTO cheque_operations_log_tbl(cheque_id,voucher_id,operation_code,operation_name,previous_status_id,new_status_id,operation_date,account_id,note,user_id,previous_current_account_id,previous_bank_account_id,previous_due_date,previous_voucher_id)
        VALUES(${Number(cheque.id)},${header.id},'endorse','تحويل / تجيير الشيك',${Number(cheque.status_id)},7,${vchDate},${accountId},${note},${String(authorization.userId)},${Number(cheque.current_account_id)},${cheque.bank_account_id||null},${cheque.due_date||null},${cheque.last_voucher_id||null})`
      const updated=await sql`UPDATE cheques_tbl SET old_status_id=status_id,status_id=7,current_account_id=${accountId},last_voucher_id=${header.id},trans_date=${vchDate},update_user_id=${Number(authorization.userId)||null},last_update_date=CURRENT_TIMESTAMP
        WHERE id=${Number(cheque.id)} AND status_id=${Number(cheque.status_id)} AND last_update_date=${cheque.last_update_date} RETURNING id`
      if(!updated.length)throw new ChequePaymentConflict(`تم تعديل الشيك رقم ${cheque.cheq_num} بواسطة مستخدم آخر`)
    }
    return NextResponse.json(await fetchChequePaymentVoucher(header.id),{status:201})
    })
  }catch(error){
    if(error instanceof ChequePaymentConflict)return NextResponse.json({error:error.message},{status:409})
    console.error("Cheque payment voucher POST error:",error)
    return NextResponse.json({error:"تعذر حفظ سند صرف الشيكات"},{status:500})
  }
}
